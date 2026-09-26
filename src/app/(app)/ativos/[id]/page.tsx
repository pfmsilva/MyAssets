import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { assertAssetVisible, getScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtNum, fmtPct } from "@/lib/format";
import { Badge, Card, Money, PageHeader, StatTile } from "@/components/ui";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { Donut } from "@/components/charts/Donut";
import { SnapshotForm } from "@/components/SnapshotForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TransactionTable } from "@/components/TransactionTable";
import { deleteSnapshot } from "@/app/actions/snapshots";
import { deleteImportBatch } from "@/app/actions/import";
import { getNetWorthSeries } from "@/lib/analytics";
import { getLiveValuationsOnce } from "@/lib/quotes";
import { computeAssetPerf, getAssetFlows } from "@/lib/performance";
import { FlowForm } from "@/components/FlowForm";
import { StockPortfolio } from "@/components/StockPortfolio";
import { getPortfolio } from "@/lib/stock-portfolio";
import { QuoteRefresh } from "@/components/QuoteRefresh";
import { Delta } from "@/components/LiveBadge";

export const dynamic = "force-dynamic";
const SOURCE: Record<string, string> = { MANUAL: "manual", IMPORT: "importação", DERIVED: "derivado" };

export default async function AssetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const editable = hasRole(user.role, "EDITOR");
  const { id } = await params;
  const { page = "1" } = await searchParams;
  assertAssetVisible(await getScope(user), id);
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      ownerships: { include: { member: true } },
      snapshots: { orderBy: { date: "desc" }, include: { positions: true } },
      importBatches: { orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true, email: true } } } },
    },
  });
  if (!asset) notFound();
  const pageN = Math.max(1, Number(page) || 1);
  logView(user, "Ativo", { asset: asset.name, page: pageN });
  const take = 50;
  const [txs, txCount, categories, series] = await Promise.all([
    prisma.transaction.findMany({ where: { assetId: id }, orderBy: [{ date: "desc" }, { seq: "desc" }], skip: (pageN - 1) * take, take }),
    prisma.transaction.count({ where: { assetId: id } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    getNetWorthSeries({ assetId: id }),
  ]);
  const latest = asset.snapshots[0];
  const isStockPortfolio = asset.type === "STOCK_PORTFOLIO";
  const withPositions = asset.type === "BROKERAGE" || asset.type === "CRYPTO" || isStockPortfolio;
  const portfolio = isStockPortfolio ? await getPortfolio(id) : null;
  const live = withPositions && latest?.positions.length ? (await getLiveValuationsOnce([asset.id])).get(asset.id) ?? null : null;
  const liveByPos = new Map(live?.positions.map((p) => [p.id, p]) ?? []);
  // unrealised P/L from acquisition cost (live value when available, else the recorded value)
  const costPositions = latest?.positions.filter((p) => p.costEur !== null) ?? [];
  const costTotal = costPositions.reduce((s, p) => s + p.costEur!, 0);
  const pnlTotal = costPositions.reduce((s, p) => s + ((liveByPos.get(p.id)?.liveValueEur ?? p.valueEur) - p.costEur!), 0);
  const hasCost = costPositions.length > 0;
  const isInvestment = asset.type === "BROKERAGE" || asset.type === "STOCK_PORTFOLIO" || asset.type === "PPR" || asset.type === "CRYPTO";
  const perf = isInvestment && asset.snapshots.length ? computeAssetPerf(asset, asset.snapshots, await getAssetFlows(asset)) : null;
  const perfSince = perf?.periods.at(-1);
  const manualFlows = isInvestment ? await prisma.transaction.findMany({ where: { assetId: id, kind: "Fluxo manual" }, orderBy: { date: "desc" }, select: { id: true, date: true, amount: true, description: true } }) : [];
  const realized = withPositions ? await prisma.realizedTrade.findMany({ where: { assetId: id }, orderBy: { closeTime: "desc" } }) : [];
  const realizedTotal = realized.reduce((s, t) => s + t.profitEur, 0);
  const thisYear = new Date().getUTCFullYear();
  const realizedYear = realized.filter((t) => t.closeTime.getUTCFullYear() === thisYear).reduce((s, t) => s + t.profitEur, 0);
  const prev = series.months.length >= 2 ? series.months[series.months.length - 2].total : null;
  const chart = series.months.map((m) => ({ month: m.month, value: m.total }));
  return (
    <>
      <PageHeader
        title={asset.name}
        subtitle={<><Link href="/ativos" className="text-accent hover:underline">← Ativos</Link> · {asset.institution} · {ASSET_TYPE_LABEL[asset.type]}</>}
        actions={<>{asset.ownerships.map((o) => <Badge key={o.memberId} color={o.member.color}>{o.member.name} {o.percent}%</Badge>)}{asset.importer && editable && <Link href={`/importar?asset=${asset.id}`} className="btn btn-primary">Importar ficheiro</Link>}</>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Valor atual" value={latest ? fmtEur(latest.value) : "—"} delta={latest && prev && Math.abs((latest.value - prev) / prev) <= 1 ? (latest.value - prev) / prev : null} hint={latest ? `${fmtDate(latest.date)} · ${SOURCE[latest.source]}` : "sem registos"} />
        <StatTile label="Registos" value={String(asset.snapshots.length)} hint="snapshots de valor" />
        {live && live.quoted > 0 && (
          <>
            <StatTile label="Valor em direto" value={fmtEur(live.liveTotal)} delta={live.deltaPct !== null && Math.abs(live.deltaPct) <= 1 ? live.deltaPct : null} hint={`${live.delta >= 0 ? "+" : "-"}${fmtEur(Math.abs(live.delta), 0)} vs. registo de ${fmtDate(live.snapshotDate)}`} />
            <StatTile label="Hoje" value={`${live.dayChangeEur >= 0 ? "+" : "-"}${fmtEur(Math.abs(live.dayChangeEur), 0)}`} delta={live.dayChangePct !== null && Math.abs(live.dayChangePct) <= 1 ? live.dayChangePct : null} hint="variação do dia (cotações Yahoo)" />
          </>
        )}
        {hasCost && (
          <StatTile label={live && live.quoted > 0 ? "Ganho/perda (em direto)" : "Ganho/perda"} value={`${pnlTotal >= 0 ? "+" : "-"}${fmtEur(Math.abs(pnlTotal))}`} delta={costTotal && Math.abs(pnlTotal / costTotal) <= 5 ? pnlTotal / costTotal : null} hint={`custo de aquisição ${fmtEur(costTotal, 0)}`} />
        )}
        {perfSince && perfSince.gain !== null && (
          <StatTile label="Rentabilidade" value={perfSince.twr != null ? `${perfSince.twr >= 0 ? "+" : ""}${fmtPct(perfSince.twr)}` : "—"} hint={`ganho ${perfSince.gain >= 0 ? "+" : "-"}${fmtEur(Math.abs(perfSince.gain), 0)} desde ${fmtDate(perfSince.from!)}${perfSince.xirr != null ? ` · XIRR ${perfSince.xirr >= 0 ? "+" : ""}${fmtPct(perfSince.xirr)} a.a.` : ""}`} href="/rentabilidade" />
        )}
        {realized.length > 0 && (
          <StatTile label="Mais-valias realizadas" value={`${realizedTotal >= 0 ? "+" : "-"}${fmtEur(Math.abs(realizedTotal))}`} hint={`${thisYear}: ${realizedYear >= 0 ? "+" : "-"}${fmtEur(Math.abs(realizedYear))} · ${realized.length} posições fechadas`} />
        )}
        {txCount > 0 && <StatTile label="Movimentos" value={String(txCount)} />}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Evolução" className="lg:col-span-2"><NetWorthChart data={chart} series={[{ key: "value", name: asset.name }]} stacked={false} /></Card>
        {editable && <Card title={isStockPortfolio ? "Fluxos e valor" : "Registar valor manualmente"}>{isStockPortfolio ? <p className="text-sm text-ink-2">O valor desta carteira é calculado a partir das ações e das compras/vendas registadas abaixo, com as cotações do Yahoo Finance. É atualizado sempre que registar uma operação e uma vez por dia.</p> : <SnapshotForm assetId={asset.id} withPositions={withPositions} />}{isInvestment && <div className="mt-4 border-t border-border pt-3"><h3 className="mb-2 text-sm font-semibold text-ink-2">Fluxos de capital (rentabilidade)</h3><FlowForm assetId={asset.id} flows={manualFlows.map((f) => ({ id: f.id, date: f.date.toISOString(), amount: f.amount, description: f.description }))} /></div>}</Card>}
        {!editable && latest?.positions.length ? <Card title="Composição"><Donut data={latest.positions.map((p) => ({ name: p.name, value: p.valueEur }))} /></Card> : null}
      </div>
      {portfolio && (
        <Card
          title={`Ações da carteira (${portfolio.holdings.filter((h) => h.state.quantity > 0).length} em carteira${portfolio.holdings.length !== portfolio.holdings.filter((h) => h.state.quantity > 0).length ? `, ${portfolio.holdings.length - portfolio.holdings.filter((h) => h.state.quantity > 0).length} fechadas` : ""})`}
          className="mt-4"
          action={<span className="text-xs text-ink-3">Valor calculado com as cotações do Yahoo Finance</span>}
        >
          <StockPortfolio
            editable={editable}
            data={{
              assetId: asset.id,
              totals: portfolio.totals,
              quotesAt: portfolio.quotesAt ? portfolio.quotesAt.toISOString() : null,
              error: portfolio.error,
              holdings: portfolio.holdings.map((h) => ({
                id: h.id,
                isin: h.isin,
                name: h.name,
                note: h.note,
                symbol: h.symbol,
                manualSymbol: h.manualSymbol,
                yahooUrl: h.yahooUrl,
                quoteError: h.quoteError,
                quantity: h.state.quantity,
                avgPrice: h.state.avgPrice,
                costEur: h.state.costEur,
                realizedEur: h.state.realizedEur,
                livePrice: h.livePrice,
                liveCurrency: h.liveCurrency,
                liveValueEur: h.liveValueEur,
                dayChangePct: h.dayChangePct,
                valueEur: h.valueEur,
                pnlEur: h.pnlEur,
                pnlPct: h.pnlPct,
                warning: h.state.warning,
                trades: h.trades.map((t) => ({ id: t.id, date: t.date.toISOString(), quantity: t.quantity, amount: t.amount, fee: t.fee, note: t.note })),
              })),
            }}
          />
        </Card>
      )}
      {latest?.positions.length && !isStockPortfolio ? (
        <Card title={`Posições em ${fmtDate(latest.date)}`} className="mt-4">
          <div className={live ? "space-y-4" : "grid gap-4 lg:grid-cols-5"}>
            <div className={live ? "min-w-0" : "min-w-0 lg:col-span-2"}><Donut data={latest.positions.map((p) => ({ name: p.name, value: liveByPos.get(p.id)?.liveValueEur ?? p.valueEur }))} centerLabel={live ? "em direto" : undefined} /></div>
            <div className={live ? "min-w-0 overflow-x-auto" : "min-w-0 overflow-x-auto lg:col-span-3"}>
              <table className="table">
                <thead><tr><th>Produto</th><th>ISIN / Ticker</th><th className="text-right">Qtd.</th>{hasCost && <th className="text-right">Preço médio</th>}<th className="text-right">Preço</th>{live && <th className="text-right">Atual</th>}{live && <th className="text-right">Hoje</th>}<th className="text-right">Valor €</th>{hasCost && <th className="text-right">Ganho/perda</th>}<th className="text-right">%</th></tr></thead>
                <tbody>
                  {[...latest.positions].sort((a, b) => b.valueEur - a.valueEur).map((p) => {
                    const lp = liveByPos.get(p.id);
                    const value = lp?.liveValueEur ?? p.valueEur;
                    const total = live?.liveTotal ?? latest.value;
                    return (
                      <tr key={p.id}>
                        <td className="max-w-[22ch] truncate" title={p.name}>
                          {lp?.yahooUrl ? <a href={lp.yahooUrl} target="_blank" rel="noopener" className="flex items-center gap-1 hover:underline" title={`Ver ${lp.symbol} no Yahoo Finance`}><span className="truncate">{p.name}</span><span className="shrink-0 text-accent">↗</span></a> : p.name}
                        </td>
                        <td className="text-xs text-ink-3">{p.isin ?? ""}{lp?.symbol && lp.symbol !== p.isin ? <span className="ml-1 text-accent">{lp.symbol}</span> : null}{lp && !lp.symbol && lp.key ? <span className="ml-1 text-warn" title={lp.error ?? "sem símbolo Yahoo"}>sem cotação</span> : null}</td>
                        <td className="num text-right">{p.quantity != null ? fmtNum(p.quantity, 4) : ""}</td>
                        {hasCost && <td className="num text-right text-ink-2">{p.avgPrice != null ? fmtNum(p.avgPrice, 3) : ""}</td>}
                        <td className="num text-right">{p.price != null ? fmtNum(p.price, 3) : ""}</td>
                        {live && <td className="num text-right">{lp?.livePrice != null ? `${fmtNum(lp.livePrice, 3)}${lp.liveCurrency && lp.liveCurrency !== "EUR" ? ` ${lp.liveCurrency}` : ""}` : ""}</td>}
                        {live && <td className={`num text-right ${lp?.dayChangePct != null ? (lp.dayChangePct >= 0 ? "text-good" : "text-bad") : ""}`}>{lp?.dayChangePct != null ? `${lp.dayChangePct >= 0 ? "+" : ""}${lp.dayChangePct.toFixed(2)} %` : ""}</td>}
                        <td className="text-right"><Money value={value} />{lp?.liveValueEur != null && Math.abs(lp.liveValueEur - p.valueEur) >= 0.5 ? <div className="text-xs"><Delta value={lp.liveValueEur - p.valueEur} pct={p.valueEur ? (lp.liveValueEur - p.valueEur) / p.valueEur : null} /></div> : null}</td>
                        {hasCost && <td className="text-right">{p.costEur != null ? <Delta value={value - p.costEur} pct={p.costEur ? (value - p.costEur) / p.costEur : null} /> : <span className="text-ink-3">—</span>}</td>}
                        <td className="num text-right text-ink-2">{total ? ((value / total) * 100).toFixed(1) : "0"} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {live && <div className="mt-2"><QuoteRefresh assetId={asset.id} quotesAt={live.quotesAt?.toISOString() ?? null} quoted={live.quoted} quotable={live.quotable} error={live.error} /></div>}
            </div>
          </div>
        </Card>
      ) : null}
      {realized.length > 0 && (
        <Card title={`Mais-valias realizadas (${realized.length} posições fechadas · total ${realizedTotal >= 0 ? "+" : "-"}${fmtEur(Math.abs(realizedTotal))})`} className="mt-4">
          <div className="max-h-96 overflow-auto">
            <table className="table">
              <thead><tr><th>Fecho</th><th>Instrumento</th><th className="text-right">Qtd.</th><th className="text-right">Abertura</th><th className="text-right">Fecho</th><th className="text-right">Resultado</th></tr></thead>
              <tbody>
                {realized.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap text-ink-2">{fmtDate(t.closeTime)}</td>
                    <td className="max-w-[28ch] truncate" title={t.name}>{t.name}{t.ticker ? <span className="ml-1 text-xs text-ink-3">{t.ticker}</span> : null}</td>
                    <td className="num text-right">{t.quantity != null ? fmtNum(t.quantity, 4) : ""}</td>
                    <td className="num text-right text-ink-2">{t.openPrice != null ? `${fmtNum(t.openPrice, 3)}${t.openTime ? ` · ${fmtDate(t.openTime)}` : ""}` : ""}</td>
                    <td className="num text-right text-ink-2">{t.closePrice != null ? fmtNum(t.closePrice, 3) : ""}</td>
                    <td className="text-right"><Delta value={t.profitEur} pct={t.openPrice && t.quantity ? t.profitEur / (t.openPrice * t.quantity) : null} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {txCount > 0 && (
        <Card title={`Movimentos (${txCount})`} className="mt-4">
          <TransactionTable rows={txs.map((t) => ({ id: t.id, date: t.date.toISOString(), description: t.description, amount: t.amount, balanceAfter: t.balanceAfter, status: t.status, categoryId: t.categoryId, assetName: asset.name, kind: t.kind }))} categories={categories} editable={editable} showAsset={false} />
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-ink-3">Página {pageN} de {Math.max(1, Math.ceil(txCount / take))}</span>
            <div className="flex gap-2">
              {pageN > 1 && <Link className="btn btn-sm" href={`?page=${pageN - 1}`}>← Anterior</Link>}
              {pageN * take < txCount && <Link className="btn btn-sm" href={`?page=${pageN + 1}`}>Seguinte →</Link>}
            </div>
          </div>
        </Card>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Histórico de valores">
          <div className="max-h-96 overflow-auto">
            <table className="table">
              <thead><tr><th>Data</th><th className="text-right">Valor</th><th>Origem</th>{editable && <th></th>}</tr></thead>
              <tbody>
                {asset.snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="text-right"><Money value={s.value} /></td>
                    <td className="text-xs text-ink-3">{SOURCE[s.source]}{s.note ? ` · ${s.note}` : ""}{s.positions.length ? ` · ${s.positions.length} posições` : ""}</td>
                    {editable && <td className="text-right"><ConfirmButton label="apagar" confirm="Apagar este registo de valor?" action={deleteSnapshot.bind(null, s.id)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {asset.importBatches.length > 0 && (
          <Card title="Importações">
            <table className="table">
              <thead><tr><th>Data</th><th>Ficheiro</th><th className="text-right">Novos / total</th>{editable && <th></th>}</tr></thead>
              <tbody>
                {asset.importBatches.map((b) => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap text-ink-2">{fmtDate(b.createdAt)}<div className="text-xs text-ink-3">{b.user?.name ?? b.user?.email ?? ""}</div></td>
                    <td className="max-w-[20ch] truncate" title={b.fileName}>{b.fileName}</td>
                    <td className="num text-right">{b.rowsNew} / {b.rowsTotal}</td>
                    {editable && <td className="text-right"><ConfirmButton label="anular" confirm="Anular esta importação apaga os movimentos e o snapshot que ela criou. Continuar?" action={deleteImportBatch.bind(null, b.id)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
