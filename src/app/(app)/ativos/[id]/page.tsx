import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { assertAssetVisible, getScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtNum } from "@/lib/format";
import { Badge, Card, Money, PageHeader, StatTile } from "@/components/ui";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { Donut } from "@/components/charts/Donut";
import { SnapshotForm } from "@/components/SnapshotForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TransactionTable } from "@/components/TransactionTable";
import { deleteSnapshot } from "@/app/actions/snapshots";
import { deleteImportBatch } from "@/app/actions/import";
import { getNetWorthSeries } from "@/lib/analytics";
import { getLiveValuations } from "@/lib/quotes";
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
  const withPositions = asset.type === "BROKERAGE" || asset.type === "CRYPTO";
  const live = withPositions && latest?.positions.length ? (await getLiveValuations([asset.id])).get(asset.id) ?? null : null;
  const liveByPos = new Map(live?.positions.map((p) => [p.id, p]) ?? []);
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
        {txCount > 0 && <StatTile label="Movimentos" value={String(txCount)} />}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Evolução" className="lg:col-span-2"><NetWorthChart data={chart} series={[{ key: "value", name: asset.name }]} stacked={false} /></Card>
        {editable && <Card title="Registar valor manualmente"><SnapshotForm assetId={asset.id} withPositions={withPositions} /></Card>}
        {!editable && latest?.positions.length ? <Card title="Composição"><Donut data={latest.positions.map((p) => ({ name: p.name, value: p.valueEur }))} /></Card> : null}
      </div>
      {latest?.positions.length ? (
        <Card title={`Posições em ${fmtDate(latest.date)}`} className="mt-4">
          <div className={live ? "space-y-4" : "grid gap-4 lg:grid-cols-5"}>
            <div className={live ? "min-w-0" : "min-w-0 lg:col-span-2"}><Donut data={latest.positions.map((p) => ({ name: p.name, value: liveByPos.get(p.id)?.liveValueEur ?? p.valueEur }))} centerLabel={live ? "em direto" : undefined} /></div>
            <div className={live ? "min-w-0 overflow-x-auto" : "min-w-0 overflow-x-auto lg:col-span-3"}>
              <table className="table">
                <thead><tr><th>Produto</th><th>ISIN / Ticker</th><th className="text-right">Qtd.</th><th className="text-right">Preço</th>{live && <th className="text-right">Atual</th>}{live && <th className="text-right">Hoje</th>}<th className="text-right">Valor €</th><th className="text-right">%</th></tr></thead>
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
                        <td className="num text-right">{p.price != null ? fmtNum(p.price, 3) : ""}</td>
                        {live && <td className="num text-right">{lp?.livePrice != null ? `${fmtNum(lp.livePrice, 3)}${lp.liveCurrency && lp.liveCurrency !== "EUR" ? ` ${lp.liveCurrency}` : ""}` : ""}</td>}
                        {live && <td className={`num text-right ${lp?.dayChangePct != null ? (lp.dayChangePct >= 0 ? "text-good" : "text-bad") : ""}`}>{lp?.dayChangePct != null ? `${lp.dayChangePct >= 0 ? "+" : ""}${lp.dayChangePct.toFixed(2)} %` : ""}</td>}
                        <td className="text-right"><Money value={value} />{lp?.liveValueEur != null && Math.abs(lp.liveValueEur - p.valueEur) >= 0.5 ? <div className="text-xs"><Delta value={lp.liveValueEur - p.valueEur} pct={p.valueEur ? (lp.liveValueEur - p.valueEur) / p.valueEur : null} /></div> : null}</td>
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
