"""Hero-vs-Showcase comparison sheets: 2 rows x 4 columns, JPEG q90.

Each input directory must hold exactly 4 name-sorted PNG/JPG frames. For the
wide/tall figures H2 extracts frames 0/972/1944/2916 from the hero master
(read-only) and from the Showcase master with the documented ffmpeg step; this
tool only ever reads the directories it is given and writes the two sheets.

Deterministic: same inputs and --tile-width give byte-identical JPEGs.
Pillow + stdlib only.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FRAME_COUNT = 4
FRAME_EXTS = (".png", ".jpg", ".jpeg")
BG, FG = (0, 0, 0), (255, 255, 255)


def frames_in(directory):
    """The directory's 4 name-sorted PNG/JPG frames, or SystemExit."""
    p = Path(directory)
    if not p.is_dir():
        raise SystemExit(f"{p}: not a directory")
    frames = sorted(f for f in p.iterdir() if f.is_file() and f.suffix.lower() in FRAME_EXTS)
    if len(frames) != FRAME_COUNT:
        found = ", ".join(f.name for f in frames) or "none"
        raise SystemExit(
            f"{p}: expected exactly {FRAME_COUNT} PNG/JPG frames, "
            f"found {len(frames)} ({found})")
    return frames


def _font(tile_width):
    # Pillow's default font, scaled (FreeType-backed since Pillow 10.1).
    return ImageFont.load_default(size=max(12, tile_width // 40))


def _pad(tile_width):
    return max(4, tile_width // 120)


def _band(tile_width, font):
    box = ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), "Ag", font=font)
    return box[3] - box[1] + 2 * _pad(tile_width)


def build_sheet(framing, hero_dir, showcase_dir, out_path, tile_width=960):
    """Write one sheet (hero row top, Showcase row bottom); return its (w, h)."""
    rows = [("hero", frames_in(hero_dir)), ("Showcase", frames_in(showcase_dir))]
    font, pad = _font(tile_width), _pad(tile_width)
    band = _band(tile_width, font)

    tiles, row_heights = [], []
    for _, paths in rows:
        row = []
        for path in paths:
            im = Image.open(path).convert("RGB")
            row.append(im.resize(
                (tile_width, round(im.height * tile_width / im.width)), Image.LANCZOS))
        tiles.append(row)
        row_heights.append(max(t.height for t in row))

    width = FRAME_COUNT * tile_width
    height = band + sum(band + h for h in row_heights)
    sheet = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(sheet)

    draw.text((pad, pad), f"{framing}: hero vs Showcase, frames 0-{FRAME_COUNT - 1}",
              fill=FG, font=font)

    y = band
    for (label, _), row, row_h in zip(rows, tiles, row_heights):
        draw.text((pad, y + pad), label, fill=FG, font=font)
        for i, tile in enumerate(row):
            x = i * tile_width
            draw.text((x + tile_width // 2, y + pad), str(i), fill=FG, font=font, anchor="ma")
            sheet.paste(tile, (x, y + band))
        y += band + row_h

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, "JPEG", quality=90)
    return width, height


def _synth(directory, colours, size):
    """Solid colour + corner marker frames, named so name-sort is frame order."""
    directory.mkdir(parents=True)
    for i, colour in enumerate(colours):
        im = Image.new("RGB", size, colour)
        ImageDraw.Draw(im).rectangle([8, 8, size[0] // 5, size[1] // 5], fill=(0, 0, 0))
        im.save(directory / f"frame_{i:04d}.png")


def _pixel_close(im, xy, rgb, tol=40):
    got = im.getpixel(xy)
    return all(abs(g - e) <= tol for g, e in zip(got, rgb))


def selftest():
    tw = 960
    colours = [(200, 60, 60), (60, 200, 60), (60, 60, 200), (200, 200, 60)]
    with tempfile.TemporaryDirectory(prefix="hero-compare-selftest-") as td:
        td = Path(td)
        dirs = {}
        for name, size in (("hero-wide", (800, 450)), ("showcase-wide", (640, 360)),
                           ("hero-tall", (450, 800)), ("showcase-tall", (360, 640))):
            dirs[name] = td / name
            _synth(dirs[name], colours, size)

        band = _band(tw, _font(tw))
        out_w, out_t = td / "out-wide.jpg", td / "out-tall.jpg"

        def cli(out_wide, out_tall):
            return [sys.executable, str(Path(__file__).resolve()), "--tile-width", str(tw),
                    "--hero-wide", str(dirs["hero-wide"]),
                    "--showcase-wide", str(dirs["showcase-wide"]),
                    "--hero-tall", str(dirs["hero-tall"]),
                    "--showcase-tall", str(dirs["showcase-tall"]),
                    "--out-wide", str(out_wide), "--out-tall", str(out_tall)]

        subprocess.run(cli(out_w, out_t), check=True)
        wide, tall = out_w.read_bytes(), out_t.read_bytes()
        with Image.open(out_w) as im:
            # 800x450 and 640x360 both resize to 960x540; bands: title + 2 rows.
            assert im.size == (4 * tw, 3 * band + 2 * 540), f"wide sheet {im.size}"
            for row in range(2):
                y = band + row * (band + 540) + band + 270
                for col in range(4):
                    assert _pixel_close(im, (col * tw + tw // 2, y), colours[col]), \
                        f"wide tile row {row} col {col}: {im.getpixel((col * tw + tw // 2, y))}"
        with Image.open(out_t) as im:
            # 800/450*960 = 1706.67 -> 1707 for both tall frames.
            assert im.size == (4 * tw, 3 * band + 2 * 1707), f"tall sheet {im.size}"

        # Byte-identical rerun (whole CLI, second invocation).
        out_w2, out_t2 = td / "out-wide-2.jpg", td / "out-tall-2.jpg"
        subprocess.run(cli(out_w2, out_t2), check=True)
        assert wide == out_w2.read_bytes() and tall == out_t2.read_bytes(), \
            "rerun not byte-identical"

        # 4-frame rule: 3 and 5 frames both refuse with a clear message.
        for count in (3, 5):
            bad = td / f"frames-{count}"
            bad.mkdir()
            for i in range(count):
                Image.new("RGB", (80, 45), colours[i % 4]).save(bad / f"f{i}.png")
            try:
                frames_in(bad)
            except SystemExit as e:
                assert "expected exactly 4" in str(e) and f"found {count}" in str(e), e
            else:
                raise AssertionError(f"{count}-frame dir accepted")

        print(f"self-test ok: wide {4 * tw}x{3 * band + 2 * 540}, "
              f"tall {4 * tw}x{3 * band + 2 * 1707}, tiles at every row/col sampled, "
              f"3/5-frame dirs refused, rerun byte-identical")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Build the 2x4 hero-vs-Showcase comparison sheets (JPEG q90).")
    p.add_argument("--hero-wide", metavar="DIR", help="4 hero wide frames, name-sorted")
    p.add_argument("--hero-tall", metavar="DIR")
    p.add_argument("--showcase-wide", metavar="DIR")
    p.add_argument("--showcase-tall", metavar="DIR")
    p.add_argument("--out-wide", metavar="FILE")
    p.add_argument("--out-tall", metavar="FILE")
    p.add_argument("--tile-width", type=int, default=960)
    p.add_argument("--self-test", action="store_true",
                   help="synthetic frames: dims, row/col placement, 4-frame rule, determinism")
    a = p.parse_args(argv)
    if a.self_test:
        return selftest()
    if a.tile_width <= 0:
        p.error("--tile-width must be positive")
    missing = [f"--{n}" for n in ("hero-wide", "hero-tall", "showcase-wide",
                                  "showcase-tall", "out-wide", "out-tall")
               if getattr(a, n.replace("-", "_")) is None]
    if missing:
        p.error("missing required arguments: " + ", ".join(missing))
    for framing, hero, showcase, out in (("wide", a.hero_wide, a.showcase_wide, a.out_wide),
                                         ("tall", a.hero_tall, a.showcase_tall, a.out_tall)):
        w, h = build_sheet(framing, hero, showcase, out, a.tile_width)
        print(f"{out}: {w}x{h}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
