"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { fmtEur, fmtPct } from "@/lib/format";
import { SERIES, tooltipStyle } from "./theme";

export type Slice = { name: string; value: number; color?: string };

export function Donut({ data, total, centerLabel }: { data: Slice[]; total?: number; centerLabel?: string }) {
  const sum = total ?? data.reduce((s, d) => s + d.value, 0);
  const shown = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const top = shown.slice(0, 7);
  const rest = shown.slice(7);
  const slices: Slice[] = rest.length ? [...top, { name: "Outros", value: rest.reduce((s, d) => s + d.value, 0), color: "var(--text-3)" }] : top;
  if (!slices.length) return <p className="py-8 text-center text-sm text-ink-3">Sem dados</p>;
  return (
    <div className="@container"><div className="flex flex-col items-center gap-3 @md:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s, i) => (
                <Cell key={s.name} fill={s.color ?? SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v) => [fmtEur(Number(v)), ""]} separator="" />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="num text-sm font-semibold">{fmtEur(sum, 0)}</span>
          {centerLabel && <span className="text-[10px] text-ink-3">{centerLabel}</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1 text-sm">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color ?? SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.name}</span>
            <span className="num whitespace-nowrap text-xs text-ink-3">{sum ? fmtPct(s.value / sum, 0) : ""}</span>
            <span className="num w-24 text-right font-medium">{fmtEur(s.value, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}
