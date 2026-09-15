"use server";
import { revalidatePath } from "next/cache";
import { AssetType, CategoryKind, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { runSeed } from "@/lib/seed";

export type ActionState = { ok?: boolean; error?: string };

const wrap = async (fn: () => Promise<void>): Promise<ActionState> => {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro." };
  }
};

// ---- users ----
export async function upsertUser(_p: ActionState, fd: FormData) {
  return wrap(async () => {
    await assertRole("ADMIN");
    const data = z
      .object({ id: z.string().optional(), email: z.string().email().transform((s) => s.toLowerCase()), name: z.string().trim().optional(), role: z.nativeEnum(Role), memberIds: z.array(z.string().min(1)).default([]) })
      .parse({ id: fd.get("id") || undefined, email: fd.get("email"), name: fd.get("name") || undefined, role: fd.get("role"), memberIds: fd.getAll("memberIds").map(String).filter(Boolean) });
    const visibleMembers = { set: data.memberIds.map((id) => ({ id })) };
    if (data.id) await prisma.user.update({ where: { id: data.id }, data: { name: data.name, role: data.role, visibleMembers } });
    else await prisma.user.create({ data: { email: data.email, name: data.name, role: data.role, visibleMembers: { connect: data.memberIds.map((id) => ({ id })) } } });
  });
}

export async function deleteUser(id: string) {
  const me = await assertRole("ADMIN");
  if (me.id === id) throw new Error("Não pode apagar o seu próprio utilizador.");
  await prisma.user.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// ---- members ----
export async function upsertMember(_p: ActionState, fd: FormData) {
  return wrap(async () => {
    await assertRole("ADMIN");
    const data = z.object({ id: z.string().optional(), name: z.string().trim().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), sortOrder: z.coerce.number().default(0) }).parse({ id: fd.get("id") || undefined, name: fd.get("name"), color: fd.get("color"), sortOrder: fd.get("sortOrder") || 0 });
    if (data.id) await prisma.member.update({ where: { id: data.id }, data });
    else await prisma.member.create({ data });
  });
}

export async function deleteMember(id: string) {
  await assertRole("ADMIN");
  await prisma.member.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// ---- assets ----
export async function upsertAsset(_p: ActionState, fd: FormData) {
  return wrap(async () => {
    await assertRole("ADMIN");
    const data = z
      .object({ id: z.string().optional(), name: z.string().trim().min(1), institution: z.string().trim().min(1), type: z.nativeEnum(AssetType), importer: z.string().optional(), active: z.boolean(), sortOrder: z.coerce.number().default(0) })
      .parse({ id: fd.get("id") || undefined, name: fd.get("name"), institution: fd.get("institution"), type: fd.get("type"), importer: fd.get("importer") || undefined, active: fd.get("active") === "on", sortOrder: fd.get("sortOrder") || 0 });
    const owners = fd
      .getAll("ownerMemberId")
      .map((m, i) => ({ memberId: String(m), percent: Number(fd.getAll("ownerPercent")[i] ?? 0) }))
      .filter((o) => o.memberId && o.percent > 0);
    const total = owners.reduce((s, o) => s + o.percent, 0);
    if (owners.length && Math.abs(total - 100) > 0.01) throw new Error(`A soma das percentagens deve ser 100 % (atual: ${total}).`);
    const base = { name: data.name, institution: data.institution, type: data.type, importer: data.importer ?? null, active: data.active, sortOrder: data.sortOrder };
    if (data.id) {
      await prisma.asset.update({ where: { id: data.id }, data: { ...base, ownerships: { deleteMany: {}, create: owners } } });
    } else await prisma.asset.create({ data: { ...base, ownerships: { create: owners } } });
  });
}

export async function deleteAsset(id: string) {
  await assertRole("ADMIN");
  await prisma.asset.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// ---- categories & rules ----
export async function upsertCategory(_p: ActionState, fd: FormData) {
  return wrap(async () => {
    await assertRole("EDITOR");
    const data = z.object({ id: z.string().optional(), name: z.string().trim().min(1), kind: z.nativeEnum(CategoryKind), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).parse({ id: fd.get("id") || undefined, name: fd.get("name"), kind: fd.get("kind"), color: fd.get("color") });
    if (data.id) await prisma.category.update({ where: { id: data.id }, data });
    else await prisma.category.create({ data });
  });
}

export async function deleteCategory(id: string) {
  await assertRole("EDITOR");
  await prisma.category.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function addRule(_p: ActionState, fd: FormData) {
  return wrap(async () => {
    await assertRole("EDITOR");
    const data = z.object({ pattern: z.string().trim().min(1), categoryId: z.string().min(1), priority: z.coerce.number().default(0) }).parse({ pattern: fd.get("pattern"), categoryId: fd.get("categoryId"), priority: fd.get("priority") || 0 });
    await prisma.categoryRule.create({ data });
  });
}

export async function deleteRule(id: string) {
  await assertRole("EDITOR");
  await prisma.categoryRule.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// ---- initial data ----
export async function seedInitialData(): Promise<ActionState & { created?: Awaited<ReturnType<typeof runSeed>> }> {
  try {
    await assertRole("ADMIN");
    const created = await runSeed(prisma);
    revalidatePath("/", "layout");
    return { ok: true, created };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro." };
  }
}
