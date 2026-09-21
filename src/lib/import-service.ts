import { createHash } from "crypto";
import { prisma } from "./prisma";
import { loadRules, matchCategory } from "./categorize";
import { ImporterKey, parseFile } from "./importers";
import { ParsedImport, ParsedTransaction } from "./importers/types";
import { syncPortfolioSnapshot } from "./stock-portfolio";
import { ASSET_TYPE_LABEL } from "./format";

export type ImportResult = {
  batchId: string;
  source: string;
  rowsTotal: number;
  rowsNew: number;
  rowsExisting: number;
  positions: number;
  realizedNew: number;
  tradesTotal: number;
  tradesNew: number;
  holdingsNew: number;
  balance?: number;
  balanceDate?: string;
  derivedSnapshots: number;
  categorized: number;
  warnings: string[];
};

function txHash(t: ParsedTransaction, dup: number) {
  if (t.externalId) return createHash("sha256").update(`id|${t.externalId}|${dup}`).digest("hex").slice(0, 40);
  return createHash("sha256")
    .update([t.date, t.description, t.amount.toFixed(2), t.balanceAfter?.toFixed(2) ?? "", dup].join("|"))
    .digest("hex")
    .slice(0, 40);
}

function endOfMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export async function runImport(opts: {
  assetId: string;
  importer: ImporterKey;
  fileName: string;
  buffer: ArrayBuffer;
  snapshotDate?: string; // override for the snapshot date (DEGIRO, or the date of `currentBalance`)
  currentBalance?: number; // for statements without running balance (CTT): balance after the newest row
  convertToPortfolio?: boolean; // turn the asset into a stock portfolio when importing purchases and sales
  userId?: string;
}): Promise<ImportResult> {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: opts.assetId } });
  const parsed: ParsedImport = await parseFile(opts.importer, opts.buffer);
  const warnings = [...parsed.warnings];
  const today = new Date().toISOString().slice(0, 10);
  const balanceDate = opts.snapshotDate || parsed.balanceDate || today;

  // Hashes come from the file's own data (a reconstructed balance must not change them).
  const seen = new Map<string, number>();
  const hashes = parsed.transactions.map((t) => {
    const base = txHash(t, 0);
    const dup = seen.get(base) ?? 0;
    seen.set(base, dup + 1);
    return dup ? txHash(t, dup) : base;
  });
  if (opts.currentBalance !== undefined && parsed.transactions.length && parsed.transactions.every((t) => t.balanceAfter === undefined)) {
    // reconstruct balances backwards from the known current balance
    const chrono = [...parsed.transactions].sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
    let bal = opts.currentBalance;
    for (let i = chrono.length - 1; i >= 0; i--) {
      chrono[i].balanceAfter = Math.round(bal * 100) / 100;
      bal -= chrono[i].amount;
    }
    parsed.balance = opts.currentBalance;
    parsed.balanceDate = opts.snapshotDate || parsed.balanceDate;
    warnings.splice(0, warnings.length, ...warnings.filter((w) => !/indique o saldo atual/i.test(w)));
  }

  let assetType = asset.type;
  if (parsed.trades?.length && assetType !== "STOCK_PORTFOLIO") {
    if (!opts.convertToPortfolio) {
      throw new Error(
        `"${asset.name}" é do tipo "${ASSET_TYPE_LABEL[assetType] ?? assetType}". As compras e vendas precisam do tipo "Carteira de ações (manual)": marque a opção "converter o ativo" neste formulário, ou altere o tipo em Administração → Ativos. O histórico de valores é mantido.`,
      );
    }
    await prisma.asset.update({ where: { id: asset.id }, data: { type: "STOCK_PORTFOLIO" } });
    assetType = "STOCK_PORTFOLIO";
    warnings.push(`"${asset.name}" passou a ser uma carteira de ações (manual); o valor passa a ser calculado a partir das compras e vendas com as cotações do Yahoo.`);
  }

  const batch = await prisma.importBatch.create({
    data: { assetId: asset.id, source: parsed.source, fileName: opts.fileName, userId: opts.userId, rowsTotal: parsed.transactions.length || parsed.trades?.length || 0 },
  });

  // ---- transactions ----
  let rowsNew = 0;
  let categorized = 0;
  if (parsed.transactions.length) {
    const rules = await loadRules();
    // pending rows are replaced by the new file's view of them
    await prisma.transaction.deleteMany({ where: { assetId: asset.id, status: "PENDING" } });
    const rows = parsed.transactions.map((t, i) => {
      const categoryId = matchCategory(rules, t.description);
      if (categoryId) categorized++;
      return {
        assetId: asset.id,
        date: new Date(t.date),
        valueDate: t.valueDate ? new Date(t.valueDate) : null,
        seq: t.seq,
        description: t.description,
        amount: t.amount,
        fee: t.fee ?? 0,
        balanceAfter: t.balanceAfter ?? null,
        kind: t.kind ?? null,
        status: t.status,
        hash: hashes[i],
        categoryId,
        importBatchId: batch.id,
      };
    });
    for (let i = 0; i < rows.length; i += 1000) {
      const r = await prisma.transaction.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true });
      rowsNew += r.count;
    }
  }

  // ---- positions + snapshot ----
  if (parsed.balance !== undefined) {
    const snap = await prisma.snapshot.upsert({
      where: { assetId_date: { assetId: asset.id, date: new Date(balanceDate) } },
      create: { assetId: asset.id, date: new Date(balanceDate), value: parsed.balance, source: "IMPORT", importBatchId: batch.id, note: opts.fileName },
      update: { value: parsed.balance, source: "IMPORT", importBatchId: batch.id, note: opts.fileName },
    });
    if (parsed.positions.length) {
      await prisma.position.deleteMany({ where: { snapshotId: snap.id } });
      await prisma.position.createMany({
        data: parsed.positions.map((p) => ({ snapshotId: snap.id, name: p.name, isin: p.isin ?? null, quantity: p.quantity ?? null, price: p.price ?? null, currency: p.currency, value: p.value ?? null, valueEur: p.valueEur, avgPrice: p.avgPrice ?? null, costEur: p.costEur ?? null })),
      });
    }
  }

  let derivedSnapshots = 0;
  // ---- earlier valuations stated in the file (e.g. previous month total) ----
  for (const prev of parsed.previousSnapshots ?? []) {
    const date = new Date(prev.date);
    const existing = await prisma.snapshot.findUnique({ where: { assetId_date: { assetId: asset.id, date } } });
    if (existing && existing.source !== "DERIVED") continue;
    await prisma.snapshot.upsert({
      where: { assetId_date: { assetId: asset.id, date } },
      create: { assetId: asset.id, date, value: prev.value, source: "DERIVED", note: `Valor indicado no extrato ${opts.fileName}` },
      update: { value: prev.value },
    });
    if (!existing) derivedSnapshots++;
  }

  // ---- realised trades ----
  let realizedNew = 0;
  if (parsed.realized?.length) {
    const r = await prisma.realizedTrade.createMany({
      data: parsed.realized.map((t) => ({ assetId: asset.id, externalId: t.externalId, name: t.name, ticker: t.ticker ?? null, quantity: t.quantity ?? null, openPrice: t.openPrice ?? null, closePrice: t.closePrice ?? null, openTime: t.openTime ? new Date(t.openTime) : null, closeTime: new Date(t.closeTime), profitEur: t.profitEur, grossEur: t.grossEur ?? null, commission: t.commission ?? null, importBatchId: batch.id })),
      skipDuplicates: true,
    });
    realizedNew = r.count;
  }

  // ---- purchases and sales of a manual stock portfolio ----
  let tradesNew = 0;
  let holdingsNew = 0;
  if (parsed.trades?.length) {
    const byIsin = new Map<string, typeof parsed.trades>();
    for (const t of parsed.trades) {
      const list = byIsin.get(t.isin) ?? [];
      list.push(t);
      byIsin.set(t.isin, list);
    }
    let sortOrder = await prisma.holding.count({ where: { assetId: asset.id } });
    for (const [isin, list] of byIsin) {
      const existing = await prisma.holding.findUnique({ where: { assetId_isin: { assetId: asset.id, isin } } });
      const holding =
        existing ??
        (await prisma.holding.create({ data: { assetId: asset.id, isin, name: list[0].name, sortOrder: sortOrder++ } }));
      if (!existing) holdingsNew++;
      const created = await prisma.trade.createMany({
        data: list.map((t) => ({ holdingId: holding.id, date: new Date(t.date), quantity: t.quantity, amount: t.amountEur, fee: t.feeEur, note: t.note ?? null, externalId: t.externalId, importBatchId: batch.id })),
        skipDuplicates: true,
      });
      tradesNew += created.count;
    }
    try {
      await syncPortfolioSnapshot(asset.id, { force: true });
    } catch (e) {
      warnings.push(`Compras e vendas importadas, mas não foi possível atualizar o valor com as cotações: ${e instanceof Error ? e.message.slice(0, 120) : "erro"}. Use "Atualizar cotações" na página do ativo.`);
    }
  }

  // ---- derived month-end snapshots from running balances (history for free) ----
  if (parsed.transactions.length) {
    const withBal = parsed.transactions
      .filter((t) => t.status === "COMPLETED" && t.balanceAfter !== undefined)
      .sort((a, b) => (a.valueDate ?? a.date).localeCompare(b.valueDate ?? b.date) || a.seq - b.seq);
    const lastOfMonth = new Map<string, ParsedTransaction>();
    for (const t of withBal) lastOfMonth.set((t.valueDate ?? t.date).slice(0, 7), t);
    const currentMonth = balanceDate.slice(0, 7);
    for (const [month, t] of lastOfMonth) {
      if (month >= currentMonth) continue; // the current month is covered by the IMPORT snapshot
      const date = new Date(endOfMonth(month + "-01"));
      const existing = await prisma.snapshot.findUnique({ where: { assetId_date: { assetId: asset.id, date } } });
      if (existing && existing.source !== "DERIVED") continue;
      await prisma.snapshot.upsert({
        where: { assetId_date: { assetId: asset.id, date } },
        create: { assetId: asset.id, date, value: t.balanceAfter!, source: "DERIVED", note: "Saldo de fim de mês (derivado do extrato)" },
        update: { value: t.balanceAfter! },
      });
      if (!existing) derivedSnapshots++;
    }
  }

  await prisma.importBatch.update({ where: { id: batch.id }, data: { rowsNew: rowsNew || tradesNew } });
  return {
    batchId: batch.id,
    source: parsed.source,
    rowsTotal: parsed.transactions.length,
    rowsNew,
    rowsExisting: parsed.transactions.length - rowsNew,
    positions: parsed.positions.length,
    realizedNew,
    tradesTotal: parsed.trades?.length ?? 0,
    tradesNew,
    holdingsNew,
    balance: parsed.balance,
    balanceDate: parsed.balance !== undefined ? balanceDate : undefined,
    derivedSnapshots,
    categorized,
    warnings,
  };
}
