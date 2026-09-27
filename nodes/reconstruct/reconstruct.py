#!/usr/bin/env python3
"""reconstruct: continue an ODM task past its camera solve, one ODM stage
boundary at a time.

#23: "a single opaque multi-hour Node defeats the resume behaviour ADR 0006
identifies as the thing we took on ourselves" -- so `reconstruct` is not one
Node but this one script, invoked several times from the Manifest with
different `--rerun-from`/`--end-with` pairs (ODM's own documented stage
flags, confirmed present in NodeODM's /options -- ADR 0001: a flag, never a
patch). Each invocation is its own Runner Node with its own `state.json`
entry, so a crash mid-pipeline resumes at the failed stage rather than
redoing everything -- confirmed live: restarting a task with
`rerun-from=opensfm` skipped straight past feature matching into dense
reconstruction rather than starting over (docs/research/golden-capture-v1.md).

ODM's stage order (from NodeODM's own /options `domain`, confirmed live):
    dataset, split, merge, opensfm, openmvs, odm_filterpoints, odm_meshing,
    mvs_texturing, odm_georeferencing, odm_dem, odm_orthophoto, odm_report,
    odm_postprocess

`solve` stops at `opensfm`. The Orthomosaic Manifest chains this script
through the rest in four Nodes -- see pipeline/manifests/orthomosaic.json:

    reconstruct-dense   rerun-from opensfm            end-with odm_filterpoints
    reconstruct-mesh    rerun-from odm_meshing        end-with mvs_texturing
    reconstruct-georef  rerun-from odm_georeferencing end-with odm_orthophoto
    reconstruct-report  rerun-from odm_report         end-with odm_postprocess

Each restarts the *same* NodeODM task (the id `solve`'s second pass wrote to
its `task.json`) via `POST /task/restart` -- NodeODM keeps the task's project
directory between restarts, which is the resume mechanism itself; nothing
here re-uploads images or re-runs completed stages.

Every invocation carries `task.json` forward unchanged (same uuid/host) so
the next stage-Node in the chain can find it, and opportunistically extracts
whatever of the orthophoto / report / mesh this stage's `all.zip` happens to
contain -- most stages contain none of those and extract nothing.
"""

import argparse
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "solve"))
import nodeodm_client as client  # noqa: E402

# Loose, deliberately conservative floor (ADR 0018: "start conservative from a
# few observed runs, tighten with measurement"). The failure it exists to
# catch is a *collapse* -- ODM already produced 934 faces from a 5.4M-point
# cloud once (docs/research/odm-first-run-2026-09-10.md) -- not to certify
# mesh quality.
MIN_FACES_PER_CLOUD_POINT = 0.0005

FINAL_ODM_STAGE = "odm_postprocess"


def read_task(in_dir: Path) -> dict:
    task_path = in_dir / "task.json"
    if not task_path.is_file():
        sys.exit(f"reconstruct: {task_path} missing -- expected the output of `solve` or an earlier reconstruct stage")
    return json.loads(task_path.read_text())


def count_cloud_points(zf: zipfile.ZipFile) -> int | None:
    for name in zf.namelist():
        if name.endswith("ept.json"):
            try:
                return json.loads(zf.read(name)).get("points")
            except (json.JSONDecodeError, KeyError):
                return None
    return None


def count_mesh_faces(zf: zipfile.ZipFile) -> int | None:
    for name in zf.namelist():
        if name.endswith(".obj"):
            text = zf.read(name).decode("utf-8", errors="ignore")
            return sum(1 for line in text.splitlines() if line.startswith("f "))
    return None


def extract_known_outputs(zf: zipfile.ZipFile, out: Path) -> list[str]:
    written = []
    mapping = {
        "odm_orthophoto/odm_orthophoto.tif": "odm_orthophoto.tif",
        "odm_report/stats.json": "stats.json",
        "odm_report/shots.geojson": "shots.geojson",
    }
    for src, dst in mapping.items():
        if src in zf.namelist():
            (out / dst).write_bytes(zf.read(src))
            written.append(dst)
    return written


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="in_dir", required=True, type=Path, help="output dir of `solve` or the previous reconstruct stage")
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--rerun-from", required=True)
    p.add_argument("--end-with", required=True)
    p.add_argument("--option", action="append", default=[], help="repeatable name=value, passed through to NodeODM/ODM")
    p.add_argument("--timeout-seconds", type=float, default=3 * 3600, help="boundary: a single ODM run may not exceed 3 hours")
    args = p.parse_args()

    task = read_task(args.in_dir)
    host, task_uuid = task["host"], task["uuid"]
    args.out.mkdir(parents=True, exist_ok=True)

    from solve import parse_options  # reuse solve's --option parser; same repo, same convention
    options = [{"name": "rerun-from", "value": args.rerun_from}, {"name": "end-with", "value": args.end_with}]
    options += parse_options(args.option)

    print(f"reconstruct: restarting task {task_uuid} rerun-from={args.rerun_from} end-with={args.end_with}")
    client.restart(host, task_uuid, options)
    result = client.wait_for_completion(host, task_uuid, timeout_seconds=args.timeout_seconds)
    code = result.get("status", {}).get("code")
    if code != 40:
        log_tail = client.output(host, task_uuid)[-30:]
        sys.exit(f"reconstruct: task {task_uuid} ended as {client.STATUS.get(code, code)}, not COMPLETED:\n"
                  + "\n".join(log_tail))

    zip_path = args.out / "all.zip"
    client.download_all_zip(host, task_uuid, zip_path)
    with zipfile.ZipFile(zip_path) as zf:
        extracted = extract_known_outputs(zf, args.out)
        faces, cloud_points = count_mesh_faces(zf), count_cloud_points(zf)
    zip_path.unlink()

    # ODM's last stage leaves nothing to restart, so the task -- images and the
    # whole project, gigabytes on NodeODM's disk -- goes with it. Any earlier
    # stage keeps it and hands its id on, or the next stage has nothing to find.
    # A failed stage exits above and keeps the task, so a resumed run can use it.
    if args.end_with == FINAL_ODM_STAGE:
        client.remove(host, task_uuid)
    else:
        (args.out / "task.json").write_text(json.dumps(task, indent=1))

    print(f"reconstruct: stage {args.rerun_from}->{args.end_with} done" + (f"; extracted {extracted}" if extracted else ""))

    if faces is not None:
        # ADR 0018's own example of a clean exit with garbage output: 934 faces
        # from a 5.4M-point cloud. This is that check, applied automatically
        # whenever this stage happens to produce a mesh.
        floor = int((cloud_points or 0) * MIN_FACES_PER_CLOUD_POINT)
        print(f"reconstruct: mesh has {faces} faces against a {cloud_points or 'unknown'}-point cloud (floor {floor})")
        if cloud_points and faces < floor:
            sys.exit(f"reconstruct: mesh collapse suspected -- {faces} faces is below the floor of {floor} "
                      f"for a {cloud_points}-point cloud (ADR 0018)")


if __name__ == "__main__":
    main()
