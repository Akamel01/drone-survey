#!/usr/bin/env bash
# remote-check-host.sh -- host-side executor for web/scripts/remote-check.sh (#299).
#
# WHY: the web app's browser checks (check:look, check:motion, test:e2e and the
# other check:* scripts) need a GPU-backed Chromium. This Mac cannot give one;
# `akamel-linux` has an idle RTX 4070 SUPER. The Mac wrapper tar-sends this file
# to ~/drone/webcheck/<slug>/host.sh and calls its phases over ssh. Every write
# stays inside ~/drone/webcheck: shared node/, ms-playwright/, npm-cache/, the
# mkdir lock .bootstrap.lock, plus one <slug>/worktree/ per branch. No sudo,
# ever; no other project or port is touched (3180 is NodeODM and is refused
# defensively even though binding port 0 cannot pick it).
#
# USAGE (called by the wrapper, not by hand):
#   remote-check-host.sh preflight [lockfile-sha256]
#   remote-check-host.sh bootstrap [lockfile-sha256]       # node, npm ci, chromium
#   remote-check-host.sh run <npm-script> [args...]        # exits the npm status
#   remote-check-host.sh fetch <npm-script> [rel-path...]  # tar on stdout only
#   remote-check-host.sh prune <folder> [<folder>...]
#   remote-check-host.sh --selftest
#
# The wrapper MUST call `fetch` after `run` whatever the run status was: fetch
# stdout is one tar stream (diagnostics on stderr), so it can never be tee'd.
#
# Exit codes: 0 ok; `run` relays the npm script's own status; 2 refusal (usage,
# disk floor, unsafe prune, refused script); 1 host runtime failure (bootstrap,
# missing system libraries, GPU probe not NVIDIA, build, server, fetch-side).
#
# Env knobs (all optional): REMOTE_CHECK_ROOT (default drone/webcheck),
# REMOTE_CHECK_MIN_FREE_GB (5), REMOTE_CHECK_STALE_LOCK_MIN (120),
# CHECK_NODE_VERSION (pinned below), CHECK_CHROMIUM_JSON (Playwright launch-
# options JSON; the default below is provisional until INT-1), E2E_SHOTS and
# SHOT_DIR (worktree-absolute or web-relative artifact dirs).
set -euo pipefail

NODE_VERSION_DEFAULT="24.21.0"
NODE_DIST_BASE="https://nodejs.org/dist"

# Measured on akamel-linux (RTX 4070 SUPER, driver 595, 2026-09-29): full
# Chromium with ANGLE on EGL renders WebGL on the NVIDIA card; without these
# flags, or with --use-gl=egl, it falls back to SwiftShader. A caller-set
# CHECK_CHROMIUM_JSON wins.
DEFAULT_CHROMIUM_JSON='{"channel":"chromium","args":["--use-angle=gl-egl","--ignore-gpu-blocklist","--enable-gpu"]}'

# The script table (frozen; grilling.md section A -- the one place to edit).
# serve = wrapper build + host-picked port + URL as argv[2]; self = the suite
# builds/serves itself; refused = launches WebKit, which bootstrap never installs.
SERVE_SCRIPTS="check:look check:motion check:map-chrome check:scrollbar check:chrome-motion check:mission-rows check:fold check:area-edit"
SELF_SCRIPTS="test:e2e"
REFUSED_SCRIPTS="check:showcase-player"
PROBE_SCRIPTS="check:look check:motion test:e2e"
ARTIFACTS_LOOK="docs/ui-theme/screenshots/ui-12 docs/ui-theme/screenshots/ui-23"
ARTIFACTS_MOTION="docs/ui-theme/screenshots/ui-16 docs/ui-theme/screenshots/ui-19"
SHARED_NAMES=" node ms-playwright npm-cache "
# Canonical send-side excludes (M2's tar). Anchored so they only match under
# web/. COPYFILE_DISABLE=1 is a Mac-tar concern and deliberately lives in M2.
TAR_EXCLUDES='*/node_modules* */web/.next* */.pglite* */.e2e-mail*'

STALE_LOCK_MIN_DEFAULT=120
MIN_FREE_GB_DEFAULT=5
LOCK_WAIT_MAX_S=900

remote_root="${REMOTE_CHECK_ROOT:-drone/webcheck}"
case "$remote_root" in
  /*) ROOT="$remote_root" ;;
  *) ROOT="$HOME/$remote_root" ;;
esac

say() { printf 'remote-check: %s\n' "$*"; }
warn() { printf 'remote-check: %s\n' "$*" >&2; }
die() { code=$1; shift; printf 'remote-check: %s\n' "$*" >&2; exit "$code"; }

usage() {
  cat <<'EOF'
remote-check-host.sh -- host executor for web/scripts/remote-check.sh (#299)

  preflight [lockfile-sha256]   host facts, disk floor, install-state prediction
  bootstrap [lockfile-sha256]   shared node, npm ci on lockfile change, chromium
  run <npm-script> [args...]    clean outputs, install, build?, probe?, serve, run
  fetch <npm-script> [rel]...   tar the run's artifacts to stdout; stderr is diagnostics
  prune <folder> [<folder>]...  remove named per-branch folders (never shared assets)
  --selftest                    offline fixture checks for this file

Script table: serve-mode (build + host-picked port + URL argv[2]): check:look,
check:motion, check:map-chrome, check:scrollbar, check:chrome-motion,
check:mission-rows, check:fold, check:area-edit. Self-managed: test:e2e.
Refused (WebKit): check:showcase-player. Unknown scripts run toolchain-only.
EOF
}
# ---------------------------------------------------------------- table lookup

script_mode() {
  case " $SERVE_SCRIPTS " in *" $1 "*) printf 'serve\n'; return 0 ;; esac
  case " $SELF_SCRIPTS " in *" $1 "*) printf 'self\n'; return 0 ;; esac
  case " $REFUSED_SCRIPTS " in *" $1 "*) printf 'refused\n'; return 0 ;; esac
  printf 'unknown\n'
}

uses_probe() {
  case " $PROBE_SCRIPTS " in *" $1 "*) return 0 ;; esac
  return 1
}

# The run's own artifact dirs, worktree-relative; one per line.
artifact_dirs_for() {
  case "$1" in
    check:look)   printf '%s\n' $ARTIFACTS_LOOK ;;
    check:motion) printf '%s\n' $ARTIFACTS_MOTION ;;
  esac
}

table_line() {
  printf 'remote-check: "%s" is not in the table; no build/server/GPU probe - see web/scripts/remote-check-host.sh\n' "$1" >&2
}

tar_exclude_args() {
  # set -f: the patterns must reach tar, not match files in the current folder.
  local p; set -f
  for p in $TAR_EXCLUDES; do printf '%s\n' "--exclude=$p"; done
  set +f
}

# --------------------------------------------------------------- pure helpers

lockfile_same() { [ -n "${1:-}" ] && [ "${1:-}" = "${2:-}" ]; }

# <slug>/.install-state is "<lockfile-digest> <node --version>"; a state written
# before the node field existed has only the digest.
state_digest_of() {
  local s=${1:-}
  printf '%s\n' "${s%% *}"
}

state_node_of() {
  case "${1:-}" in
    *" "*) printf '%s\n' "${1#* }" ;;
    *) printf '\n' ;;
  esac
}

disk_below_floor() { [ "$1" -lt "$2" ]; }

# The checks resolve relative paths against their cwd (web/); absolute values
# must already sit inside the worktree. Print the worktree-relative path, or
# return 1 for anything else. Used for E2E_SHOTS/SHOT_DIR clean + fetch.
map_web_path() {
  case "${1:-}" in
    "") return 1 ;;
    /*) case "$1" in "$WORKTREE"/*) printf '%s\n' "${1#"$WORKTREE"/}"; return 0 ;; *) return 1 ;; esac ;;
    *) printf 'web/%s\n' "$1"; return 0 ;;
  esac
}

# Refuse to rm outside the worktree or via a traversal component.
safe_rm_worktree_path() {
  case "${1:-}" in
    ""|/*|*..*) warn "refusing to clean suspicious path: ${1:-}"; return 1 ;;
  esac
  [ -e "$WORKTREE/$1" ] || return 0
  rm -rf -- "$WORKTREE/$1"
  say "cleaned $1"
  return 0
}

mtime_epoch() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || printf '0\n'
}

# --------------------------------------------------------------------- disk

disk_free_kb() { df -Pk / | awk 'NR==2 {print $4}'; }

disk_guard() {
  free=$(disk_free_kb)
  [ -n "$free" ] || die 1 "could not read free space from 'df -Pk /'"
  floor=$(( ${REMOTE_CHECK_MIN_FREE_GB:-$MIN_FREE_GB_DEFAULT} * 1024 * 1024 ))
  say "disk: ${free} KB free on / (floor ${floor} KB)"
  if disk_below_floor "$free" "$floor"; then
    die 2 "disk below floor: ${free} KB free on / < ${floor} KB required; free space first, e.g. web/scripts/remote-check.sh --prune <folder>"
  fi
}

# --------------------------------------------------------------- shared lock

acquire_bootstrap_lock() {
  stale_min=${REMOTE_CHECK_STALE_LOCK_MIN:-$STALE_LOCK_MIN_DEFAULT}
  stale_s=$(( stale_min * 60 ))
  waited=0
  while ! mkdir "$BOOTSTRAP_LOCK" 2>/dev/null; do
    age=$(( $(date +%s) - $(mtime_epoch "$BOOTSTRAP_LOCK") ))
    if [ "$age" -gt "$stale_s" ]; then
      warn "bootstrap lock stale (${age}s > ${stale_s}s); stealing $BOOTSTRAP_LOCK"
      rm -rf -- "$BOOTSTRAP_LOCK"
      continue
    fi
    if [ "$waited" -eq 0 ]; then
      say "waiting for bootstrap lock (held ${age}s): $BOOTSTRAP_LOCK"
    fi
    if [ "$waited" -ge "$LOCK_WAIT_MAX_S" ]; then
      die 1 "bootstrap lock held longer than $(( LOCK_WAIT_MAX_S / 60 )) min; if no install is running, remove $BOOTSTRAP_LOCK"
    fi
    sleep 5
    waited=$(( waited + 5 ))
  done
  printf '%s\n' "$$" > "$BOOTSTRAP_LOCK/pid"
  trap 'rm -rf -- "${BOOTSTRAP_LOCK:-}"' EXIT
}

release_bootstrap_lock() {
  rm -rf -- "${BOOTSTRAP_LOCK:-}"
  trap - EXIT
}
# ------------------------------------------------------------ branch layout

# This file is sent to ~/drone/webcheck/<slug>/host.sh; the branch folder is
# however it is invoked, and must be a direct child of ROOT (never ROOT itself).
init_paths() {
  self_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  BRANCH_DIR=$self_dir
  SLUG=$(basename -- "$BRANCH_DIR")
  case "$BRANCH_DIR" in
    "$ROOT") die 2 "refusing to run: host.sh sits at the webcheck root" ;;
    "$ROOT"/*) ;;
    *) die 2 "refusing to run from $BRANCH_DIR: not inside $ROOT" ;;
  esac
  case "${BRANCH_DIR#"$ROOT"/}" in
    */*) die 2 "refusing to run from a nested path: $BRANCH_DIR" ;;
  esac
  WORKTREE="$BRANCH_DIR/worktree"
  WEB="$WORKTREE/web"
  LOGS="$BRANCH_DIR/logs"
  INSTALL_STATE="$BRANCH_DIR/.install-state"
  PIDFILE="$BRANCH_DIR/server.pid"
}

NODE_HOME="$ROOT/node"
NODE_BIN="$NODE_HOME/bin/node"
NPM_BIN="$NODE_HOME/bin/npm"
BROWSERS="$ROOT/ms-playwright"
NPM_CACHE="$ROOT/npm-cache"
BOOTSTRAP_LOCK="$ROOT/.bootstrap.lock"

use_toolchain() {
  [ -x "$NODE_BIN" ] || die 1 "shared node missing at $NODE_BIN; run bootstrap (or it failed) - see web/scripts/remote-check-host.sh"
  PATH="$NODE_HOME/bin:$PATH"
  export PATH
  export NPM_CONFIG_CACHE="$NPM_CACHE"
  export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS"
  export NEXT_TELEMETRY_DISABLED=1
  # The build mirrors CI's DB-free job; a leaked DATABASE_URL would make
  # migrate.mjs try a real database.
  unset DATABASE_URL
}

node_present_version() {
  if [ -x "$NODE_BIN" ]; then
    "$NODE_BIN" --version 2>/dev/null || true
  fi
}

# Ensure the shared pinned Node. Caller does not hold the bootstrap lock.
ensure_node() {
  want_raw=${CHECK_NODE_VERSION:-$NODE_VERSION_DEFAULT}
  want="v${want_raw#v}"
  have=$(node_present_version)
  if [ "$have" = "$want" ]; then
    say "node: $have present at $NODE_HOME"
    return 0
  fi
  acquire_bootstrap_lock
  have=$(node_present_version)
  if [ "$have" = "$want" ]; then
    say "node: $have present at $NODE_HOME (installed while waiting)"
    release_bootstrap_lock
    return 0
  fi
  arch=$(uname -m)
  case "$arch" in
    x86_64) narch=linux-x64 ;;
    aarch64|arm64) narch=linux-arm64 ;;
    *) die 1 "unsupported host architecture: $arch" ;;
  esac
  ver=${want#v}
  tarball="node-v$ver-$narch.tar.xz"
  tmp="$ROOT/.install-tmp.$$"
  rm -rf -- "$tmp"
  mkdir -p "$tmp"
  say "downloading $NODE_DIST_BASE/$want/$tarball"
  if ! curl -fsSL -o "$tmp/$tarball" "$NODE_DIST_BASE/$want/$tarball"; then
    rm -rf -- "$tmp"
    die 1 "node download failed: $NODE_DIST_BASE/$want/$tarball"
  fi
  if ! curl -fsSL -o "$tmp/SHASUMS256.txt" "$NODE_DIST_BASE/$want/SHASUMS256.txt"; then
    rm -rf -- "$tmp"
    die 1 "node checksum list download failed: $NODE_DIST_BASE/$want/SHASUMS256.txt"
  fi
  if ! ( cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c - ); then
    rm -rf -- "$tmp"
    die 1 "sha256 mismatch for $tarball against the published SHASUMS256.txt; not installing"
  fi
  say "node tarball sha256 $(sha256sum "$tmp/$tarball" | awk '{print $1}') (verified against SHASUMS256.txt)"
  if ! tar -xJf "$tmp/$tarball" -C "$tmp"; then
    rm -rf -- "$tmp"
    die 1 "node tarball extract failed: $tarball"
  fi
  if [ ! -x "$tmp/node-v$ver-$narch/bin/node" ]; then
    rm -rf -- "$tmp"
    die 1 "unexpected layout in $tarball"
  fi
  rm -rf -- "$NODE_HOME"
  mkdir -p "$ROOT"
  mv -- "$tmp/node-v$ver-$narch" "$NODE_HOME"
  rm -rf -- "$tmp"
  say "node installed: $("$NODE_BIN" --version) at $NODE_HOME"
  release_bootstrap_lock
}

pw_version() {
  "$NODE_BIN" -p "require('$WEB/node_modules/playwright-core/package.json').version" 2>/dev/null
}

# Ensure the shared Chromium build pinned by the project's playwright-core.
ensure_playwright() {
  pw=$(pw_version) || die 1 "playwright-core not found under $WEB/node_modules; npm ci has not completed"
  [ -n "$pw" ] || die 1 "could not read the playwright-core version under $WEB/node_modules"
  stamp=""
  if [ -f "$BROWSERS/.playwright-version" ]; then
    stamp=$(cat "$BROWSERS/.playwright-version" 2>/dev/null || true)
  fi
  if [ "$stamp" = "$pw" ]; then
    say "chromium: present in $BROWSERS (playwright-core $pw)"
  else
    acquire_bootstrap_lock
    stamp=""
    if [ -f "$BROWSERS/.playwright-version" ]; then
      stamp=$(cat "$BROWSERS/.playwright-version" 2>/dev/null || true)
    fi
    if [ "$stamp" != "$pw" ]; then
      say "installing chromium (playwright-core $pw) into $BROWSERS"
      mkdir -p "$BROWSERS"
      if ! PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" "$WEB/node_modules/.bin/playwright-core" install chromium; then
        warn "playwright-core install chromium failed; if it names missing system libraries, the operator must install them (this script never does)"
        die 1 "chromium install failed"
      fi
      printf '%s\n' "$pw" > "$BROWSERS/.playwright-version"
      say "chromium installed (playwright-core $pw)"
    fi
    release_bootstrap_lock
  fi
  check_chromium_libs
}

# Missing system libraries: name the sonames and stop; never install packages.
check_chromium_libs() {
  n=0
  for bin in "$BROWSERS"/chromium-*/chrome-linux*/chrome "$BROWSERS"/chromium_headless_shell-*/chrome-linux*/headless_shell; do
    [ -f "$bin" ] || continue
    n=$(( n + 1 ))
    missing=$(ldd "$bin" 2>/dev/null | awk '/not found/ {print $1}' | sort -u || true)
    if [ -n "$missing" ]; then
      warn "chromium cannot load: $bin"
      warn "missing system libraries: $(printf '%s ' $missing)"
      for so in $missing; do
        warn "  dnf provides '$so'   (apt hosts: apt-get install <package>; this script never installs packages)"
      done
      die 1 "missing Chromium system libraries; operator remedy: sudo npx playwright-core install-deps chromium, then re-run"
    fi
  done
  [ "$n" -gt 0 ] || die 1 "no chromium binary found under $BROWSERS"
  say "chromium libraries ok ($n binaries checked with ldd)"
}

# npm ci only when the Mac-supplied lockfile digest changed, the recorded Node
# version differs, or node_modules is missing; "<digest> <node-version>" is
# written into <slug>/.install-state after success.
install_if_needed() {
  supplied=${1:-}
  [ -d "$WEB" ] || die 1 "web/ tree missing at $WEB (send phase incomplete?)"
  [ -f "$WEB/package-lock.json" ] || die 1 "web/package-lock.json missing under $WEB"
  state=""
  if [ -f "$INSTALL_STATE" ]; then
    state=$(cat "$INSTALL_STATE" 2>/dev/null || true)
  fi
  # A supplied digest must match exactly, and the recorded Node version must
  # equal the current one (a Node change reinstalls). No digest (the run phase
  # after a bootstrap): a matching state plus an existing node_modules is the
  # bootstrap's own verdict, so trust it.
  state_digest=$(state_digest_of "$state")
  state_node=$(state_node_of "$state")
  want_node=$("$NODE_BIN" --version 2>/dev/null || true)
  skip=0
  if [ -d "$WEB/node_modules" ] && [ -n "$state_digest" ] && [ "$state_node" = "$want_node" ]; then
    if [ -n "$supplied" ]; then
      if lockfile_same "$state_digest" "$supplied"; then skip=1; fi
    else
      skip=1
    fi
  fi
  if [ "$skip" -eq 1 ]; then
    say "npm ci skipped (lockfile unchanged)"
    return 0
  fi
  disk_guard
  if [ ! -d "$WEB/node_modules" ]; then
    say "web/node_modules missing; npm ci forced"
  fi
  if [ -z "$supplied" ]; then
    supplied=$(sha256sum "$WEB/package-lock.json" | awk '{print $1}')
    warn "no lockfile digest supplied by the caller; hashed on the host: $supplied"
  fi
  say "npm ci (lockfile sha256 changed)"
  if ! ( cd "$WEB" && NPM_CONFIG_CACHE="$NPM_CACHE" "$NPM_BIN" ci ); then
    die 1 "npm ci failed"
  fi
  printf '%s %s\n' "$supplied" "$want_node" > "$INSTALL_STATE"
  say "install state written: $INSTALL_STATE"
}
# ---------------------------------------------------------------- port/server

# Bind 127.0.0.1:0 and release: the authoritative free-port test, so no
# listening service (3180 included) can be picked.
pick_port() {
  if [ -x "$NODE_BIN" ]; then
    "$NODE_BIN" -e 'var s=require("net").createServer();s.listen(0,"127.0.0.1",function(){process.stdout.write(String(s.address().port));s.close()})'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'
  else
    return 1
  fi
}

stop_server_now() {
  if [ -n "${SERVER_PID:-}" ]; then
    if [ "${SERVER_SETSID:-1}" = 0 ]; then
      # no process group (setsid absent): signal npm's children (next) too
      pkill -TERM -P "$SERVER_PID" 2>/dev/null || true
    fi
    kill -TERM "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    i=0
    while [ "$i" -lt 10 ] && kill -0 "$SERVER_PID" 2>/dev/null; do
      sleep 0.5
      i=$(( i + 1 ))
    done
    if [ "${SERVER_SETSID:-1}" = 0 ]; then
      pkill -KILL -P "$SERVER_PID" 2>/dev/null || true
    fi
    kill -KILL "-$SERVER_PID" 2>/dev/null || kill -KILL "$SERVER_PID" 2>/dev/null || true
    rm -f -- "$PIDFILE"
    SERVER_PID=""
  fi
}

cleanup_server() {
  st=$?
  stop_server_now
  exit "$st"
}

# A pidfile whose pid is alive and whose cwd is this branch's web/ is a stale
# server from a previous run; anything else is left alone.
kill_stale_server() {
  [ -f "$PIDFILE" ] || return 0
  old=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    oldcwd=$(readlink "/proc/$old/cwd" 2>/dev/null || true)
    if [ "$oldcwd" = "$WEB" ]; then
      warn "killing stale next start from a previous run (pid $old)"
      kill -TERM "-$old" 2>/dev/null || kill -TERM "$old" 2>/dev/null || true
      i=0
      while [ "$i" -lt 10 ] && kill -0 "$old" 2>/dev/null; do
        sleep 0.5
        i=$(( i + 1 ))
      done
      kill -KILL "-$old" 2>/dev/null || kill -KILL "$old" 2>/dev/null || true
    else
      warn "pidfile $PIDFILE names pid $old whose cwd is not $WEB; leaving it alone"
    fi
  fi
  rm -f -- "$PIDFILE"
}

# setsid puts npm and the Next server in their own process group (pid == pgid),
# so one `kill -- -pid` reaches both; ssh dropping SIGHUPs the runner and the
# EXIT/HUP trap fires. The pid is written from inside the new session, so the
# pidfile is right even if setsid forks.
start_server() {
  mkdir -p "$LOGS"
  : > "$LOGS/server.log"
  if command -v setsid >/dev/null 2>&1; then
    SERVER_SETSID=1
    ( cd "$WEB" && exec setsid bash -c 'echo $$ > "$1"; shift; exec "$@"' bash "$PIDFILE" "$NPM_BIN" run start -- -p "$PORT" -H 127.0.0.1 ) >>"$LOGS/server.log" 2>&1 &
  else
    # No setsid: no new process group, so cleanup also signals this pid's
    # children (next start) explicitly -- see stop_server_now.
    SERVER_SETSID=0
    ( cd "$WEB" && exec bash -c 'echo $$ > "$1"; shift; exec "$@"' bash "$PIDFILE" "$NPM_BIN" run start -- -p "$PORT" -H 127.0.0.1 ) >>"$LOGS/server.log" 2>&1 &
  fi
  job_pid=$!
  i=0
  while [ "$i" -lt 20 ] && [ ! -s "$PIDFILE" ]; do
    sleep 0.1
    i=$(( i + 1 ))
  done
  SERVER_PID=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -z "$SERVER_PID" ]; then
    SERVER_PID=$job_pid
    printf '%s\n' "$SERVER_PID" > "$PIDFILE"
  fi
}

wait_ready() {
  i=0
  while [ "$i" -lt 200 ]; do
    if curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
      say "server ready on http://127.0.0.1:$PORT"
      return 0
    fi
    if [ -n "${SERVER_PID:-}" ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
      warn "next start exited before becoming ready; log tail:"
      tail -n 40 "$LOGS/server.log" >&2 || true
      return 1
    fi
    sleep 0.3
    i=$(( i + 1 ))
  done
  warn "next start did not answer on http://127.0.0.1:$PORT within 60s; log tail:"
  tail -n 40 "$LOGS/server.log" >&2 || true
  return 1
}

start_and_wait() {
  attempts=0
  while [ "$attempts" -lt 2 ]; do
    attempts=$(( attempts + 1 ))
    start_server
    if wait_ready; then
      return 0
    fi
    stop_server_now
    if grep -q 'EADDRINUSE' "$LOGS/server.log" 2>/dev/null; then
      PORT=$(pick_port) || return 1
      say "port=$PORT (retry after EADDRINUSE)"
    else
      return 1
    fi
  done
  return 1
}

# ------------------------------------------------------------------- run bits

build_web() {
  disk_guard
  say "next build (B2/DISPATCH placeholders, no DATABASE_URL)"
  export B2_BUCKET=ci B2_KEY_ID=ci B2_APP_KEY=ci B2_READ_KEY_ID=ci B2_READ_APP_KEY=ci DISPATCH_SECRET=ci
  export NEXT_TELEMETRY_DISABLED=1
  if ! ( cd "$WEB" && "$NPM_BIN" run build ); then
    die 1 "npm run build failed"
  fi
}

run_probe() {
  say "gpu probe: node scripts/lib/gpu-probe.mjs (CHECK_CHROMIUM_JSON=$CHECK_CHROMIUM_JSON)"
  if ! ( cd "$WEB" && "$NODE_BIN" scripts/lib/gpu-probe.mjs ); then
    die 1 "GPU probe failed for $1: the renderer is not NVIDIA; refusing to run the check (fail-closed; diagnostics above)"
  fi
}

# Clean this run's own output dirs so fetched artifacts are provably this run's:
# every serve-mode check writes somewhere in the four screenshot dirs, test:e2e
# only writes a mapped E2E_SHOTS (clean via the env loop below).
clean_run_dirs() {
  script=$1
  if [ "$(script_mode "$script")" = serve ]; then
    for rel in $ARTIFACTS_LOOK $ARTIFACTS_MOTION; do
      safe_rm_worktree_path "$rel" || true
    done
  fi
  for var in E2E_SHOTS SHOT_DIR; do
    case "$var" in
      E2E_SHOTS) value=${E2E_SHOTS:-} ;;
      SHOT_DIR)  value=${SHOT_DIR:-} ;;
    esac
    [ -n "$value" ] || continue
    rel=$(map_web_path "$value" || true)
    if [ -z "$rel" ]; then
      warn "$var=$value is not inside the worktree; not cleaning it"
      continue
    fi
    safe_rm_worktree_path "$rel" || true
  done
}
# -------------------------------------------------------------------- phases

phase_preflight() {
  hash=${1:-}
  mkdir -p "$ROOT"
  say "host: $(uname -srm) / bash $BASH_VERSION / user $(id -un)"
  say "root: $ROOT"
  disk_guard
  if [ -x "$NODE_BIN" ]; then
    say "node: $("$NODE_BIN" --version) at $NODE_HOME"
  else
    say "node: absent (bootstrap installs v${CHECK_NODE_VERSION:-$NODE_VERSION_DEFAULT})"
  fi
  if [ -f "$BROWSERS/.playwright-version" ]; then
    say "chromium: stamp $(cat "$BROWSERS/.playwright-version" 2>/dev/null || true)"
  else
    say "chromium: absent (bootstrap installs it)"
  fi
  if [ -d "$WEB/node_modules" ]; then
    say "web/node_modules: present"
  else
    say "web/node_modules: absent (npm ci will run)"
  fi
  state=""
  if [ -f "$INSTALL_STATE" ]; then
    state=$(cat "$INSTALL_STATE" 2>/dev/null || true)
  fi
  if [ -n "$hash" ] && lockfile_same "$(state_digest_of "$state")" "$hash" && [ -d "$WEB/node_modules" ]; then
    say "install-state: npm ci would be skipped (lockfile unchanged)"
  else
    say "install-state: npm ci would run (lockfile changed or first run)"
  fi
  say "preflight ok"
}

phase_bootstrap() {
  hash=${1:-}
  mkdir -p "$ROOT"
  disk_guard
  ensure_node
  use_toolchain
  install_if_needed "$hash"
  ensure_playwright
  disk_guard
  say "bootstrap complete"
}

phase_run() {
  script=${1:-}
  [ -n "$script" ] || die 2 "usage: remote-check-host.sh run <npm-script> [args...]"
  shift
  # Every mode tees to $LOGS/check.log; create it before anything can run.
  mkdir -p "$LOGS"
  mode=$(script_mode "$script")
  if [ "$mode" = refused ]; then
    die 2 "refused: $script launches WebKit (showcase-player-check.mjs), which the host toolchain does not install; see the table in web/scripts/remote-check-host.sh"
  fi
  say "folder=$BRANCH_DIR"
  PORT="-"
  if [ "$mode" = serve ]; then
    if [ "$#" -gt 0 ]; then
      die 2 "$script is a serve-mode script: the base URL is argv[2] and the host picks the port; extra arguments are refused (got: $*)"
    fi
    PORT=$(pick_port) || die 1 "could not pick a free port"
    if [ "$PORT" = "3180" ]; then
      die 1 "port picker returned 3180 (NodeODM); refusing"
    fi
  fi
  say "port=$PORT"
  if [ "$mode" = unknown ]; then
    table_line "$script"
  fi
  use_toolchain
  clean_run_dirs "$script"
  install_if_needed ""
  if [ "$mode" = serve ]; then
    build_web
  fi
  if uses_probe "$script"; then
    : "${CHECK_CHROMIUM_JSON:=$DEFAULT_CHROMIUM_JSON}"
    export CHECK_CHROMIUM_JSON
    run_probe "$script"
  fi
  if [ "$mode" = serve ]; then
    kill_stale_server
    trap cleanup_server EXIT HUP INT TERM
    start_and_wait || die 1 "next start failed on port $PORT (see $LOGS/server.log)"
    say "running: npm run $script -- http://127.0.0.1:$PORT"
  else
    say "running: npm run $script $*"
  fi
  set +e
  if [ "$mode" = serve ]; then
    ( cd "$WEB" && "$NPM_BIN" run "$script" -- "http://127.0.0.1:$PORT" ) 2>&1 | tee "$LOGS/check.log"
  else
    ( cd "$WEB" && "$NPM_BIN" run "$script" -- "$@" ) 2>&1 | tee "$LOGS/check.log"
  fi
  STATUS=${PIPESTATUS[0]}
  set -e
  if [ "$mode" = unknown ] && [ "$STATUS" -ne 0 ]; then
    table_line "$script"
  fi
  exit "$STATUS"
}

# fetch: stdout is one tar stream and nothing else; every diagnostic is stderr.
fetch_add() {
  list=$1
  rel=$2
  [ -n "$rel" ] || return 0
  case "$rel" in
    /*|*..*) warn "fetch: refusing path $rel"; return 0 ;;
  esac
  [ -e "$WORKTREE/$rel" ] || return 0
  if grep -qxF -- "$rel" "$list" 2>/dev/null; then
    return 0
  fi
  printf '%s\n' "$rel" >> "$list"
  warn "fetched $rel"
}

phase_fetch() {
  script=${1:-}
  [ -n "$script" ] || die 2 "usage: remote-check-host.sh fetch <npm-script> [rel-path...]"
  shift
  list="$BRANCH_DIR/.fetch-list.$$"
  : > "$list"
  trap 'rm -f -- "${list:-}"' EXIT
  for rel in $(artifact_dirs_for "$script"); do
    fetch_add "$list" "$rel"
  done
  for rel in "$@"; do
    fetch_add "$list" "$rel"
  done
  fetch_add "$list" "$(map_web_path "${E2E_SHOTS:-}" 2>/dev/null || true)"
  fetch_add "$list" "$(map_web_path "${SHOT_DIR:-}" 2>/dev/null || true)"
  if [ -s "$list" ]; then
    if ! tar -czf - $(tar_exclude_args) -C "$WORKTREE" -T "$list"; then
      rm -f -- "$list"
      die 1 "artifact tar failed (paths listed above)"
    fi
  else
    warn "no artifacts to fetch"
    tar -czf - -T /dev/null
  fi
  rm -f -- "$list"
  trap - EXIT
}

prune_validate_name() {
  name=${1:-}
  [ -n "$name" ] || return 1
  case "$name" in
    .|..) return 1 ;;
  esac
  case "$name" in
    *[!A-Za-z0-9._-]*) return 1 ;;
  esac
  case " $SHARED_NAMES " in
    *" $name "*) return 1 ;;
  esac
  case "$name" in
    .bootstrap*) return 1 ;;
  esac
  return 0
}

prune_one() {
  name=$1
  if ! prune_validate_name "$name"; then
    if [ -z "$name" ]; then
      die 2 "prune: empty folder name"
    fi
    case " $SHARED_NAMES " in
      *" $name "*) die 2 "prune: refusing shared asset '$name'" ;;
    esac
    case "$name" in
      .bootstrap*) die 2 "prune: refusing shared asset '$name'" ;;
    esac
    die 2 "prune: refusing '$name' (allowed: [A-Za-z0-9._-]+, no globs, no paths)"
  fi
  target="$ROOT/$name"
  # realpath -m (GNU) resolves symlinks without requiring existence: the target
  # must be a direct child of the resolved webcheck root, so a symlinked name
  # cannot smuggle the removal elsewhere.
  if command -v realpath >/dev/null 2>&1 && realpath -m / >/dev/null 2>&1; then
    root_real=$(realpath -m -- "$ROOT")
    resolved=$(realpath -m -- "$target") || die 1 "prune: cannot resolve $target"
    case "$resolved" in
      "$root_real"/*) ;;
      *) die 2 "prune: refusing '$name': $resolved is not inside $root_real" ;;
    esac
    rest=${resolved#"$root_real"/}
    case "$rest" in
      */*) die 2 "prune: refusing '$name': $resolved is not a direct child of $root_real" ;;
    esac
  fi
  if [ -e "$target/run.lock" ]; then
    die 2 "prune: refusing '$name': $target/run.lock exists (a run may be in progress; remove the lock first if it is stale)"
  fi
  if [ ! -e "$target" ]; then
    say "prune: $name not present under $ROOT"
    return 0
  fi
  say "prune: $(du -sh -- "$target" 2>/dev/null | awk '{print $1}') $target"
  rm -rf -- "$target"
  say "prune: removed $name"
}

phase_prune() {
  [ "$#" -ge 1 ] || die 2 "usage: remote-check-host.sh prune <folder> [<folder>...]"
  for name in "$@"; do
    prune_one "$name"
  done
}
# ------------------------------------------------------------------ selftest

st_eq() {
  label=$1
  want=$2
  got=$3
  if [ "$want" = "$got" ]; then
    printf 'host selftest: ok   %s\n' "$label"
  else
    printf 'host selftest: FAIL %s (want [%s], got [%s])\n' "$label" "$want" "$got" >&2
    selftest_fail=1
  fi
}

st_code() {
  label=$1
  want=$2
  shift 2
  if "$@" >/dev/null 2>&1; then
    got=0
  else
    got=$?
  fi
  st_eq "$label" "$want" "$got"
}

selftest() {
  selftest_fail=0
  WORKTREE=/fixture/worktree

  # script-table lookup
  st_eq 'table: check:look is serve' serve "$(script_mode check:look)"
  st_eq 'table: check:motion is serve' serve "$(script_mode check:motion)"
  st_eq 'table: check:map-chrome is serve' serve "$(script_mode check:map-chrome)"
  st_eq 'table: check:scrollbar is serve' serve "$(script_mode check:scrollbar)"
  st_eq 'table: check:chrome-motion is serve' serve "$(script_mode check:chrome-motion)"
  st_eq 'table: check:mission-rows is serve' serve "$(script_mode check:mission-rows)"
  st_eq 'table: check:fold is serve' serve "$(script_mode check:fold)"
  st_eq 'table: check:area-edit is serve' serve "$(script_mode check:area-edit)"
  st_eq 'table: test:e2e is self' self "$(script_mode test:e2e)"
  st_eq 'table: check:showcase-player is refused' refused "$(script_mode check:showcase-player)"
  st_eq 'table: anything else is unknown' unknown "$(script_mode npm-run-anything)"
  st_eq 'probe: check:look' 0 "$(uses_probe check:look; echo $?)"
  st_eq 'probe: check:motion' 0 "$(uses_probe check:motion; echo $?)"
  st_eq 'probe: test:e2e' 0 "$(uses_probe test:e2e; echo $?)"
  st_eq 'probe: check:map-chrome is not wired' 1 "$(uses_probe check:map-chrome; echo $?)"
  st_eq 'artifacts: look' 'docs/ui-theme/screenshots/ui-12 docs/ui-theme/screenshots/ui-23' "$(artifact_dirs_for check:look | tr '\n' ' ' | sed 's/ *$//')"
  st_eq 'artifacts: motion' 'docs/ui-theme/screenshots/ui-16 docs/ui-theme/screenshots/ui-19' "$(artifact_dirs_for check:motion | tr '\n' ' ' | sed 's/ *$//')"
  st_eq 'artifacts: test:e2e none' '' "$(artifact_dirs_for test:e2e)"

  # prune name validation, refusals included
  st_code 'prune: allows oc-299' 0 prune_validate_name oc-299
  st_code 'prune: allows dots and dashes' 0 prune_validate_name oc.299-b
  st_code 'prune: refuses node' 1 prune_validate_name node
  st_code 'prune: refuses ms-playwright' 1 prune_validate_name ms-playwright
  st_code 'prune: refuses npm-cache' 1 prune_validate_name npm-cache
  st_code 'prune: refuses .bootstrap.lock' 1 prune_validate_name .bootstrap.lock
  st_code 'prune: refuses .' 1 prune_validate_name .
  st_code 'prune: refuses ..' 1 prune_validate_name ..
  st_code 'prune: refuses empty' 1 prune_validate_name ''
  st_code 'prune: refuses glob' 1 prune_validate_name '*'
  st_code 'prune: refuses slash' 1 prune_validate_name 'a/b'
  st_code 'prune: refuses colon' 1 prune_validate_name 'check:look'

  # run-phase clean guard (depth-limited: no traversal, no absolute, no root)
  st_code 'clean: refuses traversal' 1 safe_rm_worktree_path '../x'
  st_code 'clean: refuses absolute' 1 safe_rm_worktree_path '/tmp/x'
  st_code 'clean: relative missing path is a no-op' 0 safe_rm_worktree_path 'docs/ui-theme/screenshots/ui-12'

  # tar exclude list: anchored patterns only; COPYFILE_DISABLE is Mac-side (M2)
  st_eq 'excludes: anchored list' '--exclude=*/node_modules* --exclude=*/web/.next* --exclude=*/.pglite* --exclude=*/.e2e-mail*' "$(tar_exclude_args | tr '\n' ' ' | sed 's/ *$//')"
  st_eq 'excludes: no COPYFILE_DISABLE in the host list' '' "$(tar_exclude_args | grep COPYFILE_DISABLE || true)"

  # lockfile-hash compare
  st_eq 'lockfile: equal digests' 0 "$(lockfile_same aaa aaa; echo $?)"
  st_eq 'lockfile: different digests' 1 "$(lockfile_same aaa bbb; echo $?)"
  st_eq 'lockfile: empty never matches (first run)' 1 "$(lockfile_same '' aaa; echo $?)"
  st_eq 'lockfile: empty state never matches' 1 "$(lockfile_same '' ''; echo $?)"

  # install-state fields: "<digest> <node-version>"; a legacy state has no node
  st_eq 'state: digest field' aaa "$(state_digest_of 'aaa v24.21.0')"
  st_eq 'state: node field' v24.21.0 "$(state_node_of 'aaa v24.21.0')"
  st_eq 'state: legacy digest-only state has no node' '' "$(state_node_of 'aaa')"
  st_eq 'state: empty state has no fields' ':' "$(state_digest_of ''):$(state_node_of '')"

  # artifact path mapping (fixtures; nothing touches the filesystem)
  st_eq 'map: relative resolves under web/' 'web/shots/x' "$(map_web_path 'shots/x')"
  st_eq 'map: absolute inside the worktree' 'docs/x' "$(map_web_path '/fixture/worktree/docs/x')"
  st_eq 'map: absolute outside the worktree refused' '' "$(map_web_path '/tmp/x' || true)"
  st_eq 'map: empty refused' '' "$(map_web_path '' || true)"

  # disk-floor arithmetic (5 GiB floor = 5 * 1024 * 1024 KB)
  st_eq 'disk: one KB below floor refuses' 0 "$(disk_below_floor 5242879 5242880; echo $?)"
  st_eq 'disk: exactly at floor passes' 1 "$(disk_below_floor 5242880 5242880; echo $?)"
  st_eq 'disk: above floor passes' 1 "$(disk_below_floor 9000000 5242880; echo $?)"

  # run phase, non-serve (test:e2e): (a) a stale node-version in .install-state
  # must force npm ci even with an existing node_modules; (b) $LOGS must exist
  # before the tee even when no serve-mode run created it. Stubbed toolchain;
  # only the fixture tree is touched.
  fix=$(mktemp -d)
  mkdir -p "$fix/webcheck/oc-st/worktree/web/node_modules" "$fix/webcheck/node/bin"
  printf '#!/bin/sh\n[ "${1:-}" = "--version" ] && echo v24.21.0\nexit 0\n' > "$fix/webcheck/node/bin/node"
  printf '#!/bin/sh\n[ "${1:-}" = "ci" ] && : > "$(dirname "$0")/ci-ran"\nexit 0\n' > "$fix/webcheck/node/bin/npm"
  printf '#!/bin/sh\necho fakedigest\n' > "$fix/webcheck/node/bin/sha256sum"
  chmod +x "$fix/webcheck/node/bin/node" "$fix/webcheck/node/bin/npm" "$fix/webcheck/node/bin/sha256sum"
  : > "$fix/webcheck/oc-st/worktree/web/package-lock.json"
  printf 'deadbeef v0.0.0\n' > "$fix/webcheck/oc-st/.install-state"
  cp "$0" "$fix/webcheck/oc-st/host.sh"
  fix_rc=0
  REMOTE_CHECK_ROOT="$fix/webcheck" REMOTE_CHECK_MIN_FREE_GB=0 "$BASH" "$fix/webcheck/oc-st/host.sh" run test:e2e >/dev/null 2>&1 || fix_rc=$?
  st_eq 'run: non-serve phase exits 0' 0 "$fix_rc"
  st_code 'run: node change in .install-state forces npm ci' 0 test -f "$fix/webcheck/node/bin/ci-ran"
  st_eq 'run: .install-state rewritten with digest + node' 'fakedigest v24.21.0' "$(cat "$fix/webcheck/oc-st/.install-state")"
  st_code 'run: non-serve phase creates $LOGS/check.log' 0 test -f "$fix/webcheck/oc-st/logs/check.log"
  rm -rf "$fix"

  if [ "$selftest_fail" -eq 0 ]; then
    printf 'host selftest: all pass\n'
    return 0
  fi
  printf 'host selftest: failures above\n' >&2
  return 1
}

# ---------------------------------------------------------------------- main

main() {
  phase=${1:-}
  case "$phase" in
    --selftest) selftest; exit $? ;;
    --help|-h) usage; exit 0 ;;
    preflight|bootstrap|run|fetch|prune) ;;
    *) usage >&2; die 2 "unknown phase: ${phase:-<missing>}" ;;
  esac
  init_paths
  shift
  case "$phase" in
    preflight) phase_preflight "$@" ;;
    bootstrap) phase_bootstrap "$@" ;;
    run) phase_run "$@" ;;
    fetch) phase_fetch "$@" ;;
    prune) phase_prune "$@" ;;
  esac
}

main "$@"
