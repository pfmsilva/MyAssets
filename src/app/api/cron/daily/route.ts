import { runDailyJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { runScheduledSummaries } from "@/lib/summary-schedule";
import { CRON_DAILY_KEY, markCronRun, runHealthCheck } from "@/lib/health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  // personal summary times that are due now, first, so the longer work after it cannot use up the time limit (the external wake-up covers the rest of the day)
  const scheduled = await runScheduledSummaries("tarefa diária").catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // a task that breaks half-way still leaves a report, so the check below can tell about it
  const report = await runDailyJobs().catch((e) => ({ ranAt: new Date().toISOString(), steps: [{ name: "Tarefa diária", result: `erro: ${e instanceof Error ? e.message : String(e)}` }] }));
  await prisma.setting.upsert({ where: { key: "lastJobReport" }, create: { key: "lastJobReport", value: JSON.stringify(report) }, update: { value: JSON.stringify(report) } });
  await markCronRun(CRON_DAILY_KEY);
  // each task also checks the other one (and the quotes and the bot), so a task that stops is noticed
  const health = await runHealthCheck({ probe: true, source: "tarefa diária" }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  return Response.json({ ...report, scheduled, health });
}
