# CLAUDE.md

Guidance for Claude Code working in this repository.

`README.md` describes *what the app does* (features, setup, env vars) — read it first and
don't duplicate it here. This file covers *how the code is put together* and the things
that will bite you.

## Commands

```bash
npm run dev                 # dev server (needs docker compose -f docker-compose.dev.yml up -d)
npm run build               # next build (standalone output)
npm run lint                # eslint — must be clean
npm run db:push             # sync schema (NO migrations dir), then run prisma/post-push fixes
npm run db:seed             # demo society + accounts
npm run check:rubric        # invariant checks, see below
npm run check:tutorial
npm run check:passphrase
npm run check:ahegs
npm run check:bookings
npm run check:modules
npm run check:debug
npm run check:import
npm run check:urgency
npm run check:discord
npm run check:updates
npm run check:security
npm run audit:layout        # Playwright layout sweep, needs a running dev server
```

There is no test framework. The three `check:*` scripts are the whole safety net —
plain `node:assert` scripts under [scripts/](scripts/) that guard invariants that
would otherwise rot silently. Run the relevant one after touching its area:

| Script | Run it when you touch |
|---|---|
| `check:rubric` | anything under `src/lib/rubric*`, the Rubric proxy route, `src/lib/secrets.ts`, the demo snapshot |
| `check:tutorial` | `src/lib/tutorial.ts` or any `data-tour` attribute |
| `check:passphrase` | `src/lib/passphrase.ts` or the wordlist dependency |
| `check:ahegs` | `src/lib/ahegs.ts`, `src/lib/xlsx.ts`, `src/lib/pdfMerge.ts`, the AHEGS routes, or the templates in `public/` |
| `check:bookings` | `isLateArcSubmission` or anything about Arc's seven-day rule |
| `check:modules` | `src/lib/modules.ts` (which pages and API routes each feature module owns) |
| `check:debug` | `src/lib/debugTables.ts`: the viewer's masked columns, the SQL runner's transaction check |
| `check:import` | `src/lib/csv.ts`, `readTable` in `src/lib/xlsx.ts`, `src/lib/memberImport.ts` (member import parsing and row checks) |
| `check:urgency` | `src/lib/urgency.ts` (deadline stages and "now" on the society's clock) |
| `check:discord` | `verifyDiscordRequest` and `parsePickup` in `src/lib/discordBot.ts` |
| `check:updates` | `src/lib/updates.ts` (image names, version order, release channels) |
| `check:security` | the security audit's fixes (docs/audit/AUDIT_REPORT.md): email escaping, debug-tool gating, login redirects, date bounds, the /print replay window |

`npm run audit:layout` is separate: it drives Chromium over every page at 320–1440px and
reports content that scrolls sideways, gets clipped, or spills out of its flex parent,
plus the guided tour's hovering box. It needs `npm run dev` and an account
(`AUDIT_EMAIL`/`AUDIT_PASSWORD`, default the seed's `alice@example.com`). Screenshots go
to a temp directory, never the repo — they contain real member data.

## Architecture

Single Next.js 16 App Router app. Server Components query Prisma directly; route
handlers under `src/app/api/` serve the client components.

```
src/app/(auth)/login      only unauthenticated page (no self-registration)
src/app/[society]/…       the whole authenticated UI, keyed by society slug
src/app/api/societies/[society]/…   per-society route handlers
src/app/uploads/[...path] serves the uploads volume (auth-gated, Next only serves /public)
src/proxy.ts              middleware: auth guard + single-society URL rewriting
src/lib/                  auth, db, api helpers, rubric, tutorial, domain constants
```

### Society scoping and `SOCIETY_SLUG`

Every UI route lives under `[society]`. In single-society mode (`SOCIETY_SLUG` set)
[proxy.ts](src/proxy.ts) rewrites `/dashboard` → `/{slug}/dashboard` internally so users
see slug-free URLs. **Do not add a redirect from `/{slug}/x` back to `/x`** — the
standalone production server re-enters middleware after the rewrite and you get an
infinite loop. Paths in `ROOT_PATHS` are never rewritten.

Rewrites must be built on the server's own origin, which `proxy()` captures before
NextAuth's `auth()` swaps the request URL for `NEXTAUTH_URL`. Built on the public URL,
Next treats the rewrite as another site and fetches it over the network: every page went
out through the tunnel and back, and fails where the box can't reach its own domain.

The proxy also does two things before any of that:
- **Maintenance**: while a restore runs (Settings > Debugging) every request gets
  `deploy/maintenance.html` with a 503 ([src/lib/maintenance.ts](src/lib/maintenance.ts)).
- **Feature modules**: a society can switch sections off. [src/lib/modules.ts](src/lib/modules.ts)
  is the one map from module to the pages and API prefixes it owns; the proxy 404s the
  pages and 403s the API, and the sidebar and tour filter on the same map. A new page or
  route that belongs to a module needs its prefix there, or it stays reachable when the
  module is off. Content of a module on an always-on page (an exec queue section, a
  dashboard card) is hidden by the page itself, and its tour step carries `module:`.

### Auth and roles

NextAuth v5, JWT sessions, credentials provider only ([src/lib/auth.ts](src/lib/auth.ts)).

Roles are `EXECUTIVE > DIRECTOR > SUBCOMMITTEE`. The rank map is deliberately
duplicated in [src/lib/api.ts](src/lib/api.ts), [src/lib/rubricCalls.ts](src/lib/rubricCalls.ts)
and [src/lib/tutorial.ts](src/lib/tutorial.ts) (different consumers, no shared import).

**The session is browser-readable via `/api/auth/session`.** It carries only the narrow
`SessionMembership` shape from [src/types/index.ts](src/types/index.ts) — never a Prisma
`Society` row, because `Society` holds the Rubric credentials. That leak already happened
once; the `session` callback rebuilds the shape on the way out so old JWTs are defanged.
Adding a field to the session means adding it to `SessionMembership` explicitly.

**Getting an account.** No self-registration. Three ways in: an exec adds someone from
Members (a temporary passphrase, `mustChangePassword`); an exec imports a spreadsheet
(Settings > Import members), which makes accounts with **no password** and memberships
with `inviteStatus = NOT_INVITED` until an exec issues a passphrase from the edit dialog
(then `INVITED`, and `ACTIVE` on first sign-in, in `authorize`); or, on an empty
database only, `/setup?token=<SETUP_TOKEN>` ([src/lib/setup.ts](src/lib/setup.ts)), which
creates the first executive and the society. `/setup` and `/api/setup` are public in the
proxy and check for themselves.

**First-run setup.** `/setup` ([src/app/setup](src/app/setup)) is a wizard over the same
components as the Settings tabs, so it adds no forms of its own. Progress is
`Society.setupStep`; `setupCompletedAt` set means done, and the dashboard sends executives
to `/setup` until it is. Societies that existed before the wizard were marked done by a
post-push fix; a new society made any other way (seed, `POST /api/societies`) must set it
or its execs land in the wizard.

### Route handler shape

Every handler follows the same skeleton — copy it rather than inventing a variant:

```ts
const { session, error: authErr } = await requireAuth();
if (authErr) return authErr;
const { society } = await params;                       // params is a Promise in Next 16
const { membership, error: memErr } = await requireMembership(session!.user.id, society, "EXECUTIVE");
if (memErr) return memErr;
const body = schema.parse(await req.json());            // zod, always
// … prisma work, scoped by membership!.societyId (never a client-supplied society id)
await createAuditLog({ … });                            // state changes
await notifyExecs(…);                                   // things needing exec action
catch (err) { if (err instanceof z.ZodError) → 400; else → 500 }
```

Ownership rules live in the query, not in the UI: treasury claims filter on
`submittedById` unless the caller is an exec, and the same filter is repeated on the
dashboard. If you add a place that lists claims, repeat it.

### Rubric integration

The Rubric session ID is a bearer credential for a third-party system with one
undocumented mega-endpoint, so holding it means holding *every* call including member
deletion and refunds. The rules, all enforced by `npm run check:rubric`:

- `api.hellorubric.com` appears in exactly one file, [src/lib/rubric.ts](src/lib/rubric.ts)
  (`postRubric`), used by the proxy route and `refreshArcTier`.
- The browser calls that proxy via [useRubricClient](src/hooks/useRubricClient.ts) and
  never sees a credential. `scrubResponse` strips any `*session*id*` key at every depth.
- New calls must be added to `RUBRIC_CALLS` in [src/lib/rubricCalls.ts](src/lib/rubricCalls.ts)
  with a `minRole`, a strict zod `params` schema, and `write`/`pii` flags. Unlisted call
  types are rejected. `write` and `pii` calls are audit logged.
- `sessionid` and `societyID` are supplied by the server from the database, never from
  the caller.
- The session is read/written only through [src/lib/rubric.ts](src/lib/rubric.ts), which
  encrypts at rest via [src/lib/secrets.ts](src/lib/secrets.ts) when `RUBRIC_SECRET_KEY` is set.
- `src/components/settings/RubricSettings.tsx` is the one client file allowed to touch a
  credential (write-only, exec typing it in) and is excepted by name in the check script.

### DEMO_MODE

`DEMO_MODE=1` (the public `dev`-branch showcase stack) auto-signs every visitor in as a
shared account, so it is only safe under conditions documented in
[deploy/README.md](deploy/README.md). Three things depend on it in code:

- `blockDemoAccountWrite` in [src/lib/api.ts](src/lib/api.ts) — refuses password/role
  changes to the shared account only.
- The Rubric proxy answers from [src/lib/rubricDemoSnapshot.json](src/lib/rubricDemoSnapshot.json)
  and returns **before any credential lookup**, so a demo box can't reach Rubric at all.
- Pages that read `process.env.DEMO_MODE` need `export const dynamic = "force-dynamic"`;
  one image serves both stacks, so it must be a request-time read, not build-time.

Any new destructive-to-the-demo endpoint should call `blockDemoAccountWrite`.

### Guided tour

[src/lib/tutorial.ts](src/lib/tutorial.ts) is the single source of copy for both the full
tour and the per-page help. Steps point at `data-tour="…"` attributes in the JSX; renaming
one without updating the step is the failure `check:tutorial` exists to catch. Demo records
are identified purely by the `[Tutorial demo]` string prefix plus owner — no schema flag —
and `POST /tutorial/demo` wipes before creating so an abandoned tour self-heals.

## Database

**`prisma db push`, no migrations directory.** The deploy container runs
`prisma db push --accept-data-loss` on every start, so a destructive schema change applies
silently. When a change would lose data (renaming a table, dropping an enum value), write
an idempotent, guarded SQL file in `prisma/data-fixes/` (create it; the applied ones were
removed and live in git history) named
`YYYY-MM-<topic>-<n>-<step>.sql`, with a header comment saying it must run **before**
`db push`. These are applied by hand with `psql` on the box — `prisma db execute` doesn't
work in the runtime image.

Data a change needs **after** the push (a backfill, keeping existing societies as they
were when a new default would change them) goes in `prisma/post-push/*.sql` instead.
[scripts/post-push.mjs](scripts/post-push.mjs) runs each file once, in name order, on
every start and in `npm run db:push`, recording it in `_applied_fixes` (modelled as
`AppliedFix`: a table missing from the schema is dropped by the next push). A fresh
database runs them too, against no rows, which is how a fix targets "societies that
existed before this change". A failing fix rolls back and stops the app starting.

Two kinds of date: typed-in dates (event start, deadline) are naive wall-clock stored as
UTC and shown as-is; real moments (`createdAt`) go through `formatTimestamp(date,
society.timezone)` ([src/lib/utils.ts](src/lib/utils.ts)). `Society.timezone` is set in
Settings > General. The Rubric event timezone stays Sydney: Rubric is UNSW's platform.

Money is `Decimal`; it does not survive a Server Component → Client Component boundary.
Convert with `serialiseCategory` ([src/lib/budget.ts](src/lib/budget.ts)) or `Number()`.

`prisma/seed.ts` is committed and must stay scrubbed: `example.com` emails (RFC 2606),
placeholder zIDs, no real committee members.

## UI conventions

Tailwind v4 with CSS variables in [src/app/globals.css](src/app/globals.css) — monochrome
base, near-black primary, teal (`--brand`, `#00ffd1`) as the single accent for focus/active
states. Outfit is the brand typeface. shadcn/ui primitives live in
[src/components/ui/](src/components/ui/); feature components sit in folders by domain.

Status pills go through `statusColor` / `statusLabel` in [src/lib/utils.ts](src/lib/utils.ts) —
add new enum values there, don't hand-colour a badge. Dates and money go through
`formatDate` / `formatDateTime` / `formatCurrency` (en-AU).

Domain constants that are not schema live in `src/lib/`: printing rates, secretarial
allowances and Arc's member thresholds per tier in [printing.ts](src/lib/printing.ts) (with
Rubric connected, `refreshArcTier` in `src/lib/rubric.ts` sets the tier from the active
member count once a day; `postRubric` there is the only code that calls Rubric), the base policy for each request type in
[policies.ts](src/lib/policies.ts) (societies add their own lines, `PolicyAddition`;
forms read both through `usePolicy`), and SecSoc's nine portfolios in
[portfolios.ts](src/lib/portfolios.ts), now used only by the seed.

A member's *main* portfolio (`SocietyMembership.portfolioId`) is always derived from their
title via `portfolioForTitle` and never accepted from the client. Execs can add more
(`MemberPortfolio`). Anything asking "is this member in that portfolio" must use
`memberPortfolioIds` from [titles.ts](src/lib/titles.ts), not `portfolioId` alone; AHEGS
scoping does (`AhegsScope.portfolioIds`).

Settings is one tab per sub-route under `src/app/[society]/settings/`, sharing a layout
that checks the viewer is an executive. Forms the setup wizard also needs (Features,
Policies) live in `src/components/settings/` and take an `onSaved`.

## Debugging tab

`ENABLE_DEBUG_TOOLS=true` (and never with `DEMO_MODE`) adds Settings > Debugging. Every
route under `/api/societies/[society]/debug/` starts with `requireDebug`
([src/lib/debugServer.ts](src/lib/debugServer.ts)), which 404s when the flag is off.
Backup, validate and restore all shell out to [deploy/backup.sh](deploy/backup.sh), the
one implementation of the archive format, shared with the backup container; don't
reimplement it in TypeScript. Long actions run as jobs whose state is a file in
`BACKUP_OUT`, which the page polls: Cloudflare cuts requests off at 100 seconds, and a
restore restarts the process. Uploads arrive in 16MB chunks: with a proxy, Next buffers
request bodies and silently truncates past `proxyClientMaxBodySize` (next.config.ts).

## Self-hosting

`./portal` (bash 3.2, so it runs on a Mac) and `portal.ps1` (Windows PowerShell 5.1:
no `??`, ternaries or `&&`; never redirect a native command's stderr) are two copies of
the same installer, writing the same `portal.env`. Change one, change the other. Both
wrap the one [deploy/docker-compose.yml](deploy/docker-compose.yml); a self-hosted stack
differs from a hosted one only in settings (`APP_IMAGE`/`WEB_IMAGE`/`BACKUP_IMAGE`,
`APP_BIND`, the `cloudflare`/`caddy` profile via `METHOD`). Any compose change must keep
the hosted stacks rendering the same: unset settings default to what they were before.
`install` only ever appends missing keys (`ensure`), so re-running it is safe; a key that
appears twice takes its last value. Docker commands that need no input get `</dev/null`,
or `compose run` swallows the next answer. Images are published by
[.github/workflows/images.yml](.github/workflows/images.yml); user docs are
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md), written for non-technical execs.

Updates: self-hosted stacks follow the `1` image tag, moved by `v1.x.y` tags (see
deploy/README.md "Releasing"). `./portal tick` (cron or a scheduled task, once a day at
`UPDATE_HOUR`, installed by `autoupdate on`) checks in at `POST /api/system/update`
(bearer `UPDATE_TOKEN`, via `wget` inside the web container) and runs `update`; the
Settings button ("Install at the next check") only sets a request it sees then, which
lets it retry a version that failed before. `update` rolls back by
retagging the previous image IDs if the app doesn't answer in 3 minutes. Self-hosted
stacks set `DB_PUSH_FLAGS=` (empty), so a schema change that would drop data fails the
start there: keep schema changes additive. The app side is
[src/lib/updates.ts](src/lib/updates.ts) (`AppUpdate` row, the GHCR tag check, the
exec banner and Settings card); it is hidden unless `APP_IMAGE` names a registry image
and `UPDATE_TOKEN` is set, so the hosted stacks never show it. Unattended runs set
`PORTAL_UNATTENDED`, which makes any question fail the run instead of hanging.

## Discord

[src/lib/discordEvents.ts](src/lib/discordEvents.ts) owns the events webhook: one post
per request (`discordMessageId`), edited in place, with `note`s posted into its thread.
A forum post's thread ID and a text-channel message's thread ID both equal the message
ID, so there is no separate thread column. Forums are detected from Discord's 220001
error on the first post (`postToWebhook`) and remembered in `Society.eventsWebhookForum`,
which a webhook change resets.

Deadline stages live only in [src/lib/urgency.ts](src/lib/urgency.ts); the events list
colours and the reminders both read them. Deadlines are naive wall-clock, so "now" must
come from `wallClockNow(society.timezone)`, never `Date.now()`. Reminders
([src/lib/reminders.ts](src/lib/reminders.ts)) run from
[src/instrumentation.ts](src/instrumentation.ts) every 10 minutes, only in production
and only with `DISCORD_REMINDERS=on` (the installer sets it; hosted stacks opt in), so
neither a dev server on a copy of real data nor an upgrade starts pinging a real Discord. An `EventReminder`
row per (request, stage) is claimed before posting and deleted if the post fails; the
first stage seen is recorded silently.

The `/print` bot ([src/lib/discordBot.ts](src/lib/discordBot.ts)) is a spike behind
`ENABLE_DISCORD_BOT`: HTTP interactions, Ed25519-checked, deferred reply then `after()`.
`/api/discord/interactions` is public in the proxy; the signature is its auth. Write-up:
[docs/DISCORD_BOT_SPIKE.md](docs/DISCORD_BOT_SPIKE.md).

## Uploads

Written to `process.cwd()/uploads` (a Docker volume in prod) with a random UUID filename.
Both the MIME type and the extension are allowlisted, and svg/html are excluded because
they execute script when rendered same-origin. A caller can narrow the allowlist for its
own field by posting an `accept` value (`NARROWED` in the upload route; the shared lists
are in `src/lib/uploads.ts`, also used by `/print`) — AHEGS minutes
use this to take PDFs only, since they get merged into one document for Arc. The serving route sets `nosniff` and a
`sandbox` CSP. Keep both lists in sync if you add a type.

## Working in this repo

- Comments explain **why**, not what — the existing code is written that way, so match it.
  Deliberate shortcuts carry a `ponytail:` comment naming the ceiling and the upgrade path
  (e.g. the per-process rate limiter in the Rubric proxy).
- Commit messages are a **single imperative subject line, no body, no `Co-Authored-By`
  trailer**. See `git log`.
- Never commit `.env` / `deploy/.env.*`, real member data, or Rubric credentials.
- `main` → production stack, `dev` → public demo stack; pushing either triggers the
  self-hosted-runner deploy in [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
  Don't push without being asked.
