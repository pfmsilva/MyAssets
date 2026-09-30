import type { Prisma } from "@prisma/client";

/** Personal summary times (kept apart from the sending code so the global summary can use them too). */
export type Slot = { on: boolean; time: string; email: boolean; telegram: boolean; days: "weekdays" | "all" };

export const SLOT_COUNT = 4;
export const DEFAULT_SLOTS: Slot[] = ["08:30", "13:00", "17:45", "22:30"].map((time) => ({ on: false, time, email: false, telegram: true, days: "weekdays" }));

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The stored slots, always four and valid. */
export function readSlots(raw: Prisma.JsonValue | null | undefined): Slot[] {
  const list = Array.isArray(raw) ? raw : [];
  return DEFAULT_SLOTS.map((def, i) => {
    const r = (list[i] ?? {}) as Partial<Slot>;
    return {
      on: typeof r.on === "boolean" ? r.on : def.on,
      time: typeof r.time === "string" && TIME_RE.test(r.time) ? r.time : def.time,
      email: typeof r.email === "boolean" ? r.email : def.email,
      telegram: typeof r.telegram === "boolean" ? r.telegram : def.telegram,
      days: r.days === "all" ? "all" : "weekdays",
    };
  });
}

export const activeSlots = (slots: Slot[]) => slots.filter((s) => s.on && (s.email || s.telegram));

/** Date, minutes since midnight and weekday in Lisbon. */
export function lisbonNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekend: parts.weekday === "Sat" || parts.weekday === "Sun" };
}

export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A time is sent only up to 3 hours late: a summary that arrives much later is no longer useful. */
export const LATE_MIN = 180;
