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
| Medium | 22 | 22 | 0 |
| Low | 43 | 43 | 0 |
| Info | 4 | 4 | 0 |
| **Total** | **74** | **74** | **0** |

The "proposal" column was 28 before the proposals were approved; all are now applied
(see below).

The most serious problem was a chain that let **any signed-in member make themselves an
executive** (F33), which then opened the whole-database debugging tools and, on a
multi-society stack, a takeover of other people's accounts (F34, F35). The other High:
**exec-only internal notes were sent to every member's browser** and only hidden on
screen (F03). All of these are fixed and were tested end to end.

What was applied follows the ground rules: security fixes that only block unauthorised
or invalid use, and changes with no visible effect. Anything a legitimate user would
notice, even a bug fix, was a **proposal**, applied only once approved (all now are).

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

## Proposals, approved and applied

All the proposals below were approved and are applied on branch `audit-proposals`, one
commit each (F10 and F11 share a theme across three). Each was tested against the dev
server on the scratch database (26 checks: sign-in limits, session revocation, the
Origin check, request scoping, the treasury guards, AHEGS scoping and the page loads
for every role). F66 was tested as a real upgrade on a throwaway stack: built from the
previous code on a copy of the seed data, then upgraded, restored both ways, and
installed fresh.

| Finding | What changed | Commit |
|---|---|---|
| F05 | The printing allowance counts this calendar year only | 9f29dee |
| F36 | `User.sessionVersion`: a password change, a reset or removal ends older sessions; the device that changed it signs back in | 0e6c2d2 |
| F38 | The last executive can't demote themselves | 2079bc7 |
| F39 | Emails are lowercased when added; a post-push fix lowercases stored ones | a3bf86c |
| F41 | A director's own AHEGS row is read-only to them; AHEGS changes are audited | 2db1124 |
| F04 | Mark reimbursed sends the amount shown and refuses if it changed; claim edits log before and after | 443f3eb |
| F06 | Printing contact details only for the requester and executives | cf3bd60 |
| F08 | Owners can't edit bookings Arc has decided (bar the room) or finished event requests | be3ce4a |
| F37 | Wrong passwords: 10 per account and 50 per address per 15 minutes | b44a4e5 |
| F69 | Caddy overwrites `CF-Connecting-IP` | fab1420, 4d453f5 |
| F19 | `/link` codes from the Account page; the bot stays off without `DISCORD_GUILD_ID` | 66c7b5f, c651a2f, 2990f60 |
| F10, F11 | The booking warning, exec queue, board, AHEGS, budget and claims use the society's date | 86cac79, 1c89401, 4a42240 |
| F12 | `npm run dev` runs in UTC | 732eae3 |
| F14 | A claim and everything it creates is one transaction | b6b417a |
| F17 | Other people's tour records stay out of the exec queue and the allowance | 9e59d1b |
| F21 | A production stack without `RUBRIC_SECRET_KEY` refuses to save a new Rubric session or webhook | 1d6b14f |
| F22, F23 | Exec-queue posts fit Discord's limits; webhook URLs are built with `URL` | 0afaacc |
| F24 | Demo visitors can't change webhooks | eccbbdb |
| F26 | SMTP requires TLS, has timeouts, and sends without holding the request | 0365a37 |
| F28 | Rubric writes are audited before they're sent, with their target | 1046b92 |
| F29 | Event syncs to Discord run one at a time per request | 6ad974f |
| F45 | Renaming a title carries its holders; title changes are audited | 413c194 |
| F46 | Event and booking pages open only to the people their lists show them to | 18ef844 |
| F47 | API writes with another site's Origin are refused | 5805c4c, a3a7f0e, 45da2bd |
| F50 | Password, profile, bank, title and portfolio changes are audited | 53c9857 |
| F54 | The AHEGS merge copes with emoji and non-Latin titles | 766ed50 |
| F55 | Only an image can be served publicly as a logo | a246dec |
| F56 | Dollar-quote tags with digits are accepted | c5b3734 |
| F57 | SQL results keep duplicate column names; a 10 second lock timeout; results expire after a day | bf4cec3, 6a4f079 |
| F58 | `$&` and control characters can't corrupt the AHEGS export | b75715f |
| F59 | One backup per stack at a time; leftover upload files are cleared | 6a4f079 |
| F66 | The app connects as `portal_app`, a schema owner that isn't a superuser (`prisma/app-role.sql`) | 067b464 |
| F67 | `X-Frame-Options: DENY` and `frame-ancestors 'none'` | f2eac03 |
| F68 | Formula-looking cells in the Rubric exports get a leading `'` | af9d16d |
| F70 | `umask 027`, and each archive is owned by the backups folder's owner | 3ddf8c4 |
| F72 | A failed connection brings a form's button back with a message; the Rubric members list keeps the latest filter | 7c787aa |
| F31 | A webhook Discord says is gone isn't retried; role ID changes are audited | 5f7839d |
| F32 | Another executive pays out an executive's own claim; amounts show to the cent | 6dac70d |
| F74 | `@auth/prisma-adapter` removed | 819058c |

Testing caught two mistakes of my own before anything was pushed. F69's first version put
an unquoted `": "` in the compose file, which stops compose parsing it at all (4d453f5).
And F47's first version compared `Host` with the port included, which nginx strips,
so every save on a portal opened at a port would have been refused (a3a7f0e).

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
