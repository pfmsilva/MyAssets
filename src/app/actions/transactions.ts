"use server";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { canSeeAsset, getScope } from "@/lib/scope";
import { logActivity } from "@/lib/activity";
import { applyRules, normalize } from "@/lib/categorize";

async function assertTransactionVisible(user: { id: string; role: Role }, id: string) {
  const t = await prisma.transaction.findUniqueOrThrow({ where: { id }, select: { assetId: true } });
  if (!canSeeAsset(await getScope(user), t.assetId)) throw new Error("Sem permissão para este movimento.");
}

export async function setTransactionCategory(id: string, categoryId: string | null) {
  const user = await assertRole("EDITOR");
  await assertTransactionVisible(user, id);
  const t = await prisma.transaction.update({ where: { id }, data: { categoryId: categoryId || null }, include: { category: { select: { name: true } } } });
  await logActivity(user, "transaction.category", { entity: "transaction", entityId: id, details: { description: t.description, amount: t.amount, category: t.category?.name ?? null } });
  revalidatePath("/", "layout");
}

export async function setTransactionNote(id: string, note: string) {
  const user = await assertRole("EDITOR");
  await assertTransactionVisible(user, id);
  await prisma.transaction.update({ where: { id }, data: { note: note.trim() || null } });
  await logActivity(user, "transaction.note", { entity: "transaction", entityId: id });
  revalidatePath("/", "layout");
}

/** Creates a rule from a transaction description and applies it to every matching transaction. */
export async function createRuleAndApply(pattern: string, categoryId: string) {
  const user = await assertRole("EDITOR");
  const p = pattern.trim();
  if (!p || !categoryId) throw new Error("Padrão e categoria obrigatórios.");
  await prisma.categoryRule.create({ data: { pattern: p, categoryId, priority: 5 } });
  const txs = await prisma.transaction.findMany({ select: { id: true, description: true } });
  const ids = txs.filter((t) => normalize(t.description).includes(normalize(p))).map((t) => t.id);
  for (let i = 0; i < ids.length; i += 500) await prisma.transaction.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { categoryId } });
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { name: true } });
  await logActivity(user, "rule.create", { entity: "category", entityId: categoryId, details: { pattern: p, category: cat?.name, applied: ids.length } });
  revalidatePath("/", "layout");
  return ids.length;
}

export async function reapplyRules(force = false) {
  const user = await assertRole("EDITOR");
  const n = await applyRules({ force });
  await logActivity(user, "rules.apply", { details: { force, updated: n } });
  revalidatePath("/", "layout");
  return n;
}
