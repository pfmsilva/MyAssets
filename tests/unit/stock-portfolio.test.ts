import { describe, expect, it } from "vitest";
import { computeHolding, quantityAt } from "@/lib/stock-portfolio";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("computeHolding (average cost)", () => {
  it("averages the cost of several purchases, fees included", () => {
    const h = computeHolding([
      { date: d("2024-01-02"), quantity: 10, amount: 1000, fee: 2 },
      { date: d("2024-02-02"), quantity: 10, amount: 1200, fee: 3 },
    ]);
    expect(h.quantity).toBe(20);
    expect(h.costEur).toBe(2205);
    expect(h.avgPrice).toBe(110.25);
    expect(h.invested).toBe(2205);
    expect(h.realizedEur).toBe(0);
  });
  it("realises the gain of a partial sale at the average cost", () => {
    const h = computeHolding([
      { date: d("2024-01-02"), quantity: 10, amount: 1000 },
      { date: d("2024-03-02"), quantity: -4, amount: 600, fee: 5 },
    ]);
    // cost of 4 shares = 400; received 600 - 5
    expect(h.realizedEur).toBe(195);
    expect(h.quantity).toBe(6);
    expect(h.costEur).toBe(600);
    expect(h.proceeds).toBe(595);
  });
  it("resets everything when the position is closed", () => {
    const h = computeHolding([
      { date: d("2024-01-02"), quantity: 5, amount: 500 },
      { date: d("2024-02-02"), quantity: -5, amount: 400 },
    ]);
    expect(h.quantity).toBe(0);
    expect(h.costEur).toBe(0);
    expect(h.avgPrice).toBeNull();
    expect(h.realizedEur).toBe(-100);
  });
  it("warns and ignores the excess when more is sold than was bought", () => {
    const h = computeHolding([
      { date: d("2024-01-02"), quantity: 5, amount: 500 },
      { date: d("2024-02-02"), quantity: -8, amount: 800 },
    ]);
    expect(h.warning).toMatch(/vendas de mais/i);
    expect(h.quantity).toBe(0);
    // only 5 of the 8 sold shares count: 5/8 of 800 = 500 against a cost of 500
    expect(h.realizedEur).toBe(0);
  });
  it("orders the trades by date whatever the input order", () => {
    const h = computeHolding([
      { date: d("2024-02-02"), quantity: -5, amount: 600 },
      { date: d("2024-01-02"), quantity: 5, amount: 500 },
    ]);
    expect(h.warning).toBeNull();
    expect(h.realizedEur).toBe(100);
  });
  it("is empty without trades", () => {
    const h = computeHolding([]);
    expect(h).toMatchObject({ quantity: 0, costEur: 0, avgPrice: null, firstTrade: null });
  });
});

describe("quantityAt", () => {
  const trades = [
    { date: d("2024-01-02"), quantity: 10, amount: 1000 },
    { date: d("2024-06-02"), quantity: -3, amount: 400 },
  ];
  it("counts only the trades up to the date", () => {
    expect(quantityAt(trades, d("2024-03-01"))).toBe(10);
    expect(quantityAt(trades, d("2024-06-02"))).toBe(7);
    expect(quantityAt(trades, d("2023-12-31"))).toBe(0);
  });
});
