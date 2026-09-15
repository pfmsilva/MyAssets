import Link from "next/link";
import { requireUser } from "@/lib/access";
import { byMember, getCurrentValues, getNetWorthSeries, groupBy } from "@/lib/analytics";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, isStale } from "@/lib/format";
import { Card, PageHeader, StatTile, Money, Badge, Alert } from "@/components/ui";
import { Donut } from "@/components/charts/Donut";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { TYPE_COLORS } from "@/components/charts/theme";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ forbidden?: string }> }) {
  await requireUser();
  const { forbidden } = await searchParams;
  const [values, series] = await Promise.all([getCurrentValues(), getNetWorthSeries()]);
  const total = values.reduce((s, a) => s + a.value, 0);
  const months = series.months;
  const prev = months.length >= 2 ? months[months.length - 2].total : null;
  const delta = prev && Math.abs((total - prev) / prev) <= 1 ? (total - prev) / prev : null;
  const deltaHint = prev ? `${total - prev >= 0 ? "+" : "−"}${fmtEur(Math.abs(total - prev), 0)} vs. mês anterior` : undefined;
  const byType = groupBy(values, (a) => a.type, (a) => a.value).map((g) => ({ name: ASSET_TYPE_LABEL[g.name] ?? g.name, value: g.value, color: TYPE_COLORS[g.name] }));
  const byInst = groupBy(values, (a) => a.institution, (a) => a.value);
  const members = byMember(values);
  const latest = values.filter((a) => a.date).sort((a, b) => (b.date! > a.date! ? 1 : -1))[0];
  const stale = values.filter((a) => isStale(a.date));
  const last12 = months.slice(-12).map((m) => ({ month: m.month, ...Object.fromEntries(Object.entries(m.byType)) }));
  const typeSeries = Object.keys(months.at(-1)?.byType ?? {}).map((t) => ({ key: t, name: ASSET_TYPE_LABEL[t] ?? t, color: TYPE_COLORS[t] }));

  return (
    <>
      <PageHeader title="Visão geral" subtitle={latest ? `Última atualização: ${fmtDate(latest.date!)} (${latest.name})` : "Ainda sem valores registados"} />
      {forbidden && <div className="mb-4"><Alert kind="error">Não tem permissão para essa área.</Alert></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Património total" value={fmtEur(total, 0)} delta={delta} hint={deltaHint} />
        <StatTile label="Investimentos" value={fmtEur(values.filter((a) => a.type === "BROKERAGE" || a.type === "CRYPTO").reduce((s, a) => s + a.value, 0), 0)} hint="carteiras + cripto" />
        <StatTile label="PPR" value={fmtEur(values.filter((a) => a.type === "PPR").reduce((s, a) => s + a.value, 0), 0)} />
        <StatTile label="Liquidez" value={fmtEur(values.filter((a) => a.type === "CURRENT_ACCOUNT" || a.type === "CASH").reduce((s, a) => s + a.value, 0), 0)} hint="contas à ordem + dinheiro" />
      </div>
      {stale.length > 0 && (
        <div className="mt-4">
          <Alert>
            {stale.length} ativo(s) sem atualização há mais de 45 dias: {stale.map((a) => a.name).join(", ")}.{" "}
            <Link href="/ativos" className="underline">Atualizar</Link>
          </Alert>
        </div>
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
