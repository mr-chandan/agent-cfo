import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableHead } from "@/components/ui/table";
import { SectionEyebrow } from "@/components/home/bits";
import { TOOL_AGENT } from "@/lib/agent/agents";
import { cn } from "@/lib/utils";

/* ---------- status ---------- */

const TONES: Record<string, string> = {
  green: "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  red: "bg-red-500/12 text-red-700 dark:bg-red-400/15 dark:text-red-300",
  amber: "bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  blue: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  gray: "bg-muted text-muted-foreground",
};

const STATUS_TONE: Record<string, keyof typeof TONES> = {
  paid: "green",
  allow: "green",
  approved: "green",
  resolved: "green",
  done: "green",
  charge: "green",
  active: "green",
  refunded: "amber",
  partially_refunded: "amber",
  escalate: "amber",
  pending: "amber",
  awaiting_approval: "amber",
  awaiting_customer: "amber",
  refund: "amber",
  open: "blue",
  investigating: "blue",
  overdue: "red",
  failed: "red",
  block: "red",
  denied: "red",
  rejected: "red",
  error: "red",
  draft: "gray",
  inactive: "gray",
};

const LABEL: Record<string, string> = {
  allow: "Allowed",
  block: "Blocked",
  escalate: "Held for approval",
  error: "Error",
  partially_refunded: "Partly refunded",
  awaiting_approval: "Awaiting approval",
  awaiting_customer: "Awaiting customer",
};

export function StatusBadge({ value, className }: { value: unknown; className?: string }) {
  const v = String(value ?? "");
  const tone = STATUS_TONE[v] ?? "gray";
  const label = LABEL[v] ?? v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium whitespace-nowrap", TONES[tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

/* ---------- page chrome ---------- */

/** Vertical rhythm for a secondary page; the app layout only pads, it does not space. */
export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-6", className)} {...props} />;
}

/** Title block for every secondary page: section eyebrow, title, one muted line, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="-mx-1 mb-1.5">
            <SectionEyebrow>{eyebrow}</SectionEyebrow>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description && <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Card surface. Mirrors CARD_SHADOW in components/home/bits, which is a client module and so can't lend a string constant to server pages. */
export const CARD =
  "rounded-2xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-6px_rgb(0_0_0/0.10)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_6px_16px_-6px_rgb(0_0_0/0.5)]";

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn(CARD, "overflow-hidden", className)} {...props} />;
}

export function PanelHeader({ title, description, children }: { title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{title}</h2>
        {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/* ---------- stats ---------- */

/** `plain` keeps a wordy value (a month, a status) out of the tabular-figures face. */
export type Stat = { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad"; plain?: boolean };

const COLS: Record<number, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 xl:grid-cols-4" };
const SUB_TONE: Record<NonNullable<Stat["tone"]>, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-brand-text",
  bad: "text-destructive",
};

/** One strip of big tabular figures. Hairlines between cells come from the gap, so any wrap stays tidy. */
export function StatRow({ items }: { items: Stat[] }) {
  return (
    <div className={cn(CARD, "bg-border grid grid-cols-1 gap-px overflow-hidden", COLS[items.length] ?? "sm:grid-cols-3")}>
      {items.map((it) => (
        <div key={it.label} className="bg-card px-5 py-4">
          <div className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{it.label}</div>
          <div className={cn("mt-1 text-2xl font-semibold tracking-tight", !it.plain && "figures")}>{it.value}</div>
          {it.sub && <div className={cn("mt-0.5 text-[11px]", it.tone ? cn("font-medium", SUB_TONE[it.tone]) : "text-muted-foreground")}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ---------- tables ---------- */

export const ROW = "hover:bg-muted/40";

export function Th({ right, className, ...props }: React.ComponentProps<"th"> & { right?: boolean }) {
  return (
    <TableHead
      className={cn("text-muted-foreground h-10 px-4 text-[11px] font-medium tracking-wide uppercase first:pl-5 last:pr-5", right && "text-right", className)}
      {...props}
    />
  );
}

export function Td({ right, muted, className, ...props }: React.ComponentProps<"td"> & { right?: boolean; muted?: boolean }) {
  return <TableCell className={cn("px-4 py-3 first:pl-5 last:pr-5", right && "figures text-right", muted && "text-muted-foreground", className)} {...props} />;
}

export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-muted-foreground max-w-md text-sm text-balance">{hint}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function PageSkeleton({ stats = 0, rows = 6 }: { stats?: number; rows?: number }) {
  return (
    <>
      {stats > 0 && (
        <div className={cn(CARD, "bg-border grid grid-cols-1 gap-px overflow-hidden", COLS[stats] ?? "sm:grid-cols-3")}>
          {Array.from({ length: stats }, (_, i) => (
            <div key={i} className="bg-card space-y-2 px-5 py-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      )}
      <div className={cn(CARD, "space-y-3 p-5")}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </>
  );
}

/** Initials in a soft gold disc; two letters from the first and last name. */
export function Initials({ name, className }: { name: unknown; className?: string }) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const text = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-primary/20 text-foreground text-[11px] font-semibold">{text}</AvatarFallback>
    </Avatar>
  );
}

/* ---------- dates ---------- */

export function shortDate(v: unknown) {
  if (!v) return "";
  return new Date(String(v)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------- tools ---------- */

export const TOOL_LABEL: Record<string, string> = {
  list_customer_orders: "Looked up customer orders",
  get_order: "Looked up an order",
  issue_refund: "Issued a refund",
  create_payout: "Sent a payout",
  update_beneficiary: "Changed payout bank details",
  send_message: "Emailed the customer",
  gst_estimate: "Estimated GST",
  add_customer: "Added a customer",
  add_employee: "Added an employee",
  list_employees: "Checked the team",
  prepare_payroll: "Prepared payroll",
  run_payroll: "Paid salaries",
  list_overdue_invoices: "Checked overdue invoices",
  send_payment_reminder: "Sent a payment reminder",
  verify_payment: "Verified a payment with the gateway",
  list_beneficiaries: "Checked payout beneficiaries",
  request_bank_change: "Opened a bank-change verification",
  build_evidence_pack: "Built a dispute evidence pack",
  find_customer: "Found a customer",
  request_payment: "Created a payment request",
  list_disputes: "Checked open disputes",
  finance_summary: "Checked the finance totals",
  gst_taxpayer_lookup: "Looked up a GST registration",
  gst_ledger_balance: "Checked GST portal balances",
  prepare_gstr1: "Prepared GSTR-1",
  prepare_gstr3b: "Prepared GSTR-3B",
  file_gst_return: "Filed a GST return",
};

/** Gateway names carry a server prefix (ops_finance_summary, finance_get_order). Strip `ops`, then `finance` unless that is the real name. */
export function toolKey(t: unknown) {
  const s = String(t ?? "").replace(/^ops[._]/, "");
  return TOOL_LABEL[s] || TOOL_AGENT[s] ? s : s.replace(/^finance[._]/, "");
}

export function toolLabel(t: unknown) {
  const k = toolKey(t);
  return TOOL_LABEL[k] ?? k.replace(/_/g, " ");
}

export function agentName(t: unknown) {
  const a = TOOL_AGENT[toolKey(t)];
  return a ? `${a} agent` : "Agent";
}
