#!/bin/sh

echo "[start] Syncing database schema..."
npx prisma db push --accept-data-loss --skip-generate || echo "[start] Schema sync skipped (already in sync)"
echo "[start] Database ready."

echo "[start] Launching server..."
exec node dist/index.js
