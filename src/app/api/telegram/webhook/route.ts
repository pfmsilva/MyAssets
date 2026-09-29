import { after } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { appUrl } from "@/lib/email";
import { runDailySummary } from "@/lib/daily-summary";
import { getSettings } from "@/lib/settings";
import { ativoReply, carteiraReply, estadoReply, orcamentoReply, periodReply, type Reply } from "@/lib/telegram-commands";
import { ensureCommands, escHtml, readLinkCode, sendTelegramAction, sendTelegramMessage, sendTelegramPhotos, webhookSecretOk } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP = [
  "<b>Comandos</b>",
  "/resumo — resumo do momento (gráficos dos últimos 7 dias e ganho de hoje)",
  "/carteira — ganhos de cada carteira; /carteira xtb mostra as posições",
  "/ativo aapl — cotação, variação do dia e o que tem desse ativo",
  "/semana e /mes — ganhos por semana (8 semanas) ou por mês (12 meses)",
  "/orcamento — gastos do mês face ao orçamento",
  "/estado — tarefas agendadas, cotações e bot a funcionar? (administradores)",
  "/sair — deixar de receber mensagens aqui",
].join("\n");

type Query = { run: (user: { id: string; role: Role }, arg: string, showTotals: boolean) => Promise<Reply>; photo?: boolean };
/** Questions the bot answers for the person (or family group) linked to the chat. */
const QUERIES: Record<string, Query> = {
  "/carteira": { run: carteiraReply },
  "/carteiras": { run: carteiraReply },
  "/ativo": { run: ativoReply },
  "/semana": { run: (u, _a, t) => periodReply(u, "week", t), photo: true },
  "/mes": { run: (u, _a, t) => periodReply(u, "month", t), photo: true },
  "/orcamento": { run: (u) => orcamentoReply(u) },
  "/estado": { run: (u) => estadoReply(u) },
};

/** "/Carteira@PeculioBot XTB" → ["/carteira", "XTB"]; "/carteira_xtb" (tappable form) → ["/carteira", "xtb"]; words without "/" count in private chats. */
function parseCommand(text: string, isPrivate: boolean): [string, string] {
  const m = text.trim().match(/^(\S+)\s*([\s\S]*)$/);
  if (!m) return ["", ""];
  let cmd = m[1].split("@")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let arg = m[2].trim();
  if (isPrivate && !cmd.startsWith("/")) cmd = `/${cmd}`;
  const under = cmd.match(/^(\/(?:carteira|ativo))_(.+)$/);
  if (under) {
    cmd = under[1];
    arg = arg ? `${under[2]} ${arg}` : under[2];
  }
  return [cmd, arg];
}

/** The account a chat speaks for: in a group linked by several people, the administrator's view. */
const userForChat = (chatId: string) =>
  prisma.user.findFirst({ where: { telegramChatId: chatId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], select: { id: true, email: true, name: true, role: true } });

/** A double tap does not run the same thing twice. */
async function tooSoon(chatId: string, cmd: string, ms: number) {
  const key = `tg-ask:${chatId}:${cmd}`;
  const last = await prisma.alertSent.findUnique({ where: { key } });
  if (last && Date.now() - last.sentAt.getTime() < ms) return true;
  await prisma.alertSent.upsert({ where: { key }, create: { key }, update: { sentAt: new Date() } });
  return false;
}

const NOT_LINKED = "Esta conversa não está ligada ao Pecúlio. Entre na aplicação, abra <b>A minha conta</b> e carregue em <b>Ligar Telegram</b>.";

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
  const isPrivate = msg.chat.type === "private";
  const [cmd, arg] = parseCommand(msg.text, isPrivate);

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
      `✅ ${msg.chat.type === "private" ? "Esta conversa está ligada" : "Este grupo está ligado"} ao Pecúlio de <b>${escHtml(user.name ?? user.email)}</b>.\nVai receber aqui o resumo do dia e os alertas escolhidos em Definições. Envie /ajuda para ver o que pode perguntar (resumo, carteiras, ativos, orçamento) e /sair para deixar de receber.`,
      { buttonText: "Abrir o Pecúlio", buttonUrl: appUrl() || undefined },
    );
    return Response.json({ ok: true });
  }

  // the summary right now, for the person (or family group) linked to this chat
  if (cmd === "/resumo" || cmd === "/agora") {
    const user = await userForChat(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, NOT_LINKED);
      return Response.json({ ok: true });
    }
    if (await tooSoon(chatId, "resumo", 30_000)) return Response.json({ ok: true });
    // answer Telegram at once and prepare the image afterwards (quotes and chart take a few seconds)
    after(async () => {
      await sendTelegramAction(chatId, "upload_photo");
      const r = await runDailySummary({ force: true, onlyUserId: user.id, channel: "telegram" });
      await logActivity(user, "telegram.ask", { details: { comando: "/resumo", chat: chatName(msg.chat), sent: r.telegram, errors: r.errors, skipped: r.skipped } });
      if (!r.telegram) await sendTelegramMessage(chatId, `Não foi possível preparar o resumo: ${escHtml(r.errors[0] ?? r.skipped[0] ?? "sem dados")}.`);
    });
    return Response.json({ ok: true });
  }

  const query = QUERIES[cmd];
  if (query) {
    const user = await userForChat(chatId);
    if (!user) {
      await sendTelegramMessage(chatId, NOT_LINKED);
      return Response.json({ ok: true });
    }
    if (await tooSoon(chatId, `${cmd} ${arg.toLowerCase()}`, 5_000)) return Response.json({ ok: true });
    after(async () => {
      await sendTelegramAction(chatId, query.photo ? "upload_photo" : "typing");
      let error: string | null = null;
      try {
        const { telegramShowTotals } = await getSettings();
        const reply = await query.run(user, arg, telegramShowTotals);
        const r = reply.png
          ? await sendTelegramPhotos(chatId, [{ png: reply.png, name: "pecúlio.png" }], reply.html.slice(0, 1024))
          : await sendTelegramMessage(chatId, reply.html.length > 4000 ? `${reply.html.slice(0, 3990)}…` : reply.html, reply.button ? { buttonText: reply.button.text, buttonUrl: reply.button.url } : {});
        if (!r.ok) error = r.error;
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 150) : "erro";
        await sendTelegramMessage(chatId, `Não foi possível responder: ${escHtml(error)}.`);
      }
      await logActivity(user, "telegram.ask", { details: { comando: `${cmd}${arg ? ` ${arg}` : ""}`, chat: chatName(msg.chat), error } });
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

  if (cmd === "/ajuda" || cmd === "/help" || isPrivate) await sendTelegramMessage(chatId, `Este bot envia os resumos e alertas do Pecúlio e responde a perguntas rápidas.\n\n${HELP}`);
  return Response.json({ ok: true });
}
