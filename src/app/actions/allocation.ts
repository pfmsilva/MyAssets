"use server";
import { revalidatePath } from "next/cache";
import { AssetClass } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { saveSettings } from "@/lib/settings";

const CLASSES = ["EQUITY", "BOND", "GOLD", "CRYPTO", "CASH", "REAL_ESTATE", "MIXED", "OTHER"] as const;

/** Stores every target in one go (percentages, 0 removes the class). */
export async function saveTargets(targets: Record<string, number>, bandPp: number) {
  const me = await assertRole("EDITOR");
  const parsed = z.record(z.enum(CLASSES), z.number().min(0).max(100)).parse(targets);
  const total = Object.values(parsed).reduce((s, v) => s + v, 0);
  if (total > 0 && Math.abs(total - 100) > 0.5) throw new Error(`A soma dos alvos tem de ser 100 % (atual: ${total.toFixed(1)} %).`);
  for (const cls of CLASSES) {
    const percent = parsed[cls] ?? 0;
    if (percent > 0) await prisma.allocationTarget.upsert({ where: { assetClass: cls as AssetClass }, create: { assetClass: cls as AssetClass, percent }, update: { percent } });
    else await prisma.allocationTarget.deleteMany({ where: { assetClass: cls as AssetClass } });
  }
  await saveSettings({ allocationBandPp: Number.isFinite(bandPp) && bandPp >= 0 ? bandPp : 5 });
  await logActivity(me, "allocation.target", { details: { targets: parsed, bandPp } });
  revalidatePath("/", "layout");
  return { total };
}

/** Classifies one instrument (a position) or, failing that, a whole asset. */
export async function setClass(target: { instrumentId?: string | null; assetId?: string | null }, assetClass: AssetClass | null) {
  const me = await assertRole("EDITOR");
  if (target.instrumentId) {
    const inst = await prisma.instrument.update({ where: { id: target.instrumentId }, data: { assetClass } });
    await logActivity(me, "allocation.classify", { entity: "instrument", entityId: inst.id, details: { name: inst.name, assetClass } });
  } else if (target.assetId) {
    const a = await prisma.asset.update({ where: { id: target.assetId }, data: { assetClass } });
    await logActivity(me, "allocation.classify", { entity: "asset", entityId: a.id, details: { name: a.name, assetClass } });
  } else throw new Error("Nada para classificar.");
  revalidatePath("/", "layout");
}
