import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings, polBeneficiaries, polRecipients, Settings } from "./settings";
import { appUrl, emailConfigured, emailLayout, sendEmail } from "./email";
import { buildFamilyReport } from "./report";
import { fmtDate } from "./format";

export type Step = { name: string; result: string };

const DAY = 86400e3;
const days = (n: number) => n * DAY;
const addDays = (d: Date, n: number) => new Date(d.getTime() + days(n));
export const confirmUrl = (token: string) => `${appUrl()}/prova-de-vida/${token}`;

export type PolState = {
  settings: Settings;
  enabled: boolean;
  configError: string | null;
  openCheck: Awaited<ReturnType<typeof prisma.proofOfLifeCheck.findFirst>>;
  releasedCheck: Awaited<ReturnType<typeof prisma.proofOfLifeCheck.findFirst>>;
  lastConfirmedAt: Date | null;
  remainingDays: number | null; // days left to confirm the open cycle
  nextEmailAt: Date | null;
  history: Awaited<ReturnType<typeof prisma.proofOfLifeCheck.findMany>>;
};

function configError(s: Settings): string | null {
  if (!polRecipients(s).length) return "Indique pelo menos um e-mail que receba o pedido de prova de vida.";
  if (!polBeneficiaries(s).length) return "Indique pelo menos um e-mail que receba os acessos.";
  if (!emailConfigured()) return "Envio de e-mail não configurado (RESEND_API_KEY / ALERTS_FROM).";
  if (!appUrl()) return "Defina APP_URL para que o link de confirmação seja válido.";
  return null;
}

export async function getPolState(): Promise<PolState> {
  const settings = await getSettings();
  const [latest, history] = await Promise.all([
    prisma.proofOfLifeCheck.findFirst({ orderBy: { sentAt: "desc" } }),
    prisma.proofOfLifeCheck.findMany({ orderBy: { sentAt: "desc" }, take: 10 }),
  ]);
  const openCheck = latest && !latest.confirmedAt && !latest.triggeredAt ? latest : null;
  const releasedCheck = latest?.triggeredAt && !latest.resolvedAt ? latest : null;
  const lastConfirmed = await prisma.proofOfLifeCheck.findFirst({ where: { confirmedAt: { not: null } }, orderBy: { confirmedAt: "desc" } });
  const anchor = latest?.confirmedAt ?? latest?.resolvedAt ?? null;
  return {
    settings,
    enabled: settings.polEnabled,
    configError: settings.polEnabled ? configError(settings) : null,
    openCheck,
    releasedCheck,
    lastConfirmedAt: lastConfirmed?.confirmedAt ?? null,
    remainingDays: openCheck ? Math.max(0, Math.ceil((openCheck.dueAt.getTime() - Date.now()) / DAY)) : null,
    nextEmailAt: openCheck || releasedCheck ? null : anchor ? addDays(anchor, settings.polIntervalDays) : new Date(),
    history,
  };
}

/** Sends the proof-of-life e-mail and opens a new cycle. */
async function sendCheck(s: Settings): Promise<Step> {
  const to = polRecipients(s);
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const dueAt = addDays(now, s.polGraceDays);
  const check = await prisma.proofOfLifeCheck.create({ data: { token, sentAt: now, dueAt, recipients: to.join(", ") } });
  const url = confirmUrl(token);
  const html = emailLayout(
    "Prova de vida",
    `<p>Este é o pedido periódico de prova de vida do Pecúlio.</p>
     <p><b>Confirme até ${fmtDate(dueAt)}.</b> Basta uma pessoa confirmar; a seguir o pedido só volta daqui a ${s.polIntervalDays} dias.</p>
     <p style="margin:24px 0"><a href="${url}" style="background:#2a78d6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar prova de vida</a></p>
     <p style="font-size:12px;color:#52514e">Se ninguém confirmar até ${fmtDate(dueAt)}, os acessos à aplicação e o relatório do património são enviados para: ${polBeneficiaries(s).join(", ")}.</p>
     <p style="font-size:12px;color:#8a8985">Se o botão não funcionar, abra: ${url}</p>`,
    appUrl(),
  );
  const r = await sendEmail({ to, subject: `Pecúlio · prova de vida (confirme até ${fmtDate(dueAt)})`, html });
  if (!r.ok) {
    await prisma.proofOfLifeCheck.delete({ where: { id: check.id } });
    return { name: "Prova de vida", result: `falha no envio: ${r.error}` };
  }
  return { name: "Prova de vida", result: `pedido enviado para ${to.join(", ")}; confirmação até ${fmtDate(dueAt)}` };
}

async function sendReminder(s: Settings, check: NonNullable<PolState["openCheck"]>, remaining: number): Promise<Step> {
  const to = polRecipients(s);
  const url = confirmUrl(check.token);
  const html = emailLayout(
    "Prova de vida — lembrete",
    `<p><b>Faltam ${remaining} dia(s)</b> para confirmar a prova de vida (prazo: ${fmtDate(check.dueAt)}).</p>
     <p style="margin:24px 0"><a href="${url}" style="background:#eda100;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Confirmar agora</a></p>
     <p style="font-size:12px;color:#52514e">Sem confirmação, os acessos são entregues a ${polBeneficiaries(s).join(", ")}.</p>
     <p style="font-size:12px;color:#8a8985">${url}</p>`,
    appUrl(),
  );
  const r = await sendEmail({ to, subject: `Pecúlio · lembrete de prova de vida (${remaining} dia(s))`, html });
  if (r.ok) await prisma.proofOfLifeCheck.update({ where: { id: check.id }, data: { remindersSent: { increment: 1 } } });
  return { name: "Prova de vida", result: r.ok ? `lembrete enviado (${remaining} dia(s) para o prazo)` : `falha no lembrete: ${r.error}` };
}

/** Grants access to the beneficiaries and e-mails them the app link plus the assets report. */
export async function releaseAccess(s: Settings, check: NonNullable<PolState["openCheck"]>): Promise<Step> {
  const beneficiaries = polBeneficiaries(s);
  const role = s.polBeneficiaryRole as Role;
  for (const email of beneficiaries) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // never lower an existing access level
      const rank = { VIEWER: 1, EDITOR: 2, ADMIN: 3 } as const;
      if (rank[role] > rank[existing.role]) await prisma.user.update({ where: { email }, data: { role } });
    } else {
      await prisma.user.create({ data: { email, role, name: null } });
    }
  }
  let report: Buffer | null = null;
  try {
    report = await buildFamilyReport("Pecúlio · prova de vida");
  } catch {
    report = null;
  }
  const note = s.polMessage.trim() ? `<blockquote style="margin:16px 0;padding:8px 14px;border-left:3px solid #2a78d6;color:#52514e">${s.polMessage.trim().replace(/</g, "&lt;")}</blockquote>` : "";
  const html = emailLayout(
    "Acesso ao património da família",
    `<p>O pedido de prova de vida enviado a ${fmtDate(check.sentAt)} não foi confirmado até ${fmtDate(check.dueAt)}.</p>
     <p>Conforme configurado, o acesso à aplicação <b>Pecúlio</b> foi-lhe atribuído. Entre com a conta Google deste endereço de e-mail:</p>
     <p style="margin:24px 0"><a href="${appUrl()}" style="background:#2a78d6;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Abrir o Pecúlio</a></p>
     ${note}
     <p style="font-size:12px;color:#52514e">${report ? "Em anexo segue o relatório completo do património da família à data de hoje." : "Não foi possível anexar o relatório; consulte-o na aplicação."}</p>`,
    appUrl(),
  );
  const r = await sendEmail({
    to: beneficiaries,
    subject: "Pecúlio · acesso ao património da família",
    html,
    attachments: report ? [{ filename: `peculio-relatorio-${new Date().toISOString().slice(0, 10)}.pdf`, content: report }] : undefined,
  });
  await prisma.proofOfLifeCheck.update({ where: { id: check.id }, data: { triggeredAt: new Date(), releasedTo: beneficiaries.join(", ") } });
  // tell the original recipients as well, in case this was a false alarm
  const owners = polRecipients(s);
  if (owners.length) {
    await sendEmail({
      to: owners,
      subject: "Pecúlio · prova de vida não confirmada — acessos entregues",
      html: emailLayout(
        "Prova de vida não confirmada",
        `<p>O pedido de ${fmtDate(check.sentAt)} não foi confirmado até ${fmtDate(check.dueAt)}, por isso o acesso à aplicação foi entregue a: <b>${beneficiaries.join(", ")}</b>.</p>
         <p>Se isto foi um engano, entre na aplicação e retire os acessos em Administração → Utilizadores, e reinicie o ciclo em Administração → Definições.</p>`,
        appUrl(),
      ),
    });
  }
  return { name: "Prova de vida", result: r.ok ? `NÃO CONFIRMADA: acessos (${role}) entregues a ${beneficiaries.join(", ")}${report ? " com o relatório em anexo" : ""}` : `acessos atribuídos mas o e-mail falhou: ${r.error}` };
}

/** Daily step: opens a cycle, reminds, or releases the access. */
export async function runProofOfLife(opts: { dryRun?: boolean; force?: boolean } = {}): Promise<Step[]> {
  const s = await getSettings();
  if (!s.polEnabled) return [];
  const err = configError(s);
  if (err) return [{ name: "Prova de vida", result: `configuração incompleta: ${err}` }];
  const now = new Date();
  const latest = await prisma.proofOfLifeCheck.findFirst({ orderBy: { sentAt: "desc" } });

  if (latest && !latest.confirmedAt && !latest.triggeredAt) {
    const remaining = Math.ceil((latest.dueAt.getTime() - now.getTime()) / DAY);
    if (now >= latest.dueAt || opts.force) {
      if (opts.dryRun) return [{ name: "Prova de vida (simulação)", result: `libertaria os acessos a ${polBeneficiaries(s).join(", ")} com o relatório em anexo` }];
      return [await releaseAccess(s, latest)];
    }
    const wantReminder = (remaining <= 3 && latest.remindersSent < 1) || (remaining <= 1 && latest.remindersSent < 2);
    if (wantReminder) {
      if (opts.dryRun) return [{ name: "Prova de vida (simulação)", result: `enviaria lembrete (${remaining} dia(s) para o prazo)` }];
      return [await sendReminder(s, latest, Math.max(remaining, 0))];
    }
    return [{ name: "Prova de vida", result: `a aguardar confirmação até ${fmtDate(latest.dueAt)} (${remaining} dia(s))` }];
  }

  if (latest?.triggeredAt && !latest.resolvedAt) {
    return [{ name: "Prova de vida", result: `acessos entregues em ${fmtDate(latest.triggeredAt)}; reinicie o ciclo nas Definições para retomar` }];
  }

  const anchor = latest?.confirmedAt ?? latest?.resolvedAt ?? null;
  const due = anchor ? addDays(anchor, s.polIntervalDays) : now;
  if (!anchor || now >= due || opts.force) {
    if (opts.dryRun) return [{ name: "Prova de vida (simulação)", result: `enviaria o pedido para ${polRecipients(s).join(", ")}` }];
    return [await sendCheck(s)];
  }
  return [{ name: "Prova de vida", result: `confirmada; próximo pedido em ${fmtDate(due)}` }];
}

export type ConfirmResult = { status: "confirmed" | "already" | "released" | "invalid"; at?: Date; by?: string | null; dueAt?: Date };

/** Marks the cycle as confirmed from the link in the e-mail. */
export async function confirmProofOfLife(token: string, by?: string | null): Promise<ConfirmResult> {
  const check = await prisma.proofOfLifeCheck.findUnique({ where: { token } });
  if (!check) return { status: "invalid" };
  if (check.confirmedAt) return { status: "already", at: check.confirmedAt, by: check.confirmedBy };
  if (check.triggeredAt) return { status: "released", at: check.triggeredAt, dueAt: check.dueAt };
  const updated = await prisma.proofOfLifeCheck.update({ where: { id: check.id }, data: { confirmedAt: new Date(), confirmedBy: by ?? "link do e-mail" } });
  return { status: "confirmed", at: updated.confirmedAt!, by: updated.confirmedBy, dueAt: updated.dueAt };
}

/** Reads a cycle without confirming it (the landing page shows a button first). */
export async function peekCheck(token: string) {
  const check = await prisma.proofOfLifeCheck.findUnique({ where: { token } });
  if (!check) return null;
  const s = await getSettings();
  return { check, intervalDays: s.polIntervalDays, beneficiaries: polBeneficiaries(s) };
}

/** Any administrator activity can count as proof of life. Never throws. */
export async function markAliveFromApp(by: string): Promise<boolean> {
  try {
    const s = await getSettings();
    if (!s.polEnabled || !s.polLoginCounts) return false;
    const latest = await prisma.proofOfLifeCheck.findFirst({ orderBy: { sentAt: "desc" } });
    if (latest && !latest.confirmedAt && !latest.triggeredAt) {
      await prisma.proofOfLifeCheck.update({ where: { id: latest.id }, data: { confirmedAt: new Date(), confirmedBy: by } });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Administrator confirms from inside the app, opening a fresh cycle from today. */
export async function confirmFromApp(by: string) {
  const latest = await prisma.proofOfLifeCheck.findFirst({ orderBy: { sentAt: "desc" } });
  if (latest && !latest.confirmedAt && !latest.triggeredAt) {
    await prisma.proofOfLifeCheck.update({ where: { id: latest.id }, data: { confirmedAt: new Date(), confirmedBy: by } });
    return "cycle";
  }
  const now = new Date();
  await prisma.proofOfLifeCheck.create({ data: { token: randomBytes(32).toString("base64url"), sentAt: now, dueAt: now, recipients: "(confirmação na aplicação)", confirmedAt: now, confirmedBy: by } });
  return "new";
}

/** Restarts the switch after a release. */
export async function resolveRelease(by: string) {
  const latest = await prisma.proofOfLifeCheck.findFirst({ orderBy: { sentAt: "desc" } });
  if (!latest?.triggeredAt || latest.resolvedAt) return false;
  await prisma.proofOfLifeCheck.update({ where: { id: latest.id }, data: { resolvedAt: new Date(), confirmedBy: latest.confirmedBy ?? by } });
  return true;
}
