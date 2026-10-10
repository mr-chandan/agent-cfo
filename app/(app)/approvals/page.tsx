import { Suspense } from "react";
import Link from "next/link";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { ApprovalActions } from "@/components/app/approval-actions";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, StatusBadge, Td, Th, agentName, toolLabel } from "@/components/app/ui-bits";
import { getApprovals, type Row } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";

export default function ApprovalsPage() {
  return (
    <Page>
      <PageHeader eyebrow="Control" title="Approvals" description="When the agent wants to do something risky, it stops here and waits for you." />
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <List />
      </Suspense>
    </Page>
  );
}

const amountOf = (a: Row) => (a.input as { amountMinor?: number } | null)?.amountMinor;

async function List() {
  const all = await getApprovals();
  const pending = all.filter((a) => a.status === "pending");
  const done = all.filter((a) => a.status !== "pending");
  return (
    <>
      <LiveRefresh tables={["approvals"]} />
      <Panel>
        <PanelHeader
          title={
            <>
              {pending.length > 0 && <span className="bg-primary size-2 animate-pulse rounded-full" />}
              Waiting for you{pending.length > 0 && ` · ${pending.length}`}
            </>
          }
          description="Approving runs the action exactly as shown. Denying cancels it."
        />
        {pending.length === 0 ? (
          <EmptyState title="Nothing is waiting." hint="The agent is working within its limits. Anything risky will stop here first." />
        ) : (
          <ul className="divide-y">
            {pending.map((a) => {
              const amt = amountOf(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{toolLabel(a.tool)}</span>
                      <span className="text-muted-foreground text-xs">{agentName(a.tool)}</span>
                    </div>
                    {amt ? <div className="figures text-xl font-semibold tracking-tight">{money(amt, "INR")}</div> : null}
                    <p className="text-muted-foreground text-xs">Why it stopped: {String(a.reason)}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {dateTime(a.created_at)}
                      {a.dispute_id ? (
                        <>
                          {" · "}
                          <Link href={`/disputes/${a.dispute_id}`} className="hover:text-foreground underline underline-offset-4">
                            View case
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <ApprovalActions id={a.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Past decisions" description="Approved actions ran as shown. Denied ones never did." />
        {done.length === 0 ? (
          <EmptyState title="No decisions yet." hint="Everything you approve or deny is kept here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th>Decided</Th>
                <Th>Action</Th>
                <Th right>Amount</Th>
                <Th>Decision</Th>
                <Th>Case</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {done.map((a) => {
                const amt = amountOf(a);
                return (
                  <TableRow key={a.id} className={ROW}>
                    <Td muted className="whitespace-nowrap">
                      {dateTime(a.decided_at ?? a.created_at)}
                    </Td>
                    <Td>
                      <div className="font-medium">{toolLabel(a.tool)}</div>
                      <div className="text-muted-foreground text-xs">{agentName(a.tool)}</div>
                    </Td>
                    <Td right>{amt ? money(amt, "INR") : "—"}</Td>
                    <Td>
                      <StatusBadge value={a.status} />
                    </Td>
                    <Td>
                      {a.dispute_id ? (
                        <Link href={`/disputes/${a.dispute_id}`} className="text-sm underline underline-offset-4">
                          Open
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
