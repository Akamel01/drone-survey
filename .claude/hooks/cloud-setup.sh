#!/usr/bin/env bash
# SessionStart, cloud sessions only: give a fresh container what the operator's
# machine already has, so the orchestrator can dispatch tickets to opencode
# (docs/agents/opencode-framework.md). Idempotent. Never fails the session:
# the details go to ~/.cache/cloud-setup.log, and only what the session still
# lacks is printed, which Claude Code adds to the session's context.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

OPENCODE_VERSION=1.18.32
AUTOFORGE_REPO=https://github.com/Akamel01/autoforge-opencode
AUTOFORGE_DIR="$HOME/.cache/autoforge-opencode"
SETTINGS="${CLAUDE_PROJECT_DIR:-.}/.claude/settings.json"
PLUGINS="$HOME/.claude/plugins"
LOG="$HOME/.cache/cloud-setup.log"

mkdir -p "$(dirname "$LOG")"
exec 3>&1 >>"$LOG" 2>&1
echo "== $(date -u +%FT%TZ) cloud-setup"
lacks() { echo "cloud-setup: $*" >&3; echo "LACKS: $*"; }

# 1. Tools: rsync and jq for the autoforge installer, gh for opencode's pull requests.
missing=""
for t in rsync jq gh; do command -v "$t" >/dev/null || missing="$missing $t"; done
if [ -n "$missing" ]; then
  apt-get update -qq || true  # a blocked third-party PPA is fine; the Ubuntu archive has these
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $missing || lacks "apt could not install$missing"
fi

# 2. The plugins .claude/settings.json declares, if the session did not install
#    them itself. Installed here, they load in the next session or on /reload-plugins.
if command -v jq >/dev/null && [ -f "$SETTINGS" ]; then
  jq -r '.extraKnownMarketplaces | to_entries[] | "\(.key) \(.value.source.repo)"' "$SETTINGS" |
    while read -r name repo; do
      jq -e --arg n "$name" 'has($n)' "$PLUGINS/known_marketplaces.json" >/dev/null 2>&1 ||
        claude plugin marketplace add "$repo" || lacks "marketplace $repo"
    done
  jq -r '.enabledPlugins | keys[]' "$SETTINGS" |
    while read -r plugin; do
      jq -e --arg p "$plugin" '.plugins | has($p)' "$PLUGINS/installed_plugins.json" >/dev/null 2>&1 ||
        claude plugin install "$plugin" || lacks "plugin $plugin"
    done
fi

# 3. opencode.
[ "$(opencode --version 2>/dev/null)" = "$OPENCODE_VERSION" ] ||
  npm i -g "opencode-ai@$OPENCODE_VERSION" || lacks "opencode $OPENCODE_VERSION"

# 4. autoforge, from its repository, once per commit: its installer's jq merge
#    fails when ~/.config/opencode/opencode.jsonc already exists. It also runs
#    bun/npm install in ~/.config/opencode, which needs a package.json there.
if [ -d "$AUTOFORGE_DIR/.git" ]; then
  git -C "$AUTOFORGE_DIR" pull -q --ff-only
else
  git clone -q --depth 1 "$AUTOFORGE_REPO" "$AUTOFORGE_DIR"
fi
stamp="$HOME/.config/opencode/.autoforge-installed"
head=$(git -C "$AUTOFORGE_DIR" rev-parse HEAD 2>/dev/null)
if [ -n "$head" ] && [ "$(cat "$stamp" 2>/dev/null)" != "$head" ]; then
  mkdir -p "$HOME/.config/opencode"
  [ -f "$HOME/.config/opencode/package.json" ] || echo '{ "private": true }' >"$HOME/.config/opencode/package.json"
  if "$AUTOFORGE_DIR/install.sh"; then echo "$head" >"$stamp"; else lacks "autoforge install failed, see $LOG"; fi
fi

# 5. The opencode-orchestrate skill (dispatch.sh, watch.py, status.sh), once it
#    lives in autoforge-opencode.
src=$(find "$AUTOFORGE_DIR" -maxdepth 3 -type d -name opencode-orchestrate -not -path '*/.git/*' | head -1)
if [ -n "$src" ]; then
  mkdir -p "$HOME/.claude/skills"
  rsync -a --delete "$src/" "$HOME/.claude/skills/opencode-orchestrate/"
else
  lacks "the opencode-orchestrate skill is not in $AUTOFORGE_REPO yet"
fi

# 6. What only the environment's settings can give. GitHub needs no token: the
#    session's proxy authenticates REST calls itself, whatever GH_TOKEN says.
#    It refuses GraphQL, so gh's porcelain (gh pr create, gh issue view) fails
#    here and only `gh api` REST calls work.
[ -n "${OPENCODE_API_KEY:-}" ] || lacks "OPENCODE_API_KEY is not set; opencode cannot reach Zen or Go"
curl -s -o /dev/null --max-time 10 https://opencode.ai ||
  lacks "opencode.ai is blocked by the environment's network policy"
gh api user --silent >/dev/null 2>&1 || lacks "gh cannot reach the GitHub REST API"
exit 0
