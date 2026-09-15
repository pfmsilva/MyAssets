import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ACTION_LABEL, daysAgo } from "@/lib/activity";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
type SP = { user?: string; action?: string; from?: string; to?: string; q?: string; page?: string };

function describe(action: string, entityId: string | null, details: Prisma.JsonValue | null): string {
  const d = (details && typeof details === "object" && !Array.isArray(details) ? details : {}) as Record<string, unknown>;
  const s = (k: string) => (d[k] === undefined || d[k] === null ? "" : String(d[k]));
  switch (action) {
    case "view": {
      const extra = Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== 1).map(([k, v]) => `${k}=${v}`).join(", ");
      return `${entityId ?? ""}${extra ? ` (${extra})` : ""}`;
    }
    case "import.run":
      return `${s("importer").toUpperCase()} · ${s("file")} · ${s("rowsNew")} novos, ${s("rowsExisting")} existentes${d.positions ? `, ${s("positions")} posições` : ""}${d.balance !== null && d.balance !== undefined ? ` · saldo ${Number(d.balance).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}` : ""}`;
    case "import.delete":
      return `${s("asset")} · ${s("file")} (${s("rows")} movimentos)`;
    case "snapshot.create":
    case "snapshot.delete":
      return `${s("asset")} · ${s("date")} · ${Number(d.value ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}${d.positions ? ` · ${s("positions")} posições` : ""}`;
    case "transaction.category":
      return `${s("description")} (${Number(d.amount ?? 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}) → ${s("category") || "sem categoria"}`;
    case "rule.create":
      return `"${s("pattern")}" → ${s("category")}${d.applied !== undefined ? ` · aplicada a ${s("applied")} movimentos` : ""}`;
    case "rule.delete":
      return `"${s("pattern")}" (${s("category")})`;
    case "rules.apply":
      return `${d.force ? "reclassificação total" : "sem categoria"} · ${s("updated")} atualizados`;
    case "user.create":
    case "user.update":
      return `${s("email")} · ${s("role")} · ${s("members")} membro(s) visível(is)`;
    case "user.delete":
    case "member.create":
    case "member.update":
    case "member.delete":
    case "asset.create":
    case "asset.update":
    case "asset.delete":
    case "category.create":
    case "category.update":
    case "category.delete":
      return s("email") || s("name");
    case "seed":
      return `${s("members")} membros, ${s("assets")} ativos, ${s("categories")} categorias, ${s("rules")} regras`;
    case "login":
      return s("provider") ? `via ${s("provider")}` : "";
    default:
      return Object.keys(d).length ? JSON.stringify(d) : "";
  }
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const pageN = Math.max(1, Number(sp.page) || 1);
  const take = 100;
  const where: Prisma.ActivityLogWhereInput = {};
  if (sp.user) where.userEmail = sp.user;
  if (sp.action) where.action = sp.action === "admin" ? { in: Object.keys(ACTION_LABEL).filter((a) => /^(user|member|asset|category|rule)\./.test(a) || a === "seed") } : sp.action;
  if (sp.from || sp.to) where.createdAt = { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lt: new Date(new Date(sp.to).getTime() + 86400e3) } : {}) };
  if (sp.q) where.OR = [{ entityId: { contains: sp.q, mode: "insensitive" } }, { userEmail: { contains: sp.q, mode: "insensitive" } }, { details: { string_contains: sp.q } }];
  const [rows, count, users, perAction] = await Promise.all([
    prisma.activityLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageN - 1) * take, take }),
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({ distinct: ["userEmail"], select: { userEmail: true, userName: true }, orderBy: { userEmail: "asc" } }),
    prisma.activityLog.groupBy({ by: ["action"], _count: { _all: true }, where: { createdAt: { gte: daysAgo(30) } } }),
  ]);
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...over })) if (v) p.set(k, String(v));
    return `?${p.toString()}`;
  };
  const logins30 = perAction.find((a) => a.action === "login")?._count._all ?? 0;
  const views30 = perAction.find((a) => a.action === "view")?._count._all ?? 0;
  const changes30 = perAction.filter((a) => !["login", "logout", "view"].includes(a.action)).reduce((s, a) => s + a._count._all, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Registo de todas as atividades dos utilizadores: sessões, páginas consultadas, importações, valores registados, categorizações, alterações administrativas e exportações. Últimos 30 dias: <b>{logins30}</b> inícios de sessão, <b>{views30}</b> consultas, <b>{changes30}</b> alterações.
      </p>
      <Card>
        <form className="grid grid-cols-2 gap-2 md:grid-cols-6" method="get">
          <select name="user" defaultValue={sp.user ?? ""}><option value="">Todos os utilizadores</option>{users.map((u) => <option key={u.userEmail} value={u.userEmail}>{u.userName ? `${u.userName} (${u.userEmail})` : u.userEmail}</option>)}</select>
          <select name="action" defaultValue={sp.action ?? ""}>
            <option value="">Todas as atividades</option>
            <option value="admin">Alterações administrativas</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input name="from" type="date" defaultValue={sp.from ?? ""} />
          <input name="to" type="date" defaultValue={sp.to ?? ""} />
          <input name="q" placeholder="Pesquisar" defaultValue={sp.q ?? ""} />
          <button className="btn btn-primary" type="submit">Filtrar</button>
        </form>
      </Card>
      <Card title={`${count} registos`}>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Quando</th><th>Utilizador</th><th>Atividade</th><th>Detalhe</th><th>Origem</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-ink-2">{r.createdAt.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}</td>
                  <td className="whitespace-nowrap">{r.userName ?? r.userEmail}<div className="text-xs text-ink-3">{r.userName ? r.userEmail : ""}</div></td>
                  <td className="whitespace-nowrap">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="max-w-[48ch] truncate" title={describe(r.action, r.entityId, r.details)}>{describe(r.action, r.entityId, r.details)}</td>
                  <td className="max-w-[24ch] truncate text-xs text-ink-3" title={r.userAgent ?? ""}>{r.ip ?? ""}{r.userAgent ? ` · ${/Mobile|Android|iPhone/i.test(r.userAgent) ? "telemóvel" : "computador"}` : ""}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="py-6 text-center text-ink-3">Sem registos para estes filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-ink-3">Página {pageN} de {Math.max(1, Math.ceil(count / take))}</span>
          <div className="flex gap-2">
            {pageN > 1 && <Link className="btn btn-sm" href={qs({ page: String(pageN - 1) })}>← Anterior</Link>}
            {pageN * take < count && <Link className="btn btn-sm" href={qs({ page: String(pageN + 1) })}>Seguinte →</Link>}
          </div>
        </div>
      </Card>
    </div>
  );
}
