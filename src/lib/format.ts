export const fmtEur = (v: number, digits = 2) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

export const fmtEurShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-PT", { maximumFractionDigits: 2 })} M€`;
  if (a >= 10_000) return `${(v / 1000).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} k€`;
  return fmtEur(v, 0);
};

export const fmtPct = (v: number, digits = 1) => `${(v * 100).toLocaleString("pt-PT", { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;

export const fmtNum = (v: number, digits = 2) => v.toLocaleString("pt-PT", { maximumFractionDigits: digits });

export const fmtDate = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("pt-PT", { timeZone: "UTC" });
};

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
};

export const todayIso = () => isoDate(new Date());

export const ASSET_TYPE_LABEL: Record<string, string> = {
  CURRENT_ACCOUNT: "Conta à ordem",
  PPR: "PPR",
  BROKERAGE: "Carteira de investimentos",
  STOCK_PORTFOLIO: "Carteira de ações (manual)",
  CRYPTO: "Criptomoedas",
  CASH: "Dinheiro físico",
  OTHER: "Outro",
};

export const ASSET_CLASS_LABEL: Record<string, string> = {
  EQUITY: "Ações",
  BOND: "Obrigações",
  GOLD: "Ouro e matérias-primas",
  CRYPTO: "Criptomoedas",
  CASH: "Liquidez",
  REAL_ESTATE: "Imobiliário",
  MIXED: "Fundos mistos",
  OTHER: "Outros",
};

export const ASSET_CLASS_COLOR: Record<string, string> = {
  EQUITY: "var(--s1)",
  BOND: "var(--s3)",
  GOLD: "var(--s4)",
  CRYPTO: "var(--s7)",
  CASH: "var(--s5)",
  REAL_ESTATE: "var(--s2)",
  MIXED: "var(--s6)",
  OTHER: "var(--s8)",
};

export const CATEGORY_KIND_LABEL: Record<string, string> = {
  EXPENSE: "Despesa",
  INCOME: "Rendimento",
  TRANSFER: "Transferência",
  INVESTMENT: "Investimento",
};

/** True when a value is older than `days` (default 45). */
export const isStale = (date: string | null, days = 45) => !!date && Date.now() - new Date(date).getTime() > days * 86400e3;
