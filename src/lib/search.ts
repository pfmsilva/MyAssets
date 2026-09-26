import { Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { getScope, type Scope } from "./scope";
import { hasRole } from "./access";
import { getSettings } from "./settings";
import { ASSET_TYPE_LABEL, fmtDate } from "./format";
import { GROUP_ORDER, type SearchGroup, type SearchHit } from "./search-types";

export { GROUP_LABEL, type SearchGroup, type SearchHit } from "./search-types";

type Page = { title: string; href: string; words: string; min?: Role; ai?: boolean };

const PAGES: Page[] = [
  { title: "Visão geral", href: "/", words: "inicio dashboard resumo patrimonio total" },
  { title: "Família", href: "/ativos?ver=membro", words: "membros familia filhos pessoas titulares" },
  { title: "Ativos", href: "/ativos", words: "contas carteiras ppr cripto dinheiro patrimonio" },
  { title: "Evolução", href: "/historico", words: "historico grafico evolucao patrimonio" },
  { title: "Despesas e orçamento", href: "/despesas", words: "gastos custos categorias poupanca limites budget" },
  { title: "Orçamento", href: "/despesas#orcamento", words: "limites orcamento budget mensal" },
  { title: "Rentabilidade e ganhos", href: "/rentabilidade", words: "twr xirr ganho retorno performance investimentos diario" },
  { title: "Alocação-alvo", href: "/alocacao", words: "alocacao alvo classes reequilibrio rebalance" },
  { title: "Análise de IA", href: "/analise", words: "ia inteligencia artificial claude analise sugestoes", ai: true },
  { title: "Movimentos", href: "/movimentos", words: "transacoes extrato lancamentos" },
  { title: "Importar ficheiros", href: "/importar", words: "importacao bpi revolut ctt degiro xtb optimize ficheiro", min: "EDITOR" },
  { title: "Administração", href: "/admin", words: "admin definicoes gestao", min: "ADMIN" },
  { title: "Utilizadores", href: "/admin/utilizadores", words: "acessos perfis permissoes convidar", min: "ADMIN" },
  { title: "Membros da família (admin)", href: "/admin/membros", words: "criar membro cores", min: "ADMIN" },
  { title: "Ativos (admin)", href: "/admin/ativos", words: "criar ativo instituicao titulares", min: "ADMIN" },
  { title: "Categorias e regras", href: "/admin/categorias", words: "regras categorizacao automatica", min: "ADMIN" },
  { title: "Cotações", href: "/admin/instrumentos", words: "yahoo simbolos isin cotacoes", min: "ADMIN" },
  { title: "Registo de atividade", href: "/admin/atividade", words: "log auditoria acessos", min: "ADMIN" },
  { title: "Definições", href: "/admin/definicoes", words: "alertas backup prova de vida retencao cron email ia", min: "ADMIN" },
  { title: "Relatório PDF", href: "/api/relatorio", words: "relatorio pdf exportar resumo", min: "ADMIN" },
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Searches every part of the application the user is allowed to see. */
export async function globalSearch(user: { id: string; role: Role }, query: string, opts: { perGroup?: number } = {}) {
  const q = query.trim();
  const hits: SearchHit[] = [];
  if (q.length < 2) return { q, hits, groups: [] as { group: SearchGroup; hits: SearchHit[] }[] };
  const take = opts.perGroup ?? 6;
  const scope: Scope = await getScope(user);
  const settings = await getSettings();
  const nq = norm(q);
  const like = { contains: q, mode: "insensitive" as const };

  for (const p of PAGES) {
    if (p.min && !hasRole(user.role, p.min)) continue;
    if (p.ai && !settings.aiEnabled) continue;
    if (p.ai && !scope.all) continue;
    if (!norm(`${p.title} ${p.words}`).includes(nq)) continue;
    hits.push({ group: "pagina", id: p.href, title: p.title, subtitle: p.href.startsWith("/api") ? "abre o PDF" : "página", href: p.href });
  }

  const assetWhere: Prisma.AssetWhereInput = {
    AND: [
      scope.all ? {} : { id: { in: scope.assetIds } },
      { OR: [{ name: like }, { institution: like }] },
    ],
  };
  const memberWhere: Prisma.MemberWhereInput = { AND: [scope.all ? {} : { id: { in: scope.memberIds } }, { name: like }] };
  const txWhere: Prisma.TransactionWhereInput = {
    AND: [
      scope.all ? {} : { assetId: { in: scope.assetIds } },
      { OR: [{ description: like }, { note: like }] },
    ],
  };
  const holdingWhere: Prisma.HoldingWhereInput = {
    AND: [
      scope.all ? {} : { assetId: { in: scope.assetIds } },
      { OR: [{ name: like }, { isin: like }, { symbol: like }] },
    ],
  };

  const [members, assets, holdings, categories, transactions, txCount, instruments] = await Promise.all([
    prisma.member.findMany({ where: memberWhere, orderBy: { sortOrder: "asc" }, take }),
    prisma.asset.findMany({ where: assetWhere, orderBy: { sortOrder: "asc" }, take }),
    prisma.holding.findMany({ where: holdingWhere, orderBy: { sortOrder: "asc" }, take, include: { asset: { select: { name: true } } } }),
    prisma.category.findMany({ where: { name: like }, orderBy: { sortOrder: "asc" }, take }),
    prisma.transaction.findMany({ where: txWhere, orderBy: [{ date: "desc" }, { seq: "desc" }], take, include: { asset: { select: { name: true } }, category: { select: { name: true } } } }),
    prisma.transaction.count({ where: txWhere }),
    hasRole(user.role, "ADMIN")
      ? prisma.instrument.findMany({ where: { OR: [{ name: like }, { key: like }, { symbol: like }] }, orderBy: { name: "asc" }, take })
      : Promise.resolve([]),
  ]);

  for (const m of members) hits.push({ group: "membro", id: m.id, title: m.name, subtitle: "membro da família", href: `/membros/${m.id}` });
  for (const a of assets) hits.push({ group: "ativo", id: a.id, title: a.name, subtitle: `${a.institution} · ${ASSET_TYPE_LABEL[a.type] ?? a.type}${a.active ? "" : " · inativo"}`, href: `/ativos/${a.id}` });
  for (const h of holdings) hits.push({ group: "acao", id: h.id, title: h.name, subtitle: `${h.isin}${h.symbol ? ` · ${h.symbol}` : ""} · ${h.asset.name}`, href: `/ativos/${h.assetId}` });
  for (const c of categories) hits.push({ group: "categoria", id: c.id, title: c.name, subtitle: "categoria de despesa", href: `/movimentos?category=${c.id}` });
  for (const i of instruments) hits.push({ group: "instrumento", id: i.id, title: i.name, subtitle: `${i.key}${i.symbol ? ` · ${i.symbol}` : " · sem símbolo"}`, href: "/admin/instrumentos" });
  for (const t of transactions)
    hits.push({
      group: "movimento",
      id: t.id,
      title: t.description,
      subtitle: `${fmtDate(t.date)} · ${t.asset.name}${t.category ? ` · ${t.category.name}` : ""}`,
      href: `/movimentos?q=${encodeURIComponent(t.description.slice(0, 60))}`,
      amount: t.amount,
    });

  const groups = GROUP_ORDER.map((group) => ({ group, hits: hits.filter((h) => h.group === group) })).filter((g) => g.hits.length > 0);
  return { q, hits, groups, txCount };
}
