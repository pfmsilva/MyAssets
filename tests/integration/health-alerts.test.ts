import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }), sendNotification: (...a: unknown[]) => sendNotification(...a) },
}));

import { alertAdmins, runHealthCheck } from "@/lib/health";
import { db, fixtures, hasDb } from "./helpers";

type Call = { url: string; body: Record<string, unknown> };

describe.skipIf(!hasDb)("vigilance alerts reach the administrators everywhere", () => {
  const fx = fixtures("health");
  let adminId: string;
  let adminEmail: string;
  const calls: Call[] = [];
  let extraEmail: string;
  // the database may hold other administrators (a developer's own data): count who should be reached
  const expected = async () => {
    const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { email: true, telegramChatId: true } });
    return { mails: new Set([...admins.map((a) => a.email.toLowerCase()), extraEmail]).size, chats: new Set(admins.map((a) => a.telegramChatId).filter(Boolean)).size };
  };
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    const a = await fx.user("ADMIN");
    adminId = a.id;
    adminEmail = a.email;
    await db.user.update({ where: { id: adminId }, data: { telegramChatId: "555000111", telegramName: "Teste" } });
    await db.pushSubscription.create({ data: { userId: adminId, endpoint: `https://push.test/${fx.name("e")}`, p256dh: "k", auth: "a" } });
    extraEmail = `extra.${fx.name("x").toLowerCase()}@test.invalid`;
    await db.setting.upsert({ where: { key: "alertEmails" }, create: { key: "alertEmails", value: extraEmail }, update: { value: extraEmail } });
  });
  afterAll(async () => {
    await db.pushSubscription.deleteMany({ where: { userId: adminId } });
    await db.setting.deleteMany({ where: { key: { in: ["alertEmails", "healthState", "healthCheckedAt", "cronDailyAt", "cronEveningAt"] } } });
    await fx.cleanup();
    await db.$disconnect();
  });
  beforeEach(() => {
    calls.length = 0;
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123:abc");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ALERTS_FROM", "Pecúlio <alertas@test.invalid>");
    vi.stubEnv("APP_URL", "https://peculio.test");
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
      calls.push({ url: u, body });
      if (u.includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true, result: true }), { status: 200 });
      if (u.includes("api.resend.com")) {
        // like Resend without a verified domain: only the account owner's address is accepted
        const to = (body.to as string[])[0];
        if (to !== adminEmail.toLowerCase()) return new Response(JSON.stringify({ message: "You can only send testing emails to your own email address" }), { status: 403 });
        return new Response(JSON.stringify({ id: "mail1" }), { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
  });

  it("sends Telegram, e-mail and a notification, all at once", async () => {
    const r = await alertAdmins({ title: "⚠️ Teste", tgHtml: "<b>Teste</b>", mailHtml: "<p>Teste</p>", appBody: "corpo" });
    expect(calls.some((c) => c.url.includes("/sendMessage") && c.body.chat_id === "555000111")).toBe(true);
    expect(calls.filter((c) => c.url.includes("resend")).length).toBeGreaterThanOrEqual(1);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(await db.notification.count({ where: { userId: adminId, kind: "health" } })).toBe(1);
    expect(r.delivered).toBe(3);
  });
  it("one refused e-mail address does not stop the others or the other channels", async () => {
    const r = await alertAdmins({ title: "⚠️ Teste", tgHtml: "x", mailHtml: "<p>x</p>", appBody: "x" });
    const mails = calls.filter((c) => c.url.includes("resend"));
    const { mails: n, chats } = await expected();
    expect(mails.length).toBe(n); // every administrator and the extra address, each on its own
    expect(n).toBeGreaterThanOrEqual(2);
    expect(r.email).toMatch(new RegExp(`1 de ${n}`));
    expect(r.email).toMatch(/403/);
    expect(r.telegram).toMatch(new RegExp(`${chats} de ${chats}`));
    expect(r.delivered).toBe(3);
  });
  it("says which channels are not set up instead of failing", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const r = await alertAdmins({ title: "T", tgHtml: "x", mailHtml: "x", appBody: "x" });
    expect(r.telegram).toMatch(/não configurado/);
    expect(r.email).toMatch(/não configurado/);
    expect(r.delivered).toBe(1); // the app notification still went
  });
  it("a new problem found by the check is announced on every channel, once", async () => {
    await db.setting.deleteMany({ where: { key: { in: ["healthState", "cronDailyAt"] } } });
    await db.setting.create({ data: { key: "cronDailyAt", value: new Date(Date.now() - 40 * 3600e3).toISOString() } });
    await db.setting.upsert({ where: { key: "healthAlerts" }, create: { key: "healthAlerts", value: "true" }, update: { value: "true" } });
    const first = await runHealthCheck({ source: "teste" });
    expect(first.issues.some((i) => i.code === "cron-daily")).toBe(true);
    const { mails: n, chats } = await expected();
    expect(first.notified).toMatch(new RegExp(`Telegram: ${chats} de ${chats}`));
    expect(first.notified).toMatch(new RegExp(`e-mail: 1 de ${n}`));
    const telegramBefore = calls.filter((c) => c.url.includes("/sendMessage")).length;
    const second = await runHealthCheck({ source: "teste" });
    expect(second.notified).toBeNull(); // nothing new: no repeated alert
    expect(calls.filter((c) => c.url.includes("/sendMessage")).length).toBe(telegramBefore);
    await db.setting.update({ where: { key: "cronDailyAt" }, data: { value: new Date().toISOString() } });
    const third = await runHealthCheck({ source: "teste" });
    expect(third.notified).toMatch(/Telegram/); // "resolvido"
  });
});
