# Audit progress

Branch: `audit-sweep` (cut from `phase-5-updates` at a8d8bda). Report:
[AUDIT_REPORT.md](AUDIT_REPORT.md) (written at the end).

## Status

- [x] Step 1: baseline (checks, lint, types, build, layout sweep, npm audit)
- [x] Step 2: research checklist (sources gathered; checklist goes in the report)
- [ ] Step 3: sweep (five review areas, run in parallel)
  - [x] Auth, sessions, proxy, API authorisation (report in)
  - [x] Uploads, files, parsers, debugging tools (report in)
  - [x] Treasury, money, requests, dates (report in)
  - [x] Discord, Rubric, updates, email, outbound calls (report in)
  - [x] Frontend rendering, infrastructure, dependencies, git history (report in)
- [ ] Step 4: fixes, one commit each, baseline rerun per area
- [ ] Step 5: report

## In progress

Step 1 baseline, and the five reviews.

## Findings so far

Disposition: **fix** = applied (security fix that only blocks unauthorised/invalid use, or
no behaviour change); **proposal** = changes what a legitimate user sees or can do, waits
for approval; **info** = noted only.

| ID | Sev | Area | Summary | Disposition | Status |
|---|---|---|---|---|---|
| F01 | Low | tests | bad96e8 weakened check:rubric's host check | fix | done 025c09d |
| F02 | Medium | email | member text unescaped in exec notification email HTML | fix | done 3b7caa5 |
| F03 | High | requests | internal (exec-only) comments sent to every viewer in the RSC payload; content-request GET API too | fix | done 8d698fe |
| F04 | Medium | treasury | owner amount edit not status-guarded at write (race with payout) | fix (guard); proposal (expectedAmount, audit before/after) | todo |
| F05 | Medium | printing | allowance sums all-time spend, not per year | proposal | - |
| F06 | Medium | printing | requester phone/email visible to every member (page + GET API) | fix API (unused by UI); proposal page | todo |
| F07 | Medium | content | PATCH logs/notifies/posts a status change it didn't make | fix | done (this commit) |
| F08 | Medium | requests | room-booking and content-request PATCH have no zod, 500 on bad input | fix (validation); proposal (owner status gate) | validation done (this commit); owner status gate is a proposal |
| F09 | Low | dates | far-future/invalid dates accepted (yearOptions blowup) | fix | todo |
| F10 | Low | dates | seven-business-day rule uses UTC today | proposal | - |
| F11 | Low | dates | other naive-vs-real now comparisons (queue grants, board, AHEGS default) | proposal | - |
| F12 | Low | dates | typed datetimes parsed in server-local TZ; prod correct only because TZ unset | fix (pin TZ=UTC) | todo |
| F13 | Low | threads | any member can comment on any treasury thread; requestType free string | fix | done (this commit) |
| F14 | Low | treasury | POST loosely validated (lengths, amount cap, receipt URLs), not atomic | fix (caps, transaction); proposal (URL pattern if any doubt) | todo |
| F15 | Low | treasury | draft submitted with amount 0 in the same PATCH | fix | done (this commit) |
| F16 | Low | printing | refreshArcTier has no backoff, any member page load retries Rubric | fix | todo |
| F17 | Low | tutorial | demo records appear in the real exec queue and allowance | proposal | - |
| F18 | Low | years/budget | SocietyYear accepts 2026-02-30; category errors all reported as duplicate name | fix | todo |
| F19 | Medium | discord | /print accepts any guild; username linking | fix (optional DISCORD_GUILD_ID); proposal (require it, /link) | todo |
| F20 | Medium | rubric | snapshot anonymiser misses phone/student keys, never scrubs credentials, re-implements postRubric | fix | todo |
| F21 | Low | secrets | no key: plain text; wrong key: unhandled 500 in proxy; example envs omit key | fix (docs, try/catch); proposal (refuse plain text) | todo |
| F22 | Low | discord | exec-queue embeds not truncated, Discord 400s silently | proposal | - |
| F23 | Low | discord | webhook URL built by string join; ?thread_id= URLs break | proposal | - |
| F24 | Low | demo | demo visitors can set Discord webhooks | proposal | - |
| F25 | Low | rubric | link route accepts form bodies (CSRF shape), no zod | fix | todo |
| F26 | Low | email | SMTP opportunistic TLS, no timeouts, awaited in requests | proposal | - |
| F27 | Low | discord | /print no replay window; reply outside try, no timeout | fix | todo |
| F28 | Low | rubric | audit only after success, no target id; credentials 500 on bad input | fix (400); proposal (audit) | todo |
| F29 | Low | discord | concurrent first posts duplicate the event post | proposal | - |
| F30 | Info | misc | RUBRIC_CALLS prototype lookup, exec-queue allowed_mentions, GHCR Link origin | fix | todo |
| F31 | Info | discord | reminder retry loop for a dead webhook; role changes not audited | proposal | - |
| F32 | Info | money | "$50" vs "$50.00" in notification; exec can self-reimburse | info | - |
| F33 | Critical | auth | any signed-in member could found a society, become its exec (debug tools, takeover chain) | fix | done 10fb595 |
| F34 | High | debug | debug tools (instance-wide) gated only by exec of the URL's society | fix | done 186d7b3 |
| F35 | High | auth | exec of any society could attach an existing account and reset its password/phone | fix | done 0558858 |
| F36 | Medium | auth | JWT sessions never revoked after reset/password change/removal | proposal | - |
| F37 | Medium | auth | no login rate limit; email enumeration by timing | fix (timing); proposal (limiter) | todo |
| F38 | Medium | members | last executive can demote themselves | proposal | - |
| F39 | Medium | members | add-member doesn't lowercase email, account unusable | proposal | - |
| F40 | Medium | demo | demo visitor can change the shared account's email | fix | done (this commit) |
| F41 | Medium | ahegs | directors can edit their own AHEGS row; AHEGS writes unaudited | proposal | - |
| F42 | Low | auth | open redirect via login callbackUrl | fix | done (this commit) |
| F43 | Low | auth | session update copies client-supplied name/email into the JWT | fix | done (this commit) |
| F44 | Low | titles | titles accept another society's portfolioId | fix | done (this commit) |
| F45 | Low | titles | renaming a title orphans its members | proposal | - |
| F46 | Low | requests | detail views open to all members while lists are scoped | proposal | - |
| F47 | Low | csrf | CSRF rests on SameSite=Lax only (no Origin check) | proposal | - |
| F48 | Low | uploads | upload/read need only a session, not a membership | fix | done (this commit) |
| F49 | Low | api | assorted 500s on invalid input (notifications limit, submit-event, duplicates) | fix | done (this commit) |
| F50 | Low | audit | state changes without audit logs (me, bank, titles, ahegs...) | proposal | - |
| F51 | Medium | backup | restore archive may carry symlinks or psql meta-commands | fix | done (this commit) |
| F52 | Medium | import | xlsx zip bomb / huge column index can OOM the server | fix | done (this commit) |
| F53 | Medium | backup | upload count and tar taken separately: archive may never validate | fix (backup side) | done (this commit) |
| F54 | Low | ahegs | PDF merge throws on emoji/CJK in titles | proposal | - |
| F55 | Low | uploads | logoUrl accepts any upload, making it public | fix (validate new values); proposal (serving rule) | done (this commit) |
| F56 | Low | debug | SQL runner transaction guard bypassable (one-line COMMIT, E'' strings) | fix (refuse more); proposal (accept $fn1$) | done (this commit) |
| F57 | Low | debug | runner merges duplicate column names; results kept forever; no lock_timeout | proposal | - |
| F58 | Low | ahegs | xlsx export corrupts on $& in names / control chars | proposal | - |
| F59 | Low | backup | concurrent archives make one fail; leftover files never cleaned | proposal | - |
| F60 | Low | uploads | malformed multipart 500; MAX_FILE_SIZE_MB NaN disables the cap | fix | done (this commit) |
| F61 | High | ci | self-hosted runner on a public repo (fork PR workflows) | proposal (repo settings) + fix (deploy.yml permissions) | fix done (this commit); repo setting is yours |
| F62 | Medium | secrets | tempenv.env (live Discord token) not in .dockerignore; printed into a review transcript | fix (.dockerignore); user must rotate | done (this commit) |
| F63 | Medium | updates | portal update pulls main, not the release tag | fix | done e0ab7b4 (bash) + this commit (ps1) |
| F64 | Medium | ci | workflow actions pinned to mutable tags while publishing auto-installed images | fix | done (this commit) |
| F65 | Medium | dev | dev Postgres published on all interfaces with a known password | fix | done (this commit) |
| F66 | Medium | db | app and SQL runner connect as Postgres superuser | proposal | - |
| F67 | Low | headers | no security headers; X-Powered-By; server_tokens | fix (nosniff, referrer, tokens); proposal (frame-ancestors) | done (this commit); frame-ancestors is a proposal |
| F68 | Low | export | CSV formula injection in Rubric exports | proposal | - |
| F69 | Low | nginx | CF-Connecting-IP trusted on the Caddy profile | proposal | - |
| F70 | Low | backup | backups world-readable (no umask) | proposal | - |
| F71 | Low | next | wildcard images.remotePatterns, next/image unused | fix | done (this commit) |
| F72 | Low | ui | stuck spinners on network errors; Rubric members race | proposal | - |
| F73 | Low | windows | portal.ps1 doesn't restrict portal.env ACL | fix | done (this commit) |
| F74 | Info | dead code | root docker-compose.yml, auto-deploy.sh, db:migrate/db:reset, applied data-fixes, starter SVGs (user asked for cleanup) | fix | done 642928e cb0b99e d45ff83 fc54d76; unused @auth/prisma-adapter left as proposal |

## Commits

- F01: tighten check:rubric host match (this commit)

## Next step

1. (done) Mirror F63 in portal.ps1: `Update` and `Install` should fetch tags and check out the
   newest `v<channel>.*` tag (see `channel`, `newest_release`, `update_scripts` and the
   re-exec at the top of `cmd_install` in `portal`), with `latest` still pulling main.
   Parse-check with powershell.exe, then commit.
2. Remaining `todo` rows, in order: F13, F15, F04, F06, F09, F12, F14, F16, F18,
   F19, F20, F21, F25, F27, F28, F30, F37 (timing part only). Every other fix row is
   done. Helper for marking rows: a tiny script that rewrites the Status cell of
   `| Fnn |` (or edit by hand). Test scripts go in scripts/_x.ts and are deleted after.
3. After each area: rerun the full baseline (lint, tsc, 13 checks incl. check:security,
   build, audit:layout). Dev server for testing: scratch DB
   `postgresql://society_user:sptest@127.0.0.1:55432/sp_p4l` (tunnel:
   `ssh -fN -L 55432:127.0.0.1:55432 mini-new`), seed logins alice/bob/charlie
   @example.com, password123. Never the local society_platform DB (real data).
4. Write docs/audit/AUDIT_REPORT.md (severity counts, every finding with file/line,
   fix or proposal, commit hash; proposals listed separately; refactors; baseline vs
   final; research sources below).
5. After the audit: the user asked to create release 1 (tag v1.0.0). That needs the
   branches merged and pushed, which deploys prod: confirm with the user first.

Research sources gathered (for the report): Vercel May 2026 Next.js security release;
Next.js Oct 14 2026 security update (16.4.1); GitLab advisory CVE-2026-23870 (React RSC
DoS, fixed 19.2.6; Next vendors 19.3 canary so not exposed); CVE-2026-73421 next-auth
fail-open (fixed beta.32, installed); OWASP API Top 10 2023 (BOLA); OWASP SSRF cheat
sheet; Prisma raw query docs; USENIX Security 2025 package hallucination study and
Veracode 2025 GenAI code report; Discord interactions signature docs; OWASP Docker
cheat sheet.

## Baseline (a8d8bda, before any audit change)

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npx tsc --noEmit` | clean |
| 12 `check:*` scripts | all pass |
| `npm run build` | passes |
| `npm audit` | 16 moderate, all in the ESLint toolchain (minimatch ReDoS); `--omit=dev`: 0 |
| `audit:layout` (scratch seed DB, 24 pages x 5 widths) | 7 sideways-scroll, all pre-existing (AHEGS table, Rubric tabs) |

There is no unit-test framework: the `check:*` scripts are the suite (CLAUDE.md).
