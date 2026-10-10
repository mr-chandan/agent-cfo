"use client";

// Generative UI: each tool result renders as a purpose-built card instead of raw text.
import { createContext, useContext, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowDownLeft,
  Ban,
  Building2,
  CheckCircle2,
  ExternalLink,
  Hand,
  Landmark,
  Mail,
  Receipt,
  ScrollText,
  ShieldCheck,
  AlarmClock,
  BadgeCheck,
  FileCheck2,
  KeyRound,
  UserPlus,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { Gstr1DraftCard, Gstr3bDraftCard, GstFiledCard } from "@/components/app/gst-cards";
import { StatusBadge, TOOL_LABEL } from "@/components/app/ui-bits";
import { TOOL_AGENT, type AgentName } from "@/lib/agent/agents";

type R = Record<string, unknown>;
export type ToolOut = {
  status?: "done" | "blocked" | "pending_approval" | "error" | string;
  reason?: string;
  approvalId?: string;
  result?: R;
  // AgntID runtime denials arrive as MCP tool errors; the chat route normalizes them to this shape
  enforcedBy?: "agntid" | "local";
  agntid?: AgntidFlow;
};

export type AgntidFlow = {
  tool_name?: string;
  status?: string;
  total_duration_ms?: number;
  event_id?: string;
  steps?: { step: string; status: string; duration_ms?: number; details?: Record<string, unknown> }[];
};

const STEP_LABEL: Record<string, string> = {
  guardrail_validation: "Guardrails",
  intent_parsing: "Intent",
  policy_evaluation: "Policy",
  credential_resolution: "Credentials",
  tool_execution: "Executed",
};

// AgntID's per-call enforcement trace (from the runtime's __agntid_execution_flow).
export function AgntidTrace({ flow }: { flow: AgntidFlow }) {
  return (
    <div className="mt-1.5 flex w-full max-w-md flex-wrap items-center gap-1 text-[10px]">
      <span className="text-muted-foreground mr-0.5 font-medium">AgntID</span>
      {(flow.steps ?? []).map((st) => {
        const ok = /pass|success/i.test(st.status);
        const skip = /skip/i.test(st.status);
        return (
          <span
            key={st.step}
            title={JSON.stringify(st.details ?? {}, null, 1)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
              ok && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
              skip && "text-muted-foreground",
              !ok && !skip && "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
            )}
          >
            {ok ? "✓" : skip ? "–" : "✕"} {STEP_LABEL[st.step] ?? st.step.replace(/_/g, " ")}
          </span>
        );
      })}
      {flow.total_duration_ms != null && <span className="text-muted-foreground ml-0.5">{flow.total_duration_ms} ms</span>}
    </div>
  );
}

/** Strip a gateway prefix such as `finance_` / `finance.` so names match our registry. */
export function baseToolName(name: string) {
  return name.replace(/^(finance|ops)[._]/, "");
}

export const str = (v: unknown) => (v == null ? "" : String(v));
export const num = (v: unknown) => Number(v ?? 0);

export function Stamp({ verdict, by = "AgntID" }: { verdict: "allow" | "hold" | "block"; by?: string }) {
  const word = { allow: "Allowed", hold: "Held", block: "Blocked" }[verdict];
  return (
    <span className="stamp stamp-in" data-verdict={verdict} title={`${word} by ${by}`}>
      {word}
      <span className="font-normal opacity-70">· {by}</span>
    </span>
  );
}

const StampContext = createContext<React.ReactNode>(null);

export function Shell({ icon, title, tone = "default", children, footer }: { icon: React.ReactNode; title: string; tone?: "default" | "ok" | "warn" | "bad"; children?: React.ReactNode; footer?: React.ReactNode }) {
  const ring = {
    default: "border-border",
    ok: "border-emerald-200 dark:border-emerald-900",
    warn: "border-amber-300 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/30",
    bad: "border-red-300 bg-red-50/40 dark:border-red-900 dark:bg-red-950/30",
  }[tone];
  return (
    <div className={cn("bg-card w-full max-w-md overflow-hidden rounded-xl border text-left shadow-sm", ring)}>
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
        {icon}
        <span className="flex-1">{title}</span>
        {useContext(StampContext)}
      </div>
      {children && <div className="px-3 py-2 text-sm">{children}</div>}
      {footer && <div className="bg-muted/40 border-t px-3 py-2 text-xs">{footer}</div>}
    </div>
  );
}

export function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className={cn("text-right", strong && "figures text-base font-semibold")}>{v}</span>
    </div>
  );
}


const AGENT_STYLE: Record<AgentName, string> = {
  Collections: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Disputes: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  GST: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  Payouts: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  Payroll: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  Insights: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function AgentChip({ tool }: { tool: string }) {
  const a = TOOL_AGENT[baseToolName(tool)];
  if (!a) return null;
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", AGENT_STYLE[a])}>{a} agent</span>;
}

function AddCustomerCard({ r }: { r: R }) {
  const c = (r.customer as R) ?? {};
  return (
    <Shell icon={<UserPlus className="size-4 text-emerald-600" />} title={r.created ? "Customer added" : "Customer already on file"} tone="ok">
      <Row k="Name" v={str(c.name)} />
      <Row k="Email" v={str(c.email)} />
    </Shell>
  );
}

function OverdueCard({ r }: { r: R }) {
  const rows = (r.invoices as R[] | undefined) ?? [];
  return (
    <Shell icon={<AlarmClock className="size-4 text-amber-600" />} title={rows.length ? `${rows.length} unpaid invoice${rows.length > 1 ? "s" : ""}` : "Nothing overdue"}
      footer={<span>Outstanding {money(r.total_outstanding_minor, "INR")} · MSMED interest at {Number(r.msmed_rate_pct).toFixed(2)}% p.a. (3× RBI bank rate)</span>}>
      <div className="divide-y">
        {rows.map((o) => (
          <div key={str(o.order_id)} className="flex items-center justify-between gap-2 py-1.5">
            <div>
              <div className="font-medium">{str(o.customer)} <span className="text-muted-foreground text-xs">{str(o.invoice_number)}</span></div>
              <div className="text-muted-foreground text-[11px]">
                {num(o.days_overdue) > 0 ? `${num(o.days_overdue)} days overdue` : `due ${str(o.due_date)}`} · {num(o.reminders_sent)} reminder{num(o.reminders_sent) === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-right">
              <div className="font-medium">{money(o.amount_minor, "INR")}</div>
              {num(o.msmed_interest_minor) > 0 && <div className="text-[11px] text-amber-700">+ {money(o.msmed_interest_minor, "INR")} interest</div>}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">All invoices are paid or not yet due.</p>}
      </div>
    </Shell>
  );
}

function ReminderCard({ r }: { r: R }) {
  return (
    <Shell icon={<Mail className="size-4" />} title={`${str(r.tone).replace(/^./, (c) => c.toUpperCase())} reminder ${r.delivered ? "sent" : "recorded"}`} tone={r.delivered ? "ok" : "default"}
      footer={<span>{str(r.invoice_number)} · {num(r.days_overdue)} days overdue{num(r.msmed_interest_minor) > 0 ? ` · interest ${money(r.msmed_interest_minor, "INR")}` : ""}</span>}>
      {!r.delivered && r.reason ? <p className="text-muted-foreground text-xs">{str(r.reason)}</p> : <p className="text-xs">Delivered to the customer by email.</p>}
    </Shell>
  );
}

function VerifyPaymentCard({ r }: { r: R }) {
  const ok = Boolean(r.confirmed_paid);
  return (
    <Shell icon={ok ? <BadgeCheck className="size-4 text-emerald-600" /> : <Ban className="size-4 text-red-600" />} title={ok ? "Payment confirmed by gateway" : "Payment NOT confirmed"} tone={ok ? "ok" : "bad"}>
      <Row k="Invoice" v={str(r.invoice_number)} />
      <Row k="Our record" v={<StatusBadge value={r.our_record} />} />
      <Row k="Gateway" v={str(r.gateway_status)} />
      <p className="text-muted-foreground mt-1 text-xs">{str(r.advice)}</p>
    </Shell>
  );
}

function BeneficiariesCard({ r }: { r: R }) {
  const rows = (r.beneficiaries as R[] | undefined) ?? [];
  return (
    <Shell icon={<Landmark className="size-4" />} title="Payout beneficiaries">
      {rows.map((b) => (
        <div key={str(b.id)} className="flex items-center justify-between py-0.5">
          <span>{str(b.name)} <span className="text-muted-foreground text-xs">{str(b.account_ref)}</span></span>
          <StatusBadge value={b.approved ? "approved" : "pending"} />
        </div>
      ))}
    </Shell>
  );
}

function BankChangeCard({ r }: { r: R }) {
  const flags = (r.risk_flags as string[] | undefined) ?? [];
  const steps = (r.next_steps as string[] | undefined) ?? [];
  return (
    <Shell icon={<KeyRound className="size-4 text-amber-600" />} title="Bank change held for verification" tone="warn"
      footer={<span>The account was NOT changed. Payouts keep going to {str(r.current_account)} until a person verifies.</span>}>
      <Row k="Vendor" v={str(r.beneficiary)} />
      <Row k="Requested account" v={str(r.requested_account)} />
      <div className="mt-1 flex flex-wrap gap-1">
        {flags.map((f) => <span key={f} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{f}</span>)}
      </div>
      <ol className="text-muted-foreground mt-2 list-decimal space-y-0.5 pl-4 text-xs">{steps.map((st) => <li key={st}>{st}</li>)}</ol>
    </Shell>
  );
}

function EvidencePackCard({ r }: { r: R }) {
  const items = (r.checklist as R[] | undefined) ?? [];
  return (
    <Shell icon={<FileCheck2 className="size-4 text-violet-600" />} title={r.ready_to_submit ? "Evidence pack ready" : "Evidence pack — items missing"} tone={r.ready_to_submit ? "ok" : "warn"}>
      <ul className="space-y-0.5">
        {items.map((c) => (
          <li key={str(c.item)} className="flex items-center gap-2 text-xs">
            {c.present ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <Ban className="size-3.5 text-red-500" />}
            {str(c.item)}
          </li>
        ))}
      </ul>
    </Shell>
  );
}


function EmployeeAddedCard({ r }: { r: R }) {
  const e = (r.employee as R) ?? {};
  const pv = (r.preview as R) ?? {};
  return (
    <Shell icon={<UserPlus className="size-4 text-rose-600" />} title="Employee added to payroll" tone="ok"
      footer={<span>Estimated take-home {money(pv.net_minor, "INR")} / month after PF, ESI, PT and TDS</span>}>
      <Row k="Name" v={`${str(e.name)}${e.designation ? ` · ${str(e.designation)}` : ""}`} />
      <Row k="Gross / month" v={money(e.monthly_ctc_minor, "INR")} strong />
      <Row k="State (for PT)" v={str(e.state)} />
    </Shell>
  );
}

function EmployeesCard({ r }: { r: R }) {
  const rows = (r.employees as R[] | undefined) ?? [];
  return (
    <Shell icon={<UserPlus className="size-4" />} title={`${rows.length} employee${rows.length === 1 ? "" : "s"}`}
      footer={<span>Monthly payroll {money(r.monthly_payroll_minor, "INR")}</span>}>
      <div className="divide-y">
        {rows.map((e) => (
          <div key={str(e.id)} className="flex items-center justify-between py-1">
            <span>{str(e.name)} <span className="text-muted-foreground text-xs">{str(e.designation ?? "")}</span></span>
            <span className="figures">{money(e.monthly_ctc_minor, "INR")}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">No employees yet.</p>}
      </div>
    </Shell>
  );
}

function PayrollDraftCard({ r }: { r: R }) {
  const rows = (r.employees as R[] | undefined) ?? [];
  const m = (v: unknown) => (Number(v) / 100).toLocaleString("en-IN");
  return (
    <Shell icon={<FileCheck2 className="size-4 text-rose-600" />} title={`Payroll draft · ${str(r.period)}`}
      footer={<span>{str(r.note)}</span>}>
      <div className="-mx-1 overflow-x-auto">
        <table className="figures w-full text-[11px]">
          <thead className="text-muted-foreground">
            <tr className="text-right">
              <th className="text-left font-normal">Employee</th>
              <th className="font-normal">Gross</th>
              <th className="font-normal">PF</th>
              <th className="font-normal">ESI</th>
              <th className="font-normal">PT</th>
              <th className="font-normal">TDS</th>
              <th className="font-normal">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={str(e.name)} className="border-t text-right">
                <td className="py-1 text-left font-sans">{str(e.name)}</td>
                <td>{m(e.gross_minor)}</td>
                <td>{m(e.pf_employee_minor)}</td>
                <td>{m(e.esi_employee_minor)}</td>
                <td>{m(e.pt_minor)}</td>
                <td>{m(e.tds_minor)}</td>
                <td className="font-semibold">{m(e.net_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4">
        <Row k="Net to pay" v={money(r.total_net_minor, "INR")} strong />
        <Row k="Cost to company" v={money(r.total_employer_cost_minor, "INR")} />
      </div>
    </Shell>
  );
}

function PayrollPaidCard({ r }: { r: R }) {
  return (
    <Shell icon={<BadgeCheck className="size-4 text-emerald-600" />} title={`Salaries paid · ${str(r.period)}`} tone="ok" footer={<span>{str(r.payout_mode)}</span>}>
      <Row k="Employees paid" v={str(r.employees_paid)} />
      <Row k="Payslips emailed" v={str(r.payslips_emailed)} />
      <Row k="Total net pay" v={money(r.total_net_minor, "INR")} strong />
    </Shell>
  );
}

/* ---------- state cards ---------- */

export function PendingCard({ name }: { name: string }) {
  return (
    <Shell icon={<Skeleton className="size-3.5 rounded-full" />} title={`${TOOL_LABEL[baseToolName(name)] ?? baseToolName(name)}…`}>
      <div className="space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </Shell>
  );
}

export function BlockedCard({ name, out }: { name: string; out: ToolOut }) {
  return (
    <Shell icon={<Ban className="size-4 text-red-600" />} title={`${TOOL_LABEL[baseToolName(name)] ?? baseToolName(name)} — blocked`} tone="bad"
      footer={<span className="flex items-center gap-1"><ShieldCheck className="size-3.5" /> Stopped {out.enforcedBy === "agntid" ? "by the AgntID runtime" : "by access control"} before it ran. Logged.</span>}>
      <p>{out.reason}</p>
    </Shell>
  );
}

type InlineDecision =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "approved"; result: R | undefined }
  | { kind: "denied" }
  | { kind: "error"; message: string };

export function ApprovalCard({ name, out }: { name: string; out: ToolOut }) {
  const [state, setState] = useState<InlineDecision>({ kind: "idle" });
  const id = out.approvalId;

  async function decideInline(approve: boolean) {
    if (!id) return;
    setState({ kind: "busy" });
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const json = (await res.json()) as { status?: string; result?: R; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "failed");
      if (approve) {
        setState({ kind: "approved", result: json.result });
        toast.success("Approved and executed");
      } else {
        setState({ kind: "denied" });
        toast.success("Denied");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not record decision";
      setState({ kind: "error", message });
      toast.error(message);
    }
  }

  const decided = state.kind === "approved" || state.kind === "denied";
  return (
    <div className="space-y-2">
      <Shell icon={<Hand className="size-4 text-amber-600" />} title={`${TOOL_LABEL[baseToolName(name)] ?? baseToolName(name)} — needs a human`} tone="warn"
        footer={<Link href="/approvals" className="underline">Review and approve →</Link>}>
        <p>{out.reason}</p>
        {state.kind === "approved" ? (
          <p className="mt-1 text-xs font-medium text-emerald-700">Approved · ran</p>
        ) : state.kind === "denied" ? (
          <p className="text-muted-foreground mt-1 text-xs font-medium">Denied · nothing ran</p>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs">Nothing has moved yet. A person must approve this first.</p>
        )}
        {state.kind === "error" && <p className="mt-1 text-xs text-red-600">{state.message}</p>}
        {id && !decided && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7" disabled={state.kind === "busy"} onClick={() => decideInline(true)}>
              Approve
            </Button>
            <Button size="sm" variant="outline" className="h-7" disabled={state.kind === "busy"} onClick={() => decideInline(false)}>
              Deny
            </Button>
          </div>
        )}
      </Shell>
      {state.kind === "approved" && <CardFor name={name} out={{ status: "done", result: state.result }} />}
    </div>
  );
}

export function ErrorCard({ name, out }: { name: string; out: ToolOut }) {
  return (
    <Shell icon={<Ban className="size-4 text-zinc-500" />} title={`${TOOL_LABEL[baseToolName(name)] ?? baseToolName(name)} — failed`}>
      <p className="text-muted-foreground">{out.reason}</p>
    </Shell>
  );
}

/* ---------- result cards ---------- */

function PaymentRequestCard({ r }: { r: R }) {
  const url = str(r.checkout_url);
  const email = r.email_sent as { delivered?: boolean; reason?: string } | undefined;
  return (
    <Shell icon={<Wallet className="size-4 text-emerald-600" />} title="Payment request created" tone="ok"
      footer={url ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground truncate">{url}</span>
          <Button asChild size="sm" variant="outline" className="h-7 shrink-0">
            <a href={url} target="_blank" rel="noreferrer">Open <ExternalLink className="size-3" /></a>
          </Button>
        </div>
      ) : undefined}>
      <Row k="Customer" v={str(r.customer)} />
      {r.invoice_number ? <Row k="Invoice" v={`${str(r.invoice_number)} · due ${str(r.due_date)}`} /> : null}
      <Row k="Amount" v={money(r.requested_inr_minor, "INR")} strong />
      {email && (
        <Row k="Email" v={email.delivered ? <span className="text-emerald-700">sent</span> : <span className="text-amber-700">not sent · {email.reason}</span>} />
      )}
      <p className="text-muted-foreground mt-1 text-[11px]">Test mode · charged as ${(num(r.charged_usd_cents) / 100).toFixed(2)}</p>
    </Shell>
  );
}

function RefundCard({ r }: { r: R }) {
  const cn_ = r.credit_note as R | undefined;
  return (
    <Shell icon={<ArrowDownLeft className="size-4 text-emerald-600" />} title="Refund issued" tone="ok"
      footer={<span>Order #{str(r.order_id).slice(-6)} · {r.provider_refund_id ? "sent to payment provider" : "recorded"} · {str(r.mode)} mode</span>}>
      <Row k="Refunded" v={money(r.refunded_minor, "INR")} strong />
      {cn_ && (
        <div className="bg-muted/50 mt-2 rounded-md p-2 text-xs">
          <div className="font-medium">GST credit note {str(cn_.note_number)}</div>
          <div className="text-muted-foreground">Taxable {money(cn_.taxable_minor, "INR")} · GST reversed {money(cn_.gst_minor, "INR")} · goes into GSTR-1</div>
        </div>
      )}
    </Shell>
  );
}

function PayoutCard({ r }: { r: R }) {
  return (
    <Shell icon={<Landmark className="size-4 text-emerald-600" />} title="Payout sent" tone="ok" footer={<span>{str(r.mode)} mode</span>}>
      <Row k="To" v={str(r.beneficiary)} />
      <Row k="Amount" v={money(r.paid_minor, "INR")} strong />
    </Shell>
  );
}

function MessageCard({ r }: { r: R }) {
  const redacted = (r.redacted_fields as string[] | undefined) ?? [];
  return (
    <Shell icon={<Mail className="size-4" />} title={r.delivered ? "Email sent" : "Message recorded"} tone={r.delivered ? "ok" : "default"}
      footer={redacted.length ? <span>Masked before sending: {redacted.join(", ")}</span> : <span>No sensitive data found in the message</span>}>
      <Row k="Channel" v={str(r.channel)} />
      {!r.delivered && r.reason ? <p className="text-muted-foreground text-xs">{str(r.reason)}</p> : null}
    </Shell>
  );
}

function CustomerMatchesCard({ r }: { r: R }) {
  const m = (r.matches as R[] | undefined) ?? [];
  return (
    <Shell icon={<User className="size-4" />} title={m.length === 1 ? "Customer found" : `${m.length} customers found`}>
      <div className="space-y-1">
        {m.map((c) => (
          <div key={str(c.id)} className="flex items-center justify-between">
            <span className="font-medium">{str(c.name)}</span>
            <span className="text-muted-foreground text-xs">{str(c.email)}</span>
          </div>
        ))}
        {m.length === 0 && <p className="text-muted-foreground">No match.</p>}
      </div>
    </Shell>
  );
}

function OrdersCard({ r }: { r: unknown }) {
  const rows = (Array.isArray(r) ? r : r ? [r] : []) as R[];
  return (
    <Shell icon={<Receipt className="size-4" />} title={rows.length === 1 ? "Order" : `${rows.length} orders`}>
      <div className="divide-y">
        {rows.map((o) => (
          <div key={str(o.id)} className="flex items-center justify-between py-1">
            <div>
              <div className="font-medium">#{str(o.external_id ?? o.id).slice(-6)}</div>
              <div className="text-muted-foreground text-[11px]">{str(o.created_at).slice(0, 10)}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={o.status} />
              <span className="font-medium">{money(o.amount_minor, o.currency)}</span>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

function FinanceSummaryCard({ r }: { r: R }) {
  return (
    <Shell icon={<Landmark className="size-4" />} title="Finance snapshot">
      <div className="grid grid-cols-2 gap-x-4">
        <Row k="Collected" v={str(r.revenue_collected)} />
        <Row k="Refunded" v={str(r.refunded)} />
        <Row k="Net revenue" v={str(r.net_revenue)} strong />
        <Row k="Est. GST" v={str(r.estimated_gst_payable)} strong />
        <Row k="Open disputes" v={str(r.open_disputes)} />
        <Row k="Awaiting approval" v={str(r.pending_approvals)} />
      </div>
    </Shell>
  );
}

function DisputesCard({ r }: { r: unknown }) {
  const rows = (Array.isArray(r) ? r : []) as R[];
  return (
    <Shell icon={<ScrollText className="size-4" />} title={`${rows.length} disputes`}>
      <div className="divide-y">
        {rows.map((d) => (
          <Link key={str(d.id)} href={`/disputes/${str(d.id)}`} className="hover:bg-muted/50 -mx-1 block rounded px-1 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{str(d.customer)}</span>
              <StatusBadge value={d.status} />
            </div>
            <p className="text-muted-foreground line-clamp-1 text-xs">{str(d.reason)}</p>
          </Link>
        ))}
      </div>
    </Shell>
  );
}

function GstTaxpayerCard({ r }: { r: R }) {
  if (!r.found) return <Shell icon={<Building2 className="size-4" />} title="GST lookup"><p className="text-muted-foreground">{str(r.reason)}</p></Shell>;
  const t = (r.taxpayer as R) ?? {};
  const addr = ((t.pradr as R)?.addr as R) ?? {};
  return (
    <Shell icon={<Building2 className="size-4 text-emerald-600" />} title="GST registration" tone="ok" footer={<span>GSTIN {str(t.gstin)} · {str(t.dty)} · since {str(t.rgdt)}</span>}>
      <div className="font-medium">{str(t.lgnm)}</div>
      {t.tradeNam ? <div className="text-muted-foreground text-xs">Trade name: {str(t.tradeNam)}</div> : null}
      <Row k="Status" v={<StatusBadge value={str(t.sts).toLowerCase() === "active" ? "paid" : str(t.sts)} />} />
      <Row k="State" v={str(addr.stcd)} />
      <Row k="Type" v={str(t.ctb)} />
    </Shell>
  );
}

function GstLedgerCard({ r }: { r: R }) {
  const c = (r.cash_ledger_totals as R) ?? {};
  const itc = (r.itc_available as R) ?? {};
  const fmt = (v: unknown) => (v == null ? "—" : `₹${Number(v).toLocaleString("en-IN")}`);
  return (
    <Shell icon={<Receipt className="size-4" />} title="GST portal balances" footer={<span>{str(r.note)}</span>}>
      <p className="text-muted-foreground mb-1 text-xs">Cash ledger</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(["igst", "cgst", "sgst"] as const).map((k) => (
          <div key={k} className="bg-muted/50 rounded-md py-1">
            <div className="text-muted-foreground text-[10px] uppercase">{k}</div>
            <div className="text-xs font-medium">{fmt(c[k])}</div>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">Input tax credit: IGST {fmt(itc.igst_bal)} · CGST {fmt(itc.cgst_bal)} · SGST {fmt(itc.sgst_bal)}</p>
    </Shell>
  );
}

function GstEstimateCard({ r }: { r: R }) {
  return (
    <Shell icon={<Receipt className="size-4" />} title="GST estimate" footer={<span>{str(r.note)}</span>}>
      <Row k="Net receipts" v={money(r.net_receipts_minor, "INR")} />
      <Row k={`GST @ ${(num(r.rate) * 100).toFixed(0)}%`} v={money(r.estimated_gst_minor, "INR")} strong />
    </Shell>
  );
}

function GenericCard({ name, r }: { name: string; r: unknown }) {
  return (
    <Shell icon={<CheckCircle2 className="size-4 text-emerald-600" />} title={TOOL_LABEL[baseToolName(name)] ?? baseToolName(name)} tone="ok">
      <pre className="overflow-x-auto text-xs">{JSON.stringify(r, null, 1)}</pre>
    </Shell>
  );
}

export function ToolResultCard({ name, out }: { name: string; out: ToolOut | undefined }) {
  if (!out) return <PendingCard name={name} />;
  const verdict = out.status === "blocked" ? "block" : out.status === "pending_approval" ? "hold" : out.status === "error" ? null : "allow";
  const stamp = verdict ? <Stamp verdict={verdict} by={out.enforcedBy === "agntid" ? "AgntID" : "Policy"} /> : null;
  return (
    <div className="space-y-1">
      <AgentChip tool={name} />
      <StampContext.Provider value={stamp}>
        <CardFor name={name} out={out} />
      </StampContext.Provider>
      {out.agntid && <AgntidTrace flow={out.agntid} />}
    </div>
  );
}

function CardFor({ name, out }: { name: string; out: ToolOut }) {
  if (out.status === "blocked") return <BlockedCard name={name} out={out} />;
  if (out.status === "pending_approval") return <ApprovalCard name={name} out={out} />;
  if (out.status === "error") return <ErrorCard name={name} out={out} />;
  const r = out.result as R | undefined;
  if (r === undefined) return <GenericCard name={name} r={out} />;
  switch (baseToolName(name)) {
    case "request_payment": return <PaymentRequestCard r={r} />;
    case "issue_refund": return <RefundCard r={r} />;
    case "create_payout": return <PayoutCard r={r} />;
    case "send_message": return <MessageCard r={r} />;
    case "find_customer": return <CustomerMatchesCard r={r} />;
    case "get_order":
    case "list_customer_orders": return <OrdersCard r={r} />;
    case "finance_summary": return <FinanceSummaryCard r={r} />;
    case "list_disputes": return <DisputesCard r={r} />;
    case "gst_taxpayer_lookup": return <GstTaxpayerCard r={r} />;
    case "gst_ledger_balance": return <GstLedgerCard r={r} />;
    case "gst_estimate": return <GstEstimateCard r={r} />;
    case "prepare_gstr1": return <Gstr1DraftCard r={r} />;
    case "prepare_gstr3b": return <Gstr3bDraftCard r={r} />;
    case "file_gst_return": return <GstFiledCard r={r} />;
    case "add_customer": return <AddCustomerCard r={r} />;
    case "list_overdue_invoices": return <OverdueCard r={r} />;
    case "send_payment_reminder": return <ReminderCard r={r} />;
    case "verify_payment": return <VerifyPaymentCard r={r} />;
    case "list_beneficiaries": return <BeneficiariesCard r={r} />;
    case "request_bank_change": return <BankChangeCard r={r} />;
    case "build_evidence_pack": return <EvidencePackCard r={r} />;
    case "add_employee": return <EmployeeAddedCard r={r} />;
    case "list_employees": return <EmployeesCard r={r} />;
    case "prepare_payroll": return <PayrollDraftCard r={r} />;
    case "run_payroll": return <PayrollPaidCard r={r} />;
    default: return <GenericCard name={name} r={r} />;
  }
}
