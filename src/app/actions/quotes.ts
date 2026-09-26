"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { canSeeAsset, getScope } from "@/lib/scope";
import { getLiveValuations, resolveSymbol } from "@/lib/quotes";
import { logActivity } from "@/lib/activity";
import { saveDailySnapshots, syncStockPortfolios } from "@/lib/jobs";
import { assetScopeWhere } from "@/lib/scope";

/** Forces a quote refresh for one asset (any signed-in user who can see it). */
export async function refreshAssetQuotes(assetId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Sem sessão.");
  if (!canSeeAsset(await getScope(session.user), assetId)) throw new Error("Sem permissão.");
  const v = await getLiveValuations([assetId], { force: true });
  revalidatePath(`/ativos/${assetId}`);
  revalidatePath("/");
  const r = v.get(assetId);
  return { error: r?.error ?? null, quoted: r?.quoted ?? 0, quotable: r?.quotable ?? 0 };
}

export type RefreshAllResult = { assets: number; quoted: number; quotable: number; snapshots: number; portfolios: number; errors: string[] };

/**
 * One button for everything: refreshes the quotes, recomputes the manual stock portfolios
 * and records today's value of the portfolios that are fully quoted.
 */
export async function refreshAll(assetId?: string): Promise<RefreshAllResult> {
  const me = await assertRole("EDITOR");
  const scope = await getScope(me);
  if (assetId && !canSeeAsset(scope, assetId)) throw new Error("Sem permissão para este ativo.");
  const assets = await prisma.asset.findMany({
    where: { active: true, type: { in: ["BROKERAGE", "STOCK_PORTFOLIO", "CRYPTO"] }, ...(assetId ? { id: assetId } : assetScopeWhere(scope)) },
    select: { id: true, name: true, type: true },
  });
  const ids = assets.map((a) => a.id);
  const errors: string[] = [];
  if (!ids.length) return { assets: 0, quoted: 0, quotable: 0, snapshots: 0, portfolios: 0, errors: ["Sem carteiras para atualizar."] };

  // 1. quotes of the moment (also resolves symbols that are still missing)
  const live = await getLiveValuations(ids, { force: true, resolve: true });
  for (const [id, v] of live) if (v.error) errors.push(`${assets.find((a) => a.id === id)?.name ?? id}: ${v.error.slice(0, 80)}`);

  // 2. manual stock portfolios (their value is computed from the trades)
  const portfolioIds = assets.filter((a) => a.type === "STOCK_PORTFOLIO").map((a) => a.id);
  let portfolios = 0;
  if (portfolioIds.length) {
    const r = await syncStockPortfolios(portfolioIds);
    portfolios = r.synced;
    errors.push(...r.errors);
  }

  // 3. today's value of the remaining portfolios
  const snap = await saveDailySnapshots(ids.filter((id) => !portfolioIds.includes(id)));

  await logActivity(me, "quotes.refresh", { details: { ativos: ids.length, carteiras: portfolios, valores: snap.saved + portfolios, erros: errors.length } });
  revalidatePath("/", "layout");
  return {
    assets: ids.length,
    quoted: [...live.values()].reduce((s, v) => s + v.quoted, 0),
    quotable: [...live.values()].reduce((s, v) => s + v.quotable, 0),
    snapshots: snap.saved + portfolios,
    portfolios,
    errors,
  };
}

export async function setInstrumentSymbol(id: string, symbol: string) {
  const me = await assertRole("ADMIN");
  const s = symbol.trim().toUpperCase();
  const inst = await prisma.instrument.update({ where: { id }, data: { symbol: s || null, manual: !!s, lastError: null, resolvedAt: new Date() } });
  await logActivity(me, "instrument.update", { entity: "instrument", entityId: id, details: { key: inst.key, symbol: s || null } });
  revalidatePath("/", "layout");
}

export async function resolveInstrument(id: string) {
  const me = await assertRole("ADMIN");
  const inst = await prisma.instrument.findUniqueOrThrow({ where: { id } });
  const r = await resolveSymbol(inst.key, inst.name);
  await prisma.instrument.update({ where: { id }, data: "symbol" in r ? { symbol: r.symbol, manual: false, lastError: null, resolvedAt: new Date() } : { lastError: r.error, resolvedAt: new Date() } });
  await logActivity(me, "instrument.resolve", { entity: "instrument", entityId: id, details: { key: inst.key, result: "symbol" in r ? r.symbol : r.error } });
  revalidatePath("/", "layout");
  return "symbol" in r ? { symbol: r.symbol } : { error: r.error };
}

export async function resolveMissingInstruments() {
  const me = await assertRole("ADMIN");
  const missing = await prisma.instrument.findMany({ where: { symbol: null, manual: false } });
  let ok = 0;
  for (const inst of missing) {
    const r = await resolveSymbol(inst.key, inst.name);
    await prisma.instrument.update({ where: { id: inst.id }, data: "symbol" in r ? { symbol: r.symbol, lastError: null, resolvedAt: new Date() } : { lastError: r.error, resolvedAt: new Date() } });
    if ("symbol" in r) ok++;
  }
  await logActivity(me, "instrument.resolve", { details: { attempted: missing.length, resolved: ok } });
  revalidatePath("/", "layout");
  return { attempted: missing.length, resolved: ok };
}
