#!/bin/sh
set -e

# Fix permissions for mounted volumes (Coolify manages these)
if [ "$(id -u)" = "0" ]; then
  echo "Fixing volume permissions..."
  chown -R node:node /app/data /app/sites /app/.ssh 2>/dev/null || true
  echo "Switching to node user..."
  exec su-exec node "$@"
else
  exec "$@"
fi