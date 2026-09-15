import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export function hasRole(role: Role | undefined, min: Role) {
  return !!role && RANK[role] >= RANK[min];
}

export async function requireUser(min: Role = "VIEWER") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasRole(session.user.role, min)) redirect("/?forbidden=1");
  return session.user;
}

/** For server actions: throws instead of redirecting. */
export async function assertRole(min: Role) {
  const session = await auth();
  if (!session?.user || !hasRole(session.user.role, min)) throw new Error("Sem permissão.");
  return session.user;
}

export const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administração", EDITOR: "Atualização", VIEWER: "Consulta" };
