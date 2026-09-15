"use client";
import { useState, useTransition } from "react";
import { setBudget } from "@/app/actions/budgets";

export function BudgetInput({ categoryId, value }: { categoryId: string; value: number | null }) {
  const [v, setV] = useState(value != null ? String(value) : "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const save = () => start(async () => { await setBudget(categoryId, v.trim() ? Number(v.replace(",", ".")) : null); setSaved(true); setTimeout(() => setSaved(false), 1500); });
  return (
    <span className="inline-flex items-center gap-1">
      <input className="w-24 py-1 text-right text-xs" type="number" step="1" min="0" placeholder="sem limite" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value != null ? String(value) : "") && save()} onKeyDown={(e) => e.key === "Enter" && save()} disabled={pending} />
      <span className="text-xs text-ink-3">€{saved ? " ✓" : ""}</span>
    </span>
  );
}
