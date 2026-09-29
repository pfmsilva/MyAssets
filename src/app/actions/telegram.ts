"use server";
import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";
import { runDailySummary } from "@/lib/daily-summary";
import { ensureWebhook, linkLinks, sendTelegramMessage, telegramConfigured } from "@/lib/telegram";

type Result = { ok: boolean; message: string };

/** Links for the signed-in user to open the bot (private chat or a family group). */
export async function telegramLinks(): Promise<{ ok: true; privateUrl: string; groupUrl: string; username: string } | { ok: false; message: string }> {
  const me = await assertRole("VIEWER");
  if (!telegramConfigured()) return { ok: false, message: "O Telegram ainda não foi configurado pelo administrador (TELEGRAM_BOT_TOKEN)." };
  const hook = await ensureWebhook();
  if (!hook.ok) return { ok: false, message: `Não foi possível ligar o bot à aplicação: ${hook.error}` };
  const links = await linkLinks(me.id);
  if (!links) return { ok: false, message: "Não foi possível contactar o bot. Confirme o TELEGRAM_BOT_TOKEN." };
  return { ok: true, ...links };
}

export async function unlinkTelegram(): Promise<Result> {
  const me = await assertRole("VIEWER");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { telegramChatId: true, telegramName: true } });
  if (!u.telegramChatId) return { ok: true, message: "Não estava ligado." };
  await prisma.user.update({ where: { id: me.id }, data: { telegramChatId: null, telegramName: null, telegramLinkedAt: null } });
  await logActivity(me, "telegram.unlink", { details: { chat: u.telegramName, by: "aplicação" } });
  revalidatePath("/conta");
  return { ok: true, message: "Ligação ao Telegram desfeita." };
}

export async function testTelegram(): Promise<Result> {
  const me = await assertRole("VIEWER");
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { telegramChatId: true } });
  if (!u.telegramChatId) return { ok: false, message: "Ligue primeiro o Telegram." };
  const r = await sendTelegramMessage(u.telegramChatId, "👋 Mensagem de teste do <b>Pecúlio</b>. Está tudo a funcionar.", { buttonText: "Abrir o Pecúlio", buttonUrl: appUrl() || undefined });
  return r.ok ? { ok: true, message: "Mensagem enviada." } : { ok: false, message: `Falhou: ${r.error}` };
}

/** Today's summary to the signed-in user, on Telegram only. */
export async function telegramSummaryNow(): Promise<Result> {
  const me = await assertRole("VIEWER");
  const r = await runDailySummary({ force: true, onlyUserId: me.id, channel: "telegram" });
  await logActivity(me, "summary.test", { details: { canal: "telegram", sent: r.telegram, errors: r.errors, skipped: r.skipped } });
  if (r.telegram) return { ok: true, message: "Resumo enviado para o Telegram." };
  return { ok: false, message: r.errors[0] ?? r.skipped[0] ?? "Nada enviado." };
}
