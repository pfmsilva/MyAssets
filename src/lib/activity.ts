import { after } from "next/server";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type Actor = { id?: string | null; email: string; name?: string | null };

export const ACTION_LABEL: Record<string, string> = {
  login: "Início de sessão",
  logout: "Fim de sessão",
  view: "Consulta",
  "import.run": "Importação de ficheiro",
  "import.delete": "Importação anulada",
  "snapshot.create": "Valor registado",
  "snapshot.delete": "Valor apagado",
  "transaction.category": "Categoria alterada",
  "transaction.note": "Nota alterada",
  "rule.create": "Regra criada",
  "rule.delete": "Regra apagada",
  "rules.apply": "Regras reaplicadas",
  "user.create": "Utilizador criado",
  "user.update": "Utilizador alterado",
  "user.delete": "Utilizador apagado",
  "member.create": "Membro criado",
  "member.update": "Membro alterado",
  "member.delete": "Membro apagado",
  "asset.create": "Ativo criado",
  "asset.update": "Ativo alterado",
  "asset.delete": "Ativo apagado",
  "category.create": "Categoria criada",
  "category.update": "Categoria alterada",
  "category.delete": "Categoria apagada",
  seed: "Dados iniciais criados",
  "report.pdf": "Relatório PDF exportado",
  "instrument.update": "Símbolo de cotação alterado",
  "holding.create": "Ação adicionada à carteira",
  "holding.update": "Ação da carteira alterada",
  "holding.delete": "Ação removida da carteira",
  "trade.create": "Compra/venda registada",
  "trade.delete": "Compra/venda apagada",
  "portfolio.refresh": "Carteira de ações atualizada",
  "portfolio.history": "Histórico da carteira reconstruído",
  "budget.set": "Orçamento definido",
  "settings.update": "Definições alteradas",
  "pol.confirm": "Prova de vida confirmada",
  "pol.run": "Prova de vida verificada",
  "pol.reset": "Ciclo de prova de vida reiniciado",
  "email.test": "E-mail de teste",
  "jobs.run": "Tarefas diárias executadas",
  "activity.purge": "Registo de atividade limpo",
  "export.excel": "Exportação Excel",
  "export.backup": "Backup descarregado",
  "flow.create": "Fluxo de capital registado",
  "flow.delete": "Fluxo de capital apagado",
  "instrument.resolve": "Símbolo de cotação resolvido",
};

async function requestMeta() {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
    const userAgent = (h.get("user-agent") ?? "").slice(0, 200) || null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** Writes one activity row. Never throws: a failed log must not break the action. */
export async function logActivity(actor: Actor, action: string, opts: { entity?: string; entityId?: string; details?: Record<string, unknown>; meta?: { ip: string | null; userAgent: string | null } } = {}) {
  try {
    const meta = opts.meta ?? (await requestMeta());
    await prisma.activityLog.create({
      data: {
        userId: actor.id ?? null,
        userEmail: actor.email,
        userName: actor.name ?? null,
        action,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        details: (opts.details ?? undefined) as Prisma.InputJsonValue | undefined,
        ...meta,
      },
    });
  } catch (e) {
    console.error("activity log failed", action, e);
  }
}

/** Page view, written after the response is sent. Call from server components (no need to await). */
export async function logView(actor: Actor, page: string, details?: Record<string, unknown>) {
  const meta = await requestMeta(); // request headers are only available while rendering
  after(async () => {
    try {
      // a server action re-renders the same page: skip a repeat of the same view within a few seconds
      const recent = await prisma.activityLog.findFirst({
        where: { userEmail: actor.email, action: "view", entityId: page, createdAt: { gte: new Date(Date.now() - 5000) } },
        select: { details: true },
      });
      if (recent && JSON.stringify(recent.details ?? null) === JSON.stringify(details ?? null)) return;
    } catch {
      /* ignore */
    }
    await logActivity(actor, "view", { entity: "page", entityId: page, details, meta });
  });
}

/** Date `days` ago (kept out of components so renders stay pure). */
export const daysAgo = (days: number) => new Date(Date.now() - days * 86400e3);
