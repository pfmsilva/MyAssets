import Link from "next/link";
import { hasRole, requireUser } from "@/lib/access";
import { getScope } from "@/lib/scope";
import { logView } from "@/lib/activity";
import { getBudgetOverview } from "@/lib/budget";
import { fmtEur, fmtPct, monthLabel } from "@/lib/format";
import { Card, Money, PageHeader, StatTile } from "@/components/ui";
import { BudgetInput } from "@/components/BudgetInput";

export const dynamic = "force-dynamic";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const editable = hasRole(user.role, "EDITOR");
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  logView(user, "Orçamento", { month });
  const scope = await getScope(user);
  const b = await getBudgetOverview(month, scope.assetIds);
  const withLimit = b.rows.filter((r) => r.limit);
  const over = withLimit.filter((r) => r.status === "over");
  const warn = withLimit.filter((r) => r.status === "warn");
  const delta = (cur: number, ref: number) => (ref ? (cur - ref) / ref : null);
  const DeltaCell = ({ cur, base }: { cur: number; base: number }) => {
    const d = delta(cur, base);
    if (d === null) return <span className="text-ink-3">—</span>;
    return <span className={`num ${d > 0.05 ? "text-bad" : d < -0.05 ? "text-good" : "text-ink-2"}`}>{d > 0 ? "+" : ""}{fmtPct(d, 0)}</span>;
  };
  return (
    <>
      <PageHeader
        title="Orçamento"
        subtitle="Limites mensais por categoria de despesa (contas à ordem). Define o limite na coluna da direita; fica guardado automaticamente."
        actions={<div className="flex items-center gap-1"><Link className="btn btn-sm" href={`?month=${shiftMonth(month, -1)}`}>←</Link><span className="px-2 text-sm font-medium">{monthLabel(month)}</span><Link className="btn btn-sm" href={`?month=${shiftMonth(month, 1)}`}>→</Link></div>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Gasto no mês" value={fmtEur(b.totals.spent, 0)} hint={b.totals.limit ? `categorias com limite: ${fmtEur(b.totals.spentBudgeted, 0)} de ${fmtEur(b.totals.limit, 0)} (${fmtPct(b.totals.spentBudgeted / b.totals.limit, 0)})` : "sem limites definidos"} />
        <StatTile label="Vs. mês anterior" value={fmtEur(b.totals.prev, 0)} delta={delta(b.totals.spent, b.totals.prev)} hint={monthLabel(shiftMonth(month, -1))} />
        <StatTile label="Vs. ano anterior" value={fmtEur(b.totals.lastYear, 0)} delta={delta(b.totals.spent, b.totals.lastYear)} hint={monthLabel(shiftMonth(month, -12))} />
        <StatTile label="Alertas" value={String(over.length + warn.length)} hint={over.length ? `${over.length} acima do limite` : warn.length ? `${warn.length} perto do limite` : "tudo dentro do orçamento"} />
      </div>
      {(over.length > 0 || warn.length > 0) && (
        <div className="mt-4 space-y-1">
          {over.map((r) => <p key={r.categoryId} className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad"><b>{r.name}</b>: {fmtEur(r.spent, 0)} gastos, limite {fmtEur(r.limit!, 0)} (excedido em {fmtEur(r.spent - r.limit!, 0)}).</p>)}
          {warn.map((r) => <p key={r.categoryId} className="rounded-md bg-warn/10 px-3 py-2 text-sm text-warn"><b>{r.name}</b>: {fmtPct(r.pct!, 0)} do limite usado ({fmtEur(r.spent, 0)} de {fmtEur(r.limit!, 0)}).</p>)}
        </div>
      )}
      <Card title={`Execução em ${monthLabel(month)}`} className="mt-4">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Categoria</th><th className="w-1/3">Execução</th><th className="text-right">Gasto</th><th className="text-right">Mês anterior</th><th className="text-right">Ano anterior</th><th className="text-right">Limite mensal</th></tr></thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.categoryId}>
                  <td><span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.categoryId === "__none" ? <Link href={`/movimentos?category=none&month=${month}&sign=out`} className="hover:underline">{r.name}</Link> : <Link href={`/movimentos?category=${r.categoryId}&month=${month}`} className="hover:underline">{r.name}</Link>}</span></td>
                  <td>
                    {r.limit ? (
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-2" title={`${fmtPct(r.pct!, 0)} do limite`}>
                        <div className={`h-full ${r.status === "over" ? "bg-bad" : r.status === "warn" ? "bg-warn" : "bg-good"}`} style={{ width: `${Math.min(100, r.pct! * 100)}%` }} />
                        {b.daysElapsedPct > 0 && b.daysElapsedPct < 1 && <div className="absolute inset-y-0 w-px bg-ink-3" style={{ left: `${b.daysElapsedPct * 100}%` }} title="dia do mês" />}
                      </div>
                    ) : <span className="text-xs text-ink-3">sem limite</span>}
                  </td>
                  <td className="text-right"><Money value={r.spent} />{r.limit ? <div className="text-xs text-ink-3">{fmtPct(r.pct!, 0)} · resta {fmtEur(Math.max(0, r.limit - r.spent), 0)}</div> : null}</td>
                  <td className="text-right"><Money value={r.prev} /><div className="text-xs"><DeltaCell cur={r.spent} base={r.prev} /></div></td>
                  <td className="text-right"><Money value={r.lastYear} /><div className="text-xs"><DeltaCell cur={r.spent} base={r.lastYear} /></div></td>
                  <td className="text-right">{r.categoryId === "__none" ? "" : editable ? <BudgetInput categoryId={r.categoryId} value={r.limit} /> : r.limit ? fmtEur(r.limit, 0) : <span className="text-xs text-ink-3">—</span>}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td>Total</td>
                <td>{b.totals.limit ? <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2"><div className={`h-full ${b.totals.spentBudgeted > b.totals.limit ? "bg-bad" : "bg-good"}`} style={{ width: `${Math.min(100, (b.totals.spentBudgeted / b.totals.limit) * 100)}%` }} /></div> : null}</td>
                <td className="text-right"><Money value={b.totals.spent} />{b.totals.limit ? <div className="text-xs font-normal text-ink-3">com limite: {fmtEur(b.totals.spentBudgeted, 0)}</div> : null}</td>
                <td className="text-right"><Money value={b.totals.prev} /></td>
                <td className="text-right"><Money value={b.totals.lastYear} /></td>
                <td className="text-right num">{b.totals.limit ? fmtEur(b.totals.limit, 0) : ""}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">A linha vertical na barra marca o dia do mês: à esquerda dela está dentro do ritmo. Reembolsos reduzem o gasto da categoria.</p>
      </Card>
    </>
  );
}
