"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshAll } from "@/app/actions/quotes";

/** Refreshes quotes, recomputes the manual portfolios and records today's value, in one go. */
export function RefreshAll({ assetId, label = "Atualizar tudo", className = "btn btn-sm" }: { assetId?: string; label?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            setMsg(null);
            try {
              const r = await refreshAll(assetId);
              setMsg(`${r.quoted}/${r.quotable} posições cotadas · ${r.snapshots} valor(es) registado(s)${r.errors.length ? ` · ${r.errors.length} aviso(s)` : ""}`);
              if (r.errors.length) setErr(r.errors.slice(0, 2).join(" · "));
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Erro ao atualizar.");
            }
          })
        }
      >
        {pending ? "A atualizar…" : label}
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
      {err && <span className="text-xs text-warn">{err}</span>}
    </span>
  );
}
