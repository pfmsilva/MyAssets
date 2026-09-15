"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/admin/utilizadores", "Utilizadores"],
  ["/admin/membros", "Família"],
  ["/admin/ativos", "Ativos"],
  ["/admin/categorias", "Categorias e regras"],
  ["/admin/instrumentos", "Cotações"],
  ["/admin/atividade", "Atividade"],
];

export function AdminTabs() {
  const p = usePathname();
  return (
    <div className="flex flex-wrap gap-1">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={`btn btn-sm ${p.startsWith(href) ? "btn-primary" : ""}`}>{label}</Link>
      ))}
    </div>
  );
}
