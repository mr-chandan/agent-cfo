import { Ban, CheckCircle2, Hand, Mail, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, agentName, toolLabel } from "@/components/app/ui-bits";
import { dateTime, money } from "@/lib/format";
import type { Row } from "@/lib/queries";

type Tone = "allow" | "block" | "escalate" | "error" | "info" | "quiet";

const DISC: Record<Tone, string> = {
  allow: "border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400",
  block: "border-red-300 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400",
  escalate: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  error: "border-border text-muted-foreground",
  info: "border-sky-300 text-sky-600 dark:border-sky-800 dark:text-sky-400",
  quiet: "border-dashed text-muted-foreground",
};

const ICON: Record<Tone, React.ReactNode> = {
  allow: <CheckCircle2 className="size-4" />,
  block: <Ban className="size-4" />,
  escalate: <Hand className="size-4" />,
  error: <ShieldAlert className="size-4" />,
  info: <Mail className="size-4" />,
  quiet: <Sparkles className="size-4" />,
};

function detail(input: unknown) {
  const i = (input ?? {}) as { amountMinor?: number; accountRef?: string; channel?: string };
  const bits: string[] = [];
  if (i.amountMinor) bits.push(money(i.amountMinor, "INR"));
  if (i.accountRef) bits.push(`new account ${i.accountRef}`);
  if (i.channel) bits.push(`via ${i.channel}`);
  return bits.join(" · ");
}

// Timeline of what the agent did on a case, oldest first, with the access-control verdict on each step.
export function AgentTrace({ events, trigger }: { events: Row[]; trigger: { channel: string; text: string; at: string } }) {
  const steps = [...events].reverse();
  return (
    <ol>
      <Step tone="info" title={`Customer complaint · ${trigger.channel}`} time={dateTime(trigger.at)} last={steps.length === 0}>
        <p className="text-muted-foreground line-clamp-3 text-xs">{trigger.text}</p>
      </Step>
      {steps.length === 0 && (
        <Step tone="quiet" title="Nothing done yet" last>
          <p className="text-muted-foreground text-xs">Ask the agent to look into this case. Every step will appear here.</p>
        </Step>
      )}
      {steps.map((e, i) => {
        const tone = (String(e.decision) in DISC ? String(e.decision) : "error") as Tone;
        const human = String(e.agent) === "human";
        return (
          <Step
            key={e.id}
            tone={tone}
            title={toolLabel(e.tool)}
            badge={<StatusBadge value={e.decision} />}
            meta={human ? "Decided by a person" : `${agentName(e.tool)} · checked by access control`}
            time={dateTime(e.created_at)}
            last={i === steps.length - 1}
          >
            {detail(e.input) && <p className="figures text-xs font-medium">{detail(e.input)}</p>}
            {e.reason ? <p className="text-muted-foreground text-xs">{String(e.reason)}</p> : null}
          </Step>
        );
      })}
    </ol>
  );
}

function Step({
  tone,
  title,
  badge,
  meta,
  time,
  children,
  last,
}: {
  tone: Tone;
  title: string;
  badge?: React.ReactNode;
  meta?: string;
  time?: string;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span aria-hidden className="bg-border absolute top-8 bottom-0 left-[15px] w-px" />}
      <span className={cn("bg-card relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border", DISC[tone])}>{ICON[tone]}</span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          {badge}
        </div>
        <div className="mt-0.5 space-y-0.5">{children}</div>
        {(meta || time) && (
          <p className="text-muted-foreground mt-1 text-[11px]">
            {meta}
            {meta && time ? " · " : ""}
            {time}
          </p>
        )}
      </div>
    </li>
  );
}
