"use client";
import { Area, AreaChart, Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyPoint } from "@/lib/daily-pnl";
import { fmtEur, fmtEurShort } from "@/lib/format";
import { axisStyle, gridStyle, tooltipStyle } from "./theme";

const dayLabel = (d: string) => {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
};

type TooltipArgs = { active?: boolean; payload?: readonly { payload: DailyPoint }[]; label?: string | number };

function TooltipBody({ args, field }: { args: TooltipArgs; field: "pnl" | "cumulative" }) {
  const { active, payload, label } = args;
  const p = active && payload?.length ? payload[0].payload : null;
  if (!p) return null;
  const v = p[field];
  return (
    <div style={tooltipStyle.contentStyle} className="px-3 py-2">
      <p style={tooltipStyle.labelStyle}>{String(label)}{p.live ? " · em direto" : ""}</p>
      <p className={`num ${v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink-2"}`}>{v > 0 ? "+" : ""}{fmtEur(v)}</p>
      <p className="text-xs text-ink-3">carteiras: {fmtEur(p.value, 0)}{p.flow ? ` · fluxos ${p.flow > 0 ? "+" : ""}${fmtEur(p.flow, 0)}` : ""}</p>
      {field === "pnl" && <p className="text-xs text-ink-3">acumulado: {p.cumulative > 0 ? "+" : ""}{fmtEur(p.cumulative, 0)}</p>}
    </div>
  );
}

/** Gain or loss of each day: green above zero, red below, the live day outlined. */
export function DailyPnlBars({ data, height = 260 }: { data: DailyPoint[]; height?: number }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-3">Sem registos suficientes. É preciso pelo menos dois valores das carteiras.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="15%">
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={dayLabel} tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={fmtEurShort} tick={axisStyle} axisLine={false} tickLine={false} width={64} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip content={(p) => <TooltipBody args={p as unknown as TooltipArgs} field="pnl" />} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="pnl" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.date} fill={d.pnl >= 0 ? "var(--good)" : "var(--bad)"} fillOpacity={d.live ? 0.55 : 1} stroke={d.live ? (d.pnl >= 0 ? "var(--good)" : "var(--bad)") : undefined} strokeWidth={d.live ? 1.5 : 0} strokeDasharray={d.live ? "3 2" : undefined} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Running total of the gains since the start of the period. */
export function CumulativePnlChart({ data, height = 260 }: { data: DailyPoint[]; height?: number }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-3">Sem registos suficientes no período.</p>;
  const last = data.at(-1)!.cumulative;
  const color = last >= 0 ? "var(--good)" : "var(--bad)";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="date" tickFormatter={dayLabel} tick={axisStyle} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={fmtEurShort} tick={axisStyle} axisLine={false} tickLine={false} width={64} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Tooltip content={(p) => <TooltipBody args={p as unknown as TooltipArgs} field="cumulative" />} />
        <Area type="monotone" dataKey="cumulative" stroke={color} strokeWidth={2} fill="url(#pnlFill)" isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
