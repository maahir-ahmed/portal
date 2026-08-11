#!/usr/bin/env bash
# Poll the repo; if origin/main moved, pull and recreate both stacks.
# Cron (every 2 min):
#   */2 * * * * /path/to/society-project/deploy/auto-deploy.sh >> /path/to/auto-deploy.log 2>&1
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="main"
cd "$REPO"

# Don't overlap with a previous run still building.
exec 9>/tmp/rubric-deploy.lock
flock -n 9 || { echo "$(date -Is) another deploy in progress, skipping"; exit 0; }

git fetch origin "$BRANCH" --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # up to date, nothing to do
fi

echo "$(date -Is) new commit $REMOTE, deploying"
git reset --hard "origin/$BRANCH"

docker compose --env-file deploy/.env.prod -p rubric_prod -f deploy/docker-compose.yml up -d --build --remove-orphans
docker compose --env-file deploy/.env.dev  -p rubric_dev  -f deploy/docker-compose.yml up -d --build --remove-orphans
docker image prune -f

echo "$(date -Is) deploy complete -> $REMOTE"
