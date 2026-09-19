#!/usr/bin/env bash
# Run the ODM CLI on one image folder and sample resources every 2 s, each
# sample tagged with the ODM stage the log says is running. Issue #40.
#
# Usage: odm-stage-profile.sh <run_name> <images_dir> <odm_image> [odm args...]
#   DOCKER_EXTRA="--gpus all"  extra docker run args (e.g. for opendronemap/odm:gpu)
#   PROJ=trakai               ODM project name (default code)
# Output: ~/drone/q40/results/recon-<run_name>/{command.txt,samples.csv,odm.log,run.txt}
# Wrap in: flock ~/drone/q40/host.lock bash odm-stage-profile.sh ...
set -u
name="${1:?run name}"; imgs="${2:?images dir}"; image="${3:?odm image}"; shift 3
out="$HOME/drone/q40/results/recon-$name"
c="recon-$name"
proj_name="${PROJ:-code}"
mkdir -p "$out/project/$proj_name/images"

avail_gb=$(df -B1G --output=avail / | tail -1 | tr -d ' ')
[ "$avail_gb" -lt 26 ] && { echo "ABORT: only ${avail_gb} GB free" >&2; exit 2; }

run=(docker run -d --name "$c" --memory 32g --memory-swap 32g ${DOCKER_EXTRA:-}
     -v "$out/project:/datasets" -v "$imgs:/datasets/$proj_name/images:ro"
     "$image" --project-path /datasets "$proj_name" "$@")
printf '%q ' "${run[@]}" >"$out/command.txt"; echo >>"$out/command.txt"

nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader >"$out/gpu_apps_start.txt" 2>&1
docker rm "$c" >/dev/null 2>&1   # only a stopped leftover of this same run name
"${run[@]}" >/dev/null || exit 1
id=$(docker inspect -f '{{.Id}}' "$c")
cg="/sys/fs/cgroup/system.slice/docker-$id.scope"
docker logs -f "$c" >"$out/odm.log" 2>&1 &
start=$(date +%s.%N)

cpu() { awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8, $5+$6}' /proc/stat; }
read -r t0 i0 <<<"$(cpu)"
echo "epoch,stage,mem_cgroup_bytes,mem_docker,cpu_container_pct,host_cpu_pct,gpu_mem_used_mib,gpu_util_pct,disk_used_bytes,project_bytes" >"$out/samples.csv"
while [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ]; do
  now=$(date +%s.%N)
  stage=$(tac "$out/odm.log" | grep -m1 -oE 'Running [a-z_]+ stage' | awk '{print $2}')
  memcg=$(cat "$cg/memory.current" 2>/dev/null)
  ds=$(docker stats --no-stream --format '{{.MemUsage}},{{.CPUPerc}}' "$c" 2>/dev/null | sed 's# / [^,]*##')
  read -r t1 i1 <<<"$(cpu)"
  hcpu=$(awk -v a="$t0" -v b="$t1" -v c="$i0" -v d="$i1" 'BEGIN{ if (b>a) printf "%.1f", 100*(1-(d-c)/(b-a)); else print 0 }')
  t0=$t1; i0=$i1
  gpu=$(nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader,nounits | head -1 | tr -d ' ')
  disk=$(df -B1 --output=used / | tail -1 | tr -d ' ')
  proj=$(du -sb "$out/project" 2>/dev/null | cut -f1)
  echo "$now,${stage:-start},$memcg,${ds:-,},$hcpu,$gpu,$disk,$proj" >>"$out/samples.csv"
  # 20 GB free-disk floor for the shared host: stop this run (only this container) before it gets there
  [ "$(df -B1G --output=avail / | tail -1 | tr -d ' ')" -lt 21 ] && { echo "DISK GUARD: stopping $c" | tee -a "$out/run-notes.txt"; docker stop -t 5 "$c" >/dev/null; }
  sleep "$(awk -v s="$now" -v n="$(date +%s.%N)" 'BEGIN{d=2-(n-s); print (d>0?d:0)}')"
done
end=$(date +%s.%N)
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader >"$out/gpu_apps_end.txt" 2>&1
{
  echo "start=$start end=$end wall_s=$(awk -v a="$start" -v b="$end" 'BEGIN{printf "%.0f", b-a}')"
  docker inspect -f 'exit_code={{.State.ExitCode}} oom_killed={{.State.OOMKilled}}' "$c"
  echo "image=$image $(docker image inspect -f '{{.Id}}' "$image")"
} | tee "$out/run.txt"
sleep 1; docker rm "$c" >/dev/null
