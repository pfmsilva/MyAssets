import webpush from "web-push";
import { prisma } from "./prisma";
import { appUrl } from "./email";

/**
 * In-app notifications: every message is kept for the bell list and, when the person allowed
 * it on a device, also sent as a push (Web Push, free, works in Chrome, Edge, Firefox, Safari
 * on the Mac and on iPhones where the app was added to the home screen).
 */

export type NotifyInput = { kind: "summary" | "alert" | "health" | "test"; title: string; body: string; url?: string; image?: Buffer };
export type NotifyResult = { users: number; pushed: number; devices: number; errors: string[] };

const KEEP_DAYS = 30;

type Vapid = { publicKey: string; privateKey: string };

/** VAPID keys: from the environment if set, otherwise generated once and kept in the database. */
async function vapidKeys(): Promise<Vapid> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim() };
  const read = async () => {
    const row = await prisma.setting.findUnique({ where: { key: "vapidKeys" } });
    return row ? (JSON.parse(row.value) as Vapid) : null;
  };
  const found = await read();
  if (found) return found;
  try {
    await prisma.setting.create({ data: { key: "vapidKeys", value: JSON.stringify(webpush.generateVAPIDKeys()) } });
  } catch {
    // two requests generated at the same time: the one that was stored wins
  }
  return (await read())!;
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

async function configure() {
  const k = await vapidKeys();
  const base = appUrl();
  // the subject is shown to the push services: the app's address, never a person's e-mail
  webpush.setVapidDetails(/^https:\/\//.test(base) ? base : "https://example.com", k.publicKey, k.privateKey);
}

/** Sends one payload to every device of the given users; dead devices (404/410) are forgotten. */
async function pushTo(userIds: string[], payload: Record<string, unknown>): Promise<{ pushed: number; devices: number; errors: string[] }> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (!subs.length) return { pushed: 0, devices: 0, errors: [] };
  await configure();
  const body = JSON.stringify(payload);
  const errors: string[] = [];
  let pushed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 12 * 3600, urgency: "normal", timeout: 10_000 });
        pushed++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date() } });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else errors.push(`${status ?? ""} ${e instanceof Error ? e.message.slice(0, 80) : "erro"}`.trim());
      }
    }),
  );
  return { pushed, devices: subs.length, errors };
}

/** Stores the notification for each user (the bell list) and pushes it to their devices. */
export async function notifyUsers(userIds: string[], n: NotifyInput): Promise<NotifyResult> {
  const ids = [...new Set(userIds)];
  const result: NotifyResult = { users: 0, pushed: 0, devices: 0, errors: [] };
  if (!ids.length) return result;
  const rows = await Promise.all(
    ids.map((userId) =>
      prisma.notification.create({ data: { userId, kind: n.kind, title: n.title, body: n.body, url: n.url ?? null, image: n.image ? new Uint8Array(n.image) : undefined }, select: { id: true, userId: true } }),
    ),
  );
  result.users = rows.length;
  // lazy retention: nothing older than a month stays
  await prisma.notification.deleteMany({ where: { userId: { in: ids }, createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86400e3) } } });
  for (const r of rows) {
    const p = await pushTo([r.userId], { title: n.title, body: n.body, url: n.url ?? "/notificacoes", tag: n.kind, id: r.id });
    result.pushed += p.pushed;
    result.devices += p.devices;
    result.errors.push(...p.errors);
  }
  return result;
}

/** Ids of the administrators (alerts and health checks go to them). */
export async function adminIds() {
  return (await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id);
}
