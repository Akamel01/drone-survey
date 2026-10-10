#!/usr/bin/env bash
# One measured Fitting run for issue #40.
#   fit.sh <name> gsplat    <scene> [simple_trainer.py args...]   (subcommand first: default|mcmc)
#   fit.sh <name> opensplat <scene> [opensplat args...]
# Env: TRAINER=simple_trainer_tiles.py  -> q40 tiled-gradient trainer
#      ALLOC=expandable  -> PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
#      NORMALIZE=0       -> eval without world normalization (gsplat run with --no-normalize-world-space)
#      ANTIALIASED=1     -> eval in antialiased mode
#      KEEP=1            -> keep the checkpoint/ply after eval
# Writes ~/drone/q40/results/fit-<name>/{command.txt,samples.csv,train.log,eval.log,eval.json,metrics.json}
set -u
name=$1; engine=$2; scene=$3; shift 3
Q=$HOME/drone/q40
out=$Q/results/fit-$name
work=$Q/work/$scene
images=$Q/shared/$scene/images
mkdir -p "$out"

free_gb=$(df --output=avail -BG / | tail -1 | tr -dc 0-9)
if [ "$free_gb" -lt 22 ]; then echo "ABORT: only ${free_gb}G free" >&2; exit 3; fi

cname=q40fit-$name
envs=()
[ "${ALLOC:-}" = expandable ] && envs=(-e PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True)
common=(--rm --name "$cname" --gpus all --memory 32g --memory-swap 32g --shm-size 8g "${envs[@]}"
        -v "$Q/tools/gsplat:/gsplat" -v "$Q/tools:/tools:ro" -v "$work/data:/data" -v "$images:/data/images:ro" -v "$out:/out")

if [ "$engine" = gsplat ]; then
  train=(docker run "${common[@]}" -w /gsplat/examples q40-gsplat:local
         python "${TRAINER:-simple_trainer.py}" "$1" --data_dir /data --result_dir /out/train --disable_viewer --disable_video
         --eval_steps 999999 "${@:2}")
else
  train=(docker run "${common[@]}" -v "$work/osplat:/proj:ro" -v "$images:/datasets/code/images:ro"
         opensplat:local /code/build/opensplat /proj -o /out/splat.ply "$@")
fi
printf '%q ' "${train[@]}" > "$out/command.txt"; echo >> "$out/command.txt"

# train and score under one lock hold, so another job cannot slip in between
export Q out engine work images cname
flock "$Q/host.lock" bash -c '
bash "$Q/tools/run_locked.sh" "$out" "$cname" "$engine" "${@}"
splat=$(ls "$out"/train/ckpts/ckpt_*_rank0.pt 2>/dev/null | sort -V | tail -1)
[ "$engine" = opensplat ] && [ -f "$out/splat.ply" ] && splat=$out/splat.ply
grep -q "^exit=0 " "$out/command.txt" || splat=""   # only completed runs are scored
[ "${NOEVAL:-0}" = 1 ] && splat=""
if [ -n "$splat" ]; then
  inner=/out/${splat#$out/}
  eargs=(--data /data --splat "$inner" --out /out/eval.json --save-render /out/val0.jpg)
  [ "$engine" = gsplat ] && [ "${NORMALIZE:-1}" = 1 ] && eargs+=(--normalize)
  [ "${ANTIALIASED:-0}" = 1 ] && eargs+=(--antialiased)
  docker run --rm --name "$cname-eval" --gpus all --memory 32g --memory-swap 32g --shm-size 8g \
    -v "$Q/tools/gsplat:/gsplat" -v "$Q/tools:/tools:ro" -v "$work/data:/data" -v "$images:/data/images:ro" -v "$out:/out" \
    q40-gsplat:local python /tools/eval_splat.py "${eargs[@]}" > "$out/eval.log" 2>&1
  [ "${KEEP:-0}" = 1 ] || { [ -f "$out/eval.json" ] && docker run --rm -v "$out:/out" q40-gsplat:local sh -c "rm -f $inner /out/splat_*.ply"; }
fi
# A checkpoint is deleted only once it has been scored: wave 4 lost two trained
# models, 70 GPU-minutes, when scoring failed and this line removed them anyway.
if [ -n "$splat" ] && [ ! -f "$out/eval.json" ] && [ "${NOEVAL:-0}" != 1 ]; then
  echo "checkpoint kept: scoring did not finish ($splat)" >> "$out/command.txt"
  docker run --rm -v "$out:/out" q40-gsplat:local sh -c "chown -R $(id -u):$(id -g) /out"
else
  docker run --rm -v "$out:/out" q40-gsplat:local sh -c "rm -rf /out/train/ckpts /out/train/ply; chown -R $(id -u):$(id -g) /out"
fi
' _ "${train[@]}"
python3 "$Q/tools/summarize.py" "$out" "$engine"
