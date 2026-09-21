import { auth } from "@/auth";
import { globalSearch } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Não autenticado", { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const { groups } = await globalSearch(session.user, q, { perGroup: 4 });
  return Response.json({ groups }, { headers: { "Cache-Control": "no-store" } });
}
