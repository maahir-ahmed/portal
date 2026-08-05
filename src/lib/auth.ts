import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Behind a reverse proxy (cloudflared) the Host header is external; trust it.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        // Only the fields the UI reads. Whole Society rows used to travel from here
        // into the JWT and back out of /api/auth/session, which handed every logged-in
        // member the society's Rubric session ID.
        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            memberships: {
              where: { isActive: true },
              select: {
                id: true,
                role: true,
                societyId: true,
                title: true,
                society: {
                  select: { id: true, name: true, slug: true, logoUrl: true, primaryColor: true },
                },
              },
            },
          },
        });

        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
          memberships: user.memberships,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.memberships = user.memberships;
      }
      // Reflect profile edits (name/email) made via the account page without re-login.
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.email) token.email = session.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        // JWTs issued before the session was narrowed still hold whole Society rows,
        // Rubric credentials included. Rebuild the shape on the way out so those
        // sessions stop leaking without everyone having to log in again.
        session.user.memberships = (token.memberships ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          societyId: m.societyId,
          title: m.title ?? null,
          society: {
            id: m.society.id,
            name: m.society.name,
            slug: m.society.slug,
            logoUrl: m.society.logoUrl ?? null,
            primaryColor: m.society.primaryColor,
          },
        }));
      }
      return session;
    },
  },
});

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
