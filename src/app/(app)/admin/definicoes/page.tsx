import { auth } from "@/auth";
import { logView } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { SettingsTools } from "@/components/SettingsTools";
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
          </div>
        </ActionForm>
      </Card>
      <Card title="Tarefa diária (Vercel Cron, 07:00 UTC)">
        <p className="mb-3 text-sm text-ink-2">Executa a retenção, os alertas, o valor diário e o backup semanal. {cronOk ? <span className="text-good">CRON_SECRET definido.</span> : <span className="text-warn">Defina CRON_SECRET no Vercel (texto aleatório) para o agendamento funcionar.</span>}{report && <> Última execução: {new Date(report.ranAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}.</>}</p>
        {report && <ul className="mb-3 rounded-lg border border-border p-3 text-sm">{report.steps.map((st) => <li key={st.name} className="flex flex-wrap justify-between gap-2 py-1"><span className="font-medium">{st.name}</span><span className="text-ink-2">{st.result}</span></li>)}</ul>}
        <SettingsTools retentionDays={s.activityRetentionDays} />
      </Card>
    </div>
  );
}
