import { auth } from "@/auth";
import { buildFamilyReport } from "@/lib/report";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Não autenticado", { status: 401 });
  if (session.user.role !== "ADMIN") return new Response("Apenas administradores podem exportar o relatório.", { status: 403 });
  const pdf = await buildFamilyReport(session.user.name ?? session.user.email);
  await logActivity(session.user, "report.pdf", { details: { bytes: pdf.length } });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="peculio-relatorio-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
