#!/usr/bin/env bash
# After odm-stage-profile.sh: compute metrics.json + quality, keep a 100 m ortho
# crop and the small SfM files, delete the rest of the project. Issue #40.
# Usage: odm-finish.sh <run_name> [keep]   ("keep" skips the delete)
set -u
r="$HOME/drone/q40/results"; d="$r/recon-$1"; t="$r/recon-tools"
python3 "$t/odm-stage-metrics.py" "$d" >"$d/stage-table.txt"
docker run --rm --memory 8g --entrypoint python3 -v "$r:/r" \
  -v "$HOME/drone/golden/bellus-v1/reference:/ref:ro" opendronemap/odm:latest \
  /r/recon-tools/odm-quality.py "/r/recon-$1/project/code" /ref/orthomosaic.tif >"$d/quality.json" 2>"$d/quality.err"
python3 - "$d" <<'EOF'
import json, sys
d = sys.argv[1]
m = json.load(open(f"{d}/metrics.json"))
m["quality"] = json.load(open(f"{d}/quality.json"))
json.dump(m, open(f"{d}/metrics.json", "w"), indent=1)
EOF
docker run --rm --entrypoint bash -v "$d:/d" opendronemap/odm:latest -c "
  mkdir -p /d/keep && cp -r /d/project/code/opensfm/stats /d/project/code/log.json /d/project/code/options.json /d/keep/ 2>/dev/null
  [ '${2:-}' = keep ] || rm -rf /d/project
  chown -R $(id -u):$(id -g) /d"
df -h / | tail -1
