#!/usr/bin/env python3
"""exif-audit: confirm GPS and camera metadata are present; report coverage.

Gate, not a filter (design.md §4): it does not drop images, it fails the
whole Capture loudly (non-zero exit) when:
  - any image is missing GPS latitude/longitude, or
  - camera settings that the Capture standard (docs/design.md §5) requires
    locked for a Grid Mission -- Make/Model, ExposureTime, FNumber,
    FocalLength -- are not identical across every image in the set.

Thresholds are exact-match, deliberately conservative per ADR 0018 ("start
conservative... treat an unmeasured threshold as a reason to hold, not skip
the check"); loosen only against measured real-Capture drift.

**ISO is deliberately not in LOCKED_FIELDS** (bellus-v1, #15: measured on
odm_data_bellus's real 122-frame EXIF, Make/Model/ExposureTime/FNumber/
FocalLength are identical across every frame but ISO takes 12 distinct
values -- a real camera's Auto-ISO compensating for lighting while shutter
speed and aperture, the two settings that actually change blur and depth of
field, stay locked). design.md §5's "locked exposure" is about keeping
motion blur and depth of field consistent across the Grid Mission, which
ExposureTime+FNumber (+FocalLength for scale) already cover; ISO is sensor
gain, a radiometric knob, and `correct` (design.md's own "exposure
consistency" Node, line 144) is exactly the Node that normalizes frame-to-
frame gain differences downstream. Exact-matching it here would fail every
real auto-ISO Capture for a difference this pipeline already has a Node to
fix -- not "too strict as a floor", just the wrong Node for that check.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import die, list_images, read_exif_batch, emit_report  # noqa: E402

LOCKED_FIELDS = ["Make", "Model", "ExposureTime", "FNumber", "FocalLength"]


def audit(images: list[Path], exif: dict[str, dict]) -> dict:
    missing_gps = []
    per_image = {}
    for img in images:
        tags = exif.get(img.name, {})
        has_gps = "GPSLatitude" in tags and "GPSLongitude" in tags
        if not has_gps:
            missing_gps.append(img.name)
        per_image[img.name] = {f: tags.get(f) for f in LOCKED_FIELDS} | {"gps": has_gps}

    inconsistent: dict[str, list] = {}
    if images:
        reference = per_image[images[0].name]
        for field in LOCKED_FIELDS:
            values = {img.name: per_image[img.name][field] for img in images}
            if len(set(values.values())) > 1:
                inconsistent[field] = values

    return {
        "count": len(images),
        "missing_gps": missing_gps,
        "inconsistent_fields": inconsistent,
        "per_image": per_image,
        "ok": not missing_gps and not inconsistent,
    }


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--in", dest="images_dir", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    args = p.parse_args()

    images = list_images(args.images_dir)
    if not images:
        die(f"no images found in {args.images_dir}")

    exif = read_exif_batch(images)
    report = audit(images, exif)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    emit_report(args.out, report)

    if report["missing_gps"]:
        print(f"exif-audit: {len(report['missing_gps'])} image(s) missing GPS: {report['missing_gps']}",
              file=sys.stderr)
    if report["inconsistent_fields"]:
        print(f"exif-audit: inconsistent camera settings across the set: "
              f"{sorted(report['inconsistent_fields'])}", file=sys.stderr)

    if not report["ok"]:
        sys.exit(1)

    print(f"exif-audit: {report['count']} images, GPS present, camera settings consistent")


if __name__ == "__main__":
    main()
