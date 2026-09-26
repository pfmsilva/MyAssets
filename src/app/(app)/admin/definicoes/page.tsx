import { auth } from "@/auth";
import { logView } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { aiConfigured, AI_MODEL } from "@/lib/ai-analysis";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SettingsTools } from "@/components/SettingsTools";
import { ProofOfLifeTools } from "@/components/ProofOfLifeTools";
import { getPolState } from "@/lib/proof-of-life";
import { fmtDate } from "@/lib/format";
import { updateSettings } from "@/app/actions/settings";
import type { JobReport } from "@/lib/jobs";

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
  const pol = await getPolState();
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

            <Section title="Backup e valor diário" summary={`${s.backupWeeklyEmail ? "backup semanal por e-mail" : "sem backup por e-mail"} · ${s.dailySnapshot ? "valor diário das carteiras ligado" : "valor diário desligado"}`}>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="backupWeeklyEmail" defaultChecked={s.backupWeeklyEmail} /> Enviar backup JSON por e-mail à segunda-feira</label>
              <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="dailySnapshot" defaultChecked={s.dailySnapshot} /> Registar diariamente o valor em direto das carteiras (cotações Yahoo), para a evolução se preencher entre importações</label>
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
      <Card title="Tarefa diária (Vercel Cron, 07:00 UTC)">
        <p className="mb-3 text-sm text-ink-2">Executa a retenção, os alertas, o valor diário e o backup semanal. {cronOk ? <span className="text-good">CRON_SECRET definido.</span> : <span className="text-warn">Defina CRON_SECRET no Vercel (texto aleatório) para o agendamento funcionar.</span>}{report && <> Última execução: {new Date(report.ranAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}.</>}</p>
        {report && <ul className="mb-3 rounded-lg border border-border p-3 text-sm">{report.steps.map((st) => <li key={st.name} className="flex flex-wrap justify-between gap-2 py-1"><span className="font-medium">{st.name}</span><span className="text-ink-2">{st.result}</span></li>)}</ul>}
        <SettingsTools retentionDays={s.activityRetentionDays} />
      </Card>
    </div>
  );
}
