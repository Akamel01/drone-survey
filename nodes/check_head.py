#!/usr/bin/env python3
"""ADR 0018's minimum verification bar for ingest/exif-audit/filter/correct.

Offline, no network, no committed imagery: every fixture image is generated
at runtime with Pillow and tagged with exiftool. One command:

    python3 nodes/check_head.py

Checks (measured properties of output, not exit status alone -- ADR 0018):

  1. correct preserves EXIF and XMP, GPS in particular, input to output.
  2. correct is radiometric only: output dimensions == input dimensions
     (a lens/distortion pass would resize or crop; a pure gain never does).
  3. exif-audit exits non-zero when an image is missing GPS, and again when
     camera settings (ISO) are inconsistent across the set.
  4. filter rejects a blurred frame, an overexposed frame, and a
     near-duplicate frame, while keeping a normal one.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

NODES = Path(__file__).resolve().parent
PY = sys.executable

FAILURES: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "ok" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def make_image(path: Path, size=(200, 150), pattern="sharp", brightness=128, phase=0):
    im = Image.new("RGB", size, (brightness, brightness, brightness))
    draw = ImageDraw.Draw(im)
    # a fine checkerboard gives the Laplacian something to react to (sharp
    # edges); a large quadrant block gives average-hash something coarse to
    # react to (8x8 downsampling washes out the fine checker regardless of
    # its phase, so two distinct "good" frames need a big-scale difference
    # too, or they hash identically and falsely look like duplicates).
    step = 10
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2 == 0:
                draw.rectangle([x, y, x + step, y + step], fill=(min(255, brightness + 80),) * 3)
    if phase:
        draw.rectangle([size[0] // 2, size[1] // 2, size[0], size[1]], fill=(min(255, brightness + 80),) * 3)
    else:
        draw.rectangle([0, 0, size[0] // 2, size[1] // 2], fill=(max(0, brightness - 80),) * 3)
    if pattern == "blurred":
        im = im.filter(ImageFilter.GaussianBlur(radius=8))
    im.save(path, "JPEG", quality=95)


def tag(path: Path, **tags) -> None:
    args = ["exiftool", "-overwrite_original"]
    for k, v in tags.items():
        args.append(f"-{k}={v}")
    args.append(str(path))
    subprocess.run(args, capture_output=True, text=True, check=True)


CUSTOM_XMP = """<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="check_head">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:Camera="http://ns.test.local/Camera/1.0/" Camera:Pitch="-1.5"/>
</rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
"""


def tag_custom_xmp(path: Path, tmp: Path) -> None:
    """Write an XMP packet in a namespace exiftool has no built-in definition
    for -- real senseFly/DJI-style drone XMP does this (measured against a
    downloaded OpenDroneMap sample), and it is exactly the case
    `-TagsFromFile ... -all:all` silently drops on copy (tags it doesn't
    recognise), while `-all:all -xmp` (whole-packet copy) preserves it.
    """
    xmp_file = tmp / "custom.xmp"
    xmp_file.write_text(CUSTOM_XMP, encoding="utf-8")
    subprocess.run(["exiftool", f"-xmp<={xmp_file}", "-overwrite_original", str(path)],
                   capture_output=True, text=True, check=True)


def exif_json(path: Path) -> dict:
    out = subprocess.run(["exiftool", "-j", "-n", str(path)], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)[0]


def check_correct(tmp: Path):
    src_dir, out_dir = tmp / "correct_in", tmp / "correct_out"
    src_dir.mkdir()
    img = src_dir / "a.jpg"
    make_image(img)
    tag(img, GPSLatitude="41.3038", GPSLatitudeRef="N", GPSLongitude="-81.7505", GPSLongitudeRef="W",
        Make="DJI", Model="FC7303", ISO="100")
    tag_custom_xmp(img, tmp)
    before = exif_json(img)

    r = run([PY, str(NODES / "correct" / "correct.py"), "--in", str(src_dir), "--out", str(out_dir)])
    check("correct: exits 0", r.returncode == 0, r.stderr)

    out_img = out_dir / "a.jpg"
    check("correct: output file exists", out_img.exists())
    if not out_img.exists():
        return
    after = exif_json(out_img)

    check("correct: GPSLatitude preserved", after.get("GPSLatitude") == before.get("GPSLatitude"),
          f"{before.get('GPSLatitude')} -> {after.get('GPSLatitude')}")
    check("correct: GPSLongitude preserved", after.get("GPSLongitude") == before.get("GPSLongitude"),
          f"{before.get('GPSLongitude')} -> {after.get('GPSLongitude')}")
    check("correct: XMP preserved", after.get("Pitch") == before.get("Pitch"),
          f"{before.get('Pitch')} -> {after.get('Pitch')}")

    with Image.open(img) as im_in, Image.open(out_img) as im_out:
        check("correct: radiometric only (dimensions unchanged)", im_in.size == im_out.size,
              f"{im_in.size} -> {im_out.size}")


def check_exif_audit(tmp: Path):
    good_dir = tmp / "audit_good"
    good_dir.mkdir()
    for name in ("a.jpg", "b.jpg"):
        img = good_dir / name
        make_image(img)
        tag(img, GPSLatitude="41.3", GPSLatitudeRef="N", GPSLongitude="-81.7", GPSLongitudeRef="W",
            Make="DJI", Model="FC7303", ISO="100", ExposureTime="0.004", FNumber="2.8", FocalLength="4.5")
    r = run([PY, str(NODES / "exif-audit" / "exif_audit.py"), "--in", str(good_dir), "--out", str(tmp / "good.json")])
    check("exif-audit: passes a consistent, geotagged set", r.returncode == 0, r.stderr)

    missing_gps_dir = tmp / "audit_missing_gps"
    missing_gps_dir.mkdir()
    for i, name in enumerate(("a.jpg", "b.jpg")):
        img = missing_gps_dir / name
        make_image(img)
        if i == 0:
            tag(img, GPSLatitude="41.3", GPSLatitudeRef="N", GPSLongitude="-81.7", GPSLongitudeRef="W")
        tag(img, Make="DJI", Model="FC7303", ISO="100", ExposureTime="0.004", FNumber="2.8", FocalLength="4.5")
    r = run([PY, str(NODES / "exif-audit" / "exif_audit.py"), "--in", str(missing_gps_dir), "--out", str(tmp / "mg.json")])
    check("exif-audit: fails loudly (non-zero) on missing GPS", r.returncode != 0, f"exit {r.returncode}")

    inconsistent_dir = tmp / "audit_inconsistent"
    inconsistent_dir.mkdir()
    for i, name in enumerate(("a.jpg", "b.jpg")):
        img = inconsistent_dir / name
        make_image(img)
        tag(img, GPSLatitude="41.3", GPSLatitudeRef="N", GPSLongitude="-81.7", GPSLongitudeRef="W",
            Make="DJI", Model="FC7303", ISO=("100" if i == 0 else "800"),
            ExposureTime="0.004", FNumber="2.8", FocalLength="4.5")
    r = run([PY, str(NODES / "exif-audit" / "exif_audit.py"), "--in", str(inconsistent_dir), "--out", str(tmp / "ic.json")])
    check("exif-audit: fails loudly (non-zero) on inconsistent camera settings", r.returncode != 0, f"exit {r.returncode}")


def check_filter(tmp: Path):
    src = tmp / "filter_in"
    src.mkdir()
    make_image(src / "1_good.jpg", pattern="sharp", brightness=128, phase=0)
    make_image(src / "2_blurred.jpg", pattern="blurred", brightness=128, phase=0)
    make_image(src / "3_overexposed.jpg", pattern="sharp", brightness=250, phase=0)
    make_image(src / "4_good.jpg", pattern="sharp", brightness=120, phase=1)
    shutil.copy(src / "4_good.jpg", src / "5_duplicate.jpg")  # byte-identical -> near-duplicate

    out_images, out_report = tmp / "filter_out", tmp / "filter_report.json"
    r = run([PY, str(NODES / "filter" / "filter.py"), "--in", str(src),
             "--out-images", str(out_images), "--out-report", str(out_report)])
    check("filter: exits 0", r.returncode == 0, r.stderr)

    report = json.loads(out_report.read_text())
    check("filter: rejects the blurred frame", "2_blurred.jpg" in report["rejected"])
    check("filter: rejects the overexposed frame", "3_overexposed.jpg" in report["rejected"])
    check("filter: rejects the near-duplicate frame", "5_duplicate.jpg" in report["rejected"])
    check("filter: keeps the two normal frames",
          "1_good.jpg" in report["kept"] and "4_good.jpg" in report["kept"])


def main() -> None:
    if shutil.which("exiftool") is None:
        sys.exit("check_head: exiftool not found on PATH")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        check_correct(tmp)
        check_exif_audit(tmp)
        check_filter(tmp)

    if FAILURES:
        print(f"\n{len(FAILURES)} check(s) failed: {FAILURES}", file=sys.stderr)
        sys.exit(1)
    print("\nall head Node checks passed")


if __name__ == "__main__":
    main()
