import { LiveRefresh } from "@/components/app/live-refresh";
import { getOverview } from "@/lib/queries";
import { money } from "@/lib/format";

const inr = (n: number) => money(Math.round(n * 100), "INR");

// One strip across the top: where the money stands right now. Big tabular figures, nothing else.
export async function MoneyStrip() {
  const o = await getOverview();
  const items = [
    { k: "Collected", v: inr(o.collected), sub: "this month" },
    { k: "To collect", v: inr(o.receivable), sub: o.overdueInvoices ? `${o.overdueInvoices} overdue` : `${o.openInvoices} open invoice${o.openInvoices === 1 ? "" : "s"}`, warn: o.overdueInvoices > 0 },
    { k: "Refunded", v: inr(o.refunded), sub: "test mode" },
    { k: "GST payable", v: inr(o.estGst), sub: "estimate · 18%" },
    { k: "Awaiting you", v: String(o.pendingApprovals), sub: o.pendingApprovals ? "approvals" : "nothing pending", warn: o.pendingApprovals > 0 },
  ];
  return (
    <div className="grid grid-cols-2 divide-x divide-border overflow-hidden rounded-xl border bg-card sm:grid-cols-5">
      <LiveRefresh tables={["payments", "orders", "approvals"]} />
      {items.map((it) => (
        <div key={it.k} className="px-5 py-3.5">
          <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{it.k}</div>
          <div className="figures mt-1 text-2xl font-semibold tracking-tight">{it.v}</div>
          <div className={it.warn ? "text-primary text-[11px] font-medium" : "text-muted-foreground text-[11px]"}>{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
