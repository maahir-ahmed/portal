# Society Portal

A portal for running a university society's committee, on a server you control. Members
file event and content requests, room bookings, reimbursement claims and print jobs, and
executives approve them. It also keeps the member list, a spending budget, a to-do board
and your [Rubric](https://hellorubric.com) ticketing in one place.

It's for committees who are tired of chasing this through chat messages and spreadsheets.
You don't need to be a programmer to run it: the installer asks a few questions and does
the rest, and [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) walks through it.

Some features are for [Arc](https://www.arc.unsw.edu.au), the UNSW student organisation:
room bookings, printing, activity grants and AHEGS (Arc's yearly list recognising club
members). They can be switched off, so it suits any club.

- **Self-hosted:** one install script for a cloud server, a Raspberry Pi, or a Windows or Mac computer
- **Updates itself:** new releases install overnight after a backup, and roll back if they don't start
- **Private by default:** no sign-up page, and executives create every account
- **Your data:** one Postgres database and an uploads folder, backed up nightly into a single file

## Contents

- [Install](#install)
- [Features](#features)
- [Updating](#updating)
- [Backups](#backups)
- [Configuration](#configuration)
- [Development](#development)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Install

You need a computer that stays on, with [Docker](https://docs.docker.com/engine/install/)
(Docker Desktop on Windows and Mac). No `git` needed: download the portal, then open a
terminal in its folder.

**Windows or Mac:** on the [GitHub page](https://github.com/maahir-ahmed/portal), click
the green **Code** button, then **Download ZIP**, and extract it somewhere permanent. On a
Mac, keep the folder out of Documents, Desktop and Downloads, which macOS won't let the
nightly update reach. The extracted folder is `portal-main` (on Windows, the one that
contains `portal.ps1`); [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) shows how to open a
terminal in it.

**Linux server or Raspberry Pi:**

```bash
curl -L https://github.com/maahir-ahmed/portal/archive/refs/heads/main.tar.gz | tar xz
cd portal-main
```

Then run the installer, from inside that folder. On a Mac or Linux:

```bash
./portal install
```

On Windows, in PowerShell in that folder:

```powershell
powershell -ExecutionPolicy Bypass -File portal.ps1 install
```

If git is missing, the installer offers to set it up (it asks first), so the portal can
keep its own scripts up to date. Without it, the portal still updates itself. If you
already have git, `git clone https://github.com/maahir-ahmed/portal.git` works as well.

The installer asks for your society's name and your email, then how people will reach the
portal:

1. **A Cloudflare Tunnel** (recommended). No ports to open, so it works at home or on a
   university network. It needs a domain on a free
   [Cloudflare](https://www.cloudflare.com) account.
2. **[Caddy](https://caddyserver.com)**, on a server with a public IP address. It gets
   the HTTPS certificate for you.
3. **Only on this computer**, to try it out.

For the first two it also asks for your web address, such as `portal.example.org`
(and the tunnel's token, for Cloudflare). On Windows it may ask for your timezone too.
Then it downloads everything, starts it, and prints a setup link. Open that link to
create your account and run the setup wizard.

The full walkthrough, with the Cloudflare steps, is in
**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

### Requirements

| | Minimum |
|---|---|
| Machine | 2 GB of memory and 3 GB of disk. A $5 VPS (a rented server), a Raspberry Pi 4 or 5, or a spare PC |
| System | Linux (amd64 or arm64), Windows 10 or 11 (Windows PowerShell 5.1, which is built in), or macOS |
| Docker | Docker Engine on Linux, [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows and Mac |
| Raspberry Pi | The 64-bit Raspberry Pi OS |
| Domain | Optional, but you'll want one for anyone else to use it |

If Docker isn't installed, the installer offers to install it on Linux (with Docker's
official script) and on Windows (with `winget`). On a Mac, install Docker Desktop first.

## Features

### Requests

- **Events and content.** Directors (the heads of each area of the society) request
  graphics and posts for their events. The list is sorted by date and coloured by how
  close each deadline is. Marketing uploads the finished graphics, pastes the blurb and
  ticks items off. Rubric links get a QR code automatically.
- **Room bookings.** Arc room booking requests, with a warning when one is inside Arc's
  seven business days' notice.
- **Reimbursements.** Members submit claims with receipts, and an executive marks them
  paid, including their own. A claim is visible only to the person who submitted it and
  to executives. Bank details are saved per person, on their account page.
- **Printing.** Print jobs are costed with Arc's per-page rates and approved by an
  executive. Each approved job comes off the society's secretarial allowance (what Arc
  gives it to print). With Rubric connected, the portal works out your Arc tier, which
  sets the allowance, from your member count.
- **Comments.** Every claim, event request and room booking has a comment thread, with
  executive-only notes. When someone comments, the other side gets a bell notification
  and, if email is on, an email. Comments don't go to Discord.

### Running the committee

- **Exec queue.** Everything waiting on an executive, in one list.
- **Spending budget.** A yearly budget per category, compared against what's actually
  been claimed, with past years kept for reference.
- **Board.** A to-do board for the executives.
- **Members.** The committee grouped by portfolio (an area of the society, such as
  Events, Marketing or Sponsorship, or whatever your society uses). You can import
  everyone from a spreadsheet.
- **AHEGS.** Arc's yearly list recognising club members. The portal collects the entries
  and minutes through the year, and fills in Arc's spreadsheet and merges the minutes
  into one PDF for you.
- **Rubric.** Events, ticket sales, merchandise, members, activity grants (Arc's money
  for events) and settlements from [Rubric](https://hellorubric.com), the ticketing
  platform many UNSW societies use. You can also publish events and lodge the Arc
  affiliation form without leaving the portal.
- **Discord.** Two webhooks (a link Discord gives a channel so other apps can post in
  it). One channel gets new requests and exec-queue items. An events channel or forum
  gets one post per event request, kept up to date, and the portfolio running an event
  is pinged as its content deadline gets close. An experimental bot also lets members
  use `/print` and `/claim` in Discord to file print jobs and claims, and `/link` to
  connect their account ([notes](docs/DISCORD_BOT_SPIKE.md)).
- **Policies.** Each request form shows the standard rules plus your society's own.
- **Audit log** of who did what, and **notifications** for anything that needs you.

### Getting people started

- **Setup wizard.** On first run it walks you through your society's details,
  portfolios, features, policies, member import and Discord. You can skip any step and
  come back to it in Settings.
- **Guided tour and help.** The tour shows new committee members around every page,
  using sample records it creates and then cleans up. A help button explains the page
  you're on, and **Help & guides** in the menu has a setup checklist and a guide to each
  part.
- **Feature switches.** Turn off the sections your society doesn't use (events, room
  bookings, printing, grants, Rubric, the board, AHEGS, the budget), and they disappear
  from the menu.

## Updating

You usually don't need to do anything. Every night at 4am the server checks for a new
release. If there is one, it backs everything up, installs it and checks that the portal
starts. If the new version doesn't start, it switches back to the previous version, and
doesn't try that version again until a newer one comes out.

While an update is waiting, executives see a banner at the top of the portal.
**Settings › General › Version and updates** shows the version you're on and when the
server checks next. To install straight away, run this in the portal folder on the
server:

```bash
./portal update            # Linux, Pi or Mac
```

```powershell
powershell -ExecutionPolicy Bypass -File portal.ps1 update    # Windows
```

The **Install at the next check** button in that card shows whenever a newer version is
waiting and the server's updater has checked in. It asks the server to install at its next
check. That's also how you retry a version that failed to start before.

To update by hand only, turn the nightly check off, then run `update` when you like.

On Linux, a Pi or a Mac:

```bash
./portal autoupdate off
./portal update
```

On Windows:

```powershell
powershell -ExecutionPolicy Bypass -File portal.ps1 autoupdate off
powershell -ExecutionPolicy Bypass -File portal.ps1 update
```

Updates follow the 1.x releases (the `1` image tag). A 2.0 release won't install on its
own, because it may need you to change something first. Change the hour with
`UPDATE_HOUR` (see [Configuration](#configuration)). More detail, including how releases
are made, is in [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md#updates) and
[deploy/README.md](deploy/README.md#releasing-to-self-hosted-portals).

## Backups

The portal backs up its database and every uploaded file at 3am each night. Each backup
is one `.tar.gz` file in the `backups` folder inside the portal folder, named like
`portal_<date and time>.tar.gz`, and the last 14 days are kept.

Run these in the portal folder on the server (on Windows, use
`powershell -ExecutionPolicy Bypass -File portal.ps1` in place of `./portal`):

```bash
./portal backup                   # back up now
./portal restore backups/<file>   # put one back (asks you to confirm first)
```

Executives can also do this in **Settings › Backups**: it lists the nightly backups and
the ones taken there, lets you download any of them, and restores one you upload.
Backups taken there are kept apart from the nightly ones (in a Docker volume, not the
`backups` folder), so download one to keep it. To move to a new computer, install there
and choose **Restore a backup** on the setup page.

Copy a backup somewhere else now and then. A backup on the same machine won't help if
that machine dies. Keep a copy of `portal.env` too, because it holds the portal's
passwords.

## Configuration

The installer writes `portal.env` in the portal folder, and you can edit it afterwards
with any text editor. To apply a change, run `./portal start` (on Windows,
`powershell -ExecutionPolicy Bypass -File portal.ps1 start`). The settings you're most
likely to touch:

| Setting | What it does |
|---|---|
| `NEXTAUTH_URL` | The portal's address, exactly as people visit it, including `https://` |
| `METHOD` | `cloudflare`, `caddy` or `local` |
| `APP_PORT`, `APP_BIND` | The port the portal listens on, on this machine (default `8080`, or the next free one) and the address it binds to (default `127.0.0.1`, so only this machine) |
| `TZ` | Your timezone, such as `Australia/Sydney`, so the nightly backup runs at your 3am (set from the computer's own at install) |
| `UPDATE_HOUR` | Hour for the nightly update check (default `4`). Run `autoupdate on` again after changing it |
| `BACKUP_HOUR`, `BACKUP_KEEP_DAYS` | When the nightly backup runs, and how many days to keep (`3`, `14`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email (optional): sign-in details for new members, and notifications if turned on in Settings › Features. Easier to set in Settings › Email |
| `MAX_FILE_SIZE_MB` | Largest upload allowed (default `10`) |
| `DISCORD_REMINDERS` | `on` pings a portfolio's role as its deadlines get close (the installer sets it) |
| `ENABLE_DEBUG_TOOLS` | `true` adds a Debugging tab with a database viewer and a SQL runner in the browser. It gives every executive full control of the database, so it's off by default |
| `ENABLE_DISCORD_BOT`, `DISCORD_APP_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | The experimental Discord bot. Set it up in Settings › Discord: if the bot has been saved there, those settings win. These env settings are the older alternative, used only until it is ([notes](docs/DISCORD_BOT_SPIKE.md)) |

Everything else (passwords, the encryption key, the update token, the image names) is
generated for you and best left alone.

## Development

You'll need Node 22 or newer and Docker for the local database.

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # local Postgres
cp .env.example .env                             # then set AUTH_SECRET and DATABASE_URL
npm run db:push
npm run db:seed                                  # a sample society and accounts
npm run dev
```

`.env.example` lists every setting with a comment. At minimum you need `DATABASE_URL`
(the default matches the dev compose file) and `AUTH_SECRET` (any long random string).

It runs at http://localhost:3000.

The seed prints these sample logins, all with the password `password123`:

- `demo@example.com`: executive
- `alice@example.com`: executive
- `bob@example.com`: director
- `charlie@example.com`: subcommittee

The seed refuses to run on a database that has real accounts, so it can't add known
passwords to a live portal. `SEED_FORCE=1` overrides that.

To try the setup wizard instead, skip the seed, set `SETUP_TOKEN` in `.env` and open
`/setup?token=<that value>`.

Built with Next.js 16, React 19, TypeScript, Prisma 7 with PostgreSQL, NextAuth v5,
Tailwind CSS 4 and shadcn/ui. [CLAUDE.md](CLAUDE.md) explains how the code fits together.

```
src/app/          pages and API routes; [society]/ is the portal itself
src/components/   UI components (shadcn/ui in components/ui)
src/lib/          server logic: auth, database, Rubric, Discord, updates
src/proxy.ts      sign-in checks, feature switches and clean URLs
prisma/           database schema, seed and one-time data fixes
scripts/          the check scripts below, and the layout audit
deploy/           Docker images, compose file and backup script
docs/             the self-hosting guide and design notes
portal, portal.ps1  the self-hosting scripts
```

There is no test framework. `npm run lint` checks the code, and each `npm run check:*`
script guards one thing that must not break. Run the one for the area you touched:

| Script | What it checks |
|---|---|
| `check:rubric` | The Rubric session never reaches a browser, every call is allowlisted and role-checked, and the Arc tiers are right |
| `check:tutorial` | Every tour step still points at something on the page |
| `check:modules` | A switched-off feature blocks exactly its own pages and API |
| `check:import` | The CSV and Excel readers and the import's row checks |
| `check:debug` | The database viewer masks credentials, and the SQL runner can't end its own transaction |
| `check:urgency` | Deadline stages and labels, on the society's own clock |
| `check:discord` | Discord's request signatures and the `/print` and `/claim` options |
| `check:updates` | Image names, version order and release channels |
| `check:passphrase` | The temporary passphrase generator: wordlist size and randomness |
| `check:years` | Which financial, AHEGS and events year a date falls in |
| `check:ahegs` | The AHEGS spreadsheet and minutes export |
| `check:bookings` | Arc's seven-day room booking rule |
| `check:security` | The security audit's fixes: email escaping, debug-tool gating, login redirects, date limits and the `/print` replay window |

`npm run audit:layout` loads every page at widths from 320 to 1440px and reports
anything that scrolls sideways. It needs the dev server running.

Deploying from GitHub Actions on every push is covered in
[deploy/README.md](deploy/README.md), along with how releases reach self-hosted portals.

## Security

- There's no self-registration. An account only exists because an executive made it
  or imported it. New members get a temporary four-word passphrase that expires after
  7 days, and must pick their own password before they can do anything.
- Rubric credentials never leave the server. Every Rubric call goes through an
  allowlist that checks the caller's role and parameters. Reads of member data and all
  writes are audit logged, and calls are rate limited per person. The stored Rubric
  session and Discord webhook URLs are encrypted at rest (with `RUBRIC_SECRET_KEY`,
  which the installer sets).
- Reimbursement claims and bank details are visible only to their owner and to
  executives. Executive-only comment notes never reach the person they're about.
- Failed passwords are limited per account and address (10 in 15 minutes), so an
  outsider can't lock you out. Changing or resetting a password signs that account out
  everywhere else.
- The portal talks to its database as a role that owns its tables but isn't a
  database superuser, and refuses form posts from other sites.
- Text members type is escaped before it goes into an email, uploads are limited to safe file types,
  and the backup restore refuses archives that carry links or shell commands.
- The portal can't reach the server's Docker. It can only ask the server's updater to
  run, so a compromised portal can't take over the machine.
- The Debugging tab is off by default and never available on a shared demo.

The code has had a full security audit, and its fixes are pinned by `check:security`.
If you find a vulnerability, please open an issue without exploit details and I'll get
in touch.

## Contributing

Issues and pull requests are welcome. This is maintained by one person, so there's no
support commitment, but bug reports with steps to reproduce
are always appreciated.

The Rubric integration uses Rubric's undocumented API, so it can break without warning.
This project isn't affiliated with or endorsed by Rubric, Arc UNSW or UNSW.

## License

[MIT](LICENSE) © Maahir Ahmed
