import { Suspense } from "react";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PaymentLinkDialog } from "@/components/app/payment-link-dialog";
import { EmptyState, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, StatRow, StatusBadge, Td, Th, shortDate, type Stat } from "@/components/app/ui-bits";
import { getOrders, getOverview, getPayments, type Row } from "@/lib/queries";
import { dateTime, money, shortId } from "@/lib/format";

export default function PaymentsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Money" title="Invoices & payments" description="Every invoice you’ve raised and what has been paid. New payments show up on their own.">
        <PaymentLinkDialog />
      </PageHeader>
      <Suspense fallback={<PageSkeleton stats={3} rows={6} />}>
        <Invoices />
      </Suspense>
    </Page>
  );
}

const DAY = 86_400_000;
const inr = (n: number) => money(Math.round(n * 100), "INR");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function invoiceNo(o: Row) {
  const n = String(o.invoice_number ?? "");
  return n ? n.replace(/^INV-\d+-/, "INV-") : `#${shortId(o.external_id ?? o.id)}`;
}

/** Days each pending invoice is past its due date, keyed by order id (only overdue ones). Read once per request. */
function lateness(orders: Row[]) {
  const now = Date.now();
  const late = new Map<string, number>();
  for (const x of orders) {
    if (x.status !== "pending" || !x.due_date) continue;
    const due = new Date(String(x.due_date)).getTime();
    if (due < now) late.set(x.id, Math.floor((now - due) / DAY));
  }
  return late;
}

async function Invoices() {
  const [orders, payments, o] = await Promise.all([getOrders(), getPayments(), getOverview()]);

  // Latest charge per order gives the paid date; payments arrive newest first.
  const paidAt = new Map<string, string>();
  for (const p of payments) if (p.kind === "charge" && !paidAt.has(String(p.order_id))) paidAt.set(String(p.order_id), String(p.created_at));

  const lateDays = lateness(orders);
  const overdue = orders.filter((x) => lateDays.has(x.id));
  const overdueMinor = overdue.reduce((s, x) => s + Number(x.amount_minor), 0);
  const paidCount = orders.filter((x) => x.status === "paid").length;

  const stats: Stat[] = [
    { label: "Collected", value: inr(o.collected), sub: paidCount ? plural(paidCount, "paid invoice") : "Nothing collected yet" },
    { label: "To collect", value: inr(o.receivable), sub: o.openInvoices ? plural(o.openInvoices, "open invoice") : "No open invoices" },
    {
      label: "Overdue",
      value: money(overdueMinor, "INR"),
      sub: overdue.length ? `${plural(overdue.length, "invoice")} past due · ask the agent to chase` : "Nothing overdue",
      tone: overdue.length ? "bad" : "good",
    },
  ];

  return (
    <>
      <LiveRefresh tables={["orders", "payments"]} />
      <StatRow items={stats} />
      <Panel>
        <PanelHeader title="All invoices" description={orders.length ? `${plural(orders.length, "invoice")}, newest first` : undefined} />
        {orders.length === 0 ? (
          <EmptyState title="No invoices yet." hint="Request a payment above, or ask the agent: ‘Invoice Meera Iyer ₹18,000 for website design, due in 7 days.’" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Due / paid</Th>
                <Th>Status</Th>
                <Th right>Amount</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((x) => {
                const c = x.customers as { name?: string; email?: string } | null;
                const days = lateDays.get(x.id) ?? 0;
                const late = lateDays.has(x.id);
                const paid = x.status === "paid";
                return (
                  <TableRow key={x.id} className={ROW}>
                    <Td className="figures text-xs">{invoiceNo(x)}</Td>
                    <Td>
                      <div className="font-medium">{c?.name ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">{c?.email}</div>
                    </Td>
                    <Td>
                      {paid ? (
                        <>
                          <div>Paid {shortDate(paidAt.get(x.id) ?? x.created_at)}</div>
                          <div className="text-muted-foreground text-xs">{dateTime(paidAt.get(x.id) ?? x.created_at)}</div>
                        </>
                      ) : x.due_date ? (
                        <>
                          <div>Due {shortDate(x.due_date)}</div>
                          <div className={late ? "text-destructive text-xs font-medium" : "text-muted-foreground text-xs"}>
                            {late ? `${plural(days, "day")} overdue` : `Raised ${shortDate(x.created_at)}`}
                          </div>
                        </>
                      ) : (
                        <>
                          <div>{shortDate(x.created_at)}</div>
                          <div className="text-muted-foreground text-xs">No due date</div>
                        </>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge value={late ? "overdue" : x.status} />
                    </Td>
                    <Td right className="font-medium">
                      {money(x.amount_minor, x.currency)}
                    </Td>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
