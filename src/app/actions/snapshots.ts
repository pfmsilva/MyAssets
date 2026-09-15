"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { canSeeAsset, getScope } from "@/lib/scope";
import { logActivity } from "@/lib/activity";

const positionSchema = z.object({
  name: z.string().trim().min(1),
  isin: z.string().trim().optional(),
  quantity: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
  currency: z.string().trim().default("EUR"),
  valueEur: z.coerce.number(),
});

const schema = z.object({
  assetId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.coerce.number(),
  note: z.string().trim().optional(),
  positions: z.array(positionSchema).optional(),
});

export type ActionState = { ok?: boolean; error?: string; message?: string };

export async function createSnapshot(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertRole("EDITOR");
    let positions: unknown = undefined;
    const raw = fd.get("positions");
    if (raw && String(raw).trim()) positions = JSON.parse(String(raw));
    const data = schema.parse({ assetId: fd.get("assetId"), date: fd.get("date"), value: fd.get("value"), note: fd.get("note") || undefined, positions });
    if (!canSeeAsset(await getScope(user), data.assetId)) throw new Error("Sem permissão para este ativo.");
    const value = data.positions?.length ? data.positions.reduce((s, p) => s + p.valueEur, 0) : data.value;
    const snap = await prisma.snapshot.upsert({
      where: { assetId_date: { assetId: data.assetId, date: new Date(data.date) } },
      create: { assetId: data.assetId, date: new Date(data.date), value, source: "MANUAL", note: data.note },
      update: { value, source: "MANUAL", note: data.note, importBatchId: null },
    });
    if (data.positions) {
      await prisma.position.deleteMany({ where: { snapshotId: snap.id } });
      if (data.positions.length)
        await prisma.position.createMany({
          data: data.positions.map((p) => ({ snapshotId: snap.id, name: p.name, isin: p.isin || null, quantity: p.quantity ?? null, price: p.price ?? null, currency: p.currency || "EUR", valueEur: p.valueEur, value: p.currency && p.currency !== "EUR" ? null : p.valueEur })),
        });
    }
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId }, select: { name: true } });
    await logActivity(user, "snapshot.create", { entity: "asset", entityId: data.assetId, details: { asset: asset?.name, date: data.date, value, positions: data.positions?.length ?? 0 } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Valor registado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao registar." };
  }
}

export async function deleteSnapshot(id: string) {
  const user = await assertRole("EDITOR");
  const snap = await prisma.snapshot.findUniqueOrThrow({ where: { id }, select: { assetId: true, date: true, value: true, asset: { select: { name: true } } } });
  if (!canSeeAsset(await getScope(user), snap.assetId)) throw new Error("Sem permissão para este ativo.");
  await prisma.snapshot.delete({ where: { id } });
  await logActivity(user, "snapshot.delete", { entity: "asset", entityId: snap.assetId, details: { asset: snap.asset.name, date: snap.date.toISOString().slice(0, 10), value: snap.value } });
  revalidatePath("/", "layout");
}
