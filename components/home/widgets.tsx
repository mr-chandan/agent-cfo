"use client";

import { useMemo, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, FileText, Landmark, ShieldCheck, Sparkles, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, XAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { CARD_SHADOW, SectionEyebrow } from "@/components/home/bits";
import { TOOL_LABEL } from "@/components/app/ui-bits";
import { type AgentName } from "@/lib/agent/agents";
import { money } from "@/lib/format";
import type { HomeData } from "@/lib/queries";
import { cn } from "@/lib/utils";

// Overview numbers arrive in rupees; `money` takes paise.
const inr = (rupees: number) => money(Math.round(rupees * 100), "INR");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Gateway tool names carry a server prefix (ops_finance_summary); strip it so TOOL_LABEL matches.
const toolName = (t: unknown) => {
  const s = String(t ?? "").replace(/^ops[._]/, "");
  return TOOL_LABEL[s] ? s : s.replace(/^finance[._]/, "");
};

/* ------------------------------------------------------------------ */
/* Ask about this                                                      */
/* ------------------------------------------------------------------ */

/** Short on the chip, the full question when it is asked. */
const ASK_ABOUT_THIS = [
  { label: "How much did we earn?", prompt: "How much have we earned, and what GST do we owe?" },
  { label: "Who owes us money?", prompt: "Which invoices are unpaid or overdue? Include ones not yet due." },
  { label: "Is payroll ready?", prompt: "Who is on payroll and what will this month's payroll cost?" },
];

export function AskAboutThis({ onAsk }: { onAsk: (prompt: string) => void }) {
  return (
    <div className="space-y-3">
      <SectionEyebrow>Ask about this</SectionEyebrow>
      <div className="flex flex-wrap gap-2 px-1">
        {ASK_ABOUT_THIS.map(({ label, prompt }) => (
          <Button key={label} type="button" variant="outline" size="sm" className="rounded-full font-normal" onClick={() => onAsk(prompt)}>
            <Sparkles className="text-primary" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared card shell                                                   */
/* ------------------------------------------------------------------ */

function Widget({
  icon: Icon,
  title,
  badge,
  corner,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  corner?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cn("bg-card flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border p-4", CARD_SHADOW)}>
      <header className="flex h-7 shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-3.5 shrink-0" />
          <h3 className="text-muted-foreground truncate text-xs font-medium">{title}</h3>
          {badge && (
            <Badge variant="secondary" className="h-4 shrink-0 px-1.5 py-0 text-[10px]">
              {badge}
            </Badge>
          )}
        </div>
        {corner}
      </header>
      <div className="flex min-h-0 flex-1 flex-col pt-2">{children}</div>
      {action && <div className="flex shrink-0 items-center justify-end pt-3">{action}</div>}
    </section>
  );
}

/** Corner arrow: the whole card's question, put to the agent. */
function CornerAsk({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-[3px]"
    >
      <ArrowUpRight className="size-4" />
    </button>
  );
}

function Pill({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button type="button" size="sm" className="rounded-full" onClick={onClick}>
      {children}
    </Button>
  );
}

function BigFigure({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("figures text-2xl leading-none font-semibold tracking-tight", className)}>{children}</div>;
}

function Quiet({ icon: Icon, title, line }: { icon: ComponentType<{ className?: string }>; title: string; line?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
      <Icon className="text-muted-foreground size-4" />
      <p className="text-sm font-medium">{title}</p>
      {line && <p className="text-muted-foreground text-xs">{line}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Collected                                                           */
/* ------------------------------------------------------------------ */

const collectedConfig = {
  collected: { label: "Collected", color: "var(--chart-2)" },
} satisfies ChartConfig;

const dayNumber = (day: string) => String(Number(day.slice(8, 10)) || day);
const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function CollectedWidget({ data, onAsk }: { data: HomeData; onAsk: (prompt: string) => void }) {
  const chart = useMemo(() => data.chart.slice(-10), [data.chart]);
  return (
    <Widget
      icon={TrendingUp}
      title="Collected"
      badge="this month"
      corner={<CornerAsk label="Ask about collections" onClick={() => onAsk("How much have we earned this month?")} />}
    >
      <BigFigure>{inr(data.collected)}</BigFigure>
      {chart.length === 0 ? (
        <Quiet icon={TrendingUp} title="No payments yet" line="Invoice a customer to see money come in." />
      ) : (
        <ChartContainer config={collectedConfig} className="mt-3 aspect-auto min-h-0 w-full flex-1">
          <BarChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis dataKey="day" tickLine={false} axisLine={false} interval={0} height={16} tickMargin={4} tick={{ fontSize: 10 }} tickFormatter={dayNumber} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(v) => dayLabel(String(v))}
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">Collected</span>
                      <span className="figures font-medium">{inr(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="collected" fill="var(--color-collected)" radius={10} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      )}
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* To collect                                                          */
/* ------------------------------------------------------------------ */

function dueLabel(inv: HomeData["invoices"][number]) {
  if (!inv.dueDate) return { text: "no due date", overdue: false };
  const d = inv.daysOverdue;
  if (d > 0) return { text: `${plural(d, "day")} overdue`, overdue: true };
  if (d === 0) return { text: "due today", overdue: false };
  return { text: `due in ${plural(-d, "day")}`, overdue: false };
}

function ToCollectWidget({ data, onAsk }: { data: HomeData; onAsk: (prompt: string) => void }) {
  const overdue = data.overdueInvoices > 0;
  return (
    <Widget
      icon={FileText}
      title="To collect"
      badge={overdue ? `${data.overdueInvoices} overdue` : undefined}
      action={overdue ? <Pill onClick={() => onAsk("Which invoices are overdue? Send a firm reminder for each.")}>Send reminders</Pill> : undefined}
    >
      <BigFigure>{inr(data.receivable)}</BigFigure>
      {data.invoices.length === 0 ? (
        <Quiet icon={FileText} title="No open invoices" line="Everything sent has been paid." />
      ) : (
        <ul className="-mx-1 mt-2 min-h-0 flex-1 divide-y overflow-y-auto px-1">
          {data.invoices.map((inv) => {
            const due = dueLabel(inv);
            return (
              <li key={inv.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{inv.customer || "Customer"}</div>
                  <div className="text-muted-foreground truncate text-[11px]">
                    {inv.number && (
                      <>
                        <span className="figures">{inv.number}</span>
                        {" · "}
                      </>
                    )}
                    <span className={cn(due.overdue && "text-destructive font-medium")}>{due.text}</span>
                  </div>
                </div>
                <span className="figures shrink-0 text-sm font-semibold">{money(inv.amountMinor, "INR")}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* GST                                                                 */
/* ------------------------------------------------------------------ */

function GstWidget({ data, onAsk }: { data: HomeData; onAsk: (prompt: string) => void }) {
  return (
    <Widget icon={Landmark} title="GST payable" action={<Pill onClick={() => onAsk("Show our GST portal balances for this month.")}>Check GST portal</Pill>}>
      <BigFigure>{inr(data.estGst)}</BigFigure>
      <p className="text-muted-foreground mt-1.5 text-xs">18% included in prices · estimate</p>
      <dl className="mt-auto grid grid-cols-2 gap-x-4 pt-3">
        <div>
          <dt className="text-muted-foreground text-[11px]">Net sales</dt>
          <dd className="figures text-sm font-semibold">{inr(data.net)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px]">Refunded</dt>
          <dd className="figures text-sm font-semibold">{inr(data.refunded)}</dd>
        </div>
      </dl>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Payroll                                                             */
/* ------------------------------------------------------------------ */

function PayrollWidget({ data, onAsk }: { data: HomeData; onAsk: (prompt: string) => void }) {
  const { employees, monthlyMinor } = data.payroll;
  const empty = employees === 0;
  return (
    <Widget
      icon={Users}
      title="Payroll"
      badge={empty ? undefined : "monthly"}
      action={
        empty ? (
          <Pill onClick={() => onAsk("Add an employee to payroll.")}>Add your first employee</Pill>
        ) : (
          <Pill onClick={() => onAsk("Prepare this month's payroll.")}>Prepare payroll</Pill>
        )
      }
    >
      {empty ? (
        <Quiet icon={Users} title="No one on payroll yet" line="Add people and the Payroll agent handles salaries, PF and TDS." />
      ) : (
        <>
          <BigFigure>{money(monthlyMinor, "INR")}</BigFigure>
          <p className="text-muted-foreground mt-1.5 text-xs">
            <span className="figures">{employees}</span> {employees === 1 ? "person" : "people"} on payroll
          </p>
          <dl className="mt-auto grid grid-cols-2 gap-x-4 pt-3">
            <div>
              <dt className="text-muted-foreground text-[11px]">Per person</dt>
              <dd className="figures text-sm font-semibold">{money(Math.round(monthlyMinor / employees), "INR")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-[11px]">Includes</dt>
              <dd className="text-sm font-medium">PF, ESI and TDS</dd>
            </div>
          </dl>
        </>
      )}
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Your agents                                                         */
/* ------------------------------------------------------------------ */

const AGENTS: { name: AgentName; dot: string; blurb: string }[] = [
  { name: "Collections", dot: "bg-emerald-500", blurb: "Invoices and reminders" },
  { name: "Disputes", dot: "bg-violet-500", blurb: "Refunds and evidence" },
  { name: "Payroll", dot: "bg-rose-500", blurb: "Salaries and payslips" },
  { name: "GST", dot: "bg-sky-500", blurb: "Estimates and portal balances" },
  { name: "Payouts", dot: "bg-amber-500", blurb: "Vendor payments" },
];

function AgentsWidget({ data }: { data: HomeData }) {
  return (
    <Widget icon={Bot} title="Your agents">
      <ul className="flex flex-1 flex-col justify-between">
        {AGENTS.map((a) => {
          const n = data.today.perAgent[a.name] ?? 0;
          return (
            <li key={a.name} className="flex items-center gap-2.5 py-1">
              <span className={cn("size-2 shrink-0 rounded-full", a.dot)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="text-muted-foreground truncate text-[11px]">{a.blurb}</div>
              </div>
              <span className={cn("shrink-0 text-[11px]", n > 0 ? "figures text-foreground font-medium" : "text-muted-foreground")}>
                {n > 0 ? `${plural(n, "action")} today` : "idle"}
              </span>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Protection                                                          */
/* ------------------------------------------------------------------ */

function ProtectionWidget({ data }: { data: HomeData }) {
  const { allow, held, blocked } = data.today;
  // Audit rows arrive newest first; the first held/blocked one is the latest exception.
  const last = data.audit.find((e) => e.decision === "block" || e.decision === "escalate");
  const lastTool = last ? toolName(last.tool) : "";
  const stats = [
    { k: "Allowed", v: allow, className: "" },
    { k: "Held", v: held, className: "text-brand-text" },
    { k: "Blocked", v: blocked, className: "text-destructive" },
  ];
  return (
    <Widget icon={ShieldCheck} title="Protected by AgntID" badge="today">
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.k}>
            <dt className="text-muted-foreground text-[11px]">{s.k}</dt>
            <dd className={cn("figures mt-0.5 text-2xl leading-none font-semibold tracking-tight", s.className)}>{s.v}</dd>
          </div>
        ))}
      </dl>
      {last ? (
        <div className="bg-muted/60 mt-3 min-h-0 rounded-lg px-3 py-2">
          <p className={cn("text-[11px] font-medium", last.decision === "block" ? "text-destructive" : "text-brand-text")}>
            Last {last.decision === "block" ? "blocked" : "held"}
            {lastTool && <span className="text-muted-foreground font-normal"> · {TOOL_LABEL[lastTool] ?? lastTool.replace(/_/g, " ")}</span>}
          </p>
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{String(last.reason ?? "No reason recorded")}</p>
        </div>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs">Nothing has needed holding or blocking.</p>
      )}
      <Link
        href="/audit"
        className="text-muted-foreground hover:text-foreground mt-auto inline-flex items-center gap-1 pt-3 text-[11px] underline-offset-2 transition-colors hover:underline"
      >
        Every action is checked before it runs
        <ArrowUpRight className="size-3" />
      </Link>
    </Widget>
  );
}

/* ------------------------------------------------------------------ */
/* Grid                                                                */
/* ------------------------------------------------------------------ */

export function HomeWidgets({ data, onAsk }: { data: HomeData; onAsk: (prompt: string) => void }) {
  return (
    <div className="grid auto-rows-[270px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
      <div className="h-full">
        <CollectedWidget data={data} onAsk={onAsk} />
      </div>
      <div className="h-full">
        <ToCollectWidget data={data} onAsk={onAsk} />
      </div>
      <div className="h-full">
        <GstWidget data={data} onAsk={onAsk} />
      </div>
      <div className="h-full">
        <PayrollWidget data={data} onAsk={onAsk} />
      </div>
      <div className="h-full">
        <AgentsWidget data={data} />
      </div>
      <div className="h-full">
        <ProtectionWidget data={data} />
      </div>
    </div>
  );
}
