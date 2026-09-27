"""Synthetic golden fixtures for #191 Showcase gate (M1).

Generates, with stdlib only (struct+zlib):
  turn-3f/  3-frame synthetic turn, frame_002 byte-identical to frame_000
            (first==last by construction, like D1 render mapping i/243*2pi).
            Seam metric (D5: mean abs luma diff, closing pair vs consecutive
            max) is trivially verifiable: closing diff == 0.
  dir-a/    2 frames, bright bar moves +x (reference direction).
  dir-b/    same 2 frames reversed (bar moves -x), so direction signs
            (D4: masked mean-horizontal-flow sign) are opposite
            by construction.

Frames are RGBA PNG (opaque white bar = island mask alpha 255 on
transparent black), matching the gate's alpha-mask read pattern.

Usage:
  python3 fixtures/showcase/generate_goldens.py          # (re)generate
  python3 fixtures/showcase/generate_goldens.py --check  # rerun to tempdir,
      # byte-compare with committed fixtures + assert seam/direction metrics

Deterministic: fixed sizes/positions, no randomness, no timestamps in PNG.
"""

import os
import struct
import sys
import tempfile
import zlib

W, H = 64, 32
BAR_W = 8
ROOT = os.path.dirname(os.path.abspath(__file__))

# ponytail: fixed 64x32 geometry; upscale only if M6 reader needs real scale.


def rgba_png(w, h, pixels):
    raw = b"".join(b"\x00" + bytes(c for p in pixels[y * w:(y + 1) * w] for c in p)
                     for y in range(h))
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def frame(bar_x):
    px = []
    for _ in range(H):
        for x in range(W):
            px.append((255, 255, 255, 255) if bar_x <= x < bar_x + BAR_W
                      else (0, 0, 0, 0))
    return rgba_png(W, H, px)


LAYOUT = {
    "turn-3f": [8, 32, 8],   # frame_002 == frame_000: seam-closed turn
    "dir-a": [8, 40],        # bar moves +x
    "dir-b": [40, 8],        # reversed pair: bar moves -x
}


def generate(root=ROOT):
    for d, xs in LAYOUT.items():
        os.makedirs(os.path.join(root, d), exist_ok=True)
        for i, x in enumerate(xs):
            with open(os.path.join(root, d, "frame_%03d.png" % i), "wb") as f:
                f.write(frame(x))


def read_luma_alpha(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", path
    pos, raw = 8, b""
    while pos < len(data):
        (ln,) = struct.unpack(">I", data[pos:pos + 4])
        tag = data[pos + 4:pos + 8]
        if tag == b"IDAT":
            raw += data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
    w, h, px = W, H, []
    buf = zlib.decompress(raw)
    stride = 1 + w * 4
    for y in range(h):
        assert buf[y * stride] == 0
        row = buf[y * stride + 1:(y + 1) * stride]
        for x in range(w):
            r, g, b, a = row[x * 4:x * 4 + 4]
            px.append(((r + g + b) // 3, a))
    return px


def mean_abs_diff(a, b):
    return sum(abs(x[0] - y[0]) for x, y in zip(a, b)) / len(a)


def mask_centroid_x(px):
    tot = sum(p[1] for p in px)
    return sum((i % W) * p[1] for i, p in enumerate(px)) / tot


def check_dir(root, name):
    d = os.path.join(root, name)
    files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    assert len(files) == 2, (name, files)
    return [read_luma_alpha(os.path.join(d, f)) for f in files]


def self_check(root=ROOT):
    frames = [read_luma_alpha(os.path.join(root, "turn-3f", "frame_%03d.png" % i))
              for i in range(3)]
    consec = [mean_abs_diff(frames[i], frames[i + 1]) for i in range(2)]
    closing = mean_abs_diff(frames[2], frames[0])
    assert closing == 0, closing
    assert closing <= max(consec), (closing, consec)
    print("seam: closing=%.1f consec=%s OK" % (closing, ["%.1f" % c for c in consec]))
    signs = {}
    for name in ("dir-a", "dir-b"):
        a, b = check_dir(root, name)
        s = mask_centroid_x(b) - mask_centroid_x(a)
        signs[name] = 1 if s > 0 else -1
        print("direction %s: dx=%+.1f sign=%+d" % (name, s, signs[name]))
    assert signs["dir-a"] == +1 and signs["dir-b"] == -1, signs
    assert signs["dir-a"] == -signs["dir-b"]
    print("direction: signs opposite by construction OK")


def main(argv):
    if "--check" in argv:
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp)
            for d, xs in LAYOUT.items():
                for i in range(len(xs)):
                    n = "frame_%03d.png" % i
                    a = os.path.join(ROOT, d, n)
                    b = os.path.join(tmp, d, n)
                    assert open(a, "rb").read() == open(b, "rb").read(), \
                        "nondeterministic rerun: %s/%s" % (d, n)
            print("determinism: byte-identical rerun OK (%d files)"
                  % sum(len(v) for v in LAYOUT.values()))
        self_check()
        print("M1 self-check PASS")
    else:
        generate()
        self_check()
        print("generated + self-check PASS")


if __name__ == "__main__":
    main(sys.argv[1:])
