import Link from "next/link";
import { requireUser } from "@/lib/access";
import { getScope } from "@/lib/scope";
import { logView } from "@/lib/activity";
import { getPerformanceOnce, AssetPerf } from "@/lib/performance";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtPct } from "@/lib/format";
import { Card, Money, PageHeader, StatTile } from "@/components/ui";
import { Delta } from "@/components/LiveBadge";
import { getDailyPnl, type Grouping } from "@/lib/daily-pnl";
import { CumulativePnlChart, DailyPnlBars } from "@/components/charts/PnlCharts";
import { FilterLinks, FilterToggle } from "@/components/Filters";
import { InvestSummary } from "@/components/InvestSummary";

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 180, label: "6 meses" },
  { days: 365, label: "1 ano" },
  { days: 3650, label: "Tudo" },
];

const GROUPS: { key: Grouping; label: string }[] = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
  { key: "year", label: "Ano" },
];

function Signed({ value, digits = 0 }: { value: number | null; digits?: number }) {
  if (value === null) return <span className="text-ink-3">—</span>;
  return <span className={`num ${value > 0 ? "text-good" : value < 0 ? "text-bad" : "text-ink-2"}`}>{value > 0 ? "+" : value < 0 ? "-" : ""}{fmtEur(Math.abs(value), digits)}</span>;
}

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

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ dias?: string; agr?: string; cot?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const days = PERIODS.some((p) => String(p.days) === sp.dias) ? Number(sp.dias) : 90;
  const group = (GROUPS.some((g) => g.key === sp.agr) ? sp.agr : "day") as Grouping;
  const onlyQuoted = sp.cot === "1";
  const link = (over: { dias?: number; agr?: Grouping; cot?: boolean }) => {
    const p = new URLSearchParams();
    const d = over.dias ?? days;
    const g = over.agr ?? group;
    const c = over.cot ?? onlyQuoted;
    if (d !== 90) p.set("dias", String(d));
    if (g !== "day") p.set("agr", g);
    if (c) p.set("cot", "1");
    const q = p.toString();
    return q ? `/rentabilidade?${q}` : "/rentabilidade";
  };
  logView(user, "Rentabilidade", { dias: days, agrupamento: group, soComCotacao: onlyQuoted });
  const scope = await getScope(user);
  const [{ rows, combined }, pnl] = await Promise.all([getPerformanceOnce(scope.assetIds), getDailyPnl({ assetIds: scope.assetIds, days, group, onlyQuoted })]);
  const groupLabel = { day: "dia", week: "semana", month: "mês", year: "ano" }[group];
  return (
    <>
      <PageHeader title="Investimentos · ganhos e rentabilidade" subtitle="Rendimento dos investimentos descontando depósitos e levantamentos: TWR (rendimento do gestor, independente dos fluxos) e XIRR (rendimento anualizado do teu dinheiro)." />
      <InvestSummary assetIds={scope.assetIds} />
      <Card
        title="Ganhos e perdas das carteiras em direto"
        className="mt-4"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FilterLinks options={PERIODS.map((p) => ({ value: String(p.days), label: p.label, href: link({ dias: p.days }) }))} current={String(days)} scroll={false} />
            <FilterLinks label="agrupar:" options={GROUPS.map((g) => ({ value: g.key, label: g.label, href: link({ agr: g.key }) }))} current={group} scroll={false} />
            <FilterToggle href={link({ cot: !onlyQuoted })} label="só com cotação" on={onlyQuoted} title="Mostrar apenas as carteiras com cotação do Yahoo, como no cartão da visão geral" />
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Hoje (em direto)" value={pnl.todayLive !== null ? `${pnl.todayLive >= 0 ? "+" : "-"}${fmtEur(Math.abs(pnl.todayLive), 0)}` : "—"} hint={pnl.quotesAt ? `cotações de ${pnl.quotesAt.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" })}` : "sem cotações"} />
          <StatTile label="Acumulado no período" value={`${pnl.totalPnl >= 0 ? "+" : "-"}${fmtEur(Math.abs(pnl.totalPnl), 0)}`} hint={pnl.from ? `desde ${fmtDate(pnl.from)}` : "sem registos"} />
          <StatTile label={`Melhor ${groupLabel}`} value={pnl.bestDay ? `${pnl.bestDay.pnl >= 0 ? "+" : "-"}${fmtEur(Math.abs(pnl.bestDay.pnl), 0)}` : "—"} hint={pnl.bestDay ? (group === "day" ? fmtDate(pnl.bestDay.date) : pnl.bestDay.label) : undefined} />
          <StatTile label={`Pior ${groupLabel}`} value={pnl.worstDay ? `${pnl.worstDay.pnl >= 0 ? "+" : "-"}${fmtEur(Math.abs(pnl.worstDay.pnl), 0)}` : "—"} hint={pnl.worstDay ? (group === "day" ? fmtDate(pnl.worstDay.date) : pnl.worstDay.label) : undefined} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="mb-1 text-sm font-medium">Variação por {groupLabel}</h3>
            <DailyPnlBars data={pnl.points} />
          </div>
          <div>
            <h3 className="mb-1 text-sm font-medium">Ganho acumulado no período</h3>
            <CumulativePnlChart data={pnl.points} />
          </div>
        </div>
        {pnl.assets.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="table">
              <thead><tr><th>Carteira</th><th className="text-right">Último registo</th><th className="text-right">Em direto</th><th className="text-right">Hoje</th><th className="text-right">No período</th><th className="text-right">Posições cotadas</th></tr></thead>
              <tbody>
                {pnl.assets.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/ativos/${a.id}`} className="hover:underline">{a.name}</Link><div className="text-xs text-ink-3">{ASSET_TYPE_LABEL[a.type] ?? a.type}{a.recordedAt ? ` · ${fmtDate(a.recordedAt)}` : ""}</div></td>
                    <td className="num text-right">{fmtEur(a.recorded, 0)}</td>
                    <td className="num text-right">{a.live ? fmtEur(a.value, 0) : <span className="text-xs text-ink-3">sem cotação</span>}</td>
                    <td className="text-right">{a.live ? <Signed value={a.today} /> : <span className="text-xs text-ink-3">—</span>}</td>
                    <td className="text-right"><Signed value={a.pnl} /></td>
                    <td className="num text-right text-xs text-ink-3">{a.quoted}/{a.quotable}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td>Total</td>
                  <td className="num text-right">{fmtEur(pnl.assets.reduce((s, a) => s + a.recorded, 0), 0)}</td>
                  <td className="num text-right">{fmtEur(pnl.assets.filter((a) => a.live).reduce((s, a) => s + a.value, 0), 0)}</td>
                  <td className="text-right"><Signed value={pnl.todayLive} /></td>
                  <td className="text-right"><Signed value={pnl.totalPnl} /></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-3">
          Cada barra é a variação de valor {group === "day" ? "entre dois registos consecutivos" : `no período (${groupLabel})`} das carteiras {onlyQuoted ? "com cotação" : "(DEGIRO, XTB, carteiras de ações e cripto)"}, descontando depósitos e levantamentos; a última barra, tracejada, inclui o valor de hoje às cotações do momento.
          A coluna <b>em direto</b> e o total correspondem ao cartão “Carteiras em direto” da visão geral, que lista apenas as carteiras com cotação; as carteiras sem cotação entram nos gráficos e no total do último registo pelo valor registado.
          {pnl.points.length < 5 ? " Para ter uma barra por dia, ative o registo diário do valor em Administração → Definições." : ""}
          {pnl.liveError ? ` Cotações: ${pnl.liveError}` : ""}
        </p>
      </Card>
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
