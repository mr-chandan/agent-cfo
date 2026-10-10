"use client";

import { useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface GlassTab {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  count?: number;
  countTone?: "urgent" | "quiet";
}

// Frosted track with an ink pill that slides to the active tab. Must sit inside a Tabs root.
export function GlassTabsList({ tabs, value, className }: { tabs: GlassTab[]; value: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const active = wrap.querySelector<HTMLElement>('[data-state="active"]');
      if (!active) return;
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, tabs]);

  return (
    <div ref={wrapRef} className={cn("inline-flex max-w-full", className)}>
      <TabsList
        className={cn(
          "relative h-auto w-full max-w-full gap-0.5 overflow-x-auto rounded-full border border-black/[0.07] bg-gradient-to-b from-white/90 to-white/45 p-1 backdrop-blur-xl backdrop-saturate-150 [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden",
          "shadow-[inset_0_1px_0_rgb(255_255_255),inset_0_-1px_0_rgb(0_0_0/0.03),0_1px_2px_rgb(0_0_0/0.05),0_10px_30px_-6px_rgb(0_0_0/0.14)]",
          "dark:border-white/10 dark:from-white/[0.10] dark:to-white/[0.04] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.4),0_10px_30px_-6px_rgb(0_0_0/0.7)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "bg-foreground absolute inset-y-1 rounded-full shadow-md transition-[left,width,opacity] duration-300 ease-out motion-reduce:transition-none",
            pill ? "opacity-100" : "opacity-0",
          )}
          style={pill ? { left: pill.left, width: pill.width } : undefined}
        />
        {tabs.map(({ value: v, label, icon: Icon, count, countTone = "quiet" }) => (
          <TabsTrigger
            key={v}
            value={v}
            className={cn(
              "group text-muted-foreground hover:text-foreground relative z-10 h-8 flex-auto gap-1 rounded-full border-0 px-2 text-[13px] font-medium transition-colors sm:h-9 sm:flex-none sm:gap-1.5 sm:px-5 sm:text-[15px]",
              // `!` beats the kit trigger's own dark active colour (same specificity, later cascade)
              "data-[state=active]:text-background! data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:text-background!",
            )}
          >
            {Icon && <Icon className="text-primary group-data-[state=active]:text-primary hidden size-4 shrink-0 sm:block" />}
            {label}
            {!!count && count > 0 && (
              <span
                className={cn(
                  "min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold tabular-nums sm:min-w-5 sm:px-1.5 sm:text-[11px] sm:leading-5",
                  countTone === "urgent"
                    ? "bg-destructive text-white"
                    : "bg-muted text-muted-foreground group-data-[state=active]:bg-background/20 group-data-[state=active]:text-background",
                )}
              >
                {count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}
