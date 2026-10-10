import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, StatusBadge, Td, Th, shortDate } from "@/components/app/ui-bits";
import { getDisputes } from "@/lib/queries";
import { money } from "@/lib/format";

const CLOSED = new Set(["resolved", "rejected"]);

export default function DisputesPage() {
  return (
    <Page>
      <PageHeader eyebrow="Support" title="Disputes" description="Customer complaints. Open one and let the agent investigate; it can only act within your rules." />
      <Suspense fallback={<PageSkeleton rows={5} />}>
        <List />
      </Suspense>
    </Page>
  );
}

async function List() {
  const disputes = await getDisputes();
  const open = disputes.filter((d) => !CLOSED.has(String(d.status))).length;
  return (
    <Panel>
      <LiveRefresh tables={["disputes"]} />
      <PanelHeader title="All cases" description={disputes.length ? `${open} open · ${disputes.length - open} closed` : undefined} />
      {disputes.length === 0 ? (
        <EmptyState title="No disputes." hint="When a customer complains by email, chat or WhatsApp, the case lands here for the agent to work on." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <Th>Customer</Th>
              <Th>Complaint</Th>
              <Th>Channel</Th>
              <Th>Opened</Th>
              <Th right>Order</Th>
              <Th>Status</Th>
              <Th className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {disputes.map((d) => {
              const c = d.customers as { name?: string; email?: string } | null;
              const o = d.orders as { amount_minor?: number; currency?: string } | null;
              const href = `/disputes/${d.id}`;
              return (
                <TableRow key={d.id} className={ROW}>
                  <Td>
                    <Link href={href} className="font-medium underline-offset-4 hover:underline">
                      {c?.name ?? "—"}
                    </Link>
                    <div className="text-muted-foreground text-xs">{c?.email}</div>
                  </Td>
                  <Td className="max-w-sm">
                    <span className="block truncate">{String(d.reason)}</span>
                  </Td>
                  <Td className="capitalize" muted>
                    {String(d.channel)}
                  </Td>
                  <Td muted>{shortDate(d.opened_at)}</Td>
                  <Td right>{o ? money(o.amount_minor, o.currency) : "—"}</Td>
                  <Td>
                    <StatusBadge value={d.status} />
                  </Td>
                  <Td>
                    <Link href={href} aria-label="Open case" className="text-muted-foreground hover:text-foreground inline-flex">
                      <ChevronRight className="size-4" />
                    </Link>
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
