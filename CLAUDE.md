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
npm run db:push             # sync schema (this project has NO migrations dir)
npm run db:seed             # demo society + accounts
npm run check:rubric        # invariant checks, see below
npm run check:tutorial
npm run check:passphrase
npm run check:ahegs
npm run check:bookings
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

- `https://api.hellorubric.com` appears in exactly one file: the proxy route
  [src/app/api/societies/[society]/rubric/call/route.ts](src/app/api/societies/[society]/rubric/call/route.ts).
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
an idempotent, guarded SQL file in [prisma/data-fixes/](prisma/data-fixes/) named
`YYYY-MM-<topic>-<n>-<step>.sql`, with a header comment saying it must run **before**
`db push`. These are applied by hand with `psql` on the box — `prisma db execute` doesn't
work in the runtime image.

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

Domain constants that are not schema live in `src/lib/`: printing rates and secretarial
allowances in [printing.ts](src/lib/printing.ts), the nine portfolios and exec titles in
[portfolios.ts](src/lib/portfolios.ts). A member's portfolio is *always* derived from their
title via `portfolioForTitle` — it is never accepted from the client.

## Uploads

Written to `process.cwd()/uploads` (a Docker volume in prod) with a random UUID filename.
Both the MIME type and the extension are allowlisted, and svg/html are excluded because
they execute script when rendered same-origin. A caller can narrow the allowlist for its
own field by posting an `accept` value (`NARROWED` in the upload route) — AHEGS minutes
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
