import Link from "next/link";
import { fmtEur, fmtPct } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = "", action }: { title?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink-2">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, delta, hint, href }: { label: string; value: string; delta?: number | null; hint?: string; href?: string }) {
  const body = (
    <div className="card h-full">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</p>
      <p className="num mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={`num mt-1 text-xs font-medium ${delta >= 0 ? "text-good" : "text-bad"}`}>
          {delta >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(delta))}
          {hint && <span className="ml-1 font-normal text-ink-3">{hint}</span>}
        </p>
      )}
      {(delta === undefined || delta === null) && hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Money({ value, className = "", signed = false }: { value: number; className?: string; signed?: boolean }) {
  const cls = signed ? (value > 0 ? "text-good" : value < 0 ? "text-bad" : "") : "";
  return <span className={`num ${cls} ${className}`}>{signed && value > 0 ? "+" : ""}{fmtEur(value)}</span>;
}

export function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-ink-3">{children}</div>;
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: React.ReactNode }) {
  const cls = kind === "error" ? "bg-bad/10 text-bad" : kind === "success" ? "bg-good/10 text-good" : "bg-accent/10 text-accent";
  return <div className={`rounded-md px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
