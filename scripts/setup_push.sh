#!/usr/bin/env bash
# Turn on Mission Control's phone notifications (#319) in one step.
#
# Run this yourself, from this repo on your Mac. It:
#   1. makes a fresh VAPID key pair and a random host token,
#   2. stores VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT and PUSH_HOST_TOKEN as
#      encrypted Production env vars on the Vercel project "web" (token from the
#      Keychain item "vercel-token"),
#   3. writes ~/.config/wayfinder/push.env (mode 600) on the Linux host with
#      PLANNER_URL and PUSH_HOST_TOKEN,
#   4. redeploys production so the planner picks the keys up.
# No secret is printed or written to this Mac's disk; values travel over stdin or HTTPS.
#
#   bash scripts/setup_push.sh
set -euo pipefail

TEAM=${VERCEL_TEAM:-team_aPgbPAxpC0CmRqYnt75bagP0}
PROJECT=${VERCEL_PROJECT:-prj_ldWIELnLGTPeYWaxztyhuFn0YpzE}
HOST=${HOST:-akamel-linux}
PLANNER_URL=${PLANNER_URL:-https://missions.papyrus-ai.net}
SUBJECT=${VAPID_SUBJECT:-mailto:akamel@papyrus-ai.net}

T=$(security find-generic-password -s vercel-token -w)
keys=$(cd "$(dirname "$0")/../web" && npx --yes web-push@3.6.7 generate-vapid-keys --json)
PUB=$(printf '%s' "$keys" | python3 -c "import sys,json;print(json.load(sys.stdin)['publicKey'])")
PRIV=$(printf '%s' "$keys" | python3 -c "import sys,json;print(json.load(sys.stdin)['privateKey'])")
TOKEN=$(openssl rand -hex 32)

setvar() {  # name; value on stdin. Creates or replaces a Production env var.
  VAL=$(cat) NAME="$1" python3 -c 'import json,os;print(json.dumps({"key":os.environ["NAME"],"value":os.environ["VAL"],"type":"encrypted","target":["production"]}))' |
    curl -sf -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
      "https://api.vercel.com/v10/projects/$PROJECT/env?upsert=true&teamId=$TEAM" --data @- >/dev/null
  echo "set $1"
}
printf '%s' "$PUB"     | setvar VAPID_PUBLIC_KEY
printf '%s' "$PRIV"    | setvar VAPID_PRIVATE_KEY
printf '%s' "$SUBJECT" | setvar VAPID_SUBJECT
printf '%s' "$TOKEN"   | setvar PUSH_HOST_TOKEN

printf 'PLANNER_URL=%s\nPUSH_HOST_TOKEN=%s\n' "$PLANNER_URL" "$TOKEN" |
  ssh "$HOST" 'umask 077; mkdir -p ~/.config/wayfinder && cat > ~/.config/wayfinder/push.env && chmod 600 ~/.config/wayfinder/push.env && echo "host push.env written"'

# Redeploy the current production deployment so the new vars take effect.
DEP=$(curl -sf -H "Authorization: Bearer $T" "https://api.vercel.com/v6/deployments?projectId=$PROJECT&teamId=$TEAM&target=production&limit=1" |
  python3 -c "import sys,json;print(json.load(sys.stdin)['deployments'][0]['uid'])")
curl -sf -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments?forceNew=1&teamId=$TEAM" \
  -d "{\"name\":\"web\",\"deploymentId\":\"$DEP\",\"target\":\"production\"}" >/dev/null
echo "Production redeploy started. Done; Claude will check it."
