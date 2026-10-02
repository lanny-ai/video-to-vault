#!/usr/bin/env bash
# One-command Railway deployment for Nightmagic.
#
# Usage (from the nightmagic/ directory):
#   export RAILWAY_API_TOKEN=...        # account API token; never commit
#   export NIGHTMAGIC_PASSWORD=...      # the shared password guarding the app
#   export ANTHROPIC_API_KEY=...        # optional here; add later in the dashboard if preferred
#   ./deploy-railway.sh
#
# Deploys THIS directory (whatever you have checked out) via `railway up`, so
# no GitHub connection is needed. Idempotent: re-running redeploys.
# If any step errs, the dashboard path in docs/DEPLOY.md always works.
set -euo pipefail

: "${RAILWAY_API_TOKEN:?Set RAILWAY_API_TOKEN first}"
: "${NIGHTMAGIC_PASSWORD:?Set NIGHTMAGIC_PASSWORD first (the app must not go up unguarded)}"

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
RW="npx --yes @railway/cli@latest"

# Link or create the project (interactive the first time if needed).
if ! $RW status >/dev/null 2>&1; then
  $RW init --name nightmagic
fi

echo "==> First deploy (builds the Dockerfile server-side; this one is slow)"
$RW up --detach

echo "==> Attaching the /data volume (SQLite, uploads, media live here)"
$RW volume add --mount-path /data || echo "    (volume may already exist — fine)"

echo "==> Setting variables (triggers a redeploy)"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  $RW variables --set "NIGHTMAGIC_PASSWORD=$NIGHTMAGIC_PASSWORD" --set "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" --skip-deploys
else
  $RW variables --set "NIGHTMAGIC_PASSWORD=$NIGHTMAGIC_PASSWORD" --skip-deploys
  echo "    NOTE: no ANTHROPIC_API_KEY set — the app will run in demo mode"
  echo "    until you add it (Railway dashboard -> service -> Variables)."
fi
$RW up --detach

echo "==> Attaching app.nightmagic.ai (prints the CNAME to add in Cloudflare)"
$RW domain app.nightmagic.ai || echo "    (add the custom domain in the dashboard if this CLI version lacks it)"

echo
echo "Done. Watch the build in the Railway dashboard; once green, add the CNAME"
echo "shown above in Cloudflare DNS (proxy off until the certificate issues),"
echo "then open https://app.nightmagic.ai and sign in with your password."
