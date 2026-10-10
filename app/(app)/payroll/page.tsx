import { Suspense } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHeader, TableRow } from "@/components/ui/table";
import { LiveRefresh } from "@/components/app/live-refresh";
import { EmptyState, Initials, Page, PageHeader, PageSkeleton, Panel, PanelHeader, ROW, StatRow, StatusBadge, Td, Th, shortDate, type Stat } from "@/components/app/ui-bits";
import { admin } from "@/lib/supabase-admin";
import { money } from "@/lib/format";

type Employee = { id: string; name: string; email: string | null; designation: string | null; monthly_ctc_minor: number; state: string; active: boolean };
type Run = { id: string; period: string; status: string; total_gross_minor: number; total_net_minor: number; total_employer_cost_minor: number; paid_at: string | null };
type Slip = {
  id: string;
  gross_minor: number;
  pf_employee_minor: number;
  esi_employee_minor: number;
  pt_minor: number;
  tds_minor: number;
  net_minor: number;
  emailed: boolean;
  employees: { name: string; designation: string | null } | null;
};

const TABLES = ["employees", "payroll_runs", "payslips"];

export default function PayrollPage() {
  return (
    <Page>
      <PageHeader eyebrow="Team" title="Payroll" description="Salaries, statutory deductions and payslips. The agent prepares the run; nothing is paid until you approve it.">
        <Button asChild className="rounded-full px-4">
          <Link href="/">
            <Sparkles className="size-4" /> Prepare payroll with the agent
          </Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<PageSkeleton stats={3} rows={5} />}>
        <Payroll />
      </Suspense>
    </Page>
  );
}

function periodLabel(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) return period;
  return new Date(`${period}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function runSummary(run: Run | null): { value: string; sub: string; tone?: Stat["tone"] } {
  if (!run) return { value: "—", sub: "No payroll prepared yet" };
  if (run.status === "paid") return { value: periodLabel(run.period), sub: `Paid ${shortDate(run.paid_at)}`, tone: "good" };
  if (run.status === "approved") return { value: periodLabel(run.period), sub: "Approved · not paid yet", tone: "warn" };
  return { value: periodLabel(run.period), sub: "Draft · waiting for your approval", tone: "warn" };
}

async function Payroll() {
  const db = admin();
  const [emps, runs] = await Promise.all([
    db.from("employees").select("id,name,email,designation,monthly_ctc_minor,state,active").order("name"),
    db.from("payroll_runs").select("id,period,status,total_gross_minor,total_net_minor,total_employer_cost_minor,paid_at").order("period", { ascending: false }).limit(1),
  ]);
  const employees = (emps.data ?? []) as unknown as Employee[];
  const run = ((runs.data ?? [])[0] as unknown as Run | undefined) ?? null;
  const slips = run
    ? (((await db.from("payslips").select("id,gross_minor,pf_employee_minor,esi_employee_minor,pt_minor,tds_minor,net_minor,emailed,employees(name,designation)").eq("run_id", run.id)).data ??
        []) as unknown as Slip[])
    : [];
  slips.sort((a, b) => String(a.employees?.name ?? "").localeCompare(String(b.employees?.name ?? "")));

  const active = employees.filter((e) => e.active);
  const monthly = active.reduce((s, e) => s + Number(e.monthly_ctc_minor), 0);
  const last = runSummary(run);
  const stats: Stat[] = [
    { label: "Employees", value: String(active.length), sub: active.length ? `on payroll${employees.length > active.length ? ` · ${employees.length - active.length} inactive` : ""}` : "none yet" },
    { label: "Monthly payroll", value: money(monthly, "INR"), sub: "gross, before deductions" },
    { label: "Last run", value: last.value, sub: last.sub, tone: last.tone, plain: true },
  ];

  const sum = (k: keyof Slip) => slips.reduce((s, x) => s + Number(x[k] ?? 0), 0);
  const emailed = slips.filter((s) => s.emailed).length;

  return (
    <>
      <LiveRefresh tables={TABLES} />
      <StatRow items={stats} />

      <Panel>
        <PanelHeader title="Employees" description={employees.length ? "Gross monthly pay; deductions are worked out at each run" : undefined} />
        {employees.length === 0 ? (
          <EmptyState title="No employees yet." hint={"Ask the agent: 'Add Arjun Rao, designer, ₹60,000/month'"} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>State</Th>
                <Th right>Monthly pay</Th>
                <Th>Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id} className={ROW}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Initials name={e.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{e.name}</div>
                        <div className="text-muted-foreground truncate text-xs">{e.email || "No email on file"}</div>
                      </div>
                    </div>
                  </Td>
                  <Td muted>{e.designation || "—"}</Td>
                  <Td muted>{e.state}</Td>
                  <Td right className="font-medium">
                    {money(e.monthly_ctc_minor, "INR")}
                  </Td>
                  <Td>
                    <StatusBadge value={e.active ? "active" : "inactive"} />
                  </Td>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {run ? (
        <Panel>
          <PanelHeader
            title={
              <>
                Payroll · {periodLabel(run.period)} <StatusBadge value={run.status} />
              </>
            }
            description={`Net to pay ${money(run.total_net_minor, "INR")} · gross ${money(run.total_gross_minor, "INR")} · cost to company ${money(run.total_employer_cost_minor, "INR")}`}
          >
            <span className="text-muted-foreground text-xs">
              {slips.length ? `${emailed} of ${slips.length} payslips emailed` : "No payslips"}
            </span>
          </PanelHeader>
          {slips.length === 0 ? (
            <EmptyState title="No payslips in this run." hint="Ask the agent to prepare payroll again." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <Th>Employee</Th>
                  <Th right>Gross</Th>
                  <Th right>PF</Th>
                  <Th right>ESI</Th>
                  <Th right>PT</Th>
                  <Th right>TDS</Th>
                  <Th right>Net pay</Th>
                  <Th>Payslip</Th>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slips.map((s) => (
                  <TableRow key={s.id} className={ROW}>
                    <Td>
                      <div className="font-medium">{s.employees?.name ?? "—"}</div>
                      <div className="text-muted-foreground text-xs">{s.employees?.designation ?? ""}</div>
                    </Td>
                    <Td right>{money(s.gross_minor, "INR")}</Td>
                    <Td right muted>
                      {money(s.pf_employee_minor, "INR")}
                    </Td>
                    <Td right muted>
                      {money(s.esi_employee_minor, "INR")}
                    </Td>
                    <Td right muted>
                      {money(s.pt_minor, "INR")}
                    </Td>
                    <Td right muted>
                      {money(s.tds_minor, "INR")}
                    </Td>
                    <Td right className="font-semibold">
                      {money(s.net_minor, "INR")}
                    </Td>
                    <Td>
                      {s.emailed ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                          <Check className="size-3.5" /> Emailed
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">{run.status === "paid" ? "Not sent" : "After payment"}</span>
                      )}
                    </Td>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-4 py-3 pl-5 text-xs font-medium">Total</TableCell>
                  <TableCell className="figures px-4 py-3 text-right font-medium">{money(sum("gross_minor"), "INR")}</TableCell>
                  <TableCell className="figures text-muted-foreground px-4 py-3 text-right">{money(sum("pf_employee_minor"), "INR")}</TableCell>
                  <TableCell className="figures text-muted-foreground px-4 py-3 text-right">{money(sum("esi_employee_minor"), "INR")}</TableCell>
                  <TableCell className="figures text-muted-foreground px-4 py-3 text-right">{money(sum("pt_minor"), "INR")}</TableCell>
                  <TableCell className="figures text-muted-foreground px-4 py-3 text-right">{money(sum("tds_minor"), "INR")}</TableCell>
                  <TableCell className="figures px-4 py-3 text-right font-semibold">{money(sum("net_minor"), "INR")}</TableCell>
                  <TableCell className="px-4 py-3 pr-5" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
          <p className="text-muted-foreground border-t px-5 py-3 text-xs">
            PF, ESI, professional tax and TDS are statutory estimates. Review them with your accountant before approving.
          </p>
        </Panel>
      ) : (
        employees.length > 0 && (
          <Panel>
            <PanelHeader title="Latest payroll run" />
            <EmptyState title="No payroll prepared yet." hint={"Ask the agent: 'Prepare this month's payroll.' It drafts every payslip; nothing is paid until you approve."} />
          </Panel>
        )
      )}
    </>
  );
}
