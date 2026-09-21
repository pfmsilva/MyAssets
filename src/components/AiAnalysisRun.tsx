"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAnalysisAction } from "@/app/actions/ai";

export function AiAnalysisRun({ disabled, hint }: { disabled?: boolean; hint?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || disabled}
        onClick={() =>
          start(async () => {
            setErr(null);
            setMsg(null);
            const r = await runAnalysisAction();
            if (r.ok) {
              setMsg(`Análise concluída (custo estimado ${r.costUsd.toFixed(3)} USD).`);
              router.refresh();
            } else setErr(r.error);
          })
        }
      >
        {pending ? "A analisar…" : "Analisar agora"}
      </button>
      {pending && <p className="text-sm text-ink-2">A enviar o retrato do património e a aguardar a leitura. Pode demorar um minuto.</p>}
      {msg && <p className="text-sm text-good">{msg}</p>}
      {err && <p className="text-sm text-bad">{err}</p>}
      {hint && !pending && <p className="text-xs text-ink-3">{hint}</p>}
    </div>
  );
}
