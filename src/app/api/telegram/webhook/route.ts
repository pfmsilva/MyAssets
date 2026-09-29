import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/email";
import { runDailySummary } from "@/lib/daily-summary";
import { ensureCommands, escHtml, readLinkCode, sendTelegramAction, sendTelegramMessage, webhookSecretOk } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP = "Comandos: /resumo para receber agora o resumo do momento (gráficos dos últimos 7 dias e ganho de hoje); /sair para deixar de receber.";

type Chat = { id: number; type: string; title?: string; username?: string; first_name?: string };
type Update = {
  message?: { text?: string; chat: Chat; from?: { first_name?: string; username?: string } };
  my_chat_member?: { chat: Chat; new_chat_member?: { status?: string } };
};

const chatName = (c: Chat) => c.title ?? (c.username ? `@${c.username}` : (c.first_name ?? String(c.id)));

/** Messages the bot receives. Telegram signs every call with the secret set in setWebhook. */
export async function POST(req: Request) {
  if (!webhookSecretOk(req.headers.get("x-telegram-bot-api-secret-token"))) return new Response("Forbidden", { status: 403 });
  const update = (await req.json().catch(() => ({}))) as Update;

  // the bot was blocked or removed from a group: stop writing there
  const member = update.my_chat_member;
  if (member && ["kicked", "left"].includes(member.new_chat_member?.status ?? "")) {
    await prisma.user.updateMany({ where: { telegramChatId: String(member.chat.id) }, data: { telegramChatId: null, telegramName: null, telegramLinkedAt: null } });
    return Response.json({ ok: true });
  }

  after(ensureCommands);
  const msg = update.message;
  if (!msg?.text) return Response.json({ ok: true });
  const chatId = String(msg.chat.id);
  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  const cmd = command.split("@")[0].toLowerCase();

  if (cmd === "/start") {
    const userId = arg ? readLinkCode(arg) : null;
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }) : null;
    if (!user) {
      await sendTelegramMessage(chatId, "Olá! Para ligar esta conversa ao Pecúlio, entre na aplicação, abra <b>A minha conta</b> e carregue em <b>Ligar Telegram</b>. O link é válido durante 24 horas.");
      return Response.json({ ok: true });
    }
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, telegramName: chatName(msg.chat), telegramLinkedAt: new Date() } });
    await logActivity({ id: user.id, email: user.email, name: user.name }, "telegram.link", { details: { chat: chatName(msg.chat), group: msg.chat.type !== "private" } });
    await sendTelegramMessage(
      chatId,
      `✅ ${msg.chat.type === "private" ? "Esta conversa está ligada" : "Este grupo está ligado"} ao Pecúlio de <b>${escHtml(user.name ?? user.email)}</b>.\nVai receber aqui o resumo do dia e os alertas escolhidos em Definições. Envie /resumo para ter o resumo do momento e /sair para deixar de receber.`,
      { buttonText: "Abrir o Pecúlio", buttonUrl: appUrl() || undefined },
    );
    return Response.json({ ok: true });
  }

  // the summary right now, for the person (or family group) linked to this chat
  if (cmd === "/resumo" || cmd === "/agora" || (msg.chat.type === "private" && ["resumo", "agora"].includes(cmd))) {
    const user = await prisma.user.findFirst({
      where: { telegramChatId: chatId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }], // in a group linked by several people, the administrator's view
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      await sendTelegramMessage(chatId, "Esta conversa não está ligada ao Pecúlio. Entre na aplicação, abra <b>A minha conta</b> e carregue em <b>Ligar Telegram</b>.");
      return Response.json({ ok: true });
    }
    // one request at a time: a double tap does not send two summaries
    const key = `tg-ask:${chatId}`;
    const last = await prisma.alertSent.findUnique({ where: { key } });
    if (last && Date.now() - last.sentAt.getTime() < 30_000) return Response.json({ ok: true });
    await prisma.alertSent.upsert({ where: { key }, create: { key }, update: { sentAt: new Date() } });
    // answer Telegram at once and prepare the image afterwards (quotes and chart take a few seconds)
    after(async () => {
      await sendTelegramAction(chatId, "upload_photo");
      const r = await runDailySummary({ force: true, onlyUserId: user.id, channel: "telegram" });
      await logActivity(user, "telegram.ask", { details: { chat: chatName(msg.chat), sent: r.telegram, errors: r.errors, skipped: r.skipped } });
      if (!r.telegram) await sendTelegramMessage(chatId, `Não foi possível preparar o resumo: ${escHtml(r.errors[0] ?? r.skipped[0] ?? "sem dados")}.`);
    });
    return Response.json({ ok: true });
  }

  if (cmd === "/sair" || cmd === "/stop") {
    const users = await prisma.user.findMany({ where: { telegramChatId: chatId }, select: { id: true, email: true, name: true } });
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null, telegramName: null, telegramLinkedAt: null } });
    for (const u of users) await logActivity(u, "telegram.unlink", { details: { chat: chatName(msg.chat), by: "telegram" } });
    await sendTelegramMessage(chatId, users.length ? "Ligação desfeita. Deixa de receber mensagens do Pecúlio aqui." : "Esta conversa não estava ligada ao Pecúlio.");
    return Response.json({ ok: true });
  }

  if (cmd === "/ajuda" || cmd === "/help" || msg.chat.type === "private") await sendTelegramMessage(chatId, `Este bot envia os resumos e alertas do Pecúlio. ${HELP}`);
  return Response.json({ ok: true });
}
