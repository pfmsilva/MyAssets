import { describe, expect, it } from "vitest";
import { duplicateTrades, duplicateTransactions, futureDates, oversold, positionCosts, snapshotJumps, snapshotMismatches, uncategorized } from "@/lib/data-quality";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const a = { id: "a1", name: "XTB" };
const tx = (over: Partial<Parameters<typeof duplicateTransactions>[0][number]> = {}) => ({ asset: a, date: d("2026-09-01"), amount: -2.5, description: "Café", balanceAfter: null, importBatchId: "b1", ...over });

describe("snapshotMismatches", () => {
  it("flags a total that differs from the positions", () => {
    const r = snapshotMismatches([{ asset: a, date: d("2026-09-01"), value: 1000, positions: [{ valueEur: 600 }, { valueEur: 300 }] }]);
    expect(r).toHaveLength(1);
    expect(r[0].code).toBe("snapshot-mismatch");
    expect(r[0].title).toContain("XTB");
  });
  it("accepts rounding and snapshots without positions", () => {
    expect(snapshotMismatches([{ asset: a, date: d("2026-09-01"), value: 1000, positions: [{ valueEur: 999.6 }] }])).toEqual([]);
    expect(snapshotMismatches([{ asset: a, date: d("2026-09-01"), value: 1000, positions: [] }])).toEqual([]);
  });
});

describe("duplicateTransactions", () => {
  it("two identical movements in different files are a duplicate", () => {
    expect(duplicateTransactions([tx({ importBatchId: "b1" }), tx({ importBatchId: "b2" })])).toHaveLength(1);
  });
  it("the same balance afterwards means the same movement", () => {
    expect(duplicateTransactions([tx({ balanceAfter: 100 }), tx({ balanceAfter: 100 })])).toHaveLength(1);
  });
  it("two coffees on the same day in the same file are fine", () => {
    expect(duplicateTransactions([tx({ balanceAfter: 100 }), tx({ balanceAfter: 97.5 })])).toEqual([]);
    expect(duplicateTransactions([tx(), tx()])).toEqual([]);
  });
  it("different amounts or days are different movements", () => {
    expect(duplicateTransactions([tx({ importBatchId: "b1" }), tx({ importBatchId: "b2", amount: -3 })])).toEqual([]);
    expect(duplicateTransactions([tx({ importBatchId: "b1" }), tx({ importBatchId: "b2", date: d("2026-09-02") })])).toEqual([]);
  });
  it("groups the findings per asset", () => {
    const r = duplicateTransactions([tx({ importBatchId: "b1" }), tx({ importBatchId: "b2" }), tx({ importBatchId: "b1", description: "Pão" }), tx({ importBatchId: "b2", description: "Pão" })]);
    expect(r).toHaveLength(1);
    expect(r[0].title).toContain("2 movimento(s)");
  });
});

describe("duplicateTrades", () => {
  const t = (over = {}) => ({ asset: a, holding: "VWCE", date: d("2026-01-05"), quantity: 3, amount: 330, externalId: "x1", ...over });
  it("flags the same trade under two identifiers", () => {
    expect(duplicateTrades([t(), t({ externalId: "x2" })])).toHaveLength(1);
  });
  it("ignores trades that differ or share the identifier", () => {
    expect(duplicateTrades([t(), t({ externalId: "x2", quantity: 4 })])).toEqual([]);
    expect(duplicateTrades([t(), t()])).toEqual([]);
  });
});

describe("positionCosts", () => {
  const pos = (name: string, valueEur: number, costEur: number | null, quantity: number | null = 1) => ({ name, valueEur, costEur, quantity });
  it("reports positions without cost, and ignores cash and tiny ones", () => {
    const r = positionCosts([{ asset: a, positions: [pos("ETF", 1000, null), pos("Caixa", 500, null, null), pos("Poeira", 10, null)] }]);
    expect(r.map((i) => i.code)).toEqual(["missing-cost"]);
    expect(r[0].title).toContain("1 posição");
  });
  it("flags absurd gains and losses", () => {
    const r = positionCosts([{ asset: a, positions: [pos("Bom", 1100, 1000), pos("Esquisito", 50000, 100), pos("Perdido", 10, 1000)] }]);
    expect(r.map((i) => i.code)).toEqual(["suspicious-gain"]);
    expect(r[0].title).toContain("1 posição");
    const both = positionCosts([{ asset: a, positions: [pos("Esquisito", 50000, 100), pos("Perdido", 60, 2000)] }]);
    expect(both[0].title).toContain("2 posição");
  });
});

describe("snapshotJumps", () => {
  it("flags big moves between records", () => {
    const r = snapshotJumps([{ asset: a, points: [{ date: d("2026-01-31"), value: 10000 }, { date: d("2026-02-28"), value: 20000 }, { date: d("2026-03-31"), value: 20500 }] }]);
    expect(r).toHaveLength(1);
    expect(r[0].detail).toContain("2026-02-28");
  });
  it("ignores small assets and small moves", () => {
    expect(snapshotJumps([{ asset: a, points: [{ date: d("2026-01-31"), value: 100 }, { date: d("2026-02-28"), value: 900 }] }])).toEqual([]);
    expect(snapshotJumps([{ asset: a, points: [{ date: d("2026-01-31"), value: 10000 }, { date: d("2026-02-28"), value: 11000 }] }])).toEqual([]);
  });
});

describe("futureDates", () => {
  it("flags records beyond tomorrow", () => {
    const now = d("2026-10-02");
    const r = futureDates([{ kind: "movimento(s)", asset: a, date: d("2026-12-05") }, { kind: "movimento(s)", asset: a, date: d("2026-10-03") }], now);
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe("error");
    expect(r[0].detail).toContain("1 movimento(s)");
  });
});

describe("oversold", () => {
  it("flags sales larger than the purchases", () => {
    const r = oversold([{ asset: a, name: "VWCE", trades: [{ date: d("2026-01-01"), quantity: 2, amount: 200, fee: 0 }, { date: d("2026-02-01"), quantity: -5, amount: 600, fee: 0 }] }]);
    expect(r).toHaveLength(1);
    expect(oversold([{ asset: a, name: "VWCE", trades: [{ date: d("2026-01-01"), quantity: 5, amount: 500, fee: 0 }, { date: d("2026-02-01"), quantity: -5, amount: 600, fee: 0 }] }])).toEqual([]);
  });
});

describe("uncategorized", () => {
  const rows = (n: number, missing: number) => Array.from({ length: n }, (_, i) => ({ categoryId: i < missing ? null : "c", amount: -10 }));
  it("flags when more than a fifth of the expenses has no category", () => {
    expect(uncategorized(rows(50, 20))).toHaveLength(1);
    expect(uncategorized(rows(50, 5))).toEqual([]);
  });
  it("needs enough movements to say anything", () => {
    expect(uncategorized(rows(10, 10))).toEqual([]);
  });
});
