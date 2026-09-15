"use client";
import { useState, useTransition } from "react";
import { resolveInstrument, setInstrumentSymbol } from "@/app/actions/quotes";

export function InstrumentSymbolEditor({ id, symbol }: { id: string; symbol: string | null }) {
  const [value, setValue] = useState(symbol ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input className="w-32 py-1 text-xs" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ex.: VWCE.DE" />
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await setInstrumentSymbol(id, value); setMsg("guardado"); })}>guardar</button>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await resolveInstrument(id); setMsg("symbol" in r ? `→ ${r.symbol}` : `erro: ${r.error}`); if (r.symbol) setValue(r.symbol); })}>auto</button>
      {msg && <span className="text-xs text-ink-3">{msg}</span>}
    </div>
  );
}
