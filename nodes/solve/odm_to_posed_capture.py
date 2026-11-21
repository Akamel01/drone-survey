#!/usr/bin/env python3
"""Convert an OpenSfM solve into a recon-core Posed Capture.

Primary input is OpenSfM reconstruction.json (first component). NodeODM
cameras.json/task.json are not handled in this ticket.

CRS mapping (design/decisions): keep topocentric ENU as COLMAP model (metres).
CaptureMeta.origin_offset is (0,0,0). CaptureMeta.epsg is the UTM zone EPSG
derived from reference_lla longitude (metadata only): zone=floor((lon+180)/6)+1
clamped 1..60; 32600+zone north, 32700+zone south by reference_lla latitude.
units is hardcoded to "metres" by recon_core.save_capture and is not passed.
source is "odm-solve:<solve-dir-name>". data_licence is
"unspecified (drone-survey capture)".

Mapping: cameras/shots/points use 1-based ids in sorted OpenSfM key order.
OpenSfM focal_x/focal_y are normalised by max(width,height); fx=focal_x*m,
fy=(focal_y or focal_x)*m, cx=c_x*m+w/2, cy=c_y*m+h/2. perspective/brown map to
core PINHOLE. brown distortion k1,k2,k3,p1,p2 is copied verbatim into
CaptureMeta.notes and never silently dropped; fisheye/equirectangular/spherical/
unknown fail loudly. Shot rotation is Rodrigues 3-vector converted to unit
quaternion (w,x,y,z) with qw>=0; tvec=translation unchanged (Xc=R*Xw+t, no sign
flip). points2d=(), track=().
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from recon_core.capture import (
    Camera,
    Capture,
    CaptureMeta,
    ColmapModel,
    Image,
    Point3D,
    save_capture,
)


def die(msg: str) -> "None":
    print(f"odm_to_posed_capture: {msg}", file=sys.stderr)
    raise SystemExit(1)


def _rodrigues(angle_axis: list[float]) -> list[list[float]]:
    """OpenSfM Rodrigues 3-vector -> 3x3 rotation matrix.

    Identical formula to nodes/register/register.py:179-188.
    """
    theta = math.sqrt(sum(c * c for c in angle_axis))
    if theta < 1e-12:
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    kx, ky, kz = (c / theta for c in angle_axis)
    K = [[0.0, -kz, ky], [kz, 0.0, -kx], [-ky, kx, 0.0]]
    sin_t, cos_t = math.sin(theta), math.cos(theta)
    R = [[(1.0 if i == j else 0.0) + sin_t * K[i][j] for j in range(3)] for i in range(3)]
    KK = [[sum(K[i][k] * K[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return [[R[i][j] + (1 - cos_t) * KK[i][j] for j in range(3)] for i in range(3)]


def rotation_matrix_to_qvec(R: list[list[float]]) -> tuple[float, float, float, float]:
    """3x3 rotation matrix -> COLMAP qvec (w,x,y,z), canonical qw>=0."""
    trace = R[0][0] + R[1][1] + R[2][2]
    if trace > 0.0:
        s = math.sqrt(trace + 1.0) * 2.0
        qw = 0.25 * s
        qx = (R[2][1] - R[1][2]) / s
        qy = (R[0][2] - R[2][0]) / s
        qz = (R[1][0] - R[0][1]) / s
    elif R[0][0] > R[1][1] and R[0][0] > R[2][2]:
        s = math.sqrt(1.0 + R[0][0] - R[1][1] - R[2][2]) * 2.0
        qw = (R[2][1] - R[1][2]) / s
        qx = 0.25 * s
        qy = (R[0][1] + R[1][0]) / s
        qz = (R[0][2] + R[2][0]) / s
    elif R[1][1] > R[2][2]:
        s = math.sqrt(1.0 + R[1][1] - R[0][0] - R[2][2]) * 2.0
        qw = (R[0][2] - R[2][0]) / s
        qx = (R[0][1] + R[1][0]) / s
        qy = 0.25 * s
        qz = (R[1][2] + R[2][1]) / s
    else:
        s = math.sqrt(1.0 + R[2][2] - R[0][0] - R[1][1]) * 2.0
        qw = (R[1][0] - R[0][1]) / s
        qx = (R[0][2] + R[2][0]) / s
        qy = (R[1][2] + R[2][1]) / s
        qz = 0.25 * s
    q = [qw, qx, qy, qz]
    norm = math.sqrt(sum(v * v for v in q))
    if norm == 0.0:
        die("zero-norm quaternion from shot rotation")
    q = [v / norm for v in q]
    if q[0] < 0.0:
        q = [-v for v in q]
    return (q[0], q[1], q[2], q[3])


def utm_epsg(reference_lla: dict) -> int:
    try:
        lat = float(reference_lla["latitude"])
        lon = float(reference_lla["longitude"])
    except Exception as e:  # noqa: BLE001
        die(f"reference_lla latitude/longitude required: {e}")
    zone = int(math.floor((lon + 180.0) / 6.0) + 1)
    zone = max(1, min(60, zone))
    return (32600 + zone) if lat >= 0.0 else (32700 + zone)


def camera_to_core(cam_id: int, cam: dict) -> tuple[Camera, str | None]:
    ptype = cam.get("projection_type")
    if ptype not in ("perspective", "brown"):
        die(
            f"unsupported projection_type {ptype!r}; only perspective/brown map to PINHOLE, "
            "fisheye/equirectangular/spherical/unknown fail loudly"
        )
    try:
        width = int(cam["width"])
        height = int(cam["height"])
    except Exception as e:  # noqa: BLE001
        die(f"camera width/height required: {e}")
    if width <= 0 or height <= 0:
        die(f"camera width/height must be positive: {width}x{height}")

    m = float(max(width, height))
    focal_x = cam.get("focal_x", cam.get("focal"))
    focal_y = cam.get("focal_y", focal_x)
    if focal_x is None:
        die("camera missing focal_x/focal")
    fx = float(focal_x) * m
    fy = float(focal_y) * m
    cx = float(cam.get("c_x", 0.0)) * m + width / 2.0
    cy = float(cam.get("c_y", 0.0)) * m + height / 2.0

    note = None
    if ptype == "brown":
        parts = []
        for k in ("k1", "k2", "k3", "p1", "p2"):
            if k in cam:
                parts.append(f"{k}={cam[k]}")
        note = "opensfm brown " + " ".join(parts) if parts else "opensfm brown"
    return Camera(camera_id=cam_id, model="PINHOLE", width=width, height=height, params=(fx, fy, cx, cy)), note


def convert(component: dict, solve_dir: Path) -> Capture:
    cameras_raw = component.get("cameras") or {}
    shots_raw = component.get("shots") or {}
    points_raw = component.get("points") or {}
    if not isinstance(cameras_raw, dict) or not cameras_raw:
        die("component.cameras must be a non-empty object")
    if not isinstance(shots_raw, dict) or not shots_raw:
        die("component.shots must be a non-empty object")
    if not isinstance(points_raw, dict):
        die("component.points must be an object")

    cam_keys = sorted(cameras_raw)
    shot_keys = sorted(shots_raw)
    point_keys = sorted(points_raw)
    cam_id_map = {k: i + 1 for i, k in enumerate(cam_keys)}
    shot_id_map = {k: i + 1 for i, k in enumerate(shot_keys)}

    cameras: dict[int, Camera] = {}
    brown_notes: list[str] = []
    for k in cam_keys:
        cam, note = camera_to_core(cam_id_map[k], cameras_raw[k])
        cameras[cam.camera_id] = cam
        if note:
            brown_notes.append(note)

    images: dict[int, Image] = {}
    for k in shot_keys:
        shot = shots_raw[k]
        cam_key = shot.get("camera")
        if cam_key not in cam_id_map:
            die(f"shot {k!r} references unknown camera {cam_key!r}")
        try:
            rotation = [float(x) for x in shot["rotation"]]
            translation = [float(x) for x in shot["translation"]]
        except Exception as e:  # noqa: BLE001
            die(f"shot {k!r} missing rotation/translation: {e}")
        if len(rotation) != 3 or len(translation) != 3:
            die(f"shot {k!r} rotation must be 3-vector and translation 3-vector")
        R = _rodrigues(rotation)
        qvec = rotation_matrix_to_qvec(R)
        tvec = (translation[0], translation[1], translation[2])
        sid = shot_id_map[k]
        images[sid] = Image(
            image_id=sid,
            qvec=qvec,
            tvec=tvec,
            camera_id=cam_id_map[cam_key],
            name=k,
            points2d=(),
        )

    points3d: dict[int, Point3D] = {}
    for i, k in enumerate(point_keys):
        p = points_raw[k]
        try:
            coords = p["coordinates"]
            xyz = (float(coords[0]), float(coords[1]), float(coords[2]))
        except Exception as e:  # noqa: BLE001
            die(f"point {k!r} missing coordinates: {e}")
        color_raw = p.get("color", [0, 0, 0])
        try:
            rgb = (int(color_raw[0]), int(color_raw[1]), int(color_raw[2]))
        except Exception:
            rgb = (0, 0, 0)
        error = float(p.get("error", 0.0) or 0.0)
        pid = i + 1
        points3d[pid] = Point3D(point3d_id=pid, xyz=xyz, rgb=rgb, error=error, track=())

    ref = component.get("reference_lla")
    if not isinstance(ref, dict):
        die("component.reference_lla required for epsg metadata")
    epsg = utm_epsg(ref)

    notes = "; ".join(brown_notes) if brown_notes else None
    meta = CaptureMeta(
        epsg=epsg,
        origin_offset=(0.0, 0.0, 0.0),
        source=f"odm-solve:{solve_dir.name}",
        data_licence="unspecified (drone-survey capture)",
        captures=tuple(shot_keys),
        notes=notes,
    )
    return Capture(meta=meta, colmap=ColmapModel(cameras=cameras, images=images, points3d=points3d))


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description="Convert OpenSfM reconstruction.json to recon-core Posed Capture")
    ap.add_argument("--solve-dir", required=True, type=Path)
    ap.add_argument("--opensfm-json", type=Path, default=None)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(argv)

    solve_dir: Path = args.solve_dir
    if not solve_dir.exists():
        die(f"--solve-dir does not exist: {solve_dir}")
    opensfm_json = args.opensfm_json if args.opensfm_json is not None else solve_dir / "opensfm" / "reconstruction.json"
    if not opensfm_json.exists():
        die(f"opensfm json not found: {opensfm_json}")

    try:
        data = json.loads(opensfm_json.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        die(f"failed to read {opensfm_json}: {e}")
    if not isinstance(data, list) or not data:
        die("reconstruction.json must be a non-empty list of components")
    component = data[0]
    if not isinstance(component, dict):
        die("reconstruction component must be an object")

    capture = convert(component, solve_dir)
    args.out.mkdir(parents=True, exist_ok=True)
    save_capture(capture, args.out)
    print(f"wrote posed capture to {args.out}")


if __name__ == "__main__":
    main()
