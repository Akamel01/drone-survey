#!/bin/bash
# cuts.sh <name> <W> <H> — the files a browser gets, cut from a 4K/120 master that up4k.sh made.
#   cuts.sh hero-tall 1440 2560
#   cuts.sh hero-wide 2560 1440
# 1440p/60 in AV1 (Chrome, Firefox, newer Apple chips) and HEVC (Safari everywhere else), an H.264
# 1080p/30 last resort, and a 1440p poster. A wide master also gets 4K/60 AV1 for screens at
# least 2560 device pixels across. Existing files are kept, so a re-run only makes what is missing.
set -e
T=~/hero3d/tools; cd ~/hero3d/web4k; n=$1; W=$2; H=$3; m=$n-4k120-hevc.mp4
enc() { local out=$1 vf=$2; shift 2; [ -e $out ] || $T/ffmpeg -v error -y -i $m -vf "$vf" "$@" -pix_fmt yuv420p -movflags +faststart $out; }
enc $n-1440p60-av1.mp4 "fps=60,scale=$W:$H:flags=lanczos" -c:v libaom-av1 -crf 36 -b:v 0 -cpu-used 6 -row-mt 1 -tiles 2x2
enc $n-1440p60-hevc.mp4 "fps=60,scale=$W:$H:flags=lanczos" -c:v libx265 -crf 24 -preset medium -tag:v hvc1 -x265-params log-level=error
enc $n-1080p30-h264.mp4 "fps=30,scale=$((W * 3 / 4)):$((H * 3 / 4)):flags=lanczos" -c:v libx264 -crf 21 -preset slow -profile:v high
[ $W -gt $H ] && enc $n-4k60-av1.mp4 "fps=60" -c:v libaom-av1 -crf 40 -b:v 0 -cpu-used 6 -row-mt 1 -tiles 4x2
[ -e $n-poster-1440.jpg ] || $T/ffmpeg -v error -y -i $m -frames:v 1 -vf "scale=$W:-2" -q:v 3 $n-poster-1440.jpg
ls -la $n-*
