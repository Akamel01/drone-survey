#!/usr/bin/env python3
"""nodes/check-showcase/gate.py -- the Showcase gate Node (C2 + C4 -> C7, ADR 0018).

Reads the render Node's raw RGBA stills -- alpha is the island mask; the graded
stills are opaque RGB, so C4 can only be measured on the raw pair -- and M1's
cut-report.json, then measures:

  - C4 framing, per aspect: the island is wholly in frame, its alpha centroid
    lands in the right third, and no enclosed transparent region >= 16 px sits
    anywhere in the frame (4-connected flood-fill from the frame border through
    transparent pixels only; sub-16 px enclaves are antialiasing);
  - C2: every file under the Reconstruction DIR re-hashes byte-identical to the
    report's input_hashes (sorted relative paths, sha256_file);
  - optional graded-still sanity: exists, exact size, RGB opaque.

The gate owns those definitions (plan.md C4 notes). It writes the C7 verdict
`{pass, checks: [{name, ok, detail}]}` via emit_report and exits 1 on any failed
check: the Runner stops the run (pipeline/runner.py:250-254), and a silent gate
is impossible because verdict.json is a declared output (runner.py:258-263).

    python3 nodes/check-showcase/gate.py \
        --raw-wide W --raw-tall T --cut-report R --reconstruction DIR \
        --out-verdict V [--graded-wide W --graded-tall T]

The pure functions here are imported by nodes/check_showcase.py, the offline
Blender-free check. No bpy, no GPU, no network.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import emit_report, sha256_file  # noqa: E402

RAW_SIZES = {"wide": (3840, 2160), "tall": (2160, 3840)}
# C4(c): a transparent enclave this size or larger is a hole, not antialiasing.
# The golden stills measured <= 1 px enclaves (plan.md C4; decisions/log.md 2026-09-25).
MIN_ENCLOSED_PX = 16


def wholly_in_frame(img: Image.Image) -> tuple[bool, str]:
    """C4(a): every non-transparent pixel strictly inside the frame.

    Strictly inside means no alpha > 0 pixel sits on the outermost row or
    column, so the island can never run off the edge of the still.
    """
    w, h = img.size
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        return False, "no non-transparent pixels at all"
    left, top, right, bottom = bbox
    ok = left >= 1 and top >= 1 and right <= w - 1 and bottom <= h - 1
    return ok, (
        f"alpha bbox ({left},{top})-({right - 1},{bottom - 1}) in {w}x{h}; "
        f"margins l={left} t={top} r={w - right} b={h - bottom}"
    )


def right_third(img: Image.Image) -> tuple[bool, str]:
    """C4(b): the alpha-mask centroid x lands in [2W/3, W].

    Centroid is pixel mass, not occupancy: alpha is binarized to {0, 255}, then
    count[x] is the number of opaque pixels in column x and
    centroid_x = sum(x*count[x]) / sum(count[x]). Pillow's getprojection() cannot
    be used here: both 10.x and 12.x return binary occupancy (1 if a column has
    any opaque pixel), so a 1-px tail would weigh the same as a whole island.
    """
    w = img.size[0]
    mask = img.getchannel("A").point(lambda v: 255 if v else 0)
    data = mask.tobytes()
    counts = [data[x::w].count(255) for x in range(w)]
    total = sum(counts)
    if total == 0:
        return False, "alpha is empty; centroid undefined"
    centroid_x = sum(x * count for x, count in enumerate(counts)) / total
    ok = centroid_x >= 2 * w / 3
    return ok, (
        f"alpha centroid x={centroid_x:.1f}px ({centroid_x / w:.3f}W); "
        f"right third starts {2 * w / 3:.1f}px"
    )


def top_hole_free(img: Image.Image) -> tuple[bool, str]:
    """C4(c): no enclosed transparent region of MIN_ENCLOSED_PX pixels or more.

    A transparent (alpha == 0) pixel is enclosed when 4-connected flood-fill
    from the frame border, through transparent pixels only, cannot reach it:
    sky above and around is border-reachable; a hole in the captured island is
    not. The criterion is per region -- the largest enclosed component is what
    clears the floor (plan.md C4; decisions/log.md 2026-09-25); the summed total
    is reported for context but many small antialiasing enclaves do not add up
    into a hole. The check is whole-frame -- the golden island sits in the lower half
    (alpha bbox top row 1085 >= midline 1080), so the plan's original upper-half
    bound was vacuous (decisions/log.md 2026-09-25). Enclaves below the floor
    are antialiasing: the golden stills measured <= 1 px each.

    Cost: any transparent pixel outside the alpha bbox is border-reachable,
    because the bbox is the tightest rectangle holding every opaque pixel, so
    the fill is confined to the bbox: a transparent component is enclosed
    exactly when it never touches the bbox perimeter.
    """
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return True, "no opaque pixels; no transparent region can be enclosed"
    left, top, right, bottom = bbox
    bw, bh = right - left, bottom - top
    sub = alpha.crop(bbox).tobytes()
    seen = bytearray(bw * bh)
    enclosed = 0
    largest = 0
    regions = 0
    first = None

    for start in range(bw * bh):
        if sub[start] or seen[start]:
            continue
        seen[start] = 1
        stack = [start]
        size = 0
        border_connected = False
        while stack:
            i = stack.pop()
            size += 1
            x = i % bw
            if x == 0 or x == bw - 1 or i < bw or i >= bw * (bh - 1):
                border_connected = True
            if x and sub[i - 1] == 0 and not seen[i - 1]:
                seen[i - 1] = 1
                stack.append(i - 1)
            if x < bw - 1 and sub[i + 1] == 0 and not seen[i + 1]:
                seen[i + 1] = 1
                stack.append(i + 1)
            if i >= bw and sub[i - bw] == 0 and not seen[i - bw]:
                seen[i - bw] = 1
                stack.append(i - bw)
            if i + bw < bw * bh and sub[i + bw] == 0 and not seen[i + bw]:
                seen[i + bw] = 1
                stack.append(i + bw)
        if not border_connected:
            enclosed += size
            regions += 1
            largest = max(largest, size)
            if first is None:
                first = (left + start % bw, top + start // bw)

    detail = (
        f"{enclosed} transparent px enclosed in {regions} region(s), largest {largest} px; "
        f"floor {MIN_ENCLOSED_PX} px"
    )
    if largest >= MIN_ENCLOSED_PX:  # per-region: the largest enclave is the hole
        return False, f"{detail}; fails at {first}"
    return True, detail


def hash_tree(directory: Path) -> dict[str, str]:
    """Every file under `directory`, recursive, as sorted relative path -> sha256."""
    directory = Path(directory)
    files = sorted(p for p in directory.rglob("*") if p.is_file())
    return {p.relative_to(directory).as_posix(): sha256_file(p) for p in files}


def inputs_byte_identical(reconstruction_dir: Path, report: dict) -> tuple[bool, str]:
    """C2: re-hash every Reconstruction file and compare to `input_hashes`.

    Any changed hash, extra file or missing file fails.
    """
    recorded = report.get("input_hashes")
    if not isinstance(recorded, dict):
        return False, "cut-report has no input_hashes mapping"
    actual = hash_tree(reconstruction_dir)
    diffs = []
    for rel in sorted(set(recorded) | set(actual)):
        if rel not in recorded:
            diffs.append(f"{rel} (not in report)")
        elif rel not in actual:
            diffs.append(f"{rel} (missing on disk)")
        elif recorded[rel] != actual[rel]:
            diffs.append(f"{rel} (hash differs)")
    if diffs:
        return False, f"{len(actual)} files re-hashed; {len(diffs)} disagree: " + ", ".join(diffs[:3])
    return True, f"{len(actual)} files re-hashed; all match the report"


def still_checks(label: str, path: Path, expected: tuple[int, int], want_alpha: bool) -> list[dict]:
    """Shape check, plus C4 measurements when the still is a raw RGBA frame."""
    path = Path(path)
    if not path.is_file():
        return [{"name": f"{label}: exists", "ok": False, "detail": str(path)}]
    want_mode = "RGBA" if want_alpha else "RGB"
    checks = []
    try:
        with Image.open(path) as img:
            img.load()
            checks.append({
                "name": f"{label}: {want_mode} {expected[0]}x{expected[1]}",
                "ok": img.mode == want_mode and img.size == expected,
                "detail": f"mode={img.mode} size={img.size[0]}x{img.size[1]} path={path}",
            })
            if want_alpha:
                if "A" not in img.getbands():
                    checks.append({"name": f"{label}: alpha present", "ok": False, "detail": f"mode={img.mode}"})
                    return checks
                for measure, prop in (
                    (wholly_in_frame, "island wholly in frame"),
                    (right_third, "alpha centroid in right third"),
                    (top_hole_free, "hole-free (no enclosed region >= 16 px)"),
                ):
                    ok, detail = measure(img)
                    checks.append({"name": f"{label}: {prop}", "ok": ok, "detail": detail})
    except Exception as exc:  # an unreadable still is a failed check, not a crash
        checks.append({"name": f"{label}: readable", "ok": False, "detail": f"{exc!r}"})
    return checks


def cut_report_checks(cut_report_path: Path, reconstruction_dir: Path) -> list[dict]:
    try:
        report = json.loads(Path(cut_report_path).read_text(encoding="utf-8"))
    except Exception as exc:
        return [{"name": "cut-report: readable", "ok": False, "detail": f"{exc!r}"}]
    if not isinstance(report, dict) or "input_hashes" not in report:
        return [{"name": "cut-report: has input_hashes", "ok": False, "detail": "missing input_hashes"}]
    ok, detail = inputs_byte_identical(Path(reconstruction_dir), report)
    return [{"name": "cut-report: reconstruction files byte-identical", "ok": ok, "detail": detail}]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Showcase gate: C4 framing on raw RGBA stills + C2 byte-identical re-hash.")
    ap.add_argument("--raw-wide", required=True, help="render Node's raw wide RGBA still (island alpha)")
    ap.add_argument("--raw-tall", required=True, help="render Node's raw tall RGBA still (island alpha)")
    ap.add_argument("--cut-report", required=True, help="M1 cut-report.json (C2)")
    ap.add_argument("--reconstruction", required=True, help="Reconstruction DIR the report hashed")
    ap.add_argument("--out-verdict", required=True, help="C7 verdict.json to write")
    ap.add_argument("--graded-wide", default=None, help="optional graded wide still sanity (opaque RGB)")
    ap.add_argument("--graded-tall", default=None, help="optional graded tall still sanity (opaque RGB)")
    args = ap.parse_args(argv)

    checks: list[dict] = []
    try:
        checks += still_checks("raw-wide", args.raw_wide, RAW_SIZES["wide"], want_alpha=True)
        checks += still_checks("raw-tall", args.raw_tall, RAW_SIZES["tall"], want_alpha=True)
        if args.graded_wide:
            checks += still_checks("graded-wide", args.graded_wide, RAW_SIZES["wide"], want_alpha=False)
        if args.graded_tall:
            checks += still_checks("graded-tall", args.graded_tall, RAW_SIZES["tall"], want_alpha=False)
        checks += cut_report_checks(args.cut_report, args.reconstruction)
    except Exception as exc:  # verdict is a declared output: write one no matter what
        checks.append({"name": "gate: internal error", "ok": False, "detail": repr(exc)})

    passed = all(c["ok"] for c in checks)
    emit_report(Path(args.out_verdict), {"pass": passed, "checks": checks})
    for c in checks:
        if not c["ok"]:
            print(f"[FAIL] {c['name']} -- {c['detail']}", file=sys.stderr)
    print(f"check-showcase: {'pass' if passed else 'FAIL'} ({sum(c['ok'] for c in checks)}/{len(checks)} checks); verdict {args.out_verdict}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
