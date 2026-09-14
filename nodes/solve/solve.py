#!/usr/bin/env python3
"""solve: the camera solve, via ODM through the existing NodeODM API.

ADR 0006 (revision): delegate to NodeODM's own job queue rather than driving
the `odm` container's CLI directly or reimplementing scheduling.

ADR 0001 (revision): OpenDroneMap is AGPL-3.0. Where to stop ODM's pipeline
must be a *documented flag*, never a patch. `--end-with opensfm` is exactly
that flag -- confirmed present in NodeODM's own /options (2026-09-13, see
docs/research/golden-capture-v1.md) -- and it is what this Node passes by
default to get only the camera solve, the cheapest possible stop point.

design.md §4: `solve` runs twice around `register` -- once without a ground
control file to recover poses for Anchor projection, once with the
gcp_list.txt `register` writes. Both are this same script; `--gcp` is what
tells them apart. Passing a GCP file is nothing more than uploading a file
named exactly `gcp_list.txt` alongside the images -- ODM detects it by that
filename on its own (docs.opendronemap.org/gcp), confirmed live: NodeODM's
log for a GCP-bearing task reports "3 GCP points will be used for
georeferencing" and "bundle_use_gcp: yes" with no extra flag needed.

**A discovered limit, stated plainly rather than papered over**: NodeODM's
asset API does not expose per-shot pose data (`odm_report/shots.geojson`)
until the `odm_report` stage, which is near the very end of the pipeline --
confirmed by inspecting `all.zip` at `end-with=opensfm` (cameras.json only,
no shots) versus `end-with=odm_report` (shots.geojson appears). So the
"cheap first solve for Anchor projection" design.md describes is cheap for
the *camera model* (this Node's own contract test), but per-shot poses for
`register` to project Anchors with are not available through the public API
at that same cheap stopping point. This Node still defaults to stopping at
opensfm, since that is what the design calls for and what keeps the common
case fast; `register` is written to detect the absence of poses and refuse
cleanly rather than guess (see nodes/register/register.py).

Usage:
    python3 solve.py --in IMAGES_DIR --out OUT_DIR [--gcp gcp_list.txt]
                      [--host http://127.0.0.1:3180] [--end-with opensfm]
                      [--option feature-quality=low --option pc-quality=lowest]
"""

import argparse
import json
import sys
import zipfile
from pathlib import Path

import nodeodm_client as client

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".tif", ".tiff", ".png"}
DEFAULT_HOST = "http://127.0.0.1:3180"  # the mapped port of this project's `nodeodm` container, confirmed live


def list_images(directory: Path) -> list[Path]:
    return sorted(p for p in directory.iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def parse_options(pairs: list[str]) -> list[dict]:
    options = []
    for pair in pairs:
        if "=" not in pair:
            sys.exit(f"solve: --option must be name=value, got {pair!r}")
        name, value = pair.split("=", 1)
        # NodeODM's options are typed (bool/int/float/enum/string); send the
        # narrowest JSON type that round-trips so a numeric or boolean value
        # isn't silently sent as the string "5" (some ODM options are picky).
        if value.lower() in ("true", "false"):
            parsed = value.lower() == "true"
        else:
            try:
                parsed = int(value)
            except ValueError:
                try:
                    parsed = float(value)
                except ValueError:
                    parsed = value
        options.append({"name": name, "value": parsed})
    return options


def primary_camera(cameras: dict) -> dict:
    """cameras.json is keyed by an OpenSfM camera-id string; a single-camera
    Capture (every real Capture here) has exactly one entry. Picking the
    first is a deliberate simplification for the single-camera case -- flag
    if a Capture ever legitimately mixes cameras."""
    if not cameras:
        raise ValueError("cameras.json is empty")
    camera_id, model = next(iter(cameras.items()))
    return {"camera_id": camera_id, **model}


def principal_point_survived(camera: dict) -> bool:
    """DONE CRITERION #1's check: brown model, principal point present and not
    forced to the image centre (both exactly 0.0 is the COLMAP-perspective-
    export failure mode ADR 0004 warns about; brown read natively from
    cameras.json never goes through that export, but this is the check that
    would catch it if the route ever changed)."""
    return (
        camera.get("projection_type") == "brown"
        and camera.get("c_x") is not None
        and camera.get("c_y") is not None
        and not (camera["c_x"] == 0.0 and camera["c_y"] == 0.0)
    )


def extract_poses(zf: zipfile.ZipFile) -> dict:
    """Best-effort: only present once a solve reaches odm_report (see module
    docstring). Returns {"source": None, "shots": {}} when absent, rather
    than failing -- absence is a documented, expected outcome at the default
    opensfm-only stop point, not an error in this Node."""
    name = "odm_report/shots.geojson"
    if name not in zf.namelist():
        return {"source": None, "shots": {}}
    geojson = json.loads(zf.read(name))
    shots = {}
    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        filename = props.get("filename")
        if not filename:
            continue
        shots[filename] = {
            "rotation": props.get("rotation"),
            "translation": props.get("translation"),
            "camera": props.get("camera"),
            "coordinates": feature.get("geometry", {}).get("coordinates"),
        }
    return {"source": name, "shots": shots}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="images_dir", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--gcp", type=Path, default=None,
                   help="gcp_list.txt from register; omit for the first (no-ground-control) solve. "
                        "register always creates this path, empty when it has no Anchors to register "
                        "(the Manifest's own \"no ground control\" signal) -- only a missing file is an error")
    p.add_argument("--host", default=DEFAULT_HOST)
    p.add_argument("--name", default="solve")
    p.add_argument("--end-with", default="opensfm", help="ODM's own documented stop-stage flag (ADR 0001: never a patch)")
    p.add_argument("--option", action="append", default=[], help="repeatable name=value, passed through to NodeODM/ODM")
    p.add_argument("--timeout-seconds", type=float, default=3 * 3600, help="boundary: a single ODM run may not exceed 3 hours")
    p.add_argument("--keep-task", action="store_true",
                   help="don't remove the NodeODM task on completion -- set this on the second (with-gcp) solve, "
                        "whose task `reconstruct` continues via restart; the first solve's task is never resumed "
                        "and is removed to free the container's disk (bug found live: reconstruct's restart failed "
                        "with \"not found\" against a task solve had already removed)")
    args = p.parse_args()

    images = list_images(args.images_dir)
    if not images:
        sys.exit(f"solve: no images found in {args.images_dir}")
    if args.gcp is not None and not args.gcp.is_file():
        sys.exit(f"solve: --gcp {args.gcp} does not exist")
    # register always creates --gcp's path; empty means "no Anchors to
    # register" and is the deliberate, expected no-ground-control signal
    # (see register.py), not an error -- only a genuinely missing file is.
    gcp_path = args.gcp if (args.gcp is not None and args.gcp.stat().st_size > 0) else None

    options = [{"name": "end-with", "value": args.end_with}] + parse_options(args.option)
    args.out.mkdir(parents=True, exist_ok=True)

    print(f"solve: submitting {len(images)} images to {args.host} "
          f"(end-with={args.end_with}, gcp={'yes' if gcp_path else 'no'})")
    task_uuid = client.new_task(args.host, args.name, images, options, gcp_path=gcp_path)
    print(f"solve: task {task_uuid} submitted; polling")

    try:
        result = client.wait_for_completion(args.host, task_uuid, timeout_seconds=args.timeout_seconds)
        code = result.get("status", {}).get("code")
        if code != 40:  # COMPLETED
            log_tail = client.output(args.host, task_uuid)[-30:]
            sys.exit(f"solve: task {task_uuid} ended as {client.STATUS.get(code, code)}, not COMPLETED:\n"
                      + "\n".join(log_tail))

        zip_path = args.out / "all.zip"
        client.download_all_zip(args.host, task_uuid, zip_path)
        with zipfile.ZipFile(zip_path) as zf:
            cameras = json.loads(zf.read("cameras.json"))
            poses = extract_poses(zf)
        zip_path.unlink()  # keep the Runner's workdir small; the zip's content is re-derivable from the task while it exists
    finally:
        if not args.keep_task:
            client.remove(args.host, task_uuid)  # task data lives in the container, not the workdir -- free it regardless of outcome

    camera = primary_camera(cameras)
    (args.out / "cameras.json").write_text(json.dumps(cameras, indent=1))
    (args.out / "camera.json").write_text(json.dumps(camera, indent=1))
    (args.out / "poses.json").write_text(json.dumps(poses, indent=1))
    (args.out / "task.json").write_text(json.dumps({
        "uuid": task_uuid, "host": args.host, "end_with": args.end_with, "gcp": gcp_path is not None,
    }, indent=1))

    survived = principal_point_survived(camera)
    print(f"solve: camera {camera['camera_id']!r}: projection_type={camera.get('projection_type')} "
          f"c_x={camera.get('c_x')} c_y={camera.get('c_y')} -- principal point survived: {survived}")
    if poses["source"] is None:
        print("solve: no per-shot poses at this stage (needs odm_report; see module docstring)")
    if not survived:
        sys.exit("solve: principal point did NOT survive (forced to image centre, or camera model not brown) -- see ADR 0004")


if __name__ == "__main__":
    main()
