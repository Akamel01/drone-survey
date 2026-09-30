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
import ssl
import struct
import subprocess
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
import make_certs  # noqa: E402

SPEC = "site-a/2026-09-30/20260930T010203Z-aaaa1111.json"
OTHER = "site-a/2026-09-30/20260930T010204Z-bbbb2222.json"
DONE = "site-b/2026-09-29/20260929T000000Z.json"
DRAFTLESS = "site-c/2026-09-30/20260930T020202Z.json"  # Collected, but no Reservation
ALLOWED = "https://planner.example"
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
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), bs.make_handler(self.f.board, (ALLOWED,)))
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def call(self, method, path, body=None, origin=None):
        req = urllib.request.Request(self.base + path, method=method, headers={"Origin": origin} if origin else {},
                                     data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, dict(r.headers), json.loads(r.read() or "null")
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), json.loads(e.read() or "null")

    def test_the_whole_interface(self):
        status, headers, body = self.call("GET", "/health")
        self.assertEqual((status, body["controller"], body["busy"]), (200, True, None))
        self.assertNotIn("Access-Control-Allow-Origin", headers)  # no Origin sent: nothing to echo
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

    def test_preflight_from_an_allowed_origin(self):
        status, headers, _ = self.call("OPTIONS", "/loads", origin=ALLOWED)
        self.assertEqual(status, 204)
        self.assertIn("POST", headers["Access-Control-Allow-Methods"])
        self.assertEqual(headers["Access-Control-Allow-Origin"], ALLOWED)  # echoed, never *
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")

    def test_allowed_origin_may_start_a_load(self):
        status, headers, rec = self.call("POST", "/loads", {"mission": SPEC}, origin=ALLOWED)
        self.assertEqual((status, rec["state"]), (202, "running"))
        self.assertEqual(headers["Access-Control-Allow-Origin"], ALLOWED)
        self.f.finish()

    def test_foreign_origin_is_refused_by_the_server_and_starts_nothing(self):
        for origin in ("https://evil.example", "null", ALLOWED + ".evil.example", "http://localhost:3000"):
            status, headers, body = self.call("POST", "/loads", {"mission": SPEC}, origin=origin)
            self.assertEqual((status, body["error"]), (403, "bad_origin"), origin)
            self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(self.call("OPTIONS", "/loads", origin="https://evil.example")[0], 403)
        self.assertEqual(self.f.calls, [])

    def test_no_origin_is_allowed_from_the_local_network(self):
        status, _, rec = self.call("POST", "/loads", {"mission": SPEC})  # curl, the host itself
        self.assertEqual(status, 202)
        self.f.finish()


class OriginsTest(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(bs.parse_origins("https://a.example/, http://localhost:3000"),
                         ("https://a.example", "http://localhost:3000"))
        for bad in ("*", "https://a.example,*", " , "):
            with self.assertRaises(ValueError):
                bs.parse_origins(bad)

    def test_default_is_the_planner_and_localhost_never_a_wildcard(self):
        self.assertEqual(bs.DEFAULT_ORIGINS, ("https://web-auditor-ai1.vercel.app", "http://localhost:3000"))
        self.assertNotIn("*", bs.DEFAULT_ORIGINS)


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


class TlsTest(unittest.TestCase):
    """The service with TLS on a free port: a client that trusts the test CA connects, one that does not is refused."""

    @classmethod
    def setUpClass(cls):
        tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(tmp.cleanup)
        cls.pki, cls.other = Path(tmp.name) / "ca", Path(tmp.name) / "other"
        for folder in (cls.pki, cls.other):
            folder.mkdir(mode=0o700)
            make_certs.make_ca(folder)
        crt = make_certs.issue_board_cert(cls.pki, ["192.168.43.1"])
        cls.context = bs.tls_context(str(crt), str(crt.with_suffix(".key")))

    def setUp(self):
        self.f = Fixture(self)
        self.server = bs.Server(("127.0.0.1", 0), bs.make_handler(self.f.board, (ALLOWED,)), self.context)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_address[1]

    def get(self, cafile, name="board.local"):
        """GET /health over TLS, checking the certificate against `cafile` for `name`."""
        ctx = ssl.create_default_context(cafile=cafile)
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as raw, \
                ctx.wrap_socket(raw, server_hostname=name) as tls:
            tls.sendall(b"GET /health HTTP/1.0\r\n\r\n")
            data = b""
            while chunk := tls.recv(4096):
                data += chunk
            return data

    def test_a_client_that_trusts_the_ca_connects_by_name_and_by_address(self):
        for name in ("board.local", "127.0.0.1", "192.168.43.1"):  # the last is only in the SANs, not dialled
            data = self.get(str(self.pki / "ca.crt"), name)
            self.assertIn(b"200 OK", data.splitlines()[0])
            self.assertIn(b'"controller": true', data)

    def test_a_client_that_does_not_trust_it_is_refused(self):
        for cafile in (None, str(self.other / "ca.crt")):  # the system store; a different CA
            with self.assertRaises(ssl.SSLCertVerificationError):
                self.get(cafile)

    def test_a_certificate_for_another_name_is_refused(self):
        with self.assertRaises(ssl.SSLCertVerificationError):
            self.get(str(self.pki / "ca.crt"), "evil.example")

    def test_plain_http_to_the_tls_port_gets_no_answer_and_the_board_lives_on(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5) as raw:
            raw.sendall(b"GET /health HTTP/1.0\r\n\r\n")
            try:
                reply = raw.recv(4096)
            except ConnectionError:  # reset is as good a refusal as silence
                reply = b""
            self.assertNotIn(b"200", reply)
        self.assertIn(b"200 OK", self.get(str(self.pki / "ca.crt")).splitlines()[0])

    def test_a_stalled_handshake_does_not_block_other_clients(self):
        with socket.create_connection(("127.0.0.1", self.port), timeout=5):  # connects, says nothing
            self.assertIn(b"200 OK", self.get(str(self.pki / "ca.crt")).splitlines()[0])

    def test_http_needs_asking_for_by_name(self):
        cmd = [sys.executable, str(HERE / "board_service.py"), "--no-mdns", "--port", "0"]
        for extra, message in (([], "no certificate"), (["--cert", "x"], "go together"),
                               (["--insecure-http", "--cert", "x", "--key", "y"], "opposites"),
                               (["--cert", "/nonexistent", "--key", "/nonexistent"], "cannot load")):
            done = subprocess.run(cmd + extra, capture_output=True, text=True, timeout=30, env={**os.environ, "BOARD_TLS_CERT": "", "BOARD_TLS_KEY": ""})
            self.assertEqual(done.returncode, 2, extra)
            self.assertIn(message, done.stderr)


def run() -> int:
    result = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__]))
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run())
