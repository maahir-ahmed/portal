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
through six short steps: your society's details and timezone, portfolios, which
features you use, rules for request forms, importing your committee, and Discord.
Every step except the first can be skipped and changed later in **Settings**.

The link only works until that first account exists. After that, everyone signs in at
your web address.

To bring your committee in, use **Import members** (in the wizard, or later in
Settings): fill in the spreadsheet template and upload it. Nobody is emailed. Each
person shows as "not invited" on the Members page until you open them and **Issue
passphrase**, then pass that passphrase on.

## Everyday use

Run these in the portal folder. On Windows, use
`powershell -ExecutionPolicy Bypass -File portal.ps1` in place of `./portal`.

| Command | What it does |
|---|---|
| `./portal status` | Shows what's running |
| `./portal stop` / `./portal start` | Stops or starts the portal |
| `./portal update` | Takes a backup, then moves to the newest version |
| `./portal backup` | Takes a backup now |
| `./portal restore <file>` | Puts a backup back (asks you to confirm first) |
| `./portal logs` | Shows what the portal is doing, live (Ctrl+C to stop watching) |

The portal starts again by itself when the computer restarts, as long as Docker starts
too and you hadn't stopped it with `./portal stop`. (On Windows and Mac, set Docker Desktop to start when you sign in.)

### Backups

A backup of everything (the database and every uploaded file) is taken automatically
every night at 3am and kept for 14 days, in the `backups` folder. Each backup is one
`.tar.gz` file.

**A backup on the same computer won't help if that computer dies.** Copy the newest one
somewhere else regularly: a USB stick, or your society's Google Drive.

Also keep a copy of **`portal.env`** somewhere safe and private. It holds the portal's
passwords. To move the portal to a new computer: download the portal there, copy
`portal.env` into the folder, run install, then `./portal restore` your newest backup.

Executives can also take and restore backups from the browser, in **Settings ›
Debugging**, if you turn that on (`ENABLE_DEBUG_TOOLS=true` in `portal.env`, then
`./portal start`). It's off by default because it gives every executive full control of
the database. Backups made either way restore either way.

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
  restore (here and in Settings › Debugging) wouldn't work, and moving off would be hard.
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
  `prisma/post-push/`). Take a backup before updating: `./portal update` does.
- Uploads are capped at 25 MB per request. Cloudflare's own limit is 100 MB, which is why
  a restore from the browser uploads the archive in pieces.
