#!/usr/bin/env bash
# Build and deploy from the repo directory.
# Usage (on LXC):
#   cd /opt/combatcheck-repo
#   git pull
#   bash deploy/deploy.sh
#
# First deploy with DB seed:
#   RUN_SEED=1 bash deploy/deploy.sh

set -euo pipefail

APP_DIR="/opt/combatcheck"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${REPO_DIR}"

if [[ -f "${APP_DIR}/.env" ]]; then
  echo "==> Loading ${APP_DIR}/.env for build..."
  set -a
  source "${APP_DIR}/.env"
  set +a
elif [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: Create ${APP_DIR}/.env first (see .env.example)."
  exit 1
fi

echo "==> Installing dependencies..."
npm ci

echo "==> Building production bundle..."
npm run prod:build

echo "==> Staging release..."
STAGE="${APP_DIR}.staging"
rm -rf "${STAGE}"
mkdir -p "${STAGE}"

cp -a .next/standalone/. "${STAGE}/"
[[ -d public ]] && cp -a public "${STAGE}/public"
mkdir -p "${STAGE}/.next"
cp -a .next/static "${STAGE}/.next/static"
cp -r prisma package.json package-lock.json prisma.config.ts "${STAGE}/"
[[ -d data ]] && cp -r data "${STAGE}/"

[[ -f "${APP_DIR}/.env" ]] && cp "${APP_DIR}/.env" "${STAGE}/.env"

echo "==> Activating release..."
rm -rf "${APP_DIR}.old"
[[ -d "${APP_DIR}" ]] && mv "${APP_DIR}" "${APP_DIR}.old"
mv "${STAGE}" "${APP_DIR}"

cd "${APP_DIR}"
npm ci --omit=dev
npx prisma generate
npx prisma db push

if [[ "${RUN_SEED:-}" == "1" ]]; then
  echo "==> Seeding database..."
  npm run db:seed
fi

if id combatcheck &>/dev/null; then
  chown -R combatcheck:combatcheck "${APP_DIR}"
fi

echo "==> Restarting service..."
systemctl restart combatcheck

echo "==> Deploy complete."
