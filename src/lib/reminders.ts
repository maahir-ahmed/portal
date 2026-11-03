import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { eventsWebhook, postToWebhook } from "./discordEvents";
import { STAGES, urgency } from "./urgency";
import { formatDateTime } from "./utils";

// Deadline reminders: when an open event request's content deadline moves into a more
// urgent stage (two weeks, a week, two days, overdue: the colours on the events list),
// ping the portfolio running it under the request's Discord post. Started by
// src/instrumentation.ts, every 10 minutes, in production only.
//
// Each stage a request reaches is an EventReminder row, so it's announced once. The
// first stage the job sees is recorded without a ping: turning this on, or a new
// request (which was just announced), doesn't remind anyone of what they already know.

const OPEN = ["SUBMITTED", "AWAITING_INFORMATION", "IN_PROGRESS"] as const;
const EVERY = 10 * 60_000;

/** One pass over every society's open requests. Exported for tests. */
export async function sendReminders(now = new Date()): Promise<number> {
  const requests = await prisma.contentRequest.findMany({
    where: {
      status: { in: [...OPEN] },
      // Only requests already on Discord: that post is what a reminder hangs off.
      discordMessageId: { not: null },
      society: { eventsWebhookUrl: { not: null }, moduleEvents: true },
    },
    select: {
      id: true,
      eventName: true,
      deadline: true,
      discordMessageId: true,
      portfolio: { select: { discordRoleId: true } },
      reminders: { select: { stage: true } },
      society: { select: { timezone: true, eventsWebhookUrl: true, eventsWebhookRoleId: true, eventsWebhookForum: true } },
    },
  });

  let sent = 0;
  for (const r of requests) {
    const { stage, label } = urgency(r.deadline, r.society.timezone, now);
    const reached = Math.max(-1, ...r.reminders.map((x) => STAGES.indexOf(x.stage as (typeof STAGES)[number])));
    // ponytail: a deadline pushed back and then reached again doesn't ping a second time
    // for a stage it already had. Clear the request's rows on a deadline edit if that matters.
    if (STAGES.indexOf(stage) <= reached) continue;

    // Claimed before posting, so two app instances (or a restart mid-post) can't both send it.
    try {
      await prisma.eventReminder.create({ data: { contentRequestId: r.id, stage } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    if (reached < 0) continue; // first sight: recorded quietly

    const url = eventsWebhook(r.society.eventsWebhookUrl);
    const roleId = r.portfolio?.discordRoleId ?? r.society.eventsWebhookRoleId;
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const link = base ? ` ${base}/requests/content/${r.id}` : "";
    const payload = {
      username: "Society Portal",
      content:
        `${roleId ? `<@&${roleId}> ` : ""}⏰ Content for **${r.eventName}**: ` +
        `${stage === "overdue" ? `overdue (it was due ${formatDateTime(r.deadline)})` : `${label.toLowerCase()} (${formatDateTime(r.deadline)})`}.${link}`,
      allowed_mentions: { roles: roleId ? [roleId] : [] },
    };

    let ok = false;
    try {
      if (url) {
        // Under the post: its forum thread, or the thread someone opened on the message.
        // A text-channel message with no thread refuses that, so post in the channel.
        const opts = { title: r.eventName, forum: r.society.eventsWebhookForum };
        ok = (await postToWebhook(url, payload, { ...opts, threadId: r.discordMessageId })).ok;
        if (!ok && !r.society.eventsWebhookForum) ok = (await postToWebhook(url, payload, opts)).ok;
      }
    } catch (err) {
      console.warn("Reminder post failed:", err instanceof Error ? err.message : err);
    }
    if (ok) sent++;
    // Not sent: free the stage so the next pass tries again.
    else await prisma.eventReminder.deleteMany({ where: { contentRequestId: r.id, stage } });
  }
  return sent;
}

let started = false;

export function startReminders() {
  if (started) return;
  started = true;
  const tick = () =>
    sendReminders().catch((err) => console.warn("Reminders failed:", err instanceof Error ? err.message : err));
  // ponytail: an in-process timer. Several replicas would each tick, which the unique
  // stage row makes harmless; move to a cron container if the app ever scales out.
  setTimeout(tick, 60_000).unref(); // after start-up settles, then every 10 minutes
  setInterval(tick, EVERY).unref();
}
