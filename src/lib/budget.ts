import { prisma } from "./prisma";

export type BudgetRow = {
  categoryId: string;
  name: string;
  color: string;
  limit: number | null;
  spent: number; // selected month
  prev: number; // previous month
  lastYear: number; // same month, previous year
  pct: number | null;
  status: "ok" | "warn" | "over" | "none";
};

const ym = (d: Date) => d.toISOString().slice(0, 7);

/** Spending per expense category for a month, the previous month and the same month a year earlier (current accounts only). */
export async function getBudgetOverview(month: string, assetIds?: string[]): Promise<{ month: string; rows: BudgetRow[]; totals: { limit: number; spentBudgeted: number; spent: number; prev: number; lastYear: number }; daysElapsedPct: number }> {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const prevStart = new Date(Date.UTC(y, m - 2, 1));
  const lyStart = new Date(Date.UTC(y - 1, m - 1, 1));
  const lyEnd = new Date(Date.UTC(y - 1, m, 1));
  const [categories, budgets, txs] = await Promise.all([
    prisma.category.findMany({ where: { kind: "EXPENSE" }, orderBy: { sortOrder: "asc" } }),
    prisma.budget.findMany(),
    prisma.transaction.findMany({
      where: { status: "COMPLETED", asset: { active: true, type: "CURRENT_ACCOUNT", ...(assetIds ? { id: { in: assetIds } } : {}) }, OR: [{ date: { gte: prevStart, lt: end } }, { date: { gte: lyStart, lt: lyEnd } }] },
      select: { date: true, amount: true, categoryId: true, category: { select: { kind: true } } },
    }),
  ]);
  const sums = new Map<string, { cur: number; prev: number; ly: number }>();
  const add = (key: string, bucket: "cur" | "prev" | "ly", v: number) => {
    const s = sums.get(key) ?? { cur: 0, prev: 0, ly: 0 };
    s[bucket] += v;
    sums.set(key, s);
  };
  for (const t of txs) {
    const kind = t.category?.kind ?? (t.amount < 0 ? "EXPENSE" : null);
    if (kind !== "EXPENSE") continue;
    const key = t.categoryId ?? "__none";
    const k = ym(t.date);
    const bucket = k === month ? "cur" : k === ym(prevStart) ? "prev" : k === ym(lyStart) ? "ly" : null;
    if (bucket) add(key, bucket, -t.amount);
  }
  const rows: BudgetRow[] = categories.map((c) => {
    const s = sums.get(c.id) ?? { cur: 0, prev: 0, ly: 0 };
    const limit = budgets.find((b) => b.categoryId === c.id)?.monthlyLimit ?? null;
    const pct = limit ? s.cur / limit : null;
    return { categoryId: c.id, name: c.name, color: c.color, limit, spent: s.cur, prev: s.prev, lastYear: s.ly, pct, status: pct === null ? "none" : pct > 1 ? "over" : pct >= 0.8 ? "warn" : "ok" };
  });
  const none = sums.get("__none");
  if (none && (none.cur || none.prev || none.ly)) rows.push({ categoryId: "__none", name: "Sem categoria", color: "#8a8985", limit: null, spent: none.cur, prev: none.prev, lastYear: none.ly, pct: null, status: "none" });
  rows.sort((a, b) => (a.limit ? 0 : 1) - (b.limit ? 0 : 1) || b.spent - a.spent);
  const totals = rows.reduce((t, r) => ({ limit: t.limit + (r.limit ?? 0), spentBudgeted: t.spentBudgeted + (r.limit ? r.spent : 0), spent: t.spent + r.spent, prev: t.prev + r.prev, lastYear: t.lastYear + r.lastYear }), { limit: 0, spentBudgeted: 0, spent: 0, prev: 0, lastYear: 0 });
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysElapsedPct = ym(now) === month ? Math.min(1, now.getUTCDate() / daysInMonth) : ym(now) > month ? 1 : 0;
  return { month, rows, totals, daysElapsedPct };
}
