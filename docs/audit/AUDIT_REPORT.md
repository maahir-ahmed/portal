# Security and bug audit: society portal

Branch `audit-sweep`, cut from `phase-5-updates` at a8d8bda. Every fix is its own commit
and can be reverted alone. Nothing was run against the live SecSoc or PCSoc stacks:
testing used a scratch copy of the seed data (`sp_p4l` on the mini-PC) and throwaway
containers, all removed afterwards.

## Summary

| Severity | Found | Fixed (fully or in part) | Proposal only |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 4 | 4 | 0 |
| Medium | 22 | 16 | 6 |
| Low | 43 | 23 | 20 |
| Info | 4 | 2 | 2 (1 note only) |
| **Total** | **74** | **46** | **28** |

The most serious problem was a chain that let **any signed-in member make themselves an
executive** (F33), which then opened the whole-database debugging tools and, on a
multi-society stack, a takeover of other people's accounts (F34, F35). The other High:
**exec-only internal notes were sent to every member's browser** and only hidden on
screen (F03). All of these are fixed and were tested end to end.

What was applied follows the ground rules: security fixes that only block unauthorised
or invalid use, and changes with no visible effect. Anything a legitimate user would
notice, even a bug fix, is a **proposal** in its own section below and is not applied.

### Needs you, outside the code

1. **Rotate the Discord bot token and webhook** in `tempenv.env`, then delete the file.
   A review agent's redaction failed and printed them into its own working transcript
   (F62). They were never committed: `git log` has no trace of them.
2. **GitHub, Settings › Actions › General: require approval for all outside
   contributors' workflows** (F61). The repo is public and the deploy runner on the
   mini-PC is self-hosted and in the docker group: a fork's pull request that adds its own
   workflow could run on that box. Better still, deploy by pull instead of a runner.
3. **Check `RUBRIC_SECRET_KEY` is set** in the hosted stacks' env files (F21). I didn't
   read them. Without it the Rubric session and Discord webhooks sit in plain text in the
   database and every backup.
4. **Tag `v1.0.0`** before anyone self-hosts: installs follow the `1` tag, which doesn't
   exist until then.

## Findings fixed

Lines are as they were when found; most files have moved since.

### Critical

| ID | Where | Problem and impact | Fix | Commit |
|---|---|---|---|---|
| F33 | `src/app/api/societies/route.ts:13` | Creating a society needed only a session, and made the caller its EXECUTIVE. On any stack, a subcommittee member (or a removed member with a live session) could found "x", become its exec, and with debug tools on run SQL against the whole database (password hashes, bank details) or restore over it. | Founding is refused when `SOCIETY_SLUG` is set (every real stack), and refused to anyone already an exec, which is exactly where the setup page offers it. | 10fb595 |

### High

| ID | Where | Problem and impact | Fix | Commit |
|---|---|---|---|---|
| F03 | `requests/{content,room-booking,treasury}/[id]/page.tsx`, `content-requests/[id]/route.ts` GET | Internal (exec-only) comments were loaded for everyone and passed to the client `ThreadView`, which only hid them. Any member could read exec notes on any event or booking from the page source; a claim's owner could read the notes about their claim. The GET API returned them too. | Filtered in each query for non-executives. Verified: a director sees the public note only, an exec both. | 8d698fe |
| F34 | `src/lib/debugServer.ts:14` | The debugging tools act on the whole database but were gated by "exec of the society in the URL", so on a multi-society stack one society's exec held every society. | Tools exist only on a single-society stack, and only for that society. | 186d7b3 |
| F35 | `members/[membershipId]/reset-password/route.ts`, `members/[membershipId]/route.ts` | An exec of any society could attach an existing account by email and reset its password (returned to them), taking over an account another society relies on. | Password resets and phone edits are refused for an account that belongs to another society. | 0558858 |
| F61 | `.github/workflows/deploy.yml` | Self-hosted runner on a public repo (see "Needs you"). The workflow also had a default-permission token and interpolated the branch into shell. | Read-only token, branch passed through `env`. The repo setting is yours. | 30b99b1 |

### Medium

| ID | Where | Problem and impact | Fix | Commit |
|---|---|---|---|---|
| F02 | `src/lib/email.ts:44` | Member-typed text (event names, booking dates) went into exec notification email HTML unescaped: a working phishing link or tracking pixel, sent from the society's own address. | Escaped. | 3b7caa5 |
| F04 | `treasury/[id]/route.ts:49-126` | An owner's edit was checked against the status read at the start, not at write: an amount could change while an exec paid it, or just after. | The owner's write re-checks the status; a lost race is a 409. Exec flow unchanged. | bdb0e77 |
| F06 | `printing/route.ts` GET | Every requester's phone and email went to every member. | Only execs and the requester get them from the API (unused by the UI). The detail page is a proposal. | dce26ad |
| F07 | `content-requests/[id]/route.ts:116` | Anyone's `status` was logged, notified and posted to Discord even though only a manager's is applied. | Announced only when applied. | 8072fde |
| F08 | `content-requests/[id]/route.ts`, `room-bookings/[id]/route.ts` PATCH | No validation: a wrong type, bad enum or date was an uncaught Prisma error (500). | Type-only zod schemas, as forgiving as the code (empty strings and nulls still ignored). Verified with the forms' exact payloads. | 344d94c |
| F19 | `src/lib/discordBot.ts` | `/print` (spike, off by default) worked in any server the app was added to. | Optional `DISCORD_GUILD_ID` limits it to the society's server. | 6ca7dd6 |
| F20 | `scripts/rubric-snapshot.ts`, `src/lib/rubricDemo.ts` | The demo snapshot script (writes a committed, public file) re-implemented the Rubric call without saving rotated sessions, never stripped credentials, and missed `phonenumber`/`studentnumber`. Dormant: the committed file is sample data. | Goes through `postRubric`, `scrubResponse` first, wider matching, and checks in `check:rubric`. | 65c08cc |
| F40 | `src/app/api/me/route.ts` | On the demo, a visitor could move the shared account's email, breaking sign-in for everyone after. | Refused for the demo account. | 9c85a87 |
| F51 | `deploy/backup.sh`, `src/app/uploads/[...path]/route.ts` | A crafted restore archive could carry a symlink (restored, then served to any signed-in user: `/proc/self/environ`, the app's secrets) or psql commands (`\!` runs a shell). | Archives with links or psql commands are refused; uploads are served only if they are regular files. Tested with busybox tar and awk. | 319e1eb |
| F52 | `src/lib/xlsx.ts` | A small .xlsx could inflate without limit or claim column ZZZZZZ, building rows of 300 million cells: the server freezes or dies. | Only the two read entries are inflated, each capped at 50MB; columns past XFD are refused. | ffd0ac2 |
| F53 | `deploy/backup.sh` | Uploads were counted, then archived: one arriving in between made the archive fail validation for good, unnoticed until a restore. | The finished archive is checked and made again if needed. | 3d45a13 |
| F62 | `.dockerignore` | `tempenv.env` (live token) would be copied into local build layers. | Any `*.env` kept out of both build contexts and git. Rotation is yours. | accdd0c |
| F63 | `portal`, `portal.ps1` | Self-hosted updates ran `git pull` on `main`, so any push reached every box overnight against older images. | Scripts follow the newest release tag on the image's channel; `latest` still follows main. | e0ab7b4, 1f0c414 |
| F64 | `.github/workflows/images.yml` | Actions pinned to movable tags while publishing images that install themselves. | Pinned to commits. | 225d845 |
| F65 | `docker-compose.dev.yml` | Dev Postgres on every interface with a known password; a dev DB can hold real members. | Localhost only. | 514516a |
| F37 | `src/lib/auth.ts` | Unknown emails returned without hashing, so timing showed which emails have accounts. | Same work either way (measured 246 vs 251 ms). The rate limiter is a proposal. | 5413488 |

### Low

| ID | Where | Problem and impact | Fix | Commit |
|---|---|---|---|---|
| F01 | `scripts/check-rubric.ts` | My own commit bad96e8 had weakened the host check to the https URL only. | Bare host again. | 025c09d |
| F09 | treasury, content, room-booking routes | Year 20255 dates accepted; the year pickers then list every year up to it. Invalid treasury dates were a 500. | One `isPlausibleDate` rule (parses, 2000 to 2100). | 6e1eee8 |
| F12 | `Dockerfile` | Typed-in times are only right because the container happens to run in UTC. | `TZ=UTC` pinned in the image (no change today). | f4ab42b |
| F13 | `threads/[id]/comments/route.ts` | Any member could comment on another member's claim; `requestType` was a free string. | Owner or exec only on claims; enum. | c9a696a |
| F14 | treasury and printing routes | No caps (amounts overflowing Decimal(10,2) gave a 500), any string as a receipt or print file (an off-site "receipt"). | Caps; file links must be from this server's uploads. | 1f5ae20 |
| F15 | `treasury/[id]/route.ts` | A draft could be submitted with amount 0 sent in the same request. | Checked on the merged values. | 9c2922a |
| F16 | `src/lib/rubric.ts` | While Rubric was down, every Printing page load waited on it again. | At most one try per 15 minutes per society. | 965d2c0 |
| F18 | `years/route.ts`, budget category routes | 2026-02-30 became 2 March; every category error was reported as a duplicate name. | Real days only; only P2002 is a duplicate. | 81b28ea |
| F21 | `rubric/call/route.ts`, env examples | Wrong key gave a bare 500; the examples don't mention the key. | Clear error; examples list it. | b52cf3f |
| F25 | `content-requests/[id]/rubric/route.ts` | Accepted form-encoded bodies (the cross-site form shape), no schema. | JSON only, validated. | 1dd0098 |
| F27 | `discordBot.ts`, `discord/interactions/route.ts` | No replay window; the reply could fail unseen. | 5 minute window; reply caught with a timeout. | d524988 |
| F28 | `rubric/credentials/route.ts` | Bad input was a 500. | 400. | 341deaa |
| F42 | `login/LoginForm.tsx` | Open redirect after sign-in via `callbackUrl` (instant on the demo). | Same-site paths only. | c20c80a |
| F43 | `src/lib/auth.ts` | `update()` copied any client name into the session, used in notifications and Discord posts. | Re-read from the database. | 7ea3713 |
| F44 | `titles` routes | Another society's portfolio id accepted. | Checked against the society. | 93af6d9 |
| F48 | upload and serving routes | A removed member's live session could still upload and read files. | Active membership required. | 9a1f559 |
| F49 | notifications, submit-event, titles | `limit=abc`, unknown ids and duplicate titles gave 500s. | 4xx. | 5728dbe |
| F55 | `societies/[society]/route.ts` | A logo is public; setting it to a receipt's path made the receipt public. | New logos must be uploaded images. | ceb0cd9 |
| F56 | `src/lib/debugTables.ts` | The SQL runner's transaction guard missed `...; COMMIT;` on one line and `E''` strings. | Caught. | ed52613 |
| F60 | `api/upload/route.ts`, `uploads.ts` | Malformed uploads were a 500; a non-numeric size setting switched the cap off. | 400; falls back to 10MB. | 5455be4 |
| F67 | `next.config.ts`, `deploy/nginx.conf` | No `nosniff` or referrer policy; versions advertised. | Added; `X-Powered-By` and `server_tokens` off. | dc88bf7 |
| F71 | `next.config.ts` | Wildcard image host turned `/_next/image` into an open image proxy; `next/image` is unused. | Removed. | d43e138 |
| F73 | `portal.ps1` | `portal.env` readable by other Windows users. | Restricted to the installing account. | f03483a |

### Info

| ID | Problem | Fix | Commit |
|---|---|---|---|
| F30 | `RUBRIC_CALLS[type]` found `__proto__`; exec-queue embeds lacked an explicit `allowed_mentions`; GHCR's `Link` header could send the pull token elsewhere. | `Object.hasOwn`, `allowed_mentions: { parse: [] }`, origin pinned. | c4c93a7 |
| F74 | Dead files: applied data fixes, starter images, legacy root compose file, `auto-deploy.sh`, `db:migrate`/`db:reset` (which would wipe a database). | Removed at your request. | 642928e, cb0b99e, d45ff83, fc54d76 |

## Proposals awaiting your approval

Each would change what a legitimate user sees or can do, so none is applied.

**Medium**
- **F05 Printing allowance counts all-time spend.** The sum has no date bound, so last
  year's printing eats this year's allowance. Bound it to the current year (confirm
  Arc's allowance is per year).
- **F36 Sessions are never revoked.** A JWT survives a password reset, a password change
  and removal for up to 30 days. Add `User.sessionVersion`, checked in the `jwt`
  callback. Other devices would sign out after a password change.
- **F38 The last executive can demote themselves**, locking everyone out of Members and
  Settings. Refuse when no other active exec would remain.
- **F39 Adding a member keeps the email's case**, but sign-in lowercases it: a member
  added as `Jane.Doe@…` can never sign in. Lowercase it, plus a one-off fix for existing
  rows.
- **F41 Directors can edit their own AHEGS row** (category, hours); AHEGS writes aren't
  audit logged.
- **F66 The app and SQL runner connect as a Postgres superuser**, so the runner can
  `COPY ... TO PROGRAM` (a shell in the db container). Use a role that owns the schema
  only.
- **F04 (rest)**: send the amount the exec confirmed with "Mark reimbursed" and refuse if
  it changed; put before and after values in the audit entry.
- **F06 (rest)**: hide other requesters' phone and email on the printing detail page.
- **F08 (rest)**: refuse owner edits to bookings Arc has approved and to finished
  content requests (the UI already hides the buttons).
- **F37 (rest)**: rate limit sign-in and password checks per IP and email.
- **F19 (rest)**: require `DISCORD_GUILD_ID`, and replace username linking with one-time
  `/link` codes before switching `/print` on for real members.

**Low**
- **F10, F11 Naive dates compared with the server's clock**: the seven-business-day
  warning, exec-queue grants, the board and the AHEGS default date use UTC "today", so
  they are wrong for 10 to 11 hours a day in Sydney. Use `wallClockNow`.
- **F12 (rest)**: run the dev server with `TZ=UTC` too.
- **F14 (rest)**: wrap claim creation in one transaction.
- **F17 Tutorial demo records appear in the real exec queue and allowance.**
- **F21 (rest)**: refuse to store a secret in plain text when the key is missing.
- **F22 Exec-queue posts aren't truncated** and silently fail past Discord's limits
  (most likely for urgent room bookings).
- **F23 Webhook URLs with `?thread_id=`** break because the URL is built by joining strings.
- **F24 Demo visitors can set the demo's Discord webhooks.**
- **F26 SMTP** uses opportunistic TLS, has no timeouts, and is awaited inside requests.
- **F28 (rest)**: audit Rubric writes before the call, and record the event id.
- **F29 Two syncs at once can post an event twice.**
- **F45 Renaming a title orphans the members who hold it.**
- **F46 Request detail pages are open to every member**, while lists are scoped (may be
  intended for events; less clear for bookings with safety-officer details).
- **F47 CSRF rests on SameSite=Lax only**: add an Origin check for non-GET API calls.
- **F50 State changes with no audit entry**: password, email and bank changes, titles,
  portfolios, AHEGS.
- **F54 The AHEGS PDF merge fails** on emoji or CJK text in a title.
- **F55 (rest)**: only treat image extensions as public logos when serving.
- **F56 (rest)**: accept dollar-quote tags with digits (`$fn1$`), refused today.
- **F57 The SQL runner** merges duplicate column names, keeps results forever, and has
  no `lock_timeout`.
- **F58 The AHEGS export corrupts** on `$&` in a name, or on control characters.
- **F59 Two backups at once** make one fail; leftover incoming files are never cleaned.
- **F67 (rest)**: `frame-ancestors`/`X-Frame-Options` (check nothing embeds the demo).
- **F68 CSV formula injection** in the Rubric exports (ticket-holder names are public input).
- **F69** nginx trusts `CF-Connecting-IP` from the Caddy container.
- **F70 Backups are world-readable** (`umask 027` in backup.sh).
- **F72 Spinners stick** on network errors in about 40 forms; a Rubric members filter race.

**Info**
- **F31** A dead webhook makes reminders retry every 10 minutes forever; role ID changes
  aren't audited.
- **F32 (note only)** "$50" rather than "$50.00" in one notification; an exec can mark
  their own claim reimbursed.
- **F74 (rest)** `@auth/prisma-adapter` does nothing with JWT sessions.

## Refactors

Kept to what removed real duplication or made the code safer to change:
- `postRubric` (Phase 4, re-checked here) is now also used by the snapshot script, which
  had its own copy of the call (F20).
- `requireActiveMember` and `blockForeignAccountWrite` in `src/lib/api.ts`: one check
  each, shared by the routes that need it.
- `isPlausibleDate` and `safeCallback` in `src/lib/utils.ts`, `UPLOADED_FILE` in
  `src/lib/uploads.ts`: one rule each instead of per-route regexes.
- The single-society rule for the debug tools lives in `debugToolsEnabled`, so the tab
  and the API can't disagree.

No style-only rewrites. Comments added say why (the attack each check stops).

## Baseline and final results

| Check | Baseline (a8d8bda) | Final |
|---|---|---|
| `npm run lint` | clean | clean |
| `npx tsc --noEmit` | clean | clean |
| `check:*` scripts | 12 pass | 13 pass (new `check:security`, plus new cases in `check:rubric`, `check:import`, `check:debug`) |
| `npm run build` | passes | passes |
| `npm audit` | 16 moderate, all ESLint toolchain (minimatch); 0 in runtime deps | unchanged |
| `audit:layout`, 24 pages x 5 widths | 7 sideways-scroll, all existing (AHEGS table, Rubric tabs) | the same 7, nothing new |

There is no unit-test framework (CLAUDE.md). The `check:*` scripts are the suite, and
every security fix has an assertion in one of them. Each fix was also exercised against
the running app with the scratch seed data.

Not tested here: `portal.ps1` (parse-checked only, no Docker on Windows), macOS, and the
race path in F04 (it can't be triggered reliably from outside).

## Checklist and sources

Every route, page and script was reviewed by area (auth and API; uploads, parsers and
debug tools; money, requests and dates; Discord, Rubric and outbound calls; frontend and
infrastructure) against:

- Object-level authorisation on every route and page (IDOR), client-supplied ids or
  roles, mass assignment, role escalation.
- Raw SQL with interpolation, path traversal, unchecked file types and parsers (zip bombs).
- XSS (`dangerouslySetInnerHTML`, user URLs), HTML injection into emails, open redirects.
- SSRF through webhooks or user URLs, missing timeouts.
- Secrets in code and history, errors leaking internals, missing rate limits, CSRF.
- Supply chain: hallucinated or unused packages, mutable action tags, known CVEs.
- Swallowed errors, duplicated logic, dead code, weakened tests.
- Correctness: races, transactions, timezones and naive dates, money rounding and
  overflow, null handling.

Sources:
- Vercel, [Next.js May 2026 security release](https://vercel.com/changelog/next-js-may-2026-security-release),
  and [Next.js security update, October 14 2026](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
  (16.4.3 is past both).
- GitLab advisory [CVE-2026-23870](https://advisories.gitlab.com/npm/react-server-dom-webpack/CVE-2026-23870/),
  React Server Components DoS, fixed in 19.2.6. Next bundles a 19.3 canary, so the app
  isn't exposed; the top-level `react` 19.2.4 is worth a bump.
- [CVE-2026-73421](https://www.wiz.io/vulnerability-database/cve/cve-2026-73421),
  next-auth fail-open, fixed in 5.0.0-beta.32 (installed).
- OWASP [API Security Top 10 2023](https://www.radware.com/cyberpedia/application-security/owasp-api-security-top-10/)
  (BOLA first) and the [SSRF Prevention Cheat Sheet](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/4a2852f456ccac403e140b6b48beb53ce505a550/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md).
- Prisma, [raw queries](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries).
- AI coding mistakes: [slopsquatting](https://thenewstack.io/slopsquatting-the-newest-threat-to-your-ai-generated-code/)
  (the USENIX Security 2025 package-hallucination study) and the
  [CSA note on AI-generated code](https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-generated-code-vulnerability-surge-2026/).
- Discord interactions signatures, e.g. [Ed25519 without an SDK](https://dev.to/sendotltd/discord-slash-commands-without-an-sdk-ed25519-in-250-lines-of-typescript-208l).
- [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html),
  and [real client IPs behind Cloudflare](https://linuxcapable.com/how-to-restore-real-client-ips-in-nginx-behind-cloudflare-or-a-reverse-proxy/).
