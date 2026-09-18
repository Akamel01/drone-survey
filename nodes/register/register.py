#!/usr/bin/env python3
"""register: tag Anchors and emit ODM's ground control file.

ADR 0007 (revision) + design.md §4 + #22's comment: `register` runs between
two `solve` passes. The first solve (no ground control) recovers camera
poses; `register` projects each Anchor's recorded placeholder coordinate
into every image using those poses, matches detected targets to the nearest
projection, gates the result, and writes `gcp_list.txt`; the second solve
consumes that file.

**What is implemented and tested here**: the projection, the
nearest-projection matching, the pre-ODM quality gate (anchor-auto-detection-
2026.md §6: images-per-anchor, detection-to-projection distance, whole-
Capture minimum), and the `gcp_list.txt` writer (format per
docs.opendronemap.org/gcp, cross-checked against the real
`odm_data_bellus/gcp_list.txt` sample). All four are unit-tested against
*synthetic* detections with known answers in nodes/check_ortho.py.

**What is explicitly NOT implemented or proven**: finding a quadrant-in-
circle target in a real photograph. No Site with Anchors has been flown
(#22), so there is nothing real to detect yet and no way to validate a
detector against ground truth. This Node takes detections as an input
(`--detections`, a JSON file of already-found pixel centres) rather than
computing them from pixels -- production needs a real detector built and
proven against a flown Site before `register` does anything on a live
Capture. State this plainly rather than shipping unproven CV and calling it
done.

**A second, narrower gap, now closed (#22 orchestrator comment)**: NodeODM's
asset API never exposes per-shot poses (`odm_report/shots.geojson`) at the
cheap `end-with=opensfm` stop point -- confirmed on real output, still true.
`solve`'s no-ground-control pass now runs the ODM CLI container directly on
a project directory instead (see nodes/solve/solve.py's docstring) and reads
`opensfm/reconstruction.json`, which OpenSfM writes at that same cheap stage.
That file's shots are **not** georeferenced: they live in OpenSfM's own
topocentric ENU frame, local to a `reference_lla` (see
`latlon_alt_to_topocentric` below). `--poses` carries `reference_lla` when
present; `build_projections` converts each Anchor into that frame before
projecting. When `--poses` has no `reference_lla` (the old, far more
expensive `shots.geojson`-at-`odm_report` route, still supported), shots are
already georeferenced and Anchors go in as UTM directly, as before. Either
way: world point Xw -> camera point Xc = R*Xw + t, R from `rotation` via
Rodrigues. **Proven against a real Capture** (odm_data_bellus, run on the
compute host): projecting its own `gcp_list.txt` ground points through its
own `opensfm/reconstruction.json` poses lands within the check's tolerance
of the surveyed pixel -- see `nodes/check_ortho.py`'s
`check_bellus_real_projection`.

Ground control file format (docs.opendronemap.org/gcp, and cross-checked
against a real ODM sample dataset's own gcp_list.txt):

    <coordinate system spec>
    geo_x geo_y geo_z im_x im_y image_name [gcp_name]

Anchors are recorded as WGS84 lat/lon/alt (ADR 0007: "read once from
consumer GPS"); this Node converts to UTM only for the numbers actually
written to `gcp_list.txt`, which must be in a real projected CRS.

Usage:
    python3 register.py --anchors anchors.json --out OUT_DIR
        [--poses solve_out/poses.json --camera solve_out/camera.json --detections detections.json]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
import sys
from pathlib import Path as _Path  # for type clarity if needed
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import die, emit_report  # noqa: E402

WGS84_A = 6378137.0
WGS84_F = 1 / 298.257223563
WGS84_B = WGS84_A * (1 - WGS84_F)
UTM_K0 = 0.9996

# How far a detection may sit from where the first solve projects its Anchor.
# Measured on bellus's four real GCPs with GPS-only poses: 18-195 px across runs,
# which is consumer GPS error, not a projection bug (bundle residual 1.9 px).
# The earlier 25 px would have rejected every real Anchor.
# ponytail: one radius for all Sites; re-measure on the first Site with real Anchors.
DEFAULT_GATE_PX = 250.0
DEFAULT_MIN_IMAGES_PER_ANCHOR = 3  # ODM docs' documented hard floor
DEFAULT_MIN_ACCEPTED_ANCHORS = 5   # anchor-sizing-2026.md / anchor-procurement.md's floor
DEFAULT_MAX_RESIDUAL_SPREAD_PX = 40.0  # cross-image consistency proxy (see gate()), unmeasured, conservative


# --- coordinates -----------------------------------------------------------

def latlon_to_utm(lat: float, lon: float) -> tuple[float, float, int, str]:
    """Standard WGS84 forward transverse-Mercator (Snyder), zone from longitude.

    Sanity-checked in nodes/check_ortho.py against odm_data_bellus's own
    real gcp_list.txt: that dataset's recorded GPS (41.2245N, 81.7036W)
    lands in zone 17N within a few km of the file's own easting/northing --
    the file's GCPs are elsewhere in the same site, not the same point, so
    this is a locality/zone check, not an exact-value one.
    """
    f, a = WGS84_F, WGS84_A
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    zone = int((lon + 180) // 6) + 1
    lon0 = math.radians(zone * 6 - 183)
    lat_r, lon_r = math.radians(lat), math.radians(lon)
    sin_lat, cos_lat, tan_lat = math.sin(lat_r), math.cos(lat_r), math.tan(lat_r)

    N = a / math.sqrt(1 - e2 * sin_lat ** 2)
    T = tan_lat ** 2
    C = ep2 * cos_lat ** 2
    A = (lon_r - lon0) * cos_lat
    M = a * (
        (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * lat_r
        - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * math.sin(2 * lat_r)
        + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * math.sin(4 * lat_r)
        - (35 * e2 ** 3 / 3072) * math.sin(6 * lat_r)
    )
    easting = UTM_K0 * N * (
        A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120
    ) + 500000.0
    northing = UTM_K0 * (
        M + N * tan_lat * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
                            + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720)
    )
    hemisphere = "N" if lat >= 0 else "S"
    if lat < 0:
        northing += 10_000_000.0
    return easting, northing, zone, hemisphere


def utm_to_latlon(easting: float, northing: float, zone: int, hemisphere: str) -> tuple[float, float]:
    """Inverse of latlon_to_utm (Snyder). Needed to turn gcp_list.txt's UTM
    ground truth back into lat/lon so it can be run through the same
    topocentric conversion OpenSfM used for the reconstruction's own shots
    (#22 real-data proof: gcp_list.txt is UTM, reconstruction.json is
    topocentric ENU -- UTM is the only common intermediate)."""
    f, a = WGS84_F, WGS84_A
    e2 = f * (2 - f)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    ep2 = e2 / (1 - e2)
    k0 = UTM_K0
    x = easting - 500000.0
    y = northing - 10_000_000.0 if hemisphere.upper() == "S" else northing
    lon0 = math.radians(zone * 6 - 183)

    M = y / k0
    mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
        + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
        + (151 * e1 ** 3 / 96) * math.sin(6 * mu)
        + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)
    )
    sin_p1, cos_p1, tan_p1 = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    C1 = ep2 * cos_p1 ** 2
    T1 = tan_p1 ** 2
    N1 = a / math.sqrt(1 - e2 * sin_p1 ** 2)
    R1 = a * (1 - e2) / (1 - e2 * sin_p1 ** 2) ** 1.5
    D = x / (N1 * k0)

    lat = phi1 - (N1 * tan_p1 / R1) * (
        D ** 2 / 2
        - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
        + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720
    )
    lon = lon0 + (
        D
        - (1 + 2 * T1 + C1) * D ** 3 / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120
    ) / cos_p1
    return math.degrees(lat), math.degrees(lon)


# --- projection --------------------------------------------------------------

def _rodrigues(angle_axis: list[float]) -> list[list[float]]:
    theta = math.sqrt(sum(c * c for c in angle_axis))
    if theta < 1e-12:
        return [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    kx, ky, kz = (c / theta for c in angle_axis)
    K = [[0.0, -kz, ky], [kz, 0.0, -kx], [-ky, kx, 0.0]]
    sin_t, cos_t = math.sin(theta), math.cos(theta)
    R = [[(1.0 if i == j else 0.0) + sin_t * K[i][j] for j in range(3)] for i in range(3)]
    KK = [[sum(K[i][k] * K[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return [[R[i][j] + (1 - cos_t) * KK[i][j] for j in range(3)] for i in range(3)]


def project_point(camera: dict, rotation: list[float], translation: list[float],
                   point_world: list[float]) -> tuple[float, float] | None:
    """World point -> pixel, brown (radial-tangential) distortion model, OpenSfM's
    normalized-camera convention (pixel = principal_point + focal*distorted,
    all normalized by max(width, height), origin at image centre; confirmed
    against real ODM cameras.json field names/scale on 2026-09-13).

    World-to-camera convention: Xc = R*Xw + t (OpenSfM/COLMAP standard).
    Verified against a real Capture (odm_data_bellus's own
    opensfm/reconstruction.json + gcp_list.txt) -- see module docstring and
    nodes/check_ortho.py's check_bellus_real_projection.
    """
    R = _rodrigues(rotation)
    xc = [sum(R[i][j] * point_world[j] for j in range(3)) + translation[i] for i in range(3)]
    if xc[2] <= 1e-6:
        return None  # behind the camera
    x_n, y_n = xc[0] / xc[2], xc[1] / xc[2]
    r2 = x_n * x_n + y_n * y_n
    k1, k2, k3 = camera.get("k1", 0.0), camera.get("k2", 0.0), camera.get("k3", 0.0)
    p1, p2 = camera.get("p1", 0.0), camera.get("p2", 0.0)
    radial = 1 + k1 * r2 + k2 * r2 ** 2 + k3 * r2 ** 3
    x_d = x_n * radial + 2 * p1 * x_n * y_n + p2 * (r2 + 2 * x_n * x_n)
    y_d = y_n * radial + p1 * (r2 + 2 * y_n * y_n) + 2 * p2 * x_n * y_n
    f = camera["focal"]
    w, h = camera["width"], camera["height"]
    scale = max(w, h)
    u = camera.get("c_x", 0.0) + f * x_d
    v = camera.get("c_y", 0.0) + f * y_d
    return u * scale + w / 2, v * scale + h / 2


def _ecef_from_lla(lat: float, lon: float, alt: float) -> tuple[float, float, float]:
    """OpenSfM's own ecef_from_lla (opensfm/geo.py), reimplemented in stdlib
    math -- WGS84 ellipsoid, not a sphere. Reconstruction.json's shots are in
    OpenSfM's topocentric frame (see module docstring); to project a world
    point given as lat/lon/alt (or UTM, via utm_to_latlon) into that frame,
    this Node has to reproduce OpenSfM's own conversion exactly, not
    approximate it."""
    a2, b2 = WGS84_A ** 2, WGS84_B ** 2
    lat_r, lon_r = math.radians(lat), math.radians(lon)
    sin_lat, cos_lat = math.sin(lat_r), math.cos(lat_r)
    L = 1.0 / math.sqrt(a2 * cos_lat ** 2 + b2 * sin_lat ** 2)
    x = (a2 * L + alt) * cos_lat * math.cos(lon_r)
    y = (a2 * L + alt) * cos_lat * math.sin(lon_r)
    z = (b2 * L + alt) * sin_lat
    return x, y, z


def latlon_alt_to_topocentric(lat: float, lon: float, alt: float,
                               ref_lat: float, ref_lon: float, ref_alt: float) -> list[float]:
    """World lat/lon/alt -> OpenSfM's topocentric ENU (east, north, up) frame
    at (ref_lat, ref_lon, ref_alt) -- the exact inverse of OpenSfM's own
    `topocentric_from_lla` (opensfm/geo.py), confirmed by reading that module
    in the ODM container (docker run --entrypoint cat opendronemap/odm:latest
    .../opensfm/geo.py, 2026-09-13): ECEF difference from the reference point,
    rotated into the reference's local east/north/up basis. This replaces the
    earlier equirectangular approximation, which was never checked against
    OpenSfM's actual convention and is wrong for this purpose -- it agreed
    with this one only to first order, and this Node projects against a real
    reconstruction now, not just synthetic fixtures at Anchor-spacing scale."""
    x, y, z = _ecef_from_lla(lat, lon, alt)
    x0, y0, z0 = _ecef_from_lla(ref_lat, ref_lon, ref_alt)
    dx, dy, dz = x - x0, y - y0, z - z0
    sa, ca = math.sin(math.radians(ref_lat)), math.cos(math.radians(ref_lat))
    so, co = math.sin(math.radians(ref_lon)), math.cos(math.radians(ref_lon))
    east = -so * dx + co * dy
    north = -sa * co * dx - sa * so * dy + ca * dz
    up = ca * co * dx + ca * so * dy + sa * dz
    return [east, north, up]


# --- matching and gate -------------------------------------------------------

def match_detections(detections: dict[str, list[list[float]]],
                      projections: dict[str, dict[str, tuple[float, float]]],
                      gate_px: float) -> dict[str, list[dict]]:
    """Each detection is assigned to its nearest projected Anchor, if within
    `gate_px`. #22: identity comes from projection, not from reading a code."""
    matches: dict[str, list[dict]] = {}
    for image, dets in detections.items():
        proj_for_image = projections.get(image, {})
        for dx, dy in dets:
            best_id, best_dist = None, None
            for anchor_id, (px, py) in proj_for_image.items():
                dist = math.hypot(dx - px, dy - py)
                if best_dist is None or dist < best_dist:
                    best_id, best_dist = anchor_id, dist
            if best_id is not None and best_dist <= gate_px:
                matches.setdefault(best_id, []).append({"image": image, "px": dx, "py": dy, "residual": best_dist})
    return matches


def gate(matches: dict[str, list[dict]], anchors: list[dict], *,
         min_images: int = DEFAULT_MIN_IMAGES_PER_ANCHOR,
         min_accepted_anchors: int = DEFAULT_MIN_ACCEPTED_ANCHORS,
         max_residual_spread: float = DEFAULT_MAX_RESIDUAL_SPREAD_PX) -> tuple[dict, dict, bool]:
    """anchor-auto-detection-2026.md §6, checks 1/2/5. Check 3 (post-solve
    reprojection residual) needs ODM to expose per-GCP residuals, which #22's
    comment says is still unverified -- not implemented here. Check 4
    (cross-image 3D triangulation) is approximated by residual spread across
    an Anchor's own images rather than a full triangulation, a documented
    simplification, not the real thing.

    #22: "a wrong detection must never reach gcp_list.txt" -- any failure
    here means no file is written, not a partial one.
    """
    accepted: dict[str, list[dict]] = {}
    rejected: dict[str, str] = {}
    for anchor in anchors:
        aid = anchor["id"]
        obs = matches.get(aid, [])
        if len(obs) < min_images:
            rejected[aid] = f"only {len(obs)} image(s) (need >= {min_images})"
            continue
        residuals = [o["residual"] for o in obs]
        spread = max(residuals) - min(residuals)
        if spread > max_residual_spread:
            rejected[aid] = f"residual spread {spread:.1f}px across images exceeds {max_residual_spread}px"
            continue
        accepted[aid] = obs
    passed = len(accepted) >= min_accepted_anchors
    if not passed and not rejected:
        rejected["_capture"] = f"only {len(accepted)} anchor(s) accepted (need >= {min_accepted_anchors})"
    return accepted, rejected, passed


def write_gcp_list(accepted: dict[str, list[dict]], anchors_by_id: dict[str, dict], path: Path) -> None:
    """docs.opendronemap.org/gcp format; 0.0 for missing elevation, never NaN,
    per that same documentation's own stated failure mode."""
    if not accepted:
        raise ValueError("write_gcp_list: nothing accepted")
    ref_lat = sum(a["lat"] for a in anchors_by_id.values()) / len(anchors_by_id)
    ref_lon = sum(a["lon"] for a in anchors_by_id.values()) / len(anchors_by_id)
    _, _, zone, hemisphere = latlon_to_utm(ref_lat, ref_lon)
    lines = [f"WGS84 UTM {zone}{hemisphere}"]
    for aid, obs in accepted.items():
        anchor = anchors_by_id[aid]
        easting, northing, _, _ = latlon_to_utm(anchor["lat"], anchor["lon"])
        elevation = anchor.get("alt") or 0.0
        for o in obs:
            lines.append(f"{easting:.3f} {northing:.3f} {elevation:.3f} {o['px']:.2f} {o['py']:.2f} {o['image']} {aid}")
    path.write_text("\n".join(lines) + "\n")


# --- CLI ----------------------------------------------------------------------

def read_anchors(path: Path | None) -> list[dict]:
    """{"anchors": [{"id", "lat", "lon", "alt"}, ...]} or a bare list. Missing
    file or empty list means "no Anchors configured for this Site yet" --
    a real, expected state (#22: no Site with Anchors has been flown), not
    an error."""
    if path is None or not path.is_file():
        return []
    data = json.loads(path.read_text())
    anchors = data.get("anchors") if isinstance(data, dict) else data
    return anchors or []


def anchor_world_point(anchor: dict, reference_lla: dict | None) -> list[float]:
    """An Anchor's recorded lat/lon/alt, expressed in whatever frame `poses`
    is in. `reference_lla` present (opensfm/reconstruction.json, the cheap
    opensfm-only solve) means shots are topocentric ENU -- convert into that
    frame. Absent (odm_report/shots.geojson, an expensive full solve) means
    shots are already georeferenced -- UTM, as before."""
    alt = anchor.get("alt") or 0.0
    if reference_lla is not None:
        return latlon_alt_to_topocentric(
            anchor["lat"], anchor["lon"], alt,
            reference_lla["latitude"], reference_lla["longitude"], reference_lla.get("altitude", 0.0),
        )
    easting, northing, _, _ = latlon_to_utm(anchor["lat"], anchor["lon"])
    return [easting, northing, alt]


def build_projections(poses: dict, camera: dict, anchors: list[dict]) -> dict[str, dict[str, tuple[float, float]]]:
    reference_lla = poses.get("reference_lla")
    projections: dict[str, dict[str, tuple[float, float]]] = {}
    for image, shot in poses.get("shots", {}).items():
        rotation, translation = shot.get("rotation"), shot.get("translation")
        if rotation is None or translation is None:
            continue
        per_image = {}
        for anchor in anchors:
            world_point = anchor_world_point(anchor, reference_lla)
            result = project_point(camera, rotation, translation, world_point)
            if result is not None:
                per_image[anchor["id"]] = result
        projections[image] = per_image
    return projections


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--anchors", type=Path, default=None, help="this Site's recorded Anchors; omitted/empty means nothing to register")
    p.add_argument("--poses", type=Path, default=None, help="solve's poses.json (needs a solve that reached odm_report)")
    p.add_argument("--camera", type=Path, default=None, help="solve's camera.json")
    p.add_argument("--detections", type=Path, default=None, help="{image: [[px,py], ...]} -- detection is not implemented here, see module docstring")
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--gate-px", type=float, default=DEFAULT_GATE_PX)
    p.add_argument("--min-images", type=int, default=DEFAULT_MIN_IMAGES_PER_ANCHOR)
    p.add_argument("--min-anchors", type=int, default=DEFAULT_MIN_ACCEPTED_ANCHORS)
    p.add_argument("--max-residual-spread", type=float, default=DEFAULT_MAX_RESIDUAL_SPREAD_PX)
    args = p.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    anchors = read_anchors(args.anchors)
    if not anchors:
        # An empty (not absent) gcp_list.txt is the deliberate "no ground
        # control" signal solve's second pass looks for -- so the Manifest
        # can wire register's output into solve unconditionally without a
        # conditional the Manifest schema has no way to express. Contrast
        # with a gate *failure* below, which leaves no file at all and stops
        # the run (#22: "a wrong detection must never reach gcp_list.txt").
        (args.out / "gcp_list.txt").write_text("")
        print("register: no Anchors configured for this Site -- wrote an empty gcp_list.txt (no ground control)")
        return

    if args.poses is None or args.camera is None:
        sys.exit("register: Anchors are configured but --poses/--camera were not given")
    poses = json.loads(args.poses.read_text())
    camera = json.loads(args.camera.read_text())
    if not poses.get("shots"):
        sys.exit("register: solve produced no per-shot poses (needs end-with=odm_report or later; "
                  "see nodes/solve/solve.py's module docstring) -- cannot project Anchors")
    if args.detections is None:
        sys.exit("register: --detections not given -- Anchor detection on real imagery is not implemented "
                  "(see module docstring); supply pre-computed detections or run against synthetic fixtures")
    detections = json.loads(args.detections.read_text())

    projections = build_projections(poses, camera, anchors)
    matches = match_detections(detections, projections, args.gate_px)
    accepted, rejected, passed = gate(
        matches, anchors, min_images=args.min_images,
        min_accepted_anchors=args.min_anchors, max_residual_spread=args.max_residual_spread,
    )
    report = {
        "accepted": {aid: len(obs) for aid, obs in accepted.items()},
        "rejected": rejected,
        "gate_passed": passed,
    }
    emit_report(args.out / "report.json", report)

    if not passed:
        sys.exit(f"register: gate failed -- {rejected}")

    write_gcp_list(accepted, {a["id"]: a for a in anchors}, args.out / "gcp_list.txt")
    total_obs = sum(len(v) for v in accepted.values())
    print(f"register: wrote gcp_list.txt -- {len(accepted)} anchor(s), {total_obs} observation(s)")


if __name__ == "__main__":
    main()
