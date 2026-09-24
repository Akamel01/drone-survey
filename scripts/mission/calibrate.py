#!/usr/bin/env python3
"""Calibrate the way finder Cards: which Controller folder is behind each name (ADR 0016).

The names the operator sees live only in DJI Fly's private database, which USB
cannot reach, so the link from a name to a folder has to be read off the
screen. Every folder is given a marker Mission with its own point count; the
operator opens each Card and reads the count inside it (never the count on the
list, which DJI Fly does not refresh when a file is replaced). A count names
exactly one folder, so the readings name every Card.

    python3 calibrate.py --write            # a marker in every folder; backs up first
    python3 calibrate.py --match READINGS   # "6 21" per line: Card number, count read
    python3 calibrate.py --selftest

Counts run from 20 up. There are no teens, so a misheard "thirteen" for
"thirty" (the operator dictates) names no folder, and is refused rather than
matched.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
import time
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from load import LOADS, MOUNT, STORAGE, md5, mounted, remount, survey  # noqa: E402
from kmz import WAYPOINT_DIR  # noqa: E402

FIRST_COUNT = 20
MARKER_MAP = Path.home() / "wayfinder" / "marker-map.json"
SLOTS = HERE / "wayfinder_slots.json"
PLACEMARK = re.compile(r"<Placemark>.*?</Placemark>", re.S)


def placemark_count(kmz: Path) -> int:
    with zipfile.ZipFile(kmz) as z:
        return len(PLACEMARK.findall(z.read("wpmz/waylines.wpml").decode()))


def marker(source: Path, n: int, own: Path, out: Path) -> None:
    """A Mission of n points built from source's first two, keeping own's template.kml.

    own's template.kml carries the folder's createTime, which DJI Fly keys the
    Card from, so it is kept byte for byte. Each point's action group covers
    only that point, so the points are copied with their index rewritten.
    """
    with zipfile.ZipFile(source) as z:
        waylines = z.read("wpmz/waylines.wpml").decode()
    with zipfile.ZipFile(own) as z:
        template = z.read("wpmz/template.kml")
    first, second = PLACEMARK.findall(waylines)[:2]
    lon, lat = map(float, re.search(r"<coordinates>\s*([-\d.]+),([-\d.]+)", first).groups())
    points = []
    for i in range(n):
        p = first if i == 0 else second
        p = re.sub(r"<wpml:index>\d+<", f"<wpml:index>{i}<", p)
        p = re.sub(r"<wpml:actionGroupId>\d+<", f"<wpml:actionGroupId>{i + 1}<", p)
        p = re.sub(r"<wpml:actionGroupStartIndex>\d+<", f"<wpml:actionGroupStartIndex>{i}<", p)
        p = re.sub(r"<wpml:actionGroupEndIndex>\d+<", f"<wpml:actionGroupEndIndex>{i}<", p)
        # Rows of ten, about 11 m apart: a small, obviously-not-a-survey shape.
        p = re.sub(r"<coordinates>.*?</coordinates>",
                   f"<coordinates>{lon + (i % 10) * 0.00015:.12f},{lat + (i // 10) * 0.0001:.12f}</coordinates>",
                   p, flags=re.S)
        points.append(p)
    head = waylines[:waylines.index("<Placemark>")]
    tail = waylines[waylines.rindex("</Placemark>") + len("</Placemark>"):]
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        dst.writestr("wpmz/template.kml", template)
        dst.writestr("wpmz/waylines.wpml", head + "\n      ".join(points) + tail)


def write_markers(root: Path, backups: Path, fresh_mount=None) -> dict[str, int]:
    """Back up every folder, give each its own count, read all back. All or nothing."""
    waypoint = root / WAYPOINT_DIR
    guids = [guid for _, guid in survey(root)]
    backups.mkdir(parents=True, exist_ok=True)
    for guid in guids:
        shutil.copyfile(waypoint / guid / f"{guid}.kmz", backups / f"{guid}.kmz")
    source = next((backups / f"{g}.kmz" for g in guids if placemark_count(backups / f"{g}.kmz") >= 2), None)
    if source is None:
        sys.exit("no Mission on the Controller has two points to build a marker from; nothing was touched")
    counts = {guid: FIRST_COUNT + i for i, guid in enumerate(guids)}
    with tempfile.TemporaryDirectory() as tmp:
        staged = {}
        for guid, n in counts.items():
            staged[guid] = Path(tmp) / f"{guid}.kmz"
            marker(source, n, backups / f"{guid}.kmz", staged[guid])
        for guid in guids:
            live = waypoint / guid / f"{guid}.kmz"
            live.unlink()  # a write onto an existing name can leave two objects
            shutil.copyfile(staged[guid], live)
        if fresh_mount:
            fresh_mount()
        bad = [g for g in guids if md5(waypoint / g / f"{g}.kmz") != md5(staged[g])]
    if bad:
        for guid in guids:
            live = waypoint / guid / f"{guid}.kmz"
            live.unlink(missing_ok=True)
            shutil.copyfile(backups / f"{guid}.kmz", live)
        sys.exit(f"read-back did not match for {len(bad)} folders; every folder was restored from {backups}")
    return counts


def match(readings: dict[int, int], counts: dict[str, int]) -> tuple[dict[str, str], list[str]]:
    """Card number -> folder, from what the operator read. Refuses anything ambiguous.

    Returns the slots and the folders no Card claimed (left over, not shown by DJI Fly).
    """
    by_count = {n: guid for guid, n in counts.items()}
    problems = [f"Way Finder {card}: {n} is not a marker count" for card, n in readings.items()
                if n not in by_count]
    seen: dict[int, int] = {}
    for card, n in sorted(readings.items()):
        if n in seen:
            problems.append(f"Way Finder {seen[n]} and Way Finder {card} both read {n}")
        seen[n] = card
    if problems:
        raise ValueError("nothing was written:\n  " + "\n  ".join(problems))
    slots = {f"way finder {card}": by_count[n] for card, n in sorted(readings.items())}
    leftover = sorted(set(counts) - set(slots.values()))
    return slots, leftover


def parse(text: str) -> dict[int, int]:
    readings: dict[int, int] = {}
    for line in text.splitlines():
        nums = re.findall(r"\d+", line)
        if not nums:
            continue
        if len(nums) != 2:
            raise ValueError(f"expected 'card count', got: {line!r}")
        card, n = map(int, nums)
        if card in readings:
            raise ValueError(f"Way Finder {card} was read twice")
        readings[card] = n
    return readings


def _selftest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        root = tmp / "controller"
        pm = ("<Placemark><Point><coordinates>-122.8409,49.19</coordinates></Point>"
              "<wpml:index>{i}</wpml:index><wpml:actionGroupId>{g}</wpml:actionGroupId>"
              "<wpml:actionGroupStartIndex>{i}</wpml:actionGroupStartIndex>"
              "<wpml:actionGroupEndIndex>{i}</wpml:actionGroupEndIndex></Placemark>")
        guids = ["A-1", "B-2", "C-3"]
        for k, guid in enumerate(guids):
            d = root / WAYPOINT_DIR / guid
            d.mkdir(parents=True)
            with zipfile.ZipFile(d / f"{guid}.kmz", "w") as z:
                z.writestr("wpmz/template.kml", f"<wpml:createTime>{1000 + k}</wpml:createTime>")
                z.writestr("wpmz/waylines.wpml",
                           "<kml><Folder>" + pm.format(i=0, g=1) + pm.format(i=1, g=2) + "</Folder></kml>")
        counts = write_markers(root, tmp / "backup")
        assert sorted(counts.values()) == [20, 21, 22], counts
        for guid, n in counts.items():
            live = root / WAYPOINT_DIR / guid / f"{guid}.kmz"
            assert placemark_count(live) == n
            with zipfile.ZipFile(live) as z:
                w = z.read("wpmz/waylines.wpml").decode()
                assert f"<wpml:index>{n - 1}</wpml:index>" in w
                assert f"<wpml:actionGroupEndIndex>{n - 1}<" in w
                assert z.read("wpmz/template.kml").decode().startswith("<wpml:createTime>100"), \
                    "the folder keeps its own createTime"

        # A read-back that disagrees puts every folder back.
        before = {g: md5(tmp / "backup" / f"{g}.kmz") for g in guids}
        try:
            write_markers(root, tmp / "backup2",
                          fresh_mount=lambda: (root / WAYPOINT_DIR / "B-2" / "B-2.kmz").write_bytes(b"x"))
        except SystemExit as e:
            assert "restored" in str(e), e
        else:
            raise AssertionError("a mismatched read-back was accepted")
        assert {g: md5(tmp / "backup2" / f"{g}.kmz") for g in guids} == \
               {g: md5(root / WAYPOINT_DIR / g / f"{g}.kmz") for g in guids}
        del before

    counts = {"A": 20, "B": 21, "C": 22}
    slots, leftover = match({1: 21, 2: 20}, counts)
    assert slots == {"way finder 1": "B", "way finder 2": "A"} and leftover == ["C"]
    for bad in ({1: 13}, {1: 20, 2: 20}):  # misheard teen; two Cards one folder
        try:
            match(bad, counts)
        except ValueError:
            pass
        else:
            raise AssertionError(f"accepted {bad}")
    assert parse("6 21\nWay Finder 7: 44\n\n") == {6: 21, 7: 44}
    print("calibrate self-check: ok")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--write", action="store_true", help="put a marker in every folder")
    g.add_argument("--match", type=Path, help="file of 'card count' lines read off the Controller")
    g.add_argument("--selftest", action="store_true")
    args = p.parse_args()
    if args.selftest:
        _selftest()
        return
    if args.write:
        if not mounted(MOUNT):
            remount(MOUNT)
        backups = LOADS / f"calibrate-{time.strftime('%Y%m%dT%H%M%S')}"
        counts = write_markers(MOUNT / STORAGE, backups, fresh_mount=lambda: remount(MOUNT))
        MARKER_MAP.write_text(json.dumps(counts, indent=1))
        print(f"{len(counts)} markers written and read back, counts "
              f"{min(counts.values())}-{max(counts.values())}; originals in {backups}")
        print("Force-close DJI Fly, reopen it, then open each Card and read the count inside.")
        return
    counts = json.loads(MARKER_MAP.read_text())
    slots, leftover = match(parse(args.match.read_text()), counts)
    doc = json.loads(SLOTS.read_text())
    doc.update(calibrated=time.strftime("%Y-%m-%d"), slots=slots)
    SLOTS.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"{len(slots)} Cards calibrated into {SLOTS}")
    for guid in leftover:
        print(f"  no Card reads {counts[guid]}: {guid} is on the Controller but not in DJI Fly's list")


if __name__ == "__main__":
    main()
