import Link from "next/link";
import { hasRole, requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { getScope } from "@/lib/scope";
import { byMember, getCurrentValues, getNetWorthSeries, groupBy } from "@/lib/analytics";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, isStale } from "@/lib/format";
import { Card, PageHeader, StatTile, Money, Badge, Alert } from "@/components/ui";
import { Donut } from "@/components/charts/Donut";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { TYPE_COLORS } from "@/components/charts/theme";
import { getLiveValuationsOnce } from "@/lib/quotes";
import { getBudgetOverview } from "@/lib/budget";
import { Delta } from "@/components/LiveBadge";
import { RefreshAll } from "@/components/RefreshAll";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  const user = await requireUser();
  const { forbidden } = await searchParams;
  logView(user, "Visão geral");
  const scope = await getScope(user);
  const [values, series] = await Promise.all([getCurrentValues({ assetIds: scope.assetIds }), getNetWorthSeries({ assetIds: scope.assetIds })]);
  const total = values.reduce((s, a) => s + a.value, 0);
  const liveAssets = values.filter((a) => a.type === "BROKERAGE" || a.type === "STOCK_PORTFOLIO" || a.type === "CRYPTO");
  const live = await getLiveValuationsOnce(liveAssets.map((a) => a.id), { resolve: false });
  const liveRows = liveAssets.map((a) => ({ asset: a, v: live.get(a.id) })).filter((r) => r.v && r.v.quoted > 0) as { asset: (typeof values)[number]; v: NonNullable<ReturnType<typeof live.get>> }[];
  const liveDelta = liveRows.reduce((s, r) => s + r.v.delta, 0);
  const investTotal = values.filter((a) => a.type === "BROKERAGE" || a.type === "STOCK_PORTFOLIO" || a.type === "CRYPTO").reduce((s, a) => s + a.value, 0);
  // the live figure keeps the last recorded value for whatever has no quote
  const liveHint = liveRows.length ? `Cotações do Yahoo Finance para ${liveRows.map((r) => r.asset.name).join(", ")}; os restantes ativos mantêm o último valor registado.` : undefined;
  const liveSecondary = liveRows.length ? { label: "em direto", delta: liveDelta, title: liveHint } : null;
  const liveDay = liveRows.reduce((s, r) => s + r.v.dayChangeEur, 0);
  const quotesAt = liveRows.map((r) => r.v.quotesAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const quotesAtLabel = quotesAt ? quotesAt.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
  const months = series.months;
  const prev = months.length >= 2 ? months[months.length - 2].total : null;
  const delta = prev && Math.abs((total - prev) / prev) <= 1 ? (total - prev) / prev : null;
  const deltaHint = prev ? `${total - prev >= 0 ? "+" : "−"}${fmtEur(Math.abs(total - prev), 0)} vs. mês anterior` : undefined;
  const byType = groupBy(values, (a) => a.type, (a) => a.value).map((g) => ({ name: ASSET_TYPE_LABEL[g.name] ?? g.name, value: g.value, color: TYPE_COLORS[g.name] }));
  const byInst = groupBy(values, (a) => a.institution, (a) => a.value);
  const members = byMember(values);
  const latest = values.filter((a) => a.date).sort((a, b) => (b.date! > a.date! ? 1 : -1))[0];
  const stale = values.filter((a) => isStale(a.date));
  const budget = await getBudgetOverview(new Date().toISOString().slice(0, 7), scope.assetIds);
  const budgetOver = budget.rows.filter((r) => r.status === "over");
  const budgetWarn = budget.rows.filter((r) => r.status === "warn");
  const last12 = months.slice(-12).map((m) => ({ month: m.month, ...Object.fromEntries(Object.entries(m.byType)) }));
  const typeSeries = Object.keys(months.at(-1)?.byType ?? {}).map((t) => ({ key: t, name: ASSET_TYPE_LABEL[t] ?? t, color: TYPE_COLORS[t] }));

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle={latest ? `Última atualização: ${fmtDate(latest.date!)} (${latest.name})` : "Ainda sem valores registados"}
        actions={user.role === "ADMIN" && values.length > 0 ? <a href="/api/relatorio" className="btn" target="_blank" rel="noopener">Relatório PDF</a> : undefined}
      />
      {forbidden && <div className="mb-4"><Alert kind="error">Não tem permissão para essa área.</Alert></div>}
      {values.length === 0 && (
        <div className="mb-4">
          <Alert>
            Ainda não há ativos configurados.{" "}
            {user.role === "ADMIN" ? <Link href="/admin/ativos" className="underline">Criar dados iniciais em Administração → Ativos</Link> : "Peça ao administrador para configurar a aplicação."}
          </Alert>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Património total" value={fmtEur(total, 0)} delta={delta} hint={deltaHint} secondary={liveSecondary && { ...liveSecondary, value: fmtEur(total + liveDelta, 0) }} />
        <StatTile label="Investimentos" value={fmtEur(investTotal, 0)} hint="carteiras + cripto" secondary={liveSecondary && { ...liveSecondary, value: fmtEur(investTotal + liveDelta, 0) }} />
        <StatTile label="PPR" value={fmtEur(values.filter((a) => a.type === "PPR").reduce((s, a) => s + a.value, 0), 0)} />
        <StatTile label="Liquidez" value={fmtEur(values.filter((a) => a.type === "CURRENT_ACCOUNT" || a.type === "CASH").reduce((s, a) => s + a.value, 0), 0)} hint="contas à ordem + dinheiro" />
      </div>
      {(budgetOver.length > 0 || budgetWarn.length > 0) && (
        <div className="mt-4">
          <Alert kind={budgetOver.length ? "error" : "info"}>
            Orçamento deste mês: {budgetOver.length ? `${budgetOver.length} categoria(s) acima do limite (${budgetOver.map((r) => r.name).join(", ")})` : ""}{budgetOver.length && budgetWarn.length ? "; " : ""}{budgetWarn.length ? `${budgetWarn.length} perto do limite (${budgetWarn.map((r) => r.name).join(", ")})` : ""}.{" "}
            <Link href="/despesas#orcamento" className="underline">Ver orçamento</Link>
          </Alert>
        </div>
      )}
      {stale.length > 0 && (
        <div className="mt-4">
          <Alert>
            {stale.length} ativo(s) sem atualização há mais de 45 dias: {stale.map((a) => a.name).join(", ")}.{" "}
            <Link href="/ativos" className="underline">Atualizar</Link>
          </Alert>
        </div>
      )}
      {liveRows.length > 0 && (
        <Card
          title={<span className="flex flex-wrap items-baseline gap-x-2">Carteiras em direto (cotações Yahoo Finance){quotesAtLabel && <span className="text-xs font-normal text-ink-3">cotações de {quotesAtLabel}</span>}</span>}
          className="mt-4"
          action={<span className="flex flex-wrap items-center gap-2 text-xs text-ink-3">património em direto ≈ {fmtEur(total + liveDelta, 0)}{hasRole(user.role, "EDITOR") && <RefreshAll />}<Link href="/rentabilidade" className="btn btn-sm">Ganhos diários</Link></span>}
        >
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Carteira</th><th className="text-right">Último registo</th><th className="text-right">Em direto</th><th className="text-right">Variação</th><th className="text-right">Hoje</th><th className="text-right">Ganho/perda</th></tr></thead>
              <tbody>
                {liveRows.map(({ asset: a, v }) => (
                  <tr key={a.id}>
                    <td><Link href={`/ativos/${a.id}`} className="font-medium hover:underline">{a.name}</Link><div className="text-xs text-ink-3">{v.quoted}/{v.quotable} posições · {fmtDate(v.snapshotDate)}</div></td>
                    <td className="text-right"><Money value={v.snapshotTotal} /></td>
                    <td className="text-right"><Money value={v.liveTotal} className="font-medium" /></td>
                    <td className="text-right"><Delta value={v.delta} pct={v.deltaPct} /></td>
                    <td className="text-right"><Delta value={v.dayChangeEur} pct={v.dayChangePct} /></td>
                    <td className="text-right">{v.unrealizedPnl !== null ? <Delta value={v.unrealizedPnl} pct={v.unrealizedPnlPct} /> : <span className="text-xs text-ink-3">sem custo</span>}</td>
                  </tr>
                ))}
                {liveRows.length > 1 && (
                  <tr className="font-medium">
                    <td>Total</td>
                    <td className="text-right"><Money value={liveRows.reduce((s, r) => s + r.v.snapshotTotal, 0)} /></td>
                    <td className="text-right"><Money value={liveRows.reduce((s, r) => s + r.v.liveTotal, 0)} /></td>
                    <td className="text-right"><Delta value={liveDelta} pct={null} /></td>
                    <td className="text-right"><Delta value={liveDay} pct={null} /></td>
                    <td className="text-right">{liveRows.some((r) => r.v.unrealizedPnl !== null) ? <Delta value={liveRows.reduce((s, r) => s + (r.v.unrealizedPnl ?? 0), 0)} pct={null} /> : ""}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Por tipo de ativo"><Donut data={byType} total={total} centerLabel="total" /></Card>
        <Card title="Por instituição"><Donut data={byInst} total={total} centerLabel="total" /></Card>
        <Card title="Por membro da família"><Donut data={members.map((m) => ({ name: m.name, value: m.value, color: m.color }))} total={total} centerLabel="total" /></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Evolução (12 meses)" className="lg:col-span-3" action={<Link href="/historico" className="text-xs text-accent hover:underline">Ver tudo</Link>}>
          <NetWorthChart data={last12} series={typeSeries} height={260} />
        </Card>
        <Card title="Ativos" className="lg:col-span-2" action={<Link href="/ativos" className="text-xs text-accent hover:underline">Detalhe</Link>}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Ativo</th><th className="text-right">Valor</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {values.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/ativos/${a.id}`} className="font-medium hover:underline">{a.name}</Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {a.owners.map((o) => <Badge key={o.memberId} color={o.color}>{o.memberName}{o.percent < 100 ? ` ${o.percent}%` : ""}</Badge>)}
                      </div>
                    </td>
                    <td className="text-right"><Money value={a.value} /><div className="text-xs text-ink-3">{a.date ? fmtDate(a.date) : "—"}</div></td>
                    <td className="num text-right text-ink-2">{total ? ((a.value / total) * 100).toFixed(1) : "0"} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
