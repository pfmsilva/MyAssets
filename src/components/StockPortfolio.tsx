"use client";
import { Fragment, useActionState, useState, useTransition } from "react";
import { addHolding, addTrade, deleteHolding, deleteTrade, lookupIsinAction, rebuildHistory, refreshPortfolio, updateHolding, HoldingState } from "@/app/actions/holdings";
import { fmtDate, fmtEur, fmtNum, fmtPct, todayIso } from "@/lib/format";

export type HoldingDTO = {
  id: string;
  isin: string;
  name: string;
  note: string | null;
  symbol: string | null;
  manualSymbol: boolean;
  yahooUrl: string | null;
  quoteError: string | null;
  quantity: number;
  avgPrice: number | null;
  costEur: number;
  realizedEur: number;
  livePrice: number | null;
  liveCurrency: string | null;
  liveValueEur: number | null;
  dayChangePct: number | null;
  valueEur: number;
  pnlEur: number | null;
  pnlPct: number | null;
  warning: string | null;
  trades: { id: string; date: string; quantity: number; amount: number; fee: number; note: string | null }[];
};

export type PortfolioDTO = {
  assetId: string;
  holdings: HoldingDTO[];
  totals: { value: number; cost: number; pnl: number; pnlPct: number | null; realized: number; invested: number; proceeds: number; dayChangeEur: number; dayChangePct: number | null; quoted: number; quotable: number };
  quotesAt: string | null;
  error: string | null;
};

function Pnl({ value, pct }: { value: number | null; pct: number | null }) {
  if (value === null) return <span className="text-ink-3">—</span>;
  const cls = value > 0 ? "text-good" : value < 0 ? "text-bad" : "text-ink-2";
  return (
    <span className={`num ${cls}`}>
      {value > 0 ? "+" : ""}{fmtEur(value, 0)}
      {pct !== null ? <span className="ml-1 text-xs">({value > 0 ? "+" : ""}{fmtPct(pct, 1)})</span> : null}
    </span>
  );
}

function TradeRows({ holding, editable, onDone }: { holding: HoldingDTO; editable: boolean; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"BUY" | "SELL">("BUY");
  const [date, setDate] = useState(todayIso());
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const unit = Number(quantity) > 0 && Number(amount) > 0 ? Number(amount) / Number(quantity) : null;
  return (
    <div className="space-y-2 bg-surface-2/60 p-3">
      <table className="table">
        <thead>
          <tr><th>Data</th><th>Operação</th><th className="text-right">Quantidade</th><th className="text-right">Valor</th><th className="text-right">Preço unitário</th><th className="text-right">Comissão</th><th>Nota</th>{editable && <th></th>}</tr>
        </thead>
        <tbody>
          {holding.trades.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap">{fmtDate(t.date)}</td>
              <td className={t.quantity >= 0 ? "text-good" : "text-bad"}>{t.quantity >= 0 ? "Compra" : "Venda"}</td>
              <td className="num text-right">{fmtNum(Math.abs(t.quantity), 6)}</td>
              <td className="num text-right">{fmtEur(t.amount)}</td>
              <td className="num text-right text-ink-2">{fmtNum(t.amount / Math.abs(t.quantity), 4)}</td>
              <td className="num text-right text-ink-3">{t.fee ? fmtEur(t.fee) : ""}</td>
              <td className="max-w-[24ch] truncate text-ink-3" title={t.note ?? ""}>{t.note ?? ""}</td>
              {editable && <td className="text-right"><button type="button" className="text-ink-3 hover:text-bad" disabled={pending} title="Apagar operação" onClick={() => { if (confirm(`Apagar a ${t.quantity >= 0 ? "compra" : "venda"} de ${fmtDate(t.date)}?`)) start(async () => { await deleteTrade(t.id); onDone(); }); }}>×</button></td>}
            </tr>
          ))}
          {!holding.trades.length && <tr><td colSpan={editable ? 8 : 7} className="py-3 text-center text-ink-3">Sem operações registadas.</td></tr>}
        </tbody>
      </table>
      {editable && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <div className="flex flex-col gap-1"><label>Operação</label><select value={kind} onChange={(e) => setKind(e.target.value as "BUY" | "SELL")} className="py-1 text-xs"><option value="BUY">Compra</option><option value="SELL">Venda</option></select></div>
          <div className="flex flex-col gap-1"><label>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="py-1 text-xs" /></div>
          <div className="flex flex-col gap-1"><label>Quantidade</label><input type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" className="w-24 py-1 text-xs" /></div>
          <div className="flex flex-col gap-1"><label>Valor total (EUR)</label><input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500,00" className="w-32 py-1 text-xs" /></div>
          <div className="flex flex-col gap-1"><label>Comissão</label><input type="number" step="0.01" min="0" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" className="w-20 py-1 text-xs" /></div>
          <div className="flex min-w-32 flex-1 flex-col gap-1"><label>Nota</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opcional" className="py-1 text-xs" /></div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending || !quantity || !amount}
            onClick={() =>
              start(async () => {
                try {
                  setErr(null);
                  await addTrade(holding.id, { date, quantity: Number(quantity), amount: Number(amount), fee: fee ? Number(fee) : 0, note, kind });
                  setQuantity(""); setAmount(""); setFee(""); setNote("");
                  onDone();
                } catch (e) {
                  setErr(e instanceof Error ? e.message : "Erro ao registar a operação.");
                }
              })
            }
          >
            {pending ? "A registar…" : kind === "BUY" ? "Registar compra" : "Registar venda"}
          </button>
          {unit !== null && <span className="text-xs text-ink-3">preço unitário {fmtNum(unit, 4)} €</span>}
          {err && <span className="text-xs text-bad">{err}</span>}
        </div>
      )}
    </div>
  );
}

export function StockPortfolio({ data, editable }: { data: PortfolioDTO; editable: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [state, action, adding] = useActionState<HoldingState, FormData>(addHolding, {});
  const [isin, setIsin] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [lookup, setLookup] = useState<string | null>(null);
  const t = data.totals;
  const refresh = () => start(async () => { const r = await refreshPortfolio(data.assetId); setMsg(r.skipped ?? (r.error ? `Erro: ${r.error}` : `Valor atualizado: ${fmtEur(r.value)} (${r.quoted}/${r.quotable} ações com cotação).`)); });
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Ação</th><th>ISIN</th><th className="text-right">Quantidade</th><th className="text-right">Preço médio</th><th className="text-right">Cotação</th><th className="text-right">Hoje</th><th className="text-right">Valor</th><th className="text-right">Ganho/perda</th><th className="text-right">%</th>{editable && <th></th>}
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <Fragment key={h.id}>
                <tr className={h.quantity <= 0 ? "opacity-60" : ""}>
                  <td>
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setOpen(open === h.id ? null : h.id)} title="Ver e registar operações">
                      {open === h.id ? "▾ " : "▸ "}{h.name}
                    </button>
                    <div className="text-xs text-ink-3">
                      {h.quantity <= 0 ? "posição fechada · " : ""}{h.trades.length} operação(ões)
                      {h.yahooUrl && <> · <a href={h.yahooUrl} target="_blank" rel="noopener" className="text-accent hover:underline">{h.symbol} ↗</a></>}
                      {h.quoteError && <span className="text-warn"> · {h.quoteError}</span>}
                      {h.warning && <span className="text-warn"> · {h.warning}</span>}
                    </div>
                  </td>
                  <td className="text-xs text-ink-3">{h.isin}</td>
                  <td className="num text-right">{h.quantity ? fmtNum(h.quantity, 6) : "—"}</td>
                  <td className="num text-right text-ink-2">{h.avgPrice != null ? fmtNum(h.avgPrice, 4) : "—"}</td>
                  <td className="num text-right">{h.livePrice != null ? `${fmtNum(h.livePrice, 4)}${h.liveCurrency && h.liveCurrency !== "EUR" ? ` ${h.liveCurrency}` : ""}` : "—"}</td>
                  <td className={`num text-right ${h.dayChangePct != null ? (h.dayChangePct >= 0 ? "text-good" : "text-bad") : ""}`}>{h.dayChangePct != null && h.quantity > 0 ? `${h.dayChangePct >= 0 ? "+" : ""}${h.dayChangePct.toFixed(2)} %` : ""}</td>
                  <td className="num text-right font-medium">{h.quantity > 0 ? fmtEur(h.valueEur) : "—"}</td>
                  <td className="text-right"><Pnl value={h.pnlEur} pct={h.pnlPct} />{h.realizedEur ? <div className="text-xs text-ink-3">realizado {h.realizedEur >= 0 ? "+" : ""}{fmtEur(h.realizedEur, 0)}</div> : null}</td>
                  <td className="num text-right text-ink-2">{t.value && h.quantity > 0 ? `${((h.valueEur / t.value) * 100).toFixed(1)} %` : ""}</td>
                  {editable && (
                    <td className="text-right">
                      <button type="button" className="text-ink-3 hover:text-bad" disabled={pending} title="Apagar ação e as suas operações" onClick={() => { if (confirm(`Apagar ${h.name} e as ${h.trades.length} operações registadas?`)) start(async () => { await deleteHolding(h.id); setMsg(`${h.name} apagada.`); }); }}>×</button>
                    </td>
                  )}
                </tr>
                {open === h.id && (
                  <tr>
                    <td colSpan={editable ? 10 : 9} className="p-0">
                      <TradeRows holding={h} editable={editable} onDone={() => setMsg("Operação registada; valor da carteira atualizado.")} />
                      {editable && (
                        <div className="flex flex-wrap items-end gap-2 border-t border-border bg-surface-2/60 p-3 text-xs">
                          <span className="text-ink-3">Símbolo Yahoo {h.manualSymbol ? "(definido à mão)" : "(automático pelo ISIN)"}:</span>
                          <input defaultValue={h.symbol ?? ""} placeholder="ex.: GALP.LS" className="w-32 py-1 text-xs" onBlur={(e) => { const v = e.target.value.trim(); if (v !== (h.symbol ?? "")) start(async () => { await updateHolding(h.id, { symbol: v || null }); setMsg("Símbolo atualizado."); }); }} />
                          <input defaultValue={h.name} className="w-48 py-1 text-xs" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== h.name) start(async () => { await updateHolding(h.id, { name: v }); setMsg("Descrição atualizada."); }); }} />
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!data.holdings.length && <tr><td colSpan={editable ? 10 : 9} className="py-6 text-center text-ink-3">Ainda sem ações. Adicione a primeira abaixo, indicando o ISIN e a descrição.</td></tr>}
            {data.holdings.length > 0 && (
              <tr className="font-medium">
                <td>Total</td><td></td><td></td><td></td><td></td>
                <td className={`num text-right ${t.dayChangeEur >= 0 ? "text-good" : "text-bad"}`}>{t.dayChangeEur ? `${t.dayChangeEur >= 0 ? "+" : ""}${fmtEur(t.dayChangeEur, 0)}` : ""}</td>
                <td className="num text-right">{fmtEur(t.value)}</td>
                <td className="text-right"><Pnl value={t.pnl} pct={t.pnlPct} /></td>
                <td className="num text-right">{t.value ? "100 %" : ""}</td>
                {editable && <td></td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span>
          Custo de aquisição {fmtEur(t.cost, 0)} · investido {fmtEur(t.invested, 0)} · vendas {fmtEur(t.proceeds, 0)} · realizado {t.realized >= 0 ? "+" : ""}{fmtEur(t.realized, 0)}
          {data.quotesAt ? ` · cotações de ${new Date(data.quotesAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}` : ""}
        </span>
        {editable && <button type="button" className="btn btn-sm" disabled={pending} onClick={refresh}>{pending ? "…" : "Atualizar cotações"}</button>}
        {editable && <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { if (!confirm("Reconstruir o histórico mensal a partir das cotações do Yahoo? Os valores mensais calculados automaticamente são substituídos.")) return; start(async () => { const r = await rebuildHistory(data.assetId); setMsg(`Histórico reconstruído: ${r.written} meses${r.skipped.length ? ` (${r.skipped.join("; ")})` : ""}.`); }); }}>Reconstruir histórico</button>}
        {data.error && <span className="text-bad">Erro nas cotações: {data.error}</span>}
        {msg && <span className="text-ink-2">{msg}</span>}
      </div>

      {editable && (
        <form action={action} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <input type="hidden" name="assetId" value={data.assetId} />
          <div className="flex flex-col gap-1"><label htmlFor="isin">ISIN</label><input id="isin" name="isin" required value={isin} onChange={(e) => setIsin(e.target.value.toUpperCase())} placeholder="PTGAL0AM0009" className="w-40" /></div>
          <div className="flex min-w-40 flex-1 flex-col gap-1"><label htmlFor="name">Descrição</label><input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Galp Energia" /></div>
          <div className="flex flex-col gap-1"><label htmlFor="symbol">Símbolo Yahoo (opcional)</label><input id="symbol" name="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="automático" className="w-36" /></div>
          <button type="button" className="btn" disabled={pending || !isin} onClick={() => start(async () => { const r = await lookupIsinAction(isin, name); if ("error" in r && r.error) setLookup(r.error); else if ("symbol" in r) { setSymbol(r.symbol!); if (!name && r.name) setName(r.name); setLookup(`Encontrado: ${r.symbol}${r.price != null ? ` · ${fmtNum(r.price, 2)} ${r.currency}` : ""}`); } })}>Procurar no Yahoo</button>
          <button className="btn btn-primary" type="submit" disabled={adding}>{adding ? "A adicionar…" : "Adicionar ação"}</button>
          {lookup && <span className="text-xs text-ink-2">{lookup}</span>}
          {state.error && <span className="text-xs text-bad">{state.error}</span>}
          {state.ok && <span className="text-xs text-good">{state.message}</span>}
        </form>
      )}
    </div>
  );
}
