"use client";
import { useState, useTransition } from "react";
import { checkHealthNow, healthTestNow } from "@/app/actions/settings";

/** Runs every check now (Yahoo Finance and the Telegram bot included), or sends a test alert on every channel. */
export function HealthCheckButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [channels, setChannels] = useState<{ telegram: string; email: string; app: string; delivered: number } | null>(null);
  return (
    <div className="space-y-2">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setChannels(null);
              const r = await checkHealthNow();
              setMsg(`${r.issues ? `${r.issues} problema(s)` : "Tudo a funcionar"}${r.notified ? ` · avisos novos enviados — ${r.notified}` : ""}.`);
            })
          }
        >
          {pending ? "A verificar…" : "Verificar agora"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              setChannels(await healthTestNow());
            })
          }
        >
          Enviar alerta de teste
        </button>
        {msg && <span className="text-xs text-ink-2">{msg}</span>}
      </span>
      {channels && (
        <ul className="space-y-0.5 text-xs">
          {([["Telegram", channels.telegram], ["E-mail", channels.email], ["Notificação na app", channels.app]] as const).map(([name, text]) => (
            <li key={name} className={/^0 de|não configurado|nenhum|sem destinat|falhou/.test(text) ? "text-warn" : "text-good"}>
              {name}: {text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
