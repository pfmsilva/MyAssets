"use client";
import { useActionState } from "react";

type State = { ok?: boolean; error?: string };

export function ActionForm({ action, children, submitLabel = "Guardar", className = "space-y-3" }: { action: (prev: State, fd: FormData) => Promise<State>; children: React.ReactNode; submitLabel?: string; className?: string }) {
  const [state, act, pending] = useActionState<State, FormData>(action, {});
  return (
    <form action={act} className={className}>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "…" : submitLabel}</button>
        {state.error && <span className="text-sm text-bad">{state.error}</span>}
        {state.ok && <span className="text-sm text-good">Guardado.</span>}
      </div>
    </form>
  );
}
