"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { assertRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { canSeeAsset, getScope } from "@/lib/scope";
import { getLiveValuations, resolveSymbol } from "@/lib/quotes";
import { logActivity } from "@/lib/activity";

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
