import { prisma } from "@/lib/prisma";
import { ASSET_TYPE_LABEL } from "@/lib/format";
import { IMPORTERS } from "@/lib/importers";
import { Badge, Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteAsset, upsertAsset } from "@/app/actions/admin";
import { SeedButton } from "@/components/SeedButton";

export const dynamic = "force-dynamic";

export default async function AssetsAdmin() {
  const [assets, members] = await Promise.all([
    prisma.asset.findMany({ orderBy: { sortOrder: "asc" }, include: { ownerships: { include: { member: true } }, _count: { select: { snapshots: true, transactions: true } } } }),
    prisma.member.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const renderFields = (a?: (typeof assets)[number]) => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {a && <input type="hidden" name="id" value={a.id} />}
        <div className="flex flex-col gap-1"><label>Nome</label><input name="name" required defaultValue={a?.name} /></div>
        <div className="flex flex-col gap-1"><label>Instituição</label><input name="institution" required defaultValue={a?.institution} /></div>
        <div className="flex flex-col gap-1"><label>Tipo</label><select name="type" defaultValue={a?.type ?? "CURRENT_ACCOUNT"}>{Object.entries(ASSET_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label>Importador de ficheiros</label><select name="importer" defaultValue={a?.importer ?? ""}><option value="">Registo manual</option>{Object.entries(IMPORTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div className="flex flex-col gap-1"><label>Ordem</label><input name="sortOrder" type="number" defaultValue={a?.sortOrder ?? assets.length} /></div>
        <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" name="active" defaultChecked={a ? a.active : true} /> Ativo (aparece nos dashboards)</label>
      </div>
      <div>
        <label>Titularidade (a soma deve ser 100 %)</label>
        <div className="mt-1 grid gap-2 sm:grid-cols-5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm">
              <input type="hidden" name="ownerMemberId" value={m.id} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              <span className="flex-1 truncate">{m.name}</span>
              <input name="ownerPercent" type="number" min="0" max="100" step="0.01" className="w-20 py-1 text-right" defaultValue={a?.ownerships.find((o) => o.memberId === m.id)?.percent ?? (a ? 0 : members[0]?.id === m.id ? 100 : 0)} />
              <span className="text-ink-3">%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      {assets.length === 0 && (
        <Card title="Começar">
          <p className="mb-3 text-sm text-ink-2">Ainda não há ativos. Cria o conjunto inicial (5 membros da família, 9 ativos: BPI, Revolut, CTT, PPR Optimize, PPR Save and Grow, DEGIRO, XTB, Binance e dinheiro em casa, 17 categorias de despesa com regras) e ajusta depois nomes e titularidades.</p>
          <SeedButton />
        </Card>
      )}
      <Card title="Ativos e contas" action={assets.length > 0 ? <SeedButton compact /> : undefined}>
        <ul className="divide-y divide-border/60">
          {assets.map((a) => (
            <li key={a.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.name} {!a.active && <span className="text-xs text-warn">(inativo)</span>}</p>
                  <p className="text-xs text-ink-3">{a.institution} · {ASSET_TYPE_LABEL[a.type]} · {a.importer ? `importador ${a.importer}` : "manual"} · {a._count.snapshots} registos · {a._count.transactions} movimentos</p>
                  <div className="mt-1 flex flex-wrap gap-1">{a.ownerships.map((o) => <Badge key={o.memberId} color={o.member.color}>{o.member.name} {o.percent}%</Badge>)}</div>
                </div>
                <details className="w-full sm:w-auto">
                  <summary className="btn btn-sm cursor-pointer list-none">editar</summary>
                  <div className="mt-2 rounded-lg border border-border p-3">
                    <ActionForm action={upsertAsset}>{renderFields(a)}</ActionForm>
                    <div className="mt-2"><ConfirmButton label="apagar ativo e todo o histórico" confirm={`Apagar ${a.name} com ${a._count.snapshots} registos e ${a._count.transactions} movimentos? Esta ação é irreversível.`} action={deleteAsset.bind(null, a.id)} /></div>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Adicionar ativo"><ActionForm action={upsertAsset} submitLabel="Adicionar">{renderFields()}</ActionForm></Card>
    </div>
  );
}
