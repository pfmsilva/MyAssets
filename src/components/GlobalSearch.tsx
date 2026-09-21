"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GROUP_LABEL, type SearchGroup, type SearchHit } from "@/lib/search-types";
import { fmtEur } from "@/lib/format";

type Group = { group: SearchGroup; hits: SearchHit[] };

export function GlobalSearch({ placeholder = "Pesquisar…" }: { placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const flat = groups.flatMap((g) => g.hits);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (r.ok) {
          const data = (await r.json()) as { groups: Group[] };
          setGroups(data.groups);
          setActive(0);
        }
      } catch {
        /* pedido cancelado */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); inputRef.current?.select(); }
    };
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onClick); };
  }, []);

  const onChange = (value: string) => {
    setQ(value);
    setOpen(true);
    if (value.trim().length < 2) { setGroups([]); setLoading(false); } else setLoading(true);
  };

  const go = (href: string) => { setOpen(false); setQ(""); setGroups([]); router.push(href); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[active];
      if (hit) go(hit.href);
      else if (q.trim().length >= 2) go(`/pesquisa?q=${encodeURIComponent(q.trim())}`);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label="Pesquisar em toda a aplicação"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full text-sm"
      />
      {open && q.trim().length >= 2 && (
        <div className="fixed inset-x-2 top-14 z-40 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg md:absolute md:inset-x-0 md:top-full md:mt-1 md:w-80">
          {loading && flat.length === 0 && <p className="px-2 py-2 text-sm text-ink-3">A pesquisar…</p>}
          {!loading && flat.length === 0 && <p className="px-2 py-2 text-sm text-ink-3">Sem resultados para «{q.trim()}».</p>}
          {groups.map((g) => (
            <div key={g.group}>
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{GROUP_LABEL[g.group]}</p>
              {g.hits.map((h) => {
                const i = flat.indexOf(h);
                return (
                  <button
                    key={`${h.group}-${h.id}`}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h.href)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === active ? "bg-accent/10 text-accent" : "hover:bg-surface-2"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{h.title}</span>
                      {h.subtitle && <span className="block truncate text-xs text-ink-3">{h.subtitle}</span>}
                    </span>
                    {h.amount != null && <span className={`num shrink-0 text-xs ${h.amount < 0 ? "text-bad" : "text-good"}`}>{fmtEur(h.amount, 2)}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length > 0 && (
            <button type="button" onClick={() => go(`/pesquisa?q=${encodeURIComponent(q.trim())}`)} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-surface-2">
              Ver todos os resultados para «{q.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}
