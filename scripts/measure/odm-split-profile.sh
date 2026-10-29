#!/usr/bin/env bash
# One measured split-merge Reconstruction for issue #40, under the host lock.
#   odm-split-profile.sh <name> [extra ODM args...]
# Samples container RAM every 5 s and free disk every 10 s; stops the container
# if free disk falls under the floor, and says so. Writes results/recon-<name>/.
set -u
name=$1; shift
Q=$HOME/drone/q40
out=$Q/results/recon-$name
floor_gb=${FLOOR_GB:-22}
mkdir -p "$out/project"
cname=q40recon-$name
cmd=(docker run --rm --name "$cname" --memory 32g --memory-swap 32g
     -v "$out/project:/datasets" -v "$HOME/drone/golden/bellus-v1/images:/datasets/code/images:ro"
     opendronemap/odm:latest --project-path /datasets code "$@")
printf '%q ' "${cmd[@]}" > "$out/command.txt"; echo >> "$out/command.txt"

export out cname floor_gb
flock "$Q/host.lock" bash -c '
echo "lock acquired $(date -Is)" >> "$out/command.txt"
echo "ts,source,value" > "$out/samples.csv"
( while :; do
    m=$(docker stats --no-stream --format "{{.MemUsage}}" "$cname" 2>/dev/null | awk "{print \$1}")
    [ -n "$m" ] && echo "$(date +%s),ram,$m" >> "$out/samples.csv"
    sleep 5
  done ) & s1=$!
( while :; do
    free=$(df --output=avail -BG / | tail -1 | tr -dc 0-9)
    echo "$(date +%s),free_gb,$free" >> "$out/samples.csv"
    if [ "$free" -lt "$floor_gb" ]; then
      echo "DISK GUARD: ${free}G free, under the ${floor_gb}G floor; stopping $cname at $(date -Is)" >> "$out/run-notes.txt"
      docker stop -t 30 "$cname" >/dev/null 2>&1
    fi
    sleep 10
  done ) & s2=$!
start=$(date +%s)
"$@" > "$out/odm.log" 2>&1
code=$?
end=$(date +%s)
kill $s1 $s2 2>/dev/null; wait $s1 $s2 2>/dev/null
echo "exit=$code start=$start end=$end wall_s=$((end-start))" >> "$out/command.txt"
du -sh "$out/project" >> "$out/run-notes.txt" 2>&1
' _ "${cmd[@]}"
