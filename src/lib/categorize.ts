import { prisma } from "./prisma";

export type Rule = { id: string; pattern: string; priority: number; categoryId: string };

export function ruleMatches(pattern: string, description: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  if (p.length > 2 && p.startsWith("/") && p.lastIndexOf("/") > 0) {
    const body = p.slice(1, p.lastIndexOf("/"));
    const flags = p.slice(p.lastIndexOf("/") + 1) || "i";
    try {
      return new RegExp(body, flags).test(description);
    } catch {
      return false;
    }
  }
  return normalize(description).includes(normalize(p));
}

export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function matchCategory(rules: Rule[], description: string): string | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority || b.pattern.length - a.pattern.length);
  for (const r of sorted) if (ruleMatches(r.pattern, description)) return r.categoryId;
  return null;
}

export async function loadRules(): Promise<Rule[]> {
  return prisma.categoryRule.findMany({ select: { id: true, pattern: true, priority: true, categoryId: true } });
}

/** Applies rules to transactions without category (or all, when force). Returns the number updated. */
export async function applyRules(opts: { assetId?: string; force?: boolean } = {}) {
  const rules = await loadRules();
  const txs = await prisma.transaction.findMany({
    where: { ...(opts.assetId ? { assetId: opts.assetId } : {}), ...(opts.force ? {} : { categoryId: null }) },
    select: { id: true, description: true, categoryId: true },
  });
  let n = 0;
  const byCat = new Map<string, string[]>();
  for (const t of txs) {
    const c = matchCategory(rules, t.description);
    if (c && c !== t.categoryId) {
      byCat.set(c, [...(byCat.get(c) ?? []), t.id]);
      n++;
    }
  }
  for (const [categoryId, ids] of byCat) {
    for (let i = 0; i < ids.length; i += 500) {
      await prisma.transaction.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { categoryId } });
    }
  }
  return n;
}
