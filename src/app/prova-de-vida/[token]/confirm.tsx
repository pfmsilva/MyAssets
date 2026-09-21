"use client";
import { useState, useTransition } from "react";
import { confirmProofOfLifeAction } from "@/app/actions/proof-of-life";
import { fmtDate } from "@/lib/format";
import type { ConfirmResult } from "@/lib/proof-of-life";

export function ConfirmCard({
  token,
  state,
  sentAt,
  dueAt,
  confirmedAt,
  intervalDays,
  beneficiaries,
}: {
  token: string;
  state: "open" | "already" | "released";
  sentAt: string;
  dueAt: string;
  confirmedAt: string | null;
  intervalDays: number;
  beneficiaries: string[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const done = result?.status === "confirmed" || state === "already";
  if (state === "released" && !done)
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-warn/10 px-3 py-2 text-sm text-warn">Este pedido expirou em {fmtDate(dueAt)} e os acessos já foram entregues. Contacte o administrador da aplicação.</p>
      </div>
    );
  if (done) {
    const at = result?.at ? new Date(result.at) : confirmedAt ? new Date(confirmedAt) : new Date();
    return (
      <div className="space-y-2">
        <p className="rounded-md bg-good/10 px-3 py-2 text-sm text-good">Prova de vida confirmada em {at.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}. Obrigado.</p>
        <p className="text-sm text-ink-2">O próximo pedido só será enviado daqui a {intervalDays} dias. Pode fechar esta página.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        Confirme que está tudo bem carregando no botão. Sem confirmação até <b>{fmtDate(dueAt)}</b>, o acesso à aplicação e o relatório do património são enviados a {beneficiaries.length ? beneficiaries.join(", ") : "as pessoas definidas"}.
      </p>
      <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={() => start(async () => setResult(await confirmProofOfLifeAction(token)))}>
        {pending ? "A confirmar…" : "Confirmar prova de vida"}
      </button>
      {result?.status === "invalid" && <p className="text-sm text-bad">Link inválido.</p>}
      {result?.status === "released" && <p className="text-sm text-warn">O prazo já tinha terminado e os acessos foram entregues.</p>}
      <p className="text-xs text-ink-3">Pedido de {fmtDate(sentAt)}.</p>
    </div>
  );
}
