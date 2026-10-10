"use client";

import { useId } from "react";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimeOfDay = "morning" | "afternoon" | "evening";
export function timeOfDay(d = new Date()): TimeOfDay {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/** Small-caps section label; `urgent` adds the pulsing gold dot. */
export function SectionEyebrow({ children, urgent, action }: { children: React.ReactNode; urgent?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className={cn("flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase", urgent ? "text-brand-text" : "text-muted-foreground")}>
        {urgent && <span className="bg-primary size-1.5 animate-pulse rounded-full" />}
        {children}
      </p>
      {action}
    </div>
  );
}

export const CARD_SHADOW =
  "shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_16px_-6px_rgb(0_0_0/0.10)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_6px_16px_-6px_rgb(0_0_0/0.5)]";

export interface Starter {
  icon: LucideIcon;
  title: string;
  description: string;
  prompt: string;
  tone?: "default" | "danger";
}

/** One small card; the whole card asks the agent. */
export function StarterCard({ card, onPick }: { card: Starter; onPick: (prompt: string) => void }) {
  const Icon = card.icon;
  const danger = card.tone === "danger";
  return (
    <button
      type="button"
      onClick={() => onPick(card.prompt)}
      className={cn(
        "group bg-card hover:bg-muted/40 focus-visible:ring-ring/50 flex h-full w-full cursor-pointer flex-col items-start rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-[3px]",
        CARD_SHADOW,
        danger && "border-destructive/30",
      )}
    >
      <span className="flex w-full items-start justify-between">
        <span className={cn("flex size-8 items-center justify-center rounded-lg border", danger ? "bg-destructive/10 text-destructive" : "bg-muted")}>
          <Icon className="size-4" />
        </span>
        <ArrowUpRight className="text-muted-foreground/60 group-hover:text-foreground size-4 transition-colors" />
      </span>
      <span className="mt-3 text-sm font-semibold">{card.title}</span>
      <span className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{card.description}</span>
    </button>
  );
}

/** Nothing needs the owner: a sun over hills, in the colours of the time of day. */
export function AllClearCard({ time, title = "All clear", line = "Nothing needs your signature" }: { time: TimeOfDay; title?: string; line?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div data-time={time} className="all-clear-scene relative h-[150px] overflow-hidden rounded-[22px] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-24px_rgb(200_140_0/0.35)] sm:h-[132px] dark:ring-1 dark:ring-white/10">
      <svg viewBox="0 0 576 220" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 size-full">
        <defs>
          <linearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--sky-1)" }} />
            <stop offset=".55" style={{ stopColor: "var(--sky-2)" }} />
            <stop offset="1" style={{ stopColor: "var(--sky-3)" }} />
          </linearGradient>
          <radialGradient id={`${id}glow`}>
            <stop offset="0" style={{ stopColor: "var(--sun)", stopOpacity: 0.55 }} />
            <stop offset=".45" style={{ stopColor: "var(--sun)", stopOpacity: 0.18 }} />
            <stop offset="1" style={{ stopColor: "var(--sun)", stopOpacity: 0 }} />
          </radialGradient>
          <radialGradient id={`${id}core`} cx=".42" cy=".38" r=".7">
            <stop offset="0" style={{ stopColor: "var(--sun-hi)" }} />
            <stop offset="1" style={{ stopColor: "var(--sun)" }} />
          </radialGradient>
          <linearGradient id={`${id}water`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--water-1)" }} />
            <stop offset="1" style={{ stopColor: "var(--water-2)" }} />
          </linearGradient>
          <clipPath id={`${id}clip`}>
            <rect width="576" height="152" />
          </clipPath>
        </defs>
        <rect width="576" height="220" fill={`url(#${id}sky)`} />
        <g clipPath={`url(#${id}clip)`}>
          <g transform="translate(62,0)">
            <g className="all-clear-sun">
              <circle className="all-clear-glow" cx="288" cy="0" r="96" fill={`url(#${id}glow)`} />
              <circle cx="288" cy="0" r="28" fill={`url(#${id}core)`} />
            </g>
          </g>
        </g>
        <g className="all-clear-clouds" fill="#fff">
          <rect x="420" y="70" width="88" height="12" rx="6" />
          <rect x="442" y="62" width="44" height="12" rx="6" />
        </g>
        <path style={{ fill: "var(--hill-back)" }} d="M0 152V116c40-10 82-13 124-4 40 9 72 24 110 34 14 3 26 5 36 6z" />
        <path style={{ fill: "var(--hill-back)" }} d="M576 152V108c-38-10-80-11-120 0-40 11-76 27-116 37-12 3-24 5-36 7z" />
        <path style={{ fill: "var(--hill-front)" }} d="M0 152v-20c32-7 72-7 112 2 30 7 54 14 76 18z" />
        <path style={{ fill: "var(--hill-front)" }} d="M576 152v-24c-32-7-72-5-108 6-24 7-46 14-68 18z" />
        <rect y="152" width="576" height="68" fill={`url(#${id}water)`} />
        <line className="all-clear-horizon" x1="0" y1="152.5" x2="576" y2="152.5" stroke="#fff" />
        <g transform="translate(62,0)" className="all-clear-reflection" style={{ fill: "var(--sun)" }}>
          <rect x="250" y="158" width="76" height="3" rx="1.5" />
          <rect x="261" y="166" width="54" height="3" rx="1.5" />
          <rect x="269" y="175" width="38" height="2.5" rx="1.25" />
          <rect x="276" y="185" width="24" height="2" rx="1" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--veil)_0%,var(--veil)_22%,transparent_58%)]" />
      <div className="absolute top-5 left-6 sm:top-0 sm:bottom-6 sm:flex sm:flex-col sm:justify-center">
        <h2 className="text-xl leading-[1.2] font-semibold tracking-[-0.015em] text-[var(--scene-ink)] sm:text-[22px]">{title}</h2>
        <p className="mt-1.5 flex items-center gap-2 text-sm font-medium text-[var(--scene-ink-2)]">
          <span className="all-clear-dot" />
          {line}
        </p>
      </div>
    </div>
  );
}
