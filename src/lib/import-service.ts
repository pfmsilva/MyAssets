import { createHash } from "crypto";
import { prisma } from "./prisma";
import { loadRules, matchCategory } from "./categorize";
import { ImporterKey, parseFile } from "./importers";
import { ParsedImport, ParsedTransaction } from "./importers/types";

export type ImportResult = {
  batchId: string;
  source: string;
  rowsTotal: number;
  rowsNew: number;
  rowsExisting: number;
  positions: number;
  balance?: number;
  balanceDate?: string;
  derivedSnapshots: number;
  categorized: number;
  warnings: string[];
};

function txHash(t: ParsedTransaction, dup: number) {
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
  userId?: string;
}): Promise<ImportResult> {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: opts.assetId } });
  const parsed: ParsedImport = parseFile(opts.importer, opts.buffer);
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

  const batch = await prisma.importBatch.create({
    data: { assetId: asset.id, source: parsed.source, fileName: opts.fileName, userId: opts.userId, rowsTotal: parsed.transactions.length },
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
  let derivedSnapshots = 0;
  if (parsed.balance !== undefined) {
    const snap = await prisma.snapshot.upsert({
      where: { assetId_date: { assetId: asset.id, date: new Date(balanceDate) } },
      create: { assetId: asset.id, date: new Date(balanceDate), value: parsed.balance, source: "IMPORT", importBatchId: batch.id, note: opts.fileName },
      update: { value: parsed.balance, source: "IMPORT", importBatchId: batch.id, note: opts.fileName },
    });
    if (parsed.positions.length) {
      await prisma.position.deleteMany({ where: { snapshotId: snap.id } });
      await prisma.position.createMany({
        data: parsed.positions.map((p) => ({ snapshotId: snap.id, name: p.name, isin: p.isin ?? null, quantity: p.quantity ?? null, price: p.price ?? null, currency: p.currency, value: p.value ?? null, valueEur: p.valueEur })),
      });
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

  await prisma.importBatch.update({ where: { id: batch.id }, data: { rowsNew } });
  return {
    batchId: batch.id,
    source: parsed.source,
    rowsTotal: parsed.transactions.length,
    rowsNew,
    rowsExisting: parsed.transactions.length - rowsNew,
    positions: parsed.positions.length,
    balance: parsed.balance,
    balanceDate: parsed.balance !== undefined ? balanceDate : undefined,
    derivedSnapshots,
    categorized,
    warnings,
  };
}
