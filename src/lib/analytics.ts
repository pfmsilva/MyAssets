import { prisma } from "./prisma";

export type AssetValue = {
  id: string;
  name: string;
  institution: string;
  type: string;
  importer: string | null;
  value: number;
  date: string | null;
  source: string | null;
  owners: { memberId: string; memberName: string; color: string; percent: number }[];
};

/** Latest snapshot value per active asset. */
export async function getCurrentValues(opts: { assetIds?: string[] } = {}): Promise<AssetValue[]> {
  const assets = await prisma.asset.findMany({
    where: { active: true, ...(opts.assetIds ? { id: { in: opts.assetIds } } : {}) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      ownerships: { include: { member: true } },
      snapshots: { orderBy: { date: "desc" }, take: 1 },
    },
  });
  return assets.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    type: a.type,
    importer: a.importer,
    value: a.snapshots[0]?.value ?? 0,
    date: a.snapshots[0] ? a.snapshots[0].date.toISOString().slice(0, 10) : null,
    source: a.snapshots[0]?.source ?? null,
    owners: a.ownerships.map((o) => ({ memberId: o.memberId, memberName: o.member.name, color: o.member.color, percent: o.percent })),
  }));
}

export function groupBy<T>(items: T[], key: (t: T) => string, val: (t: T) => number) {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + val(it));
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function byMember(values: AssetValue[]) {
  const m = new Map<string, { name: string; color: string; value: number }>();
  for (const a of values)
    for (const o of a.owners) {
      const cur = m.get(o.memberId) ?? { name: o.memberName, color: o.color, value: 0 };
      cur.value += (a.value * o.percent) / 100;
      m.set(o.memberId, cur);
    }
  return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value);
}

export type MonthPoint = { month: string; total: number; byAsset: Record<string, number>; byMember: Record<string, number>; byType: Record<string, number> };

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Monthly net worth series: for each month, the latest snapshot of each asset up to month end (carried forward). */
export async function getNetWorthSeries(opts: { memberId?: string; assetId?: string; assetIds?: string[] } = {}): Promise<{ months: MonthPoint[]; assets: { id: string; name: string; type: string }[] }> {
  const assets = await prisma.asset.findMany({
    where: {
      active: true,
      ...(opts.assetId ? { id: opts.assetId } : opts.assetIds ? { id: { in: opts.assetIds } } : {}),
      ...(opts.memberId ? { ownerships: { some: { memberId: opts.memberId } } } : {}),
    },
    include: { ownerships: true, snapshots: { orderBy: { date: "asc" }, select: { date: true, value: true } } },
    orderBy: { sortOrder: "asc" },
  });
  const allDates = assets.flatMap((a) => a.snapshots.map((s) => s.date.toISOString().slice(0, 7)));
  if (!allDates.length) return { months: [], assets: [] };
  const first = allDates.sort()[0];
  const now = new Date().toISOString().slice(0, 7);
  const months = monthsBetween(first, now);
  const points: MonthPoint[] = months.map((month) => {
    const p: MonthPoint = { month, total: 0, byAsset: {}, byMember: {}, byType: {} };
    for (const a of assets) {
      let v: number | undefined;
      for (const s of a.snapshots) {
        if (s.date.toISOString().slice(0, 7) <= month) v = s.value;
        else break;
      }
      if (v === undefined) continue;
      const share = opts.memberId ? (a.ownerships.find((o) => o.memberId === opts.memberId)?.percent ?? 0) / 100 : 1;
      const val = v * share;
      p.byAsset[a.id] = val;
      p.byType[a.type] = (p.byType[a.type] ?? 0) + val;
      for (const o of a.ownerships) p.byMember[o.memberId] = (p.byMember[o.memberId] ?? 0) + (v * o.percent) / 100 * (opts.memberId ? (o.memberId === opts.memberId ? 1 : 0) : 1);
      p.total += val;
    }
    return p;
  });
  return { months: points, assets: assets.map((a) => ({ id: a.id, name: a.name, type: a.type })) };
}

export type MonthExpense = {
  month: string;
  income: number;
  expense: number;
  investment: number;
  byCategory: Record<string, number>;
  uncategorizedIn: number;
  savings: number;
  savingsRate: number | null;
};

/** Monthly income / expense / savings from categorized transactions. */
export async function getExpenseSeries(opts: { assetId?: string; assetIds?: string[]; months?: number } = {}) {
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCMonth(since.getUTCMonth() - ((opts.months ?? 24) - 1));
  since.setUTCHours(0, 0, 0, 0);
  const txs = await prisma.transaction.findMany({
    where: { date: { gte: since }, status: "COMPLETED", ...(opts.assetId ? { assetId: opts.assetId } : opts.assetIds ? { assetId: { in: opts.assetIds } } : {}), asset: { active: true } },
    select: { date: true, amount: true, categoryId: true, category: { select: { name: true, kind: true, color: true } } },
  });
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const map = new Map<string, MonthExpense>();
  const ensure = (month: string) => {
    let m = map.get(month);
    if (!m) {
      m = { month, income: 0, expense: 0, investment: 0, byCategory: {}, uncategorizedIn: 0, savings: 0, savingsRate: null };
      map.set(month, m);
    }
    return m;
  };
  const totalsByCategory = new Map<string, number>();
  for (const t of txs) {
    const month = t.date.toISOString().slice(0, 7);
    const m = ensure(month);
    const kind = t.category?.kind ?? (t.amount < 0 ? "EXPENSE" : "UNCATEGORIZED_IN");
    const catName = t.category?.name ?? "Sem categoria";
    if (kind === "EXPENSE") {
      m.expense += -t.amount;
      m.byCategory[catName] = (m.byCategory[catName] ?? 0) + -t.amount;
      totalsByCategory.set(catName, (totalsByCategory.get(catName) ?? 0) + -t.amount);
    } else if (kind === "INCOME") m.income += t.amount;
    else if (kind === "INVESTMENT") m.investment += -t.amount;
    else if (kind === "UNCATEGORIZED_IN") m.uncategorizedIn += t.amount;
  }
  const months = [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  for (const m of months) {
    m.savings = m.income - m.expense;
    m.savingsRate = m.income > 0 ? m.savings / m.income : null;
  }
  const catList = [...totalsByCategory.entries()]
    .map(([name, value]) => ({ name, value, color: categories.find((c) => c.name === name)?.color ?? "#52514e" }))
    .sort((a, b) => b.value - a.value);
  return { months, categories: catList };
}
