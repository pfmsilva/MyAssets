import Link from "next/link";
import { requireUser } from "@/lib/access";
import { AdminTabs } from "./tabs";
import { VERSION, versionTitle } from "@/lib/version";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUser("ADMIN");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AdminTabs />
          <a href="/api/relatorio" className="btn btn-sm btn-primary" target="_blank" rel="noopener">Relatório PDF</a>
        </div>
      </div>
      {children}
      <p className="mt-6 flex flex-wrap justify-between gap-2 text-xs text-ink-3">
        <Link href="/" className="hover:underline">← Voltar à visão geral</Link>
        <span title={versionTitle()}>
          Release v{VERSION.version}{VERSION.shortSha ? ` · commit ${VERSION.shortSha}` : ""}{VERSION.branch ? ` (${VERSION.branch})` : ""}{VERSION.buildDate ? ` · build ${new Date(VERSION.buildDate).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}` : ""}{VERSION.env ? ` · ${VERSION.env}` : ""} · <Link href="/admin/versao" className="hover:underline">histórico</Link>
        </span>
      </p>
    </>
  );
}
