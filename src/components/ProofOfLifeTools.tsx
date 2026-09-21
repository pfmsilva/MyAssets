"use client";
import { useState, useTransition } from "react";
import { confirmProofOfLifeAsAdmin, resolveReleaseAction, runProofOfLifeNow } from "@/app/actions/proof-of-life";
import type { Step } from "@/lib/proof-of-life";

export function ProofOfLifeTools({ released }: { released: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => start(async () => { const how = await confirmProofOfLifeAsAdmin(); setMsg(how === "cycle" ? "Pedido em curso confirmado; o ciclo recomeça agora." : "Prova de vida registada; o ciclo recomeça agora."); })}>
          Confirmar prova de vida agora
        </button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { setSteps(await runProofOfLifeNow(true)); setMsg("Simulação concluída (nada foi enviado)."); })}>
          Simular verificação
        </button>
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => { if (!confirm("Executar a verificação real? Pode enviar o pedido de prova de vida ou, se o prazo tiver terminado, entregar os acessos.")) return; start(async () => { setSteps(await runProofOfLifeNow(false)); setMsg("Verificação executada."); }); }}>
          Executar verificação agora
        </button>
        {released && (
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => { if (!confirm("Reiniciar o ciclo? Os acessos já entregues mantêm-se; retire-os em Utilizadores se foi um engano.")) return; start(async () => { await resolveReleaseAction(); setMsg("Ciclo reiniciado."); }); }}>
            Reiniciar ciclo após entrega
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-ink-2">{pending ? "…" : msg}</p>}
      {steps && steps.length > 0 && (
        <ul className="rounded-lg border border-border p-3 text-sm">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 py-1"><span className="font-medium">{s.name}</span><span className="text-ink-2">{s.result}</span></li>
          ))}
        </ul>
      )}
      {steps && steps.length === 0 && <p className="text-sm text-ink-3">Prova de vida desativada.</p>}
    </div>
  );
}
