#!/usr/bin/env python3
"""nodes/check_ortho.py -- ADR 0018's minimum verification bar for the
Orthomosaic tail (#22, #23), for whatever can be checked without a real ODM
run: `register`'s projection/matching/gate/gcp_list.txt writer, tested
against synthetic detections with known answers (real-imagery Anchor
detection is not implemented -- see nodes/register/register.py's module
docstring, and #22's own comment), plus `export-cog`'s COG validation
wrapper against a tiny real GeoTIFF when GDAL is available.

    python3 nodes/check_ortho.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PY = sys.executable

sys.path.insert(0, str(REPO_ROOT / "nodes" / "register"))
sys.path.insert(0, str(REPO_ROOT / "nodes" / "export-cog"))
import register  # noqa: E402
import export_cog  # noqa: E402

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


# --- register: coordinates ---------------------------------------------------

def check_latlon_to_utm():
    # odm_data_bellus's own real gcp_list.txt (a genuine OpenDroneMap sample
    # dataset, downloaded on the compute host): "WGS84 UTM 17N", GCPs around
    # easting ~441000, northing ~4564000. The dataset's own recorded camera
    # GPS (sampled from IMG_1418_RGB.jpg, 2026-09-13) is 41.224506N, 81.703567W
    # -- a different point in the same small site, not the same coordinate,
    # so this checks zone/hemisphere and rough locality, not an exact value.
    easting, northing, zone, hemisphere = register.latlon_to_utm(41.224506, -81.703567)
    check("latlon_to_utm: zone matches odm_data_bellus's real gcp_list.txt (17)", zone == 17, f"got {zone}")
    check("latlon_to_utm: hemisphere matches (N)", hemisphere == "N", f"got {hemisphere}")
    check("latlon_to_utm: easting within 5km of the real file's own GCPs (~441000)",
          abs(easting - 441000) < 5000, f"got {easting:.1f}")
    check("latlon_to_utm: northing within 5km of the real file's own GCPs (~4564000)",
          abs(northing - 4564000) < 5000, f"got {northing:.1f}")


# --- register: projection round-trip, matching, gate -------------------------

CAMERA = {"projection_type": "brown", "width": 4000, "height": 3000,
          "focal": 0.85, "c_x": 0.001, "c_y": -0.0005,
          "k1": -0.01, "k2": 0.002, "p1": 0.0001, "p2": -0.0002, "k3": 0.0}

ANCHOR = {"id": "A1", "lat": 40.649, "lon": -73.968, "alt": 0.0}  # arbitrary real-looking coordinate

# A camera looking straight down (nadir): forward = world -Z, right = world
# +X, image-down = world -Y. R's rows are the camera axes expressed in world
# coordinates (so Xc = R @ Xw), which is a 180-degree rotation about the
# X axis -- angle-axis (pi, 0, 0).
_NADIR_ROTATION = [3.141592653589793, 0.0, 0.0]


def _anchor_world_point():
    e, n, _, _ = register.latlon_to_utm(ANCHOR["lat"], ANCHOR["lon"])
    return [e, n, ANCHOR["alt"]]


def _shot(camera_center):
    """translation for a nadir shot centred at `camera_center` (world coords):
    Xc = R*Xw + t with t = -R*C (R@C, since Xc must be 0 when Xw == C)."""
    R = register._rodrigues(_NADIR_ROTATION)
    t = [-sum(R[i][j] * camera_center[j] for j in range(3)) for i in range(3)]
    return {"rotation": _NADIR_ROTATION, "translation": t}


# Five synthetic shots looking straight down at a common ground plane, each
# centred a few metres from the Anchor and 50m up -- exactly the "at least
# 3, target 5+" case anchor-auto-detection-2026.md §6 describes.
_anchor_point = _anchor_world_point()
SHOTS = {
    f"IMG_{i}.jpg": _shot([_anchor_point[0] + dx, _anchor_point[1] + dy, _anchor_point[2] + 50.0])
    for i, (dx, dy) in enumerate([(0.0, 0.0), (5.0, 2.0), (2.0, 6.0), (8.0, 1.0), (-2.0, 4.0)])
}


def check_projection_and_gate():
    world_point = _anchor_world_point()

    # 1. Forward-project the same known 3D point through every synthetic shot
    #    -- this is the "known answer" (#22: "test them on synthetic
    #    detections with known answers").
    projections = {}
    detections = {}
    for image, shot in SHOTS.items():
        px = register.project_point(CAMERA, shot["rotation"], shot["translation"], world_point)
        check(f"project_point: {image} projects the Anchor within the frame", px is not None)
        if px is None:
            continue
        x, y = px
        check(f"project_point: {image} pixel is inside the sensor",
              0 <= x <= CAMERA["width"] and 0 <= y <= CAMERA["height"], f"got {px}")
        projections[image] = {ANCHOR["id"]: px}
        detections[image] = [[x, y]]  # a perfect "detection" at exactly the projected pixel

    # 2. Matching + gate should accept a perfect detection in every image.
    matches = register.match_detections(detections, projections, gate_px=5.0)
    accepted, rejected, passed = register.gate(
        matches, [ANCHOR], min_images=3, min_accepted_anchors=1, max_residual_spread=1.0,
    )
    check("gate: accepts a well-matched Anchor seen in 5 images",
          ANCHOR["id"] in accepted and len(accepted[ANCHOR["id"]]) == 5, f"accepted={accepted}, rejected={rejected}")
    check("gate: passes overall", passed)

    # 3. A detection far from every projection must be rejected by the
    #    distance gate, not silently matched to the nearest thing anyway.
    far_detections = {img: [[5.0, 5.0]] for img in SHOTS}  # corner of the frame, nowhere near the Anchor
    far_matches = register.match_detections(far_detections, projections, gate_px=5.0)
    check("match_detections: a far-off detection is not matched to anything",
          ANCHOR["id"] not in far_matches, f"got {far_matches}")

    # 4. Too few images seeing the Anchor must be rejected (ODM docs' own
    #    documented floor is 3).
    sparse_matches = {ANCHOR["id"]: matches[ANCHOR["id"]][:2]}  # only 2 of the 5
    _, sparse_rejected, sparse_passed = register.gate(
        sparse_matches, [ANCHOR], min_images=3, min_accepted_anchors=1,
    )
    check("gate: rejects an Anchor seen in only 2 images (need >= 3)",
          not sparse_passed and ANCHOR["id"] in sparse_rejected, f"{sparse_rejected}")

    # 5. A big spread in residuals (one image's detection is way off from the
    #    others) must be rejected -- the cross-image-consistency proxy.
    inconsistent = list(matches[ANCHOR["id"]])
    inconsistent[0] = {**inconsistent[0], "residual": inconsistent[0]["residual"] + 1000.0}
    _, inconsistent_rejected, inconsistent_passed = register.gate(
        {ANCHOR["id"]: inconsistent}, [ANCHOR], min_images=3, min_accepted_anchors=1, max_residual_spread=40.0,
    )
    check("gate: rejects an Anchor whose detections disagree wildly across images",
          not inconsistent_passed, f"{inconsistent_rejected}")

    # 6. The whole-Capture floor: even all-individually-fine Anchors fail the
    #    Capture if fewer than the configured minimum are accepted.
    _, whole_rejected, whole_passed = register.gate(
        matches, [ANCHOR], min_images=3, min_accepted_anchors=5,  # only one Anchor exists in this fixture
    )
    check("gate: enforces the whole-Capture minimum-accepted-Anchors floor",
          not whole_passed and "_capture" in whole_rejected, f"{whole_rejected}")

    return accepted


def check_gcp_writer(accepted):
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "gcp_list.txt"
        register.write_gcp_list(accepted, {ANCHOR["id"]: ANCHOR}, out)
        lines = out.read_text().strip().splitlines()
        check("write_gcp_list: header line present", lines[0].startswith("WGS84 UTM"), lines[0] if lines else "<empty>")
        check("write_gcp_list: one data line per accepted observation", len(lines) - 1 == len(accepted[ANCHOR["id"]]))
        for line in lines[1:]:
            fields = line.split()
            check(f"write_gcp_list: data line has geo_x geo_y geo_z im_x im_y image_name gcp_name ({line!r})",
                  len(fields) == 7)
            float(fields[0]), float(fields[1]), float(fields[2]), float(fields[3]), float(fields[4])  # must parse


def check_register_cli_no_anchors():
    """The Manifest's own "no ground control" signal: no anchors configured
    -> exit 0, an EMPTY gcp_list.txt (not an absent one) so solve's second
    pass can be wired unconditionally -- see both Nodes' module docstrings."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "out"
        r = subprocess.run(
            [PY, str(REPO_ROOT / "nodes" / "register" / "register.py"), "--out", str(out)],
            capture_output=True, text=True,
        )
        check("register CLI: exits 0 with no Anchors configured", r.returncode == 0, r.stderr)
        gcp = out / "gcp_list.txt"
        check("register CLI: writes an EMPTY gcp_list.txt (the no-ground-control signal)",
              gcp.is_file() and gcp.stat().st_size == 0)


def check_register_cli_end_to_end(accepted):
    """Full CLI path: anchors.json + poses.json + camera.json + detections.json
    on disk -> gcp_list.txt on disk, through argparse and file I/O, not just
    the library functions."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        anchors_path = tmp / "anchors.json"
        anchors_path.write_text(json.dumps({"anchors": [ANCHOR]}))

        poses = {"source": "synthetic", "shots": SHOTS}
        (tmp / "poses.json").write_text(json.dumps(poses))
        (tmp / "camera.json").write_text(json.dumps(CAMERA))

        # Build detections straight from the accepted synthetic observations
        # computed earlier, so the CLI run and the library-level test agree.
        detections = {}
        for obs in accepted[ANCHOR["id"]]:
            detections.setdefault(obs["image"], []).append([obs["px"], obs["py"]])
        (tmp / "detections.json").write_text(json.dumps(detections))

        out = tmp / "out"
        r = subprocess.run(
            [PY, str(REPO_ROOT / "nodes" / "register" / "register.py"),
             "--anchors", str(anchors_path), "--poses", str(tmp / "poses.json"),
             "--camera", str(tmp / "camera.json"), "--detections", str(tmp / "detections.json"),
             "--out", str(out), "--min-anchors", "1"],
            capture_output=True, text=True,
        )
        check("register CLI: end-to-end run exits 0", r.returncode == 0, r.stderr)
        gcp = out / "gcp_list.txt"
        check("register CLI: writes a non-empty gcp_list.txt when the gate passes",
              gcp.is_file() and gcp.stat().st_size > 0, r.stdout + r.stderr)


# --- export-cog ---------------------------------------------------------------

def check_cog_validator():
    if shutil.which("gdal_create") is None or shutil.which("gdal_translate") is None:
        print("[skip] export-cog COG check -- gdal_create/gdal_translate not on PATH")
        return
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        src = tmp / "odm_orthophoto.tif"
        # A 4-band (RGBA, matching ODM's own orthophoto layout) GeoTIFF,
        # ordinary striped layout -- exactly the "not a COG yet" shape
        # export-cog exists to fix. Big enough (2048px) that the COG driver
        # actually has room to build an overview -- a 64px image is smaller
        # than one output tile and legitimately gets none, which isn't a
        # useful test of the "with overviews" requirement.
        def create(path, alpha):
            return subprocess.run(
                ["gdal_create", "-outsize", "2048", "2048", "-bands", "4", "-ot", "Byte",
                 "-burn", "128", "-burn", "128", "-burn", "128", "-burn", str(alpha),
                 "-co", "PHOTOMETRIC=RGB", "-co", "ALPHA=YES",
                 "-a_srs", "EPSG:4326", "-a_ullr", "-1", "1", "1", "-1", str(path)],
                capture_output=True, text=True,
            )
        result = create(src, 255)
        if result.returncode != 0:
            print(f"[skip] export-cog COG check -- gdal_create failed: {result.stderr}")
            return

        out = tmp / "out"
        r = subprocess.run(
            [PY, str(REPO_ROOT / "nodes" / "export-cog" / "export_cog.py"),
             "--in", str(src), "--out", str(out)],
            capture_output=True, text=True,
        )
        check("export-cog: exits 0 on a real (tiny) GeoTIFF", r.returncode == 0, r.stdout + r.stderr)
        dst = out / "orthomosaic.tif"
        check("export-cog: produces orthomosaic.tif", dst.is_file())
        if not dst.is_file():
            return

        ok, detail = export_cog.validate(dst)
        check(f"export-cog: output passes COG validation ({detail})", ok, detail)
        check("export-cog: a fully valid raster measures ~100% valid pixels",
              export_cog.valid_fraction(dst) > 0.99)

        # The failure ADR 0018 names: a valid COG that holds almost nothing.
        empty = tmp / "empty.tif"
        create(empty, 0)
        r = subprocess.run(
            [PY, str(REPO_ROOT / "nodes" / "export-cog" / "export_cog.py"),
             "--in", str(empty), "--out", str(tmp / "out-empty")],
            capture_output=True, text=True,
        )
        check("export-cog: refuses a mostly-empty Orthomosaic", r.returncode != 0 and "floor" in r.stderr, r.stderr)


def main() -> None:
    check_latlon_to_utm()
    accepted = check_projection_and_gate()
    check_gcp_writer(accepted)
    check_register_cli_no_anchors()
    check_register_cli_end_to_end(accepted)
    check_cog_validator()

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall Orthomosaic-tail checks passed")


if __name__ == "__main__":
    main()
