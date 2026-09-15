"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmtEur, fmtEurShort, monthLabel } from "@/lib/format";
import { axisStyle, gridStyle, SERIES, tooltipStyle } from "./theme";

export type SeriesDef = { key: string; name: string; color?: string };

export function NetWorthChart({ data, series, height = 280, stacked = true }: { data: Record<string, number | string>[]; series: SeriesDef[]; height?: number; stacked?: boolean }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-3">Sem histórico ainda. Importe extratos ou registe valores.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={fmtEurShort} tick={axisStyle} axisLine={false} tickLine={false} width={64} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => monthLabel(String(l))} formatter={(v, n) => [fmtEur(Number(v)), n]} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stackId={stacked ? "a" : undefined}
            stroke={s.color ?? SERIES[i % SERIES.length]}
            fill={s.color ?? SERIES[i % SERIES.length]}
            fillOpacity={stacked ? 0.55 : 0.15}
            strokeWidth={2}
            isAnimationActive={false}
            dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
