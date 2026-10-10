import { tool } from "ai";
import { z } from "zod";
import { admin } from "@/lib/supabase-admin";
import { decide, type PolicyCtx, type ToolFacts } from "./policy";
import * as actions from "./actions";
import * as ops from "./finance-ops";
import * as gst from "./gst-ops";
export { TOOL_AGENT } from "./agents";

type Row = Record<string, unknown>;
export type AgentCtx = PolicyCtx & { disputeId?: string; companyId?: string; origin?: string };

// Resolve facts from the DB so policy never trusts model-supplied claims about ownership.
async function factsFor(name: string, input: Row): Promise<ToolFacts> {
  const db = admin();
  if (name.endsWith("list_employees")) {
    // time-boxed unlock: an owner-approved list_employees call in the last 30 minutes
    const { data } = await db
      .from("approvals")
      .select("id")
      .like("tool", "%list_employees")
      .eq("status", "approved")
      .gte("decided_at", new Date(Date.now() - 30 * 60_000).toISOString())
      .limit(1);
    return { payrollUnlocked: (data ?? []).length > 0 };
  }
  if (typeof input.orderId === "string") {
    const { data } = await db.from("orders").select("customer_id").eq("id", input.orderId).maybeSingle();
    return { customerId: (data as Row | null)?.customer_id as string | undefined };
  }
  if (typeof input.customerId === "string") return { customerId: input.customerId };
  if (typeof input.beneficiaryId === "string") {
    const { data } = await db.from("beneficiaries").select("approved").eq("id", input.beneficiaryId).maybeSingle();
    return { beneficiaryApproved: Boolean((data as Row | null)?.approved) };
  }
  return {};
}

async function audit(ctx: AgentCtx, name: string, input: Row, decision: string, reason: string) {
  await admin().from("audit_log").insert({
    company_id: ctx.companyId ?? ops.COMPANY_ID,
    dispute_id: ctx.disputeId ?? null,
    tool: name,
    input,
    decision,
    reason,
  });
}

// Every tool call passes through here: decide -> audit -> allow/block/escalate.
export async function guarded(ctx: AgentCtx, name: string, input: Row, exec: () => Promise<unknown>) {
  try {
    const facts = await factsFor(name, input);
    const d = await decide(name, input, facts, ctx);
    await audit(ctx, name, input, d.decision, d.reason);

    if (d.decision === "block") return { status: "blocked", reason: d.reason };
    if (d.decision === "escalate") {
      const { data } = await admin()
        .from("approvals")
        .insert({
          company_id: ctx.companyId ?? ops.COMPANY_ID,
          dispute_id: ctx.disputeId ?? null,
          tool: name,
          input,
          reason: d.reason,
        })
        .select("id")
        .single();
      return { status: "pending_approval", approvalId: (data as Row | null)?.id, reason: d.reason };
    }
    return { status: "done", result: await exec() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(ctx, name, input, "error", msg);
    return { status: "error", reason: msg };
  }
}

// One registry feeds both the in-app agent and the MCP server (so AgntID can sit in front of it).
export type Spec = {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run: (i: never, ctx: AgentCtx) => Promise<unknown>;
};

const spec = <S extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  schema: S,
  run: (i: z.infer<S>, ctx: AgentCtx) => Promise<unknown>,
): Spec => ({ name, description, schema, run: run as Spec["run"] });

export const TOOL_SPECS: Spec[] = [
  spec("list_customer_orders", "List recent orders for a customer.", z.object({ customerId: z.guid() }), (i) =>
    actions.listCustomerOrders(i.customerId),
  ),
  spec("get_order", "Get one order by id.", z.object({ orderId: z.guid() }), (i) => actions.getOrder(i.orderId)),
  spec(
    "issue_refund",
    "Refund part or all of an order. Amount in minor units (paise).",
    z.object({ orderId: z.guid(), amountMinor: z.number().int().positive(), reason: z.string().max(200).optional() }),
    (i) => actions.issueRefund(i),
  ),
  spec(
    "create_payout",
    "Pay a saved beneficiary. Amount in minor units (paise).",
    z.object({ beneficiaryId: z.guid(), amountMinor: z.number().int().positive() }),
    (i) => actions.createPayout(i),
  ),
  spec(
    "update_beneficiary",
    "Change the bank/account reference of a beneficiary.",
    z.object({ beneficiaryId: z.guid(), accountRef: z.string().min(3) }),
    (i) => actions.updateBeneficiary(i),
  ),
  spec(
    "send_message",
    "Send an email to a customer on file. Sensitive data (card/account numbers, phone numbers) is automatically redacted before sending.",
    z.object({
      customerId: z.guid(),
      channel: z.enum(["email", "telegram"]),
      subject: z.string().max(120).optional(),
      body: z.string().min(1).max(1500),
    }),
    (i, ctx) => actions.sendMessage({ ...i, disputeId: ctx.disputeId }),
  ),
  spec(
    "find_customer",
    "Find a customer by part of their name or email. Returns id, name and email.",
    z.object({ query: z.string().min(2).max(80) }),
    (i) => actions.findCustomer(i),
  ),
  spec(
    "request_payment",
    "Create a payment link asking a customer to pay an amount in minor units (100 rupees = 10000). Set emailLink to also email the link to the customer. Find the customerId first with find_customer.",
    z.object({
      customerId: z.guid(),
      amountMinor: z.number().int().positive(),
      note: z.string().max(200).optional(),
      emailLink: z.boolean().optional(),
      dueInDays: z.number().int().min(0).max(120).optional(),
    }),
    (i, ctx) => actions.requestPayment({ ...i, origin: ctx.origin, disputeId: ctx.disputeId }),
  ),
  spec(
    "add_customer",
    "Add a new customer (name and email) so you can invoice them. Returns the existing customer if the email is already on file.",
    z.object({ name: z.string().min(2).max(80), email: z.string().email() }),
    (i) => ops.addCustomer(i),
  ),
  spec(
    "list_overdue_invoices",
    "List unpaid invoices that are past due, with days overdue and MSMED Act interest accrued. Set includeUpcoming to also list invoices not yet due.",
    z.object({ includeUpcoming: z.boolean().optional() }),
    (i) => ops.listOverdueInvoices(i),
  ),
  spec(
    "send_payment_reminder",
    "Email a payment reminder for an unpaid invoice. tone: friendly (just due), firm (overdue), final (cites MSMED Act interest and Section 43B(h); needs owner approval).",
    z.object({ orderId: z.guid(), tone: z.enum(["friendly", "firm", "final"]) }),
    (i) => ops.sendPaymentReminder(i),
  ),
  spec(
    "verify_payment",
    "Check with the payment gateway whether an invoice is really paid. Use this whenever a customer claims they paid or sends a screenshot.",
    z.object({ orderId: z.guid() }),
    (i) => ops.verifyPaymentClaim(i),
  ),
  spec("list_beneficiaries", "List saved payout beneficiaries (vendors) and whether each is approved.", z.object({}), () => ops.listBeneficiaries()),
  spec(
    "request_bank_change",
    "Record a vendor's request to change their bank account. Opens a verification case; it never changes the account directly.",
    z.object({
      beneficiaryId: z.guid(),
      newAccountRef: z.string().min(3).max(40),
      source: z.string().min(2).max(120).describe("where the request came from, e.g. 'email from vendor'"),
      message: z.string().max(1000).optional(),
    }),
    (i) => ops.requestBankChange(i),
  ),
  spec(
    "add_employee",
    "Add an employee to payroll. Only name and monthlyCtcMinor (gross monthly salary in paise; Rs 50,000 = 5000000) are required; do not ask the user for an email unless they want payslips emailed. state is used for professional tax.",
    z.object({
      name: z.string().min(2).max(80),
      email: z.string().email().optional().describe("Optional; payslips are emailed only if present"),
      designation: z.string().max(80).optional(),
      monthlyCtcMinor: z.number().int().positive(),
      state: z.enum(["Karnataka", "Maharashtra", "Telangana", "West Bengal", "Tamil Nadu", "Delhi", "Other"]).optional(),
      pfEnrolled: z.boolean().optional(),
    }),
    (i) => ops.addEmployee(i),
  ),
  spec("list_employees", "List active employees and the total monthly payroll.", z.object({}), () => ops.listEmployees()),
  spec(
    "prepare_payroll",
    "Prepare a DRAFT payroll for a month (period YYYY-MM, default this month): computes gross, PF, ESI, professional tax, TDS and net pay per employee. Pays nothing.",
    z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }),
    (i) => ops.preparePayroll(i),
  ),
  spec(
    "run_payroll",
    "Pay salaries for a prepared payroll month and email payslips. Always needs owner approval.",
    z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }),
    (i) => ops.runPayroll(i),
  ),
  spec(
    "build_evidence_pack",
    "Assemble a dispute evidence pack (invoice, gateway payment, customer messages, credit notes) and list what is missing.",
    z.object({ disputeId: z.guid() }),
    (i) => ops.buildEvidencePack(i),
  ),
  spec("list_disputes", "List recent customer disputes with status.", z.object({}), () => actions.listDisputes()),
  spec(
    "finance_summary",
    "Get totals: revenue collected, refunded, net, estimated GST, open disputes, pending approvals.",
    z.object({}),
    () => actions.financeSummary(),
  ),
  spec(
    "gst_taxpayer_lookup",
    "Look up a taxpayer's public GST registration details by GSTIN (WhiteBooks sandbox).",
    z.object({ gstin: z.string().length(15) }),
    (i) => actions.gstTaxpayerLookup(i),
  ),
  spec(
    "gst_ledger_balance",
    "Get the GST portal ledger balances (cash and input tax credit) for a return period, format MMYYYY (WhiteBooks sandbox).",
    z.object({ retperiod: z.string().regex(/^(0[1-9]|1[0-2])\d{4}$/) }),
    (i) => actions.gstLedger(i),
  ),
  spec(
    "gst_estimate",
    "Estimate GST liability from recorded payments (estimate only).",
    z.object({ rateBps: z.number().int().min(0).max(4000).optional() }),
    (i) => actions.gstEstimate(i),
  ),
  spec(
    "prepare_gstr1",
    "Prepare a DRAFT GSTR-1 (outward supplies) for a month YYYY-MM from recorded invoices and credit notes. Files nothing.",
    z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }),
    (i) => gst.prepareGstr1(i),
  ),
  spec(
    "prepare_gstr3b",
    "Prepare a DRAFT GSTR-3B (monthly summary return) for a month YYYY-MM from recorded sales and credit notes, less optional input tax credit in paise. Files nothing.",
    z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), itcMinor: z.number().int().min(0).optional() }),
    (i) => gst.prepareGstr3b(i),
  ),
  spec(
    "file_gst_return",
    "Push a prepared GSTR-1 or GSTR-3B draft to the GST portal (sandbox). Always needs owner approval.",
    z.object({ form: z.enum(["GSTR1", "GSTR3B"]), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
    (i) => gst.fileGstReturn(i),
  ),
];

// In-app agent: tools executed locally behind the policy layer.
export function buildTools(ctx: AgentCtx) {
  const nullToUndefined = (v: unknown) => (v === null || v === "" ? undefined : v);
  return Object.fromEntries(
    TOOL_SPECS.map((s) => {
      // optional fields tolerate null (some models send it); preprocess runs before validation
      const shape = Object.fromEntries(
        Object.entries(s.schema.shape).map(([k, f]) => {
          const field = f as z.ZodType;
          return [k, field.safeParse(undefined).success ? z.preprocess(nullToUndefined, field) : field];
        }),
      );
      return [
        s.name,
        tool({
          description: s.description,
          inputSchema: z.object(shape),
          execute: (i: Row) => guarded(ctx, s.name, i, () => s.run(i as never, ctx)),
        }),
      ];
    }),
  );
}
