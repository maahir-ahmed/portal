FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
# postinstall runs `prisma generate`, which needs the schema present
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Production image
FROM base AS runner
# postgresql16-client: pg_dump and psql for Settings > Debugging's backup and restore,
# which run deploy/backup.sh in here. 16 to match the postgres:16 the stack runs.
# tzdata: so TZ means something when this image runs the daily backup.
RUN apk add --no-cache openssl postgresql16-client tzdata
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Typed-in dates and times arrive without an offset and are stored as if UTC (naive
# wall-clock, CLAUDE.md "Database"), which is only right while the server's own zone
# is UTC. It always has been here; pinned so a base image or compose setting can't
# quietly shift every typed time by hours.
ENV TZ=UTC
# No update check or telemetry call from the prisma CLI on every start.
ENV CHECKPOINT_DISABLE=1

# The prisma CLI that runs `db push` on start, at the lockfile's version. It used to be
# fetched with npx at every start, which needed npm to be reachable to boot and once
# crash-looped prod when an unpinned npx picked up a release candidate.
COPY package-lock.json /tmp/
RUN npm install -g "prisma@$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version")" \
    && npm cache clean --force && rm /tmp/package-lock.json

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/post-push.mjs ./scripts/post-push.mjs
COPY --from=builder /app/deploy/backup.sh /app/deploy/maintenance.html ./deploy/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p /app/uploads /app/backups && chown nextjs:nodejs /app/uploads /app/backups

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# The release this image is (1.4.0, or main-<sha> between releases), shown in Settings
# and compared with the newest release there (src/lib/updates.ts). Last, so a new
# version doesn't throw away the layers above.
ARG APP_VERSION=source
ENV APP_VERSION=$APP_VERSION

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
