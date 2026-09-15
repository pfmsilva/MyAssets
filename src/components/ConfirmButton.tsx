"use client";
import { useTransition } from "react";

export function ConfirmButton({ action, label, confirm, className = "btn btn-sm btn-danger" }: { action: () => Promise<void>; label: string; confirm?: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try {
            await action();
          } catch (e) {
            alert(e instanceof Error ? e.message : "Erro");
          }
        });
      }}
    >
      {pending ? "…" : label}
    </button>
  );
}
