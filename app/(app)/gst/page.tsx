import { Suspense } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, Page, PageHeader, PageSkeleton, Panel, PanelHeader, StatusBadge } from "@/components/app/ui-bits";
import { admin } from "@/lib/supabase-admin";
import { COMPANY_ID } from "@/lib/agent/finance-ops";
import { getOverview } from "@/lib/queries";
import { money } from "@/lib/format";
import { whitebooksEnabled } from "@/lib/whitebooks";
import { cn } from "@/lib/utils";

export default function GstPage() {
  return (
    <Page>
      <PageHeader eyebrow="Money" title="GST & Tax" description="A running estimate from your payments. Refunds reduce what you owe. This is an estimate, not a filing." />
      <Suspense fallback={<PageSkeleton rows={5} />}>
        <Estimate />
      </Suspense>
      <Suspense fallback={<PageSkeleton rows={3} />}>
        <Returns />
      </Suspense>
    </Page>
  );
}

async function Estimate() {
  const o = await getOverview();
  const net = Math.round(o.net * 100);
  const gst = Math.round(o.estGst * 100);
  const rows: [string, string][] = [
    ["Sales collected (incl. GST)", money(Math.round(o.collected * 100), "INR")],
    ["Less: refunds issued", `− ${money(Math.round(o.refunded * 100), "INR")}`],
    ["Net sales (incl. GST)", money(net, "INR")],
    ["Taxable value (excl. GST)", money(net - gst, "INR")],
  ];
  const connected = whitebooksEnabled();

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <LiveRefresh tables={["payments", "gst_returns"]} />
      <Panel className="lg:col-span-2">
        <PanelHeader title="Estimated GST payable" description="Assumes every price includes 18% GST" />
        <div className="px-5 pt-5 pb-2">
          <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">GST @ 18%</div>
          <div className="figures mt-1 text-3xl font-semibold tracking-tight">{money(gst, "INR")}</div>
        </div>
        <dl className="px-5 pb-5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b py-2.5 text-sm last:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="figures">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel>
        <PanelHeader title="GST portal" description="Sandbox connection" />
        <div className="space-y-4 px-5 py-5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-muted-foreground/50")} />
            {connected ? "Keys configured" : "Not connected"}
          </p>
          <p className="text-muted-foreground">
            The agent can look up any GSTIN and read portal balances for the connected test taxpayer. The agent drafts GSTR-1 and GSTR-3B from your
            invoices; saving a return to the portal always needs your approval.
          </p>
          <Button asChild variant="outline" className="rounded-full px-4">
            <Link href="/">
              <Sparkles className="size-4" /> Ask the agent about GST
            </Link>
          </Button>
        </div>
      </Panel>
    </div>
  );
}

type GstReturnRow = { id: string; form: string; period: string; status: string; summary: Record<string, unknown> | null; filed_at: string | null };

async function Returns() {
  const { data } = await admin()
    .from("gst_returns")
    .select("id, form, period, status, summary, filed_at")
    .eq("company_id", COMPANY_ID)
    .order("period", { ascending: false })
    .order("form", { ascending: true })
    .limit(6);
  const rows = (data ?? []) as GstReturnRow[];

  return (
    <Panel className="mt-4">
      <PanelHeader title="Returns" description="Monthly drafts prepared by the agent. Filing needs your approval." />
      {rows.length === 0 ? (
        <EmptyState title="No returns yet" hint="Ask the agent: 'Prepare GSTR-1 and GSTR-3B for this month.'" />
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">
                  {r.form === "GSTR3B" ? "GSTR-3B" : "GSTR-1"} · {r.period}
                </div>
                <div className="text-muted-foreground text-xs">
                  {r.form === "GSTR3B" ? "Net payable" : "Net tax"} {money(Number(r.summary?.net_payable_minor ?? r.summary?.net_tax_minor ?? 0), "INR")}
                </div>
              </div>
              <StatusBadge value={r.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
