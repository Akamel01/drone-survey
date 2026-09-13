#!/usr/bin/env python3
"""Write a built Mission into a placeholder Mission on the Controller.

DJI Fly never rescans its waypoint directory, so a Mission cannot simply be
added. The operator creates a placeholder Mission in the app, and this script
overwrites that placeholder's KMZ in place, keeping its GUID. The app reads the
new file when the operator opens that Mission in the waypoint editor, which is
the only moment it indexes one.

Listing is read-only and is the default. Writing requires --guid and --yes,
because it replaces a Mission on hardware that is about to fly.
"""

import argparse
import hashlib
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

WAYPOINT_DIR = "Android/data/dji.go.v5/files/waypoint"


def mtp(*commands: str, cwd: Path | None = None) -> str:
    """Run one aft-mtp-cli invocation. Each command is a separate argument."""
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


def push(kmz: Path, guid: str) -> None:
    """Replace one placeholder's KMZ, then read it back and compare."""
    if guid not in placeholders():
        sys.exit(f"{guid} is not a Mission on the Controller. Run --list first.")

    target = f"{WAYPOINT_DIR}/{guid}"
    staged = Path(tempfile.gettempdir()) / f"{guid}.kmz"
    shutil.copyfile(kmz, staged)

    # Remove before writing: a put onto an existing name leaves two objects with
    # the same name, and DJI Fly reads whichever it indexed first.
    mtp(f"cd {target}", f"rm {guid}.kmz")
    mtp(f"cd {target}", f"put {staged}")

    with tempfile.TemporaryDirectory() as back:
        mtp(f"cd {target}", f"get {guid}.kmz", cwd=Path(back))
        returned = Path(back) / f"{guid}.kmz"
        if not returned.exists():
            sys.exit("wrote the Mission but could not read it back")
        if digest(returned) != digest(kmz):
            sys.exit("the Mission on the Controller does not match what was sent")

    print(f"{guid} now holds {kmz.name} ({kmz.stat().st_size} bytes, verified)")
    print("Open that Mission in the waypoint editor on the Controller to load it.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--list", action="store_true", help="Missions on the Controller")
    p.add_argument("--kmz", type=Path, help="the built Mission to write")
    p.add_argument("--guid", help="the placeholder Mission to overwrite")
    p.add_argument("--yes", action="store_true", help="confirm replacing a Mission")
    args = p.parse_args()

    if args.list or not args.kmz:
        found = placeholders()
        print(f"{len(found)} Missions on the Controller:")
        for g in found:
            print(f"  {g}")
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
