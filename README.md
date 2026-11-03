# Society Portal

A self-hosted portal for running a university society's committee. Event and content
requests, room bookings, reimbursements, printing, the member list and your Rubric
ticketing all live in one place, on a server you control.

It started as the internal tool for UNSW Security Society, and UNSW PC Society runs it
too. Anything Arc-specific (room bookings, printing, activity grants, AHEGS) can
be switched off, so it works for other clubs too.

- **Self-hosted:** one install script for a cloud server, a Raspberry Pi, or a Windows or Mac computer
- **Updates itself:** new releases install overnight after a backup, and roll back if they don't start
- **Private by default:** no sign-up page, and executives create every account
- **Your data:** one Postgres database and an uploads folder, backed up nightly into a single file

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Requirements](#requirements)
- [Updating](#updating)
- [Backups](#backups)
- [Configuration](#configuration)
- [Development](#development)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Features

### Requests

- **Events and content.** Directors request graphics and posts for their events. The
  list is sorted by date and coloured by how close each deadline is. Marketing uploads
  the finished graphics, pastes the blurb and ticks items off. Rubric links get a QR
  code automatically.
- **Room bookings.** Arc booking requests, with a warning when external guests need
  seven business days' notice.
- **Reimbursements.** Members submit claims with receipts and an exec marks them paid.
  A claim is visible only to the person who submitted it and to executives. Bank
  details are saved per person.
- **Printing.** Print jobs are costed with Arc's per-page rates and approved by an exec.
  Each approved job comes off the secretarial allowance. With Rubric connected, the
  allowance follows your Arc tier, which the portal works out from your member count.

### Running the committee

- **Exec queue.** Everything waiting on an executive, in one list.
- **Spending budget.** A yearly budget per category, compared against what's actually
  been claimed, with past years kept for reference.
- **Members.** The committee grouped by portfolio (Events, Marketing, Sponsorship, or
  whatever your society uses). You can import everyone from a spreadsheet.
- **Rubric.** Events, ticket sales, members, grants and settlements from
  [Rubric](https://hellorubric.com). You can also publish events and lodge the Arc
  affiliation form without leaving the portal.
- **Discord.** New requests and exec-queue items post to your channels. An events forum
  gets one post per request, kept up to date, and the portfolio running an event is
  pinged as its content deadline gets close.
- **Policies.** Each request form shows the standard rules plus your society's own.
- **Audit log** of who did what, and **notifications** for anything that needs you.

### Getting people started

- **Setup wizard.** On first run it walks you through your society's details,
  portfolios, features, policies, member import and Discord. You can skip any step and
  come back to it in Settings.
- **Guided tour.** It shows new committee members around every page, using sample
  records it creates and then cleans up. There's also a help button for just the page
  you're on.
- **Feature switches.** Turn off the sections your society doesn't use, and they
  disappear from the menu.

## Quick start

On a Linux server, a Raspberry Pi or a Mac:

```bash
git clone https://github.com/maahir-ahmed/portal.git
cd portal
./portal install
```

On Windows, in PowerShell:

```powershell
git clone https://github.com/maahir-ahmed/portal.git
cd portal
powershell -ExecutionPolicy Bypass -File portal.ps1 install
```

The installer asks for your society's name, your email, and how people will reach the
portal: through a Cloudflare Tunnel (recommended, no ports to open), through Caddy on a
server with a public IP, or only on this computer to try it out. Then it downloads
everything, starts it, and prints a setup link. Open that link to create your account
and run the setup wizard.

The full walkthrough, written for people who don't do this for a living, is in
**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

## Requirements

| | Minimum |
|---|---|
| Machine | 2 GB of memory and 3 GB of disk. A $5 VPS, a Raspberry Pi 4 or 5, or a spare PC |
| System | Linux (amd64 or arm64), Windows 10 or 11, or macOS, with Docker |
| Raspberry Pi | The 64-bit Raspberry Pi OS |
| Domain | Optional, but you'll want one for anyone else to use it |

If Docker isn't installed, the installer offers to install it.

## Updating

You usually don't need to do anything. Each night after 4am the server checks for a new
release. If there is one, it backs everything up, installs it and checks that the
portal starts. If the new version doesn't start, it switches back to the previous
version.

While an update is waiting, executives see a banner at the top of the portal. You can
install it straight away from **Settings › General › Version and updates**.

To update by hand instead:

```bash
./portal autoupdate off
./portal update
```

Updates follow the 1.x releases. A 2.0 release won't install on its own, because it may
need you to change something first.

## Backups

The portal backs up its database and every uploaded file at 3am each night. Each backup
is one `.tar.gz` file in the `backups` folder, and the last 14 days are kept.

```bash
./portal backup                   # back up now
./portal restore backups/<file>   # put one back
```

Copy a backup somewhere else now and then. A backup on the same machine won't help if
that machine dies. Keep a copy of `portal.env` too, because it holds the portal's
passwords.

## Configuration

The installer writes `portal.env`, and you can edit it afterwards. Run
`./portal start` to apply a change. The settings you're most likely to touch:

| Setting | What it does |
|---|---|
| `NEXTAUTH_URL` | The portal's address, exactly as people visit it, including `https://` |
| `METHOD` | `cloudflare`, `caddy` or `local` |
| `UPDATE_HOUR` | Hour for the nightly update check (default `4`) |
| `BACKUP_HOUR`, `BACKUP_KEEP_DAYS` | When the nightly backup runs, and how many days to keep (`3`, `14`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email notifications (optional) |
| `MAX_FILE_SIZE_MB` | Largest upload allowed (default `10`) |
| `DISCORD_REMINDERS` | `on` pings a portfolio's role as its deadlines get close |
| `ENABLE_DEBUG_TOOLS` | `true` adds a Debugging tab with a database viewer, backups and restore in the browser. It gives every executive full control of the database, so it's off by default |
| `ENABLE_DISCORD_BOT` | `true` turns on the experimental `/print` Discord command ([notes](docs/DISCORD_BOT_SPIKE.md)) |

Everything else (passwords, the encryption key, the update token) is generated for you
and best left alone.

## Development

You'll need Node 22 or newer and Docker for the local database.

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # local Postgres
cp .env.example .env                             # set AUTH_SECRET and DATABASE_URL
npm run db:push
npm run db:seed                                  # a sample society and accounts
npm run dev
```

It runs at http://localhost:3000. The seed prints the sample logins, which all use the
password `password123`. To try the setup wizard instead, skip the seed, set
`SETUP_TOKEN` in `.env` and open `/setup?token=<that value>`.

Built with Next.js 16, React 19, TypeScript, Prisma 7 with PostgreSQL, NextAuth v5,
Tailwind CSS 4 and shadcn/ui.

```
src/app/          pages and API routes; [society]/ is the portal itself
src/components/   UI components (shadcn/ui in components/ui)
src/lib/          server logic: auth, database, Rubric, Discord, updates
src/proxy.ts      sign-in checks, feature switches and clean URLs
prisma/           database schema, seed and one-time data fixes
deploy/           Docker images, compose file and backup script
portal, portal.ps1  the self-hosting scripts
```

`npm run lint` checks the code, and each `npm run check:*` script guards one thing that
must not break:

| Script | What it checks |
|---|---|
| `check:rubric` | The Rubric session never reaches a browser, every call is allowlisted and role-checked, and the Arc tiers are right |
| `check:tutorial` | Every tour step still points at something on the page |
| `check:modules` | A switched-off feature blocks exactly its own pages and API |
| `check:import` | The CSV and Excel readers and the import's row checks |
| `check:debug` | The database viewer masks credentials, and the SQL runner can't end its own transaction |
| `check:urgency` | Deadline stages and labels, on the society's own clock |
| `check:discord` | Discord's request signatures and the `/print` options |
| `check:updates` | Image names, version order and release channels |
| `check:passphrase`, `check:years`, `check:ahegs`, `check:bookings` | Passphrases, financial years, AHEGS reporting and room booking rules |

`npm run audit:layout` loads every page at widths from 320 to 1440px and reports
anything that scrolls sideways.

Hosting it the way UNSW societies do (several stacks on one box, deployed from GitHub
Actions) is covered in [deploy/README.md](deploy/README.md), along with how releases
reach self-hosted portals.

## Security

- There's no self-registration. An account only exists because an executive made it
  or imported it. New members get a temporary four-word passphrase and must pick their
  own password before they can do anything.
- Rubric credentials never leave the server. Every Rubric call goes through an
  allowlist that checks the caller's role and parameters. Reads of member data and all
  writes are audit logged and rate limited. The stored session and Discord webhook URLs
  are encrypted at rest (with `RUBRIC_SECRET_KEY`, which the installer sets).
- Reimbursement claims and bank details are visible only to their owner and to
  executives.
- The portal can't reach the server's Docker. It can only ask the server's updater to
  run, so a compromised portal can't take over the machine.

If you find a vulnerability, please open an issue without exploit details and I'll get
in touch.

## Contributing

Issues and pull requests are welcome. This is maintained by one person for a couple of
societies, so there's no support commitment, but bug reports with steps to reproduce
are always appreciated.

The Rubric integration uses Rubric's undocumented API, so it can break without warning.
This project isn't affiliated with or endorsed by Rubric, Arc UNSW or UNSW.

## License

[MIT](LICENSE) © Maahir Ahmed
