"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { saveSettings, getSettings, alertRecipients } from "@/lib/settings";
import { emailLayout, sendEmail } from "@/lib/email";
import { purgeActivity, runDailyJobs, JobReport } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";

export type SettingsState = { ok?: boolean; error?: string };

export async function updateSettings(_p: SettingsState, fd: FormData): Promise<SettingsState> {
  try {
    const me = await assertRole("ADMIN");
    const data = z
      .object({
        activityRetentionDays: z.coerce.number().min(0).max(3650),
        alertEmails: z.string().trim(),
        alertStaleDays: z.coerce.number().min(0).max(365),
        alertMovePct: z.coerce.number().min(0).max(100),
        alertBudget: z.boolean(),
        backupWeeklyEmail: z.boolean(),
        dailySnapshot: z.boolean(),
      })
      .parse({
        activityRetentionDays: fd.get("activityRetentionDays") || 0,
        alertEmails: fd.get("alertEmails") ?? "",
        alertStaleDays: fd.get("alertStaleDays") || 0,
        alertMovePct: fd.get("alertMovePct") || 0,
        alertBudget: fd.get("alertBudget") === "on",
        backupWeeklyEmail: fd.get("backupWeeklyEmail") === "on",
        dailySnapshot: fd.get("dailySnapshot") === "on",
      });
    await saveSettings(data);
    await logActivity(me, "settings.update", { details: data });
    revalidatePath("/admin/definicoes");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro." };
  }
}

export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const me = await assertRole("ADMIN");
  const s = await getSettings();
  const to = alertRecipients(s);
  if (!to.length) return { ok: false, message: "Defina primeiro os destinatários." };
  const r = await sendEmail({ to, subject: "Pecúlio · e-mail de teste", html: emailLayout("E-mail de teste", `<p>Os alertas do Pecúlio estão a funcionar. Pedido por ${me.name ?? me.email}.</p>`, process.env.APP_URL ?? "") });
  await logActivity(me, "email.test", { details: { to, ok: r.ok, error: r.error ?? null } });
  return { ok: r.ok, message: r.ok ? `Enviado para ${to.join(", ")}.` : `Falhou: ${r.error}` };
}

export async function runJobsNow(dryRun: boolean): Promise<JobReport> {
  const me = await assertRole("ADMIN");
  const report = await runDailyJobs({ dryRun, force: dryRun });
  if (!dryRun) await prisma.setting.upsert({ where: { key: "lastJobReport" }, create: { key: "lastJobReport", value: JSON.stringify(report) }, update: { value: JSON.stringify(report) } });
  await logActivity(me, "jobs.run", { details: { dryRun, steps: report.steps } });
  revalidatePath("/", "layout");
  return report;
}

export async function purgeActivityNow(): Promise<number> {
  const me = await assertRole("ADMIN");
  const s = await getSettings();
  const n = await purgeActivity(s.activityRetentionDays);
  await logActivity(me, "activity.purge", { details: { deleted: n, retentionDays: s.activityRetentionDays } });
  revalidatePath("/admin/atividade");
  return n;
}
