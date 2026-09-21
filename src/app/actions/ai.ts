"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { aiConfigured, runAnalysis } from "@/lib/ai-analysis";
import { prisma } from "@/lib/prisma";

export type AiRunResult = { ok: true; id: string; costUsd: number } | { ok: false; error: string };

export async function runAnalysisAction(): Promise<AiRunResult> {
  try {
    const me = await assertRole("ADMIN");
    const s = await getSettings();
    if (!s.aiEnabled) throw new Error("A análise de IA está desativada nas definições.");
    if (!aiConfigured()) throw new Error("Falta a variável ANTHROPIC_API_KEY no ambiente.");
    const r = await runAnalysis({ by: me.name ?? me.email, anonymize: s.aiAnonymize });
    await logActivity(me, "ai.analysis", { entity: "aiAnalysis", entityId: r.id, details: { model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd, anonimizado: s.aiAnonymize } });
    revalidatePath("/analise");
    return { ok: true, id: r.id, costUsd: r.costUsd };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro." };
  }
}

export async function deleteAnalysis(id: string) {
  const me = await assertRole("ADMIN");
  await prisma.aiAnalysis.delete({ where: { id } });
  await logActivity(me, "ai.delete", { entity: "aiAnalysis", entityId: id });
  revalidatePath("/analise");
}
