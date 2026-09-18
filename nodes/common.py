"""Shared helpers for the head Nodes (ingest, exif-audit, filter, correct).

Kept here instead of copy-pasted into each Node, per design.md's "Node reuse
is structural." Nothing in here executes on import; every Node stays a
standalone script invoked by the Runner.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

# The extensions the photogrammetry stages treat as source imagery. They were
# two sets that disagreed (ingest took .jpg/.jpeg only; solve and the ODM client
# also take .tif/.png), which made "an image" change meaning along one Pipeline.
# Widened to the union: ODM accepts these, and a Capture that produced TIFFs was
# being silently dropped before solve ever saw it.
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".tif", ".tiff", ".png"}


def sha256_file(path: Path) -> str:
    """A file's sha256, read in chunks. The one checksum helper for every Node."""
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def require_exiftool() -> None:
    if shutil.which("exiftool") is None:
        die("exiftool not found on PATH (apt/brew install libimage-exiftool-perl / exiftool)")


def list_images(directory: Path) -> list[Path]:
    return sorted(p for p in Path(directory).iterdir() if p.suffix.lower() in IMAGE_SUFFIXES)


def read_exif_batch(paths: list[Path]) -> dict[str, dict]:
    """One exiftool call for the whole batch (-j gives JSON array); keyed by filename."""
    if not paths:
        return {}
    require_exiftool()
    out = subprocess.run(
        ["exiftool", "-j", "-n", "-GPSLatitude", "-GPSLongitude", "-Make", "-Model",
         "-ISO", "-ExposureTime", "-FNumber", "-FocalLength", "-XMP:all", *[str(p) for p in paths]],
        capture_output=True, text=True, check=True,
    )
    records = json.loads(out.stdout)
    return {Path(r["SourceFile"]).name: r for r in records}


def copy_metadata(src: Path, dst: Path) -> None:
    """Copy every EXIF/XMP tag from src onto dst in place (the re-save-drops-metadata trap).

    `-all:all` alone copies known EXIF tags but silently drops XMP properties
    in a namespace exiftool doesn't recognise (e.g. sensefly/DJI custom
    fields) -- measured on real Capture-style XMP, not assumed. `-xmp` copies
    the whole XMP packet as one block instead of tag-by-tag, which preserves
    unknown namespaces too.
    """
    require_exiftool()
    subprocess.run(
        ["exiftool", "-TagsFromFile", str(src), "-all:all", "-xmp", "-overwrite_original", str(dst)],
        capture_output=True, text=True, check=True,
    )


def _selftest() -> None:
    """Offline: image discovery picks exactly the images, and the checksum is stable."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        for name in ("b.JPG", "a.jpg", "c.tif", "d.png", "notes.txt", "clip.mp4"):
            (d / name).write_bytes(b"x")
        found = [p.name for p in list_images(d)]
        assert found == ["a.jpg", "b.JPG", "c.tif", "d.png"], found
        assert sha256_file(d / "a.jpg") == hashlib.sha256(b"x").hexdigest()
    print("common self-check: ok")


if __name__ == "__main__":
    _selftest()
