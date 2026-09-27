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

M6 adds, same verdict: seam + direction on frame dirs, counts/codecs on
masters + §6 cuts (D4/D5/D6; thresholds are CLI flags, #194 owns calibration):

    python3 nodes/check-showcase/gate.py \
        --frames-wide FW --frames-tall FT \
        --masters-dir M --cuts-dir C \
        [--raw-wide W --raw-tall T --cut-report R --reconstruction DIR \
         --graded-wide W --graded-tall T] \
        [--expect-frames N --expect-fps F --expect-duration S --duration-tol T \
         --min-dx P --ref-sizes J --size-bound B] \
        --out-verdict V

  - seam (D5, wiring guard not quality evidence, #194 owns quality):
    `meanabsdiff(last->first) <= max(consecutive)` on luma per frame dir.
  - direction (D4, method hero-pipeline.md:280-296): sign of the island-mask
    centroid shift from frame 0 to frame 1 (alpha mask when the frame carries
    one, else luma-weighted centroid); wide vs tall agree. Column-profile
    shift, deterministic, stdlib+Pillow only.
  - masters: every `*-4k120-{hevc,av1}.mp4` is exact 4K pixels, codec matches
    its suffix, frames/fps/duration equal the expects.
  - cuts: the §6 set per M5 stem (1440p/60 AV1+HEVC, 1080p/30 H.264, wide-only
    4K/60 AV1, 1440p poster) present with exact codec/res/fps and duration
    within tol of its master; sizes bounded only when a `--ref-sizes` table is
    given (D6 bound uncalibrated until #194).

C4/C2-stills disposition (critic N2): `--raw-wide/--raw-tall` stay supported;
after the M7 stills→dirs cutover the same C4 measures run on frame-0 of each
frame dir (labels `frames-wide[0]` / `frames-tall[0]`); C2 stays on the
cut-report input_hashes (the Reconstruction is untouched by the cutover).
Graded-still sanity stays optional.

The pure functions here are imported by nodes/check_showcase.py, the offline
Blender-free check. No bpy, no GPU, no network.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import emit_report, sha256_file  # noqa: E402

RAW_SIZES = {"wide": (3840, 2160), "tall": (2160, 3840)}
# Product defaults (M4: 243f x16 + seam close = 3888f @120fps = 32.4s).
# Defaults, not calibration: every one is a CLI flag; #194 owns the numbers.
EXPECT_FRAMES = 3888
EXPECT_FPS = 120.0
EXPECT_DUR = 32.4
DURATION_TOL = 0.5
MIN_DX = 0.0
SIZE_BOUND = 2.0
FOUR_K_PX = 3840 * 2160
MASTER_SUFFIX = "-4k120-hevc.mp4"
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


def _alpha_centroid_x(img: Image.Image) -> float | None:
    """Binarized-alpha column-mass centroid x, or None when alpha is empty."""
    w = img.size[0]
    mask = img.getchannel("A").point(lambda v: 255 if v else 0)
    data = mask.tobytes()
    counts = [data[x::w].count(255) for x in range(w)]
    total = sum(counts)
    if total == 0:
        return None
    return sum(x * count for x, count in enumerate(counts)) / total


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


def right_third(img: Image.Image) -> tuple[bool, str]:
    """C4(b): the alpha-mask centroid x lands in [2W/3, W].

    Centroid is pixel mass, not occupancy: alpha is binarized to {0, 255}, then
    count[x] is the number of opaque pixels in column x and
    centroid_x = sum(x*count[x]) / sum(count[x]). Pillow's getprojection() cannot
    be used here: both 10.x and 12.x return binary occupancy (1 if a column has
    any opaque pixel), so a 1-px tail would weigh the same as a whole island.
    """
    w = img.size[0]
    centroid_x = _alpha_centroid_x(img)
    if centroid_x is None:
        return False, "alpha is empty; centroid undefined"
    ok = centroid_x >= 2 * w / 3
    return ok, (
        f"alpha centroid x={centroid_x:.1f}px ({centroid_x / w:.3f}W); "
        f"right third starts {2 * w / 3:.1f}px"
    )


def list_frames(frames_dir: Path) -> list[Path]:
    """Sorted PNGs of a frame dir (render/grade frame-dir convention)."""
    return sorted(Path(frames_dir).glob("*.png"))


def frame_luma(path: Path) -> bytes:
    with Image.open(path) as img:
        return img.convert("L").tobytes()


def mean_abs_diff(a: bytes, b: bytes) -> float:
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)


def seam_check(label: str, frames_dir: Path) -> dict:
    """D5 wiring guard: meanabsdiff(last->first) <= max(consecutive), on luma.

    Not quality evidence: first==last render makes a healthy seam exactly 0;
    this only catches a miswired (unclosed, dropped-frame) sequence (#194).
    """
    files = list_frames(frames_dir)
    if len(files) < 2:
        return {"name": f"{label}: seam closed", "ok": False,
                "detail": f"need >= 2 frames in {frames_dir}, found {len(files)}"}
    lumas = [frame_luma(p) for p in files]
    consec = [mean_abs_diff(lumas[i], lumas[i + 1]) for i in range(len(lumas) - 1)]
    closing = mean_abs_diff(lumas[-1], lumas[0])
    ok = closing <= max(consec)
    return {"name": f"{label}: seam closed (wiring guard)", "ok": ok,
            "detail": f"n={len(files)} closing={closing:.1f} consec-max={max(consec):.1f}"}


def _mask_centroid_x(path: Path) -> tuple[float | None, str]:
    """Island centroid x: binarized alpha when the frame carries one, else luma mass."""
    with Image.open(path) as img:
        img.load()
        if "A" in img.getbands() and 0 in img.getchannel("A").tobytes():
            cx = _alpha_centroid_x(img)
            if cx is not None:
                return cx, "alpha"
        grey = img.convert("L")
        data = grey.tobytes()
        total = sum(data)
        if total == 0:
            return None, "empty"
        w = grey.size[0]
        return sum((i % w) * v for i, v in enumerate(data)) / total, "luma"


def direction_shift(frames_dir: Path) -> tuple[int, float, str]:
    """D4: sign of the island centroid shift from frame 0 to frame 1.

    Column-profile shift over the first pair: with one shared angle array both
    framings start the same way, so their signs must agree. A full turn sums
    to ~0, which is why only the first pair is measured.
    """
    files = list_frames(frames_dir)
    if len(files) < 2:
        return 0, 0.0, f"need >= 2 frames in {frames_dir}, found {len(files)}"
    c0, via0 = _mask_centroid_x(files[0])
    c1, via1 = _mask_centroid_x(files[1])
    if c0 is None or c1 is None:
        return 0, 0.0, "empty mask; no measurable shift"
    dx = c1 - c0
    sign = 1 if dx > 0 else (-1 if dx < 0 else 0)
    return sign, dx, f"dx={dx:+.1f}px sign={sign:+d} via={via0}/{via1} n={len(files)}"


def direction_check(label: str, wide_dir: Path, tall_dir: Path, min_dx: float = MIN_DX) -> dict:
    """D4: wide and tall start the same way, with a measurable shift."""
    sw, dxw, dw = direction_shift(Path(wide_dir))
    st, dxt, dt = direction_shift(Path(tall_dir))
    ok = sw == st != 0 and min(abs(dxw), abs(dxt)) >= min_dx
    return {"name": f"{label}: wide+tall turn the same way", "ok": ok,
            "detail": f"wide[{dw}] tall[{dt}] min-dx floor {min_dx} (#194 owns)"}


def dir_frame0_checks(label: str, frames_dir: Path) -> list[dict]:
    """N2 cutover: the C4 measures on frame-0 of a frame dir (no size assert)."""
    files = list_frames(frames_dir)
    if not files:
        return [{"name": f"{label}[0]: exists", "ok": False, "detail": str(frames_dir)}]
    try:
        with Image.open(files[0]) as img:
            img.load()
            if "A" not in img.getbands():
                return [{"name": f"{label}[0]: alpha present", "ok": False,
                         "detail": f"mode={img.mode} {files[0]}"}]
            out = []
            for measure, prop in (
                (wholly_in_frame, "island wholly in frame"),
                (right_third, "alpha centroid in right third"),
                (top_hole_free, "hole-free (no enclosed region >= 16 px)"),
            ):
                ok, detail = measure(img)
                out.append({"name": f"{label}[0]: {prop}", "ok": ok, "detail": detail})
            return out
    except Exception as exc:
        return [{"name": f"{label}[0]: readable", "ok": False, "detail": f"{exc!r}"}]


def ffprobe_meta(path: Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                          "-show_entries", "stream=nb_frames,avg_frame_rate,codec_name,"
                          "width,height,duration",
                          "-of", "default=noprint_wrappers=1", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return dict(l.split("=", 1) for l in out.split() if "=" in l)


def frame_count(path: Path, meta: dict) -> int:
    if meta.get("nb_frames") not in (None, "N/A"):
        return int(meta["nb_frames"])
    return int(subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
         "-show_entries", "stream=nb_read_frames",
         "-of", "default=noprint_wrappers=1", str(path)],
        capture_output=True, text=True, check=True).stdout.split("=")[1])


def _fps(meta: dict) -> float:
    num, _, den = meta.get("avg_frame_rate", "0/1").partition("/")
    return float(num) / float(den or 1)


def _duration(path: Path, meta: dict, frames: int, fps: float) -> float:
    if meta.get("duration") not in (None, "N/A"):
        return float(meta["duration"])
    return frames / fps


def master_checks(masters_dir: Path, expect_frames: int = EXPECT_FRAMES,
                  expect_fps: float = EXPECT_FPS, expect_dur: float = EXPECT_DUR,
                  dur_tol: float = DURATION_TOL,
                  expect_size: tuple[int, int] | None = None) -> list[dict]:
    """Counts/codecs on M4 masters: codec matches suffix, frames/fps/dur exact.

    Resolution asserts exact 4K pixels unless expect_size overrides (smoke only).
    """
    masters_dir = Path(masters_dir)
    files = sorted(masters_dir.glob("*-4k120-hevc.mp4")) + sorted(masters_dir.glob("*-4k120-av1.mp4"))
    if not files:
        return [{"name": "masters: present", "ok": False, "detail": str(masters_dir)}]
    checks = []
    stems: set[str] = set()
    for path in files:
        want_codec = "hevc" if path.name.endswith("-4k120-hevc.mp4") else "av1"
        stem = path.name[: -len("-4k120-hevc.mp4")] if want_codec == "hevc" else path.name[: -len("-4k120-av1.mp4")]
        stems.add(stem)
        try:
            meta = ffprobe_meta(path)
            n = frame_count(path, meta)
            fps = _fps(meta)
            dur = _duration(path, meta, n, fps or expect_fps)
            mw, mh = int(meta.get("width", 0)), int(meta.get("height", 0))
            want_px = expect_size[0] * expect_size[1] if expect_size else FOUR_K_PX
            problems = []
            if meta.get("codec_name") != want_codec:
                problems.append(f"codec {meta.get('codec_name')} != {want_codec}")
            if mw * mh != want_px:
                problems.append(f"{mw}x{mh} != {expect_size or '4K'}")
            if n != expect_frames:
                problems.append(f"{n}f != {expect_frames}f")
            if fps != expect_fps:
                problems.append(f"{fps}fps != {expect_fps}fps")
            if abs(dur - expect_dur) > dur_tol:
                problems.append(f"{dur:.2f}s != {expect_dur}s (tol {dur_tol})")
            checks.append({"name": f"master: {path.name} {expect_frames}f/{expect_fps:g}fps/{expect_dur}s {want_codec} 4K",
                           "ok": not problems,
                           "detail": "; ".join(problems) if problems else
                           f"{meta.get('codec_name')} {meta.get('width')}x{meta.get('height')} {n}f {fps:g}fps {dur:.2f}s"})
        except Exception as exc:
            checks.append({"name": f"master: {path.name} readable", "ok": False, "detail": f"{exc!r}"})
    for stem in sorted(stems):
        missing = [n for n in (f"{stem}-poster.jpg", f"{stem}-blur.jpg")
                   if not (masters_dir / n).is_file()]
        checks.append({"name": f"master: {stem} poster+blur present",
                       "ok": not missing, "detail": "missing " + ", ".join(missing) if missing else "ok"})
    return checks


def size_within(path: Path, ref_bytes: float, bound: float = SIZE_BOUND) -> tuple[bool, str]:
    size = Path(path).stat().st_size
    ok = size <= ref_bytes * bound
    return ok, f"{size}B vs ref {ref_bytes:.0f}B x{bound} (ceil {ref_bytes * bound:.0f}B)"


def cuts_checks(cuts_dir: Path, masters_dir: Path, dur_tol: float = DURATION_TOL,
                ref_sizes: dict | None = None, size_bound: float = SIZE_BOUND) -> list[dict]:
    """§6 set per M5 stem: presence + exact codec/res/fps, duration within tol of master."""
    cuts_dir, masters_dir = Path(cuts_dir), Path(masters_dir)
    masters = sorted(masters_dir.glob(f"*{MASTER_SUFFIX}"))
    if not masters:
        return [{"name": "cuts: masters present", "ok": False, "detail": str(masters_dir)}]
    checks = []
    for master in masters:
        stem = master.name[: -len(MASTER_SUFFIX)]
        try:
            mm = ffprobe_meta(master)
            mw, mh = int(mm["width"]), int(mm["height"])
            dur_m = _duration(master, mm, frame_count(master, mm), _fps(mm) or EXPECT_FPS)
        except Exception as exc:
            checks.append({"name": f"cuts: {stem} master readable", "ok": False, "detail": f"{exc!r}"})
            continue
        W, H = (2560, 1440) if mw > mh else (1440, 2560)  # cuts.run framing rule
        expect = {f"{stem}-1440p60-av1.mp4": ("av1", W, H, 60.0),
                  f"{stem}-1440p60-hevc.mp4": ("hevc", W, H, 60.0),
                  f"{stem}-1080p30-h264.mp4": ("h264", W * 3 // 4, H * 3 // 4, 30.0)}
        if W > H:  # cuts.sh:14, wide screens only
            expect[f"{stem}-4k60-av1.mp4"] = ("av1", mw, mh, 60.0)
        for fname, (codec, ew, eh, efps) in expect.items():
            p = cuts_dir / fname
            if not p.is_file():
                checks.append({"name": f"cuts: {fname} present", "ok": False, "detail": str(p)})
                continue
            try:
                meta = ffprobe_meta(p)
                n = frame_count(p, meta)
                fps = _fps(meta)
                dur = _duration(p, meta, n, fps or efps)
                problems = []
                if meta.get("codec_name") != codec:
                    problems.append(f"codec {meta.get('codec_name')} != {codec}")
                if (meta.get("width"), meta.get("height")) != (str(ew), str(eh)):
                    problems.append(f"{meta.get('width')}x{meta.get('height')} != {ew}x{eh}")
                if fps != efps:
                    problems.append(f"{fps}fps != {efps:g}fps")
                if abs(dur - dur_m) > dur_tol:
                    problems.append(f"{dur:.2f}s vs master {dur_m:.2f}s (tol {dur_tol})")
                checks.append({"name": f"cuts: {fname} {codec} {ew}x{eh} {efps:g}fps",
                               "ok": not problems,
                               "detail": "; ".join(problems) if problems else
                               f"{n}f {dur:.2f}s matches master {dur_m:.2f}s"})
                if ref_sizes is not None and fname in ref_sizes:
                    ok, detail = size_within(p, float(ref_sizes[fname]), size_bound)
                    checks.append({"name": f"cuts: {fname} size <= {size_bound}x ref",
                                   "ok": ok, "detail": detail})
            except Exception as exc:
                checks.append({"name": f"cuts: {fname} readable", "ok": False, "detail": f"{exc!r}"})
        poster = cuts_dir / f"{stem}-poster-1440.jpg"
        if not poster.is_file():
            checks.append({"name": f"cuts: {poster.name} present", "ok": False, "detail": str(poster)})
        else:
            try:
                pw = ffprobe_meta(poster).get("width")
                checks.append({"name": f"cuts: {poster.name} width {W}", "ok": pw == str(W),
                               "detail": f"width={pw}"})
            except Exception as exc:
                checks.append({"name": f"cuts: {poster.name} readable", "ok": False, "detail": f"{exc!r}"})
    if ref_sizes is None:
        checks.append({"name": "cuts: sizes bounded", "ok": True,
                       "detail": "no ref table; bound uncalibrated, #194 owns D6"})
    return checks


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
    ap = argparse.ArgumentParser(description="Showcase gate: C4 framing + C2 re-hash + M6 seam/direction/counts.")
    ap.add_argument("--raw-wide", default=None, help="render Node's raw wide RGBA still (island alpha)")
    ap.add_argument("--raw-tall", default=None, help="render Node's raw tall RGBA still (island alpha)")
    ap.add_argument("--cut-report", default=None, help="M1 cut-report.json (C2)")
    ap.add_argument("--reconstruction", default=None, help="Reconstruction DIR the report hashed")
    ap.add_argument("--out-verdict", required=True, help="C7 verdict.json to write")
    ap.add_argument("--graded-wide", default=None, help="optional graded wide still sanity (opaque RGB)")
    ap.add_argument("--graded-tall", default=None, help="optional graded tall still sanity (opaque RGB)")
    ap.add_argument("--frames-wide", default=None, help="wide frame dir (seam + direction + frame-0 C4)")
    ap.add_argument("--frames-tall", default=None, help="tall frame dir (seam + direction + frame-0 C4)")
    ap.add_argument("--masters-dir", default=None, help="M4 masters dir (*-4k120-{hevc,av1}.mp4)")
    ap.add_argument("--cuts-dir", default=None, help="M5 §6 cuts dir")
    ap.add_argument("--expect-frames", type=int, default=EXPECT_FRAMES)
    ap.add_argument("--expect-fps", type=float, default=EXPECT_FPS)
    ap.add_argument("--expect-duration", type=float, default=EXPECT_DUR)
    ap.add_argument("--expect-size", default=None, help="WxH override for smoke (default: exact 4K)")
    ap.add_argument("--duration-tol", type=float, default=DURATION_TOL)
    ap.add_argument("--min-dx", type=float, default=MIN_DX,
                    help="weak-signal floor in px; #194 owns")
    ap.add_argument("--ref-sizes", default=None, help="JSON {basename: bytes} for the D6 bound")
    ap.add_argument("--size-bound", type=float, default=SIZE_BOUND,
                    help="size <= ref x bound; #194 owns")
    args = ap.parse_args(argv)

    checks: list[dict] = []
    try:
        if args.raw_wide:
            checks += still_checks("raw-wide", args.raw_wide, RAW_SIZES["wide"], want_alpha=True)
        if args.raw_tall:
            checks += still_checks("raw-tall", args.raw_tall, RAW_SIZES["tall"], want_alpha=True)
        if args.graded_wide:
            checks += still_checks("graded-wide", args.graded_wide, RAW_SIZES["wide"], want_alpha=False)
        if args.graded_tall:
            checks += still_checks("graded-tall", args.graded_tall, RAW_SIZES["tall"], want_alpha=False)
        if args.frames_wide:
            checks.append(seam_check("seam-wide", args.frames_wide))
            checks += dir_frame0_checks("frames-wide", args.frames_wide)
        if args.frames_tall:
            checks.append(seam_check("seam-tall", args.frames_tall))
            checks += dir_frame0_checks("frames-tall", args.frames_tall)
        if args.frames_wide and args.frames_tall:
            checks.append(direction_check("direction", args.frames_wide, args.frames_tall, args.min_dx))
        if args.masters_dir:
            size = tuple(int(v) for v in args.expect_size.split("x")) if args.expect_size else None
            checks += master_checks(args.masters_dir, args.expect_frames, args.expect_fps,
                                    args.expect_duration, args.duration_tol, size)
        if args.cuts_dir:
            if not args.masters_dir:
                checks.append({"name": "cuts: masters present", "ok": False,
                               "detail": "cuts need --masters-dir for the duration reference"})
            else:
                ref = json.loads(Path(args.ref_sizes).read_text()) if args.ref_sizes else None
                checks += cuts_checks(args.cuts_dir, args.masters_dir, args.duration_tol,
                                      ref, args.size_bound)
        if args.cut_report:
            if not args.reconstruction:
                checks.append({"name": "cut-report: reconstruction files byte-identical", "ok": False,
                               "detail": "cut-report needs --reconstruction"})
            else:
                checks += cut_report_checks(args.cut_report, args.reconstruction)
        if not checks:
            checks.append({"name": "gate: no inputs", "ok": False,
                           "detail": "pass at least one of --raw-*/--frames-*/--masters-dir/--cuts-dir/--cut-report"})
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
