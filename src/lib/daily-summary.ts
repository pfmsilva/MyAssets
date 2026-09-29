import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { getScope } from "./scope";
import { getDailyPnl } from "./daily-pnl";
import { appUrl, emailConfigured, emailLayout, sendEmail, type Attachment } from "./email";
import { lineChartPng } from "./chart-png";
import { getSettings } from "./settings";
import { fmtEur } from "./format";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const signed = (v: number, digits = 0) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmtEur(Math.abs(v), digits)}`;
/** Short label for the bars ("+4,4 k€"), so seven of them fit side by side on a phone. */
const compact = (v: number) => {
  const a = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} M€`;
  if (a >= 1000) return `${sign}${(a / 1000).toLocaleString("pt-PT", { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} k€`;
  return `${sign}${Math.round(a)} €`;
};
const tone = (v: number) => (v > 0 ? "#008300" : v < 0 ? "#e34948" : "#52514e");
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * Vertical bar chart drawn with table cells: e-mail clients do not run scripts and most of them
 * strip SVG, but every one of them shows a coloured table cell.
 */
function barsHtml(points: { label: string; sub: string; value: number | null }[], color: (v: number) => string, height = 110) {
  const values = points.map((p) => p.value ?? 0);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const up = Math.round((max / span) * height);
  const down = height - up;
  const bar = (h: number, c: string) => `<div style="height:${Math.max(1, Math.round(h))}px;background:${c};border-radius:2px;font-size:0;line-height:0">&nbsp;</div>`;
  const cellW = Math.floor(100 / points.length);
  const cols = (fn: (p: (typeof points)[number]) => string, style: string) => points.map((p) => `<td width="${cellW}%" style="${style}">${fn(p)}</td>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed">
  <tr>${cols((p) => (p.value === null ? `<span style="font-size:11px;color:#c9c8c3">—</span>` : `<span style="font-size:10px;color:${color(p.value)};white-space:nowrap">${compact(p.value)}</span>`), "text-align:center;padding:0 1px 4px")}</tr>
  ${up > 0 ? `<tr>${cols((p) => (p.value !== null && p.value > 0 ? bar((p.value / span) * height, color(p.value)) : ""), `height:${up}px;vertical-align:bottom;padding:0 5px`)}</tr>` : ""}
  <tr>${cols(() => "", "height:1px;border-top:1px solid #c9c8c3;font-size:0;line-height:0")}</tr>
  ${down > 0 ? `<tr>${cols((p) => (p.value !== null && p.value < 0 ? bar((-p.value / span) * height, color(p.value)) : ""), `height:${down}px;vertical-align:top;padding:0 5px`)}</tr>` : ""}
  <tr>${cols((p) => `<div style="font-size:11px;color:#52514e">${p.label}</div><div style="font-size:10px;color:#8a8985">${p.sub}</div>`, "text-align:center;padding-top:4px")}</tr>
</table>`;
}

/** Dates and values under the line chart, one column per point (each point is centred in its column). */
function labelsHtml(points: { label: string; sub: string; value: number | null }[], color: (v: number) => string) {
  const cellW = Math.floor(100 / points.length);
  const cells = points
    .map(
      (p) => `<td width="${cellW}%" style="text-align:center;padding-top:4px">
      <div style="font-size:10px;color:${p.value === null ? "#c9c8c3" : color(p.value)};white-space:nowrap">${p.value === null ? "—" : compact(p.value)}</div>
      <div style="font-size:11px;color:#52514e">${p.label}</div><div style="font-size:10px;color:#8a8985">${p.sub}</div></td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed;max-width:556px"><tr>${cells}</tr></table>`;
}

const CUMULATIVE_CID = "ganho-acumulado";

export type SummaryContent = { subject: string; html: string; text: string; attachments: Attachment[] };

/** The end-of-day e-mail for one user: last 7 days of the quoted portfolios, day by day. */
export async function buildDailySummary(user: { id: string; role: Role; name?: string | null }): Promise<SummaryContent | null> {
  const scope = await getScope(user);
  const pnl = await getDailyPnl({ assetIds: scope.assetIds, days: 7, group: "day", onlyQuoted: true });
  if (!pnl.points.length) return null;
  // the seven calendar days ending today; a day without a record shows empty and its change
  // shows up on the next day that has one
  const todayIso = new Date().toISOString().slice(0, 10);
  const byDate = new Map(pnl.points.map((p) => [p.date, p]));
  let cum = 0;
  let lastValue = pnl.points.find((p) => p.date < new Date(Date.parse(todayIso) - 6 * 86400e3).toISOString().slice(0, 10))?.value ?? null;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.parse(todayIso) - (6 - i) * 86400e3).toISOString().slice(0, 10);
    const p = byDate.get(date);
    if (p) {
      cum = Math.round((cum + p.pnl) * 100) / 100;
      lastValue = p.value;
    }
    return { date, label: `${date.slice(8, 10)}/${date.slice(5, 7)}`, weekday: WEEKDAYS[new Date(date).getUTCDay()], pnl: p?.pnl ?? null, cum, value: p?.value ?? lastValue, live: !!p?.live };
  });
  if (!days.some((d) => d.pnl !== null)) return null;
  const week = days.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const today = pnl.todayLive ?? days.at(-1)?.pnl ?? 0;
  const value = pnl.assets.filter((a) => a.live).reduce((s, a) => s + a.value, 0);
  const url = appUrl();
  const dateLabel = new Date().toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long" });
  const quotesAt = pnl.quotesAt ? pnl.quotesAt.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }) : null;

  const kpi = (label: string, v: string, color = "#0b0b0b") => `<td width="33%" style="background:#f0efec;border-radius:8px;padding:10px 12px"><div style="font-size:11px;color:#8a8985;text-transform:uppercase;letter-spacing:.3px">${label}</div><div style="font-size:20px;font-weight:600;color:${color};white-space:nowrap">${v}</div></td>`;
  const body = `
<p style="margin:0 0 12px">Olá${user.name ? ` ${esc(user.name.split(" ")[0])}` : ""}, este é o resumo das carteiras com cotação no fim de ${esc(dateLabel)}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate;margin:0 -6px 12px"><tr>
${kpi("Hoje", signed(today), tone(today))}${kpi("Últimos 7 dias", signed(week), tone(week))}${kpi("Carteiras em direto", fmtEur(value, 0))}
</tr></table>
<h3 style="font-size:14px;margin:18px 0 8px">Variação por dia</h3>
${barsHtml(days.map((p) => ({ label: p.label, sub: p.weekday, value: p.pnl })), (v) => (v >= 0 ? "#1baf7a" : "#e34948"))}
<h3 style="font-size:14px;margin:22px 0 8px">Ganho acumulado nos 7 dias</h3>
<img src="cid:${CUMULATIVE_CID}" width="556" alt="Ganho acumulado: ${days.map((p) => `${p.label} ${compact(p.cum)}`).join(", ")}" style="display:block;width:100%;max-width:556px;height:auto;border:0" />
${labelsHtml(days.map((p) => ({ label: p.label, sub: p.weekday, value: p.pnl === null ? null : p.cum })), (v) => tone(v))}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:20px;font-size:13px">
  <tr style="color:#8a8985;font-size:11px;text-transform:uppercase"><td style="padding:4px 0">Dia</td><td align="right" style="padding-left:6px">Var.</td><td align="right" style="padding-left:6px">Acum.</td><td align="right" style="padding-left:6px">Carteiras</td></tr>
  ${[...days].reverse().map((p) => `<tr style="border-top:1px solid #e4e3df"><td style="padding:5px 0;white-space:nowrap">${p.weekday} ${p.label}${p.live ? " <span style=\"color:#8a8985;font-size:11px\">(direto)</span>" : ""}</td>${p.pnl === null ? `<td align="right" style="color:#8a8985;padding-left:6px">—</td><td align="right" style="color:#8a8985;padding-left:6px">—</td>` : `<td align="right" style="color:${tone(p.pnl)};padding-left:6px;white-space:nowrap">${signed(p.pnl)}</td><td align="right" style="color:${tone(p.cum)};padding-left:6px;white-space:nowrap">${signed(p.cum)}</td>`}<td align="right" style="padding-left:6px;white-space:nowrap">${p.value !== null ? fmtEur(p.value, 0) : "—"}</td></tr>`).join("")}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:18px;font-size:13px">
  <tr style="color:#8a8985;font-size:11px;text-transform:uppercase"><td style="padding:4px 0">Carteira</td><td align="right">Em direto</td><td align="right">Hoje</td></tr>
  ${pnl.assets.filter((a) => a.live).map((a) => `<tr style="border-top:1px solid #e4e3df"><td style="padding:5px 0">${esc(a.name)}</td><td align="right">${fmtEur(a.value, 0)}</td><td align="right" style="color:${tone(a.today ?? 0)}">${signed(a.today ?? 0)}</td></tr>`).join("")}
</table>
<p style="margin:18px 0 0"><a href="${url}/rentabilidade?dias=7&amp;cot=1" style="display:inline-block;background:#2a78d6;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px;font-weight:600">Ver no Pecúlio</a></p>
<p style="margin:12px 0 0;font-size:12px;color:#8a8985">Cada barra é a variação das carteiras nesse dia, descontando depósitos e levantamentos; a de hoje é a variação às cotações do Yahoo Finance${quotesAt ? ` das ${quotesAt}` : ""}.${days.some((d) => d.pnl === null) ? " Nos dias sem registo (sem valor gravado nesse dia) a variação aparece no dia seguinte." : ""}</p>`;

  const text = [
    `Resumo do dia (${dateLabel})`,
    `Hoje: ${signed(today)} · Últimos 7 dias: ${signed(week)} · Carteiras em direto: ${fmtEur(value, 0)}`,
    "",
    ...[...days].reverse().map((p) => `${p.weekday} ${p.label}: ${p.pnl === null ? "sem registo" : `${signed(p.pnl)} (acumulado ${signed(p.cum)})`}`),
    "",
    `${url}/rentabilidade?dias=7&cot=1`,
  ].join("\n");
  // the cumulative line is an image embedded in the message (e-mail clients do not draw SVG);
  // days without a record keep the line flat, as in the app
  const chart = lineChartPng(days.map((p) => p.cum), { width: 556, height: 150 });
  return {
    subject: `Pecúlio · hoje ${signed(today)} · 7 dias ${signed(week)}`,
    html: emailLayout("Resumo do dia", body, url),
    text,
    attachments: [{ filename: "ganho-acumulado.png", content: chart, contentId: CUMULATIVE_CID }],
  };
}

export type SummaryReport = { ranAt: string; sent: number; skipped: string[]; errors: string[] };

/** Sends the end-of-day summary to the chosen users, once a day each. */
export async function runDailySummary(opts: { force?: boolean; onlyUserId?: string } = {}): Promise<SummaryReport> {
  const report: SummaryReport = { ranAt: new Date().toISOString(), sent: 0, skipped: [], errors: [] };
  const s = await getSettings();
  if (!opts.onlyUserId && s.dailySummary === "off") return { ...report, skipped: ["resumo diário desativado"] };
  if (!emailConfigured()) return { ...report, errors: ["e-mail não configurado (RESEND_API_KEY, ALERTS_FROM)"] };
  const lisbonDay = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/Lisbon", weekday: "short" });
  if (!opts.force && !s.dailySummaryWeekends && (lisbonDay === "Sat" || lisbonDay === "Sun")) return { ...report, skipped: ["fim de semana"] };

  const users = await prisma.user.findMany({
    where: opts.onlyUserId ? { id: opts.onlyUserId } : s.dailySummary === "admins" ? { role: "ADMIN" } : {},
    select: { id: true, email: true, name: true, role: true },
  });
  const day = new Date().toISOString().slice(0, 10);
  for (const u of users) {
    const key = `summary:${u.id}:${day}`;
    if (!opts.force && (await prisma.alertSent.findUnique({ where: { key } }))) {
      report.skipped.push(`${u.email}: já enviado hoje`);
      continue;
    }
    try {
      const content = await buildDailySummary(u);
      if (!content) {
        report.skipped.push(`${u.email}: sem carteiras com cotação`);
        continue;
      }
      const r = await sendEmail({ to: [u.email], subject: content.subject, html: content.html, text: content.text, attachments: content.attachments });
      if (!r.ok) {
        report.errors.push(`${u.email}: ${r.error}`);
        continue;
      }
      await prisma.alertSent.upsert({ where: { key }, create: { key }, update: { sentAt: new Date() } });
      report.sent++;
    } catch (e) {
      report.errors.push(`${u.email}: ${e instanceof Error ? e.message.slice(0, 100) : "erro"}`);
    }
  }
  return report;
}
