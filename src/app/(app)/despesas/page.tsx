import Link from "next/link";
import { hasRole, requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { assetScopeWhere, canSeeAsset, getScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { getExpenseSeries, getNetWorthSeries } from "@/lib/analytics";
import { fmtEur, fmtPct, monthLabel } from "@/lib/format";
import { Card, Money, PageHeader, StatTile } from "@/components/ui";
import { CategoryBars, IncomeExpenseBars, SavingsLine } from "@/components/charts/ExpenseCharts";
import { Donut } from "@/components/charts/Donut";
import { BudgetSection } from "./BudgetSection";
import { FilterLinks } from "@/components/Filters";

export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ months?: string; asset?: string; month?: string }> }) {
  const user = await requireUser();
  const { months = "12", asset: assetParam = "", month: monthParam } = await searchParams;
  const budgetMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7);
  const scope = await getScope(user);
  const asset = assetParam && canSeeAsset(scope, assetParam) ? assetParam : "";
  const n = Number(months) || 12;
  logView(user, "Despesas e orçamento", { months: n, asset: asset || null, mes: budgetMonth });
  const [exp, nw, assets] = await Promise.all([getExpenseSeries({ months: n, assetId: asset || undefined, assetIds: scope.assetIds }), getNetWorthSeries({ assetIds: scope.assetIds }), prisma.asset.findMany({ where: { type: "CURRENT_ACCOUNT", active: true, ...assetScopeWhere(scope) }, orderBy: { sortOrder: "asc" } })]);
  const cats = exp.categories;
  const top = cats.slice(0, 8).map((c) => c.name);
  const barData = exp.months.map((m) => {
    const row: Record<string, number | string> = { month: m.month };
    let other = 0;
    for (const [k, v] of Object.entries(m.byCategory)) {
      if (v <= 0) continue;
      if (top.includes(k)) row[k] = Math.round(v * 100) / 100;
      else other += v;
    }
    if (cats.length > 8 && other > 0) row["Outras"] = Math.round(other * 100) / 100;
    return row;
  });
  const nwByMonth = new Map(nw.months.map((m) => [m.month, m.total]));
  const savingsData = exp.months.map((m) => {
    const [y, mm] = m.month.split("-").map(Number);
    const prevKey = `${mm === 1 ? y - 1 : y}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
    const cur = nwByMonth.get(m.month);
    const prev = nwByMonth.get(prevKey);
    return { month: m.month, savings: Math.round(m.savings * 100) / 100, savingsRate: m.savingsRate, wealthDelta: cur !== undefined && prev !== undefined ? Math.round((cur - prev) * 100) / 100 : null };
  });
  const totIncome = exp.months.reduce((s, m) => s + m.income, 0);
  const totExpense = exp.months.reduce((s, m) => s + m.expense, 0);
  const totInvest = exp.months.reduce((s, m) => s + m.investment, 0);
  const uncat = exp.months.reduce((s, m) => s + m.uncategorizedIn, 0);
  const avg = exp.months.length ? totExpense / exp.months.length : 0;
  const qs = (over: { months?: string; asset?: string; month?: string }) => {
    const p = new URLSearchParams();
    const m = over.months ?? months;
    const a = over.asset ?? asset;
    const mo = over.month ?? monthParam ?? "";
    if (m !== "12") p.set("months", m);
    if (a) p.set("asset", a);
    if (mo) p.set("month", mo);
    const q = p.toString();
    return q ? `?${q}` : "?";
  };

  return (
    <>
      <PageHeader
        title="Despesas, poupança e orçamento"
        subtitle="Baseado nos movimentos importados das contas à ordem. Transferências e investimentos não contam como despesa."
        actions={<>
          <FilterLinks options={["3", "6", "12", "24"].map((v) => ({ value: v, label: `${v} m`, href: qs({ months: v }) }))} current={months} />
          <FilterLinks options={[{ value: "", label: "Todas", href: qs({ asset: "" }) }, ...assets.map((a) => ({ value: a.id, label: a.name, href: qs({ asset: a.id }) }))]} current={asset} />
        </>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Rendimentos" value={fmtEur(totIncome, 0)} hint={`${exp.months.length} meses`} />
        <StatTile label="Despesas" value={fmtEur(totExpense, 0)} hint={`média ${fmtEur(avg, 0)}/mês`} />
        <StatTile label="Taxa de poupança" value={totIncome > 0 ? fmtPct((totIncome - totExpense) / totIncome) : "—"} hint="(rend. − desp.) / rend." />
        <StatTile label="Investido" value={fmtEur(totInvest, 0)} hint="transferências p/ investimentos" />
      </div>
      {uncat > 0 && (
        <p className="mt-3 text-xs text-ink-3">Entradas sem categoria (não contadas como rendimento): {fmtEur(uncat)}. <Link href="/movimentos?category=none&sign=in" className="text-accent underline">Categorizar</Link></p>
      )}
      <BudgetSection month={budgetMonth} assetIds={scope.assetIds} editable={hasRole(user.role, "EDITOR")} monthLink={(m) => qs({ month: m })} />
      <Card title="Despesas por categoria" className="mt-4"><CategoryBars data={barData} categories={cats} /></Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Rendimentos vs despesas"><IncomeExpenseBars data={exp.months.map((m) => ({ month: m.month, income: Math.round(m.income), expense: Math.round(m.expense), investment: Math.round(m.investment) }))} /></Card>
        <Card title="Poupança mensal (duas métricas)"><SavingsLine data={savingsData} /><p className="mt-2 text-xs text-ink-3">Poupança = rendimentos − despesas categorizadas. Variação do património = diferença do total de ativos entre meses (inclui valorização de mercado).</p></Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Distribuição no período"><Donut data={cats.map((c) => ({ name: c.name, value: Math.max(0, c.value), color: c.color }))} centerLabel="despesas" /></Card>
        <Card title="Tabela mensal">
          <div className="max-h-96 overflow-auto">
            <table className="table">
              <thead><tr><th>Mês</th><th className="text-right">Rend.</th><th className="text-right">Desp.</th><th className="text-right">Poupança</th><th className="text-right">Taxa</th></tr></thead>
              <tbody>
                {[...exp.months].reverse().map((m) => (
                  <tr key={m.month}>
                    <td><Link href={`/movimentos?month=${m.month}`} className="hover:underline">{monthLabel(m.month)}</Link></td>
                    <td className="text-right"><Money value={m.income} /></td>
                    <td className="text-right"><Money value={m.expense} /></td>
                    <td className="text-right"><Money value={m.savings} signed /></td>
                    <td className="num text-right text-ink-2">{m.savingsRate != null ? fmtPct(m.savingsRate) : "—"}</td>
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
