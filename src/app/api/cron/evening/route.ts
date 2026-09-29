import { runDailySummary } from "@/lib/daily-summary";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** End-of-day e-mail, called by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const report = await runDailySummary();
  await prisma.setting.upsert({ where: { key: "lastSummaryReport" }, create: { key: "lastSummaryReport", value: JSON.stringify(report) }, update: { value: JSON.stringify(report) } });
  return Response.json(report);
}
