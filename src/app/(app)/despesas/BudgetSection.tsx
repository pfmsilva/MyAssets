import Link from "next/link";
import { getBudgetOverview } from "@/lib/budget";
import { fmtEur, fmtPct, monthLabel } from "@/lib/format";
import { Card, Money } from "@/components/ui";
import { BudgetInput } from "@/components/BudgetInput";

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

const delta = (cur: number, ref: number) => (ref ? (cur - ref) / ref : null);

function DeltaCell({ cur, base }: { cur: number; base: number }) {
  const d = delta(cur, base);
  if (d === null) return <span className="text-ink-3">—</span>;
  return <span className={`num ${d > 0.05 ? "text-bad" : d < -0.05 ? "text-good" : "text-ink-2"}`}>{d > 0 ? "+" : ""}{fmtPct(d, 0)}</span>;
}

/** Monthly budget per category, shown inside the expenses page. */
export async function BudgetSection({ month, assetIds, editable, monthLink }: { month: string; assetIds?: string[]; editable: boolean; monthLink: (month: string) => string }) {
  const b = await getBudgetOverview(month, assetIds);
  const withLimit = b.rows.filter((r) => r.limit);
  const over = withLimit.filter((r) => r.status === "over");
  const warn = withLimit.filter((r) => r.status === "warn");
  return (
    <Card
      title={<span id="orcamento" className="scroll-mt-20">Orçamento de {monthLabel(month)}</span>}
      className="mt-4"
      action={
        <div className="flex items-center gap-1">
          <Link className="btn btn-sm" href={monthLink(shiftMonth(month, -1))} scroll={false}>←</Link>
          <span className="px-1 text-sm font-medium">{monthLabel(month)}</span>
          <Link className="btn btn-sm" href={monthLink(shiftMonth(month, 1))} scroll={false}>→</Link>
        </div>
      }
    >
      <p className="mb-3 text-sm text-ink-2">
        Gasto no mês: <b className="num">{fmtEur(b.totals.spent, 0)}</b>
        {b.totals.limit ? <> · categorias com limite: <span className="num">{fmtEur(b.totals.spentBudgeted, 0)}</span> de <span className="num">{fmtEur(b.totals.limit, 0)}</span> ({fmtPct(b.totals.spentBudgeted / b.totals.limit, 0)})</> : " · ainda sem limites definidos"}
        {" · "}mês anterior <span className="num">{fmtEur(b.totals.prev, 0)}</span> (<DeltaCell cur={b.totals.spent} base={b.totals.prev} />)
        {" · "}ano anterior <span className="num">{fmtEur(b.totals.lastYear, 0)}</span> (<DeltaCell cur={b.totals.spent} base={b.totals.lastYear} />)
      </p>
      {(over.length > 0 || warn.length > 0) && (
        <div className="mb-3 space-y-1">
          {over.map((r) => <p key={r.categoryId} className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad"><b>{r.name}</b>: {fmtEur(r.spent, 0)} gastos, limite {fmtEur(r.limit!, 0)} (excedido em {fmtEur(r.spent - r.limit!, 0)}).</p>)}
          {warn.map((r) => <p key={r.categoryId} className="rounded-md bg-warn/10 px-3 py-2 text-sm text-warn"><b>{r.name}</b>: {fmtPct(r.pct!, 0)} do limite usado ({fmtEur(r.spent, 0)} de {fmtEur(r.limit!, 0)}).</p>)}
        </div>
      )}
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
              <td className="num text-right">{b.totals.limit ? fmtEur(b.totals.limit, 0) : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">O limite guarda-se ao escrever. A linha vertical na barra marca o dia do mês: à esquerda dela está dentro do ritmo. Reembolsos reduzem o gasto da categoria.</p>
    </Card>
  );
}
