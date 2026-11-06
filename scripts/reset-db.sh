#!/usr/bin/env bash
# Clears all match history and the leaderboard. The schema stays, containers keep running.
#
# Usage (on the server):   ~/amoba/scripts/reset-db.sh          # asks for confirmation
#                          ~/amoba/scripts/reset-db.sh --yes    # no prompt (used by CI)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Delete ALL matches and leaderboard data? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

docker compose exec -T db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE matches RESTART IDENTITY;"'

echo "Leaderboard and match history cleared."
