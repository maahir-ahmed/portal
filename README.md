# Society Platform

Web app for running a university society committee: content requests, room bookings, treasury reimbursements, printing, member management, and a Rubric ([hellorubric.com](https://hellorubric.com)) portal. Built for UNSW Security Society but works for any society.

## Features

**Requests**
- **Content requests**: marketing workflow. The list is ordered by event date, colour-coded by how close the event is, and each status tab shows a count. Marketing directors upload finished graphics, paste the event blurb, and tick items done. Rubric event links generate a transparent QR code automatically.
- **Room bookings**: Arc booking requests, with a warning when external guests need 7 business days' notice.
- **Treasury**: reimbursement claims with amount-based multi-executive approval (≥ $50 needs the treasurer). A claim is visible only to whoever submitted it and to executives. Owners can edit claims and add/remove receipts while a claim is still pending. Bank details saved per user.
- **Printing**: club printing requests costed against a per-tier secretarial budget (Bronze/Silver/Gold), approved by execs; approved requests draw down the budget.

**Spending budget** (exec-only tab) is the yearly budget tracker that replaced the committee's spreadsheet:
- **Current Year**: each category's 2026 budget vs live spend (summed from classified treasury claims), with % used/left bars and an unclassified bucket.
- **History**: archival 2024/2025 budgets, 2025 usage, worst case, and the reasoning/notes behind each figure. Everything is editable in-app.
- Submitters pick the category on the treasury form; execs can reclassify any claim from the budget tab.

**Rubric portal**: reads events, ticket sales, members, grants, and settlements from Rubric, and submits events (including the Arc affiliation form). Executives see everything; directors see the Events tab only.

**Platform**
- Roles: Executive, Director, Subcommittee, with a shared exec queue for anything needing action.
- Per-society branding (logo/banner upload, colours), member directory, titles, notifications, and an audit log.
- Single-society mode: set `SOCIETY_SLUG` to serve one society at the root domain (clean, slug-free URLs).
- **Guided tour**: the mortarboard button in the header walks new committee members through every page with hovering callout boxes. It creates a set of demo records (content request, room booking, reimbursement claim, printing job, budget category, notification) so the pages aren't empty, all tagged `[Tutorial demo]`, and deletes them when the tour ends. Steps above your role are skipped. Arrow keys move, Esc leaves and cleans up.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL · NextAuth v5 · Tailwind CSS v4 · shadcn/ui

## Getting started

Needs Node 20+ and Docker (for the local database).

```bash
npm install

# local Postgres
docker compose -f docker-compose.dev.yml up -d

cp .env.example .env
# set AUTH_SECRET (openssl rand -base64 32) and DATABASE_URL

npm run db:push      # apply schema
npm run db:seed      # demo society + accounts
npm run dev
```

App runs at `http://localhost:3000`. The seed prints demo logins (password `password123`).

## Environment

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth session secret |
| `NEXTAUTH_URL` | Public app URL |
| `SOCIETY_SLUG` | Single-society mode (blank = multi-society) |
| `SMTP_*`, `EMAIL_FROM` | Email notifications (optional) |
| `MAX_FILE_SIZE_MB` | Upload size cap (default 10) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run db:push` | Sync schema to the database |
| `npm run db:seed` | Seed data |
| `npm run db:studio` | Prisma Studio |
| `npm run lint` | ESLint |
| `npm run check:tutorial` | Verifies every guided-tour step still points at a `data-tour` anchor that exists |

## Deployment

Runs in Docker behind Cloudflare Tunnel, with a GitHub Actions self-hosted runner for push-to-deploy. See [`deploy/README.md`](deploy/README.md).

## Structure

```
src/
  app/            routes (App Router); [society]/ holds the per-society UI
  components/     UI + feature components (shadcn/ui in components/ui)
  lib/            auth, db, permissions, rubric, utils
  hooks/          client hooks (e.g. useRubricClient)
  proxy.ts        middleware (auth + single-society URL rewriting)
prisma/           schema + seed
deploy/           Docker compose, env templates, deploy scripts
```

## Notes

Rubric integration talks to [hellorubric.com](https://hellorubric.com) with per-society credentials entered in Settings and stored in your own database. Nothing is committed to this repo, and the Rubric API is undocumented, so those endpoints may break without warning. Not affiliated with or endorsed by Rubric, Arc UNSW, or UNSW.

Built for one society's committee rather than as a general product: expect UNSW/Arc-specific assumptions (room booking rules, Arc grant flow, printing tiers). Issues and PRs are welcome, but there's no support commitment. Found a security bug? Open an issue with no exploit detail and I'll follow up.

## License

[MIT](LICENSE) © Maahir Ahmed
