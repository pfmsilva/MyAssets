import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBudgetOverview } from "@/lib/budget";
import { getScope } from "@/lib/scope";
import { checkDataQuality } from "@/lib/data-quality";
import { db, dateOf, fixtures, hasDb } from "./helpers";

const month = new Date().toISOString().slice(0, 7);
const inMonth = (day: number) => dateOf(`${month}-${String(day).padStart(2, "0")}`);
const prevMonthDate = () => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 10));
};

describe.skipIf(!hasDb)("budget", () => {
  const fx = fixtures("budget");
  let account: { id: string };
  beforeAll(async () => {
    account = await fx.asset("CURRENT_ACCOUNT", "conta");
    const food = await fx.category("mercado", "EXPENSE", 100);
    const fun = await fx.category("lazer", "EXPENSE", 200);
    const pay = await fx.category("ordenado", "INCOME");
    const tx = (n: number, date: Date, amount: number, categoryId: string | null) => db.transaction.create({ data: { assetId: account.id, date, description: `t${n}`, amount, hash: `${fx.name("h")}${n}`, categoryId } });
    await tx(1, inMonth(2), -60, food.id);
    await tx(2, inMonth(3), -70, food.id);
    await tx(3, inMonth(4), 20, food.id); // refund nets against the category
    await tx(4, inMonth(5), -50, fun.id);
    await tx(5, inMonth(6), 3000, pay.id); // income is not spending
    await tx(6, inMonth(7), -15, null); // uncategorised expense
    await tx(7, prevMonthDate(), -40, food.id);
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("adds up spending per category, netting refunds and leaving income out", async () => {
    const b = await getBudgetOverview(month, [account.id]);
    const row = (suffix: string) => b.rows.find((r) => r.name.endsWith(suffix))!;
    expect(row("mercado").spent).toBeCloseTo(110, 2);
    expect(row("lazer").spent).toBeCloseTo(50, 2);
    expect(b.rows.some((r) => r.name.endsWith("ordenado"))).toBe(false);
    expect(b.rows.find((r) => r.categoryId === "__none")!.spent).toBeCloseTo(15, 2);
    expect(b.totals.spent).toBeCloseTo(110 + 50 + 15, 2);
  });
  it("marks a category over its limit, one under 80 % ok", async () => {
    const b = await getBudgetOverview(month, [account.id]);
    expect(b.rows.find((r) => r.name.endsWith("mercado"))!.status).toBe("over");
    expect(b.rows.find((r) => r.name.endsWith("lazer"))!.status).toBe("ok");
    expect(b.totals.limit).toBeGreaterThanOrEqual(300); // other categories in the database may have limits too
  });
  it("keeps the previous month apart", async () => {
    const b = await getBudgetOverview(month, [account.id]);
    expect(b.rows.find((r) => r.name.endsWith("mercado"))!.prev).toBeCloseTo(40, 2);
  });
});

describe.skipIf(!hasDb)("access scope", () => {
  const fx = fixtures("scope");
  let mine: { id: string };
  let theirs: { id: string };
  let viewer: { id: string; role: "VIEWER" };
  let admin: { id: string; role: "ADMIN" };
  let free: { id: string; role: "VIEWER" };
  beforeAll(async () => {
    const m1 = await fx.member("eu");
    const m2 = await fx.member("outro");
    mine = await fx.asset("CASH", "meu", { memberId: m1.id });
    theirs = await fx.asset("CASH", "dele", { memberId: m2.id });
    viewer = (await fx.user("VIEWER", { memberIds: [m1.id] })) as typeof viewer;
    admin = (await fx.user("ADMIN")) as typeof admin;
    free = (await fx.user("VIEWER")) as typeof free;
  });
  afterAll(async () => {
    await fx.cleanup();
    await db.$disconnect();
  });

  it("a viewer linked to a member sees only that member's assets", async () => {
    const s = await getScope(viewer);
    expect(s.all).toBe(false);
    expect(s.assetIds).toContain(mine.id);
    expect(s.assetIds).not.toContain(theirs.id);
  });
  it("administrators see everything", async () => {
    expect((await getScope(admin)).all).toBe(true);
  });
  it("a viewer with no linked members sees everything", async () => {
    expect((await getScope(free)).all).toBe(true);
  });
});

describe.skipIf(!hasDb)("data quality over the database", () => {
  const fx = fixtures("dq");
  let account: { id: string };
  let broker: { id: string };
  beforeAll(async () => {
    account = await fx.asset("CURRENT_ACCOUNT", "conta");
    const b1 = await db.importBatch.create({ data: { assetId: account.id, source: "bpi", fileName: "a.xlsx" } });
    const b2 = await db.importBatch.create({ data: { assetId: account.id, source: "bpi", fileName: "b.xlsx" } });
    const row = (n: number, batch: string) => db.transaction.create({ data: { assetId: account.id, date: new Date(Date.now() - 5 * 86400e3), description: "Supermercado X", amount: -33.3, hash: `${fx.name("dup")}${n}`, importBatchId: batch } });
    await row(1, b1.id);
    await row(2, b2.id);
    broker = await fx.asset("BROKERAGE", "corretora");
    await db.snapshot.create({ data: { assetId: broker.id, date: new Date(Date.now() - 86400e3), value: 5000, positions: { create: [{ name: "ETF", isin: "IE00BK5BQT80", quantity: 10, valueEur: 1000, costEur: 900 }] } } });
    await db.snapshot.create({ data: { assetId: broker.id, date: new Date(Date.now() + 40 * 86400e3), value: 5100 } });
  });
  afterAll(async () => {
    await fx.cleanup();
    await db.$disconnect();
  });

  it("finds the duplicated movement, the mismatched total and the future record", async () => {
    const r = await checkDataQuality({ assetIds: [account.id, broker.id] });
    const codes = r.issues.map((i) => `${i.code}:${i.assetId}`);
    expect(codes).toContain(`duplicate-transactions:${account.id}`);
    expect(codes).toContain(`snapshot-mismatch:${broker.id}`);
    expect(codes).toContain(`future-dates:${broker.id}`);
    expect(r.counts.error).toBeGreaterThanOrEqual(1);
    // errors come first
    expect(r.issues[0].level).toBe("error");
  });
});
