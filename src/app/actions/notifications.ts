"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { notifyUsers, vapidPublicKey } from "@/lib/notify";
import { headers } from "next/headers";

const subSchema = z.object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(100) }) });

export async function pushPublicKey() {
  await assertRole("VIEWER");
  return vapidPublicKey();
}

/** Registers this device for the signed-in user (one row per device). */
export async function savePushSubscription(input: unknown): Promise<{ ok: boolean; message: string }> {
  const me = await assertRole("VIEWER");
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Subscrição inválida." };
  const { endpoint, keys } = parsed.data;
  const userAgent = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  // the same device may have belonged to another person who signed in before: it moves to this account
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: me.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  await logActivity(me, "push.enable", { details: { userAgent } });
  revalidatePath("/conta");
  return { ok: true, message: "Notificações ativadas neste dispositivo." };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean; message: string }> {
  const me = await assertRole("VIEWER");
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } });
  await logActivity(me, "push.disable");
  revalidatePath("/conta");
  return { ok: true, message: "Notificações desativadas neste dispositivo." };
}

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  const me = await assertRole("VIEWER");
  const r = await notifyUsers([me.id], { kind: "test", title: "Pecúlio · teste", body: "As notificações estão a funcionar neste dispositivo.", url: "/notificacoes" });
  if (!r.devices) return { ok: true, message: "Guardada no sino. Ainda não há nenhum dispositivo com notificações ativas." };
  if (!r.pushed) return { ok: false, message: `Não foi possível enviar ao dispositivo: ${r.errors[0] ?? "sem resposta"}.` };
  return { ok: true, message: `Enviada para ${r.pushed} de ${r.devices} dispositivo(s).` };
}

export async function markNotificationsRead(): Promise<void> {
  const me = await assertRole("VIEWER");
  await prisma.notification.updateMany({ where: { userId: me.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function deleteNotifications(): Promise<void> {
  const me = await assertRole("VIEWER");
  await prisma.notification.deleteMany({ where: { userId: me.id } });
  revalidatePath("/", "layout");
}
