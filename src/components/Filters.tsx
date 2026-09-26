import Link from "next/link";

export type FilterOption = { value: string; label: string; href: string };

/** A row of link buttons used as a filter (period, grouping, account…). */
export function FilterLinks({ label, options, current, scroll = true }: { label?: string; options: FilterOption[]; current: string; scroll?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {label && <span className="text-xs text-ink-3">{label}</span>}
      {options.map((o) => (
        <Link key={o.value} href={o.href} scroll={scroll} className={`btn btn-sm ${o.value === current ? "btn-primary" : ""}`}>
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** A single on/off filter. */
export function FilterToggle({ href, label, on, title }: { href: string; label: string; on: boolean; title?: string }) {
  return (
    <Link href={href} scroll={false} title={title} className={`btn btn-sm ${on ? "btn-primary" : ""}`}>
      {on ? "✓ " : ""}{label}
    </Link>
  );
}
