"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { canSeeAsset, getScope } from "@/lib/scope";
import { logActivity } from "@/lib/activity";
import { lookupIsin, rebuildPortfolioHistory, syncPortfolioSnapshot } from "@/lib/stock-portfolio";

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

async function assertPortfolio(assetId: string) {
  const user = await assertRole("EDITOR");
  if (!canSeeAsset(await getScope(user), assetId)) throw new Error("Sem permissão para este ativo.");
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { id: true, name: true, type: true } });
  if (asset.type !== "STOCK_PORTFOLIO") throw new Error("Este ativo não é uma carteira de ações.");
  return { user, asset };
}

export type HoldingState = { ok?: boolean; error?: string; message?: string };

export async function addHolding(_p: HoldingState, fd: FormData): Promise<HoldingState> {
  try {
    const assetId = String(fd.get("assetId") ?? "");
    const { user, asset } = await assertPortfolio(assetId);
    const data = z
      .object({ isin: z.string().trim().toUpperCase(), name: z.string().trim().min(1, "Indique a descrição."), symbol: z.string().trim().toUpperCase().optional(), note: z.string().trim().optional() })
      .parse({ isin: fd.get("isin"), name: fd.get("name"), symbol: fd.get("symbol") || undefined, note: fd.get("note") || undefined });
    if (!ISIN_RE.test(data.isin)) return { error: "ISIN inválido (12 caracteres, ex.: PTGAL0AM0009)." };
    const exists = await prisma.holding.findUnique({ where: { assetId_isin: { assetId, isin: data.isin } } });
    if (exists) return { error: `${data.isin} já existe nesta carteira.` };
    const count = await prisma.holding.count({ where: { assetId } });
    const h = await prisma.holding.create({ data: { assetId, isin: data.isin, name: data.name, symbol: data.symbol || null, note: data.note || null, sortOrder: count } });
    await logActivity(user, "holding.create", { entity: "asset", entityId: assetId, details: { asset: asset.name, isin: data.isin, name: data.name } });
    revalidatePath(`/ativos/${assetId}`);
    return { ok: true, message: `${h.name} adicionada. Registe agora as compras.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao adicionar a ação." };
  }
}

export async function updateHolding(id: string, data: { name?: string; symbol?: string | null; note?: string | null }) {
  const h = await prisma.holding.findUniqueOrThrow({ where: { id }, select: { assetId: true, isin: true } });
  const { user } = await assertPortfolio(h.assetId);
  await prisma.holding.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.symbol !== undefined ? { symbol: data.symbol ? data.symbol.trim().toUpperCase() : null } : {}),
      ...(data.note !== undefined ? { note: data.note?.trim() || null } : {}),
    },
  });
  await logActivity(user, "holding.update", { entity: "asset", entityId: h.assetId, details: { isin: h.isin, ...data } });
  revalidatePath(`/ativos/${h.assetId}`);
}

export async function deleteHolding(id: string) {
  const h = await prisma.holding.findUniqueOrThrow({ where: { id }, select: { assetId: true, isin: true, name: true, _count: { select: { trades: true } } } });
  const { user } = await assertPortfolio(h.assetId);
  await prisma.holding.delete({ where: { id } });
  await logActivity(user, "holding.delete", { entity: "asset", entityId: h.assetId, details: { isin: h.isin, name: h.name, trades: h._count.trades } });
  await syncPortfolioSnapshot(h.assetId).catch(() => null);
  revalidatePath("/", "layout");
}

export async function addTrade(holdingId: string, input: { date: string; quantity: number; amount: number; fee?: number; note?: string; kind: "BUY" | "SELL" }) {
  const h = await prisma.holding.findUniqueOrThrow({ where: { id: holdingId }, select: { assetId: true, name: true, isin: true } });
  const { user } = await assertPortfolio(h.assetId);
  const data = z
    .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."), quantity: z.number().positive("A quantidade tem de ser maior que zero."), amount: z.number().positive("O valor tem de ser maior que zero."), fee: z.number().min(0).optional(), note: z.string().trim().optional() })
    .parse({ date: input.date, quantity: Number(input.quantity), amount: Number(input.amount), fee: input.fee ? Number(input.fee) : undefined, note: input.note });
  const signed = input.kind === "SELL" ? -data.quantity : data.quantity;
  await prisma.trade.create({ data: { holdingId, date: new Date(data.date), quantity: signed, amount: data.amount, fee: data.fee ?? 0, note: data.note || null } });
  await logActivity(user, "trade.create", { entity: "asset", entityId: h.assetId, details: { holding: h.name, isin: h.isin, date: data.date, quantity: signed, amount: data.amount } });
  await syncPortfolioSnapshot(h.assetId).catch(() => null);
  revalidatePath("/", "layout");
}

export async function deleteTrade(id: string) {
  const t = await prisma.trade.findUniqueOrThrow({ where: { id }, include: { holding: { select: { assetId: true, name: true } } } });
  const { user } = await assertPortfolio(t.holding.assetId);
  await prisma.trade.delete({ where: { id } });
  await logActivity(user, "trade.delete", { entity: "asset", entityId: t.holding.assetId, details: { holding: t.holding.name, date: t.date.toISOString().slice(0, 10), quantity: t.quantity, amount: t.amount } });
  await syncPortfolioSnapshot(t.holding.assetId).catch(() => null);
  revalidatePath("/", "layout");
}

export async function refreshPortfolio(assetId: string) {
  const { user } = await assertPortfolio(assetId);
  const r = await syncPortfolioSnapshot(assetId, { force: true });
  await logActivity(user, "portfolio.refresh", { entity: "asset", entityId: assetId, details: { value: r.totals.value, quoted: r.totals.quoted, quotable: r.totals.quotable } });
  revalidatePath("/", "layout");
  return { value: r.totals.value, quoted: r.totals.quoted, quotable: r.totals.quotable, error: r.error, skipped: r.skipped };
}

export async function rebuildHistory(assetId: string) {
  const { user } = await assertPortfolio(assetId);
  const r = await rebuildPortfolioHistory(assetId);
  await logActivity(user, "portfolio.history", { entity: "asset", entityId: assetId, details: r });
  revalidatePath("/", "layout");
  return r;
}

export async function lookupIsinAction(isin: string, name: string) {
  await assertRole("EDITOR");
  if (!ISIN_RE.test(isin.trim().toUpperCase())) return { error: "ISIN inválido." };
  return lookupIsin(isin, name || isin);
}
