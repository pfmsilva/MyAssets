import { prisma } from "./prisma";
import { getSettings, alertRecipients } from "./settings";
import { appUrl, emailConfigured, emailLayout, sendEmail } from "./email";
import { chatsForUsers, escHtml, sendTelegramMessage, telegramConfigured, webhookProblem } from "./telegram";
import { getLiveValuations, getQuotes } from "./quotes";
import { LIVE_TYPES } from "./daily-pnl";
import type { JobReport } from "./jobs";
import type { SummaryReport } from "./daily-summary";
import { scheduleStatus } from "./summary-schedule";

/**
 * Watch over the automatic work: the two Vercel Cron tasks, the Yahoo Finance quotes and the
 * Telegram bot. Each cron run checks the other one, so a task that silently stops is noticed
 * the next morning or evening, and an administrator's visit checks both if neither runs.
 */

export type HealthIssue = { code: string; level: "error" | "warn"; title: string; detail?: string };
export type HealthCheck = { name: string; status: "ok" | HealthIssue["level"]; detail: string };
export type HealthResult = { checkedAt: string; issues: HealthIssue[]; checks: HealthCheck[] };

/** Heartbeats written by the cron routes only (a manual run from Definições does not count). */
export const CRON_DAILY_KEY = "cronDailyAt";
export const CRON_EVENING_KEY = "cronEveningAt";
const STATE_KEY = "healthState";
const CHECKED_KEY = "healthCheckedAt";

const H = 3600e3;
/** Both tasks run once a day: more than 26 hours without one means it failed. */
const MAX_GAP = 26 * H;

const when = (d: Date) => d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ago = (d: Date) => {
  const h = (Date.now() - d.getTime()) / H;
  return h < 48 ? `há ${Math.round(h)} h` : `há ${Math.round(h / 24)} dias`;
};

async function setting(key: string) {
  return (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;
}
async function saveSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
function parse<T>(json: string | null): T | null {
  try {
    return json ? (JSON.parse(json) as T) : null;
  } catch {
    return null;
  }
}

export async function markCronRun(key: typeof CRON_DAILY_KEY | typeof CRON_EVENING_KEY) {
  await saveSetting(key, new Date().toISOString());
}

/** A step result that means something did not work (errors and missing configuration). */
const BAD_STEP = /erro|falh|não configurado|sem destinatários|não definido/i;

/**
 * Runs every check. `probe` also asks Yahoo for fresh quotes and Telegram for the webhook state
 * (a few seconds); without it only what is stored is looked at.
 */
export async function checkHealth(opts: { probe?: boolean } = {}): Promise<HealthResult> {
  const issues: HealthIssue[] = [];
  const checks: HealthCheck[] = [];
  const now = Date.now();
  const add = (name: string, issue: HealthIssue | null, okDetail: string) => {
    if (issue) issues.push(issue);
    checks.push({ name, status: issue ? issue.level : "ok", detail: issue ? `${issue.title}${issue.detail ? ` — ${issue.detail}` : ""}` : okDetail });
  };

  // ---- scheduled tasks ----
  const cronSecret = !!process.env.CRON_SECRET;
  add(
    "Agendamento (Vercel Cron)",
    cronSecret ? null : { code: "cron-secret", level: "error", title: "As tarefas agendadas não correm", detail: "falta CRON_SECRET no Vercel (texto aleatório); sem ele o Vercel Cron é recusado." },
    "CRON_SECRET definido",
  );

  const [dailyAt, eveningAt, jobRow, summaryRow] = await Promise.all([setting(CRON_DAILY_KEY), setting(CRON_EVENING_KEY), setting("lastJobReport"), setting("lastSummaryReport")]);
  const job = parse<JobReport>(jobRow);
  const summary = parse<SummaryReport>(summaryRow);

  const beat = (name: string, code: string, label: string, at: string | null, fallback: string | null) => {
    const last = at ? new Date(at) : fallback ? new Date(fallback) : null;
    if (!last) return add(name, { code, level: "warn", title: `${label}: ainda sem registo de execução`, detail: "normal logo após a instalação; se continuar, confirme os Cron Jobs no Vercel." }, "");
    add(name, now - last.getTime() > MAX_GAP ? { code, level: "error", title: `${label} não corre desde ${when(last)}`, detail: `${ago(last)}. Veja Vercel → projeto → Cron Jobs / Logs.` } : null, `última execução ${when(last)}`);
  };
  beat("Tarefa diária (07:00 UTC)", "cron-daily", "A tarefa diária das 07:00", dailyAt, job?.ranAt ?? null);
  beat("Tarefa da noite (21:30 UTC)", "cron-evening", "A tarefa da noite (resumo diário)", eveningAt, summary?.ranAt ?? null);

  // ---- what the last runs reported ----
  const fresh = (iso?: string) => !!iso && now - new Date(iso).getTime() < 30 * H;
  const badSteps = job && fresh(job.ranAt) ? job.steps.filter((st) => BAD_STEP.test(st.result)) : [];
  add(
    "Passos da tarefa diária",
    badSteps.length ? { code: "job-steps", level: "warn", title: `Tarefa diária com ${badSteps.length} problema(s)`, detail: badSteps.map((st) => `${st.name}: ${st.result}`).join("; ").slice(0, 600) } : null,
    job ? `${job.steps.length} passos sem erros` : "—",
  );
  const summaryErrors = summary && fresh(summary.ranAt) ? summary.errors : [];
  add(
    "Resumo do fim do dia",
    summaryErrors.length ? { code: "summary-errors", level: "warn", title: "O resumo do fim do dia teve erros", detail: summaryErrors.join("; ").slice(0, 400) } : null,
    summary ? `último: ${summary.sent} e-mail(s)${summary.telegram ? `, ${summary.telegram} Telegram` : ""}${summary.skipped.length && !summary.sent && !summary.telegram ? ` (${summary.skipped[0]})` : ""}` : "—",
  );

  // ---- quotes ----
  const assets = await prisma.asset.findMany({ where: { active: true, type: { in: [...LIVE_TYPES] } }, select: { id: true, name: true } });
  if (opts.probe) {
    const inst = await prisma.instrument.findMany({ where: { symbol: { not: null } }, orderBy: { updatedAt: "desc" }, take: 3, select: { symbol: true } });
    if (inst.length) {
      const r = await getQuotes(inst.map((i) => i.symbol!), { force: true });
      add("Yahoo Finance", r.error ? { code: "quotes-down", level: "error", title: "O Yahoo Finance não está a devolver cotações", detail: r.error } : null, `responde (${inst.length} cotações pedidas agora)`);
    }
  }
  if (assets.length) {
    const live = await getLiveValuations(assets.map((a) => a.id), { resolve: false });
    const noSymbol: string[] = [];
    const stuck: string[] = [];
    for (const v of live.values()) {
      for (const p of v.positions) {
        if (!p.key) continue;
        if (!p.symbol) noSymbol.push(p.name);
        else if (p.quoteTime && now - p.quoteTime.getTime() > 7 * 24 * H) stuck.push(p.name);
      }
    }
    const list = (xs: string[]) => `${[...new Set(xs)].slice(0, 5).join(", ")}${xs.length > 5 ? ` e mais ${xs.length - 5}` : ""}`;
    add(
      "Cotações das posições",
      noSymbol.length
        ? { code: "quotes-nosymbol", level: "warn", title: `${noSymbol.length} posição(ões) sem símbolo do Yahoo`, detail: `${list(noSymbol)}. Corrija em Administração → Cotações.` }
        : stuck.length
          ? { code: "quotes-stuck", level: "warn", title: `${stuck.length} cotação(ões) paradas há mais de 7 dias`, detail: `${list(stuck)}. O símbolo pode ter mudado (Administração → Cotações).` }
          : null,
      `${[...live.values()].reduce((s, v) => s + v.quoted, 0)} posições com cotação`,
    );
  }

  // ---- personal summary times: need a wake-up every few minutes besides the two daily crons ----
  const sched = await scheduleStatus();
  if (sched.people) {
    const ext = sched.externalAt ? new Date(sched.externalAt) : null;
    add(
      "Resumos agendados",
      !ext || now - ext.getTime() > 3 * H
        ? { code: "schedule-wakeup", level: "warn", title: `${sched.people} pessoa(s) com horários do resumo, mas sem despertador${ext ? ` desde ${when(ext)}` : ""}`, detail: "Sem ele só saem os horários perto das 08:00 e das 22:30 ou quando alguém abre a aplicação. Configure em cron-job.org (grátis) uma chamada a cada 5–15 minutos a /api/cron/schedule com o cabeçalho Authorization: Bearer CRON_SECRET (Administração → Definições → Resumo diário)." }
        : null,
      `${sched.people} pessoa(s) com horários · despertador ${ago(ext!)}`,
    );
  }

  // ---- Telegram ----
  if (telegramConfigured() && opts.probe) {
    const linked = await prisma.user.count({ where: { telegramChatId: { not: null } } });
    if (linked) {
      const problem = await webhookProblem();
      add("Bot do Telegram", problem ? { code: "telegram-webhook", level: "warn", title: "O bot do Telegram não recebe mensagens", detail: problem } : null, `${linked} conversa(s) ligada(s), webhook a funcionar`);
    }
  }

  return { checkedAt: new Date().toISOString(), issues, checks };
}

type OpenIssue = { title: string; level: HealthIssue["level"]; since: string; alertedAt: string };
type State = { open: Record<string, OpenIssue> };

/** Sends a message to the administrators: Telegram if any is linked, otherwise e-mail. */
async function notifyAdmins(tgHtml: string, subject: string, mailHtml: string): Promise<string> {
  if (telegramConfigured()) {
    const chats = await chatsForUsers({ admins: true });
    if (chats.length) {
      const url = appUrl();
      const results = await Promise.all(chats.map((c) => sendTelegramMessage(c, tgHtml, url ? { buttonText: "Abrir Definições", buttonUrl: `${url}/admin/definicoes` } : {})));
      const ok = results.filter((r) => r.ok).length;
      if (ok) return `Telegram (${ok} conversa(s))`;
    }
  }
  const s = await getSettings();
  const to = alertRecipients(s);
  if (!to.length || !emailConfigured()) return "sem canal: ligue o Telegram de um administrador ou configure o e-mail dos alertas";
  const r = await sendEmail({ to, subject, html: emailLayout(subject, mailHtml, appUrl()) });
  return r.ok ? `e-mail para ${to.join(", ")}` : `falhou: ${r.error}`;
}

/**
 * Checks and tells the administrators what changed: new problems at once, errors again every
 * 24 hours while they last (warnings only once), and a note when a problem is gone.
 */
export async function runHealthCheck(opts: { probe?: boolean; source: string }): Promise<HealthResult & { notified: string | null }> {
  const result = await checkHealth({ probe: opts.probe });
  const s = await getSettings();
  const state = parse<State>(await setting(STATE_KEY)) ?? { open: {} };
  const nowIso = result.checkedAt;
  const toSend: HealthIssue[] = [];
  const open: State["open"] = {};
  for (const i of result.issues) {
    const prev = state.open[i.code];
    const due = !prev || (i.level === "error" && Date.now() - new Date(prev.alertedAt).getTime() > 24 * H);
    if (due) toSend.push(i);
    open[i.code] = { title: i.title, level: i.level, since: prev?.since ?? nowIso, alertedAt: due ? nowIso : prev.alertedAt };
  }
  // without probing, the probe-only checks keep their last state
  if (!opts.probe) for (const code of ["quotes-down", "telegram-webhook"]) if (state.open[code] && !open[code]) open[code] = state.open[code];
  const resolved = Object.entries(state.open).filter(([code]) => !open[code]);

  let notified: string | null = null;
  if (s.healthAlerts && (toSend.length || resolved.length)) {
    const icon = (l: HealthIssue["level"]) => (l === "error" ? "🔴" : "🟡");
    const tg = [
      `${toSend.some((i) => i.level === "error") ? "🚨" : toSend.length ? "⚠️" : "✅"} <b>Pecúlio · vigilância</b>`,
      ...toSend.map((i) => `${icon(i.level)} <b>${escHtml(i.title)}</b>${state.open[i.code] ? " (continua)" : ""}${i.detail ? `\n${escHtml(i.detail)}` : ""}`),
      ...resolved.map(([, o]) => `✅ Resolvido: ${escHtml(o.title)}`),
    ].join("\n\n");
    const mail = [
      ...toSend.map((i) => `<p><b>${escHtml(i.title)}</b>${i.detail ? `<br>${escHtml(i.detail)}` : ""}</p>`),
      ...resolved.map(([, o]) => `<p>✅ Resolvido: ${escHtml(o.title)}</p>`),
    ].join("");
    const subject = toSend.length ? `Pecúlio · ${toSend[0].title}${toSend.length > 1 ? ` (+${toSend.length - 1})` : ""}` : "Pecúlio · problema resolvido";
    notified = await notifyAdmins(tg, subject, mail);
  }
  await saveSetting(STATE_KEY, JSON.stringify({ open } satisfies State));
  await saveSetting(CHECKED_KEY, JSON.stringify({ at: nowIso, source: opts.source, issues: result.issues.length, notified }));
  return { ...result, notified };
}

/** Called on an administrator's visit: checks at most every 6 hours, in case neither cron runs. */
export async function healthCheckIfDue() {
  const last = parse<{ at: string }>(await setting(CHECKED_KEY));
  if (last && Date.now() - new Date(last.at).getTime() < 6 * H) return;
  await runHealthCheck({ source: "visita de administrador" });
}

export async function lastHealthCheck() {
  return parse<{ at: string; source: string; issues: number; notified: string | null }>(await setting(CHECKED_KEY));
}

/** Problems still open since the last check (used for those only verified when probing). */
export async function openIssues() {
  return parse<State>(await setting(STATE_KEY))?.open ?? {};
}
