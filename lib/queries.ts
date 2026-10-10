import { admin } from "@/lib/supabase-admin";
import { TOOL_AGENT } from "@/lib/agent/agents";

export type Row = Record<string, unknown> & { id: string };

async function rows(table: string, select = "*", order = "created_at", limit = 100) {
  const { data } = await admin().from(table).select(select).order(order, { ascending: false }).limit(limit);
  return (data ?? []) as unknown as Row[];
}

export const getCustomers = () => rows("customers");
export const getOrders = () => rows("orders", "*, customers(name,email)");
export const getPayments = () => rows("payments", "*, orders(external_id, customers(name))");
export const getDisputes = () => rows("disputes", "*, customers(name,email), orders(amount_minor,currency,external_id)", "opened_at");
export const getApprovals = () => rows("approvals");
export const getAudit = (limit = 100) => rows("audit_log", "*", "created_at", limit);
export const getBeneficiaries = () => rows("beneficiaries");

export async function getDispute(id: string) {
  const { data } = await admin()
    .from("disputes")
    .select("*, customers(id,name,email), orders(id,amount_minor,currency,external_id,status)")
    .eq("id", id)
    .maybeSingle();
  return data as unknown as Row | null;
}

export async function getCustomerOrders(customerId: string) {
  const { data } = await admin()
    .from("orders")
    .select("id,amount_minor,currency,status,external_id,created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as Row[];
}

export async function getDisputeEvents(disputeId: string) {
  const { data } = await admin()
    .from("audit_log")
    .select("*")
    .eq("dispute_id", disputeId)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as unknown as Row[];
}

// Overview numbers, computed from payments so refunds net out.
export async function getOverview() {
  const [payments, disputes, approvals, orders] = await Promise.all([getPayments(), getDisputes(), getApprovals(), getOrders()]);
  const pending = orders.filter((o) => o.status === "pending");
  const receivable = pending.reduce((s, o) => s + Number(o.amount_minor) / 100, 0);
  const overdue = pending.filter((o) => o.due_date && new Date(String(o.due_date)).getTime() < Date.now()).length;
  let collected = 0;
  let refunded = 0;
  const byDay = new Map<string, { day: string; collected: number; refunded: number }>();
  for (const p of payments) {
    const amt = Number(p.amount_minor) / 100;
    const day = String(p.created_at).slice(0, 10);
    const d = byDay.get(day) ?? { day, collected: 0, refunded: 0 };
    if (p.kind === "refund") {
      refunded += amt;
      d.refunded += amt;
    } else {
      collected += amt;
      d.collected += amt;
    }
    byDay.set(day, d);
  }
  const net = collected - refunded;
  return {
    collected,
    refunded,
    net,
    estGst: Math.round((net * 0.18) / 1.18),
    openDisputes: disputes.filter((d) => !["resolved", "rejected"].includes(String(d.status))).length,
    pendingApprovals: approvals.filter((a) => a.status === "pending").length,
    receivable,
    openInvoices: pending.length,
    overdueInvoices: overdue,
    chart: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    recentPayments: payments.slice(0, 6),
    recentDisputes: disputes.slice(0, 5),
  };
}

// Everything the home screen needs in one round trip (Maya-style dashboard + agent activity).
export async function getHomeData() {
  const db = admin();
  const [overview, approvals, audit, company, employees, pendingInvoices] = await Promise.all([
    getOverview(),
    getApprovals(),
    getAudit(20),
    db.from("companies").select("name").limit(1).maybeSingle(),
    db.from("employees").select("monthly_ctc_minor").eq("active", true),
    db
      .from("orders")
      .select("id,invoice_number,amount_minor,due_date,reminders_sent,customers(name)")
      .eq("status", "pending")
      .order("due_date", { ascending: true })
      .limit(5),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const todays = audit.filter((e) => String(e.created_at).startsWith(today));
  const perAgent: Record<string, number> = {};
  for (const e of todays) {
    const t = String(e.tool).replace(/^ops[._]/, "").replace(/^finance[._]/, "");
    const a = TOOL_AGENT[t] ?? "Insights";
    perAgent[a] = (perAgent[a] ?? 0) + 1;
  }
  const emps = (employees.data ?? []) as unknown as { monthly_ctc_minor: unknown }[];
  return {
    company: (company.data as { name?: string } | null)?.name ?? "Your business",
    ...overview,
    approvals: approvals.filter((a) => a.status === "pending"),
    audit,
    invoices: ((pendingInvoices.data ?? []) as unknown as Row[]).map((o) => ({
      id: o.id as string,
      number: String(o.invoice_number ?? "").replace(/^INV-\d+-/, "INV-"),
      customer: (o.customers as { name?: string } | null)?.name ?? "",
      amountMinor: Number(o.amount_minor),
      dueDate: String(o.due_date ?? ""),
      daysOverdue: o.due_date ? Math.floor((Date.now() - new Date(String(o.due_date)).getTime()) / 86_400_000) : 0,
      reminders: Number(o.reminders_sent ?? 0),
    })),
    payroll: { employees: emps.length, monthlyMinor: emps.reduce((s, e) => s + Number(e.monthly_ctc_minor), 0) },
    today: {
      allow: todays.filter((e) => e.decision === "allow").length,
      held: todays.filter((e) => e.decision === "escalate").length,
      blocked: todays.filter((e) => e.decision === "block").length,
      perAgent,
    },
  };
}
export type HomeData = Awaited<ReturnType<typeof getHomeData>>;
