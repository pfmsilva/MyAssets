import { prisma } from "./prisma";

export type Settings = {
  activityRetentionDays: number; // 0 = keep forever
  alertEmails: string; // comma-separated
  alertStaleDays: number; // 0 = off
  alertMovePct: number; // daily move threshold in %, 0 = off
  alertBudget: boolean;
  backupWeeklyEmail: boolean;
  dailySnapshot: boolean; // save live portfolio values every day
  // ---- proof of life (dead man's switch) ----
  polEnabled: boolean;
  polIntervalDays: number; // days between proof-of-life e-mails
  polGraceDays: number; // days to confirm before the access is released
  polEmails: string; // who receives the proof-of-life e-mail (one click is enough)
  polBeneficiaries: string; // who gets access if nobody confirms
  polBeneficiaryRole: "VIEWER" | "EDITOR" | "ADMIN";
  polMessage: string; // note included in the release e-mail
  polLoginCounts: boolean; // signing in as administrator also counts as proof of life
  allocationBandPp: number; // tolerance around each target, in percentage points
  aiEnabled: boolean; // allow sending a portfolio summary to the Claude API
  aiAnonymize: boolean; // replace family member names before sending
};

export const DEFAULTS: Settings = {
  activityRetentionDays: 365,
  alertEmails: "",
  alertStaleDays: 45,
  alertMovePct: 5,
  alertBudget: true,
  backupWeeklyEmail: false,
  dailySnapshot: false,
  polEnabled: false,
  polIntervalDays: 90,
  polGraceDays: 21,
  polEmails: "",
  polBeneficiaries: "",
  polBeneficiaryRole: "VIEWER",
  polMessage: "",
  polLoginCounts: true,
  allocationBandPp: 5,
  aiEnabled: false,
  aiAnonymize: true,
};

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
    polEnabled: bool("polEnabled"),
    polIntervalDays: Number.isFinite(num("polIntervalDays")) && num("polIntervalDays") > 0 ? num("polIntervalDays") : DEFAULTS.polIntervalDays,
    polGraceDays: Number.isFinite(num("polGraceDays")) && num("polGraceDays") > 0 ? num("polGraceDays") : DEFAULTS.polGraceDays,
    polEmails: map.get("polEmails") ?? DEFAULTS.polEmails,
    polBeneficiaries: map.get("polBeneficiaries") ?? DEFAULTS.polBeneficiaries,
    polBeneficiaryRole: (["VIEWER", "EDITOR", "ADMIN"].includes(map.get("polBeneficiaryRole") ?? "") ? map.get("polBeneficiaryRole") : DEFAULTS.polBeneficiaryRole) as Settings["polBeneficiaryRole"],
    polMessage: map.get("polMessage") ?? DEFAULTS.polMessage,
    polLoginCounts: bool("polLoginCounts"),
    allocationBandPp: Number.isFinite(num("allocationBandPp")) && num("allocationBandPp") >= 0 ? num("allocationBandPp") : DEFAULTS.allocationBandPp,
    aiEnabled: bool("aiEnabled"),
    aiAnonymize: bool("aiAnonymize"),
  };
}

/** Splits a comma/semicolon/space separated list into valid e-mail addresses. */
export const emailList = (value: string) =>
  value
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));

export async function saveSettings(s: Partial<Settings>) {
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
  }
}

export const alertRecipients = (s: Settings) => emailList(s.alertEmails);
export const polRecipients = (s: Settings) => emailList(s.polEmails);
export const polBeneficiaries = (s: Settings) => emailList(s.polBeneficiaries);
