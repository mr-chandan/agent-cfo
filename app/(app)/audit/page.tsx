import { Suspense } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, Hand } from "lucide-react";
import { Table, TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, StatRow, StatusBadge, Td, Th, agentName, toolLabel, type Stat } from "@/components/app/ui-bits";
import { getAudit, type Row } from "@/lib/queries";
import { dateTime, money } from "@/lib/format";
import { PAYOUT_CAP_MINOR, REFUND_LIMIT_MINOR } from "@/lib/agent/policy";

export default function AuditPage() {
  return (
    <Page>
      <PageHeader eyebrow="Control" title="Audit log" description="A permanent record of every action the agent tried, and what access control decided." />
      <Suspense fallback={<PageSkeleton stats={3} rows={8} />}>
        <Log />
      </Suspense>
    </Page>
  );
}

type Verdict = "allow" | "escalate" | "block";

const RULE_ICON: Record<Verdict, React.ReactNode> = {
  allow: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
  escalate: <Hand className="size-4 text-amber-600 dark:text-amber-400" />,
  block: <Ban className="size-4 text-red-600 dark:text-red-400" />,
};

const RULES: { verdict: Verdict; text: string }[] = [
  { verdict: "allow", text: "Look up orders and customers, but only for the customer on the open case" },
  { verdict: "allow", text: `Refund up to ${money(REFUND_LIMIT_MINOR, "INR")} on its own` },
  { verdict: "allow", text: "Send routine reminders and customer emails, with sensitive details masked" },
  { verdict: "escalate", text: `Refund above ${money(REFUND_LIMIT_MINOR, "INR")}: waits for you` },
  { verdict: "escalate", text: `Payout above ${money(PAYOUT_CAP_MINOR, "INR")}: waits for you` },
  { verdict: "escalate", text: "Pay salaries: always waits for you" },
  { verdict: "block", text: "Pay anyone who is not on the approved list" },
  { verdict: "block", text: "Change payout bank details, ever" },
];

const amountOf = (e: Row) => (e.input as { amountMinor?: number } | null)?.amountMinor;

async function Log() {
  const events = await getAudit(150);
  const count = (d: string) => events.filter((e) => e.decision === d).length;
  const of = events.length ? `of the last ${events.length} actions` : "no actions yet";
  const stats: Stat[] = [
    { label: "Allowed", value: String(count("allow")), sub: of, tone: "good" },
    { label: "Held for approval", value: String(count("escalate")), sub: count("escalate") ? "stopped until a person said yes" : of, tone: count("escalate") ? "warn" : undefined },
    { label: "Blocked", value: String(count("block")), sub: count("block") ? "refused before anything ran" : of, tone: count("block") ? "bad" : undefined },
  ];

  return (
    <>
      <LiveRefresh tables={["audit_log"]} />
      <StatRow items={stats} />

      <Panel>
        <PanelHeader title="The rules in force" description="What the agent may do on its own, what waits for you, and what it can never do." />
        <ul className="grid gap-x-8 gap-y-2.5 px-5 py-4 text-sm sm:grid-cols-2">
          {RULES.map((r) => (
            <li key={r.text} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">{RULE_ICON[r.verdict]}</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader title="Every action" description="Newest first. Updates live." />
        {events.length === 0 ? (
          <EmptyState title="No agent activity yet." hint="Ask the agent something on the home screen and every step will be recorded here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th>When</Th>
                <Th>Action</Th>
                <Th right>Amount</Th>
                <Th>Decision</Th>
                <Th>Why</Th>
                <Th>Case</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const amt = amountOf(e);
                const human = String(e.agent) === "human";
                return (
                  <TableRow key={e.id} className={ROW}>
                    <Td muted className="whitespace-nowrap">
                      {dateTime(e.created_at)}
                    </Td>
                    <Td>
                      <div className="font-medium">{toolLabel(e.tool)}</div>
                      <div className="text-muted-foreground text-xs">{human ? "Decided by a person" : agentName(e.tool)}</div>
                    </Td>
                    <Td right>{amt ? money(amt, "INR") : "—"}</Td>
                    <Td>
                      <StatusBadge value={e.decision} />
                    </Td>
                    <Td muted className="max-w-sm whitespace-normal">
                      {String(e.reason ?? "")}
                    </Td>
                    <Td>
                      {e.dispute_id ? (
                        <Link href={`/disputes/${e.dispute_id}`} className="text-sm underline underline-offset-4">
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
