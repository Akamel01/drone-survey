#!/usr/bin/env python3
"""Load one Mission Spec onto the Controller, into the WAYFINDER cards, over jmtpfs.

A Load writes one Spec's parts into WAYFINDER 1, 2, ... in order, so the planner
can tell the pilot which card to open before anything is plugged in (ADR 0016).
Cards and their slot GUIDs come from wayfinder_slots.json, calibrated once.

Every card is backed up before it is touched. Success is a read-back after a
fresh mount, never the copy's exit status; on any mismatch every card is put
back as it was, so a Load is all or nothing.

    python3 load.py SPEC.json --yes
    python3 load.py --newest --yes     # what cron runs while the Controller is plugged in
    python3 load.py --selftest
"""

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from push_to_rc import WAYPOINT_DIR, read_create_time, with_create_time  # noqa: E402

MOUNT = Path.home() / "rc2"
STORAGE = "Internal shared storage"
LOADS = Path.home() / "wayfinder" / "loads"
SPECS = Path.home() / "wayfinder" / "specs"
LOADED = LOADS / "loaded.json"


def newest_unloaded(specs: Path, record: Path) -> Path | None:
    """The most recently Dispatched Spec, unless it has already been Loaded.

    Only the newest counts: an older Spec that was never Loaded has been
    superseded by the pilot's latest Dispatch, and must not overwrite it.
    Dispatch timestamps are the file names and sort lexically (ADR 0017).
    """
    found = sorted(specs.glob("*/*/*.json"), key=lambda f: f.name)
    if not found:
        return None
    if not record.exists():
        # A lost record Loads nothing (ADR 0017, #38): it adopts what is already
        # there as Loaded and says so, rather than overwriting a card on a guess.
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_text(json.dumps([str(found[-1])], indent=1))
        print(f"no record of past Loads; adopted {found[-1]} as already Loaded, Loaded nothing")
        return None
    return None if str(found[-1]) in set(json.loads(record.read_text())) else found[-1]


def cards() -> list[tuple[str, str]]:
    """(card name, slot GUID), in card order."""
    slots = json.loads((HERE / "wayfinder_slots.json").read_text())["slots"]
    return sorted(slots.items(), key=lambda kv: int(kv[0].split()[-1]))


def assign(parts: list[dict], available: list[tuple[str, str]]) -> list[tuple[str, str, dict]]:
    """Part i goes into card i. Refuse rather than drop a part."""
    if len(parts) > len(available):
        sys.exit(f"{len(parts)} parts but only {len(available)} WAYFINDER cards; "
                 f"rename more cards in DJI Fly and calibrate them")
    return [(name, guid, part) for (name, guid), part in zip(available, parts)]


def build(spec: Path, out_dir: Path) -> list[dict]:
    """Run the one KMZ writer and return its per-part report."""
    done = subprocess.run(
        [sys.executable, str(HERE / "make_mission.py"), "--spec", str(spec), "--out", str(out_dir / "mission.kmz")],
        capture_output=True, text=True,
    )
    try:
        report = json.loads(done.stdout)
    except json.JSONDecodeError:
        sys.exit(f"make_mission.py failed: {done.stderr.strip() or done.stdout.strip()}")
    problems = report.get("problems", []) + [p for m in report.get("missions", []) for p in m["problems"]]
    if done.returncode != 0 or problems:
        sys.exit("refusing to Load a plan that failed its gate:\n  " + "\n  ".join(problems or [done.stderr.strip()]))
    return report["missions"]


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def mounted(mount: Path) -> bool:
    """A stale jmtpfs mount (after a Controller reboot or replug) raises EIO rather than returning False."""
    try:
        return (mount / STORAGE).is_dir()
    except OSError:
        return False


def remount(mount: Path) -> None:
    """A fresh mount, so the read-back is what the Controller holds, not a cache."""
    subprocess.run(["fusermount", "-uz", str(mount)], capture_output=True)
    done = subprocess.run(["jmtpfs", str(mount)], capture_output=True, text=True)
    if not mounted(mount):
        sys.exit(f"could not remount the Controller: {done.stderr.strip()}")


def load(spec: Path, root: Path, backups: Path, fresh_mount=None) -> list[tuple[str, dict]]:
    """Write every part, read all back, roll back on any mismatch. Returns (card, part)."""
    waypoint = root / WAYPOINT_DIR
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        plan = assign(build(spec, tmp), cards())

        staged = {}
        for card, guid, part in plan:
            live = waypoint / guid / f"{guid}.kmz"
            if not live.exists():
                sys.exit(f"{card} ({guid}) is not on the Controller; is it plugged in and unlocked?")
            backups.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(live, backups / f"{guid}.kmz")
            stage = tmp / f"{guid}.kmz"
            create_ms = read_create_time(live)
            if create_ms is None:
                shutil.copyfile(part["out"], stage)
            else:
                with_create_time(Path(part["out"]), create_ms, stage)
            staged[guid] = stage

        for card, guid, _ in plan:
            live = waypoint / guid / f"{guid}.kmz"
            live.unlink()  # a write onto an existing name can leave two objects
            shutil.copyfile(staged[guid], live)

        if fresh_mount:
            fresh_mount()
        bad = [card for card, guid, _ in plan
               if not (waypoint / guid / f"{guid}.kmz").exists()
               or md5(waypoint / guid / f"{guid}.kmz") != md5(staged[guid])]
        if bad:
            for card, guid, _ in plan:
                live = waypoint / guid / f"{guid}.kmz"
                live.unlink(missing_ok=True)
                shutil.copyfile(backups / f"{guid}.kmz", live)
            sys.exit(f"read-back did not match for {', '.join(bad)}; every card was restored "
                     f"from {backups}. Check the restore with a second Load attempt or --list.")
        return [(card, part) for card, _, part in plan]


def _selftest() -> None:
    """Offline: a fake Controller directory stands in for the mount."""
    import zipfile
    spec = {
        "version": 1, "mission_type": "grid", "site": "Selftest Field", "date": "2026-09-13",
        "aoi": [[49.1902, -122.8409], [49.191, -122.8409], [49.191, -122.8395], [49.1902, -122.8395]],
        "shape": None, "home": [49.1902, -122.8409],
        "flight": {"altitude_m": 90, "forward_overlap_pct": 85, "side_overlap_pct": 75,
                   "gimbal_pitch_deg": -80, "speed_ms": 5, "turn": "through",
                   "margin_passes": 1, "battery_minutes": 16},
        "orbit": {"center": None, "target_height_m": 0, "radius_m": 40, "altitudes_m": [40],
                  "photos_per_ring": 24, "clockwise": True},
        "camera": {"interval_s": 5, "shutter": "1/1000", "iso": "100", "white_balance": "Sunny",
                   "white_balance_k": None, "exposure_lock": True, "format": "JPEG"},
    }
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "spec.json").write_text(json.dumps(spec))
        root = tmp / "controller"
        for _, guid in cards():
            d = root / WAYPOINT_DIR / guid
            d.mkdir(parents=True)
            with zipfile.ZipFile(d / f"{guid}.kmz", "w") as z:
                z.writestr("wpmz/template.kml", "<wpml:createTime>1789000000000</wpml:createTime><wpml:author>fly</wpml:author>")
                z.writestr("wpmz/waylines.wpml", "<kml/>")

        loaded = load(tmp / "spec.json", root, tmp / "backup")
        first_card, first_guid = cards()[0]
        assert [c for c, _ in loaded] == [first_card], loaded
        live = root / WAYPOINT_DIR / first_guid / f"{first_guid}.kmz"
        assert read_create_time(live) == 1789000000000  # the slot keeps its own createTime
        assert zipfile.ZipFile(live).read("wpmz/waylines.wpml").count(b"<Placemark>") == loaded[0][1]["waypoints"]
        assert zipfile.ZipFile(tmp / "backup" / f"{first_guid}.kmz").read("wpmz/waylines.wpml") == b"<kml/>"

        # A read-back that does not match restores every card from its backup.
        def corrupt():
            live.write_bytes(b"not what was sent")
        try:
            load(tmp / "spec.json", root, tmp / "backup2", fresh_mount=corrupt)
        except SystemExit as e:
            assert "restored" in str(e), e
        else:
            raise AssertionError("a mismatched read-back was accepted")
        assert md5(live) == md5(tmp / "backup2" / f"{first_guid}.kmz")

        # --newest: only the latest Dispatch, and never twice.
        specs, record = tmp / "specs", tmp / "loaded.json"
        for stamp in ("20260913T090000Z", "20260913T140000Z"):
            f = specs / "site" / "2026-09-13" / f"{stamp}.json"
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text("{}")
        assert newest_unloaded(specs, record) is None  # no record: Load nothing, adopt the newest
        assert json.loads(record.read_text()) == [str(specs / "site" / "2026-09-13" / "20260913T140000Z.json")]
        newer = specs / "site" / "2026-09-14" / "20260914T080000Z.json"
        newer.parent.mkdir(parents=True)
        newer.write_text("{}")
        assert newest_unloaded(specs, record) == newer

        # A stale mount reads as not mounted instead of crashing the Load.
        class Stale(type(tmp)):
            def is_dir(self):
                raise OSError(5, "Input/output error")
        assert mounted(tmp) is False  # no STORAGE directory
        assert mounted(Stale(tmp)) is False

        # More parts than cards is refused, never truncated.
        try:
            assign([{}] * (len(cards()) + 1), cards())
        except SystemExit:
            pass
        else:
            raise AssertionError("more parts than cards was accepted")
    print("load self-check: ok")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("spec", nargs="?", type=Path, help="the Mission Spec to Load")
    p.add_argument("--newest", action="store_true", help="Load the newest Collected Spec if not already Loaded")
    p.add_argument("--yes", action="store_true", help="confirm replacing the WAYFINDER cards")
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    args = p.parse_args()

    if args.selftest:
        _selftest()
        return
    if args.newest:
        args.spec = newest_unloaded(SPECS, LOADED)
        if args.spec is None:
            return  # nothing new; cron calls this every minute
    if not args.spec or not args.spec.exists():
        sys.exit("name a Mission Spec file to Load")
    if not args.yes:
        sys.exit("this replaces the Missions in the WAYFINDER cards on the Controller; pass --yes")
    if not mounted(MOUNT):
        remount(MOUNT)

    stamp = time.strftime("%Y%m%dT%H%M%S")
    backups = LOADS / stamp
    loaded = load(args.spec, MOUNT / STORAGE, backups, fresh_mount=lambda: remount(MOUNT))
    sheet = "\n".join(f"Open {card}: {part['name']} ({part['waypoints']} waypoints)" for card, part in loaded)
    (backups / "cards.txt").write_text(sheet + "\n")
    done = json.loads(LOADED.read_text()) if LOADED.exists() else []
    LOADED.write_text(json.dumps(done + [str(args.spec)], indent=1))
    print(time.strftime("%Y-%m-%d %H:%M:%S"), args.spec)
    print(sheet)
    print("Close and reopen each card's waypoint editor on the Controller to load it.")


if __name__ == "__main__":
    main()
