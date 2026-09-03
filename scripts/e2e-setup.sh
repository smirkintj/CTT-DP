#!/usr/bin/env bash
#
# Stand up everything the e2e suite needs: a local Postgres, the schema, seed
# data, and an .env.local pointing at it.
#
#   bash scripts/e2e-setup.sh
#   npm run test:e2e
#
# Safe to re-run; it recreates the database from scratch each time.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/ctt-pgdata}"
PGSOCK="${PGSOCK:-/var/run/ctt-pg}"
PGPORT="${PGPORT:-5433}"
DB_URL="postgresql://ctt@127.0.0.1:${PGPORT}/ctt?schema=public"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "ERROR: PostgreSQL not found at $PGBIN. Set PGBIN, or install postgresql-16." >&2
  exit 1
fi

run_pg() {
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    su postgres -c "$1"
  else
    bash -c "$1"
  fi
}

echo "==> Starting PostgreSQL on port $PGPORT"
if ! pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  rm -rf "$PGDATA"
  mkdir -p "$PGDATA" "$PGSOCK"
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    chown -R postgres "$PGDATA" "$PGSOCK"
  fi
  run_pg "$PGBIN/initdb -D $PGDATA -U ctt --auth=trust" >/dev/null
  run_pg "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1' -l $PGSOCK/pg.log start" >/dev/null
  sleep 3
fi

psql -h 127.0.0.1 -p "$PGPORT" -U ctt -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='ctt'" | grep -q 1 \
  || psql -h 127.0.0.1 -p "$PGPORT" -U ctt -d postgres -c "CREATE DATABASE ctt;" >/dev/null

echo "==> Writing .env.local"
cat > .env.local <<EOF
DATABASE_URL="$DB_URL"
DIRECT_URL="$DB_URL"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="local-e2e-secret-not-for-production"
SEED_ADMIN_PASSWORD="LocalE2E!admin1"
SEED_USER_PASSWORD="LocalE2E!user1"
EOF

set -a; . ./.env.local; set +a

echo "==> Applying migrations"
npx prisma migrate deploy >/dev/null

echo "==> Seeding"
npx tsx prisma/seed.ts >/dev/null

# The seed marks accounts mustChangePassword, which is correct for a real first
# login but puts a modal in front of every test. Clear it for the fixtures only.
echo "==> Clearing forced password change on seed accounts"
psql -h 127.0.0.1 -p "$PGPORT" -U ctt -d ctt -c \
  'UPDATE "User" SET "mustChangePassword" = false;' >/dev/null

echo
echo "Ready. Run the suite with:"
echo "  npm run test:e2e"
echo
echo "Admin:       admin@dksh.com / LocalE2E!admin1"
echo "Stakeholder: uat-my@dksh.com / LocalE2E!user1"
