import type { Society, SocietyMembership } from "@prisma/client";
import type { DefaultSession } from "next-auth";

type Memberships = (SocietyMembership & { society: Society })[];

// The credentials provider hangs the user's memberships off the session, which
// NextAuth's own types know nothing about — declare them once here instead of
// casting to `any` at every read site.
declare module "next-auth" {
  interface User {
    memberships?: Memberships;
  }
  interface Session {
    user: DefaultSession["user"] & { id: string; memberships?: Memberships };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    memberships?: Memberships;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    memberships?: Memberships;
  }
}
