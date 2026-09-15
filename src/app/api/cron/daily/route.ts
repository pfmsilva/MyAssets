import { runDailyJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron (vercel.json) with Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const report = await runDailyJobs();
  await prisma.setting.upsert({ where: { key: "lastJobReport" }, create: { key: "lastJobReport", value: JSON.stringify(report) }, update: { value: JSON.stringify(report) } });
  return Response.json(report);
}
