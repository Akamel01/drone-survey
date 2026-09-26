#!/usr/bin/env python3
"""nodes/check_showcase.py -- offline check for the Showcase gate Node (ADR 0018).

No Blender, no GPU, no network. Imports the gate's pure functions (the
check_splat.py:47-49 pattern) and builds synthetic RGBA stills with known
answers in-process:

  - C4(a) wholly in frame: inside passes; touching left/bottom fails; empty fails.
  - C4(b) right third: centroid at 0.80W passes; at 0.15W fails; a left-heavy
    island with a thin 1-px right tail fails on pixel mass even though column
    occupancy lands in the right third (the M4 review's false-pass case).
  - C4(c) hole-free, whole frame: an island crossing the midline with no hole
    passes; a transparent bay open to the frame passes; an enclosed hole in the
    upper half, below the midline, or straddling it fails; a punched hole in an
    island wholly below the midline fails (the old H/2 early-return passed that
    vacuously); a 1-px antialias enclave passes, a 16-px enclave reaches the
    floor and fails. The floor is per region (plan.md C4; N1): many sub-16 px
    enclaves pass even when their total reaches the floor, e.g. 16 x 1 px and
    4 x 3 px = 12 px.
  - C2 byte-identical: an untouched Reconstruction re-hashes equal; a flipped
    byte, an extra file, and a missing file each fail.
  - The real gate CLI end-to-end on a synthetic pair: a healthy run exits 0 and
    writes a pass verdict; a clipped wide still (plus a wrong-size graded still)
    exits 1 and still writes a fail verdict.

    python3 nodes/check_showcase.py
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

NODES = Path(__file__).resolve().parent
GATE = NODES / "check-showcase" / "gate.py"
sys.path.insert(0, str(NODES))  # gate.py imports nodes/common.py the same way the other Nodes do
FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def load(module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = load("showcase_gate", GATE)


def fx(box=None, holes=(), w=100, h=100) -> Image.Image:
    """An RGBA still: transparent film, one opaque island box, transparent holes."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if box:
        draw.rectangle(box, fill=(210, 120, 60, 255))
    for hole in holes:
        draw.rectangle(hole, fill=(0, 0, 0, 0))
    return img


# --- C4(a) wholly in frame -----------------------------------------------------------------------

def check_frame():
    ok, detail = gate.wholly_in_frame(fx(box=[20, 20, 79, 79]))
    check("C4 frame: island strictly inside the frame passes", ok, detail)

    ok, detail = gate.wholly_in_frame(fx(box=[0, 20, 79, 79]))
    check("C4 frame: island touching the left edge fails", not ok, detail)

    ok, detail = gate.wholly_in_frame(fx(box=[20, 0, 79, 79]))
    check("C4 frame: island touching the top edge fails", not ok, detail)

    ok, detail = gate.wholly_in_frame(fx(box=[20, 20, 79, 99]))
    check("C4 frame: island touching the bottom edge fails", not ok, detail)

    ok, detail = gate.wholly_in_frame(fx(box=[20, 20, 99, 79]))
    check("C4 frame: island touching the right edge fails", not ok, detail)

    ok, detail = gate.wholly_in_frame(Image.new("RGBA", (100, 100), (0, 0, 0, 0)))
    check("C4 frame: an empty mask fails (nothing is in frame)", not ok, detail)


# --- C4(b) centre right third --------------------------------------------------------------------

def check_right_third():
    ok, detail = gate.right_third(fx(box=[70, 20, 90, 60]))
    check("C4 third: centroid at 0.80W passes", ok, detail)

    ok, detail = gate.right_third(fx(box=[5, 5, 25, 50]))
    check("C4 third: centroid at 0.15W fails", not ok, detail)

    ok, detail = gate.right_third(fx(box=[0, 20, 65, 60]))  # centroid 32.5px, just left of 2W/3
    check("C4 third: centroid just left of the right third fails", not ok, detail)

    # Pixel mass, not column occupancy: tall left-third block + 1-px right tail.
    # Occupancy mean is 0.684W (would pass); mass centroid is 0.131W (must fail).
    img = fx(box=[5, 0, 9, 99])
    ImageDraw.Draw(img).rectangle([50, 50, 99, 50], fill=(210, 120, 60, 255))
    ok, detail = gate.right_third(img)
    check("C4 third: left mass + thin right tail fails (mass, not occupancy)", not ok, detail)

    # Mirror: right-third block + 1-px left tail. Occupancy 0.306W (would fail);
    # mass centroid 0.859W (must pass).
    img = fx(box=[90, 0, 94, 99])
    ImageDraw.Draw(img).rectangle([0, 50, 49, 50], fill=(210, 120, 60, 255))
    ok, detail = gate.right_third(img)
    check("C4 third: right mass + thin left tail passes (mass, not occupancy)", ok, detail)

    ok, detail = gate.right_third(Image.new("RGBA", (100, 100), (0, 0, 0, 0)))
    check("C4 third: an empty mask fails (no centroid)", not ok, detail)


# --- C4(c) hole-free, whole frame ------------------------------------------------------------------

def check_top_hole_free():
    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79]))
    check("C4 hole: island crossing the midline with no hole passes", ok, detail)

    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[40, 0, 50, 30]]))
    check("C4 hole: transparent bay open to the frame passes (border-reachable)", ok, detail)

    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[40, 20, 50, 30]]))
    check("C4 hole: transparent hole enclosed in the upper half fails", not ok, detail)

    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[40, 60, 50, 70]]))
    check("C4 hole: enclosed hole below the midline fails (whole frame, no H/2 bound)", not ok, detail)

    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[40, 45, 50, 55]]))
    check("C4 hole: hole straddling the midline fails", not ok, detail)

    # Regression case: the island sits wholly below the midline, so the old
    # `bbox top >= H/2` early return passed this vacuously with the golden
    # framing. The punched hole must fail now.
    ok, detail = gate.top_hole_free(fx(box=[20, 60, 79, 90], holes=[[40, 65, 50, 75]]))
    check("C4 hole: hole punched in a wholly-lower-half island fails (old early-return case)", not ok, detail)

    # Calibration floor: the golden stills measured <= 1 px enclaves (antialiasing),
    # so 1 px passes; 16 px reaches the floor and fails.
    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[50, 50, 50, 50]]))
    check("C4 hole: 1-px antialias enclave passes (below floor 16 px)", ok, detail)

    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[48, 48, 52, 50]]))  # 5x3
    check("C4 hole: 15-px enclave passes (just below floor)", ok, detail)

    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79], holes=[[48, 48, 51, 51]]))
    check("C4 hole: 16-px enclave fails (floor boundary)", not ok, detail)

    # Per-region semantics (plan.md C4, N1): the floor is on the largest region,
    # not the sum. Four 1x3 holes = 12 px total, largest 3 px -> pass.
    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79],
                                       holes=[[35, 30, 35, 32], [45, 30, 45, 32],
                                              [55, 30, 55, 32], [65, 30, 65, 32]]))
    check("C4 hole: four 3-px enclaves (12 px total, largest 3) pass", ok, detail)

    # The N1 divergence itself: 16 isolated 1-px enclaves sum to the floor but no
    # region reaches it -> pass (the old total-based criterion failed this).
    ok, detail = gate.top_hole_free(fx(box=[20, 10, 79, 79],
                                       holes=[[x, y, x, y] for y in (30, 38, 46, 54)
                                              for x in (30, 38, 46, 54)]))
    check("C4 hole: 16 x 1-px enclaves (16 px total, largest 1) pass", ok, detail)


# --- C2 byte-identical re-hash -------------------------------------------------------------------

def check_hashes():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "reconstruction"
        (root / "textures").mkdir(parents=True)
        (root / "odm_textured_model_geo.obj").write_bytes(b"v 1 2 3\nf 1 1 1\n")
        (root / "odm_textured_model_geo.mtl").write_text("newmtl a\n")
        (root / "textures" / "1.png").write_bytes(b"\x89PNG\r\n\x1a\nfake")
        report = {"input_hashes": gate.hash_tree(root)}
        check("C2 hash: hash_tree finds every file under the DIR recursively",
              sorted(report["input_hashes"]) == ["odm_textured_model_geo.mtl", "odm_textured_model_geo.obj", "textures/1.png"],
              json.dumps(sorted(report["input_hashes"])))

        ok, detail = gate.inputs_byte_identical(root, report)
        check("C2 hash: an untouched Reconstruction re-hashes identical", ok, detail)

        flipped = root / "textures" / "1.png"
        blob = bytearray(flipped.read_bytes())
        blob[0] ^= 0x01
        flipped.write_bytes(bytes(blob))
        ok, detail = gate.inputs_byte_identical(root, report)
        check("C2 hash: one flipped byte fails the re-hash", not ok, detail)

        (root / "sneaked-in.txt").write_text("extra file\n")
        ok, detail = gate.inputs_byte_identical(root, report)
        check("C2 hash: an extra file fails the re-hash", not ok, detail)

        (root / "sneaked-in.txt").unlink()
        (root / "textures" / "1.png").unlink()
        ok, detail = gate.inputs_byte_identical(root, report)
        check("C2 hash: a missing file fails the re-hash", not ok, detail)


# --- the gate CLI, end to end --------------------------------------------------------------------

def write_still(path: Path, size: tuple[int, int], box, holes=(), mode: str = "RGBA") -> None:
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if box:
        draw.rectangle(box, fill=(190, 115, 60, 255))
    for hole in holes:
        draw.rectangle(hole, fill=(0, 0, 0, 0))
    if mode == "RGB":
        img = img.convert("RGB")
    img.save(path)


def run_gate(tmp: Path, wide, tall, graded_wide=None, graded_tall=None) -> subprocess.CompletedProcess:
    recon = tmp / "reconstruction"
    (recon / "textures").mkdir(parents=True, exist_ok=True)
    (recon / "island.obj").write_text("v 0 0 0\n")
    (recon / "textures" / "1.png").write_bytes(b"\x89PNG\r\n\x1a\nfake")
    cut_report = tmp / "cut-report.json"
    cut_report.write_text(json.dumps({"input_hashes": gate.hash_tree(recon)}))
    argv = [sys.executable, str(GATE), "--raw-wide", str(wide), "--raw-tall", str(tall),
            "--cut-report", str(cut_report), "--reconstruction", str(recon),
            "--out-verdict", str(tmp / "verdict.json")]
    if graded_wide:
        argv += ["--graded-wide", str(graded_wide)]
    if graded_tall:
        argv += ["--graded-tall", str(graded_tall)]
    return subprocess.run(argv, capture_output=True, text=True)


def check_gate_cli():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        wide, tall = tmp / "raw-wide.png", tmp / "raw-tall.png"
        graded_wide, graded_tall = tmp / "still-wide.png", tmp / "still-tall.png"
        write_still(wide, gate.RAW_SIZES["wide"], (2500, 1250, 2950, 1800))
        write_still(tall, gate.RAW_SIZES["tall"], (1400, 2450, 1700, 3000))
        write_still(graded_wide, gate.RAW_SIZES["wide"], (2500, 1250, 2950, 1800), mode="RGB")
        write_still(graded_tall, gate.RAW_SIZES["tall"], (1400, 2450, 1700, 3000), mode="RGB")

        result = run_gate(tmp, wide, tall, graded_wide, graded_tall)
        check("gate CLI: healthy raw pair + graded pair + matching C2 exits 0", result.returncode == 0, result.stderr)
        verdict = json.loads((tmp / "verdict.json").read_text())
        check("gate CLI: pass verdict has pass=true and every check ok",
              verdict["pass"] is True and all(c["ok"] for c in verdict["checks"]),
              json.dumps(verdict)[:300])
        names = {c["name"] for c in verdict["checks"]}
        expected = {
            "raw-wide: island wholly in frame", "raw-wide: alpha centroid in right third",
            "raw-wide: hole-free (no enclosed region >= 16 px)",
            "raw-tall: island wholly in frame", "raw-tall: alpha centroid in right third",
            "raw-tall: hole-free (no enclosed region >= 16 px)",
            "graded-wide: RGB 3840x2160", "graded-tall: RGB 2160x3840",
            "cut-report: reconstruction files byte-identical",
        }
        check("gate CLI: pass verdict names every C4/C2 check", expected <= names,
              f"missing={sorted(expected - names)}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        wide, tall = tmp / "raw-wide.png", tmp / "raw-tall.png"
        write_still(wide, gate.RAW_SIZES["wide"], (0, 1250, 450, 1800))  # clipped at the left edge
        write_still(tall, gate.RAW_SIZES["tall"], (1400, 2450, 1700, 3000))
        graded_wide = tmp / "still-wide.png"
        write_still(graded_wide, (100, 100), (40, 40, 60, 60), mode="RGB")  # wrong size on purpose

        result = run_gate(tmp, wide, tall, graded_wide=graded_wide)
        check("gate CLI: clipped wide still exits 1", result.returncode == 1, f"rc={result.returncode}")
        verdict_path = tmp / "verdict.json"
        check("gate CLI: fail verdict is still written", verdict_path.is_file())
        verdict = json.loads(verdict_path.read_text())
        failed = {c["name"] for c in verdict["checks"] if not c["ok"]}
        check("gate CLI: fail verdict names the clipped frame", "raw-wide: island wholly in frame" in failed, json.dumps(sorted(failed)))
        check("gate CLI: wrong-size graded still is caught too", "graded-wide: RGB 3840x2160" in failed, json.dumps(sorted(failed)))


def main() -> None:
    check_frame()
    check_right_third()
    check_top_hole_free()
    check_hashes()
    check_gate_cli()

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall showcase gate checks passed")


if __name__ == "__main__":
    main()
