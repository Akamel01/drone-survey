#!/usr/bin/env python3
"""Load Mission Specs onto the Controller, into the WAYFINDER cards, over jmtpfs.

One plug-in Loads every waiting Spec, oldest first, each mission's parts into
successive WAYFINDER cards — so several Dispatched missions all land, each
traceable to its card (ADR 0016). Cards and their slot GUIDs come from
wayfinder_slots.json, calibrated once.

Every card is backed up before it is touched. Success is a read-back after a
fresh mount, never the copy's exit status; on any mismatch every card is put
back as it was, so a Load is all or nothing. A queue that does not fit the
cards is refused before anything is touched, never partially Loaded.

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
from kmz import WAYPOINT_DIR, read_create_time, with_create_time  # noqa: E402
import b2_status  # noqa: E402  (network to B2 only; no mount, no Controller)
import keys  # noqa: E402

MOUNT = Path.home() / "rc2"
STORAGE = "Internal shared storage"
LOADS = Path.home() / "wayfinder" / "loads"
SPECS = Path.home() / "wayfinder" / "specs"
LOADED = LOADS / "loaded.json"


DEFAULT_STATUS_CONFIG = Path.home() / ".config" / "wayfinder" / "b2-status.env"


def unloaded_queue(specs: Path, record: Path) -> list[Path]:
    """Every Collected Spec not yet Loaded, oldest first — newest per Site/date.

    Supersession is newest-wins per (Site, date): an older Dispatch the pilot
    replaced is never Loaded behind its replacement's back — the Status tab
    shows it as superseded once the newer one Loads. Dispatch timestamps are
    the file names and sort lexically (ADR 0017).
    """
    found = sorted(specs.glob("*/*/*.json"), key=lambda f: f.relative_to(specs).as_posix())
    if not found:
        return []
    if not record.exists():
        # A lost record Loads nothing (ADR 0017, #38): it adopts everything
        # already there as Loaded and says so, rather than overwriting cards
        # on a guess.
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_text(json.dumps([str(f) for f in found], indent=1))
        print(f"no record of past Loads; adopted {len(found)} Specs as already Loaded, Loaded nothing")
        return []
    done = set(json.loads(record.read_text()))
    waiting = [f for f in found if str(f) not in done]
    # Per group, only the newest Dispatch is ever loadable: an older one stays
    # unloaded while its replacement waits, and stays unloaded forever after
    # its replacement has Loaded. Its state is visible in the Status tab.
    newest: dict[tuple[str, str], Path] = {}
    for f in found:
        rel = f.relative_to(specs).parts
        if len(rel) == 3:
            newest[(rel[0], rel[1])] = f  # sorted oldest-first: last write wins
    queue = sorted((f for f in newest.values() if str(f) not in done),
                   key=lambda f: f.relative_to(specs).as_posix())
    # Apply per-run skip list if available locally (specs/_status/skipped.json).
    def _load_local_skipped() -> dict:
        p = specs / "_status" / "skipped.json"
        if not p.exists():
            return {}
        try:
            obj = json.loads(p.read_text())
            # The same shape the store uses: specKey -> {withdrawn_at}.
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    skipped = _load_local_skipped()
    if skipped:
        # Normalize to the tail path relative to SPECS so we can compare with queue paths
        def _tail(p: Path) -> str:
            try:
                t = p.relative_to(specs.parent).as_posix()
                # Normalize to drop the leading 'specs/' if present to compare with tails
                if t.startswith(keys.SPEC_PREFIX):
                    return t[len(keys.SPEC_PREFIX) :]
                return t
            except Exception:
                return str(p)
        # Build a set of tails that are skipped
        tails = set()
        for s in skipped:
            if isinstance(s, str) and s.startswith(keys.SPEC_PREFIX):
                tails.add(s.split(keys.SPEC_PREFIX, 1)[-1])
            else:
                tails.add(str(s))
        queue = [f for f in queue if _tail(f) not in tails]
    skipped = len(waiting) - len(queue)
    if skipped:
        print(f"{skipped} superseded Specs stay unloaded (a newer Dispatch of their Site/date goes first)")
    return queue


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
    # The queue path gives each Spec its own subdirectory so two missions'
    # parts cannot collide on `mission.kmz`; that subdirectory does not exist
    # yet. Created here rather than at each call site because the writer's
    # failure is a bare FileNotFoundError from inside zipfile, which reads as
    # "make_mission.py is broken" and cost a field Load to diagnose.
    out_dir.mkdir(parents=True, exist_ok=True)
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


def load_all(entries: list[tuple[Path, list[dict]]], root: Path, backups: Path,
             fresh_mount=None) -> list[tuple[Path, str, dict]]:
    """Write every mission's parts to successive cards, read all back, roll
    back on any mismatch. Returns (spec, card, part). Refuses the whole queue
    before touching a card when the parts do not fit — never a partial Load."""
    waypoint = root / WAYPOINT_DIR
    total = sum(len(parts) for _, parts in entries)
    if total > len(cards()):
        waiting = ", ".join(spec.name for spec, _ in entries)
        raise b2_status.QueueOverflowError(
            f"{total} parts waiting ({waiting}) but only {len(cards())} WAYFINDER cards; "
            f"nothing was touched. Dispatch fewer missions or clear a card, then replug.")
    # Assign sequentially: mission i's parts take the next free cards in order.
    plan: list[tuple[Path, str, str, dict]] = []
    free = cards()
    for spec, parts in entries:
        chunk = assign(parts, free)
        plan.extend([(spec, name, guid, part) for (name, guid, part) in chunk])
        free = free[len(chunk):]
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        staged = {}
        for spec, card, guid, part in plan:
            live = waypoint / guid / f"{guid}.kmz"
            if not live.exists():
                sys.exit(f"{card} ({guid}) is not on the Controller; is it plugged in and unlocked?")
            backups.mkdir(parents=True, exist_ok=True)
            if not (backups / f"{guid}.kmz").exists():
                shutil.copyfile(live, backups / f"{guid}.kmz")
            stage = tmp / f"{guid}.kmz"
            create_ms = read_create_time(live)
            if create_ms is None:
                shutil.copyfile(part["out"], stage)
            else:
                with_create_time(Path(part["out"]), create_ms, stage)
            staged[guid] = stage

        for _, card, guid, _ in plan:
            live = waypoint / guid / f"{guid}.kmz"
            live.unlink()  # a write onto an existing name can leave two objects
            shutil.copyfile(staged[guid], live)

        if fresh_mount:
            fresh_mount()
        bad = [card for _, card, guid, _ in plan
               if not (waypoint / guid / f"{guid}.kmz").exists()
               or md5(waypoint / guid / f"{guid}.kmz") != md5(staged[guid])]
        if bad:
            for _, card, guid, _ in plan:
                live = waypoint / guid / f"{guid}.kmz"
                live.unlink(missing_ok=True)
                shutil.copyfile(backups / f"{guid}.kmz", live)
            sys.exit(f"read-back did not match for {', '.join(bad)}; every card was restored "
                     f"from {backups}. Check the restore with a second Load attempt or --list.")
        return [(spec, card, part) for spec, card, _, part in plan]


def load(spec: Path, root: Path, backups: Path, fresh_mount=None) -> list[tuple[str, dict]]:
    """Write one Spec's parts, read back, roll back on mismatch. Returns (card, part)."""
    with tempfile.TemporaryDirectory() as tmp:
        loaded = load_all([(spec, build(spec, Path(tmp)))], root, backups, fresh_mount)
    return [(card, part) for _, card, part in loaded]


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

        # The queue: newest unloaded per Site/date, oldest group first.
        specs, record = tmp / "specs", tmp / "loaded.json"
        for stamp in ("20260913T090000Z", "20260913T140000Z"):
            f = specs / "site" / "2026-09-13" / f"{stamp}.json"
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text("{}")
        assert unloaded_queue(specs, record) == []  # no record: Load nothing, adopt everything
        assert json.loads(record.read_text()) == [
            str(specs / "site" / "2026-09-13" / "20260913T090000Z.json"),
            str(specs / "site" / "2026-09-13" / "20260913T140000Z.json"),
        ]
        newer = specs / "site" / "2026-09-14" / "20260914T080000Z.json"
        newer.parent.mkdir(parents=True)
        newer.write_text("{}")
        assert unloaded_queue(specs, record) == [newer]
        # A superseded Dispatch in the same group never jumps the queue.
        older = specs / "site" / "2026-09-14" / "20260914T070000Z.json"
        older.write_text("{}")
        assert unloaded_queue(specs, record) == [newer]
        record.write_text(json.dumps(json.loads(record.read_text()) + [str(newer)]))
        assert unloaded_queue(specs, record) == []  # replacement Loaded: the older one never follows

        # Withdrawing the newest never promotes its superseded sibling (M-57-HOST trap).
        record.write_text(json.dumps(json.loads(record.read_text())[:-1]))  # newer waits again
        (specs / "_status").mkdir(parents=True, exist_ok=True)
        (specs / "_status" / "skipped.json").write_text(
            json.dumps({"specs/site/2026-09-14/20260914T080000Z.json": {"withdrawn_at": "2026-09-14T09:00:00Z"}}))
        assert unloaded_queue(specs, record) == []  # withdrawn newest: the older sibling stays unloaded
        (specs / "_status" / "skipped.json").unlink()
        assert unloaded_queue(specs, record) == [newer]  # un-withdrawn / missing file: full queue

        # build() creates the directory it is handed: the queue path passes one
        # per Spec that does not exist yet, and only that path does.
        missing = tmp / "never-created" / "deeper"
        spec_for_build = specs / "rehearsal" / "2026-09-13" / "20260913T000000Z.json"
        assert not missing.exists()
        try:
            build(spec_for_build, missing)
        except SystemExit:
            pass  # the writer may still refuse this fixture; the directory is the point
        assert missing.is_dir(), "build() must create the directory it writes into"

        # The shape report_loaded() is handed matches what _group_by_spec returns.
        grouped = _group_by_spec([
            (specs / "a.json", "WAYFINDER 1", {"name": "A", "waypoints": 3}),
            (specs / "a.json", "WAYFINDER 2", {"name": "A2", "waypoints": 2}),
            (specs / "b.json", "WAYFINDER 3", {"name": "B", "waypoints": 7}),
        ])
        assert [(spec.name, [c for c, _ in group]) for spec, group in grouped] == [
            ("a.json", ["WAYFINDER 1", "WAYFINDER 2"]),
            ("b.json", ["WAYFINDER 3"]),
        ], grouped
        for _, group in grouped:
            for card, part in group:  # two values, not three
                assert isinstance(card, str) and "waypoints" in part

        # Sequential card assignment across missions, oldest first.
        fake = [
            (specs / "a.json", [{"name": "A", "waypoints": 10}, {"name": "A2", "waypoints": 5}]),
            (specs / "b.json", [{"name": "B", "waypoints": 7}]),
        ]
        got_cards: list[str] = []
        free = cards()
        for _, parts in fake:
            chunk = assign(parts, free)
            got_cards.extend(c for c, _, _ in chunk)
            free = free[len(chunk):]
        assert got_cards == ["WAYFINDER 1", "WAYFINDER 2", "WAYFINDER 3"], got_cards

        # A queue that does not fit raises before anything is staged.
        try:
            load_all([(specs / "big.json", [{"name": "x", "waypoints": 1}] * (len(cards()) + 1))],
                     root, tmp / "backup3")
        except b2_status.QueueOverflowError as e:
            assert "only" in str(e) and "WAYFINDER" in str(e), e
        else:
            raise AssertionError("an overfull queue was accepted")

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
    p.add_argument("--newest", action="store_true",
                   help="Load every Collected Spec not yet Loaded, oldest first (what cron runs)")
    p.add_argument("--yes", action="store_true", help="confirm replacing the WAYFINDER cards")
    p.add_argument("--status-config", type=Path, default=DEFAULT_STATUS_CONFIG,
                   help="B2 status credentials env file (read specs/, write status/*)")
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    args = p.parse_args()

    if args.selftest:
        _selftest()
        return
    stamp = time.strftime("%Y%m%dT%H%M%S")
    backups = LOADS / stamp
    if args.newest:
        # Refresh the withdraw skip-list at Load start so a withdrawal made
        # after the last Collect still holds; falls back to Collect's synced
        # copy. Best-effort and never fatal to the Load (offline-safe).
        try:
            from collect import load_env, authorize, download  # local import: same bin dir
            _senv = load_env(args.status_config)
            _sauth = authorize(_senv["B2_KEY_ID"], _senv["B2_APP_KEY"])
            _data = download(_sauth["downloadUrl"], _sauth["allowed"]["bucketName"],
                             keys.SKIPPED_KEY, _sauth["authorizationToken"])
            (SPECS / "_status").mkdir(parents=True, exist_ok=True)
            (SPECS / "_status" / "skipped.json").write_bytes(_data)
        except (Exception, SystemExit):
            pass
        queue = unloaded_queue(SPECS, LOADED)
        if not queue:
            return  # nothing new; cron calls this every minute
        if not args.yes:
            sys.exit("this replaces the Missions in the WAYFINDER cards on the Controller; pass --yes")
        if not mounted(MOUNT):
            remount(MOUNT)
        with tempfile.TemporaryDirectory() as tmp:
            entries = [(spec, build(spec, Path(tmp) / spec.stem)) for spec in queue]
            try:
                loaded = load_all(entries, MOUNT / STORAGE, backups, fresh_mount=lambda: remount(MOUNT))
            except b2_status.QueueOverflowError as e:
                report_overflow(args.status_config, queue, sum(len(p) for _, p in entries))
                sys.exit(str(e))
        sheet = "\n".join(f"Open {card}: {part['name']} ({part['waypoints']} waypoints) [{spec.name}]"
                          for spec, card, part in loaded)
        (backups / "cards.txt").write_text(sheet + "\n")
        done = json.loads(LOADED.read_text()) if LOADED.exists() else []
        LOADED.write_text(json.dumps(done + [str(spec) for spec, _, _ in loaded], indent=1))
        # _group_by_spec already yields (card, part) pairs; re-unpacking them as
        # triples raised ValueError *after* the cards were written and read back,
        # so a Load that fully succeeded reported nothing and the Status tab
        # showed it as never Loaded.
        report_loaded(args.status_config,
                      [(spec_key(spec), group) for spec, group in _group_by_spec(loaded)])
        print(time.strftime("%Y-%m-%d %H:%M:%S"), ", ".join(str(s) for s in queue))
        print(sheet)
        print("Close and reopen each card's waypoint editor on the Controller to load it.")
        return
    if not args.spec or not args.spec.exists():
        sys.exit("name a Mission Spec file to Load")
    if not args.yes:
        sys.exit("this replaces the Missions in the WAYFINDER cards on the Controller; pass --yes")
    if not mounted(MOUNT):
        remount(MOUNT)

    backups = LOADS / stamp
    loaded = load(args.spec, MOUNT / STORAGE, backups, fresh_mount=lambda: remount(MOUNT))
    sheet = "\n".join(f"Open {card}: {part['name']} ({part['waypoints']} waypoints)" for card, part in loaded)
    (backups / "cards.txt").write_text(sheet + "\n")
    done = json.loads(LOADED.read_text()) if LOADED.exists() else []
    LOADED.write_text(json.dumps(done + [str(args.spec)], indent=1))
    report_loaded(args.status_config, [(spec_key(args.spec), loaded)])
    print(time.strftime("%Y-%m-%d %H:%M:%S"), args.spec)
    print(sheet)
    print("Close and reopen each card's waypoint editor on the Controller to load it.")


def spec_key(spec: Path) -> str:
    """The cloud key for a Collected Spec: its path under ~/wayfinder/specs/."""
    try:
        return keys.SPEC_PREFIX + spec.resolve().relative_to(SPECS.resolve()).as_posix()
    except ValueError:
        return spec.name


def _group_by_spec(loaded: list[tuple[Path, str, dict]]) -> list[tuple[Path, list[tuple[str, dict]]]]:
    groups: list[tuple[Path, list[tuple[str, dict]]]] = []
    for spec, card, part in loaded:
        if groups and groups[-1][0] == spec:
            groups[-1][1].append((card, part))
        else:
            groups.append((spec, [(card, part)]))
    return groups


def report_overflow(status_config: Path, queue: list[Path], needed: int) -> None:
    """Write the atomic refusal into the manifest so the Status tab shows it
    against the waiting missions. Like every report: loud when missing, never
    fatal to anything (there is nothing to roll back — nothing was touched)."""
    if not status_config.exists():
        print(f"no status credentials at {status_config}; overflow not reported")
        return
    try:
        from collect import load_env, authorize
        senv = load_env(status_config)
        sauth = authorize(senv["B2_KEY_ID"], senv["B2_APP_KEY"])
        sallowed = sauth["allowed"]
        manifest = b2_status.download_manifest(
            sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
        b2_status.merge_overflow(
            manifest, [spec_key(s) for s in queue],
            needed, len(cards()), b2_status.utcnow())
        b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
    except SystemExit as e:
        print(f"overflow report failed ({e})")
        return
    print("Reported the overflow refusal to the manifest")


def report_loaded(status_config: Path, entries: list[tuple[str, list[tuple[str, dict]]]]) -> None:
    """Stamp the cloud manifest so the planner shows Loaded with card names.
    Bookkeeping, not the Load: without status credentials the cards are still
    Loaded and the run still succeeds — it just says so loudly."""
    if not status_config.exists():
        print(f"no status credentials at {status_config}; manifest not updated")
        return
    try:
        from collect import load_env, authorize  # local import: same bin dir, no cycle at runtime
        senv = load_env(status_config)
        sauth = authorize(senv["B2_KEY_ID"], senv["B2_APP_KEY"])
        sallowed = sauth["allowed"]
        manifest = b2_status.download_manifest(
            sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
        b2_status.clear_notice(manifest)
        b2_status.merge_loaded(manifest, entries, b2_status.utcnow())
        b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
    except SystemExit as e:
        print(f"manifest update failed ({e}); the Load itself succeeded")
        return
    print(f"Reported {len(entries)} Loaded to the manifest")


if __name__ == "__main__":
    main()
