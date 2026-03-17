#!/bin/sh
set -e

echo "[start] Syncing database schema..."
npx prisma db push --accept-data-loss --skip-generate
echo "[start] Database ready."

echo "[start] Launching server..."
exec node dist/index.js
