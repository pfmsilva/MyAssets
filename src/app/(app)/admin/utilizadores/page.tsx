import { prisma } from "@/lib/prisma";
import { logView } from "@/lib/activity";
import { ROLE_LABEL } from "@/lib/access";
import { auth } from "@/auth";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteUser, upsertUser } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function UsersAdmin() {
  const session = await auth();
  if (session?.user) logView(session.user, "Admin · Utilizadores");
  const [users, members] = await Promise.all([prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { visibleMembers: true } }), prisma.member.findMany({ orderBy: { sortOrder: "asc" } })]);
  const roles = Object.entries(ROLE_LABEL);
  const renderFields = (u?: (typeof users)[number]) => (
    <div className="grid gap-3 sm:grid-cols-4">
      {u && <input type="hidden" name="id" value={u.id} />}
      <div className="flex flex-col gap-1"><label>Email (conta Google)</label><input name="email" type="email" required defaultValue={u?.email} readOnly={!!u} /></div>
      <div className="flex flex-col gap-1"><label>Nome</label><input name="name" defaultValue={u?.name ?? ""} /></div>
      <div className="flex flex-col gap-1"><label>Perfil</label><select name="role" defaultValue={u?.role ?? "VIEWER"}>{roles.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="flex flex-col gap-1 sm:col-span-4">
        <label>Membros visíveis (vazio = vê toda a família; administradores veem sempre tudo)</label>
        <div className="flex flex-wrap gap-3">
          {members.map((m) => (
            <label key={m.id} className="inline-flex items-center gap-1.5 text-sm font-normal text-ink">
              <input type="checkbox" name="memberIds" value={m.id} defaultChecked={u?.visibleMembers.some((v) => v.id === m.id)} />
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              {m.name}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      <Card title="Utilizadores">
        <p className="mb-3 text-sm text-ink-2">Só os emails aqui registados conseguem entrar. Perfis: <b>Administração</b> (tudo), <b>Atualização</b> (importar, registar valores, categorizar), <b>Consulta</b> (só ver). Em &ldquo;Membros visíveis&rdquo; limita-se o que um utilizador não administrador vê: apenas os ativos, movimentos e dashboards dos membros escolhidos.</p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Email</th><th>Nome</th><th>Perfil</th><th>Vê</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.name ?? "—"}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td className="text-ink-2">{u.role === "ADMIN" || !u.visibleMembers.length ? "toda a família" : u.visibleMembers.map((m) => m.name).join(", ")}</td>
                  <td className="text-right">
                    <details>
                      <summary className="btn btn-sm cursor-pointer list-none">editar</summary>
                      <div className="mt-2 rounded-lg border border-border p-3 text-left">
                        <ActionForm action={upsertUser}>{renderFields(u)}</ActionForm>
                        {session?.user.id !== u.id && <div className="mt-2"><ConfirmButton label="apagar utilizador" confirm={`Apagar ${u.email}?`} action={deleteUser.bind(null, u.id)} /></div>}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Adicionar utilizador"><ActionForm action={upsertUser} submitLabel="Adicionar">{renderFields()}</ActionForm></Card>
    </div>
  );
}
