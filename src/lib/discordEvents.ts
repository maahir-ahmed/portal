import { prisma } from "./db";
import { decryptSecret } from "./secrets";
import { formatDateTime, formatTimeRange, statusLabel } from "./utils";

// The marketing channel's copy of each event request. Posted once, when the request
// is first submitted (drafts are private), pinging the marketing director role; after
// that every change on the website edits the same message, so the channel always
// shows the current version and the thread under it stays attached. Discord doesn't
// ping again on an edit, so updates are quiet.

const TIMEOUT = 5000; // a Discord post is never worth holding a submission open for
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Posts or updates the request's message on the events webhook, if one is set. Never
 * throws: a broken webhook must not fail the request that triggered it.
 */
export async function syncEventToDiscord(contentRequestId: string): Promise<void> {
  try {
    const r = await prisma.contentRequest.findUnique({
      where: { id: contentRequestId },
      include: {
        submittedBy: { select: { name: true } },
        society: { select: { eventsWebhookUrl: true, eventsWebhookRoleId: true } },
      },
    });
    if (!r || r.status === "DRAFT" || !r.society.eventsWebhookUrl) return;

    let url: string;
    try {
      url = decryptSecret(r.society.eventsWebhookUrl);
    } catch {
      return; // stored under a key we no longer have
    }

    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    // Slug-free, like the exec queue's Discord links: the deployment is single-society
    // and proxy.ts maps /requests/... onto the society.
    const link = base ? `${base}/requests/content/${r.id}` : undefined;
    const roleId = r.society.eventsWebhookRoleId;

    const requested = [
      r.bannerRequired && `${r.bannerDone ? "✅" : "⬜"} Banner / graphic`,
      r.blurbRequired && `${r.blurbDone ? "✅" : "⬜"} Written blurb`,
      r.rubricRequired && `${r.rubricEventLink || r.rubricEventId ? "✅" : "⬜"} Rubric event`,
    ].filter(Boolean) as string[];

    const closed = r.status === "CANCELLED" || r.status === "COMPLETED";
    const payload = {
      username: "Society Portal",
      content:
        `${roleId ? `<@&${roleId}> ` : ""}New marketing request from ${r.submittedBy.name}: **${r.eventName}**.\n` +
        "Please create a thread on this message to discuss it",
      allowed_mentions: { roles: roleId ? [roleId] : [] },
      embeds: [
        {
          title: cut(`${closed ? `[${statusLabel(r.status)}] ` : ""}${r.eventName}`, 256),
          ...(link ? { url: link } : {}),
          description: cut(r.keyPoints, 4000),
          color: r.status === "CANCELLED" ? 0x71717a : r.status === "COMPLETED" ? 0x16a34a : 0x00ffd1,
          fields: [
            { name: "When", value: `${formatDateTime(r.startDate).split(", ")[0]}, ${formatTimeRange(r.startDate, r.endDate)}`, inline: true },
            { name: "Where", value: cut(r.location, 1024), inline: true },
            { name: "Content needed by", value: formatDateTime(r.deadline), inline: true },
            { name: "Requested", value: requested.length ? requested.join("\n") : "Nothing ticked yet", inline: true },
            { name: "Status", value: statusLabel(r.status), inline: true },
            { name: "Submitted by", value: r.submittedBy.name, inline: true },
            ...(r.otherNotes ? [{ name: "Other notes", value: cut(r.otherNotes, 1024) }] : []),
            ...(r.rubricEventLink ? [{ name: "Rubric event", value: cut(r.rubricEventLink, 1024) }] : []),
          ],
          footer: { text: "Last updated" },
          timestamp: r.updatedAt.toISOString(),
        },
      ],
    };

    if (r.discordMessageId) {
      const res = await fetch(`${url}/messages/${r.discordMessageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
        // Discord never pings on an edit, so resending the content (role mention and all)
        // is quiet, and keeps older messages' wording in step with this file.
        body: JSON.stringify({ content: payload.content, embeds: payload.embeds, allowed_mentions: payload.allowed_mentions }),
      });
      if (res.ok) return;
      // Someone deleted the message (or the webhook was swapped for another channel):
      // post it afresh below rather than leave the channel without it.
      if (res.status !== 404) {
        console.warn(`Events webhook edit returned ${res.status} for request ${r.id}`);
        return;
      }
    }

    // ?wait=true makes Discord return the message, whose id the edits need.
    const res = await fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`Events webhook returned ${res.status} for request ${r.id}`);
      return;
    }
    const message = (await res.json()) as { id?: string };
    if (message.id) {
      await prisma.contentRequest.update({
        where: { id: r.id },
        data: { discordMessageId: message.id },
        select: { id: true },
      });
    }
  } catch (err) {
    console.warn("Events webhook failed:", err instanceof Error ? err.message : err);
  }
}
