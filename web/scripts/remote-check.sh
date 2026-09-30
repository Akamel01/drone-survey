#!/usr/bin/env bash
# remote-check.sh -- run the web app's browser checks on akamel-linux (#299).
# WHY: those checks need GPU-backed Chromium; this Mac cannot give one and the
# Linux host can. Ship the worktree there, run the npm script via
# remote-check-host.sh, bring artifacts back to the same repo-relative paths.
# Remote writes stay inside ~/drone/webcheck; no sudo, ever.
# USAGE  remote-check.sh <npm-script> [args...] | --prune <folder>... |
#        --selftest | --help      (exit 0 pass / 1 check failed / 2 refused)
set -euo pipefail

HOST=akamel-linux
HOST_ROOT='$HOME/drone/webcheck'  # remote literal: expanded on the host only
EVID='.autoforge/evidence/299/remote-check'
STALE_LOCK_MIN="${REMOTE_CHECK_STALE_LOCK_MIN:-120}"
LOCK_PATH=""

# Classification from the frozen table in .autoforge/requirements/grilling.md.
script_mode() {
  case "$1" in
    check:look|check:motion|check:map-chrome|check:scrollbar|check:chrome-motion|check:mission-rows|check:fold|check:area-edit|check:field-workflow) printf 'serve\n' ;;
    test:e2e) printf 'self\n' ;;
    check:showcase-player) printf 'refused\n' ;;
    *) printf 'unknown\n' ;;
  esac
}

die() { local code="$1"; shift; printf 'remote-check: %s\n' "$*" >&2; exit "$code"; }

usage() {
  cat <<'EOF'
remote-check.sh -- run web browser checks on akamel-linux (#299).

USAGE
  remote-check.sh <npm-script> [args...]
      serve mode (check:look, check:motion, check:map-chrome, check:scrollbar,
      check:chrome-motion, check:mission-rows, check:fold, check:area-edit):
      build, serve, run the check against the served URL. self mode (test:e2e)
      starts its own server, no wrapper build. check:showcase-player is
      refused: it needs WebKit, absent on the host.
  remote-check.sh --prune <folder>...   remove ~/drone/webcheck/<folder> only
  remote-check.sh --selftest            local self-checks, no host access
  remote-check.sh --help

ENV forwarded to the host (everything else is dropped):
  REMOTE_CHECK_* CHECK_CHROMIUM_JSON ONLY UI17_DEBUG PREVIEW_CSS E2E_SHOTS SHOT_DIR
EOF
}

repo_root() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)" || true
  [ -n "$root" ] || die 2 "not inside a git worktree"
  printf '%s\n' "$root"
}

slug() {
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" || true
  case "$branch" in ""|HEAD) branch="$(git rev-parse --short HEAD 2>/dev/null)" || true ;; esac
  branch="$(printf '%s' "$branch" | LC_ALL=C tr -c 'A-Za-z0-9._-' '-' | cut -c1-60)"
  [ -n "$branch" ] || die 2 "cannot derive a branch slug"
  printf '%s\n' "$branch"
}

# Relative, or absolute inside the worktree (grilling.md 3.2); empty passes.
path_env_ok() {
  local name="$1" value="$2" root
  [ -n "$value" ] || return 0
  case "$value" in /*) ;; *) return 0 ;; esac
  root="$(repo_root)"
  case "$value/" in "$root"/*) return 0 ;; esac
  printf 'remote-check: %s=%s is outside the worktree %s\n' "$name" "$value" "$root" >&2
  return 1
}

check_path_envs() {
  local n v
  for n in PREVIEW_CSS E2E_SHOTS SHOT_DIR; do
    v="$(printenv "$n" 2>/dev/null || true)"
    path_env_ok "$n" "$v" || exit 2
  done
}

# Env allowlist: only these are forwarded. DATABASE_URL, AUTH_TEST_MAIL_DIR
# and everything else never appear in the export list.
allowed_env_names() {
  printf '%s\n' CHECK_CHROMIUM_JSON ONLY UI17_DEBUG PREVIEW_CSS E2E_SHOTS SHOT_DIR
}

env_allowed() {
  case "$1" in REMOTE_CHECK_*) return 0 ;; esac
  local n
  for n in $(allowed_env_names); do [ "$n" = "$1" ] && return 0; done
  return 1
}

env_export_args() {
  local line name
  env | while IFS= read -r line; do name="${line%%=*}"; if env_allowed "$name"; then printf '%s\n' "$line"; fi; done
}

# One lock per branch slug; locks older than STALE_LOCK_MIN minutes are stolen.
lock_path() { printf '%s/%s.lock\n' "$EVID" "$(slug)"; }

acquire_lock() {
  local lp mtime now age
  lp="$(lock_path)"; mkdir -p "$(dirname "$lp")"
  if mkdir "$lp" 2>/dev/null; then printf '%s\n' "$$" > "$lp/pid"; LOCK_PATH="$lp"; return 0; fi
  mtime="$(stat -f %m "$lp" 2>/dev/null || stat -c %Y "$lp" 2>/dev/null || printf 0)"
  now="$(date +%s)"; age=$(( (now - mtime) / 60 ))
  if [ "$mtime" -gt 0 ] && [ "$age" -gt "$STALE_LOCK_MIN" ]; then
    printf 'remote-check: stealing stale lock (%s min old): %s\n' "$age" "$lp" >&2
    rm -rf "$lp"
    if mkdir "$lp" 2>/dev/null; then printf '%s\n' "$$" > "$lp/pid"; LOCK_PATH="$lp"; return 0; fi
  fi
  printf 'remote-check: lock held: %s\n' "$lp" >&2
  printf 'remote-check: remove it with: rm -rf %s\n' "$lp" >&2
  exit 2
}

release_lock() {
  [ -n "$LOCK_PATH" ] || return 0
  if [ -f "$LOCK_PATH/pid" ] && [ "$(cat "$LOCK_PATH/pid")" = "$$" ]; then rm -rf "$LOCK_PATH"; LOCK_PATH=""; fi
}

trap release_lock EXIT INT TERM

# --------------------------------------------------------------- ssh + paths

# One ssh call per phase; BatchMode never prompts, ConnectTimeout bounds a dead host.
remote() { ssh -o BatchMode=yes -o ConnectTimeout=8 "$HOST" "$@"; }

# Remote host.sh path. HOST_ROOT is the literal string "$HOME/drone/webcheck",
# so "$HOME" survives local expansion and the remote shell expands it.
hostsh() { printf '%s\n' "$HOST_ROOT/${SLUG:-$(slug)}/host.sh"; }

# Local digest of web/package-lock.json; the same value drives npm ci on the host.
lockfile_digest() {
  local lock
  lock="$(repo_root)/web/package-lock.json"
  [ -f "$lock" ] || die 2 "lockfile not found: $lock"
  shasum -a 256 "$lock" | awk '{print $1}'
}

# Local disk floor (5 GiB = 5242880 KB), checked before anything is sent.
disk_guard() {
  local root free floor
  root="$(repo_root)"
  free="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
  [ -n "$free" ] || die 2 "could not read free space for $root with df -Pk"
  floor=$(( ${REMOTE_CHECK_MIN_FREE_GB:-5} * 1024 * 1024 ))
  if [ "$free" -lt "$floor" ]; then
    die 2 "disk below floor: ${free} KB free under $root (need ${floor} KB); free space first, e.g. web/scripts/remote-check.sh --prune <folder>"
  fi
}

# ---------------------------------------------------------------- host phases

# Only the allowlisted env is prefixed, %q-escaped: ssh joins argv with spaces
# and the host shell re-parses the line, so JSON quotes must survive as-is.
remote_env_phase() {
  local line args=()
  while IFS= read -r line; do
    [ -n "$line" ] || continue  # no env to forward yields one empty line
    args["${#args[@]}"]="$(printf '%q' "$line")"
  done <<EOF
$(env_export_args)
EOF
  remote env ${args[@]+"${args[@]}"} "$@"
}

phase_preflight() { remote bash "$(hostsh)" preflight "$@"; }
phase_bootstrap() { remote bash "$(hostsh)" bootstrap "$@"; }
# Serve scripts get no URL: the host starts the server and picks the port.
phase_run()   { remote_env_phase bash "$(hostsh)" run "$@"; }
# Fetch stdout is one tar stream and nothing else; never tee it.
phase_fetch() { remote_env_phase bash "$(hostsh)" fetch "$@"; }
phase_prune() { remote bash "$(hostsh)" prune "$@"; }

# ----------------------------------------------------------------- transport

# (a) branch folder, (b) replace host.sh from this worktree, (c,d) tar-pipe
# web/ (plus an outside-web PREVIEW_CSS member); the remote web/ is cleaned
# depth-1 first (node_modules kept) so the extraction is exactly this tree.
send_tree() {
  local root extra="" wt
  SLUG="${SLUG:-$(slug)}"
  root="$(repo_root)"
  wt="$HOST_ROOT/$SLUG/worktree"
  remote mkdir -p "$HOST_ROOT/$SLUG"
  remote "cat > \"$HOST_ROOT/$SLUG/host.sh\"" < "$root/web/scripts/remote-check-host.sh"
  if [ -n "${PREVIEW_CSS:-}" ]; then
    case "$PREVIEW_CSS" in
      "$root"/web/*) ;;                        # already in the web member
      "$root"/*) extra="${PREVIEW_CSS#"$root"/}" ;;
    esac
  fi
  COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf - -C "$root" \
    --exclude=web/node_modules --exclude=web/.next --exclude=web/.pglite --exclude=web/.e2e-mail \
    web ${extra:+"$extra"} | \
    remote "mkdir -p \"$wt\" && find \"$wt/web\" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} + 2>/dev/null || true; tar xzf - -C \"$wt\""
}

# ------------------------------------------------------------ orchestration

# run_and_fetch <npm-script> [args...]: lock, disk guard, send, phases, fetch
# always, relay the remote status. A failed fetch after a 0 run returns 1.
run_and_fetch() {
  [ "$#" -ge 1 ] || die 2 "usage: run_and_fetch <npm-script> [args...]"
  local script="$1" hash status fetch_rc log p
  shift
  SLUG="${SLUG:-$(slug)}"
  REPO_ROOT="${REPO_ROOT:-$(repo_root)}"
  acquire_lock
  disk_guard
  hash="$(lockfile_digest)"
  mkdir -p "$EVID"
  log="$EVID/$SLUG-$(date +%Y%m%d-%H%M%S).log"
  send_tree || die 1 "source send to $HOST failed"
  phase_preflight "$hash" 2>&1 | tee "$log"
  phase_bootstrap "$hash" 2>&1 | tee -a "$log"
  # The host owns the npm ci decision; its "npm ci skipped" line means the
  # installed tree is reused, so there is nothing left to install.
  if grep -q 'npm ci skipped' "$log" 2>/dev/null; then
    printf 'remote-check: npm ci skipped; installed tree reused\n' >&2
  fi
  set +e
  phase_run "$script" "$@" 2>&1 | tee -a "$log"
  status=${PIPESTATUS[0]}
  set -e
  printf 'remote-check: fetching artifacts (tar stream, not logged)\n' >&2
  set +e
  phase_fetch "$script" | tar xzf - -C "$REPO_ROOT"
  fetch_rc=$?
  set -e
  if [ "$fetch_rc" -ne 0 ]; then
    printf 'remote-check: artifact fetch failed (exit %s)\n' "$fetch_rc" >&2
  fi
  for p in docs/ui-theme/screenshots/ui-12 docs/ui-theme/screenshots/ui-23 \
           docs/ui-theme/screenshots/ui-16 docs/ui-theme/screenshots/ui-19; do
    if [ -e "$REPO_ROOT/$p" ]; then printf 'remote-check: fetched %s\n' "$p"; fi
  done
  if [ -n "${E2E_SHOTS:-}" ]; then printf 'remote-check: fetched %s\n' "$E2E_SHOTS"; fi
  if [ -n "${SHOT_DIR:-}" ]; then printf 'remote-check: fetched %s\n' "$SHOT_DIR"; fi
  printf 'remote-check: evidence is untracked; remove with git clean -fd docs/ui-theme/screenshots before committing\n'
  printf 'remote-check: relayed remote exit %s\n' "$status"
  if [ "$status" -eq 0 ] && [ "$fetch_rc" -ne 0 ]; then return 1; fi
  return "$status"
}

# ------------------------------------------------------------ path env setup

# Absolute-inside-worktree values must name the copy on the host: rewrite to
# $HOME/drone/webcheck/<slug>/worktree/<rel> (the "$HOME" stays literal so the
# remote shell expands it at run time) and keep the local path as <NAME>_LOCAL.
# Relative or empty values pass through untouched.
translate_path_envs() {
  local n v root rel
  root="$(repo_root)"
  for n in PREVIEW_CSS E2E_SHOTS SHOT_DIR; do
    v="$(printenv "$n" 2>/dev/null || true)"
    [ -n "$v" ] || continue
    case "$v" in "$root"/*) ;; *) continue ;; esac
    rel="${v#"$root"/}"
    export "${n}_LOCAL=$v"
    export "$n=$HOST_ROOT/${SLUG:-$(slug)}/worktree/$rel"
  done
}

# cmd_prune <folder>...: only plain single names under ~/drone/webcheck. node,
# ms-playwright, npm-cache and .bootstrap* are shared by every slug; pruning
# one of those costs a full reinstall for somebody else.
cmd_prune() {
  [ "$#" -ge 1 ] || die 2 "usage: remote-check.sh --prune <folder>..."
  local name
  for name in "$@"; do
    case "$name" in
      ""|.|..) die 2 "prune: invalid folder name: '$name'" ;;
      node|ms-playwright|npm-cache|.bootstrap*) die 2 "prune: refusing shared folder: $name" ;;
      *[!A-Za-z0-9._-]*) die 2 "prune: invalid folder name: '$name'" ;;
    esac
  done
  phase_prune "$@"
}

# --------------------------------------------------------------------- main

main() {
  case "${1:-}" in
    --help|-h) usage; exit 0 ;;
    --prune) shift; cmd_prune "$@" ;;
    --selftest) selftest ;;
    *)
      check_path_envs
      case "$(script_mode "${1:-}")" in
        refused) die 2 "${1:-<missing script>} is refused: it needs WebKit and a page URL, absent on the host" ;;
        unknown) printf 'remote-check: WARNING: %s is not in the serve/self table (see --help); attempting anyway\n' "${1:-<missing script>}" >&2 ;;
      esac
      translate_path_envs
      run_and_fetch "$@"
      exit $? ;;
  esac
}

# ------------------------------------------------------------------ selftest

# Local only: no ssh, no network. Fail fast, naming the first failed check.
selftest() {
  local n=0 tmp got out name
  bad() { printf 'remote selftest: FAIL: %s\n' "$1" >&2; exit 1; }

  # a. script_mode classification table
  n=$((n+1)); [ "$(script_mode check:look)" = serve ] || bad "script_mode check:look"
  n=$((n+1)); [ "$(script_mode test:e2e)" = self ] || bad "script_mode test:e2e"
  n=$((n+1)); [ "$(script_mode check:showcase-player)" = refused ] || bad "script_mode check:showcase-player"
  n=$((n+1)); [ "$(script_mode nonsense)" = unknown ] || bad "script_mode nonsense"

  # b. env allowlist drops DATABASE_URL/AUTH_TEST_MAIL_DIR, keeps PREVIEW_CSS
  n=$((n+1))
  out="$(export DATABASE_URL=postgres://x AUTH_TEST_MAIL_DIR=/tmp/m PREVIEW_CSS=web/app/globals.css
         env_export_args)"
  case "$out" in
    *DATABASE_URL*|*AUTH_TEST_MAIL_DIR*) bad "env_export_args leaked a non-allowlisted name" ;;
    *PREVIEW_CSS=web/app/globals.css*) ;;
    *) bad "env_export_args dropped an allowlisted name" ;;
  esac

  # c. prune refuses junk and shared folders before any ssh
  for name in node . .. '*x' ''; do
    n=$((n+1))
    if ( cmd_prune "$name" ) >/dev/null 2>&1; then bad "prune accepted '$name'"; fi
  done

  # d. slug: branch feature/x becomes feature-x
  n=$((n+1))
  tmp="$(mktemp -d)"
  git -c user.email=a@b -c user.name=t -C "$tmp" init -q || bad "slug: git init"
  # symbolic-ref before the first commit: HEAD must name feature/x when slug reads it
  git -C "$tmp" symbolic-ref HEAD refs/heads/feature/x || bad "slug: git symbolic-ref"
  git -C "$tmp" commit -q --allow-empty -m x || bad "slug: git commit"
  got="$( cd "$tmp" && slug )" || got=""
  rm -rf "$tmp"
  [ "$got" = feature-x ] || bad "slug: expected feature-x, got '$got'"

  # e. translate_path_envs rewrites inside-worktree paths, keeps <NAME>_LOCAL
  n=$((n+1))
  got="$(export PREVIEW_CSS="$PWD/web/app/globals.css"
         translate_path_envs
         printf '%s\n%s\n' "${PREVIEW_CSS:-}" "${PREVIEW_CSS_LOCAL:-}")"
  case "$got" in *"/worktree/"*) ;; *) bad "translate_path_envs did not rewrite PREVIEW_CSS" ;; esac
  n=$((n+1))
  case "$got" in *"$PWD/web/app/globals.css"*) ;; *) bad "translate_path_envs lost PREVIEW_CSS_LOCAL" ;; esac

  printf 'remote selftest: %s checks, all pass\n' "$n"
  exit 0
}

main "$@"
