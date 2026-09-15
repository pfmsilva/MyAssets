"use client";
import { useActionState, useState } from "react";
import { importFile, ImportState } from "@/app/actions/import";
import { fmtDate, fmtEur, todayIso } from "@/lib/format";

type AssetOpt = { id: string; name: string; importer: string | null };
type ImporterOpt = { key: string; label: string; accept: string };

export function ImportForm({ assets, importers, initialAsset }: { assets: AssetOpt[]; importers: ImporterOpt[]; initialAsset?: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importFile, {});
  const [assetId, setAssetId] = useState(initialAsset ?? assets[0]?.id ?? "");
  const asset = assets.find((a) => a.id === assetId);
  const [importer, setImporter] = useState(asset?.importer ?? importers[0]?.key ?? "");
  const imp = importers.find((i) => i.key === importer);
  const r = state.result;
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="assetId">Ativo / conta</label>
          <select id="assetId" name="assetId" value={assetId} onChange={(e) => { setAssetId(e.target.value); const a = assets.find((x) => x.id === e.target.value); if (a?.importer) setImporter(a.importer); }}>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="importer">Formato do ficheiro</label>
          <select id="importer" name="importer" value={importer} onChange={(e) => setImporter(e.target.value)}>
            {importers.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="file">Ficheiro</label>
          <input id="file" name="file" type="file" accept={imp?.accept} required className="file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs" />
        </div>
        {importer === "degiro" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="snapshotDate">Data da carteira (o ficheiro DEGIRO não tem data)</label>
            <input id="snapshotDate" name="snapshotDate" type="date" defaultValue={todayIso()} />
          </div>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "A importar…" : "Importar"}</button>
      {state.error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      {r && (
        <div className="rounded-md bg-good/10 px-3 py-2 text-sm">
          <p className="font-medium text-good">Importação concluída ({r.source.toUpperCase()}).</p>
          <ul className="mt-1 list-inside list-disc text-ink-2">
            {r.rowsTotal > 0 && <li>{r.rowsNew} movimentos novos, {r.rowsExisting} já existentes (ignorados).</li>}
            {r.rowsTotal > 0 && <li>{r.categorized} categorizados automaticamente pelas regras.</li>}
            {r.positions > 0 && <li>{r.positions} posições registadas.</li>}
            {r.balance !== undefined && <li>Valor registado: {fmtEur(r.balance)} em {fmtDate(r.balanceDate!)}.</li>}
            {r.derivedSnapshots > 0 && <li>{r.derivedSnapshots} saldos de fim de mês derivados do histórico.</li>}
            {r.warnings.map((w) => <li key={w} className="text-warn">{w}</li>)}
          </ul>
        </div>
      )}
    </form>
  );
}
