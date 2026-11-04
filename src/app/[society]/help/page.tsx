import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { modulesForSociety } from "@/lib/modulesServer";
import { emailSettings, botSettings } from "@/lib/serverSettings";
import { updatesEnabled } from "@/lib/updates";

// Help & guides: the setup checklist and plain-language guides, in the app so nobody
// has to find docs/SELF_HOSTING.md. Settings covers everything it can; the last section
// lists the few things only the server's owner can change, and why.

export const dynamic = "force-dynamic";

const GUIDE = "https://github.com/maahir-ahmed/portal/blob/main/docs/SELF_HOSTING.md";

function Guide({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-lg border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium marker:text-muted-foreground">{title}</summary>
      <div className="space-y-2 border-t px-4 py-3 text-sm leading-relaxed text-foreground/90 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </details>
  );
}

export default async function HelpPage({ params }: { params: Promise<{ society: string }> }) {
  const { society: slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const membership = await prisma.societyMembership.findFirst({
    where: { userId: session.user.id, society: { slug }, isActive: true },
    select: {
      role: true,
      societyId: true,
      society: { select: { logoUrl: true, discordWebhookUrl: true, eventsWebhookUrl: true } },
    },
  });
  if (!membership) redirect("/");
  const isExec = membership.role === "EXECUTIVE";
  const modules = await modulesForSociety(membership.societyId);
  const s = (path: string) => `/${slug}${path}`;

  let checklist: { done: boolean; label: string; detail: string; href: string }[] = [];
  if (isExec) {
    const [email, bot, members, notInvited] = await Promise.all([
      emailSettings(),
      botSettings(),
      prisma.societyMembership.count({ where: { societyId: membership.societyId, isActive: true } }),
      prisma.societyMembership.count({ where: { societyId: membership.societyId, isActive: true, inviteStatus: "NOT_INVITED" } }),
    ]);
    const soc = membership.society;
    checklist = [
      { done: !!soc.logoUrl, label: "Add your logo", detail: "It shows in the menu and on the sign-in page.", href: "/settings/general" },
      { done: !!email, label: "Set up email", detail: "So new members get their sign-in details in their inbox.", href: "/settings/email" },
      {
        done: members > 1 && notInvited === 0,
        label: "Bring in your committee",
        detail:
          notInvited > 0
            ? `${notInvited} imported ${notInvited === 1 ? "person hasn't" : "people haven't"} been sent their sign-in details yet.`
            : "Add people one at a time on Members, or import a spreadsheet.",
        href: notInvited > 0 ? "/members" : "/settings/members",
      },
      {
        done: !!(soc.discordWebhookUrl || soc.eventsWebhookUrl),
        label: "Connect Discord (optional)",
        detail: bot ? "Channels, reminders and the /print and /claim bot." : "Post new requests into your committee's channels.",
        href: "/settings/discord",
      },
    ];
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Help & guides</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          How to use the portal, and how to set it up. New here? The{" "}
          <span className="font-medium text-foreground">Take the tour</span> button in the menu shows you around each page.
        </p>
      </div>

      {isExec && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Setting up</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={s(c.href)} className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/50">
                  {c.done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" aria-label="Done" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" aria-label="To do" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Using the portal</h2>
        <Guide title="Your account">
          <p>
            On <Link className="underline" href={s("/account")}>My Account</Link> you can change your name, email, zID
            and password, and save your bank details so reimbursement claims fill them in for you.
          </p>
          <p>Forgot your password? Ask an executive: they can give you a new temporary one.</p>
        </Guide>
        <Guide title="Getting money back for something you bought">
          <ol>
            <li>Keep the receipt. A photo or PDF is fine.</li>
            <li>
              Go to <Link className="underline" href={s("/requests/treasury")}>Treasury</Link> and start a new claim.
            </li>
            <li>Fill it in, read the rules, tick that you agree, and submit.</li>
            <li>An executive checks it and pays you. You can follow its progress on the same page.</li>
          </ol>
        </Guide>
        {modules.printing && (
          <Guide title="Printing posters and handouts">
            <p>
              On <Link className="underline" href={s("/requests/printing")}>Printing</Link>, upload a print-ready PDF or
              Word file, say how many copies and when you&apos;ll collect it. Ask at least two business days ahead.
            </p>
          </Guide>
        )}
        {modules.roomBookings && (
          <Guide title="Booking a room">
            <p>
              On <Link className="underline" href={s("/requests/room-booking")}>Room Bookings</Link>, ask for a room at
              least seven business days before the event: the student union needs that long.
            </p>
          </Guide>
        )}
        {modules.events && (
          <Guide title="Getting help promoting an event">
            <p>
              On <Link className="underline" href={s("/requests/content")}>Events &amp; Content Requests</Link>, describe
              the event and tick what you need (a poster, a blurb, a ticket page). The marketing team picks it up from
              there, and the colour of each card shows how close its deadline is.
            </p>
          </Guide>
        )}
      </section>

      {isExec && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">For executives</h2>
          <Guide title="Adding your committee">
            <ul>
              <li>
                <b>One at a time:</b> on <Link className="underline" href={s("/members")}>Members</Link>, click Add
                member. They get a temporary passphrase, by email if email is set up.
              </li>
              <li>
                <b>From a spreadsheet:</b> on{" "}
                <Link className="underline" href={s("/settings/members")}>Settings › Import members</Link>, download the
                template, fill it in and upload it. You see a preview before anything is saved. Imported people show as
                &quot;not invited&quot; until you open them and click <b>Issue passphrase</b>.
              </li>
              <li>Everyone chooses their own password the first time they sign in.</li>
            </ul>
          </Guide>
          <Guide title="Email">
            <p>
              Set it up in <Link className="underline" href={s("/settings/email")}>Settings › Email</Link>. It walks you
              through Brevo or Resend (both free), and has a button to send yourself a test. You need a domain you can add
              DNS records to, such as your society&apos;s website address.
            </p>
            <p>
              Notifications can be emailed too (Settings › Features), but watch the daily limit of your email
              service&apos;s plan: going over can stop sign-in emails as well.
            </p>
          </Guide>
          <Guide title="Discord">
            <p>
              In <Link className="underline" href={s("/settings/discord")}>Settings › Discord</Link> you can post new
              requests into your committee&apos;s channels, ping the right role, send deadline reminders, and let members
              send print jobs with <code>/print</code> and claim money back with <code>/claim</code>. Each part has its own
              step-by-step instructions there.
            </p>
          </Guide>
          <Guide title="Switching features on and off">
            <p>
              <Link className="underline" href={s("/settings/features")}>Settings › Features</Link> hides anything your
              society doesn&apos;t use. Nothing is deleted: switch it back on and it&apos;s all still there.
            </p>
          </Guide>
          {updatesEnabled() && (
            <Guide title="Updates and backups">
              <p>
                The portal updates itself overnight and takes a backup first. If an update doesn&apos;t start, it goes
                back to the version before by itself. Settings › General shows the version you&apos;re on and lets you
                install a new one at the next nightly check.
              </p>
              <p>A backup of everything is also taken every night and kept on the server.</p>
            </Guide>
          )}
          {updatesEnabled() ? (
            <Guide title="What only the server can change">
              <p>
                A few settings live on the computer that runs the portal, not in here: the app can&apos;t change where it
                lives, or turn on tools that could take it over. Whoever installed it changes them by running a command in
                the portal folder (on Windows, <code>powershell -ExecutionPolicy Bypass -File portal.ps1</code> instead of{" "}
                <code>./portal</code>):
              </p>
              <ul>
                <li>
                  <b>The web address, or how people reach it:</b> edit <code>portal.env</code>, then{" "}
                  <code>./portal install</code>.
                </li>
                <li>
                  <b>Restoring a backup:</b> <code>./portal restore</code> followed by the backup&apos;s file name.
                </li>
                <li>
                  <b>Installing an update straight away:</b> <code>./portal update</code>.
                </li>
                <li>
                  <b>Moving to a new computer:</b> take a backup with <code>./portal backup</code>, install on the new one,
                  then restore it there.
                </li>
                <li>
                  <b>The debugging tools</b> (raw database access): <code>ENABLE_DEBUG_TOOLS=true</code> in{" "}
                  <code>portal.env</code>, then <code>./portal start</code>. Off by default, on purpose.
                </li>
              </ul>
              <p>
                The full guide, with every step and what to do when something goes wrong, is{" "}
                <a className="underline" href={GUIDE} target="_blank" rel="noreferrer">
                  on GitHub
                </a>
                .
              </p>
            </Guide>
          ) : (
            <Guide title="Something you can't find in Settings?">
              <p>
                The web address, backups and the portal&apos;s version are looked after by whoever runs the server it&apos;s
                on. Ask them.
              </p>
            </Guide>
          )}
        </section>
      )}
    </div>
  );
}
