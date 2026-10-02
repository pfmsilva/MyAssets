import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDailyPnl } from "@/lib/daily-pnl";
import { db, fixtures, hasDb } from "./helpers";

describe.skipIf(!hasDb)("getDailyPnl (live portfolios)", () => {
  const fx = fixtures("pnl");
  let quoted: { id: string };
  let unquoted: { id: string };
  beforeAll(async () => {
    quoted = await fx.quotedPortfolio("cotada", { price: 110 }); // day change +100
    unquoted = await fx.asset("BROKERAGE", "sem-cotacao");
    await db.snapshot.create({ data: { assetId: unquoted.id, date: new Date(Date.now() - 3 * 86400e3), value: 500 } });
  });
  afterAll(async () => {
    await fx.cleanup();
    await db.$disconnect();
  });

  it("today's bar is exactly the day change of the quotes", async () => {
    const r = await getDailyPnl({ assetIds: [quoted.id], days: 30, group: "day", onlyQuoted: true });
    const last = r.points.at(-1)!;
    expect(last.live).toBe(true);
    expect(r.todayLive).toBeCloseTo(100, 2);
    expect(last.pnl).toBeCloseTo(r.todayLive!, 2);
    // the asset's own "today" is the same figure
    expect(r.assets.find((a) => a.id === quoted.id)!.today).toBeCloseTo(100, 2);
  });
  it("the live value is the last record moved to the quotes", async () => {
    const r = await getDailyPnl({ assetIds: [quoted.id], days: 30, onlyQuoted: true });
    expect(r.assets[0].recorded).toBe(1000);
    expect(r.assets[0].value).toBeCloseTo(1100, 2);
    expect(r.points.at(-1)!.value).toBeCloseTo(1100, 2);
  });
  it("the cumulative line ends at the sum of the bars", async () => {
    const r = await getDailyPnl({ assetIds: [quoted.id], days: 60, group: "day", onlyQuoted: true });
    const sum = r.points.reduce((s, p) => s + p.pnl, 0);
    expect(r.points.at(-1)!.cumulative).toBeCloseTo(sum, 1);
  });
  it("'só com cotação' leaves out portfolios without quotes", async () => {
    const both = await getDailyPnl({ assetIds: [quoted.id, unquoted.id], days: 30, onlyQuoted: false });
    const only = await getDailyPnl({ assetIds: [quoted.id, unquoted.id], days: 30, onlyQuoted: true });
    expect(both.assets.map((a) => a.id).sort()).toEqual([quoted.id, unquoted.id].sort());
    expect(only.assets.map((a) => a.id)).toEqual([quoted.id]);
  });
  it("grouping by week keeps the total", async () => {
    const days = await getDailyPnl({ assetIds: [quoted.id], days: 60, group: "day", onlyQuoted: true });
    const weeks = await getDailyPnl({ assetIds: [quoted.id], days: 60, group: "week", onlyQuoted: true });
    const total = (xs: { pnl: number }[]) => xs.reduce((s, p) => s + p.pnl, 0);
    expect(total(weeks.points)).toBeCloseTo(total(days.points), 1);
    expect(weeks.points.length).toBeLessThanOrEqual(days.points.length);
  });
  it("is empty for an empty scope", async () => {
    const r = await getDailyPnl({ assetIds: [], days: 30 });
    expect(r.points).toEqual([]);
    expect(r.todayLive).toBeNull();
  });
});
