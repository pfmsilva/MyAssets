import { fmtEur, fmtPct } from "@/lib/format";

export function Delta({ value, pct, suffix = "" }: { value: number; pct: number | null; suffix?: string }) {
  const cls = value > 0 ? "text-good" : value < 0 ? "text-bad" : "text-ink-3";
  return (
    <span className={`num ${cls}`}>
      {value > 0 ? "▲" : value < 0 ? "▼" : "•"} {value > 0 ? "+" : ""}{fmtEur(value, 0)}{pct !== null ? ` (${value > 0 ? "+" : ""}${fmtPct(pct)})` : ""}{suffix}
    </span>
  );
}
