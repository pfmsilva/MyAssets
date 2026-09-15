import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteMember, upsertMember } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function MembersAdmin() {
  const members = await prisma.member.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { ownerships: true, users: true } } } });
  const renderFields = (m?: (typeof members)[number]) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="flex flex-col gap-1"><label>Nome</label><input name="name" required defaultValue={m?.name} /></div>
      <div className="flex flex-col gap-1"><label>Cor</label><input name="color" type="color" defaultValue={m?.color ?? "#2a78d6"} className="h-10 w-16 p-1" /></div>
      <div className="flex flex-col gap-1"><label>Ordem</label><input name="sortOrder" type="number" defaultValue={m?.sortOrder ?? members.length} /></div>
    </div>
  );
  return (
    <div className="space-y-4">
      <Card title="Membros da família">
        <ul className="divide-y divide-border/60">
          {members.map((m) => (
            <li key={m.id} className="py-3">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 rounded-full" style={{ background: m.color }} />
                <span className="flex-1 font-medium">{m.name}</span>
                <span className="text-xs text-ink-3">{m._count.ownerships} ativo(s) · {m._count.users} utilizador(es)</span>
                <details className="text-right">
                  <summary className="btn btn-sm cursor-pointer list-none">editar</summary>
                  <div className="mt-2 rounded-lg border border-border p-3 text-left">
                    <ActionForm action={upsertMember}>{renderFields(m)}</ActionForm>
                    <div className="mt-2"><ConfirmButton label="apagar" confirm={`Apagar ${m.name}? As titularidades deste membro são removidas.`} action={deleteMember.bind(null, m.id)} /></div>
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Adicionar membro"><ActionForm action={upsertMember} submitLabel="Adicionar">{renderFields()}</ActionForm></Card>
    </div>
  );
}
