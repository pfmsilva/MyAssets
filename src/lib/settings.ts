import { prisma } from "./prisma";

export type Settings = {
  activityRetentionDays: number; // 0 = keep forever
  alertEmails: string; // comma-separated
  alertStaleDays: number; // 0 = off
  alertMovePct: number; // daily move threshold in %, 0 = off
  alertBudget: boolean;
  backupWeeklyEmail: boolean;
  dailySnapshot: boolean; // save live portfolio values every day
};

export const DEFAULTS: Settings = { activityRetentionDays: 365, alertEmails: "", alertStaleDays: 45, alertMovePct: 5, alertBudget: true, backupWeeklyEmail: false, dailySnapshot: false };

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: keyof Settings) => (map.has(k) ? Number(map.get(k)) : (DEFAULTS[k] as number));
  const bool = (k: keyof Settings) => (map.has(k) ? map.get(k) === "true" : (DEFAULTS[k] as boolean));
  return {
    activityRetentionDays: Number.isFinite(num("activityRetentionDays")) ? num("activityRetentionDays") : DEFAULTS.activityRetentionDays,
    alertEmails: map.get("alertEmails") ?? DEFAULTS.alertEmails,
    alertStaleDays: Number.isFinite(num("alertStaleDays")) ? num("alertStaleDays") : DEFAULTS.alertStaleDays,
    alertMovePct: Number.isFinite(num("alertMovePct")) ? num("alertMovePct") : DEFAULTS.alertMovePct,
    alertBudget: bool("alertBudget"),
    backupWeeklyEmail: bool("backupWeeklyEmail"),
    dailySnapshot: bool("dailySnapshot"),
  };
}

export async function saveSettings(s: Partial<Settings>) {
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
  }
}

export const alertRecipients = (s: Settings) => s.alertEmails.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
