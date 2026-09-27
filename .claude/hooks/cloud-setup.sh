#!/usr/bin/env bash
# SessionStart, cloud sessions only: make sure the plugins .claude/settings.json
# declares are there. A plugin installed after startup does not load in the
# running session, so its skills are also linked into ~/.claude/skills, which
# the session picks up at once. Idempotent; never fails the session. Details go
# to ~/.cache/cloud-setup.log; only what the session still lacks is printed,
# which Claude Code adds to the session's context.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

SETTINGS="${CLAUDE_PROJECT_DIR:-.}/.claude/settings.json"
PLUGINS="$HOME/.claude/plugins"
LOG="$HOME/.cache/cloud-setup.log"

mkdir -p "$(dirname "$LOG")" "$HOME/.claude/skills"
exec 3>&1 >>"$LOG" 2>&1
echo "== $(date -u +%FT%TZ) cloud-setup"
lacks() { echo "cloud-setup: $*" >&3; echo "LACKS: $*"; }

command -v jq >/dev/null || { lacks "jq is missing"; exit 0; }
[ -f "$SETTINGS" ] || exit 0

jq -r '.extraKnownMarketplaces | to_entries[] | "\(.key) \(.value.source.repo)"' "$SETTINGS" |
  while read -r name repo; do
    jq -e --arg n "$name" 'has($n)' "$PLUGINS/known_marketplaces.json" >/dev/null 2>&1 ||
      claude plugin marketplace add "$repo" || lacks "marketplace $repo"
  done

jq -r '.enabledPlugins | keys[]' "$SETTINGS" |
  while read -r plugin; do
    jq -e --arg p "$plugin" '.plugins | has($p)' "$PLUGINS/installed_plugins.json" >/dev/null 2>&1 && continue
    claude plugin install "$plugin" || { lacks "plugin $plugin"; continue; }
    root=$(jq -r --arg p "$plugin" '.plugins[$p][0].installPath' "$PLUGINS/installed_plugins.json")
    find "$root/skills" -maxdepth 3 -name SKILL.md -not -path '*/deprecated/*' -not -path '*/in-progress/*' |
      while read -r skill; do
        d=$(dirname "$skill")
        ln -sfn "$d" "$HOME/.claude/skills/$(basename "$d")"
      done
  done
exit 0
