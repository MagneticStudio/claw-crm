#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR/app"

# Install npm dependencies and Playwright's Chromium browser.
npm install --no-audit --no-fund
npx --yes playwright install --with-deps chromium

# Provision a local Postgres so `npm run db:push` and the Playwright suite
# (which boots the Express server) work out of the box.
if command -v psql >/dev/null 2>&1; then
  sudo service postgresql start >/dev/null 2>&1 || true
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='claw_crm'" \
    | grep -q 1 || sudo -u postgres createdb claw_crm
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='claw'" \
    | grep -q 1 || sudo -u postgres psql -c "CREATE ROLE claw WITH LOGIN SUPERUSER PASSWORD 'claw';"
  sudo -u postgres psql -c "ALTER DATABASE claw_crm OWNER TO claw;" >/dev/null

  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
      echo 'export DATABASE_URL="postgresql://claw:claw@localhost:5432/claw_crm"'
      echo 'export SESSION_SECRET="dev-session-secret-not-for-prod"'
    } >> "$CLAUDE_ENV_FILE"
  fi

  # Push schema (idempotent) so the seed and the dev server have tables.
  DATABASE_URL="postgresql://claw:claw@localhost:5432/claw_crm" \
    SESSION_SECRET="dev-session-secret-not-for-prod" \
    npm run db:push

  # Seed demo data on first boot only — `npm run db:seed` wipes existing
  # rows, so skip if a user already exists from a prior session.
  has_user=$(sudo -u postgres psql -tAd claw_crm -c \
    "SELECT EXISTS (SELECT 1 FROM users);" 2>/dev/null || echo "f")
  if [ "$has_user" != "t" ]; then
    DATABASE_URL="postgresql://claw:claw@localhost:5432/claw_crm" \
      SESSION_SECRET="dev-session-secret-not-for-prod" \
      npm run db:seed
  fi
fi
