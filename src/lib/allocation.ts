import { AssetClass, AssetType } from "@prisma/client";
import { prisma } from "./prisma";
import { getLiveValuations, LiveValuation } from "./quotes";

/** Class assumed for an asset that has no detailed positions. */
export const DEFAULT_CLASS_BY_TYPE: Record<AssetType, AssetClass> = {
  CURRENT_ACCOUNT: "CASH",
  CASH: "CASH",
  PPR: "MIXED",
  BROKERAGE: "EQUITY",
  STOCK_PORTFOLIO: "EQUITY",
  CRYPTO: "CRYPTO",
  OTHER: "OTHER",
};

const RULES: [RegExp, AssetClass][] = [
  [/\b(gold|ouro|silver|prata|platinum|palladium|commodit)/i, "GOLD"],
  [/\b(bond|obriga|treasur|aggregate|govies|gilt|corporate deb|fixed income|renda fixa)/i, "BOND"],
  [/\b(bitcoin|btc|ethereum|eth|crypto|cripto)\b/i, "CRYPTO"],
  [/\b(cash|liquidez|money market|monet[áa]rio|fundo de tesouraria)\b/i, "CASH"],
  [/\b(reit|real estate|imobili[áa]r|property)\b/i, "REAL_ESTATE"],
];

/** Best guess for a position's class, from its name and the asset it belongs to. */
export function guessClass(name: string, assetType: AssetType): AssetClass {
  for (const [re, cls] of RULES) if (re.test(name)) return cls;
  return DEFAULT_CLASS_BY_TYPE[assetType];
}

export type ClassRow = {
  assetClass: AssetClass;
  current: number;
  currentPct: number;
  targetPct: number | null;
  targetValue: number | null;
  driftPp: number | null; // percentage points away from the target
  delta: number | null; // euros to buy (+) or sell (-) to hit the target
  contribute: number | null; // euros to buy using new money only (never sells)
  status: "ok" | "over" | "under" | "none";
  sources: { name: string; value: number }[];
};

export type AllocationView = {
  total: number;
  rows: ClassRow[];
  targetTotal: number;
  bandPp: number;
  unclassified: { instrumentId: string | null; assetId: string | null; name: string; value: number; assetName: string; assetClass: AssetClass }[];
  newMoneyNeeded: number | null; // amount that would fix every underweight class without selling
  usedLive: boolean;
};

type Contribution = { assetClass: AssetClass; value: number; label: string; instrumentId: string | null; assetId: string | null; guessed: boolean; assetName: string };

/**
 * Splits every asset's latest value into asset classes. The headline value comes from the most recent
 * snapshot (or the live quotes), while the composition comes from the most recent snapshot that has
 * positions — the daily value-only snapshot must not hide a portfolio's breakdown.
 */
async function contributions(opts: { live?: boolean; assetIds?: string[] }): Promise<{ list: Contribution[]; usedLive: boolean }> {
  const assets = await prisma.asset.findMany({
    where: { active: true, ...(opts.assetIds ? { id: { in: opts.assetIds } } : {}) },
    include: { snapshots: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: { sortOrder: "asc" },
  });
  const ids = assets.map((a) => a.id);
  const [instruments, positionSnaps] = await Promise.all([
    prisma.instrument.findMany(),
    prisma.snapshot.findMany({ where: { assetId: { in: ids }, positions: { some: {} } }, orderBy: { date: "desc" }, include: { positions: true } }),
  ]);
  const byKey = new Map(instruments.map((i) => [i.key.toUpperCase(), i]));
  const composition = new Map<string, (typeof positionSnaps)[number]>();
  for (const s of positionSnaps) if (!composition.has(s.assetId)) composition.set(s.assetId, s);
  const live: Map<string, LiveValuation> = opts.live ? await getLiveValuations(ids, { resolve: false }) : new Map();

  let usedLive = false;
  const list: Contribution[] = [];
  for (const a of assets) {
    const snap = a.snapshots[0];
    const liveRow = live.get(a.id);
    const hasLive = !!liveRow && liveRow.quoted > 0;
    const value = hasLive ? liveRow!.liveTotal : (snap?.value ?? 0);
    if (!value) continue;
    if (hasLive) usedLive = true;
    const comp = composition.get(a.id);
    if (!comp) {
      list.push({ assetClass: a.assetClass ?? DEFAULT_CLASS_BY_TYPE[a.type], value, label: a.name, instrumentId: null, assetId: a.id, guessed: !a.assetClass, assetName: a.name });
      continue;
    }
    const livePos = new Map((liveRow?.positions ?? []).map((p) => [p.id, p]));
    const parts = comp.positions.map((p) => ({ p, raw: livePos.get(p.id)?.liveValueEur ?? p.valueEur }));
    const rawTotal = parts.reduce((s, x) => s + x.raw, 0);
    if (rawTotal <= 0) {
      list.push({ assetClass: a.assetClass ?? DEFAULT_CLASS_BY_TYPE[a.type], value, label: a.name, instrumentId: null, assetId: a.id, guessed: !a.assetClass, assetName: a.name });
      continue;
    }
    // scale the composition so it adds up to the asset's headline value
    for (const { p, raw } of parts) {
      const inst = p.isin ? byKey.get(p.isin.toUpperCase()) : undefined;
      const cls = inst?.assetClass ?? guessClass(p.name, a.type);
      list.push({ assetClass: cls, value: (raw / rawTotal) * value, label: p.name, instrumentId: inst?.id ?? null, assetId: a.id, guessed: !inst?.assetClass, assetName: a.name });
    }
  }
  return { list, usedLive };
}

/** Current allocation, targets, drift and what to buy or sell to get back on target. */
export async function getAllocation(opts: { live?: boolean; bandPp?: number; assetIds?: string[] } = {}): Promise<AllocationView> {
  const [{ list, usedLive }, targets] = await Promise.all([contributions({ live: opts.live ?? true, assetIds: opts.assetIds }), prisma.allocationTarget.findMany()]);
  const bandPp = opts.bandPp ?? 5;
  const total = Math.round(list.reduce((s, c) => s + c.value, 0) * 100) / 100;
  const classes = new Set<AssetClass>([...list.map((c) => c.assetClass), ...targets.map((t) => t.assetClass)]);
  const targetTotal = Math.round(targets.reduce((s, t) => s + t.percent, 0) * 100) / 100;
  const hasTargets = targets.length > 0 && targetTotal > 0;

  const rows: ClassRow[] = [...classes].map((cls) => {
    const parts = list.filter((c) => c.assetClass === cls);
    const current = Math.round(parts.reduce((s, c) => s + c.value, 0) * 100) / 100;
    const currentPct = total ? current / total : 0;
    const target = targets.find((t) => t.assetClass === cls);
    const targetPct = hasTargets ? (target?.percent ?? 0) / 100 : null;
    const targetValue = targetPct !== null ? Math.round(total * targetPct * 100) / 100 : null;
    const driftPp = targetPct !== null ? (currentPct - targetPct) * 100 : null;
    const byLabel = new Map<string, number>();
    for (const p of parts) byLabel.set(p.label, (byLabel.get(p.label) ?? 0) + p.value);
    return {
      assetClass: cls,
      current,
      currentPct,
      targetPct,
      targetValue,
      driftPp,
      delta: targetValue !== null ? Math.round((targetValue - current) * 100) / 100 : null,
      contribute: null,
      status: driftPp === null ? "none" : Math.abs(driftPp) <= bandPp ? "ok" : driftPp > 0 ? "over" : "under",
      sources: [...byLabel.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    };
  });

  // money to add so every class reaches its target without selling anything
  let newMoneyNeeded: number | null = null;
  if (hasTargets && total > 0) {
    const scaled = rows.filter((r) => r.targetPct && r.targetPct > 0).map((r) => r.current / r.targetPct!);
    const requiredTotal = scaled.length ? Math.max(...scaled, total) : total;
    newMoneyNeeded = Math.round((requiredTotal - total) * 100) / 100;
    for (const r of rows) r.contribute = r.targetPct !== null ? Math.max(0, Math.round((requiredTotal * r.targetPct - r.current) * 100) / 100) : null;
  }

  const order: AssetClass[] = ["EQUITY", "BOND", "GOLD", "REAL_ESTATE", "CRYPTO", "MIXED", "CASH", "OTHER"];
  rows.sort((a, b) => order.indexOf(a.assetClass) - order.indexOf(b.assetClass));
  const unclassified = list
    .filter((c) => c.guessed && c.value > 0)
    .map((c) => ({ instrumentId: c.instrumentId, assetId: c.assetId, name: c.label, value: c.value, assetName: c.assetName, assetClass: c.assetClass }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 40);
  return { total, rows, targetTotal, bandPp, unclassified, newMoneyNeeded, usedLive };
}
