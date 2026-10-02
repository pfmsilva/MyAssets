import { describe, expect, it } from "vitest";
import { computeAssetPerf, twr, xirr } from "@/lib/performance";
import { valueAt, combineSeries } from "@/lib/asset-series";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("xirr", () => {
  it("gives the annual rate of a single investment held one year", () => {
    const r = xirr([{ date: d("2024-01-01"), amount: -1000 }, { date: d("2024-12-31"), amount: 1100 }]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });
  it("is null without both an outflow and an inflow", () => {
    expect(xirr([{ date: d("2024-01-01"), amount: -1000 }, { date: d("2024-06-01"), amount: -50 }])).toBeNull();
    expect(xirr([{ date: d("2024-01-01"), amount: 100 }])).toBeNull();
  });
  it("is null when everything happens on the same day", () => {
    expect(xirr([{ date: d("2024-01-01"), amount: -100 }, { date: d("2024-01-01"), amount: 110 }])).toBeNull();
  });
  it("handles losses (negative rate)", () => {
    const r = xirr([{ date: d("2024-01-01"), amount: -1000 }, { date: d("2025-01-01"), amount: 800 }]);
    expect(r!).toBeLessThan(0);
    expect(r!).toBeCloseTo(-0.2, 2);
  });
  it("accounts for a deposit in the middle", () => {
    // 1000 in, 1000 more after 6 months, 2200 at the end of the year
    const r = xirr([{ date: d("2024-01-01"), amount: -1000 }, { date: d("2024-07-01"), amount: -1000 }, { date: d("2025-01-01"), amount: 2200 }]);
    expect(r!).toBeGreaterThan(0.1);
    expect(r!).toBeLessThan(0.2);
  });
});

describe("valueAt / combineSeries", () => {
  const snaps = [{ date: d("2024-01-31"), value: 100 }, { date: d("2024-03-31"), value: 130 }];
  it("carries the last known value forward", () => {
    expect(valueAt(snaps, d("2024-02-15"))).toBe(100);
    expect(valueAt(snaps, d("2024-03-31"))).toBe(130);
    expect(valueAt(snaps, d("2025-01-01"))).toBe(130);
  });
  it("has no value before the first record", () => {
    expect(valueAt(snaps, d("2024-01-30"))).toBeNull();
  });
  it("sums the carried values of several assets at every date", () => {
    const total = combineSeries([{ snapshots: snaps }, { snapshots: [{ date: d("2024-02-29"), value: 50 }] }]);
    expect(total.map((p) => [p.date.toISOString().slice(0, 10), p.value])).toEqual([
      ["2024-01-31", 100],
      ["2024-02-29", 150],
      ["2024-03-31", 180],
    ]);
  });
});

describe("twr", () => {
  it("is the growth when there are no flows", () => {
    const snaps = [{ date: d("2024-01-31"), value: 1000 }, { date: d("2024-02-29"), value: 1100 }, { date: d("2024-03-31"), value: 1210 }];
    const r = twr(snaps, [], d("2024-01-31"), d("2024-03-31"));
    expect(r.twr!).toBeCloseTo(0.21, 3);
    expect(r.months).toBeGreaterThanOrEqual(2);
  });
  it("does not count a deposit as a gain", () => {
    const snaps = [{ date: d("2024-01-31"), value: 1000 }, { date: d("2024-02-29"), value: 2000 }];
    const flows = [{ date: d("2024-02-15"), amount: 1000, source: "x", description: "depósito" }];
    const r = twr(snaps, flows, d("2024-01-31"), d("2024-02-29"));
    expect(Math.abs(r.twr!)).toBeLessThan(0.05);
  });
  it("is null without a starting value", () => {
    expect(twr([{ date: d("2024-05-31"), value: 10 }], [], d("2024-01-31"), d("2024-06-30")).twr).toBeNull();
  });
});

describe("computeAssetPerf", () => {
  const asset = { id: "a", name: "Carteira", type: "BROKERAGE" };
  it("gain = value - starting value - flows", () => {
    const snaps = [{ date: d("2024-01-31"), value: 1000 }, { date: d("2024-12-31"), value: 1700 }];
    const flows = [{ date: d("2024-06-30"), amount: 500, source: "x", description: "depósito" }];
    const p = computeAssetPerf(asset, snaps, flows, d("2025-01-15"));
    const since = p.periods.at(-1)!;
    expect(since.label).toBe("Desde o início");
    expect(since.startValue).toBe(1000);
    expect(since.invested).toBe(500);
    expect(since.gain).toBe(200);
  });
  it("has no gain with a single record", () => {
    const p = computeAssetPerf(asset, [{ date: d("2024-01-31"), value: 1000 }], [], d("2025-01-15"));
    expect(p.periods.every((x) => x.gain === null)).toBe(true);
  });
});
