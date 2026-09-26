import { getPerformanceOnce } from "@/lib/performance";
import { getLiveValuationsOnce } from "@/lib/quotes";
import { LIVE_TYPES } from "@/lib/daily-pnl";
import { fmtEur, fmtPct } from "@/lib/format";
import { StatTile } from "@/components/ui";

/** The four figures shared by every page of the investments area. */
export async function InvestSummary({ assetIds }: { assetIds?: string[] }) {
  const { rows, combined } = await getPerformanceOnce(assetIds);
  const live = await getLiveValuationsOnce(rows.filter((r) => (LIVE_TYPES as readonly string[]).includes(r.type)).map((r) => r.id), { resolve: false });
  const quoted = [...live.values()].filter((v) => v.quoted > 0);
  const liveDelta = quoted.reduce((s, v) => s + v.delta, 0);
  const today = quoted.reduce((s, v) => s + v.dayChangeEur, 0);
  const since = combined?.periods.at(-1);
  const signed = (v: number, digits = 0) => `${v >= 0 ? "+" : "-"}${fmtEur(Math.abs(v), digits)}`;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Investimentos" value={fmtEur(combined?.value ?? 0, 0)} hint={`${rows.length} carteiras`} />
      <StatTile label="Em direto" value={quoted.length ? fmtEur((combined?.value ?? 0) + liveDelta, 0) : "—"} hint={quoted.length ? `${signed(liveDelta)} face ao último registo` : "sem cotações"} />
      <StatTile label="Hoje" value={quoted.length ? signed(today) : "—"} hint={quoted.length ? `${quoted.length} carteira(s) com cotação` : undefined} />
      <StatTile
        label="Ganho desde o início"
        value={since?.gain != null ? signed(since.gain) : "—"}
        hint={since?.twr != null ? `TWR ${since.twr >= 0 ? "+" : ""}${fmtPct(since.twr)}${since.annualized != null ? ` · ${since.annualized >= 0 ? "+" : ""}${fmtPct(since.annualized)} ao ano` : ""}` : "valor − valor inicial − fluxos"}
      />
    </div>
  );
}
