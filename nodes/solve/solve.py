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
the *camera model* (this Node's own contract test) but not, through NodeODM
alone, for per-shot poses.

**Closed, #22 orchestrator comment: route chosen is the ODM CLI container,
not NodeODM, for this one pass.** OpenSfM writes `opensfm/reconstruction.json`
-- cameras and per-shot rotation/translation both -- at the opensfm stage
itself, on disk in the project directory; NodeODM just never surfaces that
file through its asset API before `odm_report`. The ODM CLI container
(`opendronemap/odm:latest`) keeps that same project directory, so running it
directly for this one pass reads the file straight off disk instead of
waiting for `odm_report`. This is a narrower use of the CLI than ADR 0006
(revision) argues against: that ADR's concern is the Runner reimplementing
NodeODM's *job queue* (concurrency, retries, a persistent job store) for
ordinary pipeline work, not a single blocking subprocess call for one job --
which is what this is, the same shape as the HTTP-poll loop below, just
against a local process instead of a local server. **This pass -- no `--gcp`
given at all, not merely an empty one -- is the only one that takes this
route.** The second, ground-control pass (`--gcp` given, even pointing at
`register`'s empty "no Anchors" file) still goes through NodeODM below,
unchanged, because `reconstruct`'s restart chain needs NodeODM's own
resumable task (nodes/reconstruct/reconstruct.py's docstring).

`register` reads `reconstruction.json`'s shots correctly by treating them as
OpenSfM's own topocentric ENU frame (local to a `reference_lla`), not as
already-georeferenced coordinates -- see nodes/register/register.py's
module docstring and `latlon_alt_to_topocentric`. **Proven against a real
Capture**: projecting odm_data_bellus's own `gcp_list.txt` ground points
through this exact route's `reconstruction.json` lands within tolerance of
the surveyed pixel (nodes/check_ortho.py's `check_bellus_real_projection`).

Usage:
    python3 solve.py --in IMAGES_DIR --out OUT_DIR [--gcp gcp_list.txt]
                      [--host http://127.0.0.1:3180] [--end-with opensfm]
                      [--option feature-quality=low --option pc-quality=lowest]
"""

import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path
import os

import nodeodm_client as client

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import IMAGE_SUFFIXES, list_images  # noqa: E402

DEFAULT_HOST = "http://127.0.0.1:3180"  # the mapped port of this project's `nodeodm` container, confirmed live
DEFAULT_ODM_IMAGE = "opendronemap/odm:latest"  # first (no-gcp) pass only -- see module docstring


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


def _load_execution_context_from_env() -> dict:
    """Read EXECUTION_CONTEXT that the Runner injects into the process env.
    Returns a dict if present, otherwise an empty dict.
    """
    raw = os.environ.get("EXECUTION_CONTEXT")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


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


def normalize_camera(model: dict) -> dict:
    """OpenSfM's raw reconstruction.json camera model uses focal_x/focal_y;
    NodeODM's own cameras.json (the other route, below) already collapses to
    a single `focal`. register.py's project_point() only reads `focal` --
    alias it here so both routes hand callers the same shape. Every brown
    model measured so far (bellus, StudioKitchen) has focal_x == focal_y."""
    if "focal" not in model and "focal_x" in model:
        model = {**model, "focal": model["focal_x"]}
    return model


def options_to_cli_flags(options: list[dict]) -> list[str]:
    """ODM's own CLI takes `--name value` flags, and a bare `--name` for a
    True boolean (confirmed via `docker run opendronemap/odm:latest --help`)
    -- different shape from the JSON options list NodeODM's HTTP API wants."""
    flags = []
    for opt in options:
        name, value = opt["name"], opt["value"]
        if value is True:
            flags.append(f"--{name}")
        elif value is False:
            continue
        else:
            flags += [f"--{name}", str(value)]
    return flags


def run_odm_cli(project_root: Path, name: str, images_dir: Path, options: list[dict],
                 odm_image: str, timeout_seconds: float) -> Path:
    """Run the ODM CLI container directly (module docstring: the no-gcp
    pass's route). Confirmed invocation shape (docker inspect against the
    real odm_data_bellus/StudioKitchen CLI runs already on the compute
    host): `--project-path /work <name>` with the project directory bind-
    mounted at /work. The images bind-mount is separate and read-only,
    straight from wherever the Runner already put them -- no copy, since
    this and NodeODM's own container both run on the same host.

    Returns the path to opensfm/reconstruction.json; raises with the
    container's own tail output if ODM did not produce it (ADR 0018: a
    clean exit is not evidence, check the file itself).

    Found live: the container's entrypoint needs to start as root (it drops
    privileges itself internally) -- forcing `--user` at `docker run` breaks
    its own dataset-stage setup (`PermissionError` on its own project dir).
    So ODM runs as root as usual, and every file it writes into the bind
    mount is root-owned; `remove_odm_project` below is the matching cleanup
    (a root container removes what a root container created), used instead
    of a plain `shutil.rmtree` for exactly that reason.
    """
    project_root.mkdir(parents=True, exist_ok=True)
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{project_root.resolve()}:/work",
        "-v", f"{images_dir.resolve()}:/work/{name}/images:ro",
        odm_image, "--project-path", "/work", name,
    ] + options_to_cli_flags(options)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
    reconstruction_path = project_root / name / "opensfm" / "reconstruction.json"
    if not reconstruction_path.is_file():
        tail = "\n".join((result.stdout + result.stderr).splitlines()[-30:])
        sys.exit(f"solve: ODM CLI did not produce {reconstruction_path} (exit {result.returncode}):\n{tail}")
    return reconstruction_path


def remove_odm_project(project_root: Path) -> None:
    """ODM's container runs as root (see run_odm_cli's docstring), so every
    file it wrote into the bind-mounted `project_root` is root-owned --
    `shutil.rmtree` from this (non-root) process cannot remove it. A
    throwaway container does the same job in reverse: root created it, a
    root container removes it. Not sudo (never used here): the privilege
    stays inside the container, same as ODM's own write did."""
    subprocess.run(
        ["docker", "run", "--rm", "-v", f"{project_root.parent.resolve()}:/x",
         "busybox", "rm", "-rf", f"/x/{project_root.name}"],
        capture_output=True, text=True,
    )


def poses_from_reconstruction(reconstruction_path: Path) -> tuple[dict, dict]:
    """The no-gcp pass's pose source (module docstring): opensfm's own
    reconstruction.json, written at the opensfm stage itself -- unlike
    `odm_report/shots.geojson`, available at the cheap stop point. Its shots
    are in OpenSfM's topocentric ENU frame relative to `reference_lla`, not
    georeferenced; register.py's build_projections handles that distinction
    (see nodes/register/register.py's module docstring)."""
    components = json.loads(reconstruction_path.read_text())
    if not components:
        sys.exit(f"solve: {reconstruction_path} has no reconstruction (0 components) -- solve failed to align any shots")
    recon = components[0]  # single-component assumption, same as primary_camera's -- flag if a Capture ever splits
    cameras = {camera_id: normalize_camera(model) for camera_id, model in recon.get("cameras", {}).items()}
    shots = {
        filename: {"rotation": shot.get("rotation"), "translation": shot.get("translation"), "camera": shot.get("camera")}
        for filename, shot in recon.get("shots", {}).items()
    }
    poses = {
        "source": "opensfm/reconstruction.json",
        "reference_lla": recon.get("reference_lla"),
        "shots": shots,
    }
    return cameras, poses


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
    p.add_argument("--odm-image", default=DEFAULT_ODM_IMAGE,
                   help="ODM CLI container image -- used only for the first (no-gcp) pass, see module docstring")
    # Cleanup is declarative via the manifest; remove-task flag is deprecated.
    args = p.parse_args()

    images = list_images(args.images_dir)
    if not images:
        sys.exit(f"solve: no images found in {args.images_dir}")
    if args.gcp is not None and not args.gcp.is_file():
        sys.exit(f"solve: --gcp {args.gcp} does not exist")
    # Two separate questions. Which pass this is -- and so which route -- is
    # whether --gcp was given at all. Whether a ground control file is uploaded
    # is the Manifest's declared fact, carried in EXECUTION_CONTEXT. Letting the
    # fact pick the route sent the second pass down the CLI route with no NodeODM
    # task behind it, and every reconstruct stage after it failed.
    first_pass = args.gcp is None
    gcp_path = args.gcp
    if _load_execution_context_from_env().get("ground_control_points") is False:
        gcp_path = None

    options = [{"name": "end-with", "value": args.end_with}] + parse_options(args.option)
    args.out.mkdir(parents=True, exist_ok=True)

    if first_pass:
        # First pass (module docstring): recover poses cheaply via the ODM
        # CLI container directly, not NodeODM -- register needs
        # opensfm/reconstruction.json, which NodeODM's asset API never
        # exposes at this stop point. Distinguished by --gcp being *absent*,
        # not merely resolving to an empty file (that's the second pass with
        # no Anchors configured, which still goes through NodeODM below).
        print(f"solve: running ODM CLI directly on {len(images)} images (end-with={args.end_with}) -- "
              f"first pass, recovering poses for register")
        project_root = args.out / "odm_project"
        reconstruction_path = run_odm_cli(project_root, args.name, args.images_dir, options,
                                           args.odm_image, args.timeout_seconds)
        cameras, poses = poses_from_reconstruction(reconstruction_path)
        remove_odm_project(project_root)  # heavy, root-owned opensfm working set; poses/camera already extracted
        # No task.json: this pass leaves no NodeODM task to restart, and a
        # made-up id would only fail later, in reconstruct, hours further on.
    else:
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
            # Cleanup is handled declaratively by the Runner; do not manually remove here
            pass

        (args.out / "task.json").write_text(json.dumps({
            "uuid": task_uuid, "host": args.host, "end_with": args.end_with, "gcp": gcp_path is not None,
        }, indent=1))

    camera = primary_camera(cameras)
    (args.out / "cameras.json").write_text(json.dumps(cameras, indent=1))
    (args.out / "camera.json").write_text(json.dumps(camera, indent=1))
    (args.out / "poses.json").write_text(json.dumps(poses, indent=1))

    survived = principal_point_survived(camera)
    print(f"solve: camera {camera['camera_id']!r}: projection_type={camera.get('projection_type')} "
          f"c_x={camera.get('c_x')} c_y={camera.get('c_y')} -- principal point survived: {survived}")
    if poses["source"] is None:
        print("solve: no per-shot poses at this stage (needs odm_report; see module docstring)")
    else:
        print(f"solve: {len(poses['shots'])} shot pose(s) from {poses['source']}")
    if not survived:
        sys.exit("solve: principal point did NOT survive (forced to image centre, or camera model not brown) -- see ADR 0004")


if __name__ == "__main__":
    main()
