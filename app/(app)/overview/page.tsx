import { Suspense } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PaymentLinkDialog } from "@/components/app/payment-link-dialog";
import { RevenueChart } from "@/components/app/revenue-chart";
import { EmptyState, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, StatRow, StatusBadge, Td, Th, type Stat } from "@/components/app/ui-bits";
import { getOverview, type Row } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";

const TABLES = ["payments", "orders", "disputes", "approvals"];
const inr = (n: number) => money(Math.round(n * 100), "INR");

export default function DashboardPage() {
  return (
    <Page>
      <PageHeader eyebrow="Money" title="Dashboard" description="Money in, money out, and what needs your attention.">
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline">
          Home has the live view →
        </Link>
        <PaymentLinkDialog />
      </PageHeader>
      <Suspense fallback={<PageSkeleton stats={4} rows={6} />}>
        <Overview />
      </Suspense>
    </Page>
  );
}

async function Overview() {
  const o = await getOverview();
  const stats: Stat[] = [
    { label: "Net revenue", value: inr(o.net), sub: `${inr(o.collected)} collected − ${inr(o.refunded)} refunded` },
    { label: "Estimated GST payable", value: inr(o.estGst), sub: "18% included in prices · estimate" },
    { label: "Open disputes", value: String(o.openDisputes), sub: o.openDisputes ? "waiting for a decision" : "nothing open", tone: o.openDisputes ? "warn" : "good" },
    { label: "Awaiting your approval", value: String(o.pendingApprovals), sub: o.pendingApprovals ? "agent actions on hold" : "nothing pending", tone: o.pendingApprovals ? "warn" : "good" },
  ];

  return (
    <>
      <LiveRefresh tables={TABLES} />
      <StatRow items={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Collected vs refunded" description="Daily totals, in rupees" />
          <div className="px-5 py-4">
            {o.chart.length === 0 ? (
              <EmptyState title="No payments yet." hint="The chart fills in as money comes in." />
            ) : (
              <RevenueChart data={o.chart} />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Needs attention" description="Latest customer disputes" />
          {o.recentDisputes.length === 0 ? (
            <EmptyState title="Nothing open." hint="New complaints will show up here." />
          ) : (
            <ul className="divide-y">
              {o.recentDisputes.map((d: Row) => (
                <li key={d.id}>
                  <Link href={`/disputes/${d.id}`} className="hover:bg-muted/40 block px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{(d.customers as { name?: string } | null)?.name}</span>
                      <StatusBadge value={d.status} />
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{String(d.reason)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Recent money movement" description="Payments received and refunds sent">
          <Link href="/payments" className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">
            All invoices →
          </Link>
        </PanelHeader>
        {o.recentPayments.length === 0 ? (
          <EmptyState title="No money has moved yet." hint="Request a payment to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th>Customer</Th>
                <Th>When</Th>
                <Th>Type</Th>
                <Th right>Amount</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.recentPayments.map((p: Row) => {
                const refund = p.kind === "refund";
                return (
                  <TableRow key={p.id} className={ROW}>
                    <Td className="font-medium">{(p.orders as { customers?: { name?: string } } | null)?.customers?.name ?? "—"}</Td>
                    <Td muted>{dateTime(p.created_at)}</Td>
                    <Td>
                      <StatusBadge value={p.kind} />
                    </Td>
                    <Td right className="font-medium">
                      <span className={`inline-flex items-center gap-1 ${refund ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {refund ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
                        {refund ? "−" : "+"}
                        {money(p.amount_minor, p.currency)}
                      </span>
                    </Td>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <ShieldCheck className="text-primary size-3.5 shrink-0" />
        <span>
          Every action the agent takes is checked against your rules and recorded in the{" "}
          <Link href="/audit" className="underline underline-offset-4">
            audit log
          </Link>
          .
        </span>
      </p>
    </>
  );
}
