#!/usr/bin/env bash
# render_still.sh — remote render driver for #223 (architecture §2g; decisions D-223-02/03/06).
#
# usage: render_still.sh <pass-dir-name> [--shot tall|wide|both] [--res WxH] [--k2 key=value] [--az DEG] [--warmup] [--smoke]
#
# Flow: F6 mkdir on host -> hero.py sha gate -> nvidia-smi precheck (free >= our 6144 MiB cap;
# STILL_FREE_FLOOR_MIB to override) -> scp
# still.py -> tmux session still223 (window "render" = Blender, window "vram" = 2 Hz sampler)
# -> poll by files (exit_code, PNGs) -> fetch pass dir back -> D-223-02 VRAM gate report.
#
# --smoke runs a deliberate failing stub on the host under ~/hero3d/still223/.dryrun/<pass>
# and proves non-zero exit propagates across tmux+ssh before any real render (D6).
#
# Never deletes anything, never uses sudo, touches only ~/hero3d/still223 and
# ~/hero3d/out/still-223/<pass> on the host (never ~/hero3d/web4k, ~/drone/scratch, sme-*/arch-*).
set -u -o pipefail

HOST=${STILL_HOST:-akamel-linux}
SESSION=still223
BLENDER=${STILL_BLENDER:-'$HOME/blender-5.2.2-linux-x64/blender'}
STAGE='~/hero3d/still223'
PASSROOT='~/hero3d/out/still-223'
DRYROOT='~/hero3d/still223/.dryrun'
HERO_PIN=cced7337
PEAK_CAP_MIB=${STILL_PEAK_CAP_MIB:-6144}
FREE_FLOOR_MIB=${STILL_FREE_FLOOR_MIB:-$PEAK_CAP_MIB}   # D-223-02: free >= our cap; raise via env for headroom
TIMEOUT=${STILL_TIMEOUT:-10800}
SMOKE_TIMEOUT=${STILL_SMOKE_TIMEOUT:-120}
WATCH_POLLS=57600   # 8 h at 0.5 s
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SSH=(ssh -o ConnectTimeout=10)

die() { # die <exit-code> <message...>
  local c=$1; shift
  printf 'render_still: %s\n' "$*" >&2
  exit "$c"
}
usage() { sed -n '2,4p' "$0" >&2; exit 3; }

[ $# -ge 1 ] || usage
PASS=$1; shift
[[ $PASS =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die 3 "invalid pass-dir-name: '$PASS'"
SHOT=both; RES=""; AZ="0"; SMOKE=0; WARMUP=0
K2ARGV=()
while [ $# -gt 0 ]; do
  case $1 in
    --shot) [ $# -ge 2 ] || usage; SHOT=$2; shift 2 ;;
    --res)  [ $# -ge 2 ] || usage; RES=$2;  shift 2 ;;
    --k2)   [ $# -ge 2 ] || usage; K2ARGV+=("$2"); shift 2 ;;
    --az)   [ $# -ge 2 ] || usage; AZ=$2;   shift 2 ;;
    --warmup) WARMUP=1; shift ;;
    --smoke) SMOKE=1; shift ;;
    -h|--help) usage ;;
    *) die 3 "unknown argument: $1" ;;
  esac
done
case $SHOT in tall|wide|both) ;; *) die 3 "--shot must be tall|wide|both (got '$SHOT')" ;; esac
[[ -z $RES || $RES =~ ^[0-9]+x[0-9]+$ ]] || die 3 "--res must be WxH (got '$RES')"
[[ $AZ =~ ^-?[0-9]+([.][0-9]+)?$ ]] || die 3 "--az must be a number (got '$AZ')"
if [ ${#K2ARGV[@]} -gt 0 ]; then
  for kv in "${K2ARGV[@]}"; do
    [[ $kv =~ ^[A-Za-z0-9_.-]+=[A-Za-z0-9_.+,-]+$ ]] || die 3 "--k2 must be key=value (commas allowed for tuple knobs; got '$kv')"
  done
fi

if [ "$SMOKE" = 1 ]; then
  RSTAGE=$DRYROOT
  RPASS=$DRYROOT/$PASS
  TIMEOUT=$SMOKE_TIMEOUT
  LOCALDIR=${STILL_LOCAL_OUT:-/tmp/still223-smoke}/$PASS
else
  RSTAGE=$STAGE
  RPASS=$PASSROOT/$PASS
  LOCALDIR=${STILL_LOCAL_OUT:-$PWD/hero3d-local}/$PASS
fi

# ---- ssh reachability -------------------------------------------------------
"${SSH[@]}" "$HOST" true 2>/dev/null || die 5 "cannot ssh $HOST"

# ---- F6: create host dirs before scp/render ---------------------------------
if [ "$SMOKE" = 1 ]; then
  "${SSH[@]}" "$HOST" "mkdir -p $RPASS" || die 5 "mkdir -p $RPASS failed"
  printf 'driver: smoke mode -> host dir %s (failing stub; no real render)\n' "$RPASS"
else
  "${SSH[@]}" "$HOST" "mkdir -p $STAGE $RPASS" || die 5 "mkdir -p $STAGE $RPASS failed"
fi

# ---- hero.py pin ------------------------------------------------------------
HERO_SHA=$("${SSH[@]}" "$HOST" "sha256sum ~/hero3d/hero.py 2>/dev/null | cut -c1-8") || die 5 "hero.py sha failed"
[ "$HERO_SHA" = "$HERO_PIN" ] || die 2 "host hero.py sha256 prefix '$HERO_SHA' != '$HERO_PIN' — refusing to render"
printf 'driver: host hero.py sha256 %s… (pin %s)\n' "$HERO_SHA" "$HERO_PIN"

# ---- nvidia-smi precheck ----------------------------------------------------
PRECHECK=$("${SSH[@]}" "$HOST" "nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits" | tr -d ' ')
USED=${PRECHECK%%,*}; TOTAL=${PRECHECK##*,}
[[ $USED =~ ^[0-9]+$ && $TOTAL =~ ^[0-9]+$ ]] || die 5 "cannot parse nvidia-smi precheck: '$PRECHECK'"
FREE=$((TOTAL - USED))
printf 'driver: precheck — device used %s MiB / total %s MiB (free %s MiB)\n' "$USED" "$TOTAL" "$FREE"
if [ "$SMOKE" = 1 ]; then
  printf 'driver: smoke — skipping free-memory gate (%s MiB free)\n' "$FREE"
elif [ "$FREE" -lt "$FREE_FLOOR_MIB" ]; then
  die 4 "free VRAM ${FREE} MiB < ${FREE_FLOOR_MIB} MiB floor (device ${USED}/${TOTAL} MiB used; floor = our ${PEAK_CAP_MIB} MiB cap, override with STILL_FREE_FLOOR_MIB) — aborting before render"
fi
"${SSH[@]}" "$HOST" "printf 'used=%s total=%s free=%s\n' $USED $TOTAL $FREE > $RPASS/precheck.txt" || die 5 "write $RPASS/precheck.txt failed"
"${SSH[@]}" "$HOST" "printf 'az=%s\n' $AZ > $RPASS/azimuth.txt" || die 5 "write $RPASS/azimuth.txt failed"

# ---- still.py -> host -------------------------------------------------------
if [ "$SMOKE" = 1 ] && [ ! -f "$SCRIPT_DIR/still.py" ]; then
  printf 'driver: smoke — scripts/hero/still.py absent (M1 parallel); stub does not need it\n'
else
  [ -f "$SCRIPT_DIR/still.py" ] || die 3 "missing local scene file: $SCRIPT_DIR/still.py"
  scp -q "$SCRIPT_DIR/still.py" "$HOST:$RSTAGE/still.py" || die 5 "scp still.py failed"
  printf 'driver: scp still.py -> %s/still.py\n' "$RSTAGE"
fi

# ---- one render at a time / fresh sentinel ---------------------------------
WINDOWS=$("${SSH[@]}" "$HOST" "tmux list-windows -t $SESSION -F '#{window_name}' 2>/dev/null" || true)
if printf '%s\n' "$WINDOWS" | grep -qx render; then
  die 5 "tmux session $SESSION window 'render' is still running — one render at a time"
elif [ -n "$WINDOWS" ]; then
  die 5 "tmux session $SESSION exists with windows [$(printf '%s' "$WINDOWS" | tr '\n' ' ')] but no 'render' window — stale watcher session; inspect/remove it manually (the driver never kills tmux)"
fi
if "${SSH[@]}" "$HOST" "test -e $RPASS/exit_code" 2>/dev/null; then
  die 5 "$RPASS/exit_code already exists — stale pass dir, use a fresh pass name"
fi

# ---- build inner commands (no single quotes: they sit inside '…' tmux args) --
RESARG=""; [ -n "$RES" ] && RESARG="--res $RES"
AZARG="--az $AZ"
if [ ${#K2ARGV[@]} -gt 0 ]; then
  for kv in "${K2ARGV[@]}"; do AZARG="$AZARG --k2 $kv"; done
fi
WARMUPARG=""; [ "$WARMUP" = 1 ] && WARMUPARG="--warmup"
if [ "$SMOKE" = 1 ]; then
  RENDER_CMD="echo still-smoke-stub-starting; (exit 7); echo \$? > $RPASS/exit_code"
  printf 'driver: smoke — failing stub (exit 7) under tmux %s\n' "$SESSION"
else
  # F-M3-1: Blender 5.2.2 rejects --cycles-print-stats before "--"; its addon options
  # must follow the double dash. Blender consumes the flag there and still.py accepts
  # the residual argv entry (E1). Keep it at the very end of the post-"--" args.
  RENDER_CMD="cd $STAGE && $BLENDER -b --factory-startup --log-level debug --log render --python-exit-code 1 -P $STAGE/still.py -- render $RPASS --shot $SHOT $RESARG $AZARG $WARMUPARG --cycles-print-stats > $RPASS/render.log 2>&1; echo \$? > $RPASS/exit_code"
fi
WATCH_CMD="n=0; while [ ! -f $RPASS/exit_code ] && [ \$n -lt $WATCH_POLLS ]; do nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits >> $RPASS/vram.log; sleep 0.5; n=\$((n+1)); done"

# watcher window first: it creates the session and keeps it alive even if the render
# command (e.g. the smoke stub) exits instantly.
"${SSH[@]}" "$HOST" bash -s <<REMOTE || die 5 "remote launch failed (ssh/tmux)"
tmux new-session -d -s $SESSION -n vram '$WATCH_CMD' || exit 19
tmux new-window -t $SESSION -n render '$RENDER_CMD' || { echo 21 > $RPASS/exit_code; exit 20; }
REMOTE
printf 'driver: launched tmux %s (render + vram windows); polling %s\n' "$SESSION" "$RPASS"

# ---- poll by files ----------------------------------------------------------
elapsed=0; ticks=0; EXIT_CODE=""
while :; do
  EXIT_CODE=$("${SSH[@]}" "$HOST" "cat $RPASS/exit_code 2>/dev/null" || true)
  [ -n "$EXIT_CODE" ] && break
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    "${SSH[@]}" "$HOST" "tmux list-windows -t $SESSION -F '#{window_name}' 2>/dev/null" >&2 || true
    die 6 "timeout after ${TIMEOUT}s waiting for $RPASS/exit_code"
  fi
  sleep 5; elapsed=$((elapsed + 5)); ticks=$((ticks + 1))
  if [ $((ticks % 6)) -eq 0 ]; then
    VR=$("${SSH[@]}" "$HOST" "tail -1 $RPASS/vram.log 2>/dev/null" || true)
    NP=$("${SSH[@]}" "$HOST" "ls $RPASS/*.png 2>/dev/null | wc -l" || true)
    printf 'driver: %ss elapsed — vram=%s MiB, pngs=%s\n' "$elapsed" "${VR:-?}" "${NP:-?}"
  fi
done
printf 'driver: remote exit_code=%s after %ss\n' "$EXIT_CODE" "$elapsed"

# ---- fetch pass dir back ----------------------------------------------------
mkdir -p "$LOCALDIR" || die 5 "mkdir $LOCALDIR failed"
for f in exit_code render.log vram.log precheck.txt azimuth.txt; do
  scp -q "$HOST:$RPASS/$f" "$LOCALDIR/" 2>/dev/null || true
done
scp -q "$HOST:$RPASS/*.png" "$LOCALDIR/" 2>/dev/null || true

if [ "$EXIT_CODE" != 0 ]; then
  if [ "$SMOKE" = 1 ]; then
    printf 'D6 smoke: driver propagated remote exit %s across tmux+ssh (non-zero as required)\n' "$EXIT_CODE"
  else
    printf 'driver: remote render FAILED (exit %s) — render.log tail:\n' "$EXIT_CODE"
    tail -n 20 "$LOCALDIR/render.log" 2>/dev/null || true
  fi
  exit "$EXIT_CODE"
fi

# ---- expected PNGs ----------------------------------------------------------
case $SHOT in
  tall) WANT="tall-s0-f0.png" ;;
  wide) WANT="wide-s0-f0.png" ;;
  *)    WANT="tall-s0-f0.png wide-s0-f0.png" ;;
esac
MISSING=""
for w in $WANT; do [ -s "$LOCALDIR/$w" ] || MISSING="$MISSING $w"; done
[ -z "$MISSING" ] || die 8 "render reported success but PNG(s) missing:$MISSING"
printf 'driver: renders present:%s\n' "$WANT"

# ---- D-223-02 VRAM gate (report only; never aborts) -------------------------
# Cycles leg: Blender 5.2.2 prints no "Peak memory" line; its --cycles-print-stats block
# carries "Mem:<n>M" progress samples. Accept both forms, max over the log; none found =
# unmeasurable (report n/a, never guess).
CY=0; CYSRC=unmeasurable
while IFS= read -r ln; do
  v=${ln#*:}
  v=${v// /}
  v=${v%M}
  v=${v%%.*}
  [ "${v:-0}" -gt "$CY" ] 2>/dev/null && CY=$v
done < <(grep -oE 'Peak memory: *[0-9.]+|Mem: *[0-9.]+' "$LOCALDIR/render.log" 2>/dev/null)
if [ "$CY" -gt 0 ] && grep -qE 'Peak memory: *[0-9.]+' "$LOCALDIR/render.log" 2>/dev/null; then
  CYSRC="Peak memory line"
elif [ "$CY" -gt 0 ]; then
  CYSRC="Mem high-water (Blender 5.2.2 stats)"
fi
VP=$(awk 'BEGIN{m=0} {if ($1+0 > m) m=$1+0} END{print m}' "$LOCALDIR/vram.log" 2>/dev/null || echo 0)
BASE=$(sed -n 's/^used=\([0-9]*\).*/\1/p' "$LOCALDIR/precheck.txt" 2>/dev/null)
BASE=${BASE:-0}
OUR=0
[ "${VP:-0}" -gt "$BASE" ] && OUR=$((VP - BASE))
[ "$CY" -gt "$OUR" ] && OUR=$CY
CYSHOW="n/a (unmeasurable in this Blender build)"; [ "$CY" -gt 0 ] && CYSHOW="$CY MiB (source: $CYSRC)"
printf 'driver: VRAM — cycles leg=%s, vram.log peak=%s MiB, precheck baseline=%s MiB, our-render peak=%s MiB, device total=%s MiB, gate=%s MiB\n' \
  "$CYSHOW" "$VP" "$BASE" "$OUR" "$TOTAL" "$PEAK_CAP_MIB"
if [ "$OUR" -gt "$PEAK_CAP_MIB" ]; then
  EXCESS=$((OUR - PEAK_CAP_MIB))
  if [ "$EXCESS" -le 1024 ]; then RUNG="rung 1: volume_step_rate 1->2->4"
  elif [ "$EXCESS" -le 2048 ]; then RUNG="rung 2: box height 250->150"
  elif [ "$EXCESS" -le 4096 ]; then RUNG="rung 3: footprint 7->4 km"
  else RUNG="rung 4: drop the volume"; fi
  printf 'driver: WARN our-render peak %s MiB > %s MiB gate (+%s MiB) — try %s, then re-measure (do not abort)\n' \
    "$OUR" "$PEAK_CAP_MIB" "$EXCESS" "$RUNG"
fi
[ "$CY" -eq 0 ] && printf 'driver: note — cycles leg unmeasurable in this Blender build; our-render peak is a vram-delta lower bound\n'

printf 'driver: done — pass dir on host %s, fetched to %s\n' "$RPASS" "$LOCALDIR"
exit 0
