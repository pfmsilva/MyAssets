import { prisma } from "./prisma";
import { computeHolding } from "./stock-portfolio";

/**
 * Consistency checks over the data: things that are probably wrong even though nothing failed
 * (a total that does not match its positions, the same movement imported twice, a cost that
 * makes a gain absurd). The detectors are plain functions over rows so they can be tested;
 * `checkDataQuality` loads the rows and runs them all.
 */

export type QualityLevel = "error" | "warn" | "info";
export type QualityIssue = { code: string; level: QualityLevel; assetId?: string; assetName?: string; title: string; detail?: string };

type AssetRef = { id: string; name: string };
const eur = (v: number) => `${Math.round(v).toLocaleString("pt-PT")} €`;
const day = (d: Date | string) => (typeof d === "string" ? d : d.toISOString().slice(0, 10));
const list = (xs: string[], max = 4) => `${xs.slice(0, max).join("; ")}${xs.length > max ? ` e mais ${xs.length - max}` : ""}`;

// ---------- detectors ----------

/** A snapshot whose total is not the sum of its positions. */
export function snapshotMismatches(snaps: { asset: AssetRef; date: Date; value: number; positions: { valueEur: number }[] }[]): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const s of snaps) {
    if (!s.positions.length) continue;
    const sum = s.positions.reduce((t, p) => t + p.valueEur, 0);
    const diff = s.value - sum;
    if (Math.abs(diff) > Math.max(1, Math.abs(s.value) * 0.005)) {
      out.push({ code: "snapshot-mismatch", level: "warn", assetId: s.asset.id, assetName: s.asset.name, title: `${s.asset.name}: o total de ${day(s.date)} (${eur(s.value)}) não bate com a soma das posições (${eur(sum)})`, detail: `Diferença de ${eur(diff)}. Pode faltar uma posição (por exemplo, o dinheiro disponível) ou o ficheiro foi importado a meio.` });
    }
  }
  return out;
}

/** The same movement in two imports, or with the same balance afterwards: it was loaded twice. */
export function duplicateTransactions(txs: { asset: AssetRef; date: Date; amount: number; description: string; balanceAfter: number | null; importBatchId: string | null }[]): QualityIssue[] {
  const groups = new Map<string, typeof txs>();
  for (const t of txs) {
    const key = `${t.asset.id}|${day(t.date)}|${t.amount.toFixed(2)}|${t.description.trim().toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const byAsset = new Map<string, { asset: AssetRef; examples: string[] }>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const batches = new Set(g.map((t) => t.importBatchId ?? "manual"));
    const balances = g.map((t) => t.balanceAfter);
    // two coffees on the same day are normal; two copies from different files, or with the same balance, are not
    const sameBalance = balances.every((b) => b !== null) && new Set(balances).size === 1;
    if (batches.size < 2 && !sameBalance) continue;
    const cur = byAsset.get(g[0].asset.id) ?? { asset: g[0].asset, examples: [] };
    cur.examples.push(`${day(g[0].date)} ${g[0].description.slice(0, 40)} (${eur(g[0].amount)} ×${g.length})`);
    byAsset.set(g[0].asset.id, cur);
  }
  return [...byAsset.values()].map(({ asset, examples }) => ({ code: "duplicate-transactions", level: "warn" as const, assetId: asset.id, assetName: asset.name, title: `${asset.name}: ${examples.length} movimento(s) possivelmente duplicado(s)`, detail: `${list(examples)}. Apague o duplicado em Movimentos, ou desfaça a importação repetida.` }));
}

/** Two purchases or sales with the same day, quantity and amount but different identifiers. */
export function duplicateTrades(trades: { asset: AssetRef; holding: string; date: Date; quantity: number; amount: number; externalId: string | null }[]): QualityIssue[] {
  const groups = new Map<string, typeof trades>();
  for (const t of trades) {
    const key = `${t.asset.id}|${t.holding}|${day(t.date)}|${t.quantity}|${t.amount.toFixed(2)}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const byAsset = new Map<string, { asset: AssetRef; examples: string[] }>();
  for (const g of groups.values()) {
    if (g.length < 2 || new Set(g.map((t) => t.externalId ?? "manual")).size < 2) continue;
    const cur = byAsset.get(g[0].asset.id) ?? { asset: g[0].asset, examples: [] };
    cur.examples.push(`${day(g[0].date)} ${g[0].holding} ${g[0].quantity > 0 ? "compra" : "venda"} de ${Math.abs(g[0].quantity)} (${eur(g[0].amount)} ×${g.length})`);
    byAsset.set(g[0].asset.id, cur);
  }
  return [...byAsset.values()].map(({ asset, examples }) => ({ code: "duplicate-trades", level: "warn" as const, assetId: asset.id, assetName: asset.name, title: `${asset.name}: ${examples.length} operação(ões) repetida(s)`, detail: `${list(examples)}. Execuções parciais legítimas têm o mesmo preço mas raramente a mesma quantidade e valor.` }));
}

/** Positions with a value but no acquisition cost (the gain cannot be computed) and gains that look wrong. */
export function positionCosts(assets: { asset: AssetRef; positions: { name: string; valueEur: number; costEur: number | null; quantity: number | null }[] }[]): QualityIssue[] {
  const out: QualityIssue[] = [];
  for (const { asset, positions } of assets) {
    const invested = positions.filter((p) => p.quantity !== null && p.valueEur > 50);
    const noCost = invested.filter((p) => p.costEur === null);
    if (noCost.length) out.push({ code: "missing-cost", level: "info", assetId: asset.id, assetName: asset.name, title: `${asset.name}: ${noCost.length} posição(ões) sem custo de aquisição`, detail: `${list(noCost.map((p) => p.name))}. O ganho destas posições não é calculado.` });
    const odd = invested.filter((p) => p.costEur !== null && p.costEur > 50 && (p.valueEur / p.costEur > 11 || p.valueEur / p.costEur < 0.05));
    if (odd.length) out.push({ code: "suspicious-gain", level: "warn", assetId: asset.id, assetName: asset.name, title: `${asset.name}: ${odd.length} posição(ões) com ganho suspeito`, detail: `${list(odd.map((p) => `${p.name} (valor ${eur(p.valueEur)}, custo ${eur(p.costEur!)})`))}. Um ganho acima de 1 000 % ou uma perda acima de 95 % costuma ser um custo importado errado.` });
  }
  return out;
}

/** Jumps between consecutive records of the same asset that no one would expect. */
export function snapshotJumps(series: { asset: AssetRef; points: { date: Date; value: number }[] }[], opts: { pct?: number; min?: number } = {}): QualityIssue[] {
  const pct = opts.pct ?? 0.4;
  const min = opts.min ?? 1000;
  const out: QualityIssue[] = [];
  for (const { asset, points } of series) {
    const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
    const jumps: string[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].value;
      const cur = sorted[i].value;
      if (prev >= min && Math.abs(cur - prev) / prev > pct) jumps.push(`${day(sorted[i].date)}: ${eur(prev)} → ${eur(cur)}`);
    }
    if (jumps.length) out.push({ code: "snapshot-jump", level: "info", assetId: asset.id, assetName: asset.name, title: `${asset.name}: ${jumps.length} variação(ões) de mais de ${Math.round(pct * 100)} % entre registos`, detail: `${list(jumps)}. Se não houve depósito, levantamento ou venda, pode ser um registo errado.` });
  }
  return out;
}

/** Records dated in the future. */
export function futureDates(rows: { kind: string; asset: AssetRef; date: Date }[], now = new Date()): QualityIssue[] {
  const limit = now.getTime() + 2 * 86400e3;
  const byAsset = new Map<string, { asset: AssetRef; kinds: Map<string, number> }>();
  for (const r of rows) {
    if (r.date.getTime() <= limit) continue;
    const cur = byAsset.get(r.asset.id) ?? { asset: r.asset, kinds: new Map() };
    cur.kinds.set(r.kind, (cur.kinds.get(r.kind) ?? 0) + 1);
    byAsset.set(r.asset.id, cur);
  }
  return [...byAsset.values()].map(({ asset, kinds }) => ({ code: "future-dates", level: "error" as const, assetId: asset.id, assetName: asset.name, title: `${asset.name}: registos com data no futuro`, detail: [...kinds].map(([k, n]) => `${n} ${k}`).join(", ") + ". Quase de certeza é um erro de data (dia e mês trocados?)." }));
}

/** Sales of more shares than were bought. */
export function oversold(holdings: { asset: AssetRef; name: string; trades: { date: Date; quantity: number; amount: number; fee: number }[] }[]): QualityIssue[] {
  const byAsset = new Map<string, { asset: AssetRef; names: string[] }>();
  for (const h of holdings) {
    if (!computeHolding(h.trades).warning) continue;
    const cur = byAsset.get(h.asset.id) ?? { asset: h.asset, names: [] };
    cur.names.push(h.name);
    byAsset.set(h.asset.id, cur);
  }
  return [...byAsset.values()].map(({ asset, names }) => ({ code: "oversold", level: "warn" as const, assetId: asset.id, assetName: asset.name, title: `${asset.name}: vendas de mais ações do que as compradas`, detail: `${list(names)}. Falta importar compras anteriores (ficheiro de transações desde o início).` }));
}

/** Many expenses without a category make the budget and the charts unreliable. */
export function uncategorized(rows: { categoryId: string | null; amount: number }[], threshold = 0.2): QualityIssue[] {
  const expenses = rows.filter((r) => r.amount < 0);
  if (expenses.length < 20) return [];
  const missing = expenses.filter((r) => !r.categoryId);
  const share = missing.length / expenses.length;
  if (share <= threshold) return [];
  return [{ code: "uncategorized", level: "info", title: `${Math.round(share * 100)} % das despesas dos últimos 90 dias sem categoria`, detail: `${missing.length} de ${expenses.length} movimentos (${eur(-missing.reduce((t, r) => t + r.amount, 0))}). Crie regras em Categorias e regras.` }];
}

// ---------- loader ----------

export type QualityResult = { checkedAt: string; issues: QualityIssue[]; counts: Record<QualityLevel, number> };

const ORDER: Record<QualityLevel, number> = { error: 0, warn: 1, info: 2 };

export async function checkDataQuality(opts: { assetIds?: string[] } = {}): Promise<QualityResult> {
  const scope = opts.assetIds ? { id: { in: opts.assetIds } } : {};
  const assets = await prisma.asset.findMany({ where: { active: true, ...scope }, select: { id: true, name: true, type: true } });
  const ids = assets.map((a) => a.id);
  const ref = new Map(assets.map((a) => [a.id, { id: a.id, name: a.name } as AssetRef]));
  const since400 = new Date(Date.now() - 400 * 86400e3);
  const since90 = new Date(Date.now() - 90 * 86400e3);

  const [snaps, txs, trades, holdings, recentTx] = await Promise.all([
    prisma.snapshot.findMany({ where: { assetId: { in: ids } }, orderBy: { date: "asc" }, select: { assetId: true, date: true, value: true, positions: { select: { name: true, valueEur: true, costEur: true, quantity: true } } } }),
    prisma.transaction.findMany({ where: { assetId: { in: ids }, date: { gte: since400 } }, select: { assetId: true, date: true, amount: true, description: true, balanceAfter: true, importBatchId: true } }),
    prisma.trade.findMany({ where: { holding: { assetId: { in: ids } } }, select: { date: true, quantity: true, amount: true, fee: true, externalId: true, holding: { select: { id: true, name: true, assetId: true } } } }),
    prisma.holding.findMany({ where: { assetId: { in: ids } }, select: { assetId: true, name: true, trades: { select: { date: true, quantity: true, amount: true, fee: true } } } }),
    prisma.transaction.findMany({ where: { assetId: { in: ids }, date: { gte: since90 }, asset: { type: "CURRENT_ACCOUNT" } }, select: { categoryId: true, amount: true } }),
  ]);

  const bySnap = new Map<string, typeof snaps>();
  for (const s of snaps) bySnap.set(s.assetId, [...(bySnap.get(s.assetId) ?? []), s]);
  // only the latest records are worth checking one by one: old months were corrected or accepted long ago
  const recent = [...bySnap.values()].flatMap((list) => list.slice(-3));
  const latestWithPositions = [...bySnap.entries()].flatMap(([assetId, list]) => {
    const last = [...list].reverse().find((s) => s.positions.length);
    return last ? [{ asset: ref.get(assetId)!, positions: last.positions }] : [];
  });

  const issues: QualityIssue[] = [
    ...futureDates([
      ...snaps.map((s) => ({ kind: "valor(es)", asset: ref.get(s.assetId)!, date: s.date })),
      ...txs.map((t) => ({ kind: "movimento(s)", asset: ref.get(t.assetId)!, date: t.date })),
      ...trades.map((t) => ({ kind: "operação(ões)", asset: ref.get(t.holding.assetId)!, date: t.date })),
    ]),
    ...snapshotMismatches(recent.map((s) => ({ asset: ref.get(s.assetId)!, date: s.date, value: s.value, positions: s.positions }))),
    ...duplicateTransactions(txs.map((t) => ({ ...t, asset: ref.get(t.assetId)! }))),
    ...duplicateTrades(trades.map((t) => ({ asset: ref.get(t.holding.assetId)!, holding: t.holding.name, date: t.date, quantity: t.quantity, amount: t.amount, externalId: t.externalId }))),
    ...oversold(holdings.map((h) => ({ asset: ref.get(h.assetId)!, name: h.name, trades: h.trades }))),
    ...positionCosts(latestWithPositions.filter((a) => assets.find((x) => x.id === a.asset.id)?.type !== "CURRENT_ACCOUNT")),
    ...snapshotJumps([...bySnap.entries()].map(([assetId, list]) => ({ asset: ref.get(assetId)!, points: list.slice(-24).map((s) => ({ date: s.date, value: s.value })) }))),
    ...uncategorized(recentTx),
  ];
  issues.sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.assetName ?? "").localeCompare(b.assetName ?? ""));
  const counts = { error: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.level]++;
  return { checkedAt: new Date().toISOString(), issues, counts };
}
