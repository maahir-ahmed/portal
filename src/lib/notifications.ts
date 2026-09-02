import { prisma } from "./db";
import { sendEmail, notificationEmail } from "./email";
import { decryptSecret } from "./secrets";
import type { NotificationType } from "@prisma/client";

export async function createNotification({
  userId,
  type,
  title,
  body,
  link,
  sendEmailNotification = true,
}: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  sendEmailNotification?: boolean;
}) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, link },
  });

  if (sendEmailNotification) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: title,
        html: notificationEmail(title, body, link),
        text: body,
      }).catch(() => {}); // don't fail the request if email fails
    }
  }

  return notification;
}

/**
 * Posts an exec-queue notification into the society's Discord channel, if one is
 * configured in Settings. Never throws: a broken or revoked webhook must not take
 * down the request that triggered it — the in-app notification is the source of
 * truth and has already been written by the time this runs.
 */
async function postToDiscord(societyId: string, title: string, body: string, link?: string) {
  const society = await prisma.society.findUnique({
    where: { id: societyId },
    select: { discordWebhookUrl: true },
  });
  if (!society?.discordWebhookUrl) return;

  let url: string;
  try {
    url = decryptSecret(society.discordWebhookUrl);
  } catch {
    return; // stored under a key we no longer have
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const description = link && base ? `${body}\n\n[Open in the portal](${base}${link})` : body;

  try {
    // 5s ceiling: Discord occasionally hangs, and an exec-queue post is not worth
    // holding a submission open for.
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        username: "Society Portal",
        embeds: [{ title, description, color: 0x00ffd1, timestamp: new Date().toISOString() }],
      }),
    });
    if (!res.ok) console.warn(`Discord webhook returned ${res.status} for society ${societyId}`);
  } catch (err) {
    console.warn("Discord webhook failed:", err instanceof Error ? err.message : err);
  }
}

export async function notifyExecs(
  societyId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string
) {
  const execs = await prisma.societyMembership.findMany({
    where: { societyId, role: "EXECUTIVE", isActive: true },
    select: { userId: true },
  });

  await Promise.all(
    execs.map((e) =>
      createNotification({ userId: e.userId, type, title, body, link })
    )
  );

  // One channel post for the queue, not one per executive.
  await postToDiscord(societyId, title, body, link);
}
