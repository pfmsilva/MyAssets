import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildDailySummary, type SummaryContent } from "./daily-summary";
import { emailConfigured, sendEmail } from "./email";
import { sendTelegramPhotos, telegramConfigured } from "./telegram";
import { getSettings } from "./settings";
import { activeSlots, LATE_MIN, lisbonNow, readSlots, toMin, type Slot } from "./summary-slots";
export { activeSlots, readSlots, DEFAULT_SLOTS, SLOT_COUNT, type Slot } from "./summary-slots";

/**
 * Personal summary times: each user picks up to four times of day (Lisbon time), and for each one
 * e-mail and/or Telegram. Whatever wakes the app (the Vercel crons, an external scheduler calling
 * /api/cron/schedule, a visit) sends the times that are due; each time goes out once a day.
 */

/** Claims a key once: two wake-ups at the same moment cannot both send. */
async function claim(key: string) {
  try {
    await prisma.alertSent.create({ data: { key } });
    return true;
  } catch {
    return false;
  }
}

/** Marks today's times that already passed as done, so saving at 14:00 does not send the 13:00 one late. */
export async function skipPassedToday(userId: string, slots: Slot[], now = new Date()) {
  const { date, minutes } = lisbonNow(now);
  for (const [i, s] of slots.entries()) if (s.on && toMin(s.time) <= minutes) await claim(`slot:${userId}:${i}:${s.time}:${date}`);
}

export type ScheduleReport = { at: string; source: string; sent: number; telegram: number; errors: string[]; skipped: string[] };

export async function runScheduledSummaries(source: string, now = new Date()): Promise<ScheduleReport> {
  const report: ScheduleReport = { at: now.toISOString(), source, sent: 0, telegram: 0, errors: [], skipped: [] };
  const { date, minutes, weekend } = lisbonNow(now);
  const s = await getSettings();
  const users = await prisma.user.findMany({
    where: { summarySlots: { not: Prisma.DbNull } },
    select: { id: true, email: true, name: true, role: true, telegramChatId: true, summarySlots: true },
  });
  for (const u of users) {
    let content: SummaryContent | null | undefined;
    for (const [i, slot] of readSlots(u.summarySlots).entries()) {
      if (!slot.on || (!slot.email && !slot.telegram)) continue;
      if (slot.days === "weekdays" && weekend) continue;
      const late = minutes - toMin(slot.time);
      if (late < 0 || late > LATE_MIN) continue;
      if (!(await claim(`slot:${u.id}:${i}:${slot.time}:${date}`))) continue;
      try {
        content ??= await buildDailySummary(u, { telegramTotals: s.telegramShowTotals });
        if (!content) {
          report.skipped.push(`${u.email} ${slot.time}: sem carteiras com cotação`);
          break;
        }
        if (slot.email) {
          if (!emailConfigured()) report.errors.push(`${u.email} ${slot.time}: e-mail não configurado (RESEND_API_KEY, ALERTS_FROM)`);
          else {
            const r = await sendEmail({ to: [u.email], subject: content.subject, html: content.html, text: content.text, attachments: content.attachments });
            if (r.ok) report.sent++;
            else report.errors.push(`${u.email} ${slot.time}: ${r.error}`);
          }
        }
        if (slot.telegram) {
          if (!telegramConfigured()) report.errors.push(`${u.email} ${slot.time}: Telegram não configurado (TELEGRAM_BOT_TOKEN)`);
          else if (!u.telegramChatId) report.skipped.push(`${u.email} ${slot.time}: Telegram não ligado`);
          // a family group linked by several people with the same time gets it once
          else if (await claim(`slot-tg:${u.telegramChatId}:${slot.time}:${date}`)) {
            const r = await sendTelegramPhotos(u.telegramChatId, [{ png: content.telegram.png, name: "resumo.png" }], content.telegram.caption);
            if (r.ok) report.telegram++;
            else report.errors.push(`${u.email} ${slot.time} (Telegram): ${r.error}`);
          }
        }
      } catch (e) {
        report.errors.push(`${u.email} ${slot.time}: ${e instanceof Error ? e.message.slice(0, 100) : "erro"}`);
      }
    }
  }
  await prisma.setting.upsert({ where: { key: "scheduleTick" }, create: { key: "scheduleTick", value: JSON.stringify(report) }, update: { value: JSON.stringify(report) } });
  if (source === EXTERNAL) await prisma.setting.upsert({ where: { key: "scheduleTickExternalAt" }, create: { key: "scheduleTickExternalAt", value: report.at }, update: { value: report.at } });
  return report;
}

/** Name of the wake-up that comes from an external scheduler (or an hourly Vercel Cron) calling /api/cron/schedule. */
export const EXTERNAL = "despertador";

/** From a page visit: at most every 5 minutes, and only when someone has personal times. */
export async function runScheduledIfDue() {
  const last = await prisma.setting.findUnique({ where: { key: "scheduleTick" } });
  const at = last ? (JSON.parse(last.value) as ScheduleReport).at : null;
  if (at && Date.now() - new Date(at).getTime() < 5 * 60e3) return;
  const any = await prisma.user.count({ where: { summarySlots: { not: Prisma.DbNull } } });
  if (any) await runScheduledSummaries("visita");
}

/** How many people have at least one active time, and when the external wake-up last came. */
export async function scheduleStatus() {
  const users = await prisma.user.findMany({ where: { summarySlots: { not: Prisma.DbNull } }, select: { summarySlots: true } });
  const people = users.filter((u) => activeSlots(readSlots(u.summarySlots)).length).length;
  const [tick, ext] = await Promise.all([prisma.setting.findUnique({ where: { key: "scheduleTick" } }), prisma.setting.findUnique({ where: { key: "scheduleTickExternalAt" } })]);
  return { people, last: tick ? (JSON.parse(tick.value) as ScheduleReport) : null, externalAt: ext?.value ?? null };
}
