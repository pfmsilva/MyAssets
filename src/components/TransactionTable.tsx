"use client";
import { useState, useTransition } from "react";
import { createRuleAndApply, setTransactionCategory } from "@/app/actions/transactions";
import { fmtDate, fmtEur } from "@/lib/format";

export type TxRow = { id: string; date: string; description: string; amount: number; balanceAfter: number | null; status: string; categoryId: string | null; assetName: string; kind: string | null };
export type CategoryOpt = { id: string; name: string; kind: string; color: string };

export function TransactionTable({ rows, categories, editable, showAsset = true }: { rows: TxRow[]; categories: CategoryOpt[]; editable: boolean; showAsset?: boolean }) {
  const [pending, start] = useTransition();
  const [ruleFor, setRuleFor] = useState<TxRow | null>(null);
  const [pattern, setPattern] = useState("");
  const [ruleCat, setRuleCat] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-3">Sem movimentos.</p>;
  return (
    <div className="overflow-x-auto">
      {msg && <p className="mb-2 text-sm text-good">{msg}</p>}
      {ruleFor && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
          <div className="flex min-w-48 flex-1 flex-col gap-1"><label>Padrão (contido na descrição)</label><input value={pattern} onChange={(e) => setPattern(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><label>Categoria</label>
            <select value={ruleCat} onChange={(e) => setRuleCat(e.target.value)}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>
          <button className="btn btn-primary btn-sm" disabled={pending || !pattern || !ruleCat} onClick={() => start(async () => { const n = await createRuleAndApply(pattern, ruleCat); setMsg(`Regra criada e aplicada a ${n} movimento(s).`); setRuleFor(null); })}>Criar regra</button>
          <button className="btn btn-sm" onClick={() => setRuleFor(null)}>Cancelar</button>
        </div>
      )}
      <table className="table">
        <thead><tr><th>Data</th>{showAsset && <th>Conta</th>}<th>Descrição</th><th className="text-right">Montante</th><th>Categoria</th></tr></thead>
        <tbody>
          {rows.map((t) => {
            const cat = categories.find((c) => c.id === t.categoryId);
            return (
              <tr key={t.id} className={t.status === "PENDING" ? "opacity-60" : ""}>
                <td className="whitespace-nowrap text-ink-2">{fmtDate(t.date)}</td>
                {showAsset && <td className="whitespace-nowrap text-ink-2">{t.assetName}</td>}
                <td className="max-w-[28ch] truncate sm:max-w-[48ch]" title={t.description}>{t.description}{t.status === "PENDING" && <span className="ml-1 text-xs text-warn">(pendente)</span>}</td>
                <td className={`num whitespace-nowrap text-right font-medium ${t.amount < 0 ? "" : "text-good"}`}>{fmtEur(t.amount)}</td>
                <td>
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat?.color ?? "var(--border)" }} />
                      <select className="max-w-[12rem] py-1 text-xs" value={t.categoryId ?? ""} disabled={pending} onChange={(e) => start(() => setTransactionCategory(t.id, e.target.value || null))}>
                        <option value="">Sem categoria</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button type="button" className="btn btn-sm" title="Criar regra a partir desta descrição" onClick={() => { setRuleFor(t); setPattern(t.description.replace(/^\d{2}\/\d{2}\s+/, "").replace(/\d{6,}\/\d+\s*/g, "").trim().slice(0, 40)); setRuleCat(t.categoryId ?? ""); }}>regra</button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-ink-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: cat?.color ?? "var(--border)" }} />{cat?.name ?? "—"}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
