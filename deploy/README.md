# Deploy (GitHub Actions)

For running the portal on an Ubuntu box behind a cloudflared tunnel, built from source
and deployed on every push. Installing a portal from the published images doesn't need
any of this: see [docs/SELF_HOSTING.md](../docs/SELF_HOSTING.md).

Each branch deploys to the stack listed for it in
[.github/workflows/deploy.yml](../.github/workflows/deploy.yml), as a `project:envfile` pair:
- `main` → the production stack (private, login required)
- `demo` → a public showcase stack (`DEMO_MODE=1`)

`dev` is the working branch and deploys nowhere. Move the demo forward by merging into `demo`.

## One-time setup

1. **Clone** to the box, e.g. `~/containers/society-project`.

2. **Env files** (not committed):
   ```bash
   cp deploy/.env.prod.example deploy/.env.prod
   cp deploy/.env.dev.example  deploy/.env.dev
   # fill AUTH_SECRET, DB_PASSWORD (openssl rand -base64 32 / 24), etc. Different secrets per stack.
   ```

3. **Tunnel ingress**: the apps publish host ports (3000 prod, 3001 dev); cloudflared
   reaches them via `host.docker.internal`. Add to your cloudflared `config.yml` ingress
   (above the `http_status:404` line) and restart cloudflared:
   ```yaml
     - hostname: portal.example.com      # prod
       service: http://host.docker.internal:3000
     - hostname: demo.example.com        # demo
       service: http://host.docker.internal:3001
   ```

4. **GitHub self-hosted runner** (repo → Settings → Actions → Runners → New self-hosted runner) on the box. Install as a service so it survives reboots:
   ```bash
   ./svc.sh install && ./svc.sh start
   ```
   The runner needs docker access (its user in the `docker` group).

5. **First deploy:** push to `demo` and `main`, or run manually:
   ```bash
   docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml up -d --build --remove-orphans
   ```

6. **First account** (once per stack). For a new society, put a long random
   `SETUP_TOKEN` (`openssl rand -hex 24`) and optionally `ADMIN_EMAIL` in the env file
   before the first deploy, then open `https://<domain>/setup?token=<SETUP_TOKEN>`. It
   creates the first executive and the society (slug `SOCIETY_SLUG`), then runs the setup
   wizard. The token only works while the database has no accounts, so it can stay set.

   A demo stack gets its data from the seed instead (a sample society and its accounts,
   already marked as set up). The app runs `db push` on startup, so the
   schema already exists:
   ```bash
   docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml --profile seed run --rm seed
   ```

   Societies that existed before the wizard are marked as set up by a post-push fix, so
   their executives never see it.

## Backups

The `backup` service in each stack backs up the database and the uploads volume
together once a day, and once on start. No crontab: an earlier cron line lived here for
months without ever being installed, and nothing was backed up.

Each backup is one archive in `${BACKUP_DIR}` (default `~/containers/rubric-backups`),
`<stack>_<date>.tar.gz`, holding `database.sql`, `uploads/` and a `manifest.json` that
ties the two together. `${BACKUP_KEEP_DAYS}` days (14) are kept. Change the hour with
`BACKUP_HOUR` in the env file. The same archive restores from the command line below or
from Settings > Debugging, and either can restore the other's.

```bash
C="docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml"

# back up right now
$C run --rm backup once
# what it has been doing
docker logs rubric_prod_backup

# check an archive is whole before relying on it
$C run --rm backup validate /backups/rubric_prod_<date>_<time>.tar.gz

# restore: stop the app (the web container shows the maintenance page meanwhile),
# replace the database and uploads, start it again (which brings the schema up to date)
$C stop app
$C run --rm backup restore /backups/rubric_prod_<date>_<time>.tar.gz
$C start app
```

The restore replaces the whole database in one transaction, so a dump that fails
partway changes nothing. Backups from before the single-archive format are two files,
`<stack>_<date>.sql.gz` and `<stack>_uploads_<date>.tar.gz`; restore those by hand:

```bash
gunzip -c ~/containers/rubric-backups/rubric_prod_<date>.sql.gz \
  | docker exec -i rubric_prod-db-1 psql -U society_user -d society_platform
docker run --rm -v rubric_prod_uploads_data:/uploads -v ~/containers/rubric-backups:/b alpine \
  tar xzf /b/rubric_prod_uploads_<date>.tar.gz -C /uploads
```

## Debugging tab

`ENABLE_DEBUG_TOOLS=true` in a stack's env file adds Settings > Debugging for its
executives: a read-only database viewer (passwords, tokens, sessions, webhooks and bank
details masked), backups to download, restore from an uploaded archive, and running a
`.sql` file in one transaction. Restore and SQL need the society's name typed in and take
a backup first; all three are in the audit log. It is off by default, and forced off with
`DEMO_MODE=1`, where every visitor is an executive.

Archives made in the tab go to the `debug_backups` volume (the app runs as a user that
cannot write to `${BACKUP_DIR}`); download one from the tab to keep it elsewhere.

## Discord reminders and the /print bot

Deadline reminders are off on a stack until `DISCORD_REMINDERS=on` is in its env file
(the self-host installer sets it), so upgrading an existing stack changes nothing until
you add it. Then a timer in `src/instrumentation.ts` checks every 10 minutes, and does
nothing for a society without an events webhook. The first pass only records where each
open request stands, so nothing pings until a request's deadline actually moves into a
more urgent stage.

The `/print` bot is a spike, off unless `ENABLE_DISCORD_BOT=true` with `DISCORD_APP_ID`,
`DISCORD_PUBLIC_KEY` and `DISCORD_BOT_TOKEN` set. Setup and findings are in
[docs/DISCORD_BOT_SPIKE.md](../docs/DISCORD_BOT_SPIKE.md).

## Demo stack (no login)

The demo stack (`rubric_dev` here) is a public showcase, not a staging copy of prod. Set in `deploy/.env.dev`:

```
DEMO_MODE=1
DEMO_EMAIL=demo@example.com
DEMO_PASSWORD=<anything; it is public by design>
```

With `DEMO_MODE=1` the login page signs the visitor in as `DEMO_EMAIL` automatically, so
there is no login step. Consequences, all deliberate:

- The demo database must contain **seed data only**. Never restore a prod dump into it:
  every visitor is an executive and can read the member directory.
- The demo society must have **no Rubric credentials**. The Rubric proxy would otherwise
  let anonymous visitors pull the real member and ticket-holder lists.
- Password changes are refused (`/api/me/password`), because the demo account's password
  is shared — one visitor changing it would lock everyone else out.
- The Rubric tabs are served from `src/lib/rubricDemoSnapshot.json`, not from Rubric.
  The proxy returns that fixture and never looks up a session, and the tab carries a
  banner saying so. Ships as invented sample data; to show your society's real
  aggregates instead, run this **on the connected production stack** and commit the
  result — people are replaced with placeholders before it is written:
  ```
  docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml \
    --profile seed run --rm seed npx tsx scripts/rubric-snapshot.ts
  ```
- Visitors can write. Reseed nightly to keep the showcase tidy. The seed's dates move
  forward with the calendar, so this also keeps its events upcoming rather than expired.
  The restart afterwards hands the recreated tables back to `portal_app`:
  ```
  0 4 * * *  cd ~/containers/society-project && (docker compose --env-file deploy/.env.dev -p rubric_dev -f deploy/docker-compose.yml --profile seed run --rm seed sh -c "npx prisma db push --schema=prisma/schema.prisma --force-reset --accept-data-loss && npx tsx prisma/seed.ts" && docker compose --env-file deploy/.env.dev -p rubric_dev -f deploy/docker-compose.yml restart app) >> ~/containers/rubric-demo-reset.log 2>&1
  ```
  `SEED_DEMO_DATA=1` and `SEED_LOGO_URL` in `deploy/.env.dev` load the invented dataset
  and keep the logo across re-seeds.

## Notes
- Schema is applied with `prisma db push` (no migrations dir). Fine for now; add a migrations history later for safe prod schema changes.
- Data changes a schema change needs (a backfill, keeping an existing society's behaviour)
  go in `prisma/post-push/*.sql`. The app applies each once, after `db push`, on start;
  `_applied_fixes` records which have run. A failing fix stops the app starting, with
  nothing from it kept.
- The app itself is never published to the host. Only the `web` (nginx) container is,
  on `${APP_BIND:-0.0.0.0}:${APP_PORT}`, which is what the box's cloudflared reaches through
  `host.docker.internal`.
- The prisma CLI that runs `db push` on start is baked into the app image at the
  lockfile's version, so a start needs no network. Bump it with `package.json`.
- The app connects to Postgres as `portal_app`, which owns the schema and is not a
  superuser, so a query (the Debugging tab's SQL runner included) can't reach outside
  the database. `society_user`, the superuser the db container was made with, is used
  only by the backup container, the seed, and the first step of the app's start
  (`prisma/app-role.sql`), which creates `portal_app` and hands it ownership of
  everything, including whatever a restore run as the superuser created.

## Self-hosting and the published images

The same compose file runs self-hosted portals ([docs/SELF_HOSTING.md](../docs/SELF_HOSTING.md)).
The differences are all settings in that stack's `portal.env`, written by `./portal install`:

- `APP_IMAGE`, `WEB_IMAGE`, `BACKUP_IMAGE` point at the published images instead of the
  stack-named local builds. Unset (as on the hosted stacks), they default to
  `${STACK}-app` and so on, the names compose gave them before.
- `APP_BIND=127.0.0.1`, since the tunnel or Caddy is on the compose network.
- `METHOD` picks the `cloudflare` profile (a `cloudflared` container using
  `TUNNEL_TOKEN`) or the `caddy` profile (`caddy reverse-proxy` for `DOMAIN`, ports 80
  and 443). The hosted stacks use neither, so neither starts there.

### Releasing to self-hosted portals

Pushing `main` deploys the hosted stacks, as before, and publishes `latest`. Self-hosted
portals don't follow `latest`: they follow the `1` tag, which moves only when you tag a
release. So check a change on the hosted stacks first, then:

```bash
git tag v1.4.0 && git push origin v1.4.0
```

The workflow publishes `1.4.0`, `1.4` and `1` for all three images. Every self-hosted
portal shows it within the hour (a banner for its executives), installs it at its next
nightly check after a backup, and rolls itself back if it doesn't start
([SELF_HOSTING.md](../docs/SELF_HOSTING.md#updates)).

- **Schema changes must stay additive** (new tables, nullable columns, columns with
  defaults). Self-hosted stacks run `db push` without `--accept-data-loss`, so anything
  else fails the start there and rolls back. Data fixes go in `prisma/post-push/`.
- **Something that needs a person** (a new required setting, a breaking change):
  release it as `v2.0.0`. Nothing on `1` picks it up, and the release notes say how to
  move to `2` (change the three `*_IMAGE` tags in `portal.env`).
- **No v1.0.0 tag exists until you push one.** The installer writes `:1`, so tag
  `v1.0.0` before anyone installs.

[.github/workflows/images.yml](../.github/workflows/images.yml) publishes
`ghcr.io/<owner>/<repo>-app`, `-web` and `-backup` for amd64 and arm64 on every push to
`main` (`latest`) and on `v*` tags (`1.4.0`, `1.4`, `1`). **After its first run, check each of the three packages
is public** (GitHub, your profile, Packages, the package, Package settings, Change
visibility): a new package can start private, and self-hosters then can't download it
(the installer falls back to building from source, which works but is slow).
