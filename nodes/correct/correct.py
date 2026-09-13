#!/usr/bin/env python3
"""correct: exposure consistency and white balance. Radiometric only.

ADR 0009 (2026-09-10 revision): no lens/distortion correction here -- DJI
firmware already removes distortion before writing the JPEG, and ODM expects
un-undistorted images for its own self-calibration. This Node only ever
scales existing pixel values per channel; it never resizes, crops, or warps,
so image dimensions in == dimensions out is a direct, checkable proxy for
"radiometric only" (see nodes/check_head.py).

Two passes, both simple linear gain per channel (no numpy needed, Pillow's
point() LUT does it):
  1. exposure consistency: scale each image's overall brightness towards the
     set's median brightness.
  2. white balance: gray-world -- scale R/G/B so their means match.

Most image libraries drop EXIF/XMP on re-save (the known trap named in the
ticket and in ADR 0009's revision). Pillow's save is not trusted for this:
after saving, exiftool copies every tag -- EXIF and XMP, GPS included --
from the original file onto the corrected one, and nodes/check_head.py
verifies GPS survives byte-for-byte.
"""

import argparse
import statistics
import sys
from pathlib import Path

from PIL import Image, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import copy_metadata, list_images  # noqa: E402

GAIN_MIN, GAIN_MAX = 0.6, 1.6


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def lut(scale: float) -> list[int]:
    return [min(255, max(0, round(i * scale))) for i in range(256)]


def grayscale_mean(im: Image.Image) -> float:
    return ImageStat.Stat(im.convert("L")).mean[0]


def apply_gain(im: Image.Image, gain: float) -> Image.Image:
    bands = im.split()
    table = lut(gain)
    return Image.merge(im.mode, [b.point(table) for b in bands])


def white_balance_gain(im: Image.Image) -> tuple[float, float, float]:
    r, g, b = ImageStat.Stat(im.convert("RGB")).mean
    gray = (r + g + b) / 3
    return tuple(clamp(gray / c, GAIN_MIN, GAIN_MAX) if c else 1.0 for c in (r, g, b))


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in", dest="images_dir", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()

    images = list_images(args.images_dir)
    if not images:
        sys.exit(f"correct: no images found in {args.images_dir}")

    args.out.mkdir(parents=True, exist_ok=True)

    means = {}
    for path in images:
        with Image.open(path) as im:
            means[path.name] = grayscale_mean(im)
    target = statistics.median(means.values())

    for path in images:
        with Image.open(path) as im:
            im = im.convert("RGB")
            exposure_gain = clamp(target / means[path.name], GAIN_MIN, GAIN_MAX) if means[path.name] else 1.0
            r_gain, g_gain, b_gain = white_balance_gain(im)

            bands = im.split()
            combined = [
                clamp(exposure_gain * r_gain, GAIN_MIN, GAIN_MAX),
                clamp(exposure_gain * g_gain, GAIN_MIN, GAIN_MAX),
                clamp(exposure_gain * b_gain, GAIN_MIN, GAIN_MAX),
            ]
            corrected = Image.merge("RGB", [b.point(lut(g)) for b, g in zip(bands, combined)])

            dst = args.out / path.name
            corrected.save(dst, "JPEG", quality=95)

        copy_metadata(path, dst)  # restore EXIF/XMP/GPS Pillow just dropped

    print(f"correct: {len(images)} images corrected (target brightness {target:.1f}), metadata copied back")


if __name__ == "__main__":
    main()
