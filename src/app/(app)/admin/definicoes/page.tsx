import Link from "next/link";
import { auth } from "@/auth";
import { telegramConfigured } from "@/lib/telegram";
import { logView } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { aiConfigured, AI_MODEL } from "@/lib/ai-analysis";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SettingsTools } from "@/components/SettingsTools";
import { SummaryPreviewButton } from "@/components/SummaryPreviewButton";
import type { SummaryReport } from "@/lib/daily-summary";
import { ProofOfLifeTools } from "@/components/ProofOfLifeTools";
import { getPolState } from "@/lib/proof-of-life";
import { fmtDate } from "@/lib/format";
import { updateSettings } from "@/app/actions/settings";
import type { JobReport } from "@/lib/jobs";
import { checkHealth, lastHealthCheck, openIssues } from "@/lib/health";
import { HealthCheckButton } from "@/components/HealthCheckButton";
import { scheduleStatus } from "@/lib/summary-schedule";
import { appUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

/** One collapsible block of settings, with the current state summed up in the title line. */
function Section({ title, summary, children, open = false }: { title: string; summary: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-border px-3 py-2 sm:col-span-2">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        <span className="mr-1 text-ink-3">▸</span>{title}
        <span className="ml-2 text-xs font-normal text-ink-2">{summary}</span>
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </details>
  );
}

export default async function SettingsAdmin() {
  const session = await auth();
  if (session?.user) logView(session.user, "Admin · Definições");
  const s = await getSettings();
  const last = await prisma.setting.findUnique({ where: { key: "lastJobReport" } });
  const report: JobReport | null = last ? (JSON.parse(last.value) as JobReport) : null;
  const cronOk = !!process.env.CRON_SECRET;
  const lastSummaryRow = await prisma.setting.findUnique({ where: { key: "lastSummaryReport" } });
  const lastSummary: SummaryReport | null = lastSummaryRow ? (JSON.parse(lastSummaryRow.value) as SummaryReport) : null;
  const summaryWho = { off: "desligado", admins: "para os administradores", all: "para todos os utilizadores" }[s.dailySummary];
  const CH = { email: "e-mail", telegram: "Telegram", both: "e-mail e Telegram" } as const;
  const summaryLine = `${summaryWho}${s.dailySummary !== "off" ? ` · por ${CH[s.dailySummaryChannel]} · ${s.dailySummaryWeekends ? "todos os dias" : "dias úteis"} às ~22h30` : ""}${lastSummary ? ` · último envio ${new Date(lastSummary.ranAt).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })}: ${lastSummary.sent} e-mail(s)${lastSummary.telegram ? `, ${lastSummary.telegram} Telegram` : ""}` : ""}`;
  const tgUsers = await prisma.user.findMany({ where: { telegramChatId: { not: null } }, select: { name: true, email: true, role: true, telegramName: true }, orderBy: { email: "asc" } });
  const tgLine = !telegramConfigured()
    ? "por configurar (TELEGRAM_BOT_TOKEN)"
    : `${tgUsers.length} pessoa(s) ligada(s) · resumo por ${CH[s.dailySummaryChannel]} · alertas por ${CH[s.alertChannel]} · prova de vida por ${CH[s.polChannel]}`;
  const pol = await getPolState();
  const sched = await scheduleStatus();
  const [health, lastCheck, open] = await Promise.all([checkHealth(), lastHealthCheck(), openIssues()]);
  // Yahoo and the bot are only tested when probing (cron runs, "Verificar agora"): show their last result
  const probedNames = { "quotes-down": "Yahoo Finance", "telegram-webhook": "Bot do Telegram", "data-quality": "Qualidade dos dados" } as const;
  const probed = (Object.keys(probedNames) as (keyof typeof probedNames)[]).filter((c) => open[c]).map((c) => ({ name: probedNames[c], status: open[c].level, detail: open[c].title }));
  const healthRows = [...health.checks, ...probed];
  const healthBad = healthRows.filter((c) => c.status !== "ok").length;
  const [activityCount, oldest] = await Promise.all([prisma.activityLog.count(), prisma.activityLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } })]);
  const alertCount = s.alertEmails.split(",").map((e) => e.trim()).filter(Boolean).length;
  const alertTriggers = [s.alertStaleDays > 0 ? `ativos parados > ${s.alertStaleDays} dias` : null, s.alertMovePct > 0 ? `variação > ${s.alertMovePct} %` : null, s.alertBudget ? "orçamento" : null].filter(Boolean) as string[];
  const polSummary = !s.polEnabled
    ? "desativada"
    : pol.releasedCheck
      ? `acessos entregues em ${fmtDate(pol.releasedCheck.triggeredAt!)}`
      : pol.openCheck
        ? `pedido enviado, a aguardar até ${fmtDate(pol.openCheck.dueAt)}`
        : `ativa · a cada ${s.polIntervalDays} dias · próximo pedido ${pol.nextEmailAt ? fmtDate(pol.nextEmailAt) : "—"}`;
  return (
    <div className="space-y-4">
      <Card title="Backups e exportação">
        <p className="mb-3 text-sm text-ink-2">Exporta todos os dados (ativos, valores, posições, movimentos, categorias, mais-valias, utilizadores). O Excel é para consulta; o JSON é o backup completo para restauro. A base Neon guarda ainda um histórico de recuperação próprio (point-in-time restore).</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href="/api/export/excel">Exportar Excel</a>
          <a className="btn" href="/api/export/backup">Descarregar backup (JSON)</a>
        </div>
      </Card>
      <Card title="Definições">
        <ActionForm action={updateSettings}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Section title="Registo de atividade" summary={`${activityCount} registos · ${s.activityRetentionDays ? `guardados ${s.activityRetentionDays} dias` : "guardados para sempre"}`}>
              <div className="flex flex-col gap-1">
                <label htmlFor="activityRetentionDays">Retenção do registo de atividade (dias; 0 = para sempre)</label>
                <input id="activityRetentionDays" name="activityRetentionDays" type="number" min="0" defaultValue={s.activityRetentionDays} />
                <span className="text-xs text-ink-3">O mais antigo é de {oldest ? oldest.createdAt.toLocaleDateString("pt-PT") : "—"}. A limpeza corre na tarefa diária.</span>
              </div>
            </Section>

            <Section
              title="Alertas por e-mail"
              summary={`${alertCount} destinatário(s) · ${alertTriggers.length ? alertTriggers.join(", ") : "sem alertas ativos"}${emailConfigured() ? "" : " · envio por configurar"}`}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="alertEmails">Destinatários dos alertas (e-mails separados por vírgula)</label>
                <input id="alertEmails" name="alertEmails" defaultValue={s.alertEmails} placeholder="paulo@…, maria@…" />
                <span className={`text-xs ${emailConfigured() ? "text-good" : "text-warn"}`}>{emailConfigured() ? "Envio de e-mail configurado (Resend)." : "Envio não configurado: defina RESEND_API_KEY e ALERTS_FROM no Vercel."}</span>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="alertStaleDays">Alertar ativos sem atualização há mais de (dias; 0 = desligado)</label>
                <input id="alertStaleDays" name="alertStaleDays" type="number" min="0" defaultValue={s.alertStaleDays} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="alertMovePct">Alertar variação diária de carteira acima de (%; 0 = desligado)</label>
                <input id="alertMovePct" name="alertMovePct" type="number" min="0" step="any" defaultValue={s.alertMovePct} />
              </div>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="alertBudget" defaultChecked={s.alertBudget} /> Alertar categorias acima do orçamento (uma vez por mês)</label>
            </Section>

            <Section title="Resumo diário" summary={`${summaryLine}${sched.people ? ` · ${sched.people} com horários próprios` : ""}`}>
              <p className="text-sm text-ink-2 sm:col-span-2">No fim de cada dia (cerca das 22h30 de Lisboa, depois do fecho dos mercados americanos) cada utilizador recebe os gráficos da variação por dia e do ganho acumulado dos últimos 7 dias das carteiras com cotação — só das carteiras que pode ver na aplicação.</p>
              <div className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2 sm:col-span-2">
                <p><b>Horários próprios:</b> cada pessoa pode escolher até quatro horas por dia, por e-mail e/ou Telegram, em <Link className="text-accent underline" href="/conta">A minha conta</Link>; quem o fizer deixa de receber este resumo geral. {sched.people ? `${sched.people} pessoa(s) com horários próprios.` : "Ninguém tem horários próprios."}</p>
                <p className="mt-2">Para as horas saírem a tempo, é preciso um &laquo;despertador&raquo; que chame a aplicação a cada 5–15 minutos (as duas tarefas diárias só cobrem as 08:00 e as 22:30). Grátis em <b>cron-job.org</b>: novo cron job com o URL <code className="break-all">{appUrl() || "https://<a-sua-app>"}/api/cron/schedule</code>, a cada 5 minutos, e em <i>Advanced → Headers</i> o cabeçalho <code>Authorization</code> com o valor <code>Bearer</code> seguido do CRON_SECRET.</p>
                <p className="mt-2">{sched.externalAt ? `Último despertador: ${new Date(sched.externalAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}.` : "O despertador ainda não chamou a aplicação."}{sched.last ? ` Última verificação dos horários: ${new Date(sched.last.at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })} (${sched.last.source}) · ${sched.last.sent} e-mail(s), ${sched.last.telegram} Telegram${sched.last.errors.length ? ` · ${sched.last.errors.length} erro(s): ${sched.last.errors[0]}` : ""}.` : ""}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="dailySummary">Enviar</label>
                <select id="dailySummary" name="dailySummary" defaultValue={s.dailySummary}>
                  <option value="off">Não enviar</option>
                  <option value="admins">Só aos administradores</option>
                  <option value="all">A todos os utilizadores</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="dailySummaryWeekends" defaultChecked={s.dailySummaryWeekends} /> Enviar também ao sábado e domingo</label>
              <div className="sm:col-span-2"><SummaryPreviewButton /></div>
              {lastSummary && (lastSummary.errors.length > 0 || lastSummary.skipped.length > 0) && (
                <p className="text-xs text-ink-3 sm:col-span-2">Último envio: {[...lastSummary.errors, ...lastSummary.skipped].slice(0, 4).join(" · ")}</p>
              )}
            </Section>

            <Section title="Telegram" summary={tgLine}>
              <p className="text-sm text-ink-2 sm:col-span-2">
                Cada pessoa liga a sua conta em <Link href="/conta" className="text-accent underline">A minha conta</Link> (ou um grupo da família). Aqui escolhe-se o que segue por e-mail, por Telegram ou pelos dois. Os alertas e o relatório vão para os administradores ligados; a prova de vida para quem a recebe por e-mail e tenha ligado o Telegram.
                {!telegramConfigured() && <> Para ativar: no Telegram fale com <b>@BotFather</b>, envie <code>/newbot</code>, e guarde o token em <code>TELEGRAM_BOT_TOKEN</code> no Vercel.</>}
              </p>
              {(
                [
                  ["dailySummaryChannel", "Resumo diário", s.dailySummaryChannel],
                  ["alertChannel", "Alertas", s.alertChannel],
                  ["polChannel", "Prova de vida", s.polChannel],
                ] as const
              ).map(([name, label, value]) => (
                <div key={name} className="flex flex-col gap-1">
                  <label htmlFor={name}>{label}</label>
                  <select id={name} name={name} defaultValue={value}>
                    <option value="email">Só e-mail</option>
                    <option value="telegram">Só Telegram</option>
                    <option value="both">E-mail e Telegram</option>
                  </select>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="telegramShowTotals" defaultChecked={s.telegramShowTotals} /> Mostrar no Telegram também o valor das carteiras (por omissão só ganhos e perdas)</label>
              <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="appNotifications" defaultChecked={s.appNotifications} /> Enviar também notificações na app (sino e dispositivos com notificações ativas) com o resumo geral, os alertas e os avisos da vigilância</label>
              <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="telegramWeeklyReport" defaultChecked={s.telegramWeeklyReport} /> Enviar o relatório PDF aos administradores no Telegram à segunda-feira</label>
              <div className="text-xs text-ink-3 sm:col-span-2">
                {tgUsers.length ? <>Ligados: {tgUsers.map((u) => `${u.name ?? u.email} → ${u.telegramName}`).join(" · ")}</> : "Ainda ninguém ligou o Telegram."}
              </div>
            </Section>

            <Section title="Backup e valor diário" summary={`${s.backupWeeklyEmail ? "backup semanal por e-mail" : "sem backup por e-mail"} · ${s.dailySnapshot ? "valor diário das carteiras ligado" : "valor diário desligado"}`}>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="backupWeeklyEmail" defaultChecked={s.backupWeeklyEmail} /> Enviar backup JSON por e-mail à segunda-feira</label>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="dailySnapshot" defaultChecked={s.dailySnapshot} /> Registar diariamente o valor em direto das carteiras (cotações Yahoo), para a evolução se preencher entre importações</label>
            </Section>

            <Section title="Vigilância" summary={`${s.healthAlerts ? "avisa os administradores" : "sem avisos"} · ${healthBad ? `${healthBad} problema(s)` : "tudo a funcionar"}`}>
              <p className="text-sm text-ink-2 sm:col-span-2">Cada tarefa agendada verifica a outra, as cotações do Yahoo e o bot do Telegram. Se algo falhar, os administradores recebem um aviso no Telegram (ou por e-mail, para os destinatários dos alertas, se nenhum tiver o Telegram ligado) e outro quando voltar a funcionar.</p>
              <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="healthAlerts" defaultChecked={s.healthAlerts} /> Avisar os administradores quando uma tarefa, as cotações ou o bot falharem</label>
            </Section>

            <Section title="Prova de vida" summary={polSummary}>
              <p className="text-sm text-ink-2 sm:col-span-2">De tempos a tempos é enviado um e-mail com um link de confirmação. Basta uma das pessoas confirmar. Se ninguém confirmar dentro do prazo, os acessos à aplicação são atribuídos às pessoas indicadas e estas recebem um e-mail com a ligação e o relatório do património em anexo.</p>
              <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="polEnabled" defaultChecked={s.polEnabled} /> Ativar a prova de vida</label>
              <div className="flex flex-col gap-1">
                <label htmlFor="polIntervalDays">Enviar pedido a cada (dias)</label>
                <input id="polIntervalDays" name="polIntervalDays" type="number" min="1" defaultValue={s.polIntervalDays} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="polGraceDays">Prazo para confirmar (dias)</label>
                <input id="polGraceDays" name="polGraceDays" type="number" min="1" defaultValue={s.polGraceDays} />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="polEmails">Quem recebe o pedido (e-mails separados por vírgula)</label>
                <input id="polEmails" name="polEmails" defaultValue={s.polEmails} placeholder="paulo@…, maria@…" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="polBeneficiaries">Quem recebe os acessos se não houver confirmação</label>
                <input id="polBeneficiaries" name="polBeneficiaries" defaultValue={s.polBeneficiaries} placeholder="filho@gmail.com, irmao@gmail.com" />
                <span className="text-xs text-ink-3">Têm de ser contas Google, porque o acesso é feito com o login Google.</span>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="polBeneficiaryRole">Perfil a atribuir</label>
                <select id="polBeneficiaryRole" name="polBeneficiaryRole" defaultValue={s.polBeneficiaryRole}>
                  <option value="VIEWER">Consulta</option>
                  <option value="EDITOR">Atualização</option>
                  <option value="ADMIN">Administração</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="polMessage">Mensagem a incluir no e-mail de entrega (opcional)</label>
                <textarea id="polMessage" name="polMessage" rows={3} defaultValue={s.polMessage} placeholder="ex.: instruções para a família, contactos do contabilista…" className="w-full" />
              </div>
              <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="polLoginCounts" defaultChecked={s.polLoginCounts} /> Entrar na aplicação como administrador conta como prova de vida</label>
            </Section>

            <Section title="Análise de IA" summary={`${s.aiEnabled ? "ativa" : "desativada"} · ${s.aiAnonymize ? "nomes anonimizados" : "nomes tal como estão"} · ${aiConfigured() ? `modelo ${AI_MODEL}` : "chave em falta"}`}>
              <p className="text-sm text-ink-2 sm:col-span-2">Envia ao Claude um resumo do património já calculado pela aplicação (totais por tipo e por membro, evolução, alocação face ao alvo, maiores posições, rentabilidade, liquidez, despesa e poupança) e recebe uma leitura com observações, riscos e sugestões de reequilíbrio. Não são enviados movimentos, números de conta nem dados de acesso, e nada é enviado sem carregar em «Analisar agora».</p>
              <p className={`text-xs sm:col-span-2 ${aiConfigured() ? "text-good" : "text-warn"}`}>{aiConfigured() ? `Chave configurada. Modelo ${AI_MODEL}.` : "Chave em falta: defina ANTHROPIC_API_KEY no Vercel."}</p>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="aiEnabled" defaultChecked={s.aiEnabled} /> Ativar a análise de IA</label>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="aiAnonymize" defaultChecked={s.aiAnonymize} /> Substituir os nomes dos membros por «Membro 1, 2, …»</label>
            </Section>
          </div>
        </ActionForm>
      </Card>
      <Card title="Prova de vida — estado">
        {!pol.enabled ? (
          <p className="text-sm text-ink-2">Desativada. Ative-a acima para que a aplicação envie o pedido periódico.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {pol.configError && <p className="rounded-md bg-warn/10 px-3 py-2 text-warn">{pol.configError}</p>}
            {pol.releasedCheck ? (
              <p className="rounded-md bg-bad/10 px-3 py-2 text-bad">
                Acessos entregues em {fmtDate(pol.releasedCheck.triggeredAt!)} a {pol.releasedCheck.releasedTo}. O ciclo está parado até ser reiniciado.
              </p>
            ) : pol.openCheck ? (
              <p className="rounded-md bg-accent/10 px-3 py-2 text-accent">
                Pedido enviado em {fmtDate(pol.openCheck.sentAt)} para {pol.openCheck.recipients}. A aguardar confirmação até <b>{fmtDate(pol.openCheck.dueAt)}</b> ({pol.remainingDays} dia(s)).
              </p>
            ) : (
              <p className="text-ink-2">
                Última confirmação: {pol.lastConfirmedAt ? fmtDate(pol.lastConfirmedAt) : "ainda nenhuma"}. Próximo pedido: {pol.nextEmailAt ? fmtDate(pol.nextEmailAt) : "—"}.
              </p>
            )}
            <ProofOfLifeTools released={!!pol.releasedCheck} />
            {pol.history.length > 0 && (
              <details className="pt-2">
                <summary className="cursor-pointer text-xs text-ink-3">Histórico dos últimos pedidos</summary>
                <table className="table mt-2">
                  <thead><tr><th>Enviado</th><th>Prazo</th><th>Estado</th><th>Por</th></tr></thead>
                  <tbody>
                    {pol.history.map((h) => (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap">{fmtDate(h.sentAt)}</td>
                        <td className="whitespace-nowrap">{fmtDate(h.dueAt)}</td>
                        <td className={h.triggeredAt ? "text-bad" : h.confirmedAt ? "text-good" : "text-warn"}>{h.triggeredAt ? `acessos entregues em ${fmtDate(h.triggeredAt)}` : h.confirmedAt ? `confirmada em ${fmtDate(h.confirmedAt)}` : "a aguardar"}</td>
                        <td className="text-ink-3">{h.confirmedBy ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </Card>
      <Card title="Vigilância">
        <ul className="space-y-1.5 text-sm">
          {healthRows.map((c) => (
            <li key={c.name} className="flex gap-2">
              <span aria-hidden>{c.status === "ok" ? "🟢" : c.status === "warn" ? "🟡" : "🔴"}</span>
              <span><b className="font-medium">{c.name}</b> <span className={c.status === "ok" ? "text-ink-2" : c.status === "warn" ? "text-warn" : "text-bad"}>{c.detail}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <HealthCheckButton />
          <span className="text-xs text-ink-3">{lastCheck ? `Última verificação completa: ${new Date(lastCheck.at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })} (${lastCheck.source})${lastCheck.notified ? ` · aviso por ${lastCheck.notified}` : ""}` : "Ainda sem verificação completa."}</span>
        </div>
      </Card>
      <Card title="Tarefa diária (Vercel Cron, 07:00 UTC)">
        <p className="mb-3 text-sm text-ink-2">Executa a retenção, os alertas, o valor diário e o backup semanal. {cronOk ? <span className="text-good">CRON_SECRET definido.</span> : <span className="text-warn">Defina CRON_SECRET no Vercel (texto aleatório) para o agendamento funcionar.</span>}{report && <> Última execução: {new Date(report.ranAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}.</>}</p>
        {report && <ul className="mb-3 rounded-lg border border-border p-3 text-sm">{report.steps.map((st) => <li key={st.name} className="flex flex-wrap justify-between gap-2 py-1"><span className="font-medium">{st.name}</span><span className="text-ink-2">{st.result}</span></li>)}</ul>}
        <SettingsTools retentionDays={s.activityRetentionDays} />
      </Card>
    </div>
  );
}
