"use client";
import { useState, useTransition } from "react";
import { saveTargets, setClass } from "@/app/actions/allocation";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, fmtEur, fmtPct } from "@/lib/format";

export type AllocRow = {
  assetClass: string;
  current: number;
  currentPct: number;
  targetPct: number | null;
  driftPp: number | null;
  delta: number | null;
  contribute: number | null;
  status: "ok" | "over" | "under" | "none";
  sources: { name: string; value: number }[];
};

const CLASSES = ["EQUITY", "BOND", "GOLD", "REAL_ESTATE", "CRYPTO", "MIXED", "CASH", "OTHER"];

export function AllocationEditor({ rows, total, bandPp, editable }: { rows: AllocRow[]; total: number; bandPp: number; editable: boolean }) {
  const byClass = new Map(rows.map((r) => [r.assetClass, r]));
  const [targets, setTargets] = useState<Record<string, string>>(Object.fromEntries(CLASSES.map((c) => [c, byClass.get(c)?.targetPct != null ? String(Math.round((byClass.get(c)!.targetPct as number) * 1000) / 10) : ""])));
  const [band, setBand] = useState(String(bandPp));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const sum = CLASSES.reduce((s, c) => s + (Number(targets[c]) || 0), 0);
  const save = () =>
    start(async () => {
      try {
        await saveTargets(Object.fromEntries(CLASSES.map((c) => [c, Number(targets[c]) || 0])), Number(band) || 0);
        setMsg("Alocação-alvo guardada.");
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Erro ao guardar.");
      }
    });
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Classe</th><th className="w-1/3">Atual vs. alvo</th><th className="text-right">Atual</th><th className="text-right">Peso</th><th className="text-right">Alvo</th><th className="text-right">Desvio</th><th className="text-right">Ajustar</th><th className="text-right">Só com reforço</th></tr>
          </thead>
          <tbody>
            {CLASSES.map((c) => {
              const r = byClass.get(c);
              const cur = r?.currentPct ?? 0;
              const tgt = Number(targets[c]) / 100 || 0;
              const color = ASSET_CLASS_COLOR[c];
              if (!r && !tgt && !editable) return null;
              return (
                <tr key={c}>
                  <td><span className="inline-flex items-center gap-2 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{ASSET_CLASS_LABEL[c]}</span></td>
                  <td>
                    <div className="relative h-4 w-full rounded-full bg-surface-2" title={`atual ${fmtPct(cur, 1)} · alvo ${fmtPct(tgt, 1)}`}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, cur * 100)}%`, background: color }} />
                      {tgt > 0 && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${Math.min(100, tgt * 100)}%` }} />}
                    </div>
                  </td>
                  <td className="num text-right">{fmtEur(r?.current ?? 0, 0)}</td>
                  <td className="num text-right">{fmtPct(cur, 1)}</td>
                  <td className="text-right">
                    {editable ? (
                      <span className="inline-flex items-center gap-1">
                        <input className="w-16 py-1 text-right text-xs" type="number" min="0" max="100" step="0.5" value={targets[c]} onChange={(e) => setTargets({ ...targets, [c]: e.target.value })} placeholder="—" />
                        <span className="text-xs text-ink-3">%</span>
                      </span>
                    ) : (
                      <span className="num">{tgt ? fmtPct(tgt, 1) : "—"}</span>
                    )}
                  </td>
                  <td className={`num text-right ${r?.status === "ok" ? "text-good" : r?.status === "none" ? "text-ink-3" : "text-bad"}`}>{r?.driftPp != null ? `${r.driftPp > 0 ? "+" : ""}${r.driftPp.toFixed(1)} pp` : "—"}</td>
                  <td className="text-right text-ink-2">{r?.delta != null && Math.abs(r.delta) >= 1 ? <span className="num whitespace-nowrap">{r.delta > 0 ? "comprar " : "vender "}{fmtEur(Math.abs(r.delta), 0)}</span> : r?.targetPct != null ? "—" : ""}</td>
                  <td className="num text-right text-ink-2">{r?.contribute ? `+${fmtEur(r.contribute, 0)}` : r?.targetPct != null ? "—" : ""}</td>
                </tr>
              );
            })}
            <tr className="font-medium">
              <td>Total</td><td></td>
              <td className="num text-right">{fmtEur(total, 0)}</td>
              <td className="num text-right">100 %</td>
              <td className={`num text-right ${sum > 0 && Math.abs(sum - 100) > 0.5 ? "text-bad" : ""}`}>{sum ? `${sum.toFixed(1)} %` : "—"}</td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="band">Tolerância (pontos percentuais)</label>
            <input id="band" className="w-24" type="number" min="0" step="0.5" value={band} onChange={(e) => setBand(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary" disabled={pending || (sum > 0 && Math.abs(sum - 100) > 0.5)} onClick={save}>{pending ? "A guardar…" : "Guardar alocação-alvo"}</button>
          {sum > 0 && Math.abs(sum - 100) > 0.5 && <span className="text-sm text-bad">A soma tem de ser 100 % (atual: {sum.toFixed(1)} %).</span>}
          {msg && <span className="text-sm text-ink-2">{msg}</span>}
        </div>
      )}
    </div>
  );
}

export function ClassFixer({ items, editable }: { items: { instrumentId: string | null; assetId: string | null; name: string; value: number; assetName: string; assetClass: string }[]; editable: boolean }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Record<string, string>>({});
  if (!items.length) return <p className="text-sm text-ink-2">Todas as posições têm classe confirmada.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-2">Estas posições foram classificadas automaticamente pelo nome. Confirme ou corrija: a classificação fica guardada e passa a valer para todas as carteiras.</p>
      <div className="max-h-96 overflow-auto">
        <table className="table">
          <thead><tr><th>Posição</th><th>Onde</th><th className="text-right">Valor</th><th>Classe</th></tr></thead>
          <tbody>
            {items.map((it, i) => {
              const key = `${it.instrumentId ?? it.assetId ?? "?"}|${it.name}|${i}`;
              return (
                <tr key={key}>
                  <td className="max-w-[30ch] truncate" title={it.name}>{it.name}</td>
                  <td className="text-xs text-ink-3">{it.assetName}</td>
                  <td className="num text-right">{fmtEur(it.value, 0)}</td>
                  <td>
                    {editable ? (
                      <select className="py-1 text-xs" defaultValue={done[key] ?? it.assetClass} disabled={pending} onChange={(e) => { const v = e.target.value; start(async () => { await setClass({ instrumentId: it.instrumentId, assetId: it.assetId }, v as never); setDone((d) => ({ ...d, [key]: v })); }); }}>
                        {CLASSES.map((c) => <option key={c} value={c}>{ASSET_CLASS_LABEL[c]}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-ink-2">{ASSET_CLASS_LABEL[it.assetClass]}</span>
                    )}
                    {done[key] && <span className="ml-1 text-xs text-good">✓</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
