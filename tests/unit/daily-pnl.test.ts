import { describe, expect, it } from "vitest";
import { bucketOf, groupPoints, isoWeek, type DailyPoint } from "@/lib/daily-pnl";

const pt = (date: string, pnl: number, value = 0, flow = 0): DailyPoint => ({ date, label: date.slice(8, 10), value, flow, pnl, cumulative: 0 });

describe("isoWeek", () => {
  it("uses the ISO year around the new year", () => {
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01"); // Thursday
    expect(isoWeek(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01"); // Monday of the first ISO week of 2025
    expect(isoWeek(new Date("2021-01-03T00:00:00Z"))).toBe("2020-W53"); // Sunday of the last ISO week of 2020
    expect(isoWeek(new Date("2026-09-29T00:00:00Z"))).toBe("2026-W40");
  });
  it("starts the week on Monday", () => {
    expect(isoWeek(new Date("2026-09-27T00:00:00Z"))).toBe("2026-W39"); // Sunday
    expect(isoWeek(new Date("2026-09-28T00:00:00Z"))).toBe("2026-W40"); // Monday
  });
});

describe("bucketOf", () => {
  it("labels weeks, months and years", () => {
    expect(bucketOf("2026-09-29", "week")).toEqual({ key: "2026-W40", label: "sem. 40/26" });
    expect(bucketOf("2026-09-29", "month")).toEqual({ key: "2026-09", label: "set 26" });
    expect(bucketOf("2026-09-29", "year")).toEqual({ key: "2026", label: "2026" });
    expect(bucketOf("2026-09-29", "day")).toEqual({ key: "2026-09-29", label: "29/09" });
  });
});

describe("groupPoints", () => {
  const days = [pt("2026-09-21", 100, 1000), pt("2026-09-22", -30, 970), pt("2026-09-28", 50, 1020, 10), pt("2026-09-29", 20, 1040)];
  it("returns the days untouched", () => {
    expect(groupPoints(days, "day")).toBe(days);
  });
  it("adds up the changes of each week and keeps the last value", () => {
    const weeks = groupPoints(days.map((p) => ({ ...p })), "week");
    expect(weeks.map((w) => [w.pnl, w.value, w.flow])).toEqual([
      [70, 970, 0],
      [70, 1040, 10],
    ]);
  });
  it("recomputes the running total over the groups", () => {
    const weeks = groupPoints(days.map((p) => ({ ...p })), "week");
    expect(weeks.map((w) => w.cumulative)).toEqual([70, 140]);
  });
  it("one month holds them all, and the live flag survives", () => {
    const withLive = days.map((p, i) => ({ ...p, live: i === 3 }));
    const months = groupPoints(withLive, "month");
    expect(months).toHaveLength(1);
    expect(months[0].pnl).toBe(140);
    expect(months[0].live).toBe(true);
  });
});
