"use client";
import { useState, useTransition } from "react";
import { checkHealthNow } from "@/app/actions/settings";

/** Runs every check now, including Yahoo Finance and the Telegram bot. */
export function HealthCheckButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkHealthNow();
            setMsg(`${r.issues ? `${r.issues} problema(s)` : "Tudo a funcionar"}${r.notified ? ` · aviso enviado por ${r.notified}` : ""}.`);
          })
        }
      >
        {pending ? "A verificar…" : "Verificar agora"}
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </span>
  );
}
