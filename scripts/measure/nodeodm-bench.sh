#!/usr/bin/env bash
# Submit one dataset to a NodeODM-compatible service and measure it, so two
# engines can be compared on identical input and identical options.
#
# Usage: nodeodm-bench.sh <image> <port> <images_dir> <run_name> [extra docker args...]
# Example: nodeodm-bench.sh webodm/nodeodx:latest 3190 ~/drone/datasets/studiokitchen/images odx-cpu
set -u

img="${1:?container image}"
port="${2:?port}"
dir="${3:?images dir}"
run="${4:?run name}"
shift 4
out="$HOME/drone/bench/$run"
mkdir -p "$out"
name="bench-$run"

# The baseline run's options, unchanged — the comparison is only fair if these match.
# OPTS overrides them, for asking what a second engine costs at equal output rather
# than at equal settings.
opts="${OPTS:-[{\"name\":\"feature-quality\",\"value\":\"low\"},{\"name\":\"pc-quality\",\"value\":\"lowest\"},{\"name\":\"use-3dmesh\",\"value\":true},{\"name\":\"orthophoto-resolution\",\"value\":5}]}"

ss -ltn | grep -q ":$port " && { echo "ABORT: port $port is in use" >&2; exit 2; }

docker rm -f "$name" >/dev/null 2>&1
docker run -d --rm --name "$name" --memory 32g --memory-swap 32g \
  -p "127.0.0.1:$port:3000" "$@" "$img" >/dev/null || exit 1

for _ in $(seq 60); do
  curl -sf "http://127.0.0.1:$port/info" >"$out/info.json" && break
  sleep 2
done
version=$(python3 -c "import json;d=json.load(open('$out/info.json'));print(d.get('version'),d.get('engine'),d.get('engineVersion'))" 2>/dev/null)

args=(); for f in "$dir"/*.jpg "$dir"/*.JPG; do [ -f "$f" ] && args+=(-F "images=@$f"); done
count=$(( ${#args[@]} / 2 ))

start=$(date +%s)
uuid=$(curl -s -X POST "${args[@]}" -F "options=$opts" -F "name=$run" \
  "http://127.0.0.1:$port/task/new" | python3 -c "import json,sys;print(json.load(sys.stdin).get('uuid',''))")
[ -z "$uuid" ] && { echo "ABORT: no task uuid returned" >&2; docker logs "$name" | tail -20; docker rm -f "$name" >/dev/null; exit 1; }

status=""; proc=""
while :; do
  sleep 15
  info=$(curl -s "http://127.0.0.1:$port/task/$uuid/info")
  read -r status proc <<<"$(python3 -c "
import json,sys
d=json.loads('''$info''')
print(d.get('status',{}).get('code'), d.get('processingTime',0))" 2>/dev/null)"
  echo "$(date +%H:%M:%S) status=$status processing_ms=$proc" >>"$out/poll.log"
  [ "$status" = "40" ] && break            # completed
  [ "$status" = "30" ] && break            # failed
  [ $(( $(date +%s) - start )) -gt 5400 ] && { status=timeout; break; }
done
wall=$(( $(date +%s) - start ))

zip_bytes=0
if [ "$status" = "40" ]; then
  curl -s "http://127.0.0.1:$port/task/$uuid/download/all.zip" -o "$out/all.zip"
  zip_bytes=$(stat -c%s "$out/all.zip")
fi
curl -s -X POST -d "uuid=$uuid" "http://127.0.0.1:$port/task/remove" >/dev/null
docker logs "$name" >"$out/service.log" 2>&1
docker rm -f "$name" >/dev/null

{
  echo "run=$run image=$img version=$version images=$count"
  echo "status=$status wall_s=$wall processing_s=$(( ${proc:-0} / 1000 ))"
  echo "all_zip_bytes=$zip_bytes"
} | tee "$out/summary.txt"
