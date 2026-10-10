import { admin } from "@/lib/supabase-admin";
import { dodoEnabled, refundPayment } from "@/lib/dodo";
import { getDisputes, getOverview } from "@/lib/queries";
import { redact } from "@/lib/redact";
import { createInvoice, issueCreditNote, runPayroll, sendPaymentReminder } from "@/lib/agent/finance-ops";
import { ledgerBalance, searchTaxpayer } from "@/lib/whitebooks";
import { fileGstReturn } from "@/lib/agent/gst-ops";
import { listEmployees, preparePayroll } from "@/lib/agent/finance-ops";

// Raw side effects. Never called by the model directly - always via guarded tools or an approved approval.
// Money amounts are minor units. Validation here is independent of policy.
export type Row = Record<string, unknown>;

export async function getOrder(orderId: string) {
  const { data, error } = await admin().from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listCustomerOrders(customerId: string) {
  const { data, error } = await admin()
    .from("orders")
    .select("id,amount_minor,currency,status,created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return data;
}

export async function issueRefund(input: { orderId: string; amountMinor: number; reason?: string }) {
  const order = (await getOrder(input.orderId)) as Row | null;
  if (!order) throw new Error("order not found");
  const amount = Math.trunc(input.amountMinor);
  if (!(amount > 0)) throw new Error("amount must be positive");

  const { data: refunds } = await admin()
    .from("payments")
    .select("amount_minor")
    .eq("order_id", input.orderId)
    .eq("kind", "refund");
  const already = (refunds ?? []).reduce((s, r) => s + Number((r as Row).amount_minor), 0);
  const total = Number(order.amount_minor);
  if (already + amount > total) {
    throw new Error(`refund exceeds order total (already refunded ${already} of ${total})`);
  }

  // Real provider refund first (test mode). Demo rows have provider "demo" and stay DB-only.
  let providerRefundId: string | null = null;
  const { data: charge } = await admin()
    .from("payments")
    .select("external_id,provider")
    .eq("order_id", input.orderId)
    .eq("kind", "charge")
    .eq("provider", "dodo")
    .limit(1)
    .maybeSingle();
  if (charge && dodoEnabled()) {
    const full = already === 0 && amount === total;
    const r = await refundPayment({
      paymentId: (charge as Row).external_id as string,
      reason: input.reason,
      partial: full ? undefined : { productId: String(order.product_id ?? ""), amountMinor: amount },
    });
    providerRefundId = r.refund_id ?? null;
  }

  const { error } = await admin().from("payments").insert({
    company_id: order.company_id,
    order_id: input.orderId,
    amount_minor: amount,
    currency: order.currency,
    kind: "refund",
    provider: providerRefundId ? "dodo" : "demo",
    external_id: providerRefundId,
  });
  if (error) throw new Error(error.message);
  await admin()
    .from("orders")
    .update({ status: already + amount === total ? "refunded" : "partially_refunded" })
    .eq("id", input.orderId);
  const creditNote = await issueCreditNote({ orderId: input.orderId, refundMinor: amount, companyId: order.company_id });
  return { refunded_minor: amount, order_id: input.orderId, provider_refund_id: providerRefundId, credit_note: creditNote, mode: "test" };
}

export async function createPayout(input: { beneficiaryId: string; amountMinor: number }) {
  const { data: b } = await admin().from("beneficiaries").select("*").eq("id", input.beneficiaryId).maybeSingle();
  if (!b) throw new Error("beneficiary not found");
  // TODO: Cashfree Payouts sandbox call
  return { paid_minor: Math.trunc(input.amountMinor), beneficiary: (b as Row).name, mode: "sandbox" };
}

export async function updateBeneficiary(input: { beneficiaryId: string; accountRef: string }) {
  const { error } = await admin()
    .from("beneficiaries")
    .update({ account_ref: input.accountRef })
    .eq("id", input.beneficiaryId);
  if (error) throw new Error(error.message);
  return { updated: input.beneficiaryId };
}

async function deliverEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { delivered: false, reason: "email provider not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "onboarding@resend.dev", to, subject, text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { delivered: true as const };
  const j = (await res.json().catch(() => ({}))) as { message?: string };
  return { delivered: false as const, reason: j.message ?? `email provider error ${res.status}` };
}

export async function sendMessage(input: {
  customerId: string;
  channel: string;
  subject?: string;
  body: string;
  disputeId?: string;
}) {
  const { data: c } = await admin().from("customers").select("company_id,email").eq("id", input.customerId).maybeSingle();
  if (!c) throw new Error("customer not found");
  // sensitive data never leaves in an email: mask it first, and record what was masked
  const safe = redact(input.body);
  const delivery =
    input.channel === "email" && (c as Row).email
      ? await deliverEmail((c as Row).email as string, input.subject ?? "Update on your request", safe.text)
      : { delivered: false, reason: "only email delivery is connected" };
  const { error } = await admin().from("messages").insert({
    company_id: (c as Row).company_id,
    customer_id: input.customerId,
    dispute_id: input.disputeId ?? null,
    channel: input.channel,
    direction: "out",
    body: safe.text,
  });
  if (error) throw new Error(error.message);
  return { recorded: true, channel: input.channel, redacted_fields: safe.redacted, ...delivery };
}

export async function findCustomer(input: { query: string }) {
  const q = input.query.trim().replace(/[%,()]/g, "");
  if (q.length < 2) throw new Error("query too short");
  const { data, error } = await admin()
    .from("customers")
    .select("id,name,email")
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(5);
  if (error) throw new Error(error.message);
  return { matches: data ?? [] };
}

export async function requestPayment(input: {
  customerId: string;
  amountMinor: number;
  note?: string;
  dueInDays?: number;
  emailLink?: boolean;
  origin?: string;
  disputeId?: string;
}) {
  return createInvoice({
    customerId: input.customerId,
    amountMinor: input.amountMinor,
    description: input.note,
    dueInDays: input.dueInDays,
    emailLink: input.emailLink,
    origin: input.origin,
  });
}

export async function listDisputes() {
  const d = await getDisputes();
  return d.slice(0, 10).map((x) => ({
    id: x.id,
    customer: (x.customers as { name?: string } | null)?.name,
    reason: x.reason,
    status: x.status,
  }));
}

export async function financeSummary() {
  const o = await getOverview();
  const inr = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;
  // pre-formatted strings so the model never has to guess units
  return {
    revenue_collected: inr(o.collected),
    refunded: inr(o.refunded),
    net_revenue: inr(o.net),
    estimated_gst_payable: inr(o.estGst),
    open_disputes: o.openDisputes,
    pending_approvals: o.pendingApprovals,
    note: "all money values are in Indian rupees (not paise)",
  };
}

export async function gstEstimate(input: { rateBps?: number }) {
  const rate = (input.rateBps ?? 1800) / 10_000;
  const { data } = await admin().from("payments").select("amount_minor,kind");
  let net = 0;
  for (const p of data ?? []) {
    const r = p as Row;
    net += (r.kind === "refund" ? -1 : 1) * Number(r.amount_minor);
  }
  // prices assumed GST-inclusive
  const tax = Math.round((net * rate) / (1 + rate));
  return { net_receipts_minor: net, estimated_gst_minor: tax, rate, note: "estimate only, not a filing" };
}

export async function gstTaxpayerLookup(input: { gstin: string }) {
  const r = await searchTaxpayer(input.gstin);
  if (r.status_cd !== "1") {
    const e = (r.error ?? {}) as Record<string, unknown>;
    return { found: false, reason: e.errorMessage ?? r.status_desc };
  }
  return { found: true, taxpayer: r.data ?? r };
}

export async function gstLedger(input: { retperiod: string }) {
  const d = (await ledgerBalance(input.retperiod)) as {
    cash_bal?: Record<string, number>;
    itc_bal?: Record<string, number>;
  };
  return {
    gstin_ledger: "sandbox test taxpayer",
    itc_available: d.itc_bal,
    cash_ledger_totals: {
      igst: d.cash_bal?.igst_tot_bal,
      cgst: d.cash_bal?.cgst_tot_bal,
      sgst: d.cash_bal?.sgst_tot_bal,
    },
    note: "sandbox figures are placeholders, not real money",
  };
}

export async function run(tool: string, input: Row) {
  switch (tool) {
    case "issue_refund": return issueRefund(input as never);
    case "file_gst_return": return fileGstReturn(input as never);
    case "create_payout": return createPayout(input as never);
    case "update_beneficiary": return updateBeneficiary(input as never);
    case "send_message": return sendMessage(input as never);
    case "request_payment": return requestPayment(input as never);
    case "run_payroll": return runPayroll(input as never);
    case "prepare_payroll": return preparePayroll(input as never);
    case "list_employees": return listEmployees();
    case "send_payment_reminder": return sendPaymentReminder(input as never);
    default: throw new Error(`no approved-runner for ${tool}`);
  }
}
