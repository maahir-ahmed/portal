# Audit progress

Branch: `audit-sweep` (cut from `phase-5-updates` at a8d8bda). Report:
[AUDIT_REPORT.md](AUDIT_REPORT.md) (written at the end).

## Status

- [ ] Step 1: baseline (checks, lint, types, build, layout sweep, npm audit)
- [x] Step 2: research checklist (sources gathered; checklist goes in the report)
- [ ] Step 3: sweep (five review areas, run in parallel)
  - [ ] Auth, sessions, proxy, API authorisation
  - [ ] Uploads, files, parsers, debugging tools
  - [ ] Treasury, money, requests, dates
  - [ ] Discord, Rubric, updates, email, outbound calls
  - [ ] Frontend rendering, infrastructure, dependencies, git history
- [ ] Step 4: fixes, one commit each, baseline rerun per area
- [ ] Step 5: report

## In progress

Step 1 baseline, and the five reviews.

## Findings so far

| ID | Sev | Area | Summary | Status |
|---|---|---|---|---|
| F01 | Low | tests | bad96e8 weakened check:rubric's host check from the bare host to the https URL | fixed |

## Commits

- F01: tighten check:rubric host match (this commit)

## Next step

Finish the baseline and record it below, then triage the review reports as they arrive.

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
