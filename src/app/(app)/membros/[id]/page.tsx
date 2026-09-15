import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { canSeeMember, getScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { getCurrentValues, getNetWorthSeries, groupBy } from "@/lib/analytics";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur } from "@/lib/format";
import { Card, PageHeader, StatTile, Money } from "@/components/ui";
import { Donut } from "@/components/charts/Donut";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { TYPE_COLORS } from "@/components/charts/theme";

export const dynamic = "force-dynamic";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const scope = await getScope(user);
  const member = await prisma.member.findUnique({ where: { id } });
  if (!member || !canSeeMember(scope, id)) notFound();
  logView(user, "Membro", { member: member.name });
  const [values, series] = await Promise.all([getCurrentValues({ assetIds: scope.assetIds }), getNetWorthSeries({ memberId: id, assetIds: scope.assetIds })]);
  const mine = values
    .map((a) => ({ ...a, share: (a.owners.find((o) => o.memberId === id)?.percent ?? 0) / 100 }))
    .filter((a) => a.share > 0)
    .map((a) => ({ ...a, shareValue: a.value * a.share }));
  const total = mine.reduce((s, a) => s + a.shareValue, 0);
  const months = series.months;
  const prev = months.length >= 2 ? months[months.length - 2].total : null;
  const data = months.map((m) => ({ month: m.month, ...m.byType }));
  const typeSeries = Object.keys(months.at(-1)?.byType ?? {}).map((t) => ({ key: t, name: ASSET_TYPE_LABEL[t] ?? t, color: TYPE_COLORS[t] }));
  return (
    <>
      <PageHeader title={member.name} subtitle={<Link href="/membros" className="text-accent hover:underline">← Família</Link>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Património" value={fmtEur(total, 0)} delta={prev && Math.abs((total - prev) / prev) <= 1 ? (total - prev) / prev : null} hint="vs. mês anterior" />
        <StatTile label="Ativos" value={String(mine.length)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Distribuição por tipo"><Donut data={groupBy(mine, (a) => a.type, (a) => a.shareValue).map((g) => ({ name: ASSET_TYPE_LABEL[g.name] ?? g.name, value: g.value, color: TYPE_COLORS[g.name] }))} /></Card>
        <Card title="Distribuição por ativo"><Donut data={mine.map((a) => ({ name: a.name, value: a.shareValue }))} /></Card>
      </div>
      <Card title="Evolução" className="mt-4"><NetWorthChart data={data} series={typeSeries} /></Card>
      <Card title="Ativos" className="mt-4">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Ativo</th><th>Tipo</th><th className="text-right">Quota</th><th className="text-right">Valor da quota</th><th className="text-right">Data</th></tr></thead>
            <tbody>
              {mine.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/ativos/${a.id}`} className="font-medium hover:underline">{a.name}</Link><div className="text-xs text-ink-3">{a.institution}</div></td>
                  <td className="text-ink-2">{ASSET_TYPE_LABEL[a.type]}</td>
                  <td className="num text-right">{a.share * 100} %</td>
                  <td className="text-right"><Money value={a.shareValue} /></td>
                  <td className="text-right text-ink-3">{a.date ? fmtDate(a.date) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
