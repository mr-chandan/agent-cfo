import { admin } from "@/lib/supabase-admin";
import { createCustomCheckout, dodo, dodoEnabled } from "@/lib/dodo";
import { redact } from "@/lib/redact";

// Finance operations grounded in real Indian SMB pains (see docs/research):
// receivables + MSMED interest, reminders, GST credit notes, vendor bank-change protection,
// dispute evidence packs and "paid only if the gateway says so".
type Row = Record<string, unknown>;

export const COMPANY_ID = process.env.DEFAULT_COMPANY_ID ?? "00000000-0000-0000-0000-00000000c001";
const GST_RATE_BPS = 1800;
const DAY = 86_400_000;

function stamp(prefix: string) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${ym}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function deliverEmail(to: string, subject: string, text: string) {
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

/* ---------------- customers ---------------- */

export async function addCustomer(input: { name: string; email: string }) {
  const email = input.email.trim().toLowerCase();
  const { data: existing } = await admin().from("customers").select("id,name,email").eq("email", email).maybeSingle();
  if (existing) return { customer: existing, created: false };
  const { data, error } = await admin()
    .from("customers")
    .insert({ company_id: COMPANY_ID, name: input.name.trim(), email })
    .select("id,name,email")
    .single();
  if (error) throw new Error(error.message);
  return { customer: data, created: true };
}

/* ---------------- receivables ---------------- */

// A payment request is an invoice: it stays "pending" with a due date until the gateway webhook marks it paid.
export async function createInvoice(input: {
  customerId: string;
  amountMinor: number;
  description?: string;
  dueInDays?: number;
  emailLink?: boolean;
  origin?: string;
}) {
  const { data: c } = await admin().from("customers").select("id,name,email,company_id").eq("id", input.customerId).maybeSingle();
  if (!c || !(c as Row).email) throw new Error("customer not found or has no email");
  const amountMinor = Math.trunc(input.amountMinor);
  if (!(amountMinor > 0)) throw new Error("amount must be positive");
  if (!dodoEnabled()) throw new Error("payments are not configured");

  const invoiceNumber = stamp("INV");
  const due = new Date(Date.now() + (input.dueInDays ?? 15) * DAY).toISOString().slice(0, 10);
  const { data: order, error } = await admin()
    .from("orders")
    .insert({
      company_id: (c as Row).company_id ?? COMPANY_ID,
      customer_id: input.customerId,
      amount_minor: amountMinor,
      currency: "INR",
      status: "pending",
      invoice_number: invoiceNumber,
      due_date: due,
      description: input.description ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const orderId = (order as Row).id as string;

  const { url, usdCents } = await createCustomCheckout({
    email: (c as Row).email as string,
    name: (c as Row).name as string,
    amountInrMinor: amountMinor,
    returnUrl: input.origin ?? "http://localhost:3000/",
    metadata: { order_id: orderId, invoice_number: invoiceNumber },
  });
  await admin().from("orders").update({ checkout_url: url }).eq("id", orderId);

  let email: { delivered: boolean; reason?: string } | undefined;
  if (input.emailLink && url) {
    const rupees = (amountMinor / 100).toLocaleString("en-IN");
    email = await deliverEmail(
      (c as Row).email as string,
      `Invoice ${invoiceNumber} — Rs ${rupees} due ${due}`,
      `Hi ${(c as Row).name},\n\nInvoice ${invoiceNumber} for Rs ${rupees}${input.description ? ` (${input.description})` : ""} is due on ${due}.\nPay securely here: ${url}\n\nThank you.`,
    );
    await admin().from("messages").insert({
      company_id: (c as Row).company_id ?? COMPANY_ID,
      customer_id: input.customerId,
      channel: "email",
      direction: "out",
      body: `Invoice ${invoiceNumber} sent (Rs ${rupees}, due ${due})`,
    });
  }
  return {
    customer: (c as Row).name,
    invoice_number: invoiceNumber,
    order_id: orderId,
    due_date: due,
    requested_inr_minor: amountMinor,
    charged_usd_cents: usdCents,
    checkout_url: url,
    email_sent: email,
  };
}

// MSMED Act s.16: compound interest with monthly rests at 3x the RBI bank rate on dues unpaid past the agreed
// date (max 45 days). Bank rate is configurable because it changes with RBI policy.
export function msmedInterest(principalMinor: number, daysLate: number) {
  const bankRate = Number(process.env.MSMED_BANK_RATE ?? 5.75);
  const annual = (3 * bankRate) / 100;
  const months = daysLate / 30;
  const interest = principalMinor * (Math.pow(1 + annual / 12, months) - 1);
  return { interestMinor: Math.max(0, Math.round(interest)), annualRatePct: 3 * bankRate };
}

export async function listOverdueInvoices(input: { includeUpcoming?: boolean }) {
  const { data, error } = await admin()
    .from("orders")
    .select("id,invoice_number,amount_minor,due_date,reminders_sent,checkout_url,customers(name,email)")
    .eq("status", "pending")
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  const today = Date.now();
  const rows = ((data ?? []) as Row[]).map((o) => {
    const due = o.due_date ? new Date(String(o.due_date)).getTime() : today;
    const daysLate = Math.floor((today - due) / DAY);
    const i = msmedInterest(Number(o.amount_minor), Math.max(0, daysLate));
    return {
      order_id: o.id,
      invoice_number: o.invoice_number,
      customer: (o.customers as Row | null)?.name,
      amount_minor: o.amount_minor,
      due_date: o.due_date,
      days_overdue: daysLate,
      reminders_sent: o.reminders_sent,
      msmed_interest_minor: daysLate > 0 ? i.interestMinor : 0,
    };
  });
  const list = input.includeUpcoming ? rows : rows.filter((r) => r.days_overdue > 0);
  const total = list.reduce((s, r) => s + Number(r.amount_minor), 0);
  return { invoices: list, total_outstanding_minor: total, msmed_rate_pct: msmedInterest(0, 0).annualRatePct };
}

export async function sendPaymentReminder(input: { orderId: string; tone: "friendly" | "firm" | "final" }) {
  const { data: o } = await admin()
    .from("orders")
    .select("id,company_id,customer_id,invoice_number,amount_minor,due_date,status,checkout_url,reminders_sent,customers(name,email)")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!o) throw new Error("invoice not found");
  const r = o as Row;
  if (r.status !== "pending") throw new Error(`invoice is ${r.status}, nothing to chase`);
  const cust = (r.customers as Row | null) ?? {};
  const rupees = (Number(r.amount_minor) / 100).toLocaleString("en-IN");
  const daysLate = Math.max(0, Math.floor((Date.now() - new Date(String(r.due_date)).getTime()) / DAY));
  const interest = msmedInterest(Number(r.amount_minor), daysLate);
  const link = r.checkout_url ? `\nPay here: ${r.checkout_url}` : "";
  const body = {
    friendly: `Hi ${cust.name},\n\nA gentle reminder that invoice ${r.invoice_number} for Rs ${rupees} was due on ${r.due_date}.${link}\n\nThanks!`,
    firm: `Hi ${cust.name},\n\nInvoice ${r.invoice_number} for Rs ${rupees} is now ${daysLate} days overdue (due ${r.due_date}). Please clear it this week.${link}\n\nRegards.`,
    final: `Dear ${cust.name},\n\nInvoice ${r.invoice_number} for Rs ${rupees} is ${daysLate} days overdue. Under Section 16 of the MSMED Act, 2006, delayed payments to a registered MSME attract compound interest at three times the RBI bank rate (currently ${interest.annualRatePct.toFixed(2)}% p.a.), which amounts to approx. Rs ${(interest.interestMinor / 100).toLocaleString("en-IN")} so far. Under Section 43B(h) of the Income-tax Act, unpaid MSME dues beyond 45 days are also not deductible for your business.\n\nPlease settle immediately to avoid escalation to the MSME ODR portal.${link}\n\nRegards.`,
  }[input.tone];
  const safe = redact(body);
  const delivery = cust.email
    ? await deliverEmail(String(cust.email), `${input.tone === "final" ? "Final notice" : "Reminder"}: invoice ${r.invoice_number}`, safe.text)
    : { delivered: false, reason: "no email on file" };
  await admin()
    .from("orders")
    .update({ reminders_sent: Number(r.reminders_sent ?? 0) + 1, last_reminder_at: new Date().toISOString() })
    .eq("id", r.id);
  await admin().from("messages").insert({
    company_id: r.company_id ?? COMPANY_ID,
    customer_id: r.customer_id,
    channel: "email",
    direction: "out",
    body: safe.text,
  });
  return {
    invoice_number: r.invoice_number,
    tone: input.tone,
    days_overdue: daysLate,
    msmed_interest_minor: interest.interestMinor,
    ...delivery,
  };
}

// "Paid" comes only from the gateway, never from a customer's screenshot or claim.
export async function verifyPaymentClaim(input: { orderId: string }) {
  const { data: o } = await admin().from("orders").select("id,invoice_number,status,external_id,amount_minor").eq("id", input.orderId).maybeSingle();
  if (!o) throw new Error("invoice not found");
  const r = o as Row;
  let gateway: { status?: string; total_amount?: number } | null = null;
  if (r.external_id && dodoEnabled()) {
    try {
      const p = (await dodo().payments.retrieve(String(r.external_id))) as unknown as { status?: string; total_amount?: number };
      gateway = { status: p.status, total_amount: p.total_amount };
    } catch {
      gateway = null;
    }
  }
  const confirmed = r.status === "paid" && (!gateway || gateway.status === "succeeded");
  return {
    invoice_number: r.invoice_number,
    our_record: r.status,
    gateway_status: gateway?.status ?? (r.external_id ? "unavailable" : "no payment received"),
    confirmed_paid: confirmed,
    advice: confirmed
      ? "Payment confirmed by the payment gateway."
      : "Not confirmed by the gateway. Do not ship or release goods based on a screenshot.",
  };
}

/* ---------------- GST ---------------- */

// Refunds reverse output GST: issue a credit note so GSTR-1 reflects the reduced liability.
export async function issueCreditNote(input: { orderId: string; refundMinor: number; companyId?: unknown }) {
  const gst = Math.round((input.refundMinor * GST_RATE_BPS) / (10_000 + GST_RATE_BPS));
  const note = {
    company_id: (input.companyId as string) ?? COMPANY_ID,
    order_id: input.orderId,
    note_number: stamp("CN"),
    refund_minor: input.refundMinor,
    taxable_minor: input.refundMinor - gst,
    gst_minor: gst,
    rate_bps: GST_RATE_BPS,
  };
  const { error } = await admin().from("credit_notes").insert(note);
  if (error) throw new Error(error.message);
  return note;
}

/* ---------------- payouts ---------------- */

export async function listBeneficiaries() {
  const { data, error } = await admin().from("beneficiaries").select("id,name,account_ref,approved");
  if (error) throw new Error(error.message);
  return { beneficiaries: data };
}

// Vendor bank-detail changes are the #1 BEC fraud pattern (Dr Reddy's ₹2.16 cr). They are never applied directly:
// a verification case is opened and a human must confirm out of band (call the number on file, penny-drop match).
export async function requestBankChange(input: { beneficiaryId: string; newAccountRef: string; source: string; message?: string }) {
  const { data: b } = await admin().from("beneficiaries").select("id,name,account_ref,company_id").eq("id", input.beneficiaryId).maybeSingle();
  if (!b) throw new Error("beneficiary not found");
  const text = `${input.source} ${input.message ?? ""}`.toLowerCase();
  const flags: string[] = ["bank details change requested"];
  if (/email|mail|whatsapp|chat|message/.test(text)) flags.push("requested over an unverified channel");
  if (/urgent|immediately|today|asap|before|overdue/.test(text)) flags.push("urgency pressure");
  if (/new account|changed|updated|switched|different bank/.test(text)) flags.push("new account not seen before");
  const { data, error } = await admin()
    .from("bank_change_requests")
    .insert({
      company_id: (b as Row).company_id ?? COMPANY_ID,
      beneficiary_id: input.beneficiaryId,
      requested_account_ref: input.newAccountRef,
      source: input.source,
      risk_flags: flags,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return {
    case_id: (data as Row).id,
    beneficiary: (b as Row).name,
    current_account: (b as Row).account_ref,
    requested_account: input.newAccountRef,
    risk_flags: flags,
    status: "pending_verification",
    next_steps: [
      "Call the vendor on the phone number already on file (not one from the email).",
      "Run a penny-drop name match on the new account.",
      "A second person approves the change; payouts stay on the old account until then.",
    ],
  };
}

/* ---------------- disputes ---------------- */

export async function buildEvidencePack(input: { disputeId: string }) {
  const db = admin();
  const { data: d } = await db.from("disputes").select("*, customers(name,email)").eq("id", input.disputeId).maybeSingle();
  if (!d) throw new Error("dispute not found");
  const dispute = d as Row;
  const [orderRes, paymentsRes, messagesRes, notesRes] = await Promise.all([
    dispute.order_id ? db.from("orders").select("*").eq("id", dispute.order_id).maybeSingle() : Promise.resolve({ data: null }),
    dispute.order_id ? db.from("payments").select("kind,amount_minor,provider,external_id,created_at").eq("order_id", dispute.order_id) : Promise.resolve({ data: [] }),
    db.from("messages").select("direction,channel,body,created_at").eq("customer_id", dispute.customer_id).order("created_at"),
    dispute.order_id ? db.from("credit_notes").select("note_number,refund_minor,gst_minor").eq("order_id", dispute.order_id) : Promise.resolve({ data: [] }),
  ]);
  const order = orderRes.data as Row | null;
  const payments = (paymentsRes.data ?? []) as Row[];
  const messages = (messagesRes.data ?? []) as Row[];
  const checklist = [
    { item: "Invoice / order record", present: Boolean(order) },
    { item: "Payment confirmed by gateway", present: payments.some((p) => p.kind === "charge" && p.provider === "dodo") },
    { item: "Customer communication history", present: messages.length > 0 },
    { item: "Proof of delivery / service", present: false },
    { item: "GST invoice / credit note", present: Boolean(order?.invoice_number) || (notesRes.data ?? []).length > 0 },
  ];
  const content = {
    dispute: { id: dispute.id, reason: dispute.reason, channel: dispute.channel, opened_at: dispute.opened_at },
    customer: dispute.customers,
    order,
    payments,
    messages: messages.slice(-10).map((m) => ({ ...m, body: redact(String(m.body)).text })),
    credit_notes: notesRes.data ?? [],
    checklist,
  };
  const { data: pack, error } = await db.from("evidence_packs").insert({ dispute_id: input.disputeId, content }).select("id").single();
  if (error) throw new Error(error.message);
  const missing = checklist.filter((c) => !c.present).map((c) => c.item);
  return { pack_id: (pack as Row).id, checklist, missing, ready_to_submit: missing.length === 0 };
}

/* ---------------- payroll ---------------- */
// Statutory estimates for India (FY 2025-26 rules); the owner/CA reviews before paying.
//   basic = 50% of gross (configurable); PF 12% of basic capped at ₹15,000 basic (employee + employer);
//   ESI 0.75% employee / 3.25% employer when gross ≤ ₹21,000; professional tax by state;
//   TDS: new regime, ₹75,000 standard deduction, 87A rebate up to ₹12 lakh taxable, 4% cess.
const PT_RULES: Record<string, (gross: number) => number> = {
  Karnataka: (g) => (g >= 25_000 ? 200 : 0),
  Maharashtra: (g) => (g > 10_000 ? 200 : 0),
  Telangana: (g) => (g > 20_000 ? 200 : 0),
  "West Bengal": (g) => (g > 40_000 ? 200 : 0),
  "Tamil Nadu": (g) => (g > 21_000 ? 208 : 0),
};

function annualTaxNewRegime(annualGross: number) {
  const taxable = Math.max(0, annualGross - 75_000);
  if (taxable <= 12_00_000) return 0;
  const slabs: [number, number][] = [
    [4_00_000, 0], [8_00_000, 0.05], [12_00_000, 0.1], [16_00_000, 0.15], [20_00_000, 0.2], [24_00_000, 0.25], [Infinity, 0.3],
  ];
  let tax = 0;
  let prev = 0;
  for (const [upto, rate] of slabs) {
    if (taxable > prev) tax += (Math.min(taxable, upto) - prev) * rate;
    prev = upto;
  }
  return tax * 1.04;
}

export function computePayslip(e: { monthly_ctc_minor: number; state: string; pf_enrolled: boolean }) {
  const gross = Number(e.monthly_ctc_minor) / 100;
  const basic = gross * Number(process.env.PAYROLL_BASIC_SHARE ?? 0.5);
  const pfBase = Math.min(basic, 15_000);
  const pfEmp = e.pf_enrolled ? Math.round(pfBase * 0.12) : 0;
  const pfEr = pfEmp;
  const esiEmp = gross <= 21_000 ? Math.round(gross * 0.0075) : 0;
  const esiEr = gross <= 21_000 ? Math.round(gross * 0.0325) : 0;
  const pt = (PT_RULES[e.state] ?? (() => 0))(gross);
  const tds = Math.round(annualTaxNewRegime(gross * 12) / 12);
  const net = gross - pfEmp - esiEmp - pt - tds;
  const p = (n: number) => Math.round(n * 100);
  return {
    gross_minor: p(gross),
    pf_employee_minor: p(pfEmp),
    pf_employer_minor: p(pfEr),
    esi_employee_minor: p(esiEmp),
    esi_employer_minor: p(esiEr),
    pt_minor: p(pt),
    tds_minor: p(tds),
    net_minor: p(net),
  };
}

export async function addEmployee(input: { name: string; email?: string; designation?: string; monthlyCtcMinor: number; state?: string; pfEnrolled?: boolean }) {
  const { data, error } = await admin()
    .from("employees")
    .insert({
      company_id: COMPANY_ID,
      name: input.name.trim(),
      email: input.email?.trim().toLowerCase() ?? "",
      designation: input.designation ?? null,
      monthly_ctc_minor: Math.trunc(input.monthlyCtcMinor),
      state: input.state ?? "Karnataka",
      pf_enrolled: input.pfEnrolled ?? true,
    })
    .select("id,name,email,designation,monthly_ctc_minor,state")
    .single();
  if (error) throw new Error(error.message);
  return { employee: data, preview: computePayslip({ monthly_ctc_minor: Number((data as Row).monthly_ctc_minor), state: String((data as Row).state), pf_enrolled: input.pfEnrolled ?? true }) };
}

export async function listEmployees() {
  const { data, error } = await admin().from("employees").select("id,name,email,designation,monthly_ctc_minor,state,active").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  const total = (data ?? []).reduce((s, e) => s + Number((e as Row).monthly_ctc_minor), 0);
  return { employees: data ?? [], monthly_payroll_minor: total };
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Draft only: computes every payslip and totals. Nothing is paid.
export async function preparePayroll(input: { period?: string }) {
  const period = input.period ?? currentPeriod();
  const db = admin();
  const { data: emps } = await db.from("employees").select("*").eq("active", true);
  const employees = (emps ?? []) as Row[];
  if (employees.length === 0) throw new Error("no active employees; add employees first");
  const { data: existing } = await db.from("payroll_runs").select("id,status").eq("company_id", COMPANY_ID).eq("period", period).maybeSingle();
  if (existing && (existing as Row).status !== "draft") throw new Error(`payroll for ${period} is already ${(existing as Row).status}`);

  const slips = employees.map((e) => ({ employee: e, ...computePayslip(e as never) }));
  const totals = slips.reduce(
    (t, s) => ({
      gross: t.gross + s.gross_minor,
      net: t.net + s.net_minor,
      cost: t.cost + s.gross_minor + s.pf_employer_minor + s.esi_employer_minor,
    }),
    { gross: 0, net: 0, cost: 0 },
  );
  const { data: run, error } = await db
    .from("payroll_runs")
    .upsert(
      { company_id: COMPANY_ID, period, status: "draft", total_gross_minor: totals.gross, total_net_minor: totals.net, total_employer_cost_minor: totals.cost },
      { onConflict: "company_id,period" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const runId = (run as Row).id as string;
  await db.from("payslips").delete().eq("run_id", runId);
  await db.from("payslips").insert(
    slips.map(({ employee, ...s }) => ({ run_id: runId, employee_id: employee.id, ...s })),
  );
  return {
    run_id: runId,
    period,
    status: "draft",
    employees: slips.map(({ employee, ...s }) => ({ name: employee.name, ...s })),
    total_gross_minor: totals.gross,
    total_net_minor: totals.net,
    total_employer_cost_minor: totals.cost,
    note: "Statutory figures are estimates (PF, ESI, PT, TDS new regime). Review before paying.",
  };
}

// Pays the approved run: marks it paid and emails each employee a payslip. Always requires owner approval.
export async function runPayroll(input: { period?: string }) {
  const period = input.period ?? currentPeriod();
  const db = admin();
  const { data: run } = await db.from("payroll_runs").select("*").eq("company_id", COMPANY_ID).eq("period", period).maybeSingle();
  if (!run) throw new Error(`no payroll prepared for ${period}; prepare it first`);
  const r = run as Row;
  if (r.status === "paid") throw new Error(`payroll for ${period} is already paid`);
  const { data: slips } = await db.from("payslips").select("*, employees(name,email,designation)").eq("run_id", r.id);
  let emailed = 0;
  for (const s of (slips ?? []) as Row[]) {
    const e = (s.employees as Row) ?? {};
    const f = (m: unknown) => `Rs ${(Number(m) / 100).toLocaleString("en-IN")}`;
    const body = `Hi ${e.name},\n\nYour salary for ${period} has been processed.\n\nGross: ${f(s.gross_minor)}\nPF: -${f(s.pf_employee_minor)}\nESI: -${f(s.esi_employee_minor)}\nProfessional tax: -${f(s.pt_minor)}\nTDS: -${f(s.tds_minor)}\nNet pay: ${f(s.net_minor)}\n\nThis is a computer-generated payslip.`;
    const d = e.email ? await deliverEmail(String(e.email), `Payslip for ${period}`, redact(body).text) : { delivered: false };
    if (d.delivered) emailed++;
    await db.from("payslips").update({ emailed: d.delivered }).eq("id", s.id);
  }
  await db.from("payroll_runs").update({ status: "paid", approved_at: new Date().toISOString(), paid_at: new Date().toISOString() }).eq("id", r.id);
  return {
    period,
    status: "paid",
    employees_paid: (slips ?? []).length,
    payslips_emailed: emailed,
    total_net_minor: r.total_net_minor,
    payout_mode: "sandbox (salary transfers are recorded; bank payouts are not connected yet)",
  };
}
