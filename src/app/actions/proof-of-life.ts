"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { confirmFromApp, confirmProofOfLife, ConfirmResult, resolveRelease, runProofOfLife, Step } from "@/lib/proof-of-life";
import { prisma } from "@/lib/prisma";

/** Public: called from the button on the confirmation page (a plain link could be opened by e-mail scanners). */
export async function confirmProofOfLifeAction(token: string): Promise<ConfirmResult> {
  const r = await confirmProofOfLife(token);
  if (r.status === "confirmed") {
    const check = await prisma.proofOfLifeCheck.findUnique({ where: { token }, select: { recipients: true } });
    await logActivity({ email: "prova-de-vida", name: "Prova de vida" }, "pol.confirm", { details: { recipients: check?.recipients ?? "", at: r.at?.toISOString() } });
  }
  revalidatePath("/admin/definicoes");
  return r;
}

export async function confirmProofOfLifeAsAdmin() {
  const me = await assertRole("ADMIN");
  const how = await confirmFromApp(me.name ?? me.email);
  await logActivity(me, "pol.confirm", { details: { source: "aplicação", how } });
  revalidatePath("/", "layout");
  return how;
}

export async function runProofOfLifeNow(dryRun: boolean): Promise<Step[]> {
  const me = await assertRole("ADMIN");
  const steps = await runProofOfLife({ dryRun });
  await logActivity(me, "pol.run", { details: { dryRun, steps } });
  revalidatePath("/", "layout");
  return steps;
}

export async function resolveReleaseAction() {
  const me = await assertRole("ADMIN");
  const ok = await resolveRelease(me.name ?? me.email);
  await logActivity(me, "pol.reset", { details: { ok } });
  revalidatePath("/", "layout");
  return ok;
}
