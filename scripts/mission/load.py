#!/usr/bin/env python3
"""Load Mission Specs onto the Controller, into the way finder cards, over jmtpfs.

One plug-in Loads every waiting Spec into the Cards that were reserved for it at
Dispatch, read from the Card Ledger in the store — never Cards chosen here, and
never the first Card every time, which overwrote Missions that had not been
Flown (ADR 0022). A Spec with no Reservation is refused by name and told what to
do; this script does not choose a Card for it. Cards and their slot GUIDs come
from wayfinder_slots.json, calibrated once, and the pool is checked against the
Controller rather than trusted.

At every plug-in the Ledger is checked against the Controller itself and
verified_at recorded. A Card whose contents disagree is reported, never quietly
corrected. After a Load, written_at is recorded from the read-back that proved
it, so no write is reported that was not verified.

Every card is backed up before it is touched. Success is a read-back after a
fresh mount, never the copy's exit status; on any mismatch every card is put
back as it was, so a Load is all or nothing. A queue that does not fit the
cards, a Spec with no Reservation, and a Card pool that has changed are all
refused before anything is touched, never partially Loaded.

    python3 load.py SPEC.json --yes
    python3 load.py --newest --yes     # what cron runs while the Controller is plugged in
    python3 load.py --selftest
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
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
import load_core  # noqa: E402  (the Load module: decisions and the two seams)
from load_core import (  # noqa: E402
    ControllerBusy,
    ControllerUnreadable,
    LedgerUnreadable,
    LoadFailed,
    NotOnController,
    Part,
)

MOUNT = Path.home() / "rc2"
STORAGE = "Internal shared storage"
LOADS = Path.home() / "wayfinder" / "loads"
SPECS = Path.home() / "wayfinder" / "specs"
LOADED = LOADS / "loaded.json"


DEFAULT_STATUS_CONFIG = Path.home() / ".config" / "wayfinder" / "b2-status.env"

CONTROLLER_LOCK = Path("/tmp/wayfinder-controller.lock")

SETTLE_S = float(os.environ.get("LEDGER_SETTLE_S", "1"))

LAST_REFUSAL = LOADS / "last-refusal.json"


def read_slots() -> dict[str, str]:
    """The calibrated card name → slot GUID map, in card order.

    `cards()`' ordering contract (load.py:130-133): sorted by the card number in
    the name, so the published pool order is unchanged.
    """
    slots = json.loads((HERE / "wayfinder_slots.json").read_text())["slots"]
    return dict(sorted(slots.items(), key=lambda kv: int(kv[0].split()[-1])))


def _load_skipped() -> dict:
    """The per-run skip list Collect synced (specs/_status/skipped.json), or {}."""
    p = SPECS / "_status" / "skipped.json"
    if not p.exists():
        return {}
    try:
        obj = json.loads(p.read_text())
        # The same shape the store uses: specKey -> {withdrawn_at}.
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


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
        raise LoadFailed(
            f"The Controller is plugged in but its storage cannot be read ({done.stderr.strip() or 'no storage'}). "
            "Unlock it, and choose file transfer if it asks; the Load runs on its own once it can read it. "
            "Nothing was touched.")


def build(spec: Path, out_dir: Path) -> list[Part]:
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
    return [Part.from_report(m) for m in report["missions"]]


class MountedController:
    """The Controller seam: the RC2's storage over jmtpfs, its Cards, and the lock."""

    def __init__(self, root: Path, mount: Path = MOUNT, lock: Path = CONTROLLER_LOCK):
        self.root = root
        self.mount_path = mount  # not self.mount: that would shadow the mount() method
        self.lock = lock
        self._lock_handle = None

    def _live(self, guid: str) -> Path:
        return self.root / WAYPOINT_DIR / guid / f"{guid}.kmz"

    def present(self) -> bool:
        """mounted(MOUNT) — load.py:284-289. False for a missing storage dir and for EIO."""
        return mounted(self.mount_path)

    def mount(self) -> None:
        """remount(MOUNT) — load.py:301-309. Raises LoadFailed."""
        remount(self.mount_path)

    def hold(self) -> None:
        """Hold the Controller for this run, or refuse. Keep the handle open.

        Cron wraps collect-and-load in its own flock, but a Load started by hand
        did not take it, so the two could write the same Cards at once (#152).
        This is a different file from cron's: cron already holds that one while it
        runs this script. Raises ControllerBusy with load.py:328-329's message.
        """
        handle = open(self.lock, "w")
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            handle.close()
            raise ControllerBusy(
                "Another Load is writing to the Controller right now; nothing was touched. "
                "It finishes on its own -- check again in a minute.")
        self._lock_handle = handle

    def survey(self) -> list[tuple[int | None, str]]:
        """(createTime, slot GUID) for every Placeholder Mission on the Controller.

        createTime is the field DJI Fly keys a mission's stored name from, so the
        order these were created in is the order the operator named them in -- if
        the Placeholders were made one after another. That is a hypothesis, not a
        fact, which is why this only reports; nothing is written from it. It is
        checked against the Cards already calibrated by hand (ADR 0016) before any
        of it is believed.
        """
        waypoint = self.root / WAYPOINT_DIR
        rows = []
        for d in sorted(waypoint.iterdir()):
            if not d.is_dir():
                continue
            kmz = d / f"{d.name}.kmz"
            if not kmz.exists():
                continue  # DJI Fly keeps its own directories here (capability, map_preview)
            rows.append((read_create_time(kmz), d.name))
        return sorted(rows, key=lambda r: (r[0] is None, r[0]))

    def present_guids(self) -> set[str]:
        """Directory names under waypoint/. Raises ControllerUnreadable with load.py:155's message."""
        waypoint = self.root / WAYPOINT_DIR
        try:
            return {d.name for d in waypoint.iterdir() if d.is_dir()}
        except OSError as e:
            raise ControllerUnreadable(f"could not read the Controller's Missions at {waypoint}: {e}") from e

    def read(self, guid: str) -> bytes | None:
        """The live KMZ bytes, or None when that Card is not on the Controller."""
        live = self._live(guid)
        if not live.exists():
            return None
        return live.read_bytes()

    def write(self, guid: str, source: Path) -> str:
        """unlink the live KMZ, write source in its place keeping the live
        createTime (load.py:395-400 + 409-410), and return the md5 written."""
        live = self._live(guid)
        create_ms = read_create_time(live)
        live.unlink()  # a write onto an existing name can leave two objects
        if create_ms is None:
            shutil.copyfile(source, live)
        else:
            with_create_time(source, create_ms, live)
        return md5(live)

    def backup(self, guid: str, backups: Path) -> None:
        """Copy the live KMZ to backups/{guid}.kmz, if not already there (load.py:392-393)."""
        live = self._live(guid)
        backups.mkdir(parents=True, exist_ok=True)
        if not (backups / f"{guid}.kmz").exists():
            shutil.copyfile(live, backups / f"{guid}.kmz")

    def restore(self, guid: str, backups: Path) -> None:
        """Put backups/{guid}.kmz back (load.py:339-340). OSError propagates."""
        live = self._live(guid)
        live.unlink(missing_ok=True)
        shutil.copyfile(backups / f"{guid}.kmz", live)


def survey(root: Path) -> list[tuple[int | None, str]]:
    """(createTime, slot GUID) for every Placeholder Mission on the Controller.

    calibrate.py imports this name (calibrate.py:34); the rows are exactly
    MountedController's, over the storage root it is handed.
    """
    return MountedController(root).survey()


class B2Store:
    """The store seam: the Card Ledger and the cloud manifest over B2, plus collect auth."""

    def __init__(self, status_config: Path):
        self.status_config = status_config

    def _auth(self) -> dict:
        """Authorized store access for the status key (read specs/, write status/*)."""
        from collect import authorize, load_env  # local import: same bin dir, no cycle at runtime
        senv = load_env(self.status_config)
        return authorize(senv["B2_KEY_ID"], senv["B2_APP_KEY"])

    def fetch_ledger(self) -> dict:
        """The Card Ledger from the store; an empty one only if it was never written.

        A Ledger that cannot be read raises instead of coming back empty. It used to
        come back empty, and every run then published the pool onto that empty
        copy -- erasing every Reservation and every written Card on one failed
        read, after which a Dispatch could be given a Card still holding an unflown
        Mission (#161). The host never chooses Cards for itself, and never writes a
        Ledger it did not read.
        """
        if not self.status_config.exists():
            raise LedgerUnreadable(f"no status credentials at {self.status_config}")
        try:
            sauth = self._auth()
            return b2_status.download_ledger(
                sauth["downloadUrl"], sauth["allowed"]["bucketName"], sauth["authorizationToken"])
        except (Exception, SystemExit) as e:
            raise LedgerUnreadable(f"the Card Ledger could not be read ({e})") from e

    def publish_ledger(self, ledger: dict) -> None:
        """Write the Ledger back. Bookkeeping, not the Load: the cards are already
        written and verified, so this is loud when it fails and never fatal."""
        if not self.status_config.exists():
            print(f"no status credentials at {self.status_config}; the Card Ledger was not updated")
            return
        try:
            sauth = self._auth()
            b2_status.upload_ledger(sauth["apiUrl"], sauth["authorizationToken"],
                                    sauth["allowed"]["bucketId"], ledger)
        except (Exception, SystemExit) as e:
            print(f"the Card Ledger was not updated ({e}); the Load itself succeeded")
            return
        print("Updated the Card Ledger")

    def report_drift(self, drift: list[dict]) -> None:
        """Put the disagreement where the planner can withhold readiness over it."""
        if not self.status_config.exists():
            print(f"no status credentials at {self.status_config}; drift not reported")
            return
        try:
            sauth = self._auth()
            sallowed = sauth["allowed"]
            manifest = b2_status.download_manifest(
                sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
            b2_status.merge_drift(manifest, drift, b2_status.utcnow())
            b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
        except (Exception, SystemExit) as e:
            print(f"drift report failed ({e})")
            return
        print(f"Reported {len(drift)} disagreeing Card(s) to the manifest" if drift
              else "Card Ledger agrees with the Controller")

    def report_refusal(self, kind: str, spec_keys: list[str], reason: str) -> None:
        """Write a refusal into the manifest so the planner shows it above the
        Missions it held up. Nothing was touched, or everything was put back -- but
        the operator must never learn of it only from a cron log."""
        if not self.status_config.exists():
            print(f"no status credentials at {self.status_config}; the refusal was not reported")
            return
        try:
            sauth = self._auth()
            sallowed = sauth["allowed"]
            manifest = b2_status.download_manifest(
                sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
            b2_status.merge_refusal(manifest, kind, spec_keys, reason, b2_status.utcnow())
            b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
        except (Exception, SystemExit) as e:
            print(f"the refusal was not reported ({e})")
            return
        print("Reported the refusal to the manifest")

    def report_overflow(self, spec_keys: list[str], needed: int, have: int) -> None:
        """Write the atomic refusal into the manifest so the Status tab shows it
        against the waiting missions. Like every report: loud when missing, never
        fatal to anything (there is nothing to roll back — nothing was touched)."""
        if not self.status_config.exists():
            print(f"no status credentials at {self.status_config}; overflow not reported")
            return
        try:
            sauth = self._auth()
            sallowed = sauth["allowed"]
            manifest = b2_status.download_manifest(
                sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
            b2_status.merge_overflow(manifest, spec_keys, needed, have, b2_status.utcnow())
            b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
        except SystemExit as e:
            print(f"overflow report failed ({e})")
            return
        print("Reported the overflow refusal to the manifest")

    def report_loaded(self, entries: list[tuple[str, list[tuple[str, dict]]]]) -> None:
        """Stamp the cloud manifest so the planner shows Loaded with card names.
        Bookkeeping, not the Load: without status credentials the cards are still
        Loaded and the run still succeeds — it just says so loudly."""
        if not self.status_config.exists():
            print(f"no status credentials at {self.status_config}; manifest not updated")
            return
        try:
            sauth = self._auth()
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


def announce_refusal(store: B2Store, kind: str, queue: list[Path], reason: str, *,
                     now: float | None = None, record: Path = LAST_REFUSAL) -> None:
    """Dedupe a refusal, record it locally, then report it through the store.

    Cron runs every minute while the Controller is plugged in, and a refusal
    that does not change -- a locked Controller, a Ledger that cannot be read --
    would otherwise spend a download and an upload every minute saying the same
    thing. Said again after half an hour, so a stale banner is refreshed
    (load.py:1229-1254). `now` is injectable for tests.
    """
    now = time.time() if now is None else now
    try:
        last = json.loads(record.read_text())
    except (OSError, ValueError):
        last = None
    if not load_core.refusal_is_news(last, reason, now):
        return
    try:
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_text(json.dumps({"reason": reason, "at": now}))
    except OSError:
        pass
    store.report_refusal(kind, [load_core.spec_key(s, SPECS) for s in queue], reason)


def verify_ledger(ledger: dict, slots: dict[str, str], controller: MountedController,
                  store: B2Store) -> dict:
    """Check the Ledger against the Controller at this plug-in and stamp
    verified_at. Drift is reported and never corrected: the Ledger keeps saying
    what was planned, because the difference is the only evidence that a Card
    holds something else (ADR 0022)."""
    verified, drift = load_core.verify(ledger, slots, controller, b2_status.utcnow())
    for d in drift:
        print(f"CARD LEDGER DISAGREES WITH THE CONTROLLER: {d['card']} should hold "
              f"{d['expected']} but holds {d['found']}. Not corrected. Do not fly {d['card']} "
              f"until you have Dispatched and Loaded that Mission again.")
    store.report_drift(drift)
    return verified


def _selftest() -> int:
    """Run the ordinary test suite when it is deployed beside this script.

    On the host (a flat deploy) `load_test.py` is not there; the CI mission
    workflow runs it as `python3 scripts/mission/load_test.py`. `unittest.main`
    is not called: sys.argv holds `--selftest`.
    """
    try:
        import load_test
    except ImportError:
        print("the load tests are not deployed beside this script; the CI mission workflow runs them")
        return 0
    import unittest

    result = unittest.TextTestRunner().run(unittest.TestLoader().loadTestsFromModule(load_test))
    return 0 if result.wasSuccessful() else 1


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("spec", nargs="?", type=Path, help="the Mission Spec to Load")
    p.add_argument("--newest", action="store_true",
                   help="Load every Collected Spec not yet Loaded, oldest first (what cron runs)")
    p.add_argument("--yes", action="store_true", help="confirm replacing the way finder cards")
    p.add_argument("--status-config", type=Path, default=DEFAULT_STATUS_CONFIG,
                   help="B2 status credentials env file (read specs/, write status/*)")
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    p.add_argument("--survey", action="store_true",
                   help="list every Placeholder Mission in creation order and check it against "
                        "the Cards already calibrated; writes nothing")
    p.add_argument("--publish-pool", action="store_true",
                   help="write the calibrated Card names to the Ledger and exit; needs no Controller")
    args = p.parse_args()

    if args.selftest:
        sys.exit(_selftest())
    if args.survey:
        controller = MountedController(MOUNT / STORAGE)
        if not controller.present():
            controller.mount()
        rows = controller.survey()
        slots = read_slots()
        by_guid = {guid: name for name, guid in slots.items()}
        print(f"{len(rows)} Placeholder Missions on the Controller, oldest first:\n")
        for i, (created, guid) in enumerate(rows, 1):
            when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(created / 1000)) if created else "no createTime"
            print(f"  {i:>3}  {when}  {guid}  {by_guid.get(guid, '')}")
        problems = load_core.survey_disagrees(rows, slots)
        print()
        if problems:
            print("creation order does NOT predict the calibrated names:")
            for problem in problems:
                print(f"  {problem}")
            print("\nCalibrate the rest by hand (ADR 0016). Nothing was written.")
        else:
            print(f"every calibrated Card sits where creation order predicts it "
                  f"({len(by_guid)} of {len(rows)} checked). The rest can be named the same way, "
                  f"but only after a marker Mission proves at least one of them on the screen.")
        return
    if args.publish_pool:
        # Seeding, and the recovery when calibration changes: no Controller is
        # needed to say which Cards exist, only the calibration file.
        load_core.publish_pool(B2Store(args.status_config), list(read_slots()), print,
                               settle_s=SETTLE_S, sleep=time.sleep)
        return
    stamp = time.strftime("%Y%m%dT%H%M%S")
    backups = LOADS / stamp
    if args.newest:
        store = B2Store(args.status_config)
        # Before anything else: the planner cannot reserve a Card it does not
        # know exists, and it is the only thing that reserves. Publishing the
        # pool here is what lets a store that has never seen one get started.
        try:
            load_core.publish_pool(store, list(read_slots()), print, settle_s=SETTLE_S, sleep=time.sleep)
        except LedgerUnreadable as e:
            print(f"{e}; the Card pool was not published")
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
        found = sorted(SPECS.glob("*/*/*.json"), key=lambda f: f.relative_to(SPECS).as_posix())
        loaded = set(json.loads(LOADED.read_text())) if found and LOADED.exists() else None
        decision = load_core.queue_specs(found, loaded, set(_load_skipped()), SPECS)
        if decision.adopted is not None:
            # A lost record Loads nothing (ADR 0017, #38): it adopts everything
            # already there as Loaded and says so, rather than overwriting cards
            # on a guess.
            LOADS.mkdir(parents=True, exist_ok=True)
            LOADED.write_text(json.dumps([str(f) for f in decision.adopted], indent=1))
            print(f"no record of past Loads; adopted {len(decision.adopted)} Specs as already Loaded, Loaded nothing")
            return
        queue = list(decision.waiting)
        if not queue:
            return  # nothing new; cron calls this every minute
        if not args.yes:
            sys.exit("this replaces the Missions in the way finder cards on the Controller; pass --yes")
        try:
            ledger = store.fetch_ledger()
        except LedgerUnreadable as e:
            reason = (f"{e}; nothing was touched. The Load waits until the Ledger can be read, "
                      f"because it says which Card each Mission goes into.")
            announce_refusal(store, "card-ledger", queue, reason)
            sys.exit(reason)
        slots = read_slots()
        # A Spec Loads if and only if it holds a Reservation. One without is
        # withdrawn, superseded, Flown, from before Reservations existed, or
        # caught between its Spec and its Reservation being written -- none of
        # which may hold up the Missions beside it (#161).
        queue, unreserved = load_core.split_reserved(queue, ledger, SPECS)
        for s in unreserved:
            print(f"skipped {load_core.spec_key(s, SPECS)}: no Card is reserved for it, so it is not Loaded. "
                  f"The Missions beside it are not held up.")
        if not queue:
            return
        controller = MountedController(MOUNT / STORAGE)
        try:
            controller.hold()  # held until the process exits
        except ControllerBusy as e:
            sys.exit(str(e))
        try:
            if not controller.present():
                controller.mount()
        except LoadFailed as e:
            announce_refusal(store, "controller", queue, str(e))
            sys.exit(str(e))
        ledger = verify_ledger(ledger, slots, controller, store)
        with tempfile.TemporaryDirectory() as tmp:
            entries = [(spec, build(spec, Path(tmp) / spec.stem)) for spec in queue]
            try:
                decision = load_core.plan(entries, ledger, slots, controller, SPECS)
            except b2_status.QueueOverflowError as e:
                store.report_overflow([load_core.spec_key(s, SPECS) for s in queue],
                                      sum(len(parts) for _, parts in entries), len(slots))
                sys.exit(str(e))
            except b2_status.LedgerRefusal as e:
                announce_refusal(store, "card-ledger", queue, str(e))
                load_core.stamp_verified(store, ledger, print, settle_s=SETTLE_S, sleep=time.sleep)
                sys.exit(str(e))
            except NotOnController as e:
                sys.exit(str(e))
            try:
                result = load_core.apply(decision, controller, backups)
            except LoadFailed as e:
                announce_refusal(store, "load-failed", queue, str(e))
                sys.exit(str(e))
        loaded = result.loaded
        sheet = "\n".join(f"Open {planned.card}: {planned.part.name} ({planned.part.waypoints} waypoints) "
                          f"[{planned.spec.name}]" for planned in loaded)
        (backups / "cards.txt").write_text(sheet + "\n")
        done = json.loads(LOADED.read_text()) if LOADED.exists() else []
        LOADED.write_text(json.dumps(done + [str(planned.spec) for planned in loaded], indent=1))
        # group_by_spec already yields (card, part) pairs; re-unpacking them as
        # triples raised ValueError *after* the cards were written and read back,
        # so a Load that fully succeeded reported nothing and the Status tab
        # showed it as never Loaded.
        store.report_loaded([(load_core.spec_key(spec, SPECS),
                              [(card, part.manifest_fields()) for card, part in group])
                             for spec, group in load_core.group_by_spec(loaded)])
        load_core.record_written(store, ledger,
                                 {planned.card: planned.part.written_md5 for planned in loaded},
                                 b2_status.utcnow(), print, settle_s=SETTLE_S, sleep=time.sleep)
        print(time.strftime("%Y-%m-%d %H:%M:%S"), ", ".join(str(s) for s in queue))
        print(sheet)
        print("Close and reopen each card's waypoint editor on the Controller to load it.")
        return
    if not args.spec or not args.spec.exists():
        sys.exit("name a Mission Spec file to Load")
    if not args.yes:
        sys.exit("this replaces the Missions in the way finder cards on the Controller; pass --yes")
    controller = MountedController(MOUNT / STORAGE)
    try:
        controller.hold()  # held until the process exits
    except ControllerBusy as e:
        sys.exit(str(e))
    try:
        if not controller.present():
            controller.mount()
    except LoadFailed as e:
        sys.exit(str(e))

    backups = LOADS / stamp
    store = B2Store(args.status_config)
    try:
        ledger = store.fetch_ledger()
    except LedgerUnreadable as e:
        sys.exit(f"{e}; nothing was touched")
    slots = read_slots()
    ledger = verify_ledger(ledger, slots, controller, store)
    with tempfile.TemporaryDirectory() as tmp:
        entry = (args.spec, build(args.spec, Path(tmp)))
        try:
            decision = load_core.plan([entry], ledger, slots, controller, SPECS)
        except b2_status.LedgerRefusal as e:
            announce_refusal(store, "card-ledger", [args.spec], str(e))
            load_core.stamp_verified(store, ledger, print, settle_s=SETTLE_S, sleep=time.sleep)
            sys.exit(str(e))
        except NotOnController as e:
            sys.exit(str(e))
        # No QueueOverflowError catch here: a one-Spec queue larger than the
        # pool has always surfaced as a traceback (wart #1), and this refactor
        # does not fix it (D-orch-5).
        try:
            result = load_core.apply(decision, controller, backups)
        except LoadFailed as e:
            announce_refusal(store, "load-failed", [args.spec], str(e))
            sys.exit(str(e))
    loaded = result.loaded
    sheet = "\n".join(f"Open {planned.card}: {planned.part.name} ({planned.part.waypoints} waypoints)"
                      for planned in loaded)
    (backups / "cards.txt").write_text(sheet + "\n")
    done = json.loads(LOADED.read_text()) if LOADED.exists() else []
    LOADED.write_text(json.dumps(done + [str(args.spec)], indent=1))
    store.report_loaded([(load_core.spec_key(args.spec, SPECS),
                          [(planned.card, planned.part.manifest_fields()) for planned in loaded])])
    load_core.record_written(store, ledger,
                             {planned.card: planned.part.written_md5 for planned in loaded},
                             b2_status.utcnow(), print, settle_s=SETTLE_S, sleep=time.sleep)
    print(time.strftime("%Y-%m-%d %H:%M:%S"), args.spec)
    print(sheet)
    print("Close and reopen each card's waypoint editor on the Controller to load it.")


if __name__ == "__main__":
    main()
