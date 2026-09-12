#!/usr/bin/env bash
# Measure one OpenSplat fit: wall time, peak GPU memory, exit status.
# Mirrors splat-fit.sh so the two engines can be compared directly.
#
# Usage: opensplat-fit.sh <odm_project_dir> <run_name> [extra opensplat args...]
# Env:   IMAGE (default opensplat:local)
set -u

project="${1:?odm project dir}"
run="${2:?run name}"
shift 2
image="${IMAGE:-opensplat:local}"
out="$HOME/drone/splat/$run"
mkdir -p "$out"

# ODM records absolute image paths from the container it ran in, so the project
# has to be mounted back at that same path or OpenSplat cannot find the images.
inner="/datasets/$(basename "$project")"

if curl -s --max-time 2 localhost:11434/api/ps 2>/dev/null | grep -q '"name"'; then
  echo "ABORT: an ollama model is loaded; the GPU measurement would be meaningless" >&2
  exit 2
fi

baseline=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
peak=$baseline
(
  while :; do
    u=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
    echo "$(date +%H:%M:%S) $u" >>"$out/gpu.log"
    sleep 5
  done
) &
sampler=$!
trap 'kill $sampler 2>/dev/null' EXIT

start=$(date +%s)
docker run --rm --gpus all --memory 32g --shm-size 8g \
  -v "$project":"$inner" -v "$out":/out \
  "$image" /code/build/opensplat "$inner" -o /out/splat.ply "$@" >"$out/run.log" 2>&1
status=$?
wall=$(( $(date +%s) - start ))

kill $sampler 2>/dev/null
peak=$(awk '{if ($2+0 > m) m=$2+0} END {print m}' "$out/gpu.log")

{
  echo "run=$run image=$image args=$*"
  echo "exit=$status wall_s=$wall"
  echo "gpu_baseline_mib=$baseline gpu_peak_mib=$peak gpu_job_mib=$(( peak - baseline ))"
  echo "--- last lines ---"
  tail -20 "$out/run.log"
  echo "--- outputs ---"
  ls -la "$out"
} | tee "$out/summary.txt"
exit $status
