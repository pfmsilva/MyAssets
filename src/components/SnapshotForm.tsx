"use client";
import { useActionState, useState } from "react";
import { createSnapshot, ActionState } from "@/app/actions/snapshots";
import { todayIso } from "@/lib/format";

type Pos = { name: string; isin: string; quantity: string; price: string; currency: string; valueEur: string };
const empty = (): Pos => ({ name: "", isin: "", quantity: "", price: "", currency: "EUR", valueEur: "" });

export function SnapshotForm({ assetId, withPositions, initialPositions = [] }: { assetId: string; withPositions: boolean; initialPositions?: Pos[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createSnapshot, {});
  const [usePos, setUsePos] = useState(false);
  const [positions, setPositions] = useState<Pos[]>(initialPositions.length ? initialPositions : [empty()]);
  const update = (i: number, k: keyof Pos, v: string) =>
    setPositions((ps) =>
      ps.map((p, j) => {
        if (j !== i) return p;
        const n = { ...p, [k]: v };
        if ((k === "quantity" || k === "price") && n.quantity && n.price && n.currency === "EUR") n.valueEur = (Number(n.quantity) * Number(n.price)).toFixed(2);
        return n;
      }),
    );
  const total = positions.reduce((s, p) => s + (Number(p.valueEur) || 0), 0);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="assetId" value={assetId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1"><label htmlFor="date">Data</label><input id="date" name="date" type="date" defaultValue={todayIso()} required /></div>
        <div className="flex flex-col gap-1"><label htmlFor="value">Valor total (EUR)</label><input id="value" name="value" type="number" step="0.01" inputMode="decimal" required={!usePos} value={usePos ? total.toFixed(2) : undefined} readOnly={usePos} placeholder="0,00" /></div>
      </div>
      <div className="flex flex-col gap-1"><label htmlFor="note">Nota (opcional)</label><input id="note" name="note" placeholder="ex.: extrato de setembro" /></div>
      {withPositions && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={usePos} onChange={(e) => setUsePos(e.target.checked)} /> Detalhar posições (o total é a soma)</label>
          {usePos && (
            <>
              <input type="hidden" name="positions" value={JSON.stringify(positions.filter((p) => p.name.trim()).map((p) => ({ name: p.name, isin: p.isin || undefined, quantity: p.quantity ? Number(p.quantity) : undefined, price: p.price ? Number(p.price) : undefined, currency: p.currency || "EUR", valueEur: Number(p.valueEur) || 0 })))} />
              <div className="space-y-2">
                {positions.map((p, i) => (
                  <div key={i} className="grid grid-cols-6 gap-1 text-xs sm:grid-cols-12">
                    <input className="col-span-6 sm:col-span-4" placeholder="Nome (ex.: BTC, ETF …)" value={p.name} onChange={(e) => update(i, "name", e.target.value)} />
                    <input className="col-span-3 sm:col-span-2" placeholder="ISIN/ticker" value={p.isin} onChange={(e) => update(i, "isin", e.target.value)} />
                    <input className="col-span-3 sm:col-span-2" placeholder="Qtd." type="number" step="any" value={p.quantity} onChange={(e) => update(i, "quantity", e.target.value)} />
                    <input className="col-span-3 sm:col-span-2" placeholder="Preço" type="number" step="any" value={p.price} onChange={(e) => update(i, "price", e.target.value)} />
                    <input className="col-span-2 sm:col-span-1" placeholder="Valor €" type="number" step="0.01" value={p.valueEur} onChange={(e) => update(i, "valueEur", e.target.value)} />
                    <button type="button" className="btn btn-sm col-span-1" onClick={() => setPositions((ps) => ps.filter((_, j) => j !== i))} aria-label="Remover">×</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setPositions((ps) => [...ps, empty()])}>+ posição</button>
            </>
          )}
        </div>
      )}
      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      {state.ok && <p className="text-sm text-good">{state.message}</p>}
      <button className="btn btn-primary" disabled={pending} type="submit">{pending ? "A guardar…" : "Registar valor"}</button>
    </form>
  );
}
