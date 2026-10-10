"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  collected: { label: "Collected", color: "oklch(0.62 0.17 150)" },
  refunded: { label: "Refunded", color: "oklch(0.7 0.16 55)" },
} satisfies ChartConfig;

export function RevenueChart({ data }: { data: { day: string; collected: number; refunded: number }[] }) {
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="collected" fill="var(--color-collected)" radius={4} isAnimationActive={false} />
        <Bar dataKey="refunded" fill="var(--color-refunded)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
