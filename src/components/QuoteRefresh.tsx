"use client";
import { useState, useTransition } from "react";
import { refreshAssetQuotes } from "@/app/actions/quotes";
import { RefreshAll } from "./RefreshAll";

export function QuoteRefresh({ assetId, quotesAt, quoted, quotable, error, editable = false }: { assetId: string; quotesAt: string | null; quoted: number; quotable: number; error: string | null; editable?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
      <span>
        Cotações <a href="https://finance.yahoo.com" target="_blank" rel="noopener" className="text-accent hover:underline">Yahoo Finance</a>
        {quotesAt ? ` às ${new Date(quotesAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}` : ""} · {quoted}/{quotable} posições com cotação
      </span>
      {editable ? (
        <RefreshAll assetId={assetId} label="Atualizar tudo" />
      ) : (
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { try { const r = await refreshAssetQuotes(assetId); setMsg(r.error ? `Erro: ${r.error}` : `Atualizado (${r.quoted}/${r.quotable}).`); } catch (e) { setMsg(e instanceof Error ? e.message : "Erro"); } })}>
          {pending ? "A atualizar…" : "Atualizar cotações"}
        </button>
      )}
      {(msg || error) && <span className={error && !msg ? "text-bad" : "text-ink-2"}>{msg ?? `Erro: ${error}`}</span>}
    </div>
  );
}
