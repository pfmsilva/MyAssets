import { PrismaClient, type AssetType, type Role } from "@prisma/client";

/** Integration tests run against a real Postgres (DATABASE_URL, migrations applied). Everything they create is named TEST_… and removed afterwards. */
export const hasDb = !!process.env.DATABASE_URL;
export const db = new PrismaClient();

export const dayIso = (offset = 0) => new Date(Date.now() + offset * 86400e3).toISOString().slice(0, 10);
export const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function fixtures(tag: string) {
  const created = { assets: [] as string[], users: [] as string[], members: [] as string[], categories: [] as string[], instruments: [] as string[], quotes: [] as string[] };
  const name = (s: string) => `TEST_${tag}_${s}`;

  async function user(role: Role, extra: { memberIds?: string[] } = {}) {
    const u = await db.user.create({ data: { email: `${name(role + created.users.length).toLowerCase()}@test.invalid`, name: name("user"), role, ...(extra.memberIds ? { visibleMembers: { connect: extra.memberIds.map((id) => ({ id })) } } : {}) } });
    created.users.push(u.id);
    return u;
  }
  async function member(label: string) {
    const m = await db.member.create({ data: { name: name(label) } });
    created.members.push(m.id);
    return m;
  }
  async function asset(type: AssetType, label: string, opts: { memberId?: string } = {}) {
    const a = await db.asset.create({ data: { name: name(label), institution: "Teste", type, ...(opts.memberId ? { ownerships: { create: { memberId: opts.memberId, percent: 100 } } } : {}) } });
    created.assets.push(a.id);
    return a;
  }
  /**
   * A brokerage with one fund position (10 units) whose last record is `daysAgo` days old at 1000 €,
   * and a quote already in the cache (previous close 100, price now `price`), so nothing goes to Yahoo.
   * Day change = 10 × (price − 100).
   */
  async function quotedPortfolio(label: string, opts: { price?: number; daysAgo?: number; type?: AssetType; memberId?: string; isin?: string } = {}) {
    const a = await asset(opts.type ?? "BROKERAGE", label, { memberId: opts.memberId });
    const isin = opts.isin ?? `TS${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, "X")}`.slice(0, 12);
    const symbol = `${isin}.TST`;
    await db.snapshot.create({ data: { assetId: a.id, date: dateOf(dayIso(-(opts.daysAgo ?? 3))), value: 1000, positions: { create: [{ name: "Fundo teste", isin, quantity: 10, price: 100, valueEur: 1000, currency: "EUR", costEur: 900 }] } } });
    await db.snapshot.create({ data: { assetId: a.id, date: dateOf(dayIso(-(opts.daysAgo ?? 3) - 30)), value: 900 } });
    const inst = await db.instrument.create({ data: { key: isin, name: "Fundo teste", symbol } });
    created.instruments.push(inst.id);
    await db.quote.upsert({
      where: { symbol },
      create: { symbol, price: opts.price ?? 110, currency: "EUR", previousClose: 100, fetchedAt: new Date(), marketTime: new Date() },
      update: { price: opts.price ?? 110, previousClose: 100, fetchedAt: new Date() },
    });
    created.quotes.push(symbol);
    return a;
  }
  async function cleanup() {
    await db.alertSent.deleteMany({ where: { OR: created.users.map((id) => ({ key: { contains: id } })) } }).catch(() => undefined);
    await db.notification.deleteMany({ where: { userId: { in: created.users } } });
    await db.user.deleteMany({ where: { id: { in: created.users } } });
    await db.asset.deleteMany({ where: { id: { in: created.assets } } });
    await db.member.deleteMany({ where: { id: { in: created.members } } });
    await db.budget.deleteMany({ where: { categoryId: { in: created.categories } } });
    await db.category.deleteMany({ where: { id: { in: created.categories } } });
    await db.instrument.deleteMany({ where: { id: { in: created.instruments } } });
    await db.quote.deleteMany({ where: { symbol: { in: created.quotes } } });
  }
  async function category(label: string, kind: "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT", limit?: number) {
    const c = await db.category.create({ data: { name: name(label), kind, ...(limit ? { budget: { create: { monthlyLimit: limit } } } : {}) } });
    created.categories.push(c.id);
    return c;
  }
  return { name, user, member, asset, quotedPortfolio, category, cleanup };
}
