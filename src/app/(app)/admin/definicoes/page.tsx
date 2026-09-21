import { auth } from "@/auth";
import { logView } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
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

export default async function SettingsAdmin() {
  const session = await auth();
  if (session?.user) logView(session.user, "Admin · Definições");
  const s = await getSettings();
  const last = await prisma.setting.findUnique({ where: { key: "lastJobReport" } });
  const report: JobReport | null = last ? (JSON.parse(last.value) as JobReport) : null;
  const cronOk = !!process.env.CRON_SECRET;
  const pol = await getPolState();
  const [activityCount, oldest] = await Promise.all([prisma.activityLog.count(), prisma.activityLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } })]);
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="activityRetentionDays">Retenção do registo de atividade (dias; 0 = para sempre)</label>
              <input id="activityRetentionDays" name="activityRetentionDays" type="number" min="0" defaultValue={s.activityRetentionDays} />
              <span className="text-xs text-ink-3">{activityCount} registos, o mais antigo de {oldest ? oldest.createdAt.toLocaleDateString("pt-PT") : "—"}. A limpeza corre na tarefa diária.</span>
            </div>
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
            <label className="flex items-center gap-2 text-sm font-normal text-ink"><input type="checkbox" name="backupWeeklyEmail" defaultChecked={s.backupWeeklyEmail} /> Enviar backup JSON por e-mail à segunda-feira</label>
            <label className="flex items-center gap-2 text-sm font-normal text-ink sm:col-span-2"><input type="checkbox" name="dailySnapshot" defaultChecked={s.dailySnapshot} /> Registar diariamente o valor em direto das carteiras (cotações Yahoo), para a evolução se preencher entre importações</label>

            <div className="border-t border-border pt-4 sm:col-span-2">
              <h3 className="text-sm font-semibold">Prova de vida</h3>
              <p className="mt-1 text-sm text-ink-2">De tempos a tempos é enviado um e-mail com um link de confirmação. Basta uma das pessoas confirmar. Se ninguém confirmar dentro do prazo, os acessos à aplicação são atribuídos às pessoas indicadas e estas recebem um e-mail com a ligação e o relatório do património em anexo.</p>
            </div>
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
