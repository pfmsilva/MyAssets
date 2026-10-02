import { runDailySummary } from "@/lib/daily-summary";
import { prisma } from "@/lib/prisma";
import { runScheduledSummaries } from "@/lib/summary-schedule";
import { CRON_EVENING_KEY, markCronRun, runHealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** End-of-day e-mail, called by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  // personal summary times that are due now, first, so the longer work after it cannot use up the time limit (the external wake-up covers the rest of the day)
  const scheduled = await runScheduledSummaries("tarefa da noite").catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  const report = await runDailySummary().catch((e) => ({ ranAt: new Date().toISOString(), sent: 0, skipped: [], errors: [`erro: ${e instanceof Error ? e.message : String(e)}`] }));
  await prisma.setting.upsert({ where: { key: "lastSummaryReport" }, create: { key: "lastSummaryReport", value: JSON.stringify(report) }, update: { value: JSON.stringify(report) } });
  await markCronRun(CRON_EVENING_KEY);
  // each task also checks the other one (and the quotes and the bot), so a task that stops is noticed
  const health = await runHealthCheck({ probe: true, source: "tarefa da noite" }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return Response.json({ ...report, scheduled, health });
}
