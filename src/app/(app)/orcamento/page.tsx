import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The budget now lives inside the expenses page; old links keep working. */
export default async function BudgetRedirect({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  redirect(month && /^\d{4}-\d{2}$/.test(month) ? `/despesas?month=${month}#orcamento` : "/despesas#orcamento");
}
