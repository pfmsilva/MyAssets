import * as XLSX from "xlsx";
import { prisma } from "./prisma";

/** Every table that holds family data, as plain objects. */
export async function collectData() {
  const [members, assets, ownerships, snapshots, positions, transactions, categories, rules, budgets, realized, instruments, importBatches, users, settings] = await Promise.all([
    prisma.member.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.asset.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.assetOwnership.findMany(),
    prisma.snapshot.findMany({ orderBy: [{ assetId: "asc" }, { date: "asc" }] }),
    prisma.position.findMany(),
    prisma.transaction.findMany({ orderBy: [{ assetId: "asc" }, { date: "asc" }, { seq: "asc" }] }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.categoryRule.findMany(),
    prisma.budget.findMany(),
    prisma.realizedTrade.findMany({ orderBy: { closeTime: "asc" } }),
    prisma.instrument.findMany(),
    prisma.importBatch.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, createdAt: true, visibleMembers: { select: { id: true } } } }),
    prisma.setting.findMany(),
  ]);
  return { exportedAt: new Date().toISOString(), version: 1, members, assets, ownerships, snapshots, positions, transactions, categories, rules, budgets, realized, instruments, importBatches, users, settings };
}

export async function buildBackupJson(): Promise<Buffer> {
  const data = await collectData();
  return Buffer.from(JSON.stringify(data, null, 1), "utf8");
}

/** Excel workbook with one readable sheet per table (names resolved, dates as text). */
export async function buildExcel(): Promise<Buffer> {
  const d = await collectData();
  const memberName = new Map(d.members.map((m) => [m.id, m.name]));
  const assetName = new Map(d.assets.map((a) => [a.id, a.name]));
  const catName = new Map(d.categories.map((c) => [c.id, c.name]));
  const day = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
  const ts = (x: Date | null | undefined) => (x ? x.toISOString().replace("T", " ").slice(0, 19) : "");
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "(vazio)": "" }]), name.slice(0, 31));
  add("Ativos", d.assets.map((a) => ({ Nome: a.name, Instituição: a.institution, Tipo: a.type, Moeda: a.currency, Importador: a.importer ?? "", Ativo: a.active ? "sim" : "não", Titulares: d.ownerships.filter((o) => o.assetId === a.id).map((o) => `${memberName.get(o.memberId)} ${o.percent}%`).join(", ") })));
  add("Membros", d.members.map((m) => ({ Nome: m.name, Cor: m.color })));
  add("Valores", d.snapshots.map((s) => ({ Ativo: assetName.get(s.assetId), Data: day(s.date), Valor: s.value, Origem: s.source, Nota: s.note ?? "" })));
  const snapById = new Map(d.snapshots.map((s) => [s.id, s]));
  add("Posições", d.positions.map((p) => { const s = snapById.get(p.snapshotId); return { Ativo: s ? assetName.get(s.assetId) : "", Data: day(s?.date), Produto: p.name, "ISIN/Ticker": p.isin ?? "", Quantidade: p.quantity, "Preço médio": p.avgPrice, Preço: p.price, Moeda: p.currency, "Valor EUR": p.valueEur, "Custo EUR": p.costEur }; }));
  add("Movimentos", d.transactions.map((t) => ({ Ativo: assetName.get(t.assetId), Data: day(t.date), "Data valor": day(t.valueDate), Descrição: t.description, Montante: t.amount, Saldo: t.balanceAfter, Tipo: t.kind ?? "", Estado: t.status, Categoria: t.categoryId ? catName.get(t.categoryId) : "", Nota: t.note ?? "" })));
  add("Categorias", d.categories.map((c) => ({ Nome: c.name, Tipo: c.kind, Cor: c.color, "Limite mensal": d.budgets.find((b) => b.categoryId === c.id)?.monthlyLimit ?? "", Regras: d.rules.filter((r) => r.categoryId === c.id).map((r) => r.pattern).join(" | ") })));
  add("Mais-valias", d.realized.map((r) => ({ Ativo: assetName.get(r.assetId), Instrumento: r.name, Ticker: r.ticker ?? "", Quantidade: r.quantity, "Preço abertura": r.openPrice, "Preço fecho": r.closePrice, Abertura: ts(r.openTime), Fecho: ts(r.closeTime), Resultado: r.profitEur, Comissão: r.commission })));
  add("Cotações", d.instruments.map((i) => ({ Chave: i.key, Nome: i.name, "Símbolo Yahoo": i.symbol ?? "", Manual: i.manual ? "sim" : "não", Erro: i.lastError ?? "" })));
  add("Importações", d.importBatches.map((b) => ({ Ativo: assetName.get(b.assetId), Origem: b.source, Ficheiro: b.fileName, Data: ts(b.createdAt), Linhas: b.rowsTotal, Novas: b.rowsNew })));
  add("Utilizadores", d.users.map((u) => ({ Email: u.email, Nome: u.name ?? "", Perfil: u.role, "Membros visíveis": u.visibleMembers.map((m) => memberName.get(m.id)).join(", ") })));
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
