import Link from "next/link";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getNetWorthSeries } from "@/lib/analytics";
import { ASSET_TYPE_LABEL, fmtEur, monthLabel } from "@/lib/format";
import { Card, Money, PageHeader } from "@/components/ui";
import { NetWorthChart } from "@/components/charts/NetWorthChart";
import { SERIES, TYPE_COLORS } from "@/components/charts/theme";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ by?: string; range?: string }> }) {
  await requireUser();
  const { by = "type", range = "24" } = await searchParams;
  const [series, members] = await Promise.all([getNetWorthSeries(), prisma.member.findMany({ orderBy: { sortOrder: "asc" } })]);
  const n = range === "all" ? series.months.length : Number(range);
  const months = series.months.slice(-n);
  let data: Record<string, number | string>[] = [];
  let defs: { key: string; name: string; color?: string }[] = [];
  if (by === "member") {
    data = months.map((m) => ({ month: m.month, ...m.byMember }));
    defs = members.map((m) => ({ key: m.id, name: m.name, color: m.color }));
  } else if (by === "asset") {
    data = months.map((m) => ({ month: m.month, ...m.byAsset }));
    defs = series.assets.map((a, i) => ({ key: a.id, name: a.name, color: SERIES[i % SERIES.length] }));
  } else {
    data = months.map((m) => ({ month: m.month, ...m.byType }));
    defs = Object.keys(months.at(-1)?.byType ?? {}).map((t) => ({ key: t, name: ASSET_TYPE_LABEL[t] ?? t, color: TYPE_COLORS[t] }));
  }
  const rows = [...months].reverse();
  const opt = (k: string, v: string, label: string, cur: string) => (
    <Link key={`${k}-${v}`} href={`?by=${k === "by" ? v : by}&range=${k === "range" ? v : range}`} className={`btn btn-sm ${cur === v ? "btn-primary" : ""}`}>{label}</Link>
  );
  return (
    <>
      <PageHeader
        title="Evolução do património"
        subtitle="Valor no fim de cada mês (o último valor conhecido de cada ativo é mantido até haver um novo registo)."
        actions={<>
          <div className="flex gap-1">{opt("by", "type", "Por tipo", by)}{opt("by", "member", "Por membro", by)}{opt("by", "asset", "Por ativo", by)}</div>
          <div className="flex gap-1">{opt("range", "12", "12 m", range)}{opt("range", "24", "24 m", range)}{opt("range", "60", "5 a", range)}{opt("range", "all", "Tudo", range)}</div>
        </>}
      />
      <Card><NetWorthChart data={data} series={defs} height={360} /></Card>
      <Card title="Valores mensais" className="mt-4">
        <div className="max-h-[32rem] overflow-auto">
          <table className="table">
            <thead><tr><th>Mês</th><th className="text-right">Total</th><th className="text-right">Variação</th><th className="text-right">%</th></tr></thead>
            <tbody>
              {rows.map((m, i) => {
                const prev = rows[i + 1]?.total;
                const d = prev !== undefined ? m.total - prev : null;
                return (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="text-right"><Money value={m.total} /></td>
                    <td className="text-right">{d !== null ? <Money value={d} signed /> : "—"}</td>
                    <td className={`num text-right ${d !== null && d < 0 ? "text-bad" : "text-good"}`}>{d !== null && prev ? `${((d / prev) * 100).toFixed(1)} %` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">Total atual: {fmtEur(months.at(-1)?.total ?? 0)}</p>
      </Card>
    </>
  );
}
