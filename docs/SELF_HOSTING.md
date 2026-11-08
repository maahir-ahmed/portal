# Running your own society portal

This guide gets your society its own copy of the portal: your members, your requests,
your data, on a computer you control. You don't need to be a programmer. You'll copy a
few commands, answer a few questions, and open a link.

It takes about 30 minutes the first time, most of it waiting for downloads.

## 1. Choose where it runs

The portal has to run on a computer that stays on, so members can use it at any time.
Pick one:

| Option | Cost | Good for | Notes |
|---|---|---|---|
| **A small cloud server** (a "VPS": DigitalOcean, Vultr, Hetzner, Linode…) | about $5–10 a month | Most societies | Always on, nothing at home to look after. Pick Ubuntu 24.04 with at least 2 GB of memory. |
| **A Raspberry Pi** | about $100 once | Societies with someone happy to keep a Pi plugged in | A Pi 4 or 5 with 2 GB or more (4 GB is comfortable), and the **64-bit** Raspberry Pi OS. Boot from a USB SSD if you can: SD cards wear out. |
| **A Windows or Mac computer** | free | Trying it out, or a committee PC that stays on | Needs Docker Desktop. The portal stops whenever the computer sleeps or turns off. |

Whichever you pick, it needs about 3 GB of free disk space and a stable internet
connection.

You'll also want a **web address** (a domain, like `portal.chesssoc.org`). A society
website domain works: the portal goes on a part of it, such as `portal.`. If you just
want to try it out on your own computer first, you can skip the domain for now.

## 2. Install Docker

Docker runs the portal and its database in tidy, self-contained boxes.

- **Cloud server or Raspberry Pi:** skip this. The install script offers to install
  Docker for you.
- **Windows:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/),
  restart if it asks, and open it once. Leave it running. (The install script can also
  install it for you with `winget`.)
- **Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and
  open it once.

## 3. Download the portal

On a server or Pi, connect over SSH and run:

```bash
git clone https://github.com/maahir-ahmed/portal.git
cd portal
```

On Windows or a Mac, you can instead download the ZIP from the
[GitHub page](https://github.com/maahir-ahmed/portal) (green **Code** button, then
**Download ZIP**), unzip it somewhere permanent (like your Documents folder), and open
a terminal in that folder. With git, `update` can update the scripts too; with the ZIP,
download a fresh copy when the portal asks you to.

## 4. Decide how people will reach it

The install script asks how members will reach the portal. There are three answers.

### Cloudflare Tunnel (recommended)

The portal connects out to Cloudflare, and Cloudflare serves it at your web address
with HTTPS. Nothing has to be opened on your network, so it works on a Pi at home or
behind a university network. It's free.

1. Your domain must use Cloudflare (a free account). If it doesn't yet, add it at
   [dash.cloudflare.com](https://dash.cloudflare.com) and follow the steps to switch the
   domain's nameservers.
2. In Cloudflare, open **Zero Trust**, then **Networks**, then **Tunnels**, and
   **Create a tunnel**. (Cloudflare moves its menus around now and then: if it isn't
   there, search the dashboard for "Tunnels".) Choose **Cloudflared**, and name it after
   your society.
3. When it shows install commands, pick **Docker** and copy the command. You'll paste it
   into the install script, which keeps just the token from it. Don't run it yourself.
4. On the next screen, add a **public hostname**:
   - Subdomain and domain: the address you want, such as `portal` and `chesssoc.org`
   - Service type: **HTTP**
   - URL: **`web:80`**
5. Save. Cloudflare creates the web address for you.

Two Cloudflare settings can break pages, so check they are off for your domain: **Rocket
Loader** (under Speed) and **Email Address Obfuscation** (under Scrape Shield).

### Caddy, for a server with a public IP address

If your server has its own public IP address (most cloud servers do), the portal can
serve HTTPS itself and get its certificate automatically.

1. Where your domain's DNS is managed, add an **A record** for your address (for example
   `portal`) pointing at the server's IP address.
2. Make sure ports **80** and **443** are open in the server's firewall (in your
   provider's dashboard, and `sudo ufw allow 80,443/tcp` if you use ufw).

The certificate arrives on its own a minute or so after the portal starts.

### Just this computer

The portal runs at `http://localhost:8080` and only that computer can open it. Good for
a look around. You can switch to a real address later by running install again (see
"Changing your answers" below).

## 5. Run the installer

**Server, Pi or Mac:**

```bash
./portal install
```

**Windows**, in PowerShell in the portal folder:

```powershell
powershell -ExecutionPolicy Bypass -File portal.ps1 install
```

It asks for your society's name, your email, how people will reach it, and your web
address (and the tunnel token, for Cloudflare). Then it downloads the portal, starts
it, and prints a link like:

```
https://portal.chesssoc.org/setup?token=4f1c…
```

## 6. Finish setting up in the browser

Open that link. It creates your account (you'll be the first executive), then walks you
through seven short steps: your society's details and timezone, portfolios, which
features you use, rules for request forms, email, importing your committee, and
Discord. Every step except the first is optional, and everything in them can be changed
later in **Settings**. Once you're in, **Help & guides** in the menu has a checklist of
what's left to set up and a guide to each part of the portal.

The link only works until that first account exists. After that, everyone signs in at
your web address.

To bring your committee in, use **Import members** (in the wizard, or later in
Settings): fill in the spreadsheet template and upload it. The import emails nobody.
Each person shows as "not invited" on the Members page until you open them and **Issue
passphrase**. With email set up, that emails them their sign-in details; without it,
pass the passphrase on yourself.

## 7. Email (optional)

The portal can email new members their sign-in details (and, if an executive turns it
on in **Settings › Features**, every notification). It needs two things: an account with
an email service, and a domain you can add DNS records to, such as your society's
website domain. Both services below have free plans:

| | Free plan | Good for |
|---|---|---|
| [Brevo](https://www.brevo.com) | 300 emails a day | Most societies: room to invite a whole committee at once |
| [Resend](https://resend.com) | 100 emails a day, 3,000 a month | A tidier dashboard; fine if you add people a few at a time |

**Brevo:**

1. Create a free account.
2. **Senders, Domains & Dedicated IPs › Domains**: add your domain, then add the DNS
   records it shows. If your domain is on Cloudflare, it can add them for you.
3. **Senders**: add the address to send from, such as `noreply@chesssoc.org`.
4. **SMTP & API › SMTP**: generate an SMTP key. The same page shows your SMTP login.

New Brevo accounts sometimes need activating before they can send. If emails don't
arrive and Brevo's log says the account isn't activated, contact Brevo's support.

**Resend:**

1. Create a free account.
2. **Domains**: add your domain, add the DNS records it shows (it can add them for you
   if your domain is on Cloudflare), then click **Verify**.
3. **API Keys**: create a key with sending access to that domain.

**Then, in the portal:** open **Settings › Email**, pick the service, paste the login
and key, and enter the address to send as, like `Chess Society <noreply@chesssoc.org>`.
Save, then click **Send me a test email**: if the service refuses, the page shows its
reason. (Prefer the command line? `./portal email` in the portal folder does the same;
settings saved in the portal win over it.)

Mind the daily limit: going over it can get emails refused or the account paused, and
then sign-in emails stop too. Leave notification emails off unless your plan has room.

## Everyday use

Run these in the portal folder. On Windows, use
`powershell -ExecutionPolicy Bypass -File portal.ps1` in place of `./portal`.

| Command | What it does |
|---|---|
| `./portal status` | Shows what's running |
| `./portal stop` / `./portal start` | Stops or starts the portal |
| `./portal update` | Takes a backup, then moves to the newest version now |
| `./portal autoupdate on` / `off` | Turns automatic updates on or off (on after install) |
| `./portal email` | Sets up email from the command line (usually done in Settings › Email) |
| `./portal backup` | Takes a backup now |
| `./portal restore <file>` | Puts a backup back (asks you to confirm first) |
| `./portal logs` | Shows what the portal is doing, live (Ctrl+C to stop watching) |

The portal starts again by itself when the computer restarts, as long as Docker starts
too and you hadn't stopped it with `./portal stop`. (On Windows and Mac, set Docker Desktop to start when you sign in.)

### Updates

The portal keeps itself up to date. The installer turns this on, and every night at
4am the server checks for a new release. If there is one, it takes a backup, installs
it, and checks the portal starts. If the new version doesn't start, it goes back to the
one before by itself, and doesn't try that version again until a newer one comes out.

When a new release is out, executives see a banner at the top of every page until it's
installed. **Settings › General › Version and updates** shows the version you're on and
when the server checks next. To install a release straight away, run `./portal update`
on the server. **Install at the next check** asks the server to install it that night
even if it's a version that failed to start before.

A few things worth knowing:

- Updates follow the **1.x** releases. A 2.0 release, which might need something from
  you, never installs by itself: its notes will say what to do.
- An update that would delete data from the database stops instead of going ahead,
  then rolls back. Nothing you've stored is lost to an automatic update.
- The check runs once a day. What it did is in `update.log`, in the portal folder.
- On Windows, it runs as a scheduled task while you're signed in, since that's when
  Docker Desktop runs, and catches up when you next sign in if the PC was off. On a Mac
  or Linux it's a line in your crontab, which skips a night the computer is off.
- Change the hour with `UPDATE_HOUR` in `portal.env` (after the 3am backup is best),
  then run `./portal autoupdate on` again so the schedule follows.
- To update by hand instead, run `./portal autoupdate off`, then `./portal update`
  whenever you like. Settings will say the updater isn't running.

### Backups

A backup of everything (the database and every uploaded file) is taken automatically
every night at 3am and kept for 14 days, in the `backups` folder. Each backup is one
`.tar.gz` file.

**A backup on the same computer won't help if that computer dies.** Copy the newest one
somewhere else regularly: a USB stick, or your society's Google Drive.

Executives can also download a backup at any time from **Settings › Backups**, and
restore one there. Backups made there, by `./portal backup` and by the nightly run are
all the same kind of file, so any of them restores anywhere.

Also keep a copy of **`portal.env`** somewhere safe and private. It holds the portal's
passwords, including the key that locks the email, Discord and Rubric passwords saved
in Settings.

**Moving to a new computer:** download a backup from Settings › Backups on the old one.
On the new one, download the portal, copy the old `portal.env` into the folder, and run
install. Open the setup link it prints and choose **Restore a backup**. Everyone signs
in with the same email and password as before. (Without the old `portal.env`, it still
works, but you'll need to enter the email, Discord and Rubric passwords again in Settings.)
`./portal restore <file>` does the same from the command line.

### Changing your answers

Your answers are in `portal.env`, a plain text file. To change one (for example, moving
from "just this computer" to a real web address):

1. Run `./portal stop` first, while the file still describes the old setup.
2. Delete the lines the change affects: `METHOD`, `DOMAIN`, `NEXTAUTH_URL` and
   `TUNNEL_TOKEN`.
3. Run `./portal install` again. It only asks about what's missing and never changes
   your passwords.

## When something goes wrong

- **The page says the portal is being updated, and it doesn't go away.** The portal
  couldn't start. Run `./portal logs app` and look at the last lines.
- **"This site can't be reached" (Cloudflare).** Check the tunnel shows as **Healthy** in
  Cloudflare, and that its public hostname points to `http://web:80` exactly.
- **Can't sign in, the page just reloads.** The web address in `NEXTAUTH_URL` (in
  `portal.env`) must exactly match the one you're visiting, including `https://`. Fix it,
  then `./portal start`.
- **Caddy: the browser warns the certificate isn't valid.** The DNS record isn't
  pointing at this server yet, or ports 80 and 443 are closed. Wait a few minutes after
  fixing it, then `./portal stop` and `./portal start`.
- **"Docker is installed but not running".** Open Docker Desktop (Windows, Mac), or run
  `sudo systemctl start docker` (Linux).
- **Raspberry Pi: "this is a 32-bit system".** Reinstall with Raspberry Pi OS (64-bit).
- **Windows: everything is slow, or Docker keeps stopping.** Give Docker more memory, at
  least 3 GB (Docker Desktop, Settings, Resources).
- **You're the only executive and you've forgotten your password.** Nobody can reset it
  for you from the portal, so make sure at least two people are executives. Failing
  that, restore a backup from before the problem, or ask someone technical for help.

## Why not a hosting platform like Railway or Render?

They can run the portal, but we don't support them for now:

- The portal needs a database, a place to keep uploaded files, and a small web server
  in front. On those platforms that is three or four paid pieces, so it usually costs
  more than a $5 server that runs all of it.
- Backups wouldn't be the one-file backups above, so the portal's own backup and
  restore (here and in Settings › Backups) wouldn't work, and moving off would be hard.
- Every extra way of running it is another set of instructions to keep correct.

A small server, a Pi or a spare computer, with the install script, covers the same
needs with one set of steps.

## For the technically minded

- Everything runs from `deploy/docker-compose.yml` with your `portal.env`: Postgres 16,
  the app, nginx in front of it (which shows a maintenance page while the app restarts),
  a nightly backup job, and `cloudflared` or Caddy depending on `METHOD`. The scripts are
  thin wrappers around `docker compose`; you can run it directly with
  `docker compose --env-file portal.env -p portal -f deploy/docker-compose.yml --profile <cloudflare|caddy> …`.
- Images come from `ghcr.io/maahir-ahmed/portal-app`, `-web` and `-backup`, for amd64 and
  arm64. If they can't be downloaded, install builds them from source instead (10 to 30
  minutes, about 3 GB of memory), and `BUILD_FROM_SOURCE=true` makes update do the same.
- Only one port is published, on `127.0.0.1` (8080 unless it was taken; see `APP_PORT`),
  plus 80 and 443 with Caddy. The database
  is never reachable from outside.
- Schema changes apply themselves on start (`prisma db push`, then the one-time fixes in
  `prisma/post-push/`). `DB_PUSH_FLAGS` is empty here, so unlike the hosted stacks a
  change that would drop data fails the start instead of applying.
- Updates: `./portal tick` runs once a day at `UPDATE_HOUR` (crontab, or a scheduled
  task on Windows). It checks in with the app at `/api/system/update` using
  `UPDATE_TOKEN`, from inside the `web` container, then runs `./portal update`, with a
  retry of a skipped version if an executive asked for one. `update` notes the current image IDs, pulls, and
  only backs up and restarts if something changed. If the app doesn't answer within 3
  minutes, it retags the old images, resets the scripts to the commit before
  (`git reset --keep`) and starts them again. The failed image IDs go in `.update-skip`
  so the nightly run doesn't retry them. The app never touches Docker itself: that
  would need the Docker socket, which is root on the host.
- The images follow the `1` tag (`APP_IMAGE=ghcr.io/maahir-ahmed/portal-app:1`), which
  moves with each 1.x release. Pin `1.4` or `1.4.2` to stay put, or use `latest` to
  follow every change to `main`. Only the release channels show "update available",
  since a `main` build has no version number to compare.
- Uploads are capped at 25 MB per request. Cloudflare's own limit is 100 MB, which is why
  a restore from the browser uploads the archive in pieces.
