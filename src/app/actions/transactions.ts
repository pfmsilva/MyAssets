"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { applyRules, normalize } from "@/lib/categorize";

export async function setTransactionCategory(id: string, categoryId: string | null) {
  await assertRole("EDITOR");
  await prisma.transaction.update({ where: { id }, data: { categoryId: categoryId || null } });
  revalidatePath("/", "layout");
}

export async function setTransactionNote(id: string, note: string) {
  await assertRole("EDITOR");
  await prisma.transaction.update({ where: { id }, data: { note: note.trim() || null } });
  revalidatePath("/", "layout");
}

/** Creates a rule from a transaction description and applies it to every matching transaction. */
export async function createRuleAndApply(pattern: string, categoryId: string) {
  await assertRole("EDITOR");
  const p = pattern.trim();
  if (!p || !categoryId) throw new Error("Padrão e categoria obrigatórios.");
  await prisma.categoryRule.create({ data: { pattern: p, categoryId, priority: 5 } });
  const txs = await prisma.transaction.findMany({ select: { id: true, description: true } });
  const ids = txs.filter((t) => normalize(t.description).includes(normalize(p))).map((t) => t.id);
  for (let i = 0; i < ids.length; i += 500) await prisma.transaction.updateMany({ where: { id: { in: ids.slice(i, i + 500) } }, data: { categoryId } });
  revalidatePath("/", "layout");
  return ids.length;
}

export async function reapplyRules(force = false) {
  await assertRole("EDITOR");
  const n = await applyRules({ force });
  revalidatePath("/", "layout");
  return n;
}
