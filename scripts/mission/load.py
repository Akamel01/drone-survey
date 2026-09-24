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

MOUNT = Path.home() / "rc2"
STORAGE = "Internal shared storage"
LOADS = Path.home() / "wayfinder" / "loads"
SPECS = Path.home() / "wayfinder" / "specs"
LOADED = LOADS / "loaded.json"


DEFAULT_STATUS_CONFIG = Path.home() / ".config" / "wayfinder" / "b2-status.env"


def unloaded_queue(specs: Path, record: Path) -> list[Path]:
    """Every Collected Spec not yet Loaded and not withdrawn, oldest first.

    The host keeps no supersession rule of its own. It used to keep only the
    newest Spec per Site and date, which the planner does not: two Missions of
    one Site on one day with different names are two deliberate flights (ADR
    0021), and the older of them stayed Collected forever, holding its Card
    (#161). Supersession is decided in the store, which puts a superseded Spec
    on the skip list just as Withdraw does, and whether a Spec may Load is
    decided by its Reservation.
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
    queue = list(waiting)
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
    return queue


def split_reserved(queue: list[Path], ledger: dict) -> tuple[list[Path], list[Path]]:
    """(Specs holding a Reservation, Specs without one), each in queue order."""
    held = [s for s in queue if b2_status.cards_for(ledger, spec_key(s))]
    return held, [s for s in queue if s not in held]


def cards() -> list[tuple[str, str]]:
    """(card name, slot GUID), in card order."""
    slots = json.loads((HERE / "wayfinder_slots.json").read_text())["slots"]
    return sorted(slots.items(), key=lambda kv: int(kv[0].split()[-1]))


def pool_drift(root: Path) -> list[str]:
    """Every way the Card pool no longer matches what was calibrated.

    A Card is a Placeholder Mission the operator made by hand, and the slot GUID
    is its identity — so a Placeholder deleted or remade since
    `wayfinder_slots.json` was written shows up here, a remade one as the
    disappearance of the GUID it used to have. The file is not trusted on its
    own: a Load into a Card that may no longer be what it was is the failure
    this detector exists to prevent (ADR 0022).

    A Placeholder the pool does not know about is **not** drift. The operator
    keeps far more Placeholders than are calibrated — 38 on the Controller
    against 5 calibrated — and calling those drift refused every Load (#118).
    """
    calibrated = {guid: name for name, guid in cards()}
    waypoint = root / WAYPOINT_DIR
    try:
        present = {d.name for d in waypoint.iterdir() if d.is_dir()}
    except OSError as e:
        return [f"could not read the Controller's Missions at {waypoint}: {e}"]
    return [f"{calibrated[g]} ({g}) was calibrated but is no longer on the Controller"
            for g in sorted(calibrated) if g not in present]


def survey(root: Path) -> list[tuple[int | None, str]]:
    """(createTime, slot GUID) for every Placeholder Mission on the Controller.

    createTime is the field DJI Fly keys a mission's stored name from, so the
    order these were created in is the order the operator named them in -- if
    the Placeholders were made one after another. That is a hypothesis, not a
    fact, which is why this only reports; nothing is written from it. It is
    checked against the Cards already calibrated by hand (ADR 0016) before any
    of it is believed.
    """
    waypoint = root / WAYPOINT_DIR
    rows = []
    for d in sorted(waypoint.iterdir()):
        if not d.is_dir():
            continue
        kmz = d / f"{d.name}.kmz"
        if not kmz.exists():
            continue  # DJI Fly keeps its own directories here (capability, map_preview)
        rows.append((read_create_time(kmz), d.name))
    return sorted(rows, key=lambda r: (r[0] is None, r[0]))


def survey_disagrees(rows: list[tuple[int | None, str]]) -> list[str]:
    """Where creation order and the hand-calibrated names disagree.

    Empty means every Card calibrated by hand sits exactly where creation order
    predicts it, which is the only evidence that would let the rest be named
    the same way.
    """
    by_guid = {guid: name for name, guid in cards()}
    known = [(i, by_guid[guid]) for i, (_, guid) in enumerate(rows) if guid in by_guid]
    missing = [n for n in by_guid.values() if n not in [k for _, k in known]]
    problems = [f"{n} is calibrated but is not on the Controller" for n in sorted(missing)]
    problems += [f"{name} is {i + 1} in creation order, not {name.split()[-1]}"
                 for i, name in known if str(i + 1) != name.split()[-1]]
    return problems


def reserved_plan(entries: list[tuple[Path, list[dict]]],
                  ledger: dict) -> list[tuple[Path, str, str, dict]]:
    """(spec, card, slot GUID, part) for every part, taken from the Reservation.

    Cards come from the Ledger, never chosen fresh here: a Card was claimed when
    its Spec was Dispatched, and the host's job is to honour that claim. A Spec
    with no Reservation is refused by name rather than given a Card, because
    choosing one is exactly the defect ADR 0022 ends.
    """
    slots = dict(cards())
    plan: list[tuple[Path, str, str, dict]] = []
    for spec, parts in entries:
        key = spec_key(spec)
        held = b2_status.cards_for(ledger, key)
        if not held:
            raise b2_status.LedgerRefusal(
                f"no Card is reserved for {key}; nothing was touched. This Spec was Dispatched "
                f"before Cards were reserved at Dispatch, or the Card Ledger could not be read. "
                f"Withdraw it and Dispatch it again from the planner, which reserves a Card and "
                f"says so before you leave.")
        if len(held) != len(parts):
            raise b2_status.LedgerRefusal(
                f"{key} reserved {len(held)} Card(s) at Dispatch but its plan makes {len(parts)} "
                f"Mission(s); nothing was touched. The Spec and the Reservation disagree — "
                f"Withdraw it and Dispatch it again so the two are made from the same plan.")
        for holding, part in zip(held, parts):
            card = holding["card"]
            if card not in slots:
                raise b2_status.LedgerRefusal(
                    f"{key} is reserved for {card}, which is not calibrated on this Controller; "
                    f"nothing was touched. Calibrate {card} into wayfinder_slots.json, or Withdraw "
                    f"the Spec and Dispatch it again against the calibrated pool.")
            plan.append((spec, card, slots[card], part))
    return plan


def observe_cards(root: Path, ledger: dict) -> dict[str, str | None]:
    """What each Card the host has written actually holds now, in Ledger terms.

    The read-back the loader already performs is the evidence, and the md5 it
    recorded at Load is the check: a Card whose file still hashes to what was
    written holds that Spec, and anything else is reported as unknown rather
    than guessed at. Cards this host has never written are left out — the
    Controller was not asked about them, so they are evidence of nothing.
    """
    waypoint = root / WAYPOINT_DIR
    slots = dict(cards())
    seen: dict[str, str | None] = {}
    for card, held in ledger.get("holdings", {}).items():
        if card not in slots or not held.get("written_md5"):
            continue
        live = waypoint / slots[card] / f"{slots[card]}.kmz"
        if not live.exists():
            seen[card] = None
            continue
        digest = md5(live)
        seen[card] = held["spec_key"] if digest == held["written_md5"] else f"unknown contents (md5 {digest})"
    return seen


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


class LoadFailed(Exception):
    """A Load that stopped. The message says what was put back and what to do.

    Raised rather than exiting, so every way a Load can fail reaches the
    manifest and the planner's banner (#162). A bare exit reached only the cron
    log, which is how a locked Controller or a failed read-back went unseen.
    """


def remount(mount: Path) -> None:
    """A fresh mount, so the read-back is what the Controller holds, not a cache."""
    subprocess.run(["fusermount", "-uz", str(mount)], capture_output=True)
    done = subprocess.run(["jmtpfs", str(mount)], capture_output=True, text=True)
    if not mounted(mount):
        raise LoadFailed(
            f"The Controller is plugged in but its storage cannot be read ({done.stderr.strip() or 'no storage'}). "
            "Unlock it, and choose file transfer if it asks; the Load runs on its own once it can read it. "
            "Nothing was touched.")


CONTROLLER_LOCK = Path("/tmp/wayfinder-controller.lock")


def controller_lock(path: Path = CONTROLLER_LOCK):
    """Hold the Controller for this run, or refuse. Keep the returned file open.

    Cron wraps collect-and-load in its own flock, but a Load started by hand
    did not take it, so the two could write the same Cards at once (#152).
    This is a different file from cron's: cron already holds that one while it
    runs this script.
    """
    handle = open(path, "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        sys.exit("Another Load is writing to the Controller right now; nothing was touched. "
                 "It finishes on its own -- check again in a minute.")
    return handle


def _restore(plan, waypoint: Path, backups: Path) -> list[str]:
    """Put every planned Card back from its backup; the Cards that could not be."""
    lost = []
    for _, card, guid, _ in plan:
        live = waypoint / guid / f"{guid}.kmz"
        try:
            live.unlink(missing_ok=True)
            shutil.copyfile(backups / f"{guid}.kmz", live)
        except OSError:
            lost.append(card)
    return lost


def _put_back(lost: list[str], backups: Path) -> str:
    if not lost:
        return f"Every card was put back as it was (backups in {backups})."
    return (f"{', '.join(lost)} could not be put back and may hold half a file: do not fly "
            f"{'it' if len(lost) == 1 else 'them'}. Plug the Controller back in; the Load runs again "
            f"from the start and rewrites {'it' if len(lost) == 1 else 'them'} (backups in {backups}).")


def load_all(entries: list[tuple[Path, list[dict]]], root: Path, backups: Path,
             fresh_mount=None, ledger: dict | None = None) -> list[tuple[Path, str, dict]]:
    """Write every mission's parts to the Cards reserved for them, read all back,
    roll back on any mismatch. Returns (spec, card, part), each part carrying the
    `written_md5` the read-back proved.

    Every refusal happens before a card is touched, so a Load is all or nothing:
    a queue that does not fit, a Card pool that has changed, and a Spec with no
    Reservation are all decided up front.
    """
    waypoint = root / WAYPOINT_DIR
    ledger = dict(b2_status.EMPTY_LEDGER) if ledger is None else ledger
    total = sum(len(parts) for _, parts in entries)
    if total > len(cards()):
        # A backstop, not the gate. Availability is decided at Dispatch now, and
        # a Spec that got this far already holds a Reservation — which is why
        # this no longer compares against the total and then overwrites an
        # unflown Mission anyway (ADR 0022).
        waiting = ", ".join(spec.name for spec, _ in entries)
        raise b2_status.QueueOverflowError(
            f"{total} parts waiting ({waiting}) but only {len(cards())} way finder cards; "
            f"nothing was touched. Dispatch fewer missions or clear a card, then replug.")
    changed = pool_drift(root)
    if changed:
        raise b2_status.LedgerRefusal(
            "the Card pool has changed since it was calibrated; nothing was touched:\n  "
            + "\n  ".join(changed)
            + "\nRecalibrate the pool into wayfinder_slots.json before Loading again, so a Mission "
              "is never written into a Card that is no longer what it was.")
    plan = reserved_plan(entries, ledger)
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

        # Unplugged, locked or rebooted part-way through: whatever was written
        # is put back, so a Load stays all or nothing even when it is cut off.
        # It used to raise straight out, leaving the first Cards rewritten and
        # the rest as they were.
        try:
            for _, card, guid, _ in plan:
                live = waypoint / guid / f"{guid}.kmz"
                live.unlink()  # a write onto an existing name can leave two objects
                shutil.copyfile(staged[guid], live)
            if fresh_mount:
                fresh_mount()
            bad = [card for _, card, guid, _ in plan
                   if not (waypoint / guid / f"{guid}.kmz").exists()
                   or md5(waypoint / guid / f"{guid}.kmz") != md5(staged[guid])]
        except (OSError, LoadFailed) as e:
            raise LoadFailed(f"The Controller stopped answering part-way through the Load ({e}). "
                             + _put_back(_restore(plan, waypoint, backups), backups)) from e
        if bad:
            raise LoadFailed(f"What the Controller holds did not match what was written, for {', '.join(bad)}. "
                             + _put_back(_restore(plan, waypoint, backups), backups)
                             + " Unplug and plug it in again to retry.")
        # The read-back is the evidence, so the hash it just proved is what goes
        # into the Ledger: a write is never reported that was not verified.
        for _, _, guid, part in plan:
            part["written_md5"] = md5(waypoint / guid / f"{guid}.kmz")
        return [(spec, card, part) for spec, card, _, part in plan]


def load(spec: Path, root: Path, backups: Path, fresh_mount=None,
         ledger: dict | None = None) -> list[tuple[str, dict]]:
    """Write one Spec's parts, read back, roll back on mismatch. Returns (card, part)."""
    with tempfile.TemporaryDirectory() as tmp:
        loaded = load_all([(spec, build(spec, Path(tmp)))], root, backups, fresh_mount, ledger)
    return [(card, part) for _, card, part in loaded]


def _ledger_fixture_check() -> None:
    """The Card Ledger contract, asserted from the same fixture as
    `web/lib/model.test.ts`, case for case. The two languages hold the same
    rules; the fixture is what stops them drifting apart (ADR 0022).

    Skipped loudly when the fixture is absent: these scripts are deployed to the
    host as a flat directory rather than a checkout, and the planner asserts the
    same cases from its own suite, which only ever runs in a checkout.
    """
    fixture_path = HERE.parents[1] / "fixtures" / "card-ledger.json"
    if not fixture_path.is_file():
        print(f"Card Ledger fixture absent ({fixture_path}); that check skipped")
        return
    fixture = json.loads(fixture_path.read_text())
    ledger, case = fixture["ledger"], fixture["cases"]

    # A Card holding an unflown Mission is not available; a Flown one is.
    assert b2_status.available_cards(ledger) == case["available"]["expect"]
    assert "unflown" in b2_status.card_unavailable(ledger, "way finder 1")
    assert b2_status.card_unavailable(ledger, "way finder 2") is None, "Flown releases the Card"

    # A Card outside the calibrated pool cannot be reserved.
    assert b2_status.card_unavailable(ledger, case["uncalibrated_card"]["card"]) \
        == case["uncalibrated_card"]["expect_reason"]

    # A Spec that splits into two Missions takes two Cards.
    two = b2_status.reserve_cards(ledger, case["reserve_two"]["needed"])
    assert two["ok"] is case["reserve_two"]["expect_ok"]
    assert two["cards"] == case["reserve_two"]["expect_cards"], two

    # Asking for more Cards than are free is refused, naming what is in the way.
    over = b2_status.reserve_cards(ledger, case["reserve_more_than_free"]["needed"])
    assert over["ok"] is case["reserve_more_than_free"]["expect_ok"]
    assert over["available"] == case["reserve_more_than_free"]["expect_available"], over
    for fragment in case["reserve_more_than_free"]["expect_reason_mentions"]:
        assert fragment in over["reason"], (fragment, over["reason"])

    # Withdrawing a Spec gives its Cards back, and keeps a Flown record.
    after = b2_status.with_release(ledger, case["release_on_withdraw"]["spec_key"])
    assert b2_status.available_cards(after) == case["release_on_withdraw"]["expect_available_after"]
    kept = b2_status.with_release(ledger, case["flown_holding_survives_release"]["spec_key"])
    assert case["flown_holding_survives_release"]["expect_holding_kept"] in kept["holdings"], kept

    # Reserving records the flight order, so a row can say flight 2 of 3.
    held = b2_status.with_reservation({"pool": ["A", "B", "C"], "holdings": {}},
                                      ["A", "B", "C"], "specs/s/d/k.json", "2026-09-23T00:00:00Z")
    assert [f"{h['flight']} of {h['flights']} in {h['card']}"
            for h in b2_status.cards_for(held, "specs/s/d/k.json")] == \
        ["1 of 3 in A", "2 of 3 in B", "3 of 3 in C"]
    assert b2_status.available_cards(held) == []

    # A Card whose Mission is no longer current is stale, and only once written.
    assert [h["card"] for h in b2_status.stale_cards(ledger, set())] == ["way finder 1"]
    reserved_only = b2_status.with_reservation({"pool": ["A"], "holdings": {}},
                                               ["A"], "specs/x/y/z.json", "t")
    assert b2_status.stale_cards(reserved_only, set()) == [], \
        "a Reservation that never reached the Controller cannot be stale on it"

    # A Ledger that disagrees with the Controller reports the difference, and
    # silence from the device is not a disagreement.
    assert b2_status.ledger_drift(ledger, case["drift"]["on_device"]) == case["drift"]["expect_drift"]
    assert b2_status.ledger_drift(ledger, {}) == []

    # A Spec with no Reservation has no Cards: what load() refuses on.
    assert b2_status.cards_for(ledger, "specs/never/dispatched/here.json") == []
    print("card-ledger fixture: ok")


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

        pool = [c for c, _ in cards()]
        first_card, first_guid = cards()[0]
        # A Spec with no Reservation is refused by name and told what to do,
        # never given a Card the host picked for itself.
        try:
            load(tmp / "spec.json", root, tmp / "backup0",
                 ledger={"pool": pool, "holdings": {}})
        except b2_status.LedgerRefusal as e:
            assert "no Card is reserved" in str(e) and "Dispatch it again" in str(e), e
        else:
            raise AssertionError("a Spec with no Reservation was Loaded anyway")
        assert not (tmp / "backup0").exists(), "a refused Load must not touch a card"

        # The same Spec with a Reservation goes to the Card that was reserved.
        ledger = b2_status.with_reservation(
            {"pool": pool, "holdings": {}}, ["way finder 1"], "spec.json", "2026-09-23T00:00:00Z")
        loaded = load(tmp / "spec.json", root, tmp / "backup", ledger=ledger)
        assert [c for c, _ in loaded] == [first_card], loaded
        live = root / WAYPOINT_DIR / first_guid / f"{first_guid}.kmz"
        assert read_create_time(live) == 1789000000000  # the slot keeps its own createTime
        assert zipfile.ZipFile(live).read("wpmz/waylines.wpml").count(b"<Placemark>") == loaded[0][1]["waypoints"]
        assert zipfile.ZipFile(tmp / "backup" / f"{first_guid}.kmz").read("wpmz/waylines.wpml") == b"<kml/>"

        # Only a verified write is reported: the md5 the read-back proved is what
        # goes into the Ledger, and a Card the Ledger does not hold is never invented.
        written = b2_status.merge_written(
            ledger, {card: part["written_md5"] for card, part in loaded}, "2026-09-23T01:00:00Z")
        assert written["holdings"]["way finder 1"]["written_md5"] == md5(live)
        assert written["holdings"]["way finder 1"]["written_at"] == "2026-09-23T01:00:00Z"

        # Verifying against the Controller: the Card still holds what was written.
        assert observe_cards(root, written) == {"way finder 1": "spec.json"}
        assert b2_status.ledger_drift(written, observe_cards(root, written)) == []
        # A Reservation that has not been written is not evidence of anything:
        # the Controller still holds its own Placeholder, which is not drift.
        reserved_only = b2_status.with_reservation(written, ["way finder 3"], "other.json", "t")
        assert "way finder 3" not in observe_cards(root, reserved_only)
        assert b2_status.ledger_drift(reserved_only, observe_cards(root, reserved_only)) == []

        # Something else in the Card: reported, never quietly corrected.
        live.write_bytes(b"a Mission this host did not write")
        seen = observe_cards(root, written)
        assert seen["way finder 1"].startswith("unknown contents"), seen
        drifted = b2_status.ledger_drift(written, seen)
        assert [d["card"] for d in drifted] == ["way finder 1"], drifted
        assert drifted[0]["expected"] == "spec.json" and drifted[0]["found"] == seen["way finder 1"]
        assert written["holdings"]["way finder 1"]["spec_key"] == "spec.json", \
            "the Ledger keeps saying what was planned; drift is reported, not corrected"

        # The pool itself is checked, never trusted: a Placeholder Mission
        # deleted since calibration refuses the Load before it starts.
        assert pool_drift(root) == []
        # An uncalibrated Placeholder is ordinary. The operator keeps dozens of
        # them and only a few are calibrated, so treating one as drift refused
        # every Load on the real Controller (#118).
        stray = root / WAYPOINT_DIR / "E1E1E1E1-0000-0000-0000-000000000000"
        stray.mkdir()
        assert pool_drift(root) == [], "an uncalibrated Placeholder is not drift"
        stray.rmdir()
        gone = root / WAYPOINT_DIR / cards()[-1][1]
        shutil.move(str(gone), str(tmp / "moved-away"))
        assert any("no longer on the Controller" in p for p in pool_drift(root)), pool_drift(root)
        try:
            load(tmp / "spec.json", root, tmp / "backup1", ledger=ledger)
        except b2_status.LedgerRefusal as e:
            assert "pool has changed" in str(e) and "Recalibrate" in str(e), e
        else:
            raise AssertionError("a changed Card pool was Loaded into anyway")
        shutil.move(str(tmp / "moved-away"), str(gone))
        assert pool_drift(root) == []
        shutil.copyfile(tmp / "backup" / f"{first_guid}.kmz", live)  # undo the drift fixture

        # A read-back that does not match restores every card from its backup,
        # and says so in words the manifest can carry to the planner.
        def corrupt():
            live.write_bytes(b"not what was sent")
        try:
            load(tmp / "spec.json", root, tmp / "backup2", fresh_mount=corrupt, ledger=ledger)
        except LoadFailed as e:
            assert "did not match" in str(e) and "put back" in str(e), e
        else:
            raise AssertionError("a mismatched read-back was accepted")
        assert md5(live) == md5(tmp / "backup2" / f"{first_guid}.kmz")

        # Two Cards, and the Controller goes away after the first is written:
        # the first is put back, so the Load stays all or nothing (#152).
        second_card, second_guid = cards()[1]
        second_live = root / WAYPOINT_DIR / second_guid / f"{second_guid}.kmz"
        before = {first_guid: md5(live), second_guid: md5(second_live)}
        two = b2_status.with_reservation(
            {"pool": pool, "holdings": {}}, [first_card, second_card], "spec.json", "t")
        real_copy, writes = shutil.copyfile, []

        def unplugged_after_one(src, dst, *a, **k):
            if Path(dst).parent.parent == root / WAYPOINT_DIR and Path(src).parent != tmp / "backup3":
                writes.append(dst)
                if len(writes) == 2:
                    raise OSError(5, "Input/output error")
            return real_copy(src, dst, *a, **k)
        shutil.copyfile = unplugged_after_one
        try:
            load_all([(tmp / "spec.json", [dict(p) for p in [{"out": live, "name": "a", "waypoints": 1}] * 2])],
                     root, tmp / "backup3", ledger=two)
        except LoadFailed as e:
            assert "stopped answering" in str(e) and "put back as it was" in str(e), e
        else:
            raise AssertionError("a Load cut off part-way reported nothing")
        finally:
            shutil.copyfile = real_copy
        assert {first_guid: md5(live), second_guid: md5(second_live)} == before, \
            "the Card written before the Controller went away was not put back"

        # The last Card failing its read-back puts back the first as well.
        def corrupt_last():
            second_live.write_bytes(b"not what was sent")
        try:
            load_all([(tmp / "spec.json", [dict(p) for p in [{"out": live, "name": "a", "waypoints": 1}] * 2])],
                     root, tmp / "backup4", fresh_mount=corrupt_last, ledger=two)
        except LoadFailed as e:
            assert second_card in str(e), e
        else:
            raise AssertionError("a mismatch on the last Card was accepted")
        assert {first_guid: md5(live), second_guid: md5(second_live)} == before

        # A Load started by hand while another holds the Controller is refused.
        lock = tmp / "controller.lock"
        first_hold = controller_lock(lock)
        try:
            controller_lock(lock)
        except SystemExit as e:
            assert "Another Load" in str(e), e
        else:
            raise AssertionError("two Loads could hold the Controller at once")
        finally:
            first_hold.close()
        controller_lock(lock).close()  # free again once the first is done

        # A refusal that has not changed is not written again every minute.
        seen = tmp / "last-refusal.json"
        assert refusal_is_news(seen, "locked", 1000.0)
        seen.write_text(json.dumps({"reason": "locked", "at": 1000.0}))
        assert not refusal_is_news(seen, "locked", 1060.0), "the same refusal a minute later is not news"
        assert refusal_is_news(seen, "something else", 1060.0)
        assert refusal_is_news(seen, "locked", 1000.0 + REPEAT_AFTER_S + 1), "it is said again after a while"

        # The queue: every unloaded Spec that is not withdrawn, oldest first.
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
        # Two Missions of one Site on one day are two flights, not a correction
        # (ADR 0021): both wait, so both Load. The host used to keep only the
        # newer, and the older stayed Collected forever holding its Card (#161).
        other = specs / "site" / "2026-09-14" / "20260914T070000Z.json"
        other.write_text("{}")
        assert unloaded_queue(specs, record) == [other, newer]
        # Supersession and withdrawal both reach the host as the skip list.
        (specs / "_status").mkdir(parents=True, exist_ok=True)
        (specs / "_status" / "skipped.json").write_text(
            json.dumps({"specs/site/2026-09-14/20260914T070000Z.json": {"withdrawn_at": "2026-09-14T09:00:00Z"}}))
        assert unloaded_queue(specs, record) == [newer]
        (specs / "_status" / "skipped.json").unlink()
        record.write_text(json.dumps(json.loads(record.read_text()) + [str(newer)]))
        assert unloaded_queue(specs, record) == [other]  # a Loaded one never comes back

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
            (specs / "a.json", "way finder 1", {"name": "A", "waypoints": 3}),
            (specs / "a.json", "way finder 2", {"name": "A2", "waypoints": 2}),
            (specs / "b.json", "way finder 3", {"name": "B", "waypoints": 7}),
        ])
        assert [(spec.name, [c for c, _ in group]) for spec, group in grouped] == [
            ("a.json", ["way finder 1", "way finder 2"]),
            ("b.json", ["way finder 3"]),
        ], grouped
        for _, group in grouped:
            for card, part in group:  # two values, not three
                assert isinstance(card, str) and "waypoints" in part

        _ledger_fixture_check()

        # A queue that does not fit raises before anything is staged.
        try:
            load_all([(specs / "big.json", [{"name": "x", "waypoints": 1}] * (len(cards()) + 1))],
                     root, tmp / "backup3")
        except b2_status.QueueOverflowError as e:
            assert "only" in str(e) and "way finder" in str(e), e
        else:
            raise AssertionError("an overfull queue was accepted")

        # A stale mount reads as not mounted instead of crashing the Load.
        class Stale(type(tmp)):
            def is_dir(self):
                raise OSError(5, "Input/output error")
        assert mounted(tmp) is False  # no STORAGE directory
        assert mounted(Stale(tmp)) is False

        # A Reservation that does not match the plan the writer produced is
        # refused rather than truncated: one Card reserved, two Missions made.
        two_parts = b2_status.with_reservation(
            {"pool": pool, "holdings": {}}, ["way finder 1"], "spec.json", "t")
        try:
            reserved_plan([(tmp / "spec.json", [{"name": "A"}, {"name": "B"}])], two_parts)
        except b2_status.LedgerRefusal as e:
            assert "reserved 1 Card(s)" in str(e) and "Dispatch it again" in str(e), e
        else:
            raise AssertionError("a Reservation that did not match the plan was accepted")

        # A Card reserved that this Controller does not have is refused by name.
        beyond = f"way finder {len(cards()) + 1}"
        uncalibrated = b2_status.with_reservation(
            {"pool": pool + [beyond], "holdings": {}}, [beyond], "spec.json", "t")
        try:
            reserved_plan([(tmp / "spec.json", [{"name": "A"}])], uncalibrated)
        except b2_status.LedgerRefusal as e:
            assert beyond in str(e) and "not calibrated" in str(e), e
        else:
            raise AssertionError("a Card outside the calibrated pool was Loaded into")
    # The bootstrap: nothing else writes the pool, and without a pool the
    # planner cannot reserve, so the host refuses every Spec forever. An empty
    # Ledger must therefore gain the calibrated Cards on an ordinary run.
    import copy
    import load as _self  # the module object, to stand in for its store calls
    _self.SETTLE_S = 0
    _written: dict = {}
    _stored: dict = {"ledger": {"pool": [], "holdings": {}}}
    _fetch, _publish = _self.fetch_ledger, _self.publish_ledger

    def _publish_to_store(cfg, ledger):
        _written.clear()
        _written.update(ledger)
        _stored["ledger"] = copy.deepcopy(ledger)
    try:
        _self.fetch_ledger = lambda cfg: copy.deepcopy(_stored["ledger"])
        _self.publish_ledger = _publish_to_store
        _self.publish_pool(Path("/nonexistent"))
        assert _written.get("pool") == [c for c, _ in cards()], _written
        _written.clear()
        _self.publish_pool(Path("/nonexistent"))
        assert _written == {}, "an unchanged pool must not cost a write"
        # An unreadable Ledger is never written over. It used to read as empty,
        # and publishing the pool onto it erased every Reservation (#161).
        def _unreadable(cfg):
            raise LedgerUnreadable("store down")
        _self.fetch_ledger = _unreadable
        try:
            _self.publish_pool(Path("/nonexistent"))
        except LedgerUnreadable:
            pass
        else:
            raise AssertionError("an unreadable Ledger was treated as empty")
        assert _written == {}, "nothing may be written over a Ledger that was not read"

        # The Ledger is written from a fresh read: a Reservation made while
        # the Load ran survives the Load's own bookkeeping.
        during = b2_status.with_reservation(
            {"pool": ["way finder 1", "way finder 2"], "holdings": {}}, ["way finder 1"], "a.json", "t0")
        dispatched_meanwhile = b2_status.with_reservation(during, ["way finder 2"], "b.json", "t1")
        _stored["ledger"] = copy.deepcopy(dispatched_meanwhile)
        _self.fetch_ledger = lambda cfg: copy.deepcopy(_stored["ledger"])
        _self.record_written(Path("/nonexistent"), {**during, "verified_at": "t2"}, {"way finder 1": "md5"})
        assert _written["holdings"]["way finder 2"]["spec_key"] == "b.json", _written
        assert _written["holdings"]["way finder 1"]["written_md5"] == "md5", _written
        assert _written["verified_at"] == "t2", _written

        # A planner write that lands on top of ours is seen on the read-back,
        # and ours is made again against it rather than silently lost (#152).
        _stored["ledger"] = copy.deepcopy(during)
        overwrites = []

        def _planner_overwrites_once(cfg, ledger):
            _publish_to_store(cfg, ledger)
            if not overwrites:
                overwrites.append(1)
                _stored["ledger"] = copy.deepcopy(dispatched_meanwhile)  # theirs, from before ours landed
        _self.publish_ledger = _planner_overwrites_once
        _self.record_written(Path("/nonexistent"), {**during, "verified_at": "t3"}, {"way finder 1": "md5b"})
        final = _stored["ledger"]
        assert final["holdings"]["way finder 1"]["written_md5"] == "md5b", final
        assert final["holdings"]["way finder 2"]["spec_key"] == "b.json", "their Reservation kept too"
    finally:
        _self.fetch_ledger, _self.publish_ledger = _fetch, _publish

    # A Spec without a Reservation is set aside by name; it never holds up the
    # reserved Specs beside it, which used to be refused with it (#161).
    reserved_ledger = b2_status.with_reservation(
        {"pool": ["way finder 1"], "holdings": {}}, ["way finder 1"], "b.json", "t")
    assert split_reserved([Path("a.json"), Path("b.json")], reserved_ledger) == \
        ([Path("b.json")], [Path("a.json")])

    # The survey only reports, so the one thing it must get right is when it
    # says creation order can be trusted. A Card sitting out of order has to be
    # named, not averaged over.
    with tempfile.TemporaryDirectory() as tmpdir:
        import zipfile
        root = Path(tmpdir)
        guids = [g for _, g in cards()]

        def _controller(order: list[str]) -> None:
            for i, guid in enumerate(order):
                d = root / WAYPOINT_DIR / guid
                d.mkdir(parents=True, exist_ok=True)
                with zipfile.ZipFile(d / f"{guid}.kmz", "w") as z:
                    z.writestr("wpmz/template.kml",
                               f"<wpml:createTime>{1_700_000_000_000 + i * 60_000}</wpml:createTime>")
                    z.writestr("wpmz/waylines.wpml", "<kml/>")

        _controller(guids)
        rows = survey(root)
        assert [g for _, g in rows] == guids, "the survey must report oldest first"
        assert survey_disagrees(rows) == [], survey_disagrees(rows)

        # Two Placeholders created in the other order: the survey must say so
        # rather than let creation order name the remaining Cards.
        shutil.rmtree(root / WAYPOINT_DIR)
        _controller([guids[1], guids[0]] + guids[2:])
        problems = survey_disagrees(survey(root))
        assert any("way finder 1" in x for x in problems), problems

    print("load self-check: ok")


def publish_pool(status_config: Path) -> dict:
    """Put the calibrated Card names into the Ledger, so the planner can reserve.

    Nothing else writes the pool. The planner reserves Cards at Dispatch and
    refuses when none are free, so an empty pool refuses every Dispatch; the
    host refuses every Spec that has no Reservation. Between them, a store that
    has never seen a pool can never start -- the planner cannot reserve and the
    host never gets far enough to say what exists.

    So the pool is published on every run, before the queue is even looked at,
    rather than as a side effect of a successful Load. Calibration belongs to
    the host because only the host can see the Controller (ADR 0022); this is
    where it says so.
    """
    pool = [name for name, _ in cards()]
    was: list = []

    def with_pool(ledger: dict) -> dict:
        was[:] = ledger.get("pool") or []
        return ledger if ledger.get("pool") == pool else {**ledger, "pool": pool}

    ledger = update_ledger(status_config, with_pool)
    if was != pool:
        print(f"published the Card pool to the Ledger: {len(pool)} Cards (was {len(was)})")
    return ledger


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
        _selftest()
        return
    if args.survey:
        if not mounted(MOUNT):
            remount(MOUNT)
        rows = survey(MOUNT / STORAGE)
        by_guid = {guid: name for name, guid in cards()}
        print(f"{len(rows)} Placeholder Missions on the Controller, oldest first:\n")
        for i, (created, guid) in enumerate(rows, 1):
            when = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(created / 1000)) if created else "no createTime"
            print(f"  {i:>3}  {when}  {guid}  {by_guid.get(guid, '')}")
        problems = survey_disagrees(rows)
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
        publish_pool(args.status_config)
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
        # Before anything else: the planner cannot reserve a Card it does not
        # know exists, and it is the only thing that reserves. Publishing the
        # pool here is what lets a store that has never seen one get started.
        try:
            publish_pool(args.status_config)
        except LedgerUnreadable as e:
            print(f"{e}; the Card pool was not published")

        queue = unloaded_queue(SPECS, LOADED)
        if not queue:
            return  # nothing new; cron calls this every minute
        if not args.yes:
            sys.exit("this replaces the Missions in the way finder cards on the Controller; pass --yes")
        try:
            ledger = fetch_ledger(args.status_config)
        except LedgerUnreadable as e:
            reason = (f"{e}; nothing was touched. The Load waits until the Ledger can be read, "
                      f"because it says which Card each Mission goes into.")
            report_refusal(args.status_config, "card-ledger", queue, reason)
            sys.exit(reason)
        # A Spec Loads if and only if it holds a Reservation. One without is
        # withdrawn, superseded, Flown, from before Reservations existed, or
        # caught between its Spec and its Reservation being written -- none of
        # which may hold up the Missions beside it (#161).
        queue, unreserved = split_reserved(queue, ledger)
        for s in unreserved:
            print(f"skipped {spec_key(s)}: no Card is reserved for it, so it is not Loaded. "
                  f"The Missions beside it are not held up.")
        if not queue:
            return
        _held = controller_lock()  # noqa: F841  (held until the process exits)
        try:
            if not mounted(MOUNT):
                remount(MOUNT)
        except LoadFailed as e:
            report_refusal(args.status_config, "controller", queue, str(e))
            sys.exit(str(e))
        ledger = verify_ledger(MOUNT / STORAGE, ledger, args.status_config)
        with tempfile.TemporaryDirectory() as tmp:
            entries = [(spec, build(spec, Path(tmp) / spec.stem)) for spec in queue]
            try:
                loaded = load_all(entries, MOUNT / STORAGE, backups,
                                  fresh_mount=lambda: remount(MOUNT), ledger=ledger)
            except LoadFailed as e:
                report_refusal(args.status_config, "load-failed", queue, str(e))
                sys.exit(str(e))
            except b2_status.QueueOverflowError as e:
                report_overflow(args.status_config, queue, sum(len(p) for _, p in entries))
                sys.exit(str(e))
            except b2_status.LedgerRefusal as e:
                report_refusal(args.status_config, "card-ledger", queue, str(e))
                stamp_verified(args.status_config, ledger)  # the verification still happened
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
        record_written(args.status_config, ledger, {card: part["written_md5"] for _, card, part in loaded})
        print(time.strftime("%Y-%m-%d %H:%M:%S"), ", ".join(str(s) for s in queue))
        print(sheet)
        print("Close and reopen each card's waypoint editor on the Controller to load it.")
        return
    if not args.spec or not args.spec.exists():
        sys.exit("name a Mission Spec file to Load")
    if not args.yes:
        sys.exit("this replaces the Missions in the way finder cards on the Controller; pass --yes")
    _held = controller_lock()  # noqa: F841  (held until the process exits)
    try:
        if not mounted(MOUNT):
            remount(MOUNT)
    except LoadFailed as e:
        sys.exit(str(e))

    backups = LOADS / stamp
    try:
        ledger = fetch_ledger(args.status_config)
    except LedgerUnreadable as e:
        sys.exit(f"{e}; nothing was touched")
    ledger = verify_ledger(MOUNT / STORAGE, ledger, args.status_config)
    try:
        loaded = load(args.spec, MOUNT / STORAGE, backups,
                      fresh_mount=lambda: remount(MOUNT), ledger=ledger)
    except LoadFailed as e:
        report_refusal(args.status_config, "load-failed", [args.spec], str(e))
        sys.exit(str(e))
    except b2_status.LedgerRefusal as e:
        report_refusal(args.status_config, "card-ledger", [args.spec], str(e))
        stamp_verified(args.status_config, ledger)  # the verification still happened
        sys.exit(str(e))
    sheet = "\n".join(f"Open {card}: {part['name']} ({part['waypoints']} waypoints)" for card, part in loaded)
    (backups / "cards.txt").write_text(sheet + "\n")
    done = json.loads(LOADED.read_text()) if LOADED.exists() else []
    LOADED.write_text(json.dumps(done + [str(args.spec)], indent=1))
    report_loaded(args.status_config, [(spec_key(args.spec), loaded)])
    record_written(args.status_config, ledger, {card: part["written_md5"] for card, part in loaded})
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


def _store(status_config: Path) -> dict:
    """Authorized store access for the status key (read specs/, write status/*)."""
    from collect import load_env, authorize  # local import: same bin dir, no cycle at runtime
    senv = load_env(status_config)
    return authorize(senv["B2_KEY_ID"], senv["B2_APP_KEY"])


class LedgerUnreadable(Exception):
    """The Ledger could not be read, which is not the same as an empty one."""


def fetch_ledger(status_config: Path) -> dict:
    """The Card Ledger from the store; an empty one only if it was never written.

    A Ledger that cannot be read raises instead of coming back empty. It used to
    come back empty, and every run then published the pool onto that empty
    copy -- erasing every Reservation and every written Card on one failed
    read, after which a Dispatch could be given a Card still holding an unflown
    Mission (#161). The host never chooses Cards for itself, and never writes a
    Ledger it did not read.
    """
    if not status_config.exists():
        raise LedgerUnreadable(f"no status credentials at {status_config}")
    try:
        sauth = _store(status_config)
        return b2_status.download_ledger(
            sauth["downloadUrl"], sauth["allowed"]["bucketName"], sauth["authorizationToken"])
    except (Exception, SystemExit) as e:
        raise LedgerUnreadable(f"the Card Ledger could not be read ({e})") from e


SETTLE_S = float(os.environ.get("LEDGER_SETTLE_S", "1"))


def update_ledger(status_config: Path, change) -> dict:
    """Apply change to the Ledger as it is now, write it only if it changed, and
    check the write survived.

    Re-read immediately before writing, as the planner does: a Load takes long
    enough for the operator to Dispatch in the middle of it, and writing back
    the copy read at the start would erase that Reservation. Then read back
    after a moment, because the store has no compare-and-swap: a planner write
    in flight when ours landed can overwrite it, and ours can overwrite theirs
    -- the planner checks its side the same way (#152).
    """
    # ponytail: narrows the race to the settle window; only a store with
    # compare-and-swap, or one writer, closes it.
    for _ in range(3):
        base = fetch_ledger(status_config)
        changed = change(base)
        if changed == base:
            return changed
        publish_ledger(status_config, changed)
        if SETTLE_S:
            time.sleep(SETTLE_S)
        after = fetch_ledger(status_config)
        if b2_status.change_survived(base, changed, after):
            return after
    raise LedgerUnreadable("the Card Ledger kept changing while the host was writing it, "
                           "so its change could not be confirmed")


def publish_ledger(status_config: Path, ledger: dict) -> None:
    """Write the Ledger back. Bookkeeping, not the Load: the cards are already
    written and verified, so this is loud when it fails and never fatal."""
    if not status_config.exists():
        print(f"no status credentials at {status_config}; the Card Ledger was not updated")
        return
    try:
        sauth = _store(status_config)
        b2_status.upload_ledger(sauth["apiUrl"], sauth["authorizationToken"],
                                sauth["allowed"]["bucketId"], ledger)
    except (Exception, SystemExit) as e:
        print(f"the Card Ledger was not updated ({e}); the Load itself succeeded")
        return
    print("Updated the Card Ledger")


def stamp_verified(status_config: Path, verified: dict) -> None:
    """Carry this run's verified_at onto the Ledger as it is now."""
    try:
        update_ledger(status_config, lambda fresh: {**fresh, "verified_at": verified["verified_at"]}
                      if "verified_at" in verified else fresh)
    except LedgerUnreadable as e:
        print(f"{e}; verified_at was not recorded")


def record_written(status_config: Path, verified: dict, written: dict) -> None:
    """Record the Cards this Load proved, onto the Ledger as it is now.

    The Cards are already written and read back, so this is bookkeeping: loud
    when it fails, never fatal, and never a write-back of the copy read before
    the Load, which would erase a Reservation made while it ran.
    """
    at = b2_status.utcnow()
    try:
        update_ledger(status_config, lambda fresh: b2_status.merge_written(
            {**fresh, **({"verified_at": verified["verified_at"]} if "verified_at" in verified else {})},
            written, at))
    except LedgerUnreadable as e:
        print(f"{e}; the Cards were Loaded but the Ledger does not yet say so. The next plug-in "
              f"verifies them against the Controller.")


def verify_ledger(root: Path, ledger: dict, status_config: Path) -> dict:
    """Check the Ledger against the Controller at this plug-in and stamp
    verified_at. Drift is reported and never corrected: the Ledger keeps saying
    what was planned, because the difference is the only evidence that a Card
    holds something else (ADR 0022)."""
    drift = b2_status.ledger_drift(ledger, observe_cards(root, ledger))
    for d in drift:
        print(f"CARD LEDGER DISAGREES WITH THE CONTROLLER: {d['card']} should hold "
              f"{d['expected']} but holds {d['found']}. Not corrected. Do not fly {d['card']} "
              f"until you have Dispatched and Loaded that Mission again.")
    report_drift(status_config, drift)
    return b2_status.merge_verified(ledger, b2_status.utcnow())


def report_drift(status_config: Path, drift: list[dict]) -> None:
    """Put the disagreement where the planner can withhold readiness over it."""
    if not status_config.exists():
        print(f"no status credentials at {status_config}; drift not reported")
        return
    try:
        sauth = _store(status_config)
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


LAST_REFUSAL = LOADS / "last-refusal.json"
REPEAT_AFTER_S = 30 * 60


def refusal_is_news(record: Path, reason: str, now: float) -> bool:
    """Whether this refusal is worth another write to the store.

    Cron runs every minute while the Controller is plugged in, and a refusal
    that does not change -- a locked Controller, a Ledger that cannot be read --
    would otherwise spend a download and an upload every minute saying the same
    thing. Said again after half an hour, so a stale banner is refreshed.
    """
    try:
        last = json.loads(record.read_text())
    except (OSError, ValueError):
        return True
    return last.get("reason") != reason or now - float(last.get("at", 0)) > REPEAT_AFTER_S


def report_refusal(status_config: Path, kind: str, queue: list[Path], reason: str) -> None:
    """Write a refusal into the manifest so the planner shows it above the
    Missions it held up. Nothing was touched, or everything was put back -- but
    the operator must never learn of it only from a cron log."""
    if not refusal_is_news(LAST_REFUSAL, reason, time.time()):
        return
    try:
        LAST_REFUSAL.parent.mkdir(parents=True, exist_ok=True)
        LAST_REFUSAL.write_text(json.dumps({"reason": reason, "at": time.time()}))
    except OSError:
        pass
    if not status_config.exists():
        print(f"no status credentials at {status_config}; the refusal was not reported")
        return
    try:
        sauth = _store(status_config)
        sallowed = sauth["allowed"]
        manifest = b2_status.download_manifest(
            sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
        b2_status.merge_refusal(manifest, kind, [spec_key(s) for s in queue],
                                reason, b2_status.utcnow())
        b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
    except (Exception, SystemExit) as e:
        print(f"the refusal was not reported ({e})")
        return
    print("Reported the refusal to the manifest")


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
