import Link from "next/link";
import { requireUser } from "@/lib/access";
import { AdminTabs } from "./tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser("ADMIN");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
        <AdminTabs />
      </div>
      {children}
      <p className="mt-6 text-xs text-ink-3"><Link href="/" className="hover:underline">← Voltar à visão geral</Link></p>
    </>
  );
}
