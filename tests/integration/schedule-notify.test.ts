import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }), sendNotification: (...a: unknown[]) => sendNotification(...a) },
}));

import { notifyUsers } from "@/lib/notify";
import { runScheduledSummaries } from "@/lib/summary-schedule";
import { db, fixtures, hasDb } from "./helpers";

// Friday 2 October 2026, 12:00 UTC = 13:00 in Lisbon (summer time)
const FRIDAY = new Date("2026-10-02T12:00:00Z");
const SATURDAY = new Date("2026-10-03T12:00:00Z");
const slot = (time: string, over: Record<string, unknown> = {}) => ({ on: true, time, email: false, telegram: false, app: true, days: "weekdays", ...over });
const off = { on: false, time: "07:00", email: false, telegram: false, app: false, days: "weekdays" };

describe.skipIf(!hasDb)("personal summary times", () => {
  const fx = fixtures("sched");
  let userId: string;
  beforeAll(async () => {
    await fx.quotedPortfolio("carteira", { price: 110 });
    const u = await fx.user("ADMIN");
    userId = u.id;
  });
  afterAll(async () => {
    await fx.cleanup();
    await db.$disconnect();
  });
  const setSlots = (slots: unknown[]) => db.user.update({ where: { id: userId }, data: { summarySlots: slots as never } });
  const count = () => db.notification.count({ where: { userId, kind: "summary" } });
  const reset = async () => {
    await db.notification.deleteMany({ where: { userId } });
    await db.alertSent.deleteMany({ where: { key: { startsWith: "slot" } } });
  };
  beforeEach(reset);

  it("sends the time that is due, once", async () => {
    await setSlots([slot("12:55"), off, off, off]); // 5 minutes late
    const first = await runScheduledSummaries("teste", FRIDAY);
    expect(first.errors).toEqual([]);
    expect(await count()).toBe(1);
    await runScheduledSummaries("teste", FRIDAY);
    await runScheduledSummaries("teste", new Date(FRIDAY.getTime() + 60e3));
    expect(await count()).toBe(1);
  });
  it("leaves out the future, the too late and the switched off", async () => {
    await setSlots([slot("14:00"), slot("09:00"), { ...slot("12:50"), on: false }, slot("12:50", { app: false })]);
    await runScheduledSummaries("teste", FRIDAY);
    expect(await count()).toBe(0);
  });
  it("a time up to three hours late still goes out", async () => {
    await setSlots([slot("10:30"), off, off, off]); // 2.5 hours late
    await runScheduledSummaries("teste", FRIDAY);
    expect(await count()).toBe(1);
  });
  it("weekday times wait for Monday, 'todos os dias' do not", async () => {
    await setSlots([slot("12:55"), off, off, off]);
    await runScheduledSummaries("teste", SATURDAY);
    expect(await count()).toBe(0);
    await setSlots([slot("12:55", { days: "all" }), off, off, off]);
    await runScheduledSummaries("teste", SATURDAY);
    expect(await count()).toBe(1);
  });
  it("two times in the same wake-up go out separately", async () => {
    await setSlots([slot("12:30"), slot("12:50"), off, off]);
    await runScheduledSummaries("teste", FRIDAY);
    expect(await count()).toBe(2);
  });
  it("the notification carries gains only and the charts image", async () => {
    await setSlots([slot("12:55"), off, off, off]);
    await runScheduledSummaries("teste", FRIDAY);
    const n = await db.notification.findFirstOrThrow({ where: { userId, kind: "summary" } });
    expect(n.title).toBe("Pecúlio · resumo das 12:55");
    expect(n.body).toMatch(/^Hoje [+-]/);
    expect(n.body).not.toMatch(/Carteiras em direto/);
    expect(n.image?.length).toBeGreaterThan(1000);
    expect(n.url).toContain("/rentabilidade");
  });
});

describe.skipIf(!hasDb)("notifyUsers (push)", () => {
  const fx = fixtures("notify");
  let userId: string;
  beforeAll(async () => {
    userId = (await fx.user("VIEWER")).id;
  });
  afterAll(async () => {
    await db.pushSubscription.deleteMany({ where: { userId } });
    await fx.cleanup();
    await db.$disconnect();
  });
  beforeEach(async () => {
    sendNotification.mockReset();
    await db.pushSubscription.deleteMany({ where: { userId } });
    await db.notification.deleteMany({ where: { userId } });
  });
  const sub = (n: number) => db.pushSubscription.create({ data: { userId, endpoint: `https://push.test/${fx.name("e")}${n}`, p256dh: "k", auth: "a" } });

  it("keeps it in the bell even without devices", async () => {
    const r = await notifyUsers([userId], { kind: "test", title: "T", body: "B" });
    expect(r).toMatchObject({ users: 1, devices: 0, pushed: 0 });
    expect(await db.notification.count({ where: { userId } })).toBe(1);
    expect(sendNotification).not.toHaveBeenCalled();
  });
  it("pushes to every device and remembers the success", async () => {
    await sub(1);
    await sub(2);
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const r = await notifyUsers([userId], { kind: "alert", title: "T", body: "B", url: "/x" });
    expect(r).toMatchObject({ pushed: 2, devices: 2 });
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload).toMatchObject({ title: "T", body: "B", url: "/x", tag: "alert" });
    expect((await db.pushSubscription.findMany({ where: { userId } })).every((s) => s.lastOkAt)).toBe(true);
  });
  it("forgets a device that is gone (410) and keeps the others", async () => {
    const gone = await sub(1);
    await sub(2);
    sendNotification.mockImplementation((s: { endpoint: string }) => (s.endpoint === gone.endpoint ? Promise.reject(Object.assign(new Error("gone"), { statusCode: 410 })) : Promise.resolve({})));
    const r = await notifyUsers([userId], { kind: "test", title: "T", body: "B" });
    expect(r).toMatchObject({ pushed: 1, devices: 2 });
    expect(await db.pushSubscription.count({ where: { userId } })).toBe(1);
  });
  it("keeps a device after a temporary failure and reports it", async () => {
    await sub(1);
    sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 503 }));
    const r = await notifyUsers([userId], { kind: "test", title: "T", body: "B" });
    expect(r.pushed).toBe(0);
    expect(r.errors[0]).toMatch(/503/);
    expect(await db.pushSubscription.count({ where: { userId } })).toBe(1);
  });
  it("drops notifications older than a month", async () => {
    await db.notification.create({ data: { userId, kind: "test", title: "velha", body: "x", createdAt: new Date(Date.now() - 40 * 86400e3) } });
    await notifyUsers([userId], { kind: "test", title: "nova", body: "y" });
    expect((await db.notification.findMany({ where: { userId } })).map((n) => n.title)).toEqual(["nova"]);
  });
});
