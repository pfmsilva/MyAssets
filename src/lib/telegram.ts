import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";
import { appUrl } from "./email";

/**
 * Token of the bot, tolerant of how it was pasted into Vercel: spaces, line breaks, quotes,
 * a "bot" prefix or the whole @BotFather message around it.
 */
function botToken(): string | null {
  const raw = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!raw) return null;
  return raw.match(/\d{5,}:[A-Za-z0-9_-]{30,}/)?.[0] ?? raw.replace(/^["']|["']$/g, "").replace(/^bot/i, "").trim();
}

/** Telegram Bot API (https://core.telegram.org/bots/api). Needs TELEGRAM_BOT_TOKEN. */
export function telegramConfigured() {
  return !!botToken();
}

type TgResult<T> = { ok: true; result: T } | { ok: false; error: string };

async function call<T>(method: string, body?: Record<string, unknown> | FormData): Promise<TgResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error: "Telegram não configurado: defina TELEGRAM_BOT_TOKEN no Vercel." };
  try {
    // TELEGRAM_API_BASE only exists for tests against a local stand-in of the Bot API
    const res = await fetch(`${process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org"}/bot${token}/${method}`, {
      method: "POST",
      ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (res.status === 401 || res.status === 404)
      return { ok: false, error: "o Telegram não reconhece o TELEGRAM_BOT_TOKEN. Copie de novo o token do @BotFather (/mybots → o bot → API Token), só o texto do tipo 123456789:AAE…, guarde-o no Vercel e faça Redeploy." };
    if (!data.ok) return { ok: false, error: data.description ?? `erro ${res.status}` };
    return { ok: true, result: data.result as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao contactar o Telegram." };
  }
}

/** Username of the bot (cached), used in the t.me links. */
export async function botUsername(): Promise<string | null> {
  const cached = await prisma.setting.findUnique({ where: { key: "telegramBotUsername" } });
  if (cached?.value) return cached.value;
  const r = await call<{ username: string }>("getMe");
  if (!r.ok) return null;
  await prisma.setting.upsert({ where: { key: "telegramBotUsername" }, create: { key: "telegramBotUsername", value: r.result.username }, update: { value: r.result.username } });
  return r.result.username;
}

// ---------- webhook ----------

/** Secret Telegram sends back in every webhook call, derived from AUTH_SECRET. */
export function webhookSecret() {
  return createHash("sha256").update(`telegram|${process.env.AUTH_SECRET ?? ""}|${botToken() ?? ""}`).digest("hex").slice(0, 48);
}

export function webhookSecretOk(header: string | null) {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(webhookSecret());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Points the bot at this app (idempotent); done before every link so it never gets out of date. */
/** Address Telegram calls; a trailing "/" or a missing "https://" in APP_URL would make it fail. */
function webhookUrl() {
  const base = appUrl().trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${/^https?:\/\//i.test(base) ? base.replace(/^http:/i, "https:") : `https://${base}`}/api/telegram/webhook`;
}

export async function ensureWebhook(): Promise<{ ok: boolean; error?: string }> {
  const url = webhookUrl();
  if (!url) return { ok: false, error: "Defina APP_URL (endereço público da aplicação) no Vercel." };
  const info = await call<{ url: string }>("getWebhookInfo");
  if (info.ok && info.result.url === url) return { ok: true };
  const r = await call<boolean>("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false });
  if (r.ok) await ensureCommands();
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Bump when the commands change, so the bot's menu is updated once. */
const COMMANDS_VERSION = "2";

/** The "/" menu of the bot in Telegram (set once per version). */
export async function ensureCommands() {
  const done = await prisma.setting.findUnique({ where: { key: "telegramCommands" } });
  if (done?.value === COMMANDS_VERSION) return;
  const commands = [
    { command: "resumo", description: "Resumo do momento: gráficos e ganho de hoje" },
    { command: "carteira", description: "Ganhos de cada carteira (ou /carteira xtb)" },
    { command: "ativo", description: "Cotação e posição de um ativo: /ativo aapl" },
    { command: "semana", description: "Ganhos das últimas 8 semanas" },
    { command: "mes", description: "Ganhos dos últimos 12 meses" },
    { command: "orcamento", description: "Gastos do mês face ao orçamento" },
    { command: "ajuda", description: "O que pode perguntar ao bot" },
    { command: "sair", description: "Deixar de receber mensagens do Pecúlio aqui" },
  ];
  const r = await call<boolean>("setMyCommands", { commands });
  await call<boolean>("setMyCommands", { commands, scope: { type: "all_group_chats" } });
  if (r.ok) await prisma.setting.upsert({ where: { key: "telegramCommands" }, create: { key: "telegramCommands", value: COMMANDS_VERSION }, update: { value: COMMANDS_VERSION } });
}

/** Why the bot's messages may not be reaching the app, from Telegram's own view of the webhook. */
export async function webhookProblem(): Promise<string | null> {
  const info = await call<{ url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo");
  if (!info.ok) return info.error;
  const expected = webhookUrl();
  if (info.result.url !== expected) return `o bot está a enviar para "${info.result.url || "nenhum endereço"}" em vez de ${expected}.`;
  const err = info.result.last_error_message;
  if (err && info.result.last_error_date && Date.now() / 1000 - info.result.last_error_date < 3600) {
    const hint = /401|403/.test(err)
      ? " A aplicação recusou o Telegram: se o Vercel tiver a proteção de acesso (Deployment Protection / Vercel Authentication) ativa para este endereço, desative-a para a produção ou use em APP_URL o domínio de produção."
      : /30\d/.test(err)
        ? " O endereço redireciona: confirme que APP_URL é exatamente o domínio de produção, com https:// e sem / no fim."
        : "";
    return `o Telegram não consegue entregar as mensagens à aplicação (${err}).${hint}`;
  }
  return null;
}

// ---------- linking a user to a chat ----------

const sign = (payload: string) => createHmac("sha256", process.env.AUTH_SECRET ?? "peculio").update(payload).digest("hex").slice(0, 16);

/** Short signed code for the t.me link (Telegram allows 64 characters of [A-Za-z0-9_-]). Valid for a day. */
export function linkCode(userId: string) {
  const exp = Math.floor(Date.now() / 1000 + 86400).toString(36);
  return `${userId}_${exp}_${sign(`${userId}_${exp}`)}`;
}

export function readLinkCode(code: string): string | null {
  const [userId, exp, sig] = code.split("_");
  if (!userId || !exp || !sig) return null;
  const expected = sign(`${userId}_${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (parseInt(exp, 36) * 1000 < Date.now()) return null;
  return userId;
}

export async function linkLinks(userId: string) {
  const username = await botUsername();
  if (!username) return null;
  const code = linkCode(userId);
  return { username, privateUrl: `https://t.me/${username}?start=${code}`, groupUrl: `https://t.me/${username}?startgroup=${code}` };
}

// ---------- sending ----------

export const escHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export async function sendTelegramMessage(chatId: string, html: string, opts: { buttonText?: string; buttonUrl?: string } = {}) {
  return call("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(opts.buttonUrl ? { reply_markup: { inline_keyboard: [[{ text: opts.buttonText ?? "Abrir", url: opts.buttonUrl }]] } } : {}),
  });
}

/** "a enviar foto…" at the top of the chat while something slow is prepared. */
export async function sendTelegramAction(chatId: string, action: "typing" | "upload_photo") {
  return call("sendChatAction", { chat_id: chatId, action });
}

/** Several images in one message (an album); the caption goes with the first one. */
export async function sendTelegramPhotos(chatId: string, photos: { png: Buffer; name: string }[], captionHtml?: string) {
  if (photos.length === 1) {
    const fd = new FormData();
    fd.set("chat_id", chatId);
    fd.set("photo", new Blob([new Uint8Array(photos[0].png)], { type: "image/png" }), photos[0].name);
    if (captionHtml) {
      fd.set("caption", captionHtml);
      fd.set("parse_mode", "HTML");
    }
    return call("sendPhoto", fd);
  }
  const fd = new FormData();
  fd.set("chat_id", chatId);
  fd.set("media", JSON.stringify(photos.map((p, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 && captionHtml ? { caption: captionHtml, parse_mode: "HTML" } : {}) }))));
  photos.forEach((p, i) => fd.set(`p${i}`, new Blob([new Uint8Array(p.png)], { type: "image/png" }), p.name));
  return call("sendMediaGroup", fd);
}

export async function sendTelegramDocument(chatId: string, file: Buffer, filename: string, captionHtml?: string) {
  const fd = new FormData();
  fd.set("chat_id", chatId);
  fd.set("document", new Blob([new Uint8Array(file)], { type: "application/pdf" }), filename);
  if (captionHtml) {
    fd.set("caption", captionHtml);
    fd.set("parse_mode", "HTML");
  }
  return call("sendDocument", fd);
}

// ---------- who receives ----------

/** Distinct chats of the given users (a family group linked by several people gets one message). */
export async function chatsForUsers(where: { ids?: string[]; emails?: string[]; admins?: boolean }) {
  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      ...(where.ids ? { id: { in: where.ids } } : {}),
      ...(where.emails ? { email: { in: where.emails.map((e) => e.toLowerCase()) } } : {}),
      ...(where.admins ? { role: "ADMIN" } : {}),
    },
    select: { telegramChatId: true },
  });
  return [...new Set(users.map((u) => u.telegramChatId!))];
}

export type Channel = "email" | "telegram" | "both";
export const viaEmail = (c: Channel) => c === "email" || c === "both";
export const viaTelegram = (c: Channel) => c === "telegram" || c === "both";
