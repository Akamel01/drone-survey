"""Sky plate for the Showcase (#192 M2) -- regenerated from the hero's
measured ramp.

3840x2160 opaque RGB PNG:
- above 2 %H: clamped at `#24384A`;
- 2 %H to the 0.68 H horizon row: piecewise-linear through the six measured
  tall-framing anchors (`docs/research/hero-look-spec.md` section 4a, s0 row
  means): #24384A #436580 #587998 #7896B0 #92AAC0 #C4CCD5;
- below the horizon row: haze hold at `#C4CCD5`;
- a soft static ridge band near the measured haze `#B9C3D1` (HorizonHaze
  mean) below the horizon: the "distant mountains lost in haze" layer
  (ADR-6, grilling Q8).

The look-spec's fitted slopes (tall R 1.93 / G 1.62 / B 1.38 levels/%H; the
plan and ADR-6 quote the rounded R 1.9 / G 1.6 / B 1.4) summarise the same
measured curve; the plate is built through the anchors because a straight
two-endpoint line loses the measured blue mid (`#6D8DA9` at 0.35 H).

The cloud layer is not here: `nodes/render-background/cloud_pass.py` renders
it and grade composites it, panned, over this plate (ADR-1, M4). Pillow +
stdlib only; deterministic.

Usage:
  python3 fixtures/showcase/generate_sky_plate.py [--out FILE]
  python3 fixtures/showcase/generate_sky_plate.py --check
      # regenerate to a tempdir; compare decoded pixel bytes + dimensions
      # (F5: Pillow is unpinned in CI, PNG bytes are not the contract) and
      # assert the sampled ramp anchors + ridge presence.
"""

import argparse
import math
import os
import tempfile

from PIL import Image, ImageDraw, ImageFilter, ImageStat

W, H = 3840, 2160
ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(ROOT, "sky-plate.png")

# look-spec section 4a, tall framing, s0 (hex anchors at %H).
ANCHORS = (
    (0.02, (0x24, 0x38, 0x4A)),
    (0.10, (0x43, 0x65, 0x80)),
    (0.25, (0x58, 0x79, 0x98)),
    (0.40, (0x78, 0x96, 0xB0)),
    (0.55, (0x92, 0xAA, 0xC0)),
    (0.68, (0xC4, 0xCC, 0xD5)),
)
ROWS = [int(round(f * H)) for f, _ in ANCHORS]   # 43 216 540 864 1188 1469
COLS = [c for _, c in ANCHORS]
TOP_COL, HORIZON_COL = COLS[0], COLS[-1]
HORIZON_ROW = ROWS[-1]

# Ridge band (%H below the horizon row) and its silhouette harmonics.
RIDGE_COL = (0xB9, 0xC3, 0xD1)
RIDGE_TOP_H, RIDGE_TOP_AMP_H = 0.035, 0.012
RIDGE_BOT_H, RIDGE_BOT_AMP_H = 0.160, 0.015
RIDGE_BLUR, RIDGE_STEP = 16, 8
TOP_TERMS = ((0.55, 3.0, 0.13), (0.30, 7.0, 0.57), (0.15, 17.0, 0.83))
BOT_TERMS = ((0.55, 2.0, 0.41), (0.30, 5.0, 0.07), (0.15, 11.0, 0.67))

MID_ROW = int(round(0.35 * H))                   # 756
MID_COL = (0x6D, 0x8C, 0xA8)                     # 2/3 between the 0.25/0.40 anchors
RIDGE_SAMPLE = (1630, 1710)                      # fully inside the unblurred band


def ramp_colour(y):
    """Row colour: anchor interpolation, clamped outside 0.02..0.68 H."""
    if y <= ROWS[0]:
        return TOP_COL
    if y >= ROWS[-1]:
        return HORIZON_COL
    i = 0
    while ROWS[i + 1] <= y:
        i += 1
    t = (y - ROWS[i]) / float(ROWS[i + 1] - ROWS[i])
    return tuple(int(round(a + t * (b - a))) for a, b in zip(COLS[i], COLS[i + 1]))


def _wave(x, terms):
    u = x / float(W)
    return sum(a * math.sin(2 * math.pi * (f * u + p)) for a, f, p in terms)


def ridge_top(x):
    return int(round(HORIZON_ROW + H * (RIDGE_TOP_H + RIDGE_TOP_AMP_H * _wave(x, TOP_TERMS))))


def ridge_bottom(x):
    return int(round(HORIZON_ROW + H * (RIDGE_BOT_H + RIDGE_BOT_AMP_H * _wave(x, BOT_TERMS))))


def build(path):
    """Write the plate to `path` (PNG, RGB) and return it."""
    base = Image.new("RGB", (1, H))
    base.putdata([ramp_colour(y) for y in range(H)])
    plate = base.resize((W, H), Image.NEAREST)

    mask = Image.new("L", (W, H), 0)
    xs = list(range(0, W, RIDGE_STEP)) + [W - 1]
    pts = [(x, ridge_top(x)) for x in xs] + [(x, ridge_bottom(x)) for x in reversed(xs)]
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(RIDGE_BLUR))

    plate = Image.composite(Image.new("RGB", (W, H), RIDGE_COL), plate, mask)
    plate.save(path, "PNG")
    return plate


def die(msg):
    raise SystemExit("sky-plate check FAILED: %s" % msg)


def check(out=DEFAULT_OUT):
    if not os.path.exists(out):
        die("plate not found: %s" % out)
    with tempfile.TemporaryDirectory() as tmp:
        tmp_out = os.path.join(tmp, "sky-plate.png")
        build(tmp_out)
        a, b = Image.open(out), Image.open(tmp_out)
        a.load()
        b.load()
        for name, im in (("committed", a), ("regenerated", b)):
            if im.size != (W, H) or im.mode != "RGB":
                die("%s plate is %s %s, want %s RGB" % (name, im.size, im.mode, (W, H)))
        print("dimensions: %dx%d mode %s (opaque) OK" % (a.size[0], a.size[1], a.mode))
        if a.tobytes() != b.tobytes():
            die("decoded pixels differ between committed plate and regeneration")
        print("decoded pixels: identical on regeneration OK")
        for name, y, want in (("top", int(0.01 * H), TOP_COL),
                              ("mid", MID_ROW, MID_COL),
                              ("horizon", HORIZON_ROW, HORIZON_COL)):
            got = b.getpixel((W // 2, y))
            if got != want:
                die("ramp %s at row %d: got %s, want %s" % (name, y, got, want))
        print("ramp samples: top %s mid %s horizon %s OK"
              % (TOP_COL, MID_COL, HORIZON_COL))
        if b.getpixel((W // 2, H - 1)) != HORIZON_COL:
            die("haze hold below the horizon changed at row %d" % (H - 1))
        m = ImageStat.Stat(b.crop((0, RIDGE_SAMPLE[0], W, RIDGE_SAMPLE[1]))).mean
        if max(abs(m[i] - RIDGE_COL[i]) for i in range(3)) > 1.0:
            die("ridge rows %d-%d mean (%d, %d, %d), want ~%s"
                % (RIDGE_SAMPLE + tuple(round(v) for v in m) + (RIDGE_COL,)))
        if m[0] > HORIZON_COL[0] - 8:
            die("ridge band not distinct from the haze hold")
        print("ridge rows %d-%d: mean (%d, %d, %d) vs #B9C3D1, hold %s OK"
              % (RIDGE_SAMPLE + tuple(round(v) for v in m) + (HORIZON_COL,)))
        same = open(out, "rb").read() == open(tmp_out, "rb").read()
        print("png bytes: %s (informational; decoded pixels are the contract, F5)"
              % ("identical" if same else "differ"))
    print("M2 sky-plate check PASS")


def main(argv=None):
    p = argparse.ArgumentParser(description="sky plate for the Showcase (#192 M2)")
    p.add_argument("--out", default=DEFAULT_OUT, help="output PNG (default: %(default)s)")
    p.add_argument("--check", action="store_true",
                   help="regenerate to a tempdir, compare against --out, sample ramp/ridge")
    args = p.parse_args(argv)
    out = os.path.abspath(args.out)
    if args.check:
        check(out)
        return
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = build(out)
    print("wrote %s (%dx%d %s)" % (out, im.size[0], im.size[1], im.mode))


if __name__ == "__main__":
    main()
