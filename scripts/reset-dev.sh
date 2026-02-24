#!/usr/bin/env bash
set -euo pipefail

echo "[reset:dev] Stopping local Next.js servers on ports 3000/3001..."
lsof -ti tcp:3000 | xargs kill -9 2>/dev/null || true
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

echo "[reset:dev] Cleaning local build caches..."
rm -rf .next
rm -rf node_modules/.cache

echo "[reset:dev] Regenerating Prisma client..."
npx prisma generate

echo "[reset:dev] Done. Start with: npm run dev"
