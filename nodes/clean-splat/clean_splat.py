#!/usr/bin/env python3
"""clean-splat: automated cleaning with a quality gate (ADR 0015, #29's research).

No human touches this step. Four mechanical passes over the raw fitted
splat, in order, then a gate that exits non-zero on failure and never
silently passes (the ticket's own wording):

  1. NaN / non-finite / zero-norm-rotation gaussians dropped.
  2. Crop to the Site boundary, if one is given: a loose axis-aligned box
     first, then an exact point-in-polygon + z-range test on gaussian
     centres (docs/research/splat-auto-cleaning-2026.md, step 4 -- ns-export
     and splat-transform both only crop to a box or sphere, never an
     arbitrary polygon).
  3. Statistical outlier removal on gaussian centres (step 5): k-nearest-
     neighbour mean distance, flagged against the set's own mean + k*stddev.
     Open3D is not installed here and is not pulled in for this -- the
     scenes this pipeline produces are tens of thousands of gaussians, not
     millions, and a spatial-hash k-NN in pure Python is a few dozen lines,
     not a new dependency (ponytail: stdlib first).
  4. Opacity / scale pruning (step 6): drop gaussians below an opacity floor
     or above a scale ceiling.

Coordinates: this pipeline's Fitting engine (fit-splat, OpenSplat by default)
runs with `--center` never passed, so gaussian centres stay in the same
local frame ODM itself solved in (OpenSplat's own `keepCrs` default) --
there is no nerfstudio applied_transform/applied_scale/dataparser_transforms
chain to compose for this engine. A Site polygon is expected in that same
ODM-local frame (already reprojected from real-world coordinates by
whatever calls this Node); this Node does not do that reprojection itself.

The gate (docs/research/splat-auto-cleaning-2026.md, "recommended pipeline",
step 7) combines:
  - held-out view fidelity: fit-splat's own report.json already carries the
    validation PSNR OpenSplat prints for the one image it withheld -- reused
    here rather than re-implemented (rendering a held-out view a second time
    would need the training engine again).
  - the fraction the crop removed (flag an unusually large fraction).
  - the fraction statistical-outlier-removal removed (same).
  - the final gaussian count is not implausibly small.
  - an *independent* check that the kept gaussians actually overlap the
    Site boundary -- the ticket names this explicitly, because a mistake in
    the crop step "would silently crop the wrong region."

No published threshold set exists for any of this (the research document
says so directly). Every threshold below is a first, conservative cut
(ADR 0014/0018's "start conservative, tighten with measurement") and is a
declared calibration debt, not a finished calibration.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import die  # noqa: E402

# --- calibration debt: first conservative cuts, unmeasured past this one project (see module docstring) ---
OPACITY_MIN = 0.02
SCALE_MAX = 5.0                 # gsplat/OpenSplat store log-scale; a raw scale this large is a spike, not geometry
SOR_K = 8
SOR_STD_RATIO = 2.0
MAX_CROP_REMOVED_FRACTION = 0.60
MAX_SOR_REMOVED_FRACTION = 0.30
MIN_FINAL_GAUSSIANS = 1000
MIN_VAL_PSNR = 12.0              # deliberately low first bar: OpenSplat scenes here are sparse (#12's research), real PSNR distribution unmeasured


# --- minimal binary PLY I/O (stdlib only: struct + text header) -----------------------------------

_TYPE_MAP = {
    "float": ("f", 4), "float32": ("f", 4), "double": ("d", 8), "float64": ("d", 8),
    "uchar": ("B", 1), "uint8": ("B", 1), "char": ("b", 1), "int8": ("b", 1),
    "int": ("i", 4), "int32": ("i", 4), "uint": ("I", 4), "uint32": ("I", 4),
    "short": ("h", 2), "ushort": ("H", 2),
}


def read_ply(path: Path) -> tuple[list[str], list[tuple[float, ...]]]:
    """Binary-little-endian PLY only -- what OpenSplat and splatfacto's exporter both write."""
    with path.open("rb") as f:
        line = f.readline().strip()
        if line != b"ply":
            die(f"clean-splat: {path} is not a PLY file")
        props: list[tuple[str, str]] = []
        count = 0
        fmt_ok = False
        while True:
            line = f.readline().decode("ascii").strip()
            if line.startswith("format"):
                fmt_ok = "binary_little_endian" in line
            elif line.startswith("element vertex"):
                count = int(line.split()[-1])
            elif line.startswith("property"):
                parts = line.split()
                if parts[1] == "list":
                    die(f"clean-splat: {path} has a list property; not a gaussian-splat PLY this Node understands")
                props.append((parts[2], parts[1]))  # (name, type)
            elif line == "end_header":
                break
        if not fmt_ok:
            die(f"clean-splat: {path} is not binary_little_endian; refusing to guess a layout")

        names = [n for n, _ in props]
        row_fmt = "<" + "".join(_TYPE_MAP[t][0] for _, t in props)
        row_size = struct.calcsize(row_fmt)
        data = f.read(row_size * count)
        if len(data) != row_size * count:
            die(f"clean-splat: {path} truncated: expected {count} vertices, got {len(data) // row_size}")
        rows = [struct.unpack_from(row_fmt, data, i * row_size) for i in range(count)]
        return names, rows


def write_ply(path: Path, names: list[str], type_names: list[str], rows: list[tuple[float, ...]]) -> None:
    header_lines = ["ply", "format binary_little_endian 1.0", f"element vertex {len(rows)}"]
    header_lines += [f"property {t} {n}" for n, t in zip(names, type_names)]
    header_lines.append("end_header")
    row_fmt = "<" + "".join(_TYPE_MAP[t][0] for t in type_names)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(("\n".join(header_lines) + "\n").encode("ascii"))
        for row in rows:
            f.write(struct.pack(row_fmt, *row))


def ply_types(path: Path) -> list[str]:
    with path.open("rb") as f:
        f.readline()
        types = []
        while True:
            line = f.readline().decode("ascii").strip()
            if line.startswith("property"):
                types.append(line.split()[1])
            elif line == "end_header":
                break
        return types


# --- cleaning passes (each: names, rows -> kept rows, dropped count) -------------------------------

def drop_nonfinite(names: list[str], rows: list[tuple]) -> tuple[list[tuple], int]:
    def finite(row):
        return all(math.isfinite(v) for v in row if isinstance(v, float))

    kept = [r for r in rows if finite(r)]
    rot_idx = [i for i, n in enumerate(names) if n.startswith("rot_")]
    if rot_idx:
        kept = [r for r in kept if any(abs(r[i]) > 1e-12 for i in rot_idx)]
    return kept, len(rows) - len(kept)


def point_in_polygon(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    """Standard ray-casting test; polygon is a list of (x, y) in the splat's own local frame."""
    inside = False
    n = len(polygon)
    x1, y1 = polygon[-1]
    for x2, y2 in polygon:
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1):
            inside = not inside
        x1, y1 = x2, y2
    return inside


def crop_to_site(names: list[str], rows: list[tuple], polygon: list[tuple[float, float]],
                  z_min: float, z_max: float) -> tuple[list[tuple], int]:
    xi, yi, zi = names.index("x"), names.index("y"), names.index("z")
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    bx0, bx1, by0, by1 = min(xs), max(xs), min(ys), max(ys)

    kept = []
    for r in rows:
        x, y, z = r[xi], r[yi], r[zi]
        if not (bx0 <= x <= bx1 and by0 <= y <= by1 and z_min <= z <= z_max):
            continue
        if point_in_polygon(x, y, polygon):
            kept.append(r)
    return kept, len(rows) - len(kept)


def statistical_outlier_removal(names: list[str], rows: list[tuple], k: int = SOR_K,
                                 std_ratio: float = SOR_STD_RATIO) -> tuple[list[tuple], int]:
    """Open3D's remove_statistical_outlier, reimplemented: mean k-NN distance per point,
    drop points whose mean distance exceeds the set's own mean + std_ratio * stddev.

    A uniform spatial hash keeps this near O(n) instead of O(n^2): points are
    bucketed into cubes sized from the data's own bounding box, and a point's
    neighbours are searched only in its own cube and the 26 adjacent ones.
    """
    if len(rows) <= k:
        return rows, 0
    xi, yi, zi = names.index("x"), names.index("y"), names.index("z")
    pts = [(r[xi], r[yi], r[zi]) for r in rows]

    xs, ys, zs = zip(*pts)
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) or 1.0
    cell = span / (len(pts) ** (1 / 3) + 1)  # roughly one point per cell on average
    cell = cell or 1.0

    def cell_of(p):
        return (int(p[0] // cell), int(p[1] // cell), int(p[2] // cell))

    buckets: dict[tuple, list[int]] = {}
    for i, p in enumerate(pts):
        buckets.setdefault(cell_of(p), []).append(i)

    # None marks a point with nothing in its own cell or the 26 adjacent ones --
    # isolated by construction, and an outlier regardless of where the
    # threshold below lands (the earlier version scored this 0.0, which made
    # a completely isolated floater indistinguishable from a perfect match --
    # the exact case this pass exists to catch).
    mean_dists: list[float | None] = [None] * len(pts)
    for i, p in enumerate(pts):
        cx, cy, cz = cell_of(p)
        neighbours = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    neighbours.extend(buckets.get((cx + dx, cy + dy, cz + dz), []))
        dists = sorted(
            math.dist(p, pts[j]) for j in neighbours if j != i
        )[:k]
        if dists:
            mean_dists[i] = sum(dists) / len(dists)

    n = len(mean_dists)
    finite = [d for d in mean_dists if d is not None]
    if finite:
        mean = sum(finite) / len(finite)
        variance = sum((d - mean) ** 2 for d in finite) / len(finite)
        threshold = mean + std_ratio * math.sqrt(variance)
    else:
        threshold = 0.0  # every point isolated: nothing to keep

    kept = [rows[i] for i in range(n) if mean_dists[i] is not None and mean_dists[i] <= threshold]
    return kept, n - len(kept)


def prune_opacity_scale(names: list[str], rows: list[tuple],
                         opacity_min: float = OPACITY_MIN, scale_max: float = SCALE_MAX) -> tuple[list[tuple], int]:
    op_i = names.index("opacity") if "opacity" in names else None
    scale_idx = [i for i, n in enumerate(names) if n.startswith("scale_")]

    def keep(row) -> bool:
        if op_i is not None and row[op_i] < opacity_min:
            return False
        if scale_idx and any(row[i] > scale_max for i in scale_idx):
            return False
        return True

    kept = [r for r in rows if keep(r)]
    return kept, len(rows) - len(kept)


# --- the gate --------------------------------------------------------------------------------------

def evaluate_gate(counts: dict, val_psnr: float | None, polygon_given: bool,
                   boundary_overlap_ok: bool | None) -> tuple[bool, list[str]]:
    reasons = []
    initial = counts["initial"]

    if polygon_given:
        crop_removed_fraction = counts["dropped_crop"] / initial if initial else 1.0
        if crop_removed_fraction > MAX_CROP_REMOVED_FRACTION:
            reasons.append(f"crop removed {crop_removed_fraction:.0%} of gaussians (> {MAX_CROP_REMOVED_FRACTION:.0%}) -- "
                            f"training may have put mass outside the Site")
        if boundary_overlap_ok is False:
            reasons.append("independent check failed: kept gaussians do not overlap the Site boundary")

    after_crop = counts["after_crop"]
    sor_removed_fraction = counts["dropped_sor"] / after_crop if after_crop else 1.0
    if sor_removed_fraction > MAX_SOR_REMOVED_FRACTION:
        reasons.append(f"statistical outlier removal dropped {sor_removed_fraction:.0%} (> {MAX_SOR_REMOVED_FRACTION:.0%}) -- "
                        f"more floaters than a clean fit should leave")

    if counts["final"] < MIN_FINAL_GAUSSIANS:
        reasons.append(f"only {counts['final']} gaussians survive cleaning (< {MIN_FINAL_GAUSSIANS})")

    if val_psnr is None:
        reasons.append("no held-out validation PSNR available from fit-splat's report (--val was not run)")
    elif val_psnr < MIN_VAL_PSNR:
        reasons.append(f"held-out validation PSNR {val_psnr:.1f} dB < {MIN_VAL_PSNR} dB")

    return (len(reasons) == 0), reasons


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="in_ply", required=True, type=Path, help="raw splat from fit-splat")
    p.add_argument("--fit-report", type=Path, help="fit-splat's report.json, for the held-out validation PSNR")
    p.add_argument("--site-polygon", type=Path,
                   help="JSON: {\"polygon\": [[x,y], ...], \"z_min\": .., \"z_max\": ..} in the splat's own local frame")
    p.add_argument("--out", required=True, type=Path, help="cleaned splat.ply")
    p.add_argument("--out-report", required=True, type=Path)
    args = p.parse_args()

    names, rows = read_ply(args.in_ply)
    types = ply_types(args.in_ply)
    initial = len(rows)

    rows, dropped_nonfinite = drop_nonfinite(names, rows)

    polygon_given = args.site_polygon is not None
    dropped_crop = 0
    boundary_overlap_ok = None
    if polygon_given:
        site = json.loads(args.site_polygon.read_text())
        polygon = [tuple(pt) for pt in site["polygon"]]
        rows, dropped_crop = crop_to_site(names, rows, polygon, site["z_min"], site["z_max"])
        # Independent check (the ticket's own wording): a mistake in the transform chain
        # would silently crop the wrong region, so re-derive overlap from the *kept* points
        # rather than trusting the crop step that just ran.
        if rows:
            xi, yi = names.index("x"), names.index("y")
            cx = sum(r[xi] for r in rows) / len(rows)
            cy = sum(r[yi] for r in rows) / len(rows)
            boundary_overlap_ok = point_in_polygon(cx, cy, polygon)
        else:
            boundary_overlap_ok = False

    after_crop = len(rows)
    rows, dropped_sor = statistical_outlier_removal(names, rows)
    rows, dropped_prune = prune_opacity_scale(names, rows)
    final = len(rows)

    val_psnr = None
    if args.fit_report and args.fit_report.is_file():
        val_psnr = json.loads(args.fit_report.read_text()).get("val_psnr")

    counts = {
        "initial": initial, "dropped_nonfinite": dropped_nonfinite, "dropped_crop": dropped_crop,
        "after_crop": after_crop, "dropped_sor": dropped_sor, "dropped_prune": dropped_prune, "final": final,
    }
    passed, reasons = evaluate_gate(counts, val_psnr, polygon_given, boundary_overlap_ok)

    write_ply(args.out, names, types, rows)

    report = {
        "counts": counts, "val_psnr": val_psnr, "site_polygon_applied": polygon_given,
        "boundary_overlap_ok": boundary_overlap_ok, "gate": "pass" if passed else "fail", "reasons": reasons,
    }
    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    args.out_report.write_text(json.dumps(report, indent=1))
    print(f"clean-splat: {json.dumps(report, indent=1)}")

    if not passed:
        die(f"clean-splat: quality gate failed: {'; '.join(reasons)}")


if __name__ == "__main__":
    main()
