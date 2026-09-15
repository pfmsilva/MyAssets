"use client";
import { useState, useTransition } from "react";
import { seedInitialData } from "@/app/actions/admin";

export function SeedButton({ compact = false }: { compact?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={compact ? "inline-flex items-center gap-2" : "space-y-2"}>
      <button
        type="button"
        className={`btn ${compact ? "btn-sm" : "btn-primary"}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await seedInitialData();
            if (r.error) setMsg(`Erro: ${r.error}`);
            else {
              const c = r.created!;
              setMsg(`Criados: ${c.members} membros, ${c.assets} ativos, ${c.categories} categorias, ${c.rules} regras. O que já existia foi mantido.`);
            }
          })
        }
      >
        {pending ? "A criar…" : "Criar dados iniciais"}
      </button>
      {msg && <span className="text-sm text-ink-2">{msg}</span>}
    </div>
  );
}
