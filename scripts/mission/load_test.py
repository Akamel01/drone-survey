#!/usr/bin/env python3
"""The Load path's ordinary tests: the decisions in load_core, the edges in load.

    python3 scripts/mission/load_test.py

Standard library unittest only, so CI runs it as one command. Both seams are
faked in this file -- FakeController over the RC2, FakeStore over B2 -- and no
test touches the network, a real Controller, or the store. The Card Ledger
fixture check still asserts against fixtures/card-ledger.json, case for case
with the web suite; it is skipped loudly when the checkout's fixture is absent,
as in the host's flat deploy.
"""

from __future__ import annotations

import ast
import copy
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import b2_status  # noqa: E402
import kmz  # noqa: E402
import load  # noqa: E402  (the CLI, build, and the two real adapters)
import load_core  # noqa: E402  (every decision; every test drives this interface)

FIXTURE = HERE.parents[1] / "fixtures" / "card-ledger.json"
LOAD_PY = HERE / "load.py"

CONTROLLER_BUSY_MESSAGE = ("Another Load is writing to the Controller right now; nothing was touched. "
                           "It finishes on its own -- check again in a minute.")


# --- fixtures and fakes -----------------------------------------------------

def spec_tree(root: Path, *rels: str) -> list[Path]:
    """Write `{}` Specs at the given paths under root; return them in order."""
    made = []
    for rel in rels:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{}")
        made.append(path)
    return made


def placeholder_entry(name: str) -> zipfile.ZipInfo:
    """A fixed timestamp: repeated generations must be byte-identical (M3 review F1)."""
    return zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))


def write_kmz(path: Path, create_ms: int = 1789000000000, waylines: bytes = b"<kml/>") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(placeholder_entry("wpmz/template.kml"),
                   f"<wpml:createTime>{create_ms}</wpml:createTime><wpml:author>fly</wpml:author>")
        z.writestr(placeholder_entry("wpmz/waylines.wpml"), waylines)
    return path


def placeholder_bytes(create_ms: int = 1789000000000, waylines: bytes = b"<kml/>") -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(placeholder_entry("wpmz/template.kml"),
                   f"<wpml:createTime>{create_ms}</wpml:createTime><wpml:author>fly</wpml:author>")
        z.writestr(placeholder_entry("wpmz/waylines.wpml"), waylines)
    return buf.getvalue()


def make_part(tmp: Path, name: str = "mission A", waypoints: int = 3, data: bytes = b"kmz bytes"):
    source = tmp / f"{name.replace(' ', '_')}.kmz"
    source.write_bytes(data)
    return load_core.Part(name=name, waypoints=waypoints, source=source)


def reservation(specs_root: Path, spec: Path, cards, pool=None) -> dict:
    """A Ledger holding exactly these Cards for spec, in flight order."""
    pool = list(pool) if pool is not None else list(cards)
    return b2_status.with_reservation({"pool": pool, "holdings": {}}, list(cards),
                                      load_core.spec_key(spec, specs_root), "2026-09-23T00:00:00Z")


def fake_controller(slots, create_ms: int = 1789000000000) -> "FakeController":
    """Every calibrated slot, as a Card holding a Placeholder KMZ with a template createTime."""
    return FakeController({guid: placeholder_bytes(create_ms) for guid in slots.values()})


class FakeController:
    """The Controller seam. `cards` maps guid -> live KMZ bytes; a guid mapped to
    None is a Card directory whose KMZ is gone (reads as None, N2)."""

    def __init__(self, cards: dict[str, bytes | None] | None = None):
        self.cards = dict(cards or {})
        self.backups: dict[str, bytes] = {}
        self.writes: list[tuple[str, Path]] = []
        self.holds = 0
        self.mounted = True
        self.busy = False
        self.fail_write_at: int | None = None      # 1-based write to fail
        self.corrupt_on_mount: str | None = None   # guid whose bytes change at mount()
        self.vanish_on_mount: str | None = None    # guid whose KMZ disappears at mount()
        self.unlistable = False                    # present_guids raises ControllerUnreadable
        self.mounts = 0                            # mount() recorded (M1 review D6)
        self.reads: list[str] = []
        self.listed = 0
        self.rows: list[tuple[int | None, str]] = []

    def present(self) -> bool:
        return self.mounted

    def mount(self) -> None:
        self.mounts += 1
        if self.corrupt_on_mount is not None:
            self.cards[self.corrupt_on_mount] = b"not what was sent"
        if self.vanish_on_mount is not None and self.vanish_on_mount in self.cards:
            self.cards[self.vanish_on_mount] = None

    def hold(self) -> None:
        self.holds += 1
        if self.busy:
            raise load_core.ControllerBusy(CONTROLLER_BUSY_MESSAGE)

    def survey(self) -> list[tuple[int | None, str]]:
        return list(self.rows)

    def present_guids(self) -> set[str]:
        self.listed += 1
        if self.unlistable:
            raise load_core.ControllerUnreadable(
                "could not read the Controller's Missions at (fake): store down")
        return set(self.cards)

    def read(self, guid: str) -> bytes | None:
        self.reads.append(guid)
        return self.cards.get(guid)

    def write(self, guid: str, source: Path) -> str:
        self.writes.append((guid, Path(source)))
        if self.fail_write_at is not None and len(self.writes) == self.fail_write_at:
            raise OSError(5, "Input/output error")
        data = Path(source).read_bytes()
        self.cards[guid] = data
        return hashlib.md5(data).hexdigest()

    def backup(self, guid: str, backups: Path) -> None:
        if guid not in self.backups:
            self.backups[guid] = self.cards.get(guid)

    def restore(self, guid: str, backups: Path) -> None:
        self.cards[guid] = self.backups[guid]


class FakeStore:
    """The store seam: an in-memory Ledger, the publishes it saw, and a hook for
    the planner-overwrite race (#152)."""

    def __init__(self, ledger: dict | None = None):
        self.ledger = copy.deepcopy(ledger if ledger is not None else {"pool": [], "holdings": {}})
        self.published: list[dict] = []
        self.publish_hook = None
        self.unreadable = False
        self.reports: list[tuple[str, object]] = []

    def fetch_ledger(self) -> dict:
        if self.unreadable:
            raise load_core.LedgerUnreadable("the Card Ledger could not be read (store down)")
        return copy.deepcopy(self.ledger)

    def publish_ledger(self, ledger: dict) -> None:
        self.published.append(copy.deepcopy(ledger))
        self.ledger = copy.deepcopy(ledger)
        if self.publish_hook is not None:
            self.publish_hook(ledger)

    def report_drift(self, drift: list[dict]) -> None:
        self.reports.append(("drift", copy.deepcopy(drift)))

    def report_refusal(self, kind: str, spec_keys: list[str], reason: str) -> None:
        self.reports.append(("refusal", (kind, list(spec_keys), reason)))

    def report_overflow(self, spec_keys: list[str], needed: int, have: int) -> None:
        self.reports.append(("overflow", (list(spec_keys), needed, have)))

    def report_loaded(self, entries: list) -> None:
        self.reports.append(("loaded", copy.deepcopy(entries)))


class TempMountedController(load.MountedController):
    """The real adapter over a temp root, with the re-mount stubbed: mount() here
    must never run fusermount/jmtpfs. It records instead (apply always calls it)."""

    def __init__(self, root: Path, lock: Path):
        super().__init__(root, lock=lock)
        self.mounts = 0

    def mount(self) -> None:
        self.mounts += 1


SELFTEST_SPEC = {
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


class FakeSetupTest(unittest.TestCase):
    """Cluster 1: every calibrated slot dir + KMZ with a template createTime."""

    def test_every_slot_has_a_card(self):
        slots = {"way finder 1": "G1", "way finder 2": "G2"}
        controller = fake_controller(slots)
        self.assertEqual(controller.present_guids(), {"G1", "G2"})
        for guid in slots.values():
            data = controller.read(guid)
            self.assertIsNotNone(data)
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                self.assertIn(b"<wpml:createTime>", z.read("wpmz/template.kml"))


class PlanTest(unittest.TestCase):
    """Clusters 2, 7, 17, 19 and the moved present check (F4/N2)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.specs = self.tmp / "specs"
        self.spec = spec_tree(self.specs, "site/2026-09-13/20260913T090000Z.json")[0]
        self.slots = {"way finder 1": "G1", "way finder 2": "G2"}
        self.part = make_part(self.tmp)
        self.controller = FakeController({"G1": b"one", "G2": b"two"})

    def test_no_reservation_refused_by_name(self):
        with self.assertRaises(b2_status.LedgerRefusal) as cm:
            load_core.plan([(self.spec, [self.part])],
                           {"pool": ["way finder 1", "way finder 2"], "holdings": {}},
                           self.slots, self.controller, self.specs)
        self.assertIn("no Card is reserved", str(cm.exception))
        self.assertIn("Dispatch it again", str(cm.exception))
        backups = self.tmp / "backup0"
        self.assertFalse(backups.exists(), "a refused Load must not touch a card")
        self.assertEqual(self.controller.backups, {})
        self.assertEqual(self.controller.writes, [])
        self.assertEqual(self.controller.reads, [])

    def test_pool_drift_refuses(self):
        controller = FakeController({"G1": b"one"})  # G2 was calibrated, is gone
        with self.assertRaises(b2_status.LedgerRefusal) as cm:
            load_core.plan([(self.spec, [self.part])],
                           reservation(self.specs, self.spec, ["way finder 1"]),
                           self.slots, controller, self.specs)
        self.assertIn("pool has changed", str(cm.exception))
        self.assertIn("Recalibrate", str(cm.exception))
        self.assertIn("way finder 2 (G2) was calibrated but is no longer on the Controller",
                      str(cm.exception))

    def test_uncalibrated_stray_is_not_drift(self):
        self.assertEqual(load_core.pool_drift(self.slots, self.controller), [])
        self.controller.cards["E1E1E1E1-0000-0000-0000-000000000000"] = placeholder_bytes()
        self.assertEqual(load_core.pool_drift(self.slots, self.controller), [],
                         "an uncalibrated Placeholder is not drift")
        # ... and the Load then proceeds to the Card the Spec reserved.
        decision = load_core.plan([(self.spec, [self.part])],
                                  reservation(self.specs, self.spec, ["way finder 1"]),
                                  self.slots, self.controller, self.specs)
        self.assertEqual([p.card for p in decision.parts], ["way finder 1"])

    def test_overflow_before_anything(self):
        slots = {"way finder 1": "G1"}  # one card, two Missions
        with self.assertRaises(b2_status.QueueOverflowError) as cm:
            load_core.plan([(self.spec, [self.part, make_part(self.tmp, "mission B")])],
                           reservation(self.specs, self.spec, ["way finder 1"], pool=["way finder 1"]),
                           slots, self.controller, self.specs)
        self.assertIn("only", str(cm.exception))
        self.assertIn("way finder", str(cm.exception))
        self.assertEqual(self.controller.listed, 0, "overflow is refused before the pool is even listed")
        self.assertEqual(self.controller.reads, [])

    def test_reserved_one_made_two(self):
        with self.assertRaises(b2_status.LedgerRefusal) as cm:
            load_core.plan([(self.spec, [self.part, make_part(self.tmp, "mission B")])],
                           reservation(self.specs, self.spec, ["way finder 1"]),
                           self.slots, self.controller, self.specs)
        self.assertIn("reserved 1 Card(s)", str(cm.exception))
        self.assertIn("Dispatch it again", str(cm.exception))

    def test_uncalibrated_card_named(self):
        beyond = "way finder 9"
        ledger = reservation(self.specs, self.spec, [beyond], pool=["way finder 1", "way finder 2", beyond])
        with self.assertRaises(b2_status.LedgerRefusal) as cm:
            load_core.plan([(self.spec, [self.part])], ledger, self.slots, self.controller, self.specs)
        self.assertIn(beyond, str(cm.exception))
        self.assertIn("not calibrated", str(cm.exception))

    def test_missing_kmz_refused_and_nothing_touched(self):
        # N2 + F4: the Card directory is present but its KMZ is gone, so it reads
        # as None; the Load is refused by the old name and nothing is backed up.
        controller = FakeController({"G1": None, "G2": b"two"})
        with self.assertRaises(load_core.NotOnController) as cm:
            load_core.plan([(self.spec, [self.part])],
                           reservation(self.specs, self.spec, ["way finder 1"]),
                           self.slots, controller, self.specs)
        self.assertEqual(str(cm.exception),
                         "way finder 1 (G1) is not on the Controller; is it plugged in and unlocked?")
        self.assertEqual(controller.backups, {})
        self.assertEqual(controller.writes, [])


class LoadTest(unittest.TestCase):
    """Cluster 3: the reserved Card is used; the writer's report is the file;
    the backup holds the original; the slot keeps its createTime."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls._tmp.cleanup)
        cls.tmp = Path(cls._tmp.name)
        cls.specs = cls.tmp / "specs"
        cls.spec = spec_tree(cls.specs, "selftest-field/2026-09-13/20260913T090000Z.json")[0]
        cls.spec.write_text(json.dumps(SELFTEST_SPEC))
        cls.parts = load.build(cls.spec, cls.tmp / "built")  # the real writer
        cls.cards = [f"way finder {i}" for i in range(1, len(cls.parts) + 1)]
        cls.guids = [f"G{i}" for i in range(1, len(cls.parts) + 1)]
        cls.slots = dict(zip(cls.cards, cls.guids))

    def test_reserved_card_used_and_backup_holds_original(self):
        controller = FakeController({g: placeholder_bytes() for g in self.guids})
        ledger = reservation(self.specs, self.spec, self.cards, pool=self.cards)
        decision = load_core.plan([(self.spec, self.parts)], ledger, self.slots, controller, self.specs)
        result = load_core.apply(decision, controller, self.tmp / "backup-used")
        self.assertEqual([p.card for p in result.loaded], self.cards)
        self.assertEqual(controller.mounts, 1)  # apply always re-mounts, once
        for guid in self.guids:
            self.assertEqual(controller.backups[guid], placeholder_bytes(),
                             "the backup holds the Placeholder that was there")
        for planned in result.loaded:
            live = planned.part.source.read_bytes()
            self.assertEqual(controller.cards[planned.guid], live)
            self.assertEqual(planned.part.written_md5, hashlib.md5(live).hexdigest())

    def test_create_time_survives(self):
        root = self.tmp / "controller"
        for guid in self.guids:
            write_kmz(root / kmz.WAYPOINT_DIR / guid / f"{guid}.kmz")
        controller = TempMountedController(root, lock=self.tmp / "controller.lock")
        ledger = reservation(self.specs, self.spec, self.cards, pool=self.cards)
        decision = load_core.plan([(self.spec, self.parts)], ledger, self.slots, controller, self.specs)
        result = load_core.apply(decision, controller, self.tmp / "backup-time")
        self.assertEqual(controller.mounts, 1)
        for planned in result.loaded:
            live = root / kmz.WAYPOINT_DIR / planned.guid / f"{planned.guid}.kmz"
            self.assertEqual(kmz.read_create_time(live), 1789000000000,
                             "the slot keeps its own createTime")
            with zipfile.ZipFile(live) as z:
                self.assertEqual(z.read("wpmz/waylines.wpml").count(b"<Placemark>"),
                                 planned.part.waypoints,
                                 "the live file has the waypoints the writer reported")
            self.assertEqual(load.md5(live), planned.part.written_md5)


class RecordWrittenTest(unittest.TestCase):
    """Cluster 4: only a verified write is reported, and its md5 is the live one."""

    def test_written_md5_stamped(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            specs = tmp / "specs"
            spec = spec_tree(specs, "site/2026-09-13/20260913T090000Z.json")[0]
            parts = [make_part(tmp, name="mission A", data=b"the written KMZ")]
            controller = FakeController({"G1": b"placeholder"})
            slots = {"way finder 1": "G1"}
            ledger = reservation(specs, spec, ["way finder 1"], pool=["way finder 1"])
            decision = load_core.plan([(spec, parts)], ledger, slots, controller, specs)
            result = load_core.apply(decision, controller, tmp / "backup")
            now = "2026-09-23T01:00:00Z"
            store = FakeStore(ledger)
            notes = []
            load_core.record_written(store, {**ledger, "verified_at": now},
                                     {result.loaded[0].card: result.loaded[0].part.written_md5},
                                     now, notes.append, settle_s=0, sleep=lambda s: None)
            held = store.ledger["holdings"]["way finder 1"]
            self.assertEqual(held["written_md5"], hashlib.md5(controller.cards["G1"]).hexdigest())
            self.assertEqual(held["written_at"], now)
            self.assertEqual(store.ledger["verified_at"], now)
            self.assertEqual(notes, [])
            # A Card the Ledger does not hold is never invented by a write report.
            store2 = FakeStore(ledger)
            load_core.record_written(store2, ledger, {"way finder 1": "abc", "way finder 9": "never"},
                                     now, lambda s: None, settle_s=0, sleep=lambda s: None)
            self.assertNotIn("way finder 9", store2.ledger["holdings"])


class VerifyTest(unittest.TestCase):
    """Clusters 5 and 6: the read-back is the evidence; drift is named, not corrected."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.spec_key = "specs/rehearsal-field/2026-09-17/20260917T014122Z.json"
        live = b"what this host wrote"
        self.ledger = {"pool": ["way finder 1", "way finder 2", "way finder 3"], "holdings": {
            "way finder 1": {"card": "way finder 1", "spec_key": self.spec_key, "flight": 1,
                             "flights": 1, "reserved_at": "t", "written_at": "t",
                             "written_md5": hashlib.md5(live).hexdigest()},
            # Reserved but never written: not evidence of anything on the Controller.
            "way finder 3": {"card": "way finder 3", "spec_key": "other.json", "flight": 1,
                             "flights": 1, "reserved_at": "t"},
        }}
        self.slots = {"way finder 1": "G1", "way finder 2": "G2", "way finder 3": "G3"}
        self.controller = FakeController({"G1": live, "G2": b"someone else's mission",
                                          "G3": placeholder_bytes()})

    def test_observe_and_no_drift(self):
        self.assertEqual(load_core.observe_cards(self.ledger, self.slots, self.controller),
                         {"way finder 1": self.spec_key})
        merged, drift = load_core.verify(self.ledger, self.slots, self.controller,
                                         "2026-09-23T02:00:00Z")
        self.assertEqual(drift, [])
        self.assertEqual(merged["verified_at"], "2026-09-23T02:00:00Z")

    def test_reserved_but_unwritten_is_not_evidence(self):
        seen = load_core.observe_cards(self.ledger, self.slots, self.controller)
        self.assertNotIn("way finder 3", seen)
        self.assertEqual(b2_status.ledger_drift(self.ledger, seen), [])

    def test_drift_named_not_corrected(self):
        self.controller.cards["G1"] = b"a Mission this host did not write"
        seen = load_core.observe_cards(self.ledger, self.slots, self.controller)
        self.assertTrue(seen["way finder 1"].startswith("unknown contents"), seen)
        merged, drift = load_core.verify(self.ledger, self.slots, self.controller,
                                         "2026-09-23T02:00:00Z")
        self.assertEqual([d["card"] for d in drift], ["way finder 1"])
        self.assertEqual(drift[0]["expected"], self.spec_key)
        self.assertEqual(drift[0]["found"], seen["way finder 1"])
        self.assertEqual(merged["holdings"]["way finder 1"]["spec_key"], self.spec_key,
                         "the Ledger keeps saying what was planned; drift is reported, not corrected")


class ApplyTest(unittest.TestCase):
    """Clusters 8, 9, 10 and the N2 apply case: any failure puts every Card back."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.specs = self.tmp / "specs"
        self.spec = spec_tree(self.specs, "site/2026-09-13/20260913T090000Z.json")[0]
        self.slots = {"way finder 1": "G1", "way finder 2": "G2"}
        self.parts = [make_part(self.tmp, "mission A", data=b"kmz A"),
                      make_part(self.tmp, "mission B", data=b"kmz B")]
        self.ledger = reservation(self.specs, self.spec, ["way finder 1", "way finder 2"])

    def decision(self, controller):
        return load_core.plan([(self.spec, self.parts)], self.ledger, self.slots, controller, self.specs)

    def test_success_writes_backs_up_and_records(self):
        controller = FakeController({"G1": b"one", "G2": b"two"})
        result = load_core.apply(self.decision(controller), controller, self.tmp / "backup-ok")
        self.assertEqual([p.card for p in result.loaded], ["way finder 1", "way finder 2"])
        self.assertEqual(controller.cards, {"G1": self.parts[0].source.read_bytes(),
                                            "G2": self.parts[1].source.read_bytes()})
        self.assertEqual(controller.backups, {"G1": b"one", "G2": b"two"})
        self.assertEqual([w[0] for w in controller.writes], ["G1", "G2"])

    def test_mismatch_rolls_back_all(self):
        controller = FakeController({"G1": b"one", "G2": b"two"})
        before = dict(controller.cards)
        controller.corrupt_on_mount = "G1"
        with self.assertRaises(load_core.LoadFailed) as cm:
            load_core.apply(self.decision(controller), controller, self.tmp / "backup-bad")
        self.assertIn("did not match", str(cm.exception))
        self.assertIn("put back", str(cm.exception))
        self.assertEqual(controller.cards, before)
        self.assertEqual(controller.backups, before)

    def test_unplugged_mid_write_rolls_back(self):
        controller = FakeController({"G1": b"one", "G2": b"two"})
        before = dict(controller.cards)
        controller.fail_write_at = 2
        with self.assertRaises(load_core.LoadFailed) as cm:
            load_core.apply(self.decision(controller), controller, self.tmp / "backup-cut")
        self.assertIn("stopped answering", str(cm.exception))
        self.assertIn("put back as it was", str(cm.exception))
        self.assertEqual(controller.cards, before,
                         "the Card written before the Controller went away was put back")
        self.assertEqual(len(controller.writes), 2)

    def test_last_card_mismatch_rolls_back(self):
        controller = FakeController({"G1": b"one", "G2": b"two"})
        before = dict(controller.cards)
        controller.corrupt_on_mount = "G2"
        with self.assertRaises(load_core.LoadFailed) as cm:
            load_core.apply(self.decision(controller), controller, self.tmp / "backup-last")
        self.assertIn("way finder 2", str(cm.exception))
        self.assertEqual(controller.cards, before)
        self.assertEqual(controller.backups, before)

    def test_missing_kmz_reads_as_mismatch_never_md5_none(self):
        controller = FakeController({"G1": b"one", "G2": b"two"})
        before = dict(controller.cards)
        decision = self.decision(controller)
        controller.vanish_on_mount = "G1"  # the KMZ is gone when the read-back happens
        with self.assertRaises(load_core.LoadFailed) as cm:  # a TypeError would fail here
            load_core.apply(decision, controller, self.tmp / "backup-gone")
        self.assertIn("did not match", str(cm.exception))
        self.assertEqual(controller.cards, before)


class LockTest(unittest.TestCase):
    """Cluster 11: another Load holds the Controller; it frees when that one exits."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.lock = self.root / "controller.lock"

    def test_second_hold_refused(self):
        first = load.MountedController(self.root, lock=self.lock)
        second = load.MountedController(self.root, lock=self.lock)
        first.hold()
        try:
            with self.assertRaises(load_core.ControllerBusy) as cm:
                second.hold()
            self.assertEqual(str(cm.exception), CONTROLLER_BUSY_MESSAGE)
        finally:
            first._lock_handle.close()

    def test_free_after_close(self):
        first = load.MountedController(self.root, lock=self.lock)
        first.hold()
        first._lock_handle.close()
        again = load.MountedController(self.root, lock=self.lock)
        again.hold()  # free again once the first is done
        again._lock_handle.close()


class RefusalNewsTest(unittest.TestCase):
    """Cluster 12: the record file's read/write, now in announce_refusal."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.record = self.tmp / "last-refusal.json"
        self.spec = self.tmp / "spec.json"
        self.spec.write_text("{}")
        self.store = FakeStore()

    def announce(self, reason, now):
        load.announce_refusal(self.store, "card-ledger", [self.spec], reason,
                              now=now, record=self.record)

    def refusals(self):
        return [payload for kind, payload in self.store.reports if kind == "refusal"]

    def test_first_is_news_and_recorded(self):
        self.announce("locked", 1000.0)
        self.assertEqual(len(self.refusals()), 1)
        kind, spec_keys, reason = self.refusals()[0]
        self.assertEqual(kind, "card-ledger")
        self.assertEqual(spec_keys, [self.spec.name])  # not under the real specs root
        self.assertEqual(reason, "locked")
        self.assertEqual(json.loads(self.record.read_text()), {"reason": "locked", "at": 1000.0})

    def test_same_reason_is_not_news(self):
        self.announce("locked", 1000.0)
        self.announce("locked", 1060.0)
        self.assertEqual(len(self.refusals()), 1, "the same refusal a minute later is not news")
        self.assertEqual(json.loads(self.record.read_text())["at"], 1000.0, "the record is not rewritten")

    def test_changed_reason_and_after_window_are_news(self):
        self.announce("locked", 1000.0)
        self.announce("something else", 1060.0)
        self.assertEqual(len(self.refusals()), 2)
        self.announce("something else", 1060.0 + load_core.REPEAT_AFTER_S + 1)
        self.assertEqual(len(self.refusals()), 3, "it is said again after a while")


class QueueTest(unittest.TestCase):
    """Cluster 13: adopt when the record is lost; both flights of a day wait;
    the skip list excludes a Withdrawn Spec; a Loaded one never returns."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)
        self.specs = self.tmp / "specs"
        self.f0900, self.f1400 = spec_tree(
            self.specs, "site/2026-09-13/20260913T090000Z.json", "site/2026-09-13/20260913T140000Z.json")
        self.newer = spec_tree(self.specs, "site/2026-09-14/20260914T080000Z.json")[0]
        self.other = self.specs / "site" / "2026-09-14" / "20260914T070000Z.json"
        self.other.write_text("{}")
        self.found = [self.f0900, self.f1400, self.other, self.newer]

    def test_no_record_adopts_all_and_loads_nothing(self):
        decision = load_core.queue_specs(self.found, None, set(), self.specs)
        self.assertEqual(decision.waiting, ())
        self.assertEqual(decision.adopted, (self.f0900, self.f1400, self.other, self.newer))

    def test_new_spec_waits(self):
        loaded = {str(self.f0900), str(self.f1400), str(self.other)}
        decision = load_core.queue_specs(self.found, loaded, set(), self.specs)
        self.assertEqual(decision.waiting, (self.newer,))
        self.assertIsNone(decision.adopted)

    def test_two_flights_same_site_day_both_wait(self):
        loaded = {str(self.f0900), str(self.f1400)}
        decision = load_core.queue_specs(self.found, loaded, set(), self.specs)
        self.assertEqual(decision.waiting, (self.other, self.newer))

    def test_skip_list_excludes_withdrawn(self):
        loaded = {str(self.f0900), str(self.f1400)}
        full_key = load_core.spec_key(self.other, self.specs)
        tail = full_key[len("specs/"):]
        for skipped in ({full_key}, {tail}):  # the store writes keys; tails are tolerated
            with self.subTest(skipped=skipped):
                decision = load_core.queue_specs(self.found, loaded, skipped, self.specs)
                self.assertEqual(decision.waiting, (self.newer,))

    def test_loaded_never_returns(self):
        loaded = {str(self.f0900), str(self.f1400), str(self.newer)}
        decision = load_core.queue_specs(self.found, loaded, set(), self.specs)
        self.assertEqual(decision.waiting, (self.other,))

    def test_empty_found_adopts_nothing(self):
        self.assertEqual(load_core.queue_specs([], None, set(), self.specs),
                         load_core.Queue((), None))


class BuildTest(unittest.TestCase):
    """Cluster 14: build() creates the directory it is handed."""

    def test_creates_output_dir(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            specs = tmp / "specs"
            spec = spec_tree(specs, "rehearsal/2026-09-13/20260913T000000Z.json")[0]
            missing = tmp / "never-created" / "deeper"
            self.assertFalse(missing.exists())
            try:
                load.build(spec, missing)
            except SystemExit:
                pass  # the writer may still refuse this fixture; the directory is the point
            self.assertTrue(missing.is_dir(), "build() must create the directory it writes into")


class GroupTest(unittest.TestCase):
    """Cluster 15: grouping yields (card, part) pairs, not triples."""

    def test_pairs_not_triples(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            a, b = tmp / "a.json", tmp / "b.json"
            planned = [
                load_core.Planned(spec=a, card="way finder 1", guid="G1",
                                  part=make_part(tmp, "A", waypoints=3)),
                load_core.Planned(spec=a, card="way finder 2", guid="G2",
                                  part=make_part(tmp, "A2", waypoints=2)),
                load_core.Planned(spec=b, card="way finder 3", guid="G3",
                                  part=make_part(tmp, "B", waypoints=7)),
            ]
            grouped = load_core.group_by_spec(planned)
            self.assertEqual([(spec.name, [card for card, _ in group]) for spec, group in grouped],
                             [("a.json", ["way finder 1", "way finder 2"]),
                              ("b.json", ["way finder 3"])])
            for _, group in grouped:
                for card, part in group:  # two values, not three
                    self.assertIsInstance(card, str)
                    self.assertIn("waypoints", part.manifest_fields())


@unittest.skipUnless(FIXTURE.is_file(),
                     f"Card Ledger fixture absent ({FIXTURE}); the web suite asserts it in a checkout")
class CardLedgerContractTest(unittest.TestCase):
    """Cluster 16: the Card Ledger contract from fixtures/card-ledger.json, case
    for case with web/lib/cardLedgerContract.test.ts. One rule-dispatch runner
    per language; every case fails by name."""

    def test_card_ledger_fixture(self):
        fixture = json.loads(FIXTURE.read_text())

        def fail(name: str, what: str):
            self.fail(f'card ledger case "{name}": {what}')

        def required(name: str, c: dict, key: str):
            if key not in c:
                fail(name, f'missing required field "{key}"')
            return c[key]

        def check_keys(name: str, obj: dict, allowed: list[str]) -> None:
            """A case (or an op object inside one) names only keys its handler
            declares; `_`-prefixed notes are free, so a misspelled `expect_*`
            cannot pass silently."""
            for key in obj:
                if key.startswith("_") or key in allowed:
                    continue
                fail(name, f'unrecognised key "{key}"')

        def read_ledger(name: str, raw) -> dict:
            if not isinstance(raw, dict):
                fail(name, "ledger must be an object")
            check_keys(name, raw, ["pool", "holdings", "verified_at"])
            if not isinstance(required(name, raw, "pool"), list):
                fail(name, "ledger.pool must be an array")
            if not isinstance(required(name, raw, "holdings"), dict):
                fail(name, "ledger.holdings must be an object")
            return raw

        def ledger_of(name: str, c: dict) -> dict:
            """The shared base Ledger, unless the case carries its own."""
            return read_ledger(name, c["ledger"]) if "ledger" in c else fixture["ledger"]

        OP_KEYS = {
            "reserve": ["op", "cards", "spec_key", "at"],
            "release": ["op", "spec_key"],
            "pool": ["op", "pool"],
            "verify": ["op", "at"],
        }

        def read_op(name: str, side: str, raw) -> dict:
            if not isinstance(raw, dict):
                fail(name, f"{side} must be an op object")
            kind = required(name, raw, "op")
            if kind not in OP_KEYS:
                fail(name, f'{side}.op must be "reserve", "release", "pool" or "verify"')
            check_keys(name, raw, OP_KEYS[kind] + (["apply_to"] if side == "after" else []))
            if kind == "reserve":
                if not isinstance(raw.get("cards"), list):
                    fail(name, f"{side}.cards must be an array on a reserve op")
                required(name, raw, "spec_key")
                required(name, raw, "at")
            elif kind == "release":
                required(name, raw, "spec_key")
            elif kind == "pool":
                if not isinstance(raw.get("pool"), list):
                    fail(name, f"{side}.pool must be an array on a pool op")
            else:
                required(name, raw, "at")
            if side == "after":
                to = required(name, raw, "apply_to")
                # Anything but an exact match fails: a typo must not take the base branch.
                if to not in ("base", "ours"):
                    fail(name, 'after.apply_to must be "base" or "ours"')
            return raw

        def apply_op(op: dict, on: dict) -> dict:
            # ponytail: four ops, one apply_to; reserve/release are the planner's,
            # pool/verify mirror the host's writers; anything beyond these belongs
            # in a per-side adapter harness, not here.
            if op["op"] == "reserve":
                return b2_status.with_reservation(on, op["cards"], op["spec_key"], op["at"])
            if op["op"] == "release":
                return b2_status.with_release(on, op["spec_key"])
            if op["op"] == "pool":
                return {**on, "pool": op["pool"]}
            return b2_status.merge_verified(on, op["at"])

        def case_available(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "ledger", "expect", "card", "expect_reason"])
            ledger = ledger_of(name, c)
            has_expect, has_card = "expect" in c, "card" in c
            if not has_expect and not has_card:
                fail(name, 'missing required field "expect" (or "card" with "expect_reason")')
            if has_expect:
                self.assertEqual(b2_status.available_cards(ledger), c["expect"],
                                 f'card ledger case "{name}": available')
            if has_card:
                card = required(name, c, "card")
                self.assertEqual(b2_status.card_unavailable(ledger, card),
                                 required(name, c, "expect_reason"),
                                 f'card ledger case "{name}": {card}')

        def case_reserve(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "ledger", "needed", "expect_ok", "expect_cards",
                                 "expect_available", "expect_reason_mentions"])
            r = b2_status.reserve_cards(ledger_of(name, c), required(name, c, "needed"))
            self.assertEqual(r["ok"], required(name, c, "expect_ok"),
                             f'card ledger case "{name}": reserve_cards(...).ok')
            if r["ok"]:
                self.assertEqual(r["cards"], required(name, c, "expect_cards"),
                                 f'card ledger case "{name}": cards')
            else:
                self.assertEqual(r["available"], required(name, c, "expect_available"),
                                 f'card ledger case "{name}": available count')
                for fragment in required(name, c, "expect_reason_mentions"):
                    self.assertIn(fragment, r["reason"],
                                  f'card ledger case "{name}": refusal should mention {fragment}')

        def case_release(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "ledger", "spec_key", "expect_available_after",
                                 "expect_holding_kept"])
            after = b2_status.with_release(ledger_of(name, c), required(name, c, "spec_key"))
            has_available, has_kept = "expect_available_after" in c, "expect_holding_kept" in c
            if not has_available and not has_kept:
                fail(name, 'missing required field "expect_available_after" '
                           '(or "expect_holding_kept")')
            if has_available:
                self.assertEqual(b2_status.available_cards(after), c["expect_available_after"],
                                 f'card ledger case "{name}": available after release')
            if has_kept:
                card = required(name, c, "expect_holding_kept")
                self.assertIn(card, after["holdings"],
                              f'card ledger case "{name}": Flown holding {card} must survive release')

        def case_flown_mark(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "spec_key", "card", "at",
                                 "expect_available_when_marked", "expect_reason_mentions",
                                 "expect_flown_at_absent_when_unmarked"])
            spec_key = required(name, c, "spec_key")
            card = required(name, c, "card")
            at = required(name, c, "at")
            # The runner builds the mark with the function under test itself.
            marked = b2_status.with_flown_mark(fixture["ledger"], spec_key, at)
            held = marked["holdings"].get(card)
            self.assertTrue(held, f'card ledger case "{name}": marking Flown must leave '
                                  f"{card} holding the Mission")
            self.assertEqual(held.get("flown_at"), at,
                             f'card ledger case "{name}": the holding carries the mark')
            self.assertEqual(b2_status.available_cards(marked),
                             required(name, c, "expect_available_when_marked"),
                             f'card ledger case "{name}": available when marked')
            unmarked = b2_status.with_flown_mark(marked, spec_key, None)
            back = unmarked["holdings"].get(card)
            self.assertTrue(back, f'card ledger case "{name}": unmarking must keep the holding')
            if required(name, c, "expect_flown_at_absent_when_unmarked"):
                self.assertNotIn("flown_at", back,
                                 f'card ledger case "{name}": the mark is removed, not falsified')
            reason = b2_status.card_unavailable(unmarked, card)
            self.assertIsNotNone(reason,
                                 f'card ledger case "{name}": unmarking takes {card} back')
            for fragment in required(name, c, "expect_reason_mentions"):
                self.assertIn(fragment, reason,
                              f'card ledger case "{name}": refusal should mention {fragment}')

        def case_drift(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "ledger", "on_device", "expect_drift"])
            self.assertEqual(b2_status.ledger_drift(ledger_of(name, c),
                                                    required(name, c, "on_device")),
                             required(name, c, "expect_drift"),
                             f'card ledger case "{name}": drift')

        def case_stale(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "ledger", "cards", "spec_key", "at", "live_spec_keys",
                                 "expect_stale"])
            if "cards" in c:
                current = b2_status.with_reservation(ledger_of(name, c), required(name, c, "cards"),
                                                     required(name, c, "spec_key"),
                                                     required(name, c, "at"))
            else:
                current = ledger_of(name, c)
            live = set(c.get("live_spec_keys", []))
            self.assertEqual([h["card"] for h in b2_status.stale_cards(current, live)],
                             required(name, c, "expect_stale"),
                             f'card ledger case "{name}": stale Cards')

        def case_reservation(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "ledger", "cards", "spec_key", "at",
                                 "expect_cards_for", "expect_available_after"])
            spec_key = required(name, c, "spec_key")
            if "cards" in c:
                current = b2_status.with_reservation(ledger_of(name, c), required(name, c, "cards"),
                                                     spec_key, required(name, c, "at"))
            else:
                current = ledger_of(name, c)
            self.assertEqual([f'{h["flight"]} of {h["flights"]} in {h["card"]}'
                              for h in b2_status.cards_for(current, spec_key)],
                             required(name, c, "expect_cards_for"),
                             f'card ledger case "{name}": cards for {spec_key}')
            if "expect_available_after" in c:
                self.assertEqual(b2_status.available_cards(current), c["expect_available_after"],
                                 f'card ledger case "{name}": available after reservation')

        def case_change_survived(name: str, c: dict) -> None:
            check_keys(name, c, ["rule", "base", "ours", "after", "expect_survived"])
            base = read_ledger(name, required(name, c, "base"))
            ours = read_op(name, "ours", required(name, c, "ours"))
            after = read_op(name, "after", required(name, c, "after"))
            nxt = apply_op(ours, base)
            then = apply_op(after, nxt if after["apply_to"] == "ours" else base)
            self.assertEqual(b2_status.change_survived(base, nxt, then),
                             required(name, c, "expect_survived"),
                             f'card ledger case "{name}": change survived')

        handlers = {"available": case_available, "reserve": case_reserve, "release": case_release,
                    "flown_mark": case_flown_mark, "drift": case_drift, "stale": case_stale,
                    "reservation": case_reservation, "change_survived": case_change_survived}

        for name, case in fixture["cases"].items():
            with self.subTest(case=name):
                rule = required(name, case, "rule")
                handler = handlers.get(rule)
                if handler is None:
                    fail(name, f'no handler for rule "{rule}"')
                handler(name, case)


class MountTest(unittest.TestCase):
    """Cluster 18 and the adapter strings (M1 D2/M1 P2)."""

    def test_missing_and_eio_are_not_mounted(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            assert not (tmp / load.STORAGE).exists()

            class Stale(type(tmp)):
                def is_dir(self):
                    raise OSError(5, "Input/output error")

            self.assertFalse(load.mounted(tmp))  # no STORAGE directory
            self.assertFalse(load.mounted(Stale(tmp)))  # a stale mount raises EIO, reads as not mounted

    def test_listing_failure_is_a_drift_row_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            waypoint = root / kmz.WAYPOINT_DIR
            waypoint.parent.mkdir(parents=True)
            waypoint.write_text("not a directory")
            controller = load.MountedController(root, lock=root / "controller.lock")
            with self.assertRaises(load_core.ControllerUnreadable) as cm:
                controller.present_guids()
            self.assertEqual(str(cm.exception),
                             f"could not read the Controller's Missions at {waypoint}: "
                             f"{cm.exception.__cause__}")
            self.assertEqual(load_core.pool_drift({"way finder 1": "G9"},
                                                  load.MountedController(root, lock=root / "l")),
                             [str(cm.exception)])


class UpdateTest(unittest.TestCase):
    """Cluster 20: the Ledger is written from a fresh read, and the write is checked."""

    def test_change_applied_and_survives(self):
        store = FakeStore({"pool": ["way finder 1"], "holdings": {}})
        out = load_core.update(store, lambda fresh: {**fresh, "verified_at": "t"},
                               settle_s=0, sleep=lambda s: None)
        self.assertEqual(out["verified_at"], "t")
        self.assertEqual(len(store.published), 1)
        self.assertEqual(store.ledger["verified_at"], "t")

    def test_planner_write_seen_and_made_again(self):
        # #152: a planner write lands on top of ours; the read-back sees it and
        # ours is made again against it rather than silently lost.
        during = b2_status.with_reservation({"pool": ["way finder 1", "way finder 2"], "holdings": {}},
                                            ["way finder 1"], "a.json", "t0")
        dispatched = b2_status.with_reservation(during, ["way finder 2"], "b.json", "t1")
        store = FakeStore(during)
        state = {"once": True}

        def overwrite_once(ledger):
            if state["once"]:
                state["once"] = False
                store.ledger = copy.deepcopy(dispatched)

        store.publish_hook = overwrite_once
        load_core.record_written(store, {**during, "verified_at": "t3"}, {"way finder 1": "md5b"},
                                 "t3", lambda s: None, settle_s=0, sleep=lambda s: None)
        final = store.ledger
        self.assertEqual(final["holdings"]["way finder 1"]["written_md5"], "md5b")
        self.assertEqual(final["holdings"]["way finder 2"]["spec_key"], "b.json",
                         "their Reservation kept too")
        self.assertEqual(final["verified_at"], "t3")
        self.assertEqual(len(store.published), 2, "the change was written again after the overwrite")

    def test_retries_then_gives_up(self):
        store = FakeStore({"pool": ["way finder 1"], "holdings": {}})
        original = copy.deepcopy(store.ledger)
        store.publish_hook = lambda ledger: setattr(store, "ledger", copy.deepcopy(original))
        sleeps = []
        with self.assertRaises(load_core.LedgerUnreadable) as cm:
            load_core.update(store, lambda fresh: {**fresh, "verified_at": "t"},
                             settle_s=1, sleep=sleeps.append)
        self.assertEqual(str(cm.exception),
                         "the Card Ledger kept changing while the host was writing it, "
                         "so its change could not be confirmed")
        self.assertEqual(len(store.published), 3)
        self.assertEqual(sleeps, [1, 1, 1])


class PublishPoolTest(unittest.TestCase):
    """Cluster 23: the pool is seeded onto an empty Ledger, once, and a change republishes."""

    def test_pool_published_once(self):
        store = FakeStore({"pool": [], "holdings": {}})
        notes = []
        ledger = load_core.publish_pool(store, ["way finder 1", "way finder 2"], notes.append,
                                        settle_s=0, sleep=lambda s: None)
        self.assertEqual(ledger["pool"], ["way finder 1", "way finder 2"])
        self.assertEqual(notes, ["published the Card pool to the Ledger: 2 Cards (was 0)"])
        load_core.publish_pool(store, ["way finder 1", "way finder 2"], notes.append,
                               settle_s=0, sleep=lambda s: None)
        self.assertEqual(len(store.published), 1, "an unchanged pool must not cost a write")
        self.assertEqual(len(notes), 1, "and must not be announced again")

    def test_pool_change_republished_with_was(self):
        store = FakeStore({"pool": ["way finder 9"], "holdings": {}})
        notes = []
        load_core.publish_pool(store, ["way finder 1"], notes.append, settle_s=0, sleep=lambda s: None)
        self.assertEqual(store.ledger["pool"], ["way finder 1"])
        self.assertEqual(notes, ["published the Card pool to the Ledger: 1 Cards (was 1)"])


class LedgerUnreadableTest(unittest.TestCase):
    """Cluster 20: an unreadable Ledger is never written over."""

    def test_unreadable_ledger_never_overwritten(self):
        store = FakeStore()
        store.unreadable = True
        with self.assertRaises(load_core.LedgerUnreadable):
            load_core.publish_pool(store, ["way finder 1"], lambda s: None,
                                   settle_s=0, sleep=lambda s: None)
        self.assertEqual(store.published, [], "nothing may be written over a Ledger that was not read")

    def test_bookkeeping_failures_are_notices_not_losses(self):
        store = FakeStore()
        store.unreadable = True
        notes = []
        load_core.stamp_verified(store, {"verified_at": "t"}, notes.append,
                                 settle_s=0, sleep=lambda s: None)
        self.assertIn("verified_at was not recorded", notes[0])
        notes2 = []
        load_core.record_written(store, {"verified_at": "t"}, {"way finder 1": "m"}, "t",
                                 notes2.append, settle_s=0, sleep=lambda s: None)
        self.assertIn("the Cards were Loaded but the Ledger does not yet say so", notes2[0])


class SplitTest(unittest.TestCase):
    """Cluster 21: reserved vs unreserved, each in queue order."""

    def test_reserved_and_unreserved(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            specs = Path(tmpdir) / "specs"
            a, b = spec_tree(specs, "site/d/a.json", "site/d/b.json")
            ledger = reservation(specs, b, ["way finder 1"], pool=["way finder 1"])
            self.assertEqual(load_core.split_reserved([a, b], ledger, specs), ((b,), (a,)))


class SurveyTest(unittest.TestCase):
    """Cluster 22: oldest first, and disagreement named rather than averaged over."""

    @staticmethod
    def _placeholders(root: Path, order: list[str]):
        for i, guid in enumerate(order):
            write_kmz(root / kmz.WAYPOINT_DIR / guid / f"{guid}.kmz",
                      create_ms=1_700_000_000_000 + i * 60_000)

    def test_order_and_disagreement(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            guids = ["G1", "G2", "G3"]
            self._placeholders(root, guids)
            rows = load.survey(root)
            self.assertEqual([g for _, g in rows], guids, "the survey must report oldest first")
            slots = {f"way finder {i+1}": g for i, g in enumerate(guids)}
            self.assertEqual(load_core.survey_disagrees(rows, slots), [])

            # Two Placeholders created in the other order: the survey must say so
            # rather than let creation order name the remaining Cards.
            shutil.rmtree(root / kmz.WAYPOINT_DIR)
            self._placeholders(root, [guids[1], guids[0], guids[2]])
            problems = load_core.survey_disagrees(load.survey(root), slots)
            self.assertTrue(any("way finder 1" in p for p in problems), problems)

    def test_calibrated_card_missing_from_controller_reported(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self._placeholders(root, ["G1"])
            problems = load_core.survey_disagrees(load.survey(root), {"way finder 1": "G1",
                                                                      "way finder 2": "G2"})
            self.assertEqual(problems, ["way finder 2 is calibrated but is not on the Controller"])


class ImportTest(unittest.TestCase):
    """Acceptance 1 mechanically: the core cannot touch files, network or the clock."""

    BANNED_IMPORTS = {"os", "shutil", "subprocess", "tempfile", "fcntl", "json",
                      "time", "sys", "socket", "urllib"}
    BANNED_NAMES = {"download_ledger", "upload_ledger", "download_manifest", "upload_manifest"}

    def _core_tree(self):
        return ast.parse(Path(load_core.__file__).read_text())

    def test_core_imports_no_io_modules(self):
        imported = set()
        for node in ast.walk(self._core_tree()):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        self.assertEqual(imported & self.BANNED_IMPORTS, set())

    def test_core_names_no_network_calls(self):
        tree = self._core_tree()
        attrs = {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
        names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        self.assertEqual((attrs | names) & self.BANNED_NAMES, set())

    def test_fixture_contract_still_present(self):
        self.assertIn("CardLedgerContractTest", globals(), "the fixture parity check was lost")


class SlotsTest(unittest.TestCase):
    """N5: read_slots() keeps cards()' card-number ordering."""

    def test_read_slots_orders_by_card_number(self):
        raw = json.loads((HERE / "wayfinder_slots.json").read_text())["slots"]
        numeric = sorted(raw, key=lambda name: int(name.split()[-1]))
        self.assertNotEqual(sorted(raw), numeric,
                            "this fixture must actually distinguish numeric from lexical order")
        self.assertEqual(list(load.read_slots()), numeric)


class CliTest(unittest.TestCase):
    """The CLI edges, run as subprocesses with HOME pointed at a temp dir: no
    network (absent credentials fail before any call), no real Controller."""

    def run_cli(self, home: Path, *args: str, cwd: Path | None = None):
        env = {**os.environ, "HOME": str(home)}
        return subprocess.run([sys.executable, str(LOAD_PY), *args],
                              capture_output=True, text=True, env=env, cwd=cwd, timeout=60)

    def test_argparse_usage_error_exit_2(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            done = self.run_cli(Path(tmpdir), "--bogus")
        self.assertEqual(done.returncode, 2)
        self.assertIn("unrecognized arguments: --bogus", done.stderr)
        self.assertEqual(done.stdout, "")

    def test_missing_yes_message_exit_1(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir)
            spec_tree(home / "wayfinder" / "specs", "site/2026-01-01/spec.json")
            (home / "wayfinder" / "loads").mkdir(parents=True)
            (home / "wayfinder" / "loads" / "loaded.json").write_text("[]")
            done = self.run_cli(home, "--newest")
        self.assertEqual(done.returncode, 1)
        self.assertIn("this replaces the Missions in the way finder cards on the Controller; pass --yes",
                      done.stderr)

    def test_adoption_f2(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir)
            spec = spec_tree(home / "wayfinder" / "specs", "site/2026-01-01/spec.json")[0]
            done = self.run_cli(home, "--newest")
            record = home / "wayfinder" / "loads" / "loaded.json"
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn("no record of past Loads; adopted 1 Specs as already Loaded, Loaded nothing",
                          done.stdout)
            self.assertTrue(record.exists())
            self.assertEqual(json.loads(record.read_text()), [str(spec)])

    def test_empty_specs_dir_writes_nothing(self):
        for tree in ("absent", "empty"):
            with self.subTest(tree=tree):
                with tempfile.TemporaryDirectory() as tmpdir:
                    home = Path(tmpdir)
                    if tree == "empty":
                        (home / "wayfinder" / "specs").mkdir(parents=True)
                    done = self.run_cli(home, "--newest", "--yes")
                    self.assertEqual(done.returncode, 0, done.stderr)
                    self.assertNotIn("adopted", done.stdout)
                    self.assertFalse((home / "wayfinder" / "loads").exists())

    def test_flat_deploy_reports_when_tests_are_absent(self):
        line = "the load tests are not deployed beside this script; the CI mission workflow runs them"
        with tempfile.TemporaryDirectory() as tmpdir:
            deploy = Path(tmpdir) / "mission"
            shutil.copytree(HERE, deploy, ignore=shutil.ignore_patterns("load_test.py", "__pycache__"))
            self.assertFalse((deploy / "load_test.py").exists())
            env = {**os.environ, "HOME": tmpdir}
            done = subprocess.run([sys.executable, str(deploy / "load.py"), "--selftest"],
                                  capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(done.returncode, 0)
        self.assertEqual(done.stdout.strip(), line)

    def test_broken_test_module_also_reports_not_deployed(self):
        # Pins M2 review F2: the shim catches any ImportError, so a load_test that
        # cannot import reports the flat-deploy line. If that catch is ever
        # narrowed, this test must change deliberately.
        line = "the load tests are not deployed beside this script; the CI mission workflow runs them"
        with tempfile.TemporaryDirectory() as tmpdir:
            deploy = Path(tmpdir) / "mission"
            shutil.copytree(HERE, deploy, ignore=shutil.ignore_patterns("load_test.py", "__pycache__"))
            (deploy / "load_test.py").write_text("raise ImportError('a broken test module')\n")
            env = {**os.environ, "HOME": tmpdir}
            done = subprocess.run([sys.executable, str(deploy / "load.py"), "--selftest"],
                                  capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(done.returncode, 0)
        self.assertEqual(done.stdout.strip(), line)

    def test_survey_against_mounted_storage_never_remounts(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            home = Path(tmpdir)
            guid = json.loads((HERE / "wayfinder_slots.json").read_text())["slots"]["way finder 1"]
            root = home / "rc2" / load.STORAGE  # pre-created: mounted() is true
            write_kmz(root / kmz.WAYPOINT_DIR / guid / f"{guid}.kmz", create_ms=1_700_000_000_000)
            done = self.run_cli(home, "--survey")
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("Placeholder Missions on the Controller, oldest first:", done.stdout)
        self.assertIn(guid, done.stdout)
        self.assertIn("way finder 1", done.stdout)
        self.assertNotIn("cannot be read", done.stdout + done.stderr, "remount must never be reached")


if __name__ == "__main__":
    unittest.main()
