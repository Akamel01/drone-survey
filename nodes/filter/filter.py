#!/usr/bin/env python3
"""filter: reject blurred, misexposed and near-duplicate frames.

ODM does not do this itself (#21). Three independent, measurable per-image
checks, using only Pillow (already installed, no numpy/opencv needed):

  - blur:      variance of a Laplacian-filtered grayscale copy; low variance
               means few sharp edges, i.e. out of focus.
  - exposure:  mean grayscale brightness outside a plausible band.
  - duplicate: average-hash (8x8 grayscale, bit = above/below mean) compared
               to the last *kept* image; frames are sequential, so a
               near-duplicate is almost always the previous one.

Thresholds below are a conservative first cut (ADR 0018): they have not been
tuned against a large real Capture yet, and should move only against
measured false-reject/false-accept rates, not by feel.
"""

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import list_images  # noqa: E402

BLUR_VARIANCE_MIN = 20.0       # measured on 5 real DJI-style stills: sharp 59-105, blurred <1
BRIGHTNESS_LOW = 25.0
BRIGHTNESS_HIGH = 230.0
DUP_HAMMING_MAX = 4            # out of 64 bits

LAPLACIAN = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1)


def blur_variance(gray: Image.Image) -> float:
    """Variance of the Laplacian, excluding the outer 1px ring.

    Pillow's Kernel filter leaves border pixels unconvolved (copies the
    source value instead), which on a perfectly flat image produces a
    constant-looking but nonzero variance purely from that ring -- a
    resolution-dependent artifact, not a measure of sharpness. Cropping it
    off before measuring gives the same value on a synthetic flat image (0)
    regardless of image size.
    """
    filtered = gray.filter(LAPLACIAN)
    interior = filtered.crop((1, 1, filtered.width - 1, filtered.height - 1))
    return ImageStat.Stat(interior).var[0]


def mean_brightness(gray: Image.Image) -> float:
    return ImageStat.Stat(gray).mean[0]


def average_hash(gray: Image.Image) -> int:
    small = gray.resize((8, 8), Image.LANCZOS)
    px = small.load()
    pixels = [px[x, y] for y in range(8) for x in range(8)]
    avg = sum(pixels) / len(pixels)
    bits = 0
    for px in pixels:
        bits = (bits << 1) | (1 if px >= avg else 0)
    return bits


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in", dest="images_dir", required=True, type=Path)
    p.add_argument("--out-images", required=True, type=Path)
    p.add_argument("--out-report", required=True, type=Path)
    args = p.parse_args()

    images = list_images(args.images_dir)
    if not images:
        sys.exit(f"filter: no images found in {args.images_dir}")

    args.out_images.mkdir(parents=True, exist_ok=True)
    rejected: dict[str, list[str]] = {}
    kept: list[str] = []
    last_kept_hash = None

    for img_path in images:
        with Image.open(img_path) as im:
            gray = im.convert("L")
            reasons = []

            var = blur_variance(gray)
            if var < BLUR_VARIANCE_MIN:
                reasons.append(f"blurred (laplacian variance {var:.1f} < {BLUR_VARIANCE_MIN})")

            mean = mean_brightness(gray)
            if mean < BRIGHTNESS_LOW or mean > BRIGHTNESS_HIGH:
                reasons.append(f"misexposed (mean brightness {mean:.1f})")

            h = average_hash(gray)
            if last_kept_hash is not None and hamming(h, last_kept_hash) <= DUP_HAMMING_MAX:
                reasons.append(f"near-duplicate of previous kept frame (hamming distance {hamming(h, last_kept_hash)})")

        if reasons:
            rejected[img_path.name] = reasons
        else:
            (args.out_images / img_path.name).write_bytes(img_path.read_bytes())
            kept.append(img_path.name)
            last_kept_hash = h

    report = {"input_count": len(images), "kept": kept, "rejected": rejected}
    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    args.out_report.write_text(json.dumps(report, indent=1))

    print(f"filter: kept {len(kept)}/{len(images)}, rejected {len(rejected)} "
          f"({sum(1 for r in rejected.values() if any('blur' in x for x in r))} blurred, "
          f"{sum(1 for r in rejected.values() if any('misexposed' in x for x in r))} misexposed, "
          f"{sum(1 for r in rejected.values() if any('duplicate' in x for x in r))} near-duplicate)")

    if not kept:
        sys.exit("filter: every image was rejected, nothing to pass downstream")


if __name__ == "__main__":
    main()
