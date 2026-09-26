"use client";
import { useActionState, useState } from "react";
import { importFile, ImportState } from "@/app/actions/import";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, todayIso } from "@/lib/format";

type AssetOpt = { id: string; name: string; importer: string | null; type: string };
type ImporterOpt = { key: string; label: string; accept: string; needsBalance: boolean; needsDate: boolean; portfolio: boolean };

export function ImportForm({ assets, importers, initialAsset }: { assets: AssetOpt[]; importers: ImporterOpt[]; initialAsset?: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importFile, {});
  const [assetId, setAssetId] = useState(initialAsset ?? assets[0]?.id ?? "");
  const asset = assets.find((a) => a.id === assetId);
  const [importer, setImporter] = useState("auto");
  const imp = importers.find((i) => i.key === importer);
  const auto = importer === "auto";
  const accept = auto ? ".xlsx,.xls,.csv,.pdf" : imp?.accept;
  const r = state.result;
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="assetId">Ativo / conta</label>
          <select id="assetId" name="assetId" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="importer">Formato do ficheiro</label>
          <select id="importer" name="importer" value={importer} onChange={(e) => setImporter(e.target.value)}>
            <option value="auto">Detetar automaticamente</option>
            {importers.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="file">Ficheiro</label>
          <input id="file" name="file" type="file" accept={accept} required className="file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs" />
        </div>
        {imp?.needsDate && (
          <div className="flex flex-col gap-1">
            <label htmlFor="snapshotDate">Data do retrato (o ficheiro não traz data)</label>
            <input id="snapshotDate" name="snapshotDate" type="date" defaultValue={todayIso()} />
          </div>
        )}
        {auto && (
          <details className="sm:col-span-2">
            <summary className="cursor-pointer text-xs text-ink-3">Opções (só para alguns ficheiros)</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="snapshotDate">Data do retrato (carteira DEGIRO, ativos Binance)</label>
                <input id="snapshotDate" name="snapshotDate" type="date" defaultValue={todayIso()} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="currentBalance">Saldo atual da conta (extrato Banco CTT)</label>
                <input id="currentBalance" name="currentBalance" type="number" step="0.01" inputMode="decimal" placeholder="ex.: 1250,40" />
              </div>
            </div>
          </details>
        )}
        {(auto || imp?.portfolio) && asset && asset.type !== "STOCK_PORTFOLIO" && (
          <label className="flex items-start gap-2 text-sm font-normal text-ink sm:col-span-2">
            <input type="checkbox" name="convertToPortfolio" defaultChecked={!auto} className="mt-0.5" />
            <span>Se o ficheiro tiver compras e vendas, converter <b>{asset.name}</b> (atualmente &laquo;{ASSET_TYPE_LABEL[asset.type] ?? asset.type}&raquo;) em <b>carteira de ações (manual)</b>. O histórico de valores é mantido e, a partir daqui, o valor passa a ser calculado pelas compras/vendas com as cotações do Yahoo.</span>
          </label>
        )}
        {imp?.needsBalance && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="currentBalance">Saldo atual da conta (EUR)</label>
              <input id="currentBalance" name="currentBalance" type="number" step="0.01" inputMode="decimal" placeholder="ex.: 1250,40" />
              <span className="text-xs text-ink-3">Este extrato não traz saldo. Com o saldo atual a app reconstrói os saldos de fim de mês; sem ele importa só os movimentos.</span>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="snapshotDate">Data do saldo</label>
              <input id="snapshotDate" name="snapshotDate" type="date" defaultValue={todayIso()} />
            </div>
          </>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "A importar…" : "Importar"}</button>
      {state.error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {r && (
        <div className="rounded-md bg-good/10 px-3 py-2 text-sm">
          <p className="font-medium text-good">Importação concluída ({r.source.toUpperCase()}{r.detected ? ", formato detetado automaticamente" : ""}).</p>
          <ul className="mt-1 list-inside list-disc text-ink-2">
            {r.rowsTotal > 0 && <li>{r.rowsNew} movimentos novos, {r.rowsExisting} já existentes (ignorados).</li>}
            {r.rowsTotal > 0 && <li>{r.categorized} categorizados automaticamente pelas regras.</li>}
            {r.positions > 0 && <li>{r.positions} posições registadas.</li>}
            {r.realizedNew > 0 && <li>{r.realizedNew} posições fechadas (mais-valias realizadas) novas.</li>}
            {r.tradesTotal > 0 && <li>{r.tradesNew} compras/vendas novas, {r.tradesTotal - r.tradesNew} já existentes (ignoradas).</li>}
            {r.holdingsNew > 0 && <li>{r.holdingsNew} ações criadas na carteira (confirme os símbolos Yahoo na página do ativo).</li>}
            {r.tradesNew > 0 && <li>Na página do ativo, use <b>Reconstruir histórico</b> para preencher a evolução mensal desde a primeira compra.</li>}
            {r.balance !== undefined && <li>Valor registado: {fmtEur(r.balance)} em {fmtDate(r.balanceDate!)}.</li>}
            {r.derivedSnapshots > 0 && <li>{r.derivedSnapshots} saldos de fim de mês derivados do histórico.</li>}
            {r.warnings.map((w) => <li key={w} className="text-warn">{w}</li>)}
          </ul>
        </div>
      )}
    </form>
  );
}
