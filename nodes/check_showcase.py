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


# --- M6: seam (D5) + direction (D4) + counts/codecs/sizes (D6) -------------------------------

_GOLDENS_TMP = tempfile.TemporaryDirectory()
_GOLDENS = load("showcase_goldens", NODES.parent / "fixtures" / "showcase" / "generate_goldens.py")
_GOLDENS.generate(_GOLDENS_TMP.name)
FIXTURES = Path(_GOLDENS_TMP.name)


def check_seam():
    c = gate.seam_check("seam-wide", FIXTURES / "turn-3f")
    check("M6 seam: seam-closed turn-3f passes (closing 0 <= max consec)", c["ok"], c["detail"])

    c = gate.seam_check("seam-wide", FIXTURES / "dir-a")
    check("M6 seam: 2-frame pair passes (closing == consec)", c["ok"], c["detail"])

    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        # drifting bars [8,12,16]: each step overlaps, closing step does not
        for i, x in enumerate((8, 12, 16)):
            img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
            ImageDraw.Draw(img).rectangle([x, 0, x + 7, 31], fill=(255, 255, 255, 255))
            img.save(d / f"frame_{i:03d}.png")
        c = gate.seam_check("seam-wide", d)
        check("M6 seam: drifting (unclosed) sequence fails the wiring guard", not c["ok"], c["detail"])


def check_direction():
    sign, dx, detail = gate.direction_shift(FIXTURES / "dir-a")
    check("M6 direction: dir-a shifts +x (sign +1)", sign == 1, detail)
    sign, dx, detail = gate.direction_shift(FIXTURES / "dir-b")
    check("M6 direction: dir-b shifts -x (sign -1)", sign == -1, detail)

    c = gate.direction_check("dir", FIXTURES / "dir-a", FIXTURES / "dir-a")
    check("M6 direction: same pair twice agrees (pass)", c["ok"], c["detail"])
    c = gate.direction_check("dir", FIXTURES / "dir-a", FIXTURES / "dir-b")
    check("M6 direction: reversed-pair flip disagrees (fail)", not c["ok"], c["detail"])


def check_counts_codecs():
    check("M6 counts: gate defaults are 3888f/120fps/32.4s",
          (gate.EXPECT_FRAMES, gate.EXPECT_FPS, gate.EXPECT_DUR) == (3888, 120.0, 32.4),
          repr((gate.EXPECT_FRAMES, gate.EXPECT_FPS, gate.EXPECT_DUR)))
    import subprocess
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        md = tmp / "masters"
        md.mkdir()
        frames = tmp / "frames"
        frames.mkdir()
        n, fps = 30, 20
        for i in range(n):
            Image.new("RGB", (96, 64),
                      ((61 * i + 7) % 256, (37 * i + 13) % 256, (11 * i + 5) % 256)
                      ).save(frames / f"f{i:03d}.png")
        for suffix, enc in (("hevc", ("-c:v", "libx265", "-crf", "28", "-preset", "ultrafast",
                                          "-tag:v", "hvc1")),
                            ("av1", ("-c:v", "libsvtav1", "-preset", "8"))):
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                            "-i", str(frames / "f%03d.png"), *enc,
                            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                            str(md / f"wide-4k120-{suffix}.mp4")], check=True)
        (md / "wide-poster.jpg").write_bytes(b"fake-poster")
        (md / "wide-blur.jpg").write_bytes(b"fake-blur")
        dur = n / fps
        checks = gate.master_checks(md, expect_frames=n, expect_fps=float(fps),
                                    expect_dur=dur, dur_tol=0.2, expect_size=(96, 64))
        check("M6 counts: smoke masters pass with matching expects",
              all(c["ok"] for c in checks), json.dumps(checks))
        checks = gate.master_checks(md, expect_frames=n, expect_fps=25.0,
                                    expect_dur=dur, dur_tol=0.2, expect_size=(96, 64))
        check("M6 counts: wrong fps expect fails", any(not c["ok"] for c in checks),
              json.dumps(checks))
    with tempfile.TemporaryDirectory() as tmp:  # real 4K pixel assert, tiny count
        tmp = Path(tmp)
        fd, md = tmp / "f", tmp / "m"
        fd.mkdir()
        md.mkdir()
        for i in range(3):
            Image.new("RGB", (3840, 2160), (i * 40 + 10, 90, 140)).save(fd / f"f{i:03d}.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "20",
                        "-i", str(fd / "f%03d.png"),
                        "-c:v", "libx265", "-crf", "30", "-preset", "ultrafast",
                        "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart",
                        str(md / "wide-4k120-hevc.mp4")], check=True)
        (md / "wide-poster.jpg").write_bytes(b"p")
        (md / "wide-blur.jpg").write_bytes(b"b")
        checks = gate.master_checks(md, expect_frames=3, expect_fps=20.0,
                                    expect_dur=0.15, dur_tol=0.1)
        check("M6 counts: real 4K pixels pass the default (non-overridden) size rule",
              all(c["ok"] for c in checks), json.dumps(checks))


def check_sizes():
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "cut.mp4"
        p.write_bytes(b"x" * 1500)
        check("M6 size: 1500B within 2x of 1000B ref passes",
              gate.size_within(p, 1000, 2.0)[0])
        ok, detail = gate.size_within(p, 500, 2.0)
        check("M6 size: 1500B over 2x of 500B ref fails", not ok, detail)


def check_cuts():
    import subprocess
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "cuts_node", NODES / "cuts" / "cuts.py")
    cuts = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cuts)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        md, fd, cd = tmp / "masters", tmp / "frames", tmp / "cuts"
        md.mkdir()
        fd.mkdir()
        n, fps = 10, 20
        for i in range(n):
            Image.new("RGB", (96, 64),
                      ((61 * i + 7) % 256, (37 * i + 13) % 256, (11 * i + 5) % 256)
                      ).save(fd / f"f{i:03d}.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                        "-i", str(fd / "f%03d.png"),
                        "-c:v", "libx265", "-crf", "28", "-preset", "ultrafast",
                        "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart",
                        str(md / "wide-4k120-hevc.mp4")], check=True)
        out = cuts.run(md, cd, av1_encoder="libsvtav1",
                       av1_extra_1440=("-preset", "8"), av1_extra_4k=("-preset", "8"))
        assert set(out) == {"wide"} and "av1_4k60" in out["wide"]
        ref = {p.name: p.stat().st_size for cuts in out.values() for p in cuts.values()}
        checks = gate.cuts_checks(cd, md, 0.5, ref, 2.0)
        check("M6 cuts: real §6 set passes (codec/res/fps/duration exact, sizes <= 2x own ref)",
              all(c["ok"] for c in checks), json.dumps([c for c in checks if not c["ok"]]))
        tight = {k: v // 4 for k, v in ref.items()}
        checks = gate.cuts_checks(cd, md, 0.5, tight, 2.0)
        check("M6 cuts: quarter ref table fails the size bound",
              any(not c["ok"] and "size" in c["name"] for c in checks),
              json.dumps([c["name"] for c in checks if not c["ok"]])[:200])
        (cd / "wide-1440p60-av1.mp4").unlink()
        checks = gate.cuts_checks(cd, md, 0.5, ref, 2.0)
        check("M6 cuts: deleted cut fails presence",
              any(not c["ok"] and "present" in c["name"] for c in checks),
              json.dumps([c["name"] for c in checks if not c["ok"]])[:200])


def run_gate_new(tmp: Path, argv: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(GATE), *argv,
                           "--out-verdict", str(tmp / "verdict.json")],
                          capture_output=True, text=True)


def make_turn_pair(d: Path, x0: int, x1: int, w: int = 64, h: int = 32) -> None:
    """C4-clean 2-frame turn: right-third island, strictly in frame, +x shift."""
    d.mkdir(parents=True, exist_ok=True)
    for i, x in enumerate((x0, x1)):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(img).rectangle([x, 4, x + 15, h - 5], fill=(210, 120, 60, 255))
        img.save(d / f"frame_{i:03d}.png")


def check_gate_cli_new():
    import subprocess
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        md = tmp / "masters"
        md.mkdir()
        frames = tmp / "frames"
        frames.mkdir()
        n, fps = 30, 20
        for i in range(n):
            Image.new("RGB", (96, 64),
                      ((61 * i + 7) % 256, (37 * i + 13) % 256, (11 * i + 5) % 256)
                      ).save(frames / f"f{i:03d}.png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps),
                        "-i", str(frames / "f%03d.png"),
                        "-c:v", "libx265", "-crf", "28", "-preset", "ultrafast",
                        "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart",
                        str(md / "wide-4k120-hevc.mp4")], check=True)
        (md / "wide-poster.jpg").write_bytes(b"p")
        (md / "wide-blur.jpg").write_bytes(b"b")
        dur = n / fps
        make_turn_pair(tmp / "wide", 42, 44)  # centroid ~0.78W, dx +2
        make_turn_pair(tmp / "tall", 42, 44)
        argv = ["--frames-wide", str(tmp / "wide"),
                "--frames-tall", str(tmp / "tall"),
                "--masters-dir", str(md),
                "--expect-frames", str(n), "--expect-fps", str(float(fps)),
                "--expect-duration", str(dur), "--expect-size", "96x64"]
        result = run_gate_new(tmp, argv)
        check("M6 gate CLI: goldens + smoke master pass, one verdict, exit 0",
              result.returncode == 0, result.stderr[-500:] + result.stdout[-500:])
        verdict = json.loads((tmp / "verdict.json").read_text())
        names = [c["name"] for c in verdict["checks"]]
        check("M6 gate CLI: verdict carries seam + direction + master + frame-0 C4 checks",
              any("seam" in v for v in names) and any("direction" in v for v in names)
              and any("master" in v for v in names) and any("[0]" in v for v in names),
              json.dumps(names))

        argv_flip = ["--frames-wide", str(FIXTURES / "dir-a"),
                     "--frames-tall", str(FIXTURES / "dir-b"),
                     "--masters-dir", str(md),
                     "--expect-frames", str(n), "--expect-fps", str(float(fps)),
                     "--expect-duration", str(dur), "--expect-size", "96x64"]
        result = run_gate_new(tmp, argv_flip)
        check("M6 gate CLI: reversed-pair flip exits 1", result.returncode == 1,
              f"rc={result.returncode}")
        verdict = json.loads((tmp / "verdict.json").read_text())
        check("M6 gate CLI: flip verdict still written, pass=false",
              verdict["pass"] is False)

    with tempfile.TemporaryDirectory() as tmp:  # N2: C4 lives on frame-0 after cutover
        tmp = Path(tmp)
        d = tmp / "wide"
        d.mkdir()
        img = Image.new("RGBA", (64, 32), (0, 0, 0, 0))
        ImageDraw.Draw(img).rectangle([0, 4, 15, 27], fill=(210, 120, 60, 255))  # clipped left
        img.save(d / "frame_000.png")
        img.save(d / "frame_001.png")
        checks = gate.dir_frame0_checks("frames-wide", d)
        failed = {c["name"] for c in checks if not c["ok"]}
        check("M6 N2: clipped frame-0 fails under the frames-wide[0] label",
              "frames-wide[0]: island wholly in frame" in failed, json.dumps(sorted(failed)))


def main() -> None:
    check_frame()
    check_right_third()
    check_top_hole_free()
    check_hashes()
    check_gate_cli()
    check_seam()
    check_direction()
    check_counts_codecs()
    check_sizes()
    check_cuts()
    check_gate_cli_new()

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall showcase gate checks passed")


if __name__ == "__main__":
    main()
