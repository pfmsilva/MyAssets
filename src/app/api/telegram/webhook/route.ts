import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/email";
import { escHtml, readLinkCode, sendTelegramMessage, webhookSecretOk } from "@/lib/telegram";

export const dynamic = "force-dynamic";

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
      `✅ ${msg.chat.type === "private" ? "Esta conversa" : "Este grupo"} está ligado ao Pecúlio de <b>${escHtml(user.name ?? user.email)}</b>.\nVai receber aqui o resumo do dia e os alertas escolhidos em Definições. Para deixar de receber, envie /sair.`,
      { buttonText: "Abrir o Pecúlio", buttonUrl: appUrl() || undefined },
    );
    return Response.json({ ok: true });
  }

  if (cmd === "/sair" || cmd === "/stop") {
    const users = await prisma.user.findMany({ where: { telegramChatId: chatId }, select: { id: true, email: true, name: true } });
    await prisma.user.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null, telegramName: null, telegramLinkedAt: null } });
    for (const u of users) await logActivity(u, "telegram.unlink", { details: { chat: chatName(msg.chat), by: "telegram" } });
    await sendTelegramMessage(chatId, users.length ? "Ligação desfeita. Deixa de receber mensagens do Pecúlio aqui." : "Esta conversa não estava ligada ao Pecúlio.");
    return Response.json({ ok: true });
  }

  if (msg.chat.type === "private") await sendTelegramMessage(chatId, "Este bot só envia os resumos e alertas do Pecúlio. Comandos: /sair para deixar de receber.");
  return Response.json({ ok: true });
}
