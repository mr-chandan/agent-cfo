import { Suspense } from "react";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, Initials, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, Td, Th, shortDate } from "@/components/app/ui-bits";
import { getCustomers, getOrders } from "@/lib/queries";
import { money } from "@/lib/format";

export default function CustomersPage() {
  return (
    <Page>
      <PageHeader eyebrow="Money" title="Customers" description="Everyone you’ve billed, how often, and how much they have spent with you." />
      <Suspense fallback={<PageSkeleton rows={6} />}>
        <List />
      </Suspense>
    </Page>
  );
}

async function List() {
  const [customers, orders] = await Promise.all([getCustomers(), getOrders()]);
  return (
    <Panel>
      <LiveRefresh tables={["customers", "orders"]} />
      <PanelHeader title="All customers" description={customers.length ? `${customers.length} on file, newest first` : undefined} />
      {customers.length === 0 ? (
        <EmptyState title="No customers yet." hint="A customer appears here the first time you invoice them. Try: ‘Invoice Meera Iyer ₹18,000, due in 7 days.’" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th>Customer</Th>
              <Th right>Orders</Th>
              <Th>Since</Th>
              <Th right>Total spent</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => {
              const mine = orders.filter((o) => o.customer_id === c.id);
              const spent = mine.reduce((s, o) => s + Number(o.amount_minor), 0);
              return (
                <TableRow key={c.id} className={ROW}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Initials name={c.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{String(c.name)}</div>
                        <div className="text-muted-foreground truncate text-xs">{String(c.email ?? "")}</div>
                      </div>
                    </div>
                  </Td>
                  <Td right>{mine.length}</Td>
                  <Td muted>{shortDate(c.created_at)}</Td>
                  <Td right className="font-medium">
                    {money(spent, "INR")}
                  </Td>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
