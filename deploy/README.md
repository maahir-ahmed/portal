# Deploy (home server, Ubuntu + cloudflared)

Two stacks behind your existing cloudflared tunnel:
- `main` branch → **rubric_prod** → your production hostname (private, login required)
- `dev` branch → **rubric_dev** → your demo hostname (public showcase, `DEMO_MODE=1`)

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

6. **First deploy:** push to `dev` and `main`, or run manually:
   ```bash
   docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml up -d --build --remove-orphans
   ```

7. **Seed** the first admin (once per stack). The app runs `db push` on startup, so the
   schema already exists; this just inserts the society + admin user:
   ```bash
   docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml --profile seed run --rm seed
   ```

## Backups
```bash
crontab -e
0 3 * * *  ~/containers/society-project/deploy/backup.sh >> ~/containers/rubric-backup.log 2>&1
```

## Demo stack (no login)

`rubric_dev` is a public showcase, not a staging copy of prod. Set in `deploy/.env.dev`:

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
- Visitors can write. Reseed on a schedule to keep the showcase tidy:
  ```
  0 4 * * *  cd ~/containers/society-project && docker compose --env-file deploy/.env.dev -p rubric_dev -f deploy/docker-compose.yml --profile seed run --rm seed sh -c "npx prisma db push --schema=prisma/schema.prisma --force-reset --accept-data-loss && npx tsx prisma/seed.ts" >> ~/containers/rubric-demo-reset.log 2>&1
  ```

## Notes
- Schema is applied with `prisma db push` (no migrations dir). Fine for now; add a migrations history later for safe prod schema changes.
- App ports are NOT published to the host; only cloudflared (via the `edge` network) can reach them.
