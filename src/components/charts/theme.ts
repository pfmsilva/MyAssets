export const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];

export const TYPE_COLORS: Record<string, string> = {
  CURRENT_ACCOUNT: "var(--s1)",
  BROKERAGE: "var(--s2)",
  PPR: "var(--s3)",
  CRYPTO: "var(--s4)",
  CASH: "var(--s5)",
  OTHER: "var(--s7)",
};

export const axisStyle = { fontSize: 11, fill: "var(--text-3)" };
export const gridStyle = { stroke: "var(--grid)", strokeDasharray: "2 4" };
export const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text)" },
  labelStyle: { color: "var(--text-2)", fontWeight: 600 },
  itemStyle: { color: "var(--text)" },
};
