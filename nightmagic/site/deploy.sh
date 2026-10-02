#!/usr/bin/env bash
# Deploy the Nightmagic launch page to Cloudflare Pages and attach nightmagic.ai.
#
# Usage (from the site/ directory):
#   export CLOUDFLARE_API_TOKEN=...      # never commit this
#   export CLOUDFLARE_ACCOUNT_ID=...
#   ./deploy.sh
#
# Requires Node (npx). The token needs Pages:Edit and Zone DNS:Edit for nightmagic.ai.
set -euo pipefail

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN first}"
: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID first}"

PROJECT="nightmagic"
DOMAIN="nightmagic.ai"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Create the Pages project if it does not exist yet, then deploy this folder.
# "already exists" is the one error worth ignoring here; anything else (above
# all an auth failure) is surfaced, because a hidden 10000 looks like a broken
# deploy rather than a token missing Account -> Cloudflare Pages -> Edit.
if ! CREATE_OUT=$(npx wrangler pages project create "$PROJECT" --production-branch main 2>&1); then
  if printf '%s' "$CREATE_OUT" | grep -qiE 'already (exists|in use)|8000007'; then
    echo "==> Pages project '$PROJECT' already exists — continuing"
  else
    printf '%s\n' "$CREATE_OUT" >&2
    echo >&2
    echo "Could not create the Pages project. If that is an authentication" >&2
    echo "error [code: 10000], the token is missing the Account -> Cloudflare" >&2
    echo "Pages -> Edit permission. Zone DNS alone is not enough." >&2
    exit 1
  fi
fi

npx wrangler pages deploy "$DIR" --project-name "$PROJECT" --branch main

# Attach the custom domain (idempotent; Cloudflare adds the DNS record when the
# zone lives on the same account).
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"name\":\"$DOMAIN\"}" | grep -o '"success":[a-z]*'

echo "Done. Give DNS a minute, then open https://$DOMAIN"
