import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const providers: NextAuthConfig["providers"] = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}
export const DEV_LOGIN = process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
if (DEV_LOGIN) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: async (c) => {
        const email = String(c?.email ?? "").trim().toLowerCase();
        return email ? { id: email, email, name: email.split("@")[0] } : null;
      },
    }),
  );
}

export const authConfig = {
  providers,
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    authorized: ({ auth }) => !!auth?.user,
  },
} satisfies NextAuthConfig;
