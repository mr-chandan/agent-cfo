import Link from "next/link";
import { ApprovalActions } from "@/components/app/approval-actions";
import { LiveRefresh } from "@/components/app/live-refresh";
import { TOOL_LABEL } from "@/components/app/ui-bits";
import { TOOL_AGENT, type AgentName } from "@/lib/agent/agents";
import { getApprovals, getAudit } from "@/lib/queries";
import { money } from "@/lib/format";

const DOT: Record<AgentName, string> = {
  Collections: "bg-emerald-500",
  Disputes: "bg-violet-500",
  GST: "bg-sky-500",
  Payouts: "bg-amber-500",
  Payroll: "bg-rose-500",
  Insights: "bg-zinc-400",
};
const time = (v: unknown) => new Date(String(v)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const toolName = (t: unknown) => {
  const s = String(t).replace(/^ops[._]/, "");
  return TOOL_LABEL[s] ? s : s.replace(/^finance[._]/, "");
};

// Narrow, borderless rail: things waiting for the owner first, then a timeline of what the agents did.
export async function ActivityRail() {
  const [approvals, audit] = await Promise.all([getApprovals(), getAudit(18)]);
  const pending = approvals.filter((a) => a.status === "pending");

  return (
    <aside className="flex h-full min-h-0 flex-col">
      <LiveRefresh tables={["audit_log", "approvals"]} />

      {pending.length > 0 && (
        <section className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <h2 className="text-sm font-semibold">Waiting for your signature</h2>
          <ul className="mt-3 space-y-4">
            {pending.map((a) => {
              const amt = (a.input as { amountMinor?: number })?.amountMinor;
              return (
                <li key={a.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm">{TOOL_LABEL[toolName(a.tool)] ?? toolName(a.tool)}</span>
                    {amt ? <span className="figures text-sm font-semibold">{money(amt, "INR")}</span> : null}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{String(a.reason)}</p>
                  <div className="mt-2">
                    <ApprovalActions id={a.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex items-baseline justify-between">
        <h2 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Activity</h2>
        <Link href="/audit" className="text-muted-foreground text-[11px] hover:text-foreground">
          Audit log →
        </Link>
      </div>

      <ol className="relative mt-3 min-h-0 flex-1 overflow-y-auto pl-4 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-border">
        {audit.length === 0 && <li className="text-muted-foreground text-sm">Nothing yet.</li>}
        {audit.map((e) => {
          const tool = toolName(e.tool);
          const agent = TOOL_AGENT[tool];
          const decision = String(e.decision);
          const amt = (e.input as { amountMinor?: number } | null)?.amountMinor;
          const bad = decision === "block";
          const held = decision === "escalate";
          return (
            <li key={e.id} className="relative pb-4 last:pb-0" title={String(e.reason ?? "")}>
              <span className={`absolute top-1.5 -left-4 size-[11px] rounded-full ring-4 ring-background ${bad ? "bg-destructive" : held ? "bg-primary" : agent ? DOT[agent] : "bg-zinc-400"}`} />
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-sm leading-tight ${bad ? "text-destructive" : ""}`}>
                  {TOOL_LABEL[tool] ?? tool.replace(/_/g, " ")}
                  {amt ? <span className="figures text-muted-foreground"> · {money(amt, "INR")}</span> : null}
                </span>
                <span className="figures text-muted-foreground shrink-0 text-[11px]">{time(e.created_at)}</span>
              </div>
              <div className="text-muted-foreground mt-0.5 text-[11px]">
                {bad ? "Blocked" : held ? "Held for approval" : agent ? `${agent} agent` : "Agent"}
                {(bad || held) && e.reason ? ` — ${String(e.reason)}` : ""}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
