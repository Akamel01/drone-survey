"""Showcase grade Node: the hero's dreamy grade, ported verbatim.

`scripts/hero/grade.py:5-22` (haze, glow, lift) is copied expression-for-expression;
only the hero's sheet-building tail is dropped and file plumbing added. Pillow
only — no Blender, no GPU, no network. The Node takes image paths only: it cannot
name a Reconstruction or an island dir, grading never alters the Reconstruction.
"""
import argparse
import ast
import hashlib
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
    p.add_argument("--self-test", action="store_true",
                   help="synthetic RGBA pair: sizes, alpha, determinism, hero parity")
    a = p.parse_args(argv)
    if a.self_test:
        return selftest()
    missing = [f"--{n}" for n in ("in-wide", "in-tall", "sky", "out-wide", "out-tall")
               if getattr(a, n.replace("-", "_")) is None]
    if missing:
        p.error("missing required arguments: " + ", ".join(missing))
    run(a.in_wide, a.in_tall, a.sky, a.out_wide, a.out_tall)
    return 0


if __name__ == "__main__":
    sys.exit(main())
