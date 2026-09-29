"use client";
import { useState, useTransition } from "react";
import { sendSummaryPreview } from "@/app/actions/settings";

/** Sends today's summary to the administrator only, to see how it looks. */
export function SummaryPreviewButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendSummaryPreview();
            setMsg({ ok: r.ok, text: r.message });
          })
        }
      >
        {pending ? "A enviar…" : "Enviar-me o resumo de hoje"}
      </button>
      {msg && <span className={`text-xs ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</span>}
    </span>
  );
}
