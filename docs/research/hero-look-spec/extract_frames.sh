#!/usr/bin/env bash
# Extract the 16 look-spec sample frames (8 per framing) from the approved
# 4k120-hevc masters.  #220 / report §2 / ADR-220-2.
#
#   times (master time, s): 0 4.05 8.10 12.15 16.20 20.25 24.30 28.35
#   frame indices        : 0 486  972  1458  1944  2430  2916  3402   (t*120)
# The seam t=32.40 s is excluded (it equals s0).
#
# Reproduce from a clean dir:
#   MASTERS_DIR=<dir> OUT_DIR=<dir> ./extract_frames.sh
set -euo pipefail

MASTERS_DIR="${MASTERS_DIR:-/var/folders/c8/816q70zd5dvd48_49_npqj8w0000gn/T/opencode/hero-look-spec/masters}"
OUT_DIR="${OUT_DIR:-/var/folders/c8/816q70zd5dvd48_49_npqj8w0000gn/T/opencode/hero-look-spec/frames}"
FFMPEG="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"

# Master hashes recorded at S0; a mismatch aborts before extracting anything.
TALL="hero-tall-4k120-hevc.mp4"
WIDE="hero-wide-4k120-hevc.mp4"
TALL_SHA=8fb54b550875cdf0bc46c240bb5a6868b2f039781ed8de0cfdacdb4493abec81
WIDE_SHA=aba25781e62700cce31a490a6872ab00b57083459a0cceaaa1e48fd2b80cc844

TIMES=(0 4.05 8.10 12.15 16.20 20.25 24.30 28.35)
IDX=(0 486 972 1458 1944 2430 2916 3402)

check() { # <file> <expected-sha>
  local got
  got=$(shasum -a 256 "$1" | awk '{print $1}')
  if [ "$got" != "$2" ]; then
    echo "sha256 mismatch for $1: got $got expected $2" >&2
    exit 1
  fi
}

mkdir -p "$OUT_DIR"
check "$MASTERS_DIR/$TALL" "$TALL_SHA"
check "$MASTERS_DIR/$WIDE" "$WIDE_SHA"

extract() { # <framing> <master-file>
  local framing="$1" master="$2" k out
  for k in "${!TIMES[@]}"; do
    out="$OUT_DIR/${framing}-s${k}-f${IDX[$k]}.png"
    "$FFMPEG" -v error -ss "${TIMES[$k]}" -i "$master" \
      -frames:v 1 -pix_fmt rgb24 -f image2 "$out"
  done
}

extract tall "$MASTERS_DIR/$TALL"
extract wide "$MASTERS_DIR/$WIDE"

echo "master sha256:"
shasum -a 256 "$MASTERS_DIR/$TALL" "$MASTERS_DIR/$WIDE"
echo "frame sha256:"
shasum -a 256 "$OUT_DIR"/*.png | sort -k2
echo "extracted $(ls "$OUT_DIR"/*.png | wc -l | tr -d ' ') frames into $OUT_DIR"
