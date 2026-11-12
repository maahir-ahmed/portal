import { requirePageMember } from "@/lib/pageAccess";
import { prisma } from "@/lib/db";
import { societyToday } from "@/lib/urgency";
import { BoardClient } from "@/components/board/BoardClient";

interface Props {
  params: Promise<{ society: string }>;
}

export default async function BoardPage({ params }: Props) {
  const { society: societySlug } = await params;
  const { membership } = await requirePageMember(societySlug, { include: { society: { select: { timezone: true } } } }, true);

  const cards = await prisma.boardCard.findMany({
    where: { societyId: membership.societyId },
    include: { createdBy: { select: { name: true, avatarUrl: true } } },
    // Dated cards first, soonest at the top; Postgres sorts NULLs last on ASC, so
    // undated "someday" cards sink to the bottom of their column on their own.
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Board</h1>
          <p className="text-sm text-muted-foreground">
            Shared exec to-do board. Drag a card between columns.
          </p>
        </div>
      </div>

      <BoardClient
        societySlug={societySlug}
        today={societyToday(membership.society.timezone).toISOString()}
        initialCards={cards.map((c) => ({
          id: c.id,
          lane: c.lane,
          title: c.title,
          notes: c.notes,
          dueDate: c.dueDate ? c.dueDate.toISOString() : null,
          authorName: c.createdBy.name,
          authorAvatar: c.createdBy.avatarUrl,
        }))}
      />
    </div>
  );
}
