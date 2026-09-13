#!/usr/bin/env python3
"""Write a built Mission into a placeholder Mission on the Controller.

DJI Fly never rescans its waypoint directory, so a Mission cannot simply be
added. The operator creates a placeholder Mission in the app, and this script
overwrites that placeholder's KMZ in place, keeping its GUID. The app reads the
new file when the operator opens that Mission in the waypoint editor, which is
the only moment it indexes one.

DJI Fly's own database, not this file, holds the Mission name the pilot reads,
and that name is the slot's createTime formatted in America/Vancouver (ADR
0016). So every write here preserves whatever createTime is already on the
slot — only updateTime is ever genuinely ours — or the name on screen stops
describing what the file underneath actually holds.

Listing is read-only and is the default. Writing requires --guid and --yes,
because it replaces a Mission on hardware that is about to fly.
"""

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

WAYPOINT_DIR = "Android/data/dji.go.v5/files/waypoint"

# The timezone DJI Fly's mission-name clock runs on. If this Controller is ever
# flown from another timezone, this is the one line that needs to change.
PILOT_TZ = ZoneInfo("America/Vancouver")
CREATE_TIME_RE = re.compile(rb"<wpml:createTime>(\d+)</wpml:createTime>")
AUTHOR_RE = re.compile(rb"<wpml:author>([^<]*)</wpml:author>")


def mtp(*commands: str, cwd: Path | None = None, check: bool = True) -> str | None:
    """Run one aft-mtp-cli invocation. Each command is a separate argument.

    check=False turns a failure (eg. a file that isn't on the Controller) into
    None instead of exiting, for callers that have a fallback.
    """
    if shutil.which("aft-mtp-cli") is None:
        sys.exit(
            "aft-mtp-cli not found.\n"
            "  Linux: sudo apt-get install android-file-transfer\n"
            "         This is the path that has been used against the Controller.\n"
            "  macOS: no verified client. The Homebrew cask carrying aft-mtp-cli\n"
            "         is disabled for failing the Gatekeeper check, and libmtp's\n"
            "         mtp-sendfile has never been tried against the Controller."
        )
    done = subprocess.run(
        ["aft-mtp-cli", *commands],
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=300,
    )
    if done.returncode != 0:
        if not check:
            return None
        sys.exit(f"aft-mtp-cli failed: {done.stderr.strip() or done.stdout.strip()}")
    return done.stdout


def entries(path: str) -> list[str]:
    """Names in an MTP directory. aft-mtp-cli prints 'objectId<tab>name'."""
    names = []
    for line in mtp(f"ls {path}").splitlines():
        if line.startswith("selected storage"):
            continue
        parts = line.split(None, 1)
        if len(parts) == 2:
            names.append(parts[1].strip())
    return names


def placeholders() -> list[str]:
    """Mission GUIDs on the Controller, newest last is not knowable over MTP."""
    skip = {"capability", "kmzTemp", "map_preview"}
    return sorted(n for n in entries(WAYPOINT_DIR) if n not in skip)


def digest(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def fetch(remote_dir: str, filename: str, dest_dir: Path) -> Path | None:
    """Copy one file out of an MTP directory, or None if it isn't there."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    if mtp(f"cd {remote_dir}", f"get {filename}", cwd=dest_dir, check=False) is None:
        return None
    local = dest_dir / filename
    return local if local.exists() else None


def _read_template(kmz: Path) -> bytes | None:
    """Raw wpmz/template.kml bytes from a KMZ, or None if unreadable."""
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


def is_fly_authored(kmz: Path) -> bool:
    """True when DJI Fly itself, not our writer, last wrote this template.kml.

    createTime is only the slot's genuine creation moment when DJI Fly wrote it
    (<wpml:author>fly</wpml:author>). Once our writer touches a slot,
    with_create_time is supposed to carry the original createTime forward, but
    a previous buggy run may have clobbered it -- so a non-"fly" author means
    createTime can't be blindly trusted. Checked by the author tag, not file
    size: our overwritten KMZs vary in size, but never claim author "fly".
    """
    template = _read_template(kmz)
    if template is None:
        return False
    m = AUTHOR_RE.search(template)
    return m is not None and m.group(1) == b"fly"


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
    with zipfile.ZipFile(staged, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("wpmz/template.kml", template)
        z.writestr("wpmz/waylines.wpml", waylines)


def name_from_create_time(create_ms: int) -> str:
    """DJI Fly's mission name: the creation moment, to the second, in America/Vancouver.

    Verified against a photo of the controller screen (docs/adr/0016): formatting
    a slot's own createTime this way reproduces the name DJI Fly shows, exactly.
    """
    return datetime.fromtimestamp(create_ms / 1000, PILOT_TZ).strftime("%Y-%m-%d %H:%M:%S")


def name_from_jpg_mtime(mtime_epoch_s: float) -> str:
    """Same name, recovered from the map-preview JPEG's mtime.

    Unlike createTime (a genuine epoch, converted above to America/Vancouver
    because that's the pilot's zone), this mtime comes from jmtpfs, which hands
    back the Controller's local wall clock already re-encoded as a UTC epoch --
    it never applied a zone conversion of its own. Format it as UTC and stop:
    converting it to America/Vancouver on top would shift it by that zone's
    offset a second time. Measured against 37 real slots: formatting as UTC
    matched the slot's true name on 33/37; converting UTC->Vancouver matched
    0/37. Two different rules for two different sources on purpose.
    """
    return datetime.fromtimestamp(mtime_epoch_s, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def pilot_visible_name(kmz: Path | None, jpg: Path | None) -> str | None:
    """The name the pilot reads for one slot.

    createTime wins whenever it can be trusted (is_fly_authored): it's DJI
    Fly's own field and exact to the second. The JPEG mtime is used only to
    recover from a slot our own writer has touched, where a previous buggy run
    may have clobbered createTime -- the JPEG is written once, at Placeholder
    creation, and nothing we do ever touches it again. The JPEG is not treated
    as the tiebreaker for a *fly-authored* disagreement: it is itself
    corruptible (overwritten by an unrelated experiment, or off by a
    creation-vs-write race of a second or two), so a trustworthy createTime
    beats a disagreeing JPEG rather than losing to it.
    """
    exists = kmz is not None and kmz.exists()
    create_ms = read_create_time(kmz) if exists else None
    from_create = name_from_create_time(create_ms) if create_ms is not None else None
    from_jpg = name_from_jpg_mtime(jpg.stat().st_mtime) if jpg and jpg.exists() else None
    if from_create is not None and exists and is_fly_authored(kmz):
        return from_create
    return from_jpg or from_create


def pilot_visible_names(waypoint_dir: Path, guids: list[str]) -> dict[str, str | None]:
    """GUID -> the name DJI Fly shows for that slot.

    Reads from a local directory shaped like the Controller's own waypoint
    directory: <waypoint_dir>/<guid>/<guid>.kmz and
    <waypoint_dir>/map_preview/<guid>/<guid>.jpg. Kept separate from MTP so it
    can be exercised offline.
    """
    names = {}
    for guid in guids:
        kmz = waypoint_dir / guid / f"{guid}.kmz"
        jpg = waypoint_dir / "map_preview" / guid / f"{guid}.jpg"
        names[guid] = pilot_visible_name(kmz, jpg)
    return names


def fetch_waypoint_mirror(guids: list[str], dest: Path) -> None:
    """Pull each slot's KMZ and preview JPEG into a local mirror for pilot_visible_names."""
    for guid in guids:
        fetch(f"{WAYPOINT_DIR}/{guid}", f"{guid}.kmz", dest / guid)
        fetch(f"{WAYPOINT_DIR}/map_preview/{guid}", f"{guid}.jpg", dest / "map_preview" / guid)


def push(kmz: Path, guid: str) -> None:
    """Replace one placeholder's KMZ, then read it back and compare."""
    if guid not in placeholders():
        sys.exit(f"{guid} is not a Mission on the Controller. Run --list first.")

    target = f"{WAYPOINT_DIR}/{guid}"
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)

        # Carry the slot's own createTime forward. Whatever value is already
        # there — original or, on an already-broken slot, ours from a previous
        # buggy run — is what the name on screen was derived from at some point,
        # so it must not move again.
        existing = fetch(target, f"{guid}.kmz", tmp / "existing")
        create_ms = read_create_time(existing) if existing else None

        staged = tmp / f"{guid}.kmz"
        if create_ms is None:
            shutil.copyfile(kmz, staged)
        else:
            with_create_time(kmz, create_ms, staged)

        # Remove before writing: a put onto an existing name leaves two objects with
        # the same name, and DJI Fly reads whichever it indexed first.
        mtp(f"cd {target}", f"rm {guid}.kmz")
        mtp(f"cd {target}", f"put {staged}")

        back = tmp / "readback"
        mtp(f"cd {target}", f"get {guid}.kmz", cwd=back)
        returned = back / f"{guid}.kmz"
        if not returned.exists():
            sys.exit("wrote the Mission but could not read it back")
        if digest(returned) != digest(staged):
            sys.exit("the Mission on the Controller does not match what was sent")

        print(f"{guid} now holds {kmz.name} ({staged.stat().st_size} bytes, verified)")
    print("Open that Mission in the waypoint editor on the Controller to load it.")


def _selftest() -> None:
    """Offline proof: createTime survives a round trip, and a known epoch formats
    to the expected name. No test framework, no controller — run directly:

        python3 scripts/mission/push_to_rc.py --selftest
    """
    # 1. createTime is a genuine epoch: formatting it in America/Vancouver
    # reproduces the exact name DJI Fly shows.
    local = datetime(2026, 9, 13, 11, 15, 3, tzinfo=PILOT_TZ)
    epoch_ms = int(local.timestamp() * 1000)
    assert name_from_create_time(epoch_ms) == "2026-09-13 11:15:03"

    # 1b. JPEG mtime is different: jmtpfs already hands back the Controller's
    # local wall clock re-encoded as a UTC epoch, so formatting it as UTC (no
    # further zone conversion) must reproduce the same name. Converting it to
    # America/Vancouver on top -- the old, wrong behaviour -- would shift this
    # by the zone's 7-8 hour offset and fail this assertion.
    wall_clock_as_utc_epoch = datetime(2026, 9, 13, 11, 15, 3, tzinfo=timezone.utc).timestamp()
    assert name_from_jpg_mtime(wall_clock_as_utc_epoch) == "2026-09-13 11:15:03"

    # 2. createTime survives with_create_time; updateTime is untouched.
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        built, staged = tmp / "built.kmz", tmp / "staged.kmz"
        with zipfile.ZipFile(built, "w") as z:
            z.writestr(
                "wpmz/template.kml",
                "<wpml:createTime>1000</wpml:createTime>"
                "<wpml:updateTime>2000</wpml:updateTime>",
            )
            z.writestr("wpmz/waylines.wpml", "<kml/>")
        assert read_create_time(built) == 1000

        with_create_time(built, epoch_ms, staged)
        assert read_create_time(staged) == epoch_ms
        with zipfile.ZipFile(staged) as z:
            assert b"<wpml:updateTime>2000</wpml:updateTime>" in z.read("wpmz/template.kml")
            assert z.read("wpmz/waylines.wpml") == b"<kml/>"

        # 3. pilot_visible_name: a trustworthy (fly-authored) createTime wins
        # even when the JPEG disagrees with it -- the JPEG is only recovery for
        # a slot our own writer has touched.
        guid = "TESTGUID"
        base = tmp / "waypoint"
        (base / guid).mkdir(parents=True)
        (base / "map_preview" / guid).mkdir(parents=True)
        slot_kmz = base / guid / f"{guid}.kmz"
        jpg = base / "map_preview" / guid / f"{guid}.jpg"
        jpg.write_bytes(b"jpeg")
        import os

        jpg_names_utc = "2026-09-13 11:15:03"
        jpg_mtime = datetime(2026, 9, 13, 11, 15, 3, tzinfo=timezone.utc).timestamp()
        os.utime(jpg, (jpg_mtime, jpg_mtime))

        disagreeing_ms = epoch_ms + 3600_000  # one hour off from the JPEG
        with zipfile.ZipFile(slot_kmz, "w") as z:
            z.writestr(
                "wpmz/template.kml",
                f"<wpml:createTime>{disagreeing_ms}</wpml:createTime>"
                "<wpml:author>fly</wpml:author>",
            )
            z.writestr("wpmz/waylines.wpml", "<kml/>")
        names = pilot_visible_names(base, [guid])
        assert names[guid] == name_from_create_time(disagreeing_ms)
        assert names[guid] != jpg_names_utc

        # Same disagreeing createTime, but authored by us, not "fly": it may be
        # a previous run's clobber, so the JPEG recovers the slot's real name.
        with zipfile.ZipFile(slot_kmz, "w") as z:
            z.writestr(
                "wpmz/template.kml",
                f"<wpml:createTime>{disagreeing_ms}</wpml:createTime>"
                "<wpml:author>ours</wpml:author>",
            )
            z.writestr("wpmz/waylines.wpml", "<kml/>")
        names = pilot_visible_names(base, [guid])
        assert names[guid] == jpg_names_utc

    print("push_to_rc self-check: ok")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--list", action="store_true", help="Missions on the Controller")
    p.add_argument("--kmz", type=Path, help="the built Mission to write")
    p.add_argument("--guid", help="the placeholder Mission to overwrite")
    p.add_argument("--yes", action="store_true", help="confirm replacing a Mission")
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    args = p.parse_args()

    if args.selftest:
        _selftest()
        return

    if args.list or not args.kmz:
        found = placeholders()
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            fetch_waypoint_mirror(found, tmp)
            names = pilot_visible_names(tmp, found)
        print(f"{len(found)} Missions on the Controller:")
        for g in found:
            print(f"  {g}  {names.get(g) or '(name unreadable)'}")
        return

    if not args.guid:
        sys.exit("--guid is required: name the placeholder Mission to overwrite")
    if not args.kmz.exists():
        sys.exit(f"no such Mission file: {args.kmz}")
    if not args.yes:
        sys.exit(f"this replaces Mission {args.guid} on the Controller; pass --yes")

    push(args.kmz, args.guid)


if __name__ == "__main__":
    main()
