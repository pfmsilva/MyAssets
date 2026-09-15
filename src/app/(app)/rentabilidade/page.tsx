import Link from "next/link";
import { requireUser } from "@/lib/access";
import { getScope } from "@/lib/scope";
import { logView } from "@/lib/activity";
import { getPerformance, AssetPerf } from "@/lib/performance";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtPct } from "@/lib/format";
import { Card, Money, PageHeader, StatTile } from "@/components/ui";
import { Delta } from "@/components/LiveBadge";

export const dynamic = "force-dynamic";

function Pct({ v, na = "—" }: { v: number | null; na?: string }) {
  if (v === null) return <span className="text-ink-3">{na}</span>;
  return <span className={`num ${v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink-2"}`}>{v > 0 ? "+" : ""}{fmtPct(v)}</span>;
}

function PerfTable({ rows, combined }: { rows: AssetPerf[]; combined: AssetPerf | null }) {
  const labels = ["Este ano", "1 ano", "3 anos", "Desde o início"];
  const all = combined ? [...rows, combined] : rows;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Carteira</th><th className="text-right">Valor</th><th className="text-right">Fluxos registados</th>
            {labels.map((l) => <th key={l} className="text-right" colSpan={2}>{l}</th>)}
          </tr>
          <tr>
            <th></th><th></th><th></th>
            {labels.map((l) => <th key={l + "sub"} className="text-right" colSpan={2}><span className="font-normal">ganho · TWR (XIRR)</span></th>)}
          </tr>
        </thead>
        <tbody>
          {all.map((a) => (
            <tr key={a.id} className={a.id === "all" ? "font-medium" : ""}>
              <td>{a.id === "all" ? a.name : <Link href={`/ativos/${a.id}`} className="hover:underline">{a.name}</Link>}<div className="text-xs font-normal text-ink-3">{a.id === "all" ? `${rows.length} carteiras` : ASSET_TYPE_LABEL[a.type]} · desde {a.firstDate ? fmtDate(a.firstDate) : "—"}{a.flows.length ? ` · ${a.flows.length} fluxos` : " · sem fluxos"}</div></td>
              <td className="text-right"><Money value={a.value} /><div className="text-xs font-normal text-ink-3">{a.valueDate ? fmtDate(a.valueDate) : ""}</div></td>
              <td className="text-right"><Money value={a.flowsTotal} /></td>
              {a.periods.map((p) => (
                <td key={p.label} className="text-right" colSpan={2}>
                  {p.gain !== null ? <><Delta value={p.gain} pct={p.startValue ? p.gain / (p.startValue + Math.max(0, p.invested)) : null} /><div className="text-xs font-normal"><Pct v={p.twr} /> <span className="text-ink-3">(<Pct v={p.xirr} na="n/d" />{p.label !== "Desde o início" || (p.from && Date.now() - p.from.getTime() > 365 * 86400e3) ? " a.a." : ""})</span></div></> : <span className="text-xs text-ink-3">sem dados</span>}
                </td>
              ))}
            </tr>
          ))}
          {!all.length && <tr><td colSpan={11} className="py-6 text-center text-ink-3">Sem carteiras de investimento com registos.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default async function PerformancePage() {
  const user = await requireUser();
  logView(user, "Rentabilidade");
  const scope = await getScope(user);
  const { rows, combined } = await getPerformance(scope.assetIds);
  const since = combined?.periods.at(-1);
  const year = combined?.periods[0];
  return (
    <>
      <PageHeader title="Rentabilidade real" subtitle="Rendimento dos investimentos descontando depósitos e levantamentos: TWR (rendimento do gestor, independente dos fluxos) e XIRR (rendimento anualizado do teu dinheiro)." />
      {combined && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Investimentos" value={fmtEur(combined.value, 0)} hint={`${rows.length} carteiras · desde ${combined.firstDate ? fmtDate(combined.firstDate) : "—"}`} />
          <StatTile label="Ganho desde o início" value={since?.gain !== null && since?.gain !== undefined ? `${since.gain >= 0 ? "+" : "-"}${fmtEur(Math.abs(since.gain), 0)}` : "—"} hint="valor − valor inicial − fluxos" />
          <StatTile label="TWR desde o início" value={since?.twr != null ? `${since.twr >= 0 ? "+" : ""}${fmtPct(since.twr)}` : "—"} hint={since?.annualized != null ? `${since.annualized >= 0 ? "+" : ""}${fmtPct(since.annualized)} ao ano` : "aproximação mensal"} />
          <StatTile label="Este ano" value={year?.twr != null ? `${year.twr >= 0 ? "+" : ""}${fmtPct(year.twr)}` : "—"} hint={year?.gain != null ? `${year.gain >= 0 ? "+" : "-"}${fmtEur(Math.abs(year.gain), 0)} de ganho` : "sem dados"} />
        </div>
      )}
      <Card title="Por carteira" className="mt-4"><PerfTable rows={rows} combined={combined} /></Card>
      <Card title="Como é calculado" className="mt-4">
        <ul className="list-inside list-disc space-y-1 text-sm text-ink-2">
          <li><b>Ganho</b> = valor atual − valor no início do período − fluxos (depósitos − levantamentos) no período.</li>
          <li><b>TWR</b> (time-weighted): rentabilidade encadeada mês a mês, cada mês com o método Dietz modificado; não é afetada pelo momento dos depósitos. Períodos acima de um ano mostram-se anualizados no indicador do topo.</li>
          <li><b>XIRR</b> (money-weighted): taxa anual que iguala fluxos e valor final; reflete o momento em que investiste. Em períodos curtos a anualização exagera o valor.</li>
          <li><b>Fluxos</b>: depósitos/levantamentos importados (XTB, Optimize) ou, quando a carteira não os tem, transferências das contas à ordem categorizadas como Investimentos que mencionem a carteira (ex.: “TRF … DEGIRO”). Podes acrescentar fluxos manuais na página de cada ativo.</li>
          <li>Os cálculos começam no primeiro valor registado de cada carteira; quanto mais registos mensais (importações ou extratos antigos), mais precisa é a TWR.</li>
        </ul>
      </Card>
    </>
  );
}
