"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { canSeeAsset, getScope } from "@/lib/scope";

export async function setBudget(categoryId: string, monthlyLimit: number | null) {
  const me = await assertRole("EDITOR");
  const cat = await prisma.category.findUniqueOrThrow({ where: { id: categoryId }, select: { name: true } });
  if (monthlyLimit === null || !Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
    await prisma.budget.deleteMany({ where: { categoryId } });
  } else {
    await prisma.budget.upsert({ where: { categoryId }, create: { categoryId, monthlyLimit }, update: { monthlyLimit } });
  }
  await logActivity(me, "budget.set", { entity: "category", entityId: categoryId, details: { category: cat.name, monthlyLimit } });
  revalidatePath("/", "layout");
}

/** Manual external cash flow of an investment asset (deposit > 0, withdrawal < 0), for return calculations. */
export async function addManualFlow(assetId: string, date: string, amount: number, note: string) {
  const me = await assertRole("EDITOR");
  if (!canSeeAsset(await getScope(me), assetId)) throw new Error("Sem permissão para este ativo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || amount === 0) throw new Error("Data ou montante inválido.");
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId }, select: { name: true } });
  const description = `Fluxo manual · ${amount > 0 ? "entrada" : "saída"} de capital${note.trim() ? ` · ${note.trim()}` : ""}`;
  const hash = `manual|${date}|${amount}|${Date.now()}`;
  await prisma.transaction.create({ data: { assetId, date: new Date(date), valueDate: new Date(date), description, amount, kind: "Fluxo manual", status: "COMPLETED", hash } });
  await logActivity(me, "flow.create", { entity: "asset", entityId: assetId, details: { asset: asset.name, date, amount, note } });
  revalidatePath("/", "layout");
}

export async function deleteManualFlow(transactionId: string) {
  const me = await assertRole("EDITOR");
  const t = await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId }, select: { assetId: true, kind: true, amount: true, date: true } });
  if (t.kind !== "Fluxo manual") throw new Error("Só fluxos manuais podem ser apagados aqui.");
  if (!canSeeAsset(await getScope(me), t.assetId)) throw new Error("Sem permissão para este ativo.");
  await prisma.transaction.delete({ where: { id: transactionId } });
  await logActivity(me, "flow.delete", { entity: "asset", entityId: t.assetId, details: { amount: t.amount, date: t.date.toISOString().slice(0, 10) } });
  revalidatePath("/", "layout");
}
