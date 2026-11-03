import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

// A hash at the same cost as real ones, made once on first use, for unknown accounts to
// be checked against.
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash(crypto.randomUUID(), 12));

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

        // Same work either way: answering at once for an unknown email (or an imported
        // account with no password yet) would tell anyone who can time it which emails
        // have accounts here.
        if (!user || !user.passwordHash) {
          await bcrypt.compare(credentials.password as string, await dummyHash());
          return null;
        }

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await prisma.societyMembership.updateMany({
          where: { userId: user.id, inviteStatus: "INVITED" },
          data: { inviteStatus: "ACTIVE" },
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
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.memberships = user.memberships;
      }
      // Reflect profile edits (name/email) made via the account page without re-login.
      // Read from the database, not the update payload: anyone can call update() with
      // any name, and that name goes into notifications and Discord posts as theirs.
      if (trigger === "update" && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, email: true },
        });
        if (fresh) {
          token.name = fresh.name;
          token.email = fresh.email;
        }
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
