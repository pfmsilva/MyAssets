import { readFile } from "node:fs/promises";
import path from "node:path";
import { Card } from "@/components/ui";
import { VERSION, versionTitle } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function VersionPage() {
  let changelog = "";
  try {
    changelog = await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  } catch {
    changelog = "CHANGELOG.md não disponível neste build.";
  }
  const lines = changelog.split("\n");
  return (
    <div className="space-y-4">
      <Card title="Release em produção">
        <pre className="whitespace-pre-wrap text-sm">{versionTitle()}</pre>
        {!VERSION.sha && <p className="mt-2 text-xs text-ink-3">Sem informação de commit (build fora do Vercel e sem git).</p>}
      </Card>
      <Card title="Histórico de versões (CHANGELOG)">
        <div className="space-y-1 text-sm">
          {lines.map((l, i) => {
            if (l.startsWith("## ")) return <h3 key={i} className="mt-4 text-base font-semibold">{l.slice(3)}</h3>;
            if (l.startsWith("# ")) return null;
            if (l.startsWith("- ")) return <p key={i} className="ml-4 text-ink-2">• {l.slice(2)}</p>;
            if (!l.trim()) return null;
            return <p key={i} className="text-ink-2">{l}</p>;
          })}
        </div>
      </Card>
    </div>
  );
}
