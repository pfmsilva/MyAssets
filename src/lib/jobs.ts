import { prisma } from "./prisma";
import { getSettings, alertRecipients } from "./settings";
import { emailConfigured, emailLayout, sendEmail } from "./email";
import { buildBackupJson } from "./export";
import { getCurrentValues } from "./analytics";
import { getLiveValuations } from "./quotes";
import { getBudgetOverview } from "./budget";
import { fmtDate, fmtEur, fmtPct } from "./format";

export type JobReport = { ranAt: string; steps: { name: string; result: string }[] };

const appUrl = () => process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

async function alreadySent(key: string, withinDays: number) {
  const row = await prisma.alertSent.findUnique({ where: { key } });
  return !!row && Date.now() - row.sentAt.getTime() < withinDays * 86400e3;
}
async function markSent(key: string) {
  await prisma.alertSent.upsert({ where: { key }, create: { key }, update: { sentAt: new Date() } });
}

/** Removes activity rows older than the configured retention. */
export async function purgeActivity(days: number) {
  if (!days || days <= 0) return 0;
  const r = await prisma.activityLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86400e3) } } });
  return r.count;
}

/** Saves today's live value of portfolios with quotes as a snapshot (source DERIVED), keeping imports untouched. */
export async function saveDailySnapshots() {
  const values = await getCurrentValues();
  const ids = values.filter((a) => a.type === "BROKERAGE" || a.type === "CRYPTO").map((a) => a.id);
  const live = await getLiveValuations(ids, { resolve: true });
  const today = new Date(new Date().toISOString().slice(0, 10));
  let saved = 0;
  for (const [assetId, v] of live) {
    if (v.quoted === 0 || v.quoted < v.quotable) continue; // only when every quotable position has a quote
    const existing = await prisma.snapshot.findUnique({ where: { assetId_date: { assetId, date: today } } });
    if (existing && existing.source !== "DERIVED") continue;
    await prisma.snapshot.upsert({ where: { assetId_date: { assetId, date: today } }, create: { assetId, date: today, value: Math.round(v.liveTotal * 100) / 100, source: "DERIVED", note: "Valor diário (cotações Yahoo)" }, update: { value: Math.round(v.liveTotal * 100) / 100 } });
    saved++;
  }
  return { saved, assets: live.size };
}

/** Daily job: retention, daily snapshots, alerts and weekly backup. `dryRun` builds alerts without sending. */
export async function runDailyJobs(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<JobReport> {
  const s = await getSettings();
  const steps: JobReport["steps"] = [];
  const to = alertRecipients(s);
  const url = appUrl();

  // 1. retention
  try {
    const n = await purgeActivity(s.activityRetentionDays);
    steps.push({ name: "Retenção do registo de atividade", result: s.activityRetentionDays ? `${n} registos com mais de ${s.activityRetentionDays} dias apagados` : "desativada" });
  } catch (e) {
    steps.push({ name: "Retenção do registo de atividade", result: `erro: ${e instanceof Error ? e.message : e}` });
  }

  // 2. daily snapshots
  if (s.dailySnapshot) {
    try {
      const r = await saveDailySnapshots();
      steps.push({ name: "Valor diário das carteiras", result: `${r.saved} de ${r.assets} carteiras registadas` });
    } catch (e) {
      steps.push({ name: "Valor diário das carteiras", result: `erro: ${e instanceof Error ? e.message : e}` });
    }
  }

  // 3. alerts
  const alerts: { key: string; title: string; html: string; repeatDays: number }[] = [];
  const values = await getCurrentValues();
  if (s.alertStaleDays > 0) {
    const stale = values.filter((a) => !a.date || Date.now() - new Date(a.date).getTime() > s.alertStaleDays * 86400e3);
    for (const a of stale) alerts.push({ key: `stale:${a.id}`, title: `${a.name} sem atualização`, html: `<b>${a.name}</b> não tem valor registado há mais de ${s.alertStaleDays} dias (último: ${a.date ? fmtDate(a.date) : "nunca"}).`, repeatDays: 7 });
  }
  if (s.alertMovePct > 0) {
    const ids = values.filter((a) => a.type === "BROKERAGE" || a.type === "CRYPTO").map((a) => a.id);
    const live = await getLiveValuations(ids, { resolve: false });
    for (const [assetId, v] of live) {
      if (v.dayChangePct !== null && Math.abs(v.dayChangePct) * 100 >= s.alertMovePct) {
        const name = values.find((a) => a.id === assetId)?.name ?? assetId;
        alerts.push({ key: `move:${assetId}:${new Date().toISOString().slice(0, 10)}`, title: `${name} ${v.dayChangePct >= 0 ? "subiu" : "desceu"} ${fmtPct(Math.abs(v.dayChangePct))} hoje`, html: `<b>${name}</b>: ${v.dayChangeEur >= 0 ? "+" : "-"}${fmtEur(Math.abs(v.dayChangeEur))} (${v.dayChangePct >= 0 ? "+" : ""}${fmtPct(v.dayChangePct)}) no dia; valor em direto ${fmtEur(v.liveTotal)}.`, repeatDays: 1 });
      }
    }
  }
  if (s.alertBudget) {
    const month = new Date().toISOString().slice(0, 7);
    const b = await getBudgetOverview(month);
    for (const r of b.rows.filter((r) => r.status === "over")) alerts.push({ key: `budget:${r.categoryId}:${month}`, title: `Orçamento de ${r.name} excedido`, html: `<b>${r.name}</b>: ${fmtEur(r.spent, 0)} gastos este mês, limite ${fmtEur(r.limit!, 0)} (excedido em ${fmtEur(r.spent - r.limit!, 0)}).`, repeatDays: 31 });
  }
  const pending = [];
  for (const a of alerts) if (opts.force || !(await alreadySent(a.key, a.repeatDays))) pending.push(a);
  if (!pending.length) steps.push({ name: "Alertas", result: `${alerts.length} condições verificadas, nada novo a enviar` });
  else if (opts.dryRun) steps.push({ name: "Alertas (simulação)", result: pending.map((a) => a.title).join("; ") });
  else if (!to.length) steps.push({ name: "Alertas", result: `${pending.length} alerta(s) mas sem destinatários configurados` });
  else if (!emailConfigured()) steps.push({ name: "Alertas", result: `${pending.length} alerta(s) mas e-mail não configurado (RESEND_API_KEY / ALERTS_FROM)` });
  else {
    const html = emailLayout("Alertas", `<ul>${pending.map((a) => `<li style="margin-bottom:8px">${a.html}</li>`).join("")}</ul>`, url);
    const r = await sendEmail({ to, subject: `Pecúlio · ${pending.length === 1 ? pending[0].title : `${pending.length} alertas`}`, html });
    if (r.ok) for (const a of pending) await markSent(a.key);
    steps.push({ name: "Alertas", result: r.ok ? `${pending.length} alerta(s) enviados para ${to.join(", ")}` : `erro no envio: ${r.error}` });
  }

  // 4. weekly backup (Mondays)
  if (s.backupWeeklyEmail && (opts.force || new Date().getUTCDay() === 1)) {
    if (!to.length) steps.push({ name: "Backup semanal", result: "ativo mas sem destinatários configurados" });
    else if (!emailConfigured()) steps.push({ name: "Backup semanal", result: "ativo mas e-mail não configurado (RESEND_API_KEY / ALERTS_FROM)" });
    else if (opts.dryRun) steps.push({ name: "Backup semanal (simulação)", result: "seria enviado" });
    else {
      const buf = await buildBackupJson();
      const r = await sendEmail({ to, subject: `Pecúlio · backup ${new Date().toISOString().slice(0, 10)}`, html: emailLayout("Backup semanal", `<p>Em anexo o backup completo dos dados (${(buf.length / 1024).toFixed(0)} KB, JSON). Guarde-o num local seguro.</p>`, url), attachments: [{ filename: `peculio-backup-${new Date().toISOString().slice(0, 10)}.json`, content: buf }] });
      steps.push({ name: "Backup semanal", result: r.ok ? `enviado para ${to.join(", ")}` : `erro: ${r.error}` });
    }
  }
  return { ranAt: new Date().toISOString(), steps };
}
