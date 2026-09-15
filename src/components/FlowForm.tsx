"use client";
import { useState, useTransition } from "react";
import { addManualFlow, deleteManualFlow } from "@/app/actions/budgets";
import { fmtDate, fmtEur, todayIso } from "@/lib/format";

export function FlowForm({ assetId, flows }: { assetId: string; flows: { id: string; date: string; amount: number; description: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-ink-3">Entradas (+) e saídas (−) de capital que não constem dos movimentos importados; usadas no cálculo da rentabilidade.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1"><label>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><label>Montante (EUR)</label><input type="number" step="0.01" placeholder="+1000 ou -500" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" /></div>
        <div className="flex min-w-32 flex-1 flex-col gap-1"><label>Nota</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: transferência do BPI" /></div>
        <button type="button" className="btn btn-primary" disabled={pending || !amount} onClick={() => start(async () => { try { await addManualFlow(assetId, date, Number(amount.replace(",", ".")), note); setAmount(""); setNote(""); setMsg("Fluxo registado."); } catch (e) { setMsg(e instanceof Error ? e.message : "Erro"); } })}>Registar</button>
      </div>
      {msg && <p className="text-xs text-ink-2">{msg}</p>}
      {flows.length > 0 && (
        <ul className="divide-y divide-border/60 text-xs">
          {flows.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-1">
              <span>{fmtDate(f.date)} · {f.description}</span>
              <span className="flex items-center gap-2"><span className={`num ${f.amount >= 0 ? "text-good" : "text-bad"}`}>{fmtEur(f.amount)}</span><button type="button" className="text-ink-3 hover:text-bad" disabled={pending} onClick={() => start(() => deleteManualFlow(f.id))}>×</button></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
