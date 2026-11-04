import { prisma } from "./db";
import { decryptSecret } from "./secrets";
import { formatDateTime, formatTimeRange, statusLabel } from "./utils";

// The marketing channel's copy of each event request. Posted once, when the request
// is first submitted (drafts are private), pinging the marketing director role; after
// that every change on the website edits the same message, so the channel always
// shows the current version. Discord doesn't ping again on an edit, so edits are quiet.
//
// The channel can be a text channel or a forum. Discord says which on the first post
// (a forum refuses a post without a thread title), and Society.eventsWebhookForum
// remembers it. In a forum each request is its own post; in a text channel people open
// a thread on the message. Either way the thread's ID is the message's ID, so
// discordMessageId is also where a request's updates and reminders go.

const TIMEOUT = 5000; // a Discord post is never worth holding a submission open for
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The webhook URL with `path` added and `params` set. Built with URL rather than by
 * joining strings, because a pasted webhook may already carry a query (?thread_id=…
 * to post into a thread) that a second "?" would break.
 */
export function webhookUrl(base: string, path = "", params: Record<string, string | null | undefined> = {}) {
  const u = new URL(base);
  u.pathname = u.pathname.replace(/\/$/, "") + path;
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
}
const FORUM_NEEDS_TITLE = 220001; // Discord's error code for a forum post without thread_name

type Sent = { ok: true; id: string; forum: boolean } | { ok: false; status: number };

/**
 * Posts to a webhook and returns the message, starting a forum post titled `title` if
 * the webhook turns out to belong to a forum. `forum` says what's already known, saving
 * the first try. `threadId` posts into an existing thread instead.
 */
export async function postToWebhook(
  url: string,
  payload: object,
  opts: { title: string; forum?: boolean; threadId?: string | null }
): Promise<Sent> {
  const send = (forum: boolean) =>
    fetch(webhookUrl(url, "", { wait: "true", thread_id: opts.threadId }), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
      body: JSON.stringify(forum && !opts.threadId ? { ...payload, thread_name: cut(opts.title, 100) } : payload),
    });
  let forum = !!opts.forum;
  let res = await send(forum);
  if (!forum && !opts.threadId && res.status === 400) {
    const err = (await res.clone().json().catch(() => ({}))) as { code?: number };
    if (err.code === FORUM_NEEDS_TITLE) {
      forum = true;
      res = await send(true);
    }
  }
  if (!res.ok) return { ok: false, status: res.status };
  const message = (await res.json()) as { id: string };
  return { ok: true, id: message.id, forum };
}

/** The events webhook's URL, or null if none is set or it can't be read. */
export function eventsWebhook(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptSecret(stored);
  } catch {
    return null; // stored under a key we no longer have
  }
}

/**
 * Posts or updates the request's message on the events webhook, if one is set, then
 * posts `note` (say, "Status changed to Completed by Sam") into its thread. Never
 * throws: a broken webhook must not fail the request that triggered it.
 */
export function syncEventToDiscord(contentRequestId: string, note?: string): Promise<void> {
  // One at a time per request: two syncs at once (an edit and a status change landing
  // together) would both see no message yet and post the event twice.
  // ponytail: in-process queue, enough for the single app container; a second replica
  // would need a database lock instead.
  const next = (syncing.get(contentRequestId) ?? Promise.resolve()).then(() => syncNow(contentRequestId, note));
  syncing.set(contentRequestId, next);
  void next.finally(() => {
    if (syncing.get(contentRequestId) === next) syncing.delete(contentRequestId);
  });
  return next;
}

const syncing = new Map<string, Promise<void>>();

async function syncNow(contentRequestId: string, note?: string): Promise<void> {
  try {
    const r = await prisma.contentRequest.findUnique({
      where: { id: contentRequestId },
      include: {
        submittedBy: { select: { name: true } },
        society: { select: { id: true, eventsWebhookUrl: true, eventsWebhookRoleId: true, eventsWebhookForum: true } },
      },
    });
    if (!r || r.status === "DRAFT") return;
    const url = eventsWebhook(r.society.eventsWebhookUrl);
    if (!url) return;
    const forum = r.society.eventsWebhookForum;

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
        `${roleId ? `<@&${roleId}> ` : ""}New marketing request from ${r.submittedBy.name}: **${r.eventName}**.` +
        (forum ? "" : "\nPlease create a thread on this message to discuss it"),
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

    let messageId = r.discordMessageId;
    if (messageId) {
      // A forum post's starter message lives in its thread, so the edit has to say so.
      const res = await fetch(webhookUrl(url, `/messages/${messageId}`, { thread_id: forum ? messageId : null }), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT),
        // Discord never pings on an edit, so resending the content (role mention and all)
        // is quiet, and keeps older messages' wording in step with this file.
        body: JSON.stringify({ content: payload.content, embeds: payload.embeds, allowed_mentions: payload.allowed_mentions }),
      });
      // Someone deleted the message (or the webhook was swapped for another channel):
      // post it afresh below rather than leave the channel without it.
      if (res.status === 404) messageId = null;
      else if (!res.ok) console.warn(`Events webhook edit returned ${res.status} for request ${r.id}`);
    }

    if (!messageId) {
      const sent = await postToWebhook(url, payload, { title: r.eventName, forum });
      if (!sent.ok) {
        console.warn(`Events webhook returned ${sent.status} for request ${r.id}`);
        return;
      }
      messageId = sent.id;
      await prisma.contentRequest.update({ where: { id: r.id }, data: { discordMessageId: messageId }, select: { id: true } });
      if (sent.forum !== forum) {
        await prisma.society.update({ where: { id: r.society.id }, data: { eventsWebhookForum: sent.forum }, select: { id: true } });
      }
      return; // the new post already shows the latest; no note needed
    }

    // In a text channel there's only a thread if someone opened one, and Discord
    // refuses the post otherwise. That's fine: the edit above already shows the change.
    if (note) {
      await postToWebhook(url, { username: "Society Portal", content: cut(note, 2000), allowed_mentions: { parse: [] } }, {
        title: r.eventName,
        threadId: messageId,
      });
    }
  } catch (err) {
    console.warn("Events webhook failed:", err instanceof Error ? err.message : err);
  }
}
