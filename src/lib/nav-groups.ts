import { Role } from "@prisma/client";

export type NavChild = { href: string; label: string; ai?: boolean; hidden?: boolean };
export type NavGroup = {
  href: string; // where the entry leads (the first page of the group)
  label: string;
  icon: string;
  short?: string;
  min?: Role;
  children?: NavChild[]; // shown as tabs at the top of every page of the group
};

/** The six entries of the menu. Each group's pages appear as tabs inside it. */
export const NAV_GROUPS: NavGroup[] = [
  { href: "/", label: "Visão geral", icon: "home", short: "Início" },
  {
    href: "/ativos",
    label: "Património",
    icon: "wallet",
    short: "Ativos",
    children: [
      { href: "/ativos", label: "Ativos" },
      { href: "/historico", label: "Evolução" },
      { href: "/membros", label: "Família", hidden: true }, // a lista vive em /ativos?ver=membro; as fichas de cada membro continuam aqui
    ],
  },
  {
    href: "/despesas",
    label: "Gastos",
    icon: "receipt",
    children: [
      { href: "/despesas", label: "Despesas e orçamento" },
      { href: "/movimentos", label: "Movimentos" },
    ],
  },
  {
    href: "/rentabilidade",
    label: "Investimentos",
    icon: "trend",
    children: [
      { href: "/rentabilidade", label: "Ganhos e rentabilidade" },
      { href: "/alocacao", label: "Alocação-alvo" },
      { href: "/analise", label: "Análise de IA", ai: true },
    ],
  },
  { href: "/importar", label: "Importar", icon: "upload", min: "EDITOR" },
  { href: "/admin", label: "Administração", icon: "settings", short: "Admin", min: "ADMIN" },
];

const inSection = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/** The group a page belongs to (used for the active menu entry and for the tabs). */
export function groupFor(pathname: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => inSection(pathname, g.href) || g.children?.some((c) => inSection(pathname, c.href)));
}

export const isChildActive = inSection;
