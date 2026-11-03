import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ContentRequestForm } from "@/components/requests/ContentRequestForm";

interface Props {
  params: Promise<{ society: string; id: string }>;
}

export default async function EditContentRequestPage({ params }: Props) {
  const { society: societySlug, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug: societySlug }, isActive: true },
  });
  if (!membership) redirect("/");

  const request = await prisma.contentRequest.findUnique({ where: { id } });
  if (!request || request.societyId !== membership.societyId) notFound();

  const isOwner = request.submittedById === session.user.id;
  const canManage = membership.role === "EXECUTIVE" || membership.role === "DIRECTOR";
  if (!isOwner && !canManage) redirect(`/${societySlug}/requests/content/${id}`);

  return (
    <ContentRequestForm
      societySlug={societySlug}
      initial={{
        id: request.id,
        eventName: request.eventName,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate?.toISOString() ?? null,
        location: request.location,
        keyPoints: request.keyPoints,
        deadline: request.deadline.toISOString(),
        bannerRequired: request.bannerRequired,
        blurbRequired: request.blurbRequired,
        rubricRequired: request.rubricRequired,
        otherNotes: request.otherNotes,
        portfolioId: request.portfolioId,
      }}
    />
  );
}
