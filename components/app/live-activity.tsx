import Link from "next/link";
import { Check } from "lucide-react";
import { ApprovalActions } from "@/components/app/approval-actions";
import { LiveRefresh } from "@/components/app/live-refresh";
import { TOOL_LABEL } from "@/components/app/ui-bits";
import { TOOL_AGENT } from "@/lib/agent/agents";
import { getApprovals, getAudit, getOverview } from "@/lib/queries";
import { money } from "@/lib/format";

const inr = (n: number) => money(Math.round(n * 100), "INR");
const time = (v: unknown) => new Date(String(v)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
// Gateway names carry a server prefix (ops_finance_summary, finance_get_order); strip one prefix, never a real name.
const toolName = (t: unknown) => {
  const s = String(t).replace(/^ops[._]/, "");
  return TOOL_LABEL[s] ? s : s.replace(/^finance[._]/, "");
};

// Right rail: where the money stands, anything waiting for the owner, and what the agents just did.
// Routine allowed actions stay quiet; only held/blocked ones get a stamp, so exceptions stand out.
export async function LiveActivity() {
  const [o, approvals, audit] = await Promise.all([getOverview(), getApprovals(), getAudit(16)]);
  const pending = approvals.filter((a) => a.status === "pending");

  const position = [
    { k: "Collected", v: inr(o.collected) },
    { k: "To collect", v: inr(o.receivable), note: o.overdueInvoices ? `${o.overdueInvoices} overdue` : o.openInvoices ? `${o.openInvoices} open invoices` : undefined },
    { k: "Refunded", v: inr(o.refunded) },
    { k: "GST payable", v: inr(o.estGst), note: "estimate" },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      <LiveRefresh tables={["audit_log", "approvals", "payments", "orders", "disputes"]} />

      <section className="px-5 pt-4 pb-5">
        <h2 className="text-muted-foreground text-xs font-medium">Cash position</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          {position.map((p) => (
            <div key={p.k}>
              <dt className="text-muted-foreground text-xs">{p.k}</dt>
              <dd className="figures mt-0.5 text-xl font-semibold tracking-tight">{p.v}</dd>
              {p.note && <dd className="text-muted-foreground text-[11px]">{p.note}</dd>}
            </div>
          ))}
        </dl>
      </section>

      {pending.length > 0 && (
        <section className="border-t bg-primary/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-primary">Needs your approval · {pending.length}</h2>
          <ul className="mt-2 space-y-3">
            {pending.map((a) => (
              <li key={a.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{TOOL_LABEL[toolName(a.tool)] ?? toolName(a.tool)}</span>
                  {(a.input as { amountMinor?: number })?.amountMinor ? (
                    <span className="figures text-sm font-semibold">{money((a.input as { amountMinor: number }).amountMinor, "INR")}</span>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">{String(a.reason)}</p>
                <div className="mt-2">
                  <ApprovalActions id={a.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex min-h-0 flex-1 flex-col border-t">
        <div className="flex items-baseline justify-between px-5 pt-4 pb-2">
          <h2 className="text-muted-foreground text-xs font-medium">Agent activity</h2>
          <Link href="/audit" className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline">
            Audit log
          </Link>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {audit.length === 0 && <li className="text-muted-foreground px-3 py-2 text-sm">No activity yet. Ask the agent something.</li>}
          {audit.map((e) => {
            const tool = toolName(e.tool);
            const decision = String(e.decision);
            const amount = (e.input as { amountMinor?: number } | null)?.amountMinor;
            return (
              <li key={e.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted" title={String(e.reason ?? "")}>
                {decision === "allow" ? (
                  <Check className="size-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <span className={`size-2 shrink-0 rounded-full ${decision === "escalate" ? "bg-[var(--stamp-hold)]" : decision === "block" ? "bg-[var(--stamp-block)]" : "bg-muted-foreground"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{TOOL_LABEL[tool] ?? tool.replace(/_/g, " ")}</div>
                  <div className="text-muted-foreground truncate text-[11px]">
                    {TOOL_AGENT[tool] ? `${TOOL_AGENT[tool]} agent` : "Agent"}
                    {amount ? <span className="figures"> · {money(amount, "INR")}</span> : null}
                  </div>
                </div>
                {decision === "escalate" || decision === "block" ? (
                  <span className="stamp" data-verdict={decision === "block" ? "block" : "hold"} style={{ fontSize: "0.58rem", padding: "0.05rem 0.4rem" }}>
                    {decision === "block" ? "Blocked" : "Held"}
                  </span>
                ) : (
                  <span className="figures text-muted-foreground text-[11px]">{time(e.created_at)}</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </aside>
  );
}
