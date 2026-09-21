export type SearchGroup = "pagina" | "membro" | "ativo" | "acao" | "movimento" | "categoria" | "instrumento";

export type SearchHit = {
  group: SearchGroup;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  amount?: number;
};

export const GROUP_LABEL: Record<SearchGroup, string> = {
  pagina: "Páginas",
  membro: "Família",
  ativo: "Ativos",
  acao: "Ações das carteiras",
  movimento: "Movimentos",
  categoria: "Categorias",
  instrumento: "Posições e instrumentos",
};

export const GROUP_ORDER: SearchGroup[] = ["pagina", "membro", "ativo", "acao", "categoria", "instrumento", "movimento"];
