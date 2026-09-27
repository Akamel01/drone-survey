"""Showcase grade Node: the hero's dreamy grade, ported verbatim.

`scripts/hero/grade.py:5-22` (haze, glow, lift) is copied expression-for-expression;
only the hero's sheet-building tail is dropped and file plumbing added. Pillow
only — no Blender, no GPU, no network. The Node takes image paths only: it cannot
name a Reconstruction or an island dir, grading never alters the Reconstruction.
"""
import argparse
import ast
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

HAZE, GLOW, LIFT = 0.09, 0.2, 0.04
sky_path = None


def grade(isl):
    sky = Image.open(sky_path).convert("RGB").resize(isl.size, Image.LANCZOS)
    # Aerial perspective: the island takes on the sky behind it, more towards its base.
    haze_col = sky.filter(ImageFilter.GaussianBlur(40))
    grad = Image.linear_gradient("L").resize(isl.size)                   # 0 top, 255 bottom
    amount = grad.point(lambda v: int(255 * (HAZE * 0.6 + HAZE * 0.9 * v / 255)))
    rgb = isl.convert("RGB")
    hazed = Image.composite(haze_col, rgb, amount)
    out = sky.copy()
    out.paste(hazed, (0, 0), isl.getchannel("A"))
    # Soft glow from the bright parts, like the diffusion of a cinema lens.
    bright = out.point(lambda v: max(0, v - 150) * 2).filter(ImageFilter.GaussianBlur(18))
    out = ImageChops.add(out, bright.point(lambda v: int(v * GLOW)))
    # Lifted, blue-grey shadows.
    tone = Image.new("RGB", out.size, (74, 98, 116))
    return Image.blend(out, tone, LIFT)


def run(in_wide, in_tall, sky, out_wide, out_tall):
    global sky_path
    sky_path = sky
    for src, dst in ((in_wide, out_wide), (in_tall, out_tall)):
        grade(Image.open(src).convert("RGBA")).save(dst)


N_FRAMES = 243  # files per framing dir; mirrors nodes/render/render_island.py (M2)


def grade_frames(frames_dir, sky, out_dir, n=N_FRAMES):
    """Grade a frame dir: frame_{i:03d}.png in, same names out (M3, D2).

    One shared grade() does every frame, so the turn look cannot fork from
    the stills look (#192 wiring stays valid). Grading is deterministic, so
    M2's first==last input copy grades to first==last output with no
    special-casing. Missing input raises; output count always equals n.
    """
    global sky_path
    sky_path = sky
    os.makedirs(out_dir, exist_ok=True)
    for i in range(n):
        name = f"frame_{i:03d}.png"
        grade(Image.open(os.path.join(frames_dir, name)).convert("RGBA")).save(
            os.path.join(out_dir, name))
    return n


def _synth_rgba(w, h, seed):
    img = Image.new("RGBA", (w, h))
    px = img.load()
    r = min(w, h) // 2 - 4
    for y in range(h):
        for x in range(w):
            dx, dy = x - w // 2, y - h // 2
            a = min(255, (3 * x + 2 * y + seed) % 300) if dx * dx + dy * dy < r * r else 0
            px[x, y] = ((7 * x + seed) % 256, (5 * y + 3 * seed) % 256, (x * y + seed) % 256, a)
    return img


def _synth_sky(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (60 + 120 * y // h, 90 + 100 * y // h, 140 + 80 * y // h)
    return img


def _hero_grade():
    """The hero's `grade()` extracted live from scripts/hero/grade.py; its sheet tail never runs."""
    src = (Path(__file__).resolve().parents[2] / "scripts/hero/grade.py").read_text()
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "grade")
    ns = {"Image": Image, "ImageChops": ImageChops, "ImageFilter": ImageFilter,
          "HAZE": HAZE, "GLOW": GLOW, "LIFT": LIFT, "sky_path": sky_path}
    exec(compile(ast.get_source_segment(src, fn), "scripts/hero/grade.py", "exec"), ns)
    return ns["grade"]


def selftest():
    global sky_path
    hero_src = Path(__file__).resolve().parents[2] / "scripts/hero/grade.py"
    assert hero_src.is_file(), f"hero original missing: {hero_src}"
    with tempfile.TemporaryDirectory(prefix="grade-selftest-") as td:
        td = Path(td)
        sky = td / "sky.png"
        _synth_sky(480, 270).save(sky)
        sky_path = str(sky)
        cases = {"wide": (400, 300, 1), "tall": (300, 400, 2)}
        for name, (w, h, seed) in cases.items():
            _synth_rgba(w, h, seed).save(td / f"raw-{name}.png")

        direct = {n: [grade(Image.open(td / f"raw-{n}.png").convert("RGBA")) for _ in range(2)]
                  for n in cases}
        hero = _hero_grade()
        hero_out = {n: hero(Image.open(td / f"raw-{n}.png").convert("RGBA")) for n in cases}

        digests = {}
        for name, (w, h, _) in cases.items():
            a, b = direct[name]
            assert a.size == b.size == (w, h), f"{name}: size {a.size}"
            assert a.mode == b.mode == "RGB" and "A" not in a.getbands(), f"{name}: alpha survived"
            assert a.tobytes() == b.tobytes(), f"{name}: two runs differ"
            assert a.tobytes() == hero_out[name].tobytes(), f"{name}: differs from hero grade"
            digests[name] = hashlib.sha256(a.tobytes()).hexdigest()

        cli_digests = {}
        for i in (1, 2):
            out = {n: td / f"out-{n}-{i}.png" for n in cases}
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve()),
                 "--in-wide", str(td / "raw-wide.png"), "--in-tall", str(td / "raw-tall.png"),
                 "--sky", str(sky),
                 "--out-wide", str(out["wide"]), "--out-tall", str(out["tall"])],
                check=True)
            cli_digests[i] = {n: hashlib.sha256(p.read_bytes()).hexdigest() for n, p in out.items()}
            for n in cases:
                with Image.open(out[n]) as im:
                    assert im.mode == "RGB", f"{n} cli run {i}: mode {im.mode}"
                    assert im.tobytes() == direct[n][0].tobytes(), \
                        f"{n} cli run {i}: pixels differ from direct grade"
        assert cli_digests[1] == cli_digests[2], "CLI output files differ across runs"

        assert N_FRAMES == 243, f"turn must hold 243 files, got {N_FRAMES}"
        n, fw, fh = 7, 64, 48  # small frames; loop logic identical at 4K
        for framing in ("wide", "tall"):
            fdir, gdir = td / f"frames-{framing}", td / f"graded-{framing}"
            fdir.mkdir()
            for i in range(n):
                Image.new("RGBA", (fw, fh),
                          ((17 * i + 3) % 256, (41 * i + 5) % 256, (7 * i + 11) % 256, 200)
                          ).save(fdir / f"frame_{i:03d}.png")
            shutil.copyfile(fdir / "frame_000.png", fdir / f"frame_{n - 1:03d}.png")
            assert grade_frames(str(fdir), str(sky), str(gdir), n) == n
            outs = sorted(p.name for p in gdir.iterdir())
            assert outs == [f"frame_{i:03d}.png" for i in range(n)], f"{framing}: {outs}"
            with Image.open(gdir / "frame_000.png") as im:
                assert im.mode == "RGB", f"{framing}: mode {im.mode}"
                ref = grade(Image.open(fdir / "frame_000.png").convert("RGBA"))
                assert im.tobytes() == ref.tobytes(), f"{framing}: frame 0 not pixel-identical"
            a = (gdir / "frame_000.png").read_bytes()
            assert (gdir / f"frame_{n - 1:03d}.png").read_bytes() == a, \
                f"{framing}: first==last not carried through"
            gdir2 = td / f"graded2-{framing}"
            grade_frames(str(fdir), str(sky), str(gdir2), n)
            assert all((gdir / o).read_bytes() == (gdir2 / o).read_bytes() for o in outs), \
                f"{framing}: rerun differs"
            print(f"  frames-{framing} {n} in/{n} out  frame 0 pixel-identical  "
                  f"first==last ok  rerun byte-identical")

        for name, (w, h, _) in cases.items():
            print(f"  {name:4} {w}x{h}  pixels sha256 {digests[name]}  "
                  f"hero-identical  cli png sha256 {cli_digests[1][name]}")
        print("self-test ok: sizes match, RGB opaque (alpha consumed), 2 runs byte-identical, "
              "pixel-identical to scripts/hero/grade.py, frozen CLI exercised twice")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Grade rendered island stills over the sky plate "
                    "(verbatim Pillow port of scripts/hero/grade.py).")
    p.add_argument("--in-wide")
    p.add_argument("--in-tall")
    p.add_argument("--sky", help="opaque RGB sky plate (C5)")
    p.add_argument("--out-wide")
    p.add_argument("--out-tall")
    p.add_argument("--frames-wide", help="M2 frames-wide/ dir in")
    p.add_argument("--frames-tall", help="M2 frames-tall/ dir in")
    p.add_argument("--graded-wide", help="graded-wide/ dir out")
    p.add_argument("--graded-tall", help="graded-tall/ dir out")
    p.add_argument("--self-test", action="store_true",
                    help="synthetic RGBA pair: sizes, alpha, determinism, hero parity")
    a = p.parse_args(argv)
    if a.self_test:
        return selftest()
    if a.frames_wide is not None or a.frames_tall is not None:
        missing = [f"--{n}" for n in ("frames-wide", "frames-tall", "graded-wide",
                                      "graded-tall", "sky")
                   if getattr(a, n.replace("-", "_")) is None]
        if missing:
            p.error("missing required arguments: " + ", ".join(missing))
        grade_frames(a.frames_wide, a.sky, a.graded_wide)
        grade_frames(a.frames_tall, a.sky, a.graded_tall)
        return 0
    missing = [f"--{n}" for n in ("in-wide", "in-tall", "sky", "out-wide", "out-tall")
                if getattr(a, n.replace("-", "_")) is None]
    if missing:
        p.error("missing required arguments: " + ", ".join(missing))
    run(a.in_wide, a.in_tall, a.sky, a.out_wide, a.out_tall)
    return 0


if __name__ == "__main__":
    sys.exit(main())
