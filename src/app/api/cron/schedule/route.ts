import { EXTERNAL, runScheduledSummaries } from "@/lib/summary-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Wake-up for the personal summary times, to be called every 5–15 minutes by an external
 * scheduler (e.g. cron-job.org) or an hourly Vercel Cron. Authorization: Bearer CRON_SECRET
 * (or ?key=CRON_SECRET for schedulers that cannot set headers).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const key = new URL(req.url).searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runScheduledSummaries(EXTERNAL));
}

export const POST = GET;
