#!/usr/bin/env python3
"""The board service's tests, with the loader's seams faked.

    python3 scripts/board/board_service_test.py

No test touches the network, a Controller, B2 or the real loader: the ledger,
the USB check and the loader run are all injected. Standard library only.
"""

from __future__ import annotations

import json
import os
import socket
import struct
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import board_service as bs  # noqa: E402

SPEC = "site-a/2026-09-30/20260930T010203Z-aaaa1111.json"
OTHER = "site-a/2026-09-30/20260930T010204Z-bbbb2222.json"
DONE = "site-b/2026-09-29/20260929T000000Z.json"
DRAFTLESS = "site-c/2026-09-30/20260930T020202Z.json"  # Collected, but no Reservation
SHEET = "Open way finder 4: Site A 2026-09-30 (125 waypoints)\nClose and reopen each card's waypoint editor.\n"


def ledger(*held: tuple[str, str]) -> dict:
    return {"pool": ["way finder 4", "way finder 5"],
            "holdings": {card: {"card": card, "spec_key": "specs/" + spec, "flight": 1} for card, spec in held}}


class Fixture:
    """A specs tree, a Loaded record, a ledger and a fake loader, all in a temp dir."""

    def __init__(self, tc: unittest.TestCase):
        tmp = tempfile.TemporaryDirectory()
        tc.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.specs = self.root / "specs"
        for rel in (SPEC, OTHER, DONE, DRAFTLESS):
            (self.specs / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.specs / rel).write_text("{}")
        self.loaded = self.root / "loaded.json"
        self.loaded.write_text(json.dumps([str(self.specs / DONE)]))
        self.ledger = ledger(("way finder 4", SPEC), ("way finder 5", OTHER))
        self.plugged = True
        self.calls: list[Path] = []
        self.result = (0, SHEET, "")
        self.gate: threading.Event | None = None  # when set, the fake loader waits on it
        self.entered = threading.Event()
        self.board = bs.Board(specs=self.specs, loaded=self.loaded, skipped=lambda: {},
                              fetch_ledger=lambda: self.ledger, plugged=lambda: self.plugged,
                              runner=self.run, cron_lock=self.root / "cron.lock")

    def run(self, spec: Path):
        self.calls.append(spec)
        self.entered.set()
        if self.gate:
            self.gate.wait(5)
        return self.result

    def finish(self):
        self.board.join()


class MissionsTest(unittest.TestCase):
    def test_lists_collected_reserved_missions_only(self):
        f = Fixture(self)
        got = f.board.missions()["missions"]
        self.assertEqual([m["id"] for m in got], [SPEC, OTHER])  # not DONE (Loaded), not DRAFTLESS (no Card)
        self.assertEqual(got[0]["site"], "site-a")
        self.assertEqual(got[0]["cards"], ["way finder 4"])

    def test_withdrawn_is_not_offered(self):
        f = Fixture(self)
        f.board.skipped = lambda: {"specs/" + SPEC: {"withdrawn_at": "x"}}
        self.assertEqual([m["id"] for m in f.board.missions()["missions"]], [OTHER])

    def test_unreadable_ledger_still_lists_and_says_why(self):
        f = Fixture(self)

        def broken():
            raise bs.load_core.LedgerUnreadable("the Card Ledger could not be read (offline)")
        f.board.fetch_ledger = broken
        got = f.board.missions()
        self.assertIn("offline", got["ledger_error"])
        self.assertEqual(len(got["missions"]), 3)
        self.assertIsNone(got["missions"][0]["cards"])

    def test_no_loaded_record_offers_nothing(self):
        f = Fixture(self)
        f.loaded.unlink()
        got = f.board.missions()
        self.assertEqual(got["missions"], [])
        self.assertIn("No record", got["note"])


class StartTest(unittest.TestCase):
    def test_loaded_reports_the_cards_and_their_points(self):
        f = Fixture(self)
        rec = f.board.start(SPEC)
        self.assertEqual(rec["state"], "running")
        f.finish()
        got = f.board.get(rec["id"])
        self.assertEqual(got["state"], "loaded")
        self.assertEqual(got["cards"], [{"card": "way finder 4", "mission": "Site A 2026-09-30", "waypoints": 125}])
        self.assertEqual(f.calls, [f.specs / SPEC])  # the loader ran on that Spec, once

    def test_the_loaders_refusal_is_passed_on_in_its_words(self):
        f = Fixture(self)
        f.result = (1, "", "the Card pool has changed since it was calibrated; nothing was touched:\n  way finder 4 gone\n")
        rec = f.board.start(SPEC)
        f.finish()
        got = f.board.get(rec["id"])
        self.assertEqual(got["state"], "refused")
        self.assertIn("nothing was touched", got["reason"])
        self.assertEqual(got["cards"], [])

    def test_a_crashing_loader_is_failed_not_refused(self):
        f = Fixture(self)
        f.result = (1, "", "Traceback (most recent call last):\n  ...\nFileNotFoundError: jmtpfs")
        f.board.start(SPEC)
        f.finish()
        got = f.board.loads[0]
        self.assertEqual((got["state"], got["reason"]), ("failed", "FileNotFoundError: jmtpfs"))

    def test_a_runner_that_raises_is_failed_and_frees_the_board(self):
        f = Fixture(self)

        def boom(_):
            raise OSError("no python")
        f.board.runner = boom
        f.board.start(SPEC)
        f.finish()
        self.assertEqual(f.board.loads[0]["state"], "failed")
        self.assertIsNone(f.board.health()["busy"])

    def test_controller_unplugged_is_refused_naming_why_and_the_loader_never_runs(self):
        f = Fixture(self)
        f.plugged = False
        with self.assertRaises(bs.Refused) as cm:
            f.board.start(SPEC)
        self.assertEqual((cm.exception.status, cm.exception.body["error"]), (409, "controller_absent"))
        self.assertIn("not plugged in", cm.exception.body["reason"])
        self.assertEqual(f.calls, [])
        self.assertIsNone(f.board.health()["busy"])  # a refusal does not leave the board busy

    def test_only_a_listed_mission_can_start(self):
        f = Fixture(self)
        for bad in (DONE, DRAFTLESS, "../../etc/passwd", "site-a/2026-09-30/nope.json", None, 7):
            with self.assertRaises(bs.Refused) as cm:
                f.board.start(bad)
            self.assertEqual(cm.exception.status, 404)
        self.assertEqual(f.calls, [])

    def test_a_second_load_is_refused_while_the_first_runs(self):
        f = Fixture(self)
        f.gate = threading.Event()
        first = f.board.start(SPEC)
        self.assertTrue(f.entered.wait(5))
        with self.assertRaises(bs.Refused) as cm:
            f.board.start(OTHER)
        self.assertEqual((cm.exception.status, cm.exception.body["error"], cm.exception.body["load"]),
                         (409, "busy", first["id"]))
        self.assertEqual(f.board.health()["busy"], first["id"])
        f.gate.set()
        f.finish()
        self.assertEqual(len(f.calls), 1)
        f.board.start(OTHER)  # free again once the first has finished
        f.finish()
        self.assertEqual(len(f.calls), 2)

    def test_two_requests_at_once_start_exactly_one_load(self):
        f = Fixture(self)
        f.gate = threading.Event()
        results = []

        def go(mission):
            try:
                f.board.start(mission)
                results.append("started")
            except bs.Refused as r:
                results.append(r.body["error"])
        threads = [threading.Thread(target=go, args=(m,)) for m in (SPEC, OTHER, SPEC, OTHER)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        f.gate.set()
        f.finish()
        self.assertEqual(sorted(results), ["busy", "busy", "busy", "started"])
        self.assertEqual(len(f.calls), 1)

    def test_the_autoload_cron_lock_blocks_a_service_load_and_is_held_for_its_length(self):
        f = Fixture(self)
        held = bs.take_lock(f.board.cron_lock)  # what cron's flock -n holds while it Loads
        with self.assertRaises(bs.Refused) as cm:
            f.board.start(SPEC)
        self.assertIn("autoload", cm.exception.body["reason"])
        self.assertEqual(f.calls, [])
        os.close(held)
        f.gate = threading.Event()
        f.board.start(SPEC)
        self.assertTrue(f.entered.wait(5))
        self.assertIsNone(bs.take_lock(f.board.cron_lock))  # cron's `flock -n` would skip this minute
        f.gate.set()
        f.finish()
        again = bs.take_lock(f.board.cron_lock)  # released afterwards
        self.assertIsNotNone(again)
        os.close(again)


class ParseTest(unittest.TestCase):
    def test_several_cards(self):
        out = "x\nOpen way finder 4: A (10 waypoints)\nOpen way finder 5: B (20 waypoints)\n"
        got = bs.parse_result(0, out, "")
        self.assertEqual([(c["card"], c["waypoints"]) for c in got["cards"]], [("way finder 4", 10), ("way finder 5", 20)])

    def test_success_without_cards_is_not_success(self):
        self.assertEqual(bs.parse_result(0, "nothing\n", "")["state"], "failed")


class LocalOnlyTest(unittest.TestCase):
    def test_addresses(self):
        for ok in ("127.0.0.1", "192.168.43.7", "10.0.0.5", "172.20.1.1", "169.254.1.1"):
            self.assertTrue(bs.is_local(ok), ok)
        for no in ("8.8.8.8", "100.98.146.6", "not-an-ip", "2606:4700::1111"):
            self.assertFalse(bs.is_local(no), no)


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.f = Fixture(self)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), bs.make_handler(self.f.board, "*"))
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def call(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, dict(r.headers), json.loads(r.read() or "null")
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), json.loads(e.read() or "null")

    def test_the_whole_interface(self):
        status, headers, body = self.call("GET", "/health")
        self.assertEqual((status, body["controller"], body["busy"]), (200, True, None))
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")
        status, _, body = self.call("GET", "/missions")
        self.assertEqual([m["id"] for m in body["missions"]], [SPEC, OTHER])
        status, _, rec = self.call("POST", "/loads", {"mission": SPEC})
        self.assertEqual((status, rec["state"]), (202, "running"))
        self.f.finish()
        status, _, got = self.call("GET", "/loads/" + rec["id"])
        self.assertEqual((status, got["state"], got["cards"][0]["waypoints"]), (200, "loaded", 125))
        self.assertEqual(self.call("GET", "/loads")[2]["loads"][0]["id"], rec["id"])

    def test_refusals_carry_a_status_and_a_reason(self):
        self.f.plugged = False
        status, _, body = self.call("POST", "/loads", {"mission": SPEC})
        self.assertEqual((status, body["error"]), (409, "controller_absent"))
        self.assertEqual(self.call("POST", "/loads", {"nope": 1})[0], 400)
        self.assertEqual(self.call("POST", "/loads")[0], 400)
        self.assertEqual(self.call("GET", "/loads/deadbeef")[0], 404)
        self.assertEqual(self.call("GET", "/elsewhere")[0], 404)

    def test_preflight(self):
        status, headers, _ = self.call("OPTIONS", "/loads")
        self.assertEqual(status, 204)
        self.assertIn("POST", headers["Access-Control-Allow-Methods"])


class MdnsTest(unittest.TestCase):
    @staticmethod
    def query(host="board.local", qtype=1, qclass=1, qid=0x1234):
        return struct.pack("!HHHHHH", qid, 0, 1, 0, 0, 0) + bs._name(host) + struct.pack("!HH", qtype, qclass)

    def test_multicast_answer_carries_the_address(self):
        r = bs.mdns_answer(self.query(), "board.local", "192.168.43.7", True)
        self.assertEqual(struct.unpack("!HH", r[:4]), (0, 0x8400))
        self.assertTrue(r.endswith(socket.inet_aton("192.168.43.7")))
        self.assertIn(b"\x05board\x05local\x00", r)

    def test_legacy_unicast_answer_repeats_id_and_question(self):
        q = self.query(qid=0xBEEF)
        r = bs.mdns_answer(q, "board.local", "10.0.0.2", False)
        self.assertEqual(struct.unpack("!HHH", r[:6]), (0xBEEF, 0x8400, 1))
        self.assertEqual(r[12:12 + len(q) - 12], q[12:])

    def test_case_insensitive_and_any_query(self):
        self.assertIsNotNone(bs.mdns_answer(self.query("BOARD.local", qtype=255, qclass=0x8001), "board.local", "10.0.0.2", True))

    def test_ignores_other_names_aaaa_answers_and_junk(self):
        for pkt in (self.query("other.local"), self.query(qtype=28), b"", b"\x00" * 5,
                    struct.pack("!HHHHHH", 0, 0x8400, 1, 0, 0, 0) + bs._name("board.local") + struct.pack("!HH", 1, 1)):
            self.assertIsNone(bs.mdns_answer(pkt, "board.local", "10.0.0.2", True))


def run() -> int:
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run())
