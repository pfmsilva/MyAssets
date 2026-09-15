import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authConfig, DEV_LOGIN } from "./auth.config";
import { logActivity } from "@/lib/activity";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null; image?: string | null; role: Role };
  }
}

const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

/** Ensures the user row exists (pre-registered by an admin, or the configured admin email). */
async function resolveUser(email: string, name?: string | null, image?: string | null) {
  const e = email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: e } });
  if (!user && e === adminEmail) {
    user = await prisma.user.create({ data: { email: e, name, image, role: "ADMIN" } });
  } else if (!user && DEV_LOGIN) {
    user = await prisma.user.create({ data: { email: e, name, role: "VIEWER" } });
  }
  if (user && e === adminEmail && user.role !== "ADMIN") {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }
  return user;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    async signIn({ user, account }) {
      if (!user.email) return;
      const u = await prisma.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { id: true, name: true } });
      await logActivity({ id: u?.id, email: user.email.toLowerCase(), name: u?.name ?? user.name }, "login", { details: { provider: account?.provider } });
    },
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (token?.email) await logActivity({ id: (token.uid as string) ?? null, email: token.email, name: token.name }, "logout");
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.email) return false;
      const u = await resolveUser(user.email, user.name, user.image);
      return !!u; // unknown emails are refused
    },
    async jwt({ token }) {
      if (token.email) {
        const u = await prisma.user.findUnique({ where: { email: token.email.toLowerCase() } });
        if (u) {
          token.uid = u.id;
          token.role = u.role;
          token.name = u.name ?? token.name;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = (token.uid as string) ?? session.user.id;
      session.user.role = (token.role as Role) ?? "VIEWER";
      return session;
    },
  },
});
