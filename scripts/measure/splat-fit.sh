#!/usr/bin/env bash
# Fit a Gaussian Splatting Reconstruction from a finished ODM project, and record
# peak GPU memory and wall clock. Measurement harness for ticket #8, not a Node.
#
# usage: splat-fit.sh <odm_project_dir> <run_name> [max_iterations] [num_downscales] [method]
#
# Optional environment:
#   EXTRA_TRAIN_ARGS         extra flags appended to ns-train, e.g. to disable eval
#   PYTORCH_CUDA_ALLOC_CONF  passed into the container, e.g. expandable_segments:True
#
# The ODM project must have run to completion: nerfstudio's native ODM importer
# reads odm_report/shots.geojson, which ODM writes near the end of its run.
set -uo pipefail

PROJECT=${1:?odm project dir}
NAME=${2:?run name}
ITERATIONS=${3:-30000}
DOWNSCALES=${4:-0}
METHOD=${5:-splatfacto}
EXTRA_TRAIN_ARGS=${EXTRA_TRAIN_ARGS:-}
ALLOC_CONF=${PYTORCH_CUDA_ALLOC_CONF:-}

IMAGE=ghcr.io/nerfstudio-project/nerfstudio:latest
OUT="$HOME/drone/splat/$NAME"
mkdir -p "$OUT"

# The pinned embedding model and a GPU job must not share the card. The informal
# arrangement is not enforcement, so check before starting (ticket #12).
if docker exec sme_ollama ollama ps 2>/dev/null | awk 'NR>1' | grep -q .; then
  echo "ABORT: an ollama model is loaded on the GPU" | tee "$OUT/summary.txt"
  exit 2
fi

BASELINE=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
(while true; do
  echo "$(date +%T) $(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)"
  sleep 5
done) > "$OUT/gpu.log" &
SAMPLER=$!
trap 'kill "$SAMPLER" 2>/dev/null' EXIT

START=$(date +%s)
docker run --rm --gpus all --memory 32g --memory-swap 32g --shm-size 8g \
  -e PYTORCH_CUDA_ALLOC_CONF="$ALLOC_CONF" \
  -v "$PROJECT:/odm:ro" -v "$OUT:/out" --entrypoint bash "$IMAGE" -lc "
    ns-process-data odm --data /odm --output-dir /out/processed --num-downscales $DOWNSCALES &&
    ns-train $METHOD --data /out/processed --output-dir /out/train \
      --max-num-iterations $ITERATIONS \
      --viewer.quit-on-train-completion True --vis tensorboard \
      $EXTRA_TRAIN_ARGS
  " > "$OUT/run.log" 2>&1
RC=$?
END=$(date +%s)

PEAK=$(awk '{print $2}' "$OUT/gpu.log" | sort -n | tail -1)
LAST_STEP=$(sed 's/\x1b\[[0-9;]*m//g' "$OUT/run.log" | grep -oE '^[[:space:]]*[0-9]+ \([0-9.]+%\)' | tail -1 | tr -s ' ')
{
  echo "run=$NAME method=$METHOD iterations=$ITERATIONS downscales=$DOWNSCALES"
  echo "extra_train_args=${EXTRA_TRAIN_ARGS:-none} alloc_conf=${ALLOC_CONF:-default}"
  echo "exit=$RC wall_s=$((END - START)) last_step=${LAST_STEP:-unknown}"
  echo "gpu_baseline_mib=$BASELINE gpu_peak_mib=$PEAK gpu_job_mib=$((PEAK - BASELINE))"
  grep -iE "out of memory|CUDA error|Traceback" "$OUT/run.log" | head -3
} | tee "$OUT/summary.txt"
exit "$RC"
