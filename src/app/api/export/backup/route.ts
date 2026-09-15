import { auth } from "@/auth";
import { buildBackupJson } from "@/lib/export";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Não autenticado", { status: 401 });
  if (session.user.role !== "ADMIN") return new Response("Apenas administradores.", { status: 403 });
  const buf = await buildBackupJson();
  await logActivity(session.user, "export.backup", { details: { bytes: buf.length } });
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="peculio-backup-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
}
