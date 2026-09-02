import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatDateTime } from "@/lib/utils";
import { ScrollText } from "lucide-react";
import type { AuditAction } from "@prisma/client";

interface Props {
  params: Promise<{ society: string }>;
  searchParams: Promise<{ page?: string; action?: string; type?: string }>;
}

const PER_PAGE = 50;

// Where each entity type's detail page lives, so a row is a link back to the thing it
// happened to. Types not listed here (deleted rows, evidence slots) stay plain text.
const ENTITY_LINKS: Record<string, (id: string) => string> = {
  ContentRequest: (id) => `/requests/content/${id}`,
  RoomBooking: (id) => `/requests/room-booking/${id}`,
  TreasuryRequest: (id) => `/requests/treasury/${id}`,
  PrintingRequest: (id) => `/requests/printing/${id}`,
};

const ACTION_STYLES: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  STATUS_CHANGE: "bg-amber-100 text-amber-700",
  APPROVE: "bg-green-100 text-green-700",
  REJECT: "bg-red-100 text-red-700",
  ASSIGN: "bg-purple-100 text-purple-700",
  COMMENT: "bg-zinc-100 text-zinc-700",
  READ: "bg-zinc-100 text-zinc-600",
  LOGIN: "bg-zinc-100 text-zinc-600",
  LOGOUT: "bg-zinc-100 text-zinc-600",
};

const label = (s: string) => s.replace(/_/g, " ").toLowerCase();

// Everything the app records through createAuditLog, newest first. Executive-only: it
// names who did what, which is not everyone's business.
export default async function AuditLogPage({ params, searchParams }: Props) {
  const { society: societySlug } = await params;
  const { page: pageParam, action, type } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");
  if (membership.role !== "EXECUTIVE") redirect(`/${societySlug}/dashboard`);

  const page = Math.max(1, Number(pageParam) || 1);
  const where = {
    societyId: membership.societyId,
    ...(action ? { action: action as AuditAction } : {}),
    ...(type ? { entityType: type } : {}),
  };

  const [entries, total, types] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.auditLog.count({ where }),
    // The filter offers what this society has actually logged, rather than every
    // entity name in the codebase.
    prisma.auditLog.findMany({
      where: { societyId: membership.societyId },
      select: { entityType: true },
      distinct: ["entityType"],
      orderBy: { entityType: "asc" },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ action, type, ...next })) if (v) p.set(k, v);
    const s = p.toString();
    return `/${societySlug}/executive/audit${s ? `?${s}` : ""}`;
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ScrollText className="h-5 w-5" /> Audit Log
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Every recorded action in this society, newest first. {total} {total === 1 ? "entry" : "entries"}.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FilterChip href={qs({ type: undefined, page: undefined })} active={!type} label="All types" />
        {types.map((t) => (
          <FilterChip
            key={t.entityType}
            href={qs({ type: t.entityType, page: undefined })}
            active={type === t.entityType}
            label={t.entityType}
          />
        ))}
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Nothing logged yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {entries.map((e) => {
              const link = ENTITY_LINKS[e.entityType]?.(e.entityId);
              const meta = e.metadata as Record<string, unknown> | null;
              return (
                <div key={e.id} className="flex items-start gap-3 p-3.5 text-sm">
                  <UserAvatar name={e.user.name} avatarUrl={e.user.avatarUrl} size="sm" className="mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{e.user.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_STYLES[e.action] ?? "bg-zinc-100 text-zinc-700"}`}>
                        {label(e.action)}
                      </span>
                      {link ? (
                        <Link href={`/${societySlug}${link}`} className="text-blue-600 hover:underline">
                          {e.entityType}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{e.entityType}</span>
                      )}
                    </div>
                    {meta && Object.keys(meta).length > 0 && (
                      <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                        {Object.entries(meta).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="flex-shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          {/* asChild passes `disabled` to the anchor, which does nothing and still
              navigates, so an unavailable page is a real disabled button instead. */}
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={qs({ page: String(page - 1) })}>Newer</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>Newer</Button>
          )}
          <span className="text-sm text-muted-foreground tabnums">Page {page} of {pages}</span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={qs({ page: String(page + 1) })}>Older</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>Older</Button>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </Link>
  );
}
