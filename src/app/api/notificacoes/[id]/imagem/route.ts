import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** The charts image of one of the signed-in user's own notifications. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const n = await prisma.notification.findFirst({ where: { id, userId: session.user.id }, select: { image: true } });
  if (!n?.image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(n.image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
