"use client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";
import { fmtEur, fmtEurShort, fmtPct, monthLabel } from "@/lib/format";
import { axisStyle, gridStyle, SERIES, tooltipStyle } from "./theme";

export function CategoryBars({ data, categories, height = 300 }: { data: Record<string, number | string>[]; categories: { name: string; color: string }[]; height?: number }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-3">Sem movimentos no período.</p>;
  const top = categories.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtEurShort} tick={axisStyle} axisLine={false} tickLine={false} width={64} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => monthLabel(String(l))} formatter={(v, n) => [fmtEur(Number(v)), n]} cursor={{ fill: "var(--surface-2)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {top.map((c, i) => (
          <Bar key={c.name} dataKey={c.name} stackId="a" fill={c.color || SERIES[i % SERIES.length]} stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
        ))}
        {categories.length > 8 && <Bar dataKey="Outras" stackId="a" fill="var(--text-3)" stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function IncomeExpenseBars({ data, height = 260 }: { data: { month: string; income: number; expense: number; investment: number }[]; height?: number }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-3">Sem movimentos no período.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="25%">
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtEurShort} tick={axisStyle} axisLine={false} tickLine={false} width={64} />
        <Tooltip {...tooltipStyle} labelFormatter={(l) => monthLabel(String(l))} formatter={(v, n) => [fmtEur(Number(v)), n]} cursor={{ fill: "var(--surface-2)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Rendimentos" fill="var(--s6)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="expense" name="Despesas" fill="var(--s8)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="investment" name="Investido" fill="var(--s1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SavingsLine({ data, height = 220 }: { data: { month: string; savingsRate: number | null; savings: number; wealthDelta: number | null }[]; height?: number }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-ink-3">Sem dados.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} {...gridStyle} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtEurShort} tick={axisStyle} axisLine={false} tickLine={false} width={64} />
        <ReferenceLine y={0} stroke="var(--text-3)" />
        <Tooltip
          {...tooltipStyle}
          labelFormatter={(l) => monthLabel(String(l))}
          formatter={(v, n, item) => {
            const p = item?.payload as { savingsRate: number | null } | undefined;
            if (n === "Poupança (rend. − desp.)" && p?.savingsRate != null) return [`${fmtEur(Number(v))} (${fmtPct(p.savingsRate)})`, n];
            return [fmtEur(Number(v)), n];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="savings" name="Poupança (rend. − desp.)" stroke="var(--s1)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="wealthDelta" name="Variação do património" stroke="var(--s2)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
