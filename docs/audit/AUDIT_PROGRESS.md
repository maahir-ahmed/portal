# Audit progress

Branch: `audit-sweep` (cut from `phase-5-updates` at a8d8bda). Report:
[AUDIT_REPORT.md](AUDIT_REPORT.md) (written at the end).

## Status

- [ ] Step 1: baseline (checks, lint, types, build, layout sweep, npm audit)
- [x] Step 2: research checklist (sources gathered; checklist goes in the report)
- [ ] Step 3: sweep (five review areas, run in parallel)
  - [ ] Auth, sessions, proxy, API authorisation
  - [ ] Uploads, files, parsers, debugging tools
  - [x] Treasury, money, requests, dates (report in)
  - [x] Discord, Rubric, updates, email, outbound calls (report in)
  - [ ] Frontend rendering, infrastructure, dependencies, git history
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
| F03 | High | requests | internal (exec-only) comments sent to every viewer in the RSC payload; content-request GET API too | fix | done (this commit) |
| F04 | Medium | treasury | owner amount edit not status-guarded at write (race with payout) | fix (guard); proposal (expectedAmount, audit before/after) | todo |
| F05 | Medium | printing | allowance sums all-time spend, not per year | proposal | - |
| F06 | Medium | printing | requester phone/email visible to every member (page + GET API) | fix API (unused by UI); proposal page | todo |
| F07 | Medium | content | PATCH logs/notifies/posts a status change it didn't make | fix | todo |
| F08 | Medium | requests | room-booking and content-request PATCH have no zod, 500 on bad input | fix (validation); proposal (owner status gate) | todo |
| F09 | Low | dates | far-future/invalid dates accepted (yearOptions blowup) | fix | todo |
| F10 | Low | dates | seven-business-day rule uses UTC today | proposal | - |
| F11 | Low | dates | other naive-vs-real now comparisons (queue grants, board, AHEGS default) | proposal | - |
| F12 | Low | dates | typed datetimes parsed in server-local TZ; prod correct only because TZ unset | fix (pin TZ=UTC) | todo |
| F13 | Low | threads | any member can comment on any treasury thread; requestType free string | fix | todo |
| F14 | Low | treasury | POST loosely validated (lengths, amount cap, receipt URLs), not atomic | fix (caps, transaction); proposal (URL pattern if any doubt) | todo |
| F15 | Low | treasury | draft submitted with amount 0 in the same PATCH | fix | todo |
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

## Commits

- F01: tighten check:rubric host match (this commit)

## Next step

Work down the todo rows by severity (F03 first), one commit each, verifying each in
the code before changing it. Triage the remaining review reports as they arrive.

## Baseline (a8d8bda, before any audit change)

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npx tsc --noEmit` | clean |
| 12 `check:*` scripts | all pass |
| `npm run build` | passes |
| `npm audit` | 16 moderate, all in the ESLint toolchain (minimatch ReDoS); `--omit=dev`: 0 |
| `audit:layout` (scratch seed DB, 24 pages x 5 widths) | (running) |

There is no unit-test framework: the `check:*` scripts are the suite (CLAUDE.md).
