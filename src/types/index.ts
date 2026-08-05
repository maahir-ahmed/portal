import type { User, Comment, Role } from "@prisma/client";

export type { Role };

export type CommentWithAuthor = Comment & {
  author: Pick<User, "id" | "name" | "avatarUrl">;
};

// What the session carries about a membership. Deliberately not the Prisma rows:
// Society holds the Rubric credentials, and the session is readable by the browser
// through /api/auth/session.
export type SessionMembership = {
  id: string;
  role: Role;
  societyId: string;
  title: string | null;
  society: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    primaryColor: string;
  };
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string;
  memberships: SessionMembership[];
};
