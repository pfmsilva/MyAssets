"use client";
import { useState, useTransition } from "react";
import { purgeActivityNow, runJobsNow, sendTestEmail } from "@/app/actions/settings";
import type { JobReport } from "@/lib/jobs";

export function SettingsTools({ retentionDays }: { retentionDays: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [report, setReport] = useState<JobReport | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { const r = await sendTestEmail(); setMsg(r.message); })}>Enviar e-mail de teste</button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { setReport(await runJobsNow(true)); setMsg("Simulação concluída (nada foi enviado)."); })}>Simular tarefas diárias</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => { if (!confirm("Executar agora as tarefas diárias (envia alertas e backup se configurados)?")) return; start(async () => { setReport(await runJobsNow(false)); setMsg("Tarefas executadas."); }); }}>Executar tarefas diárias agora</button>
        <button type="button" className="btn btn-sm btn-danger" disabled={pending || !retentionDays} onClick={() => { if (!confirm(`Apagar registos de atividade com mais de ${retentionDays} dias?`)) return; start(async () => { const n = await purgeActivityNow(); setMsg(`${n} registos apagados.`); }); }}>Limpar registo de atividade agora</button>
      </div>
      {msg && <p className="text-sm text-ink-2">{pending ? "…" : msg}</p>}
      {report && (
        <ul className="rounded-lg border border-border p-3 text-sm">
          {report.steps.map((s) => <li key={s.name} className="flex flex-wrap justify-between gap-2 py-1"><span className="font-medium">{s.name}</span><span className="text-ink-2">{s.result}</span></li>)}
        </ul>
      )}
    </div>
  );
}
