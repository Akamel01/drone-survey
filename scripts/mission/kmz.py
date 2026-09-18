#!/usr/bin/env python3
"""The KMZ corner of the Load path, without a Controller attached.

A Mission reaches the Controller as a KMZ. Loading one replaces a Placeholder
Mission, and the Controller tells the two apart by the mission's creation time
(ADR 0016), which lives inside the KMZ as template.kml's createTime. These three
helpers are the whole of that knowledge; the rest of the older Push path they
came from is gone.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

WAYPOINT_DIR = "Android/data/dji.go.v5/files/waypoint"

# The one field Load has to rewrite: the moment the mission was created.
CREATE_TIME_RE = re.compile(rb"<wpml:createTime>(\d+)</wpml:createTime>")


def _read_template(kmz: Path) -> bytes | None:
    """Return raw bytes of the template.kml inside the KMZ, or None if unreadable."""
    try:
        with zipfile.ZipFile(kmz) as z:
            return z.read("wpmz/template.kml")
    except (OSError, KeyError, zipfile.BadZipFile):
        return None


def read_create_time(kmz: Path) -> int | None:
    """The epoch-millisecond createTime baked into a KMZ's template.kml."""
    template = _read_template(kmz)
    if template is None:
        return None
    m = CREATE_TIME_RE.search(template)
    return int(m.group(1)) if m else None


def with_create_time(kmz: Path, create_ms: int, staged: Path) -> None:
    """Copy kmz to staged with template.kml's createTime forced to create_ms.

    updateTime is left alone: it is genuinely when we wrote this file. Only
    createTime has to lie, because it is the field DJI Fly's mission name comes
    from, and only the slot's own value may ever appear there.
    """
    with zipfile.ZipFile(kmz) as src:
        template = src.read("wpmz/template.kml")
        waylines = src.read("wpmz/waylines.wpml")
    template = CREATE_TIME_RE.sub(
        f"<wpml:createTime>{create_ms}</wpml:createTime>".encode(), template, count=1
    )
    staged.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as dst:
        dst.writestr("wpmz/template.kml", template)
        dst.writestr("wpmz/waylines.wpml", waylines)


def _selftest() -> None:
    """Offline self-check: read and rewrite a synthetic KMZ, no Controller."""
    import tempfile

    # Build a tiny KMZ with a known createTime and updateTime.
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        built = tmp / "built.kmz"
        staged = tmp / "staged.kmz"
        with zipfile.ZipFile(built, "w") as z:
            z.writestr(
                "wpmz/template.kml",
                "<wpml:createTime>1000</wpml:createTime><wpml:updateTime>2000</wpml:updateTime>",
            )
            z.writestr("wpmz/waylines.wpml", "<kml/>")

        # 1) read_create_time reads 1000
        assert read_create_time(built) == 1000

        # 2) with_create_time copies and updates createTime on staged
        epoch_ms = 1234567890000
        with_create_time(built, epoch_ms, staged)
        assert read_create_time(staged) == epoch_ms
        with zipfile.ZipFile(staged) as z:
            tpl = z.read("wpmz/template.kml")
            assert f"<wpml:createTime>{epoch_ms}</wpml:createTime>" in tpl.decode()
            assert z.read("wpmz/waylines.wpml") == b"<kml/>"

    print("kmz self-check: ok")


if __name__ == "__main__":
    # Simple offline self-test entrypoint for manual runs.
    import argparse

    p = argparse.ArgumentParser(description="kmz helpers")
    p.add_argument("--selftest", action="store_true", help="run offline self-test and exit")
    args = p.parse_args()
    if getattr(args, "selftest", False):
        _selftest()
