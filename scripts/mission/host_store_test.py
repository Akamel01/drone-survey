#!/usr/bin/env python3
"""The host's store module against a fake network: urllib.request.urlopen is
replaced by an in-memory B2 that can be told to fail. Proves the one error
convention (transport faults arrive as StoreError, nothing exits) and that the
bookkeeping after Cards are written never crashes a run.

    python3 scripts/mission/host_store_test.py
"""

from __future__ import annotations

import hashlib
import http.client
import io
import json
import socket
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
import urllib.request
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import b2  # noqa: E402
import b2_status  # noqa: E402
import host_push  # noqa: E402
import host_store  # noqa: E402
import keys  # noqa: E402
import load_core  # noqa: E402
from host_store import HostStore, Session, StoreError  # noqa: E402

AUTH = {"apiUrl": "https://api", "downloadUrl": "https://dl", "authorizationToken": "tok",
        "allowed": {"bucketName": "bkt", "bucketId": "bid"}}

FAULTS = {
    "URLError": lambda: urllib.error.URLError("network is unreachable"),
    "timeout": lambda: TimeoutError("timed out"),
    "socket timeout": lambda: socket.timeout("timed out"),
    "reset": lambda: ConnectionResetError("reset by peer"),
    "short read": lambda: http.client.IncompleteRead(b"x"),
    "HTTP 503": lambda: urllib.error.HTTPError("https://dl", 503, "unavailable", {}, None),
}


class Resp:
    def __init__(self, body: bytes, headers: dict | None = None):
        self.body, self.headers = body, headers or {}

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeB2:
    """An in-memory bucket behind urlopen. `fail(kind)` returns an exception to
    raise for kind in {download, upload_url, upload}, or None."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.fail = lambda kind: None
        self.uploads: list[str] = []

    def __call__(self, req, timeout=None):
        url = req.full_url
        if url.endswith("b2_get_upload_url"):
            kind = "upload_url"
        elif url.startswith("https://dl/file/"):
            kind = "download"
        else:
            kind = "upload"
        err = self.fail(kind)
        if err is not None:
            raise err
        if kind == "upload_url":
            return Resp(json.dumps({"uploadUrl": "https://up/x", "authorizationToken": "t"}).encode())
        if kind == "download":
            key = urllib.parse.unquote(url.split("/file/bkt/")[1])
            if key not in self.objects:
                raise urllib.error.HTTPError(url, 404, "not found", {}, None)
            data = self.objects[key]
            return Resp(data, {"X-Bz-Content-Sha1": hashlib.sha1(data).hexdigest()})
        key = urllib.parse.unquote(req.headers["X-bz-file-name"])
        self.objects[key] = req.data
        self.uploads.append(key)
        return Resp(json.dumps({"contentSha1": hashlib.sha1(req.data).hexdigest()}).encode())


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.net = FakeB2()
        patch = mock.patch.object(urllib.request, "urlopen", self.net)
        patch.start()
        self.addCleanup(patch.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.config = Path(tmp.name) / "b2-status.env"
        self.config.write_text("B2_KEY_ID=k\nB2_APP_KEY=a\n")
        self.store = HostStore(self.config, connect=lambda _: Session(AUTH))

    def say(self, fn, *a, **kw) -> str:
        out = io.StringIO()
        with redirect_stdout(out):
            fn(*a, **kw)
        return out.getvalue()

    def put(self, key, obj):
        self.net.objects[key] = json.dumps(obj).encode()

    def break_network(self, name):
        self.net.fail = lambda kind: FAULTS[name]()

    # --- the happy path: read-merge-write ---

    def test_report_loaded_merges_into_the_manifest(self):
        self.put(keys.STATUS_KEY, {"specs/a": {"collected_at": "t0", "parts": 0, "cards": []}})
        self.store.report_loaded([("specs/a", [("way finder 1", {"name": "F", "waypoints": 3})])])
        stored = json.loads(self.net.objects[keys.STATUS_KEY])
        self.assertEqual(stored["specs/a"]["collected_at"], "t0")
        self.assertEqual(stored["specs/a"]["cards"], [{"card": "way finder 1", "name": "F", "waypoints": 3}])

    def test_missing_manifest_is_the_host_not_having_reported_yet(self):
        self.store.report_collected(["specs/a"])
        self.assertIn("specs/a", json.loads(self.net.objects[keys.STATUS_KEY]))

    def test_corrupt_manifest_is_not_overwritten(self):
        self.net.objects[keys.STATUS_KEY] = b"{not json"
        said = self.say(self.store.report_loaded, [("k", [])])
        self.assertIn("manifest update failed", said)
        self.assertEqual(self.net.objects[keys.STATUS_KEY], b"{not json")

    def test_ledger_round_trip_and_never_written_is_empty(self):
        self.assertEqual(self.store.fetch_ledger(), b2_status.EMPTY_LEDGER)
        self.store.update_ledger(lambda l: {**l, "pool": ["A"]}, settle_s=0, sleep=lambda s: None)
        self.assertEqual(self.store.fetch_ledger()["pool"], ["A"])

    def test_skipped_missing_is_empty_and_read_when_present(self):
        self.assertEqual(self.store.fetch_skipped(), {})
        self.put(keys.SKIPPED_KEY, {"specs/a": {"withdrawn_at": "t"}})
        self.assertEqual(self.store.fetch_skipped(), {"specs/a": {"withdrawn_at": "t"}})

    # --- failures: one convention ---

    def test_every_transport_fault_is_a_store_error_not_an_exit(self):
        for name in FAULTS:
            with self.subTest(fault=name):
                self.break_network(name)
                with self.assertRaises(StoreError):
                    Session(AUTH).download("k")
                with self.assertRaises(StoreError):
                    Session(AUTH).upload("k", b"x")
                with self.assertRaises(StoreError):
                    Session(AUTH).list_names("p")
                with mock.patch.object(urllib.request, "urlopen", self.net):
                    with self.assertRaises(StoreError):
                        b2.authorize("k", "a")

    def test_missing_object_is_not_a_fault(self):
        with self.assertRaises(FileNotFoundError):
            Session(AUTH).download("nope")

    def test_unreadable_ledger_raises_instead_of_coming_back_empty(self):
        for name in FAULTS:
            with self.subTest(fault=name):
                self.break_network(name)
                with self.assertRaises(load_core.LedgerUnreadable):
                    self.store.fetch_ledger()

    def test_ledger_write_failure_is_ledger_unreadable_for_the_caller_to_report(self):
        self.put(keys.LEDGER_KEY, {"pool": [], "holdings": {}})
        self.net.fail = lambda kind: FAULTS["timeout"]() if kind != "download" else None
        with self.assertRaises(load_core.LedgerUnreadable):
            self.store.update_ledger(lambda l: {**l, "pool": ["A"]}, settle_s=0, sleep=lambda s: None)

    def test_no_credentials_file_raises_a_store_error(self):
        with self.assertRaises(StoreError):
            host_store.load_env(self.config.with_name("absent.env"))
        with self.assertRaises(StoreError):
            host_store.load_env(self.config, ("B2_KEY_ID", "B2_BUCKET"))

    # --- the promise: bookkeeping never crashes a run ---

    def test_reports_survive_any_network_fault(self):
        reports = [
            lambda: self.store.report_loaded([("k", [("way finder 1", {"name": "F", "waypoints": 3})])]),
            lambda: self.store.report_drift([{"card": "way finder 1", "expected": "a", "found": "b"}]),
            lambda: self.store.report_drift([]),
            lambda: self.store.report_refusal("controller", ["k"], "locked"),
            lambda: self.store.report_overflow(["k"], 7, 5),
            lambda: self.store.report_collected(["k"]),
        ]
        for name in FAULTS:
            for i, report in enumerate(reports):
                with self.subTest(fault=name, report=i):
                    self.break_network(name)
                    said = self.say(report)
                    self.assertTrue(said.strip(), "a failed report must say so")
                    self.assertFalse(self.net.uploads, "nothing half-written")

    def test_after_cards_are_written_the_run_ends_cleanly_whatever_the_network_does(self):
        """The sequence load.py runs once the Cards are written and read back."""
        for name in FAULTS:
            with self.subTest(fault=name):
                self.break_network(name)
                loaded = [("k", [("way finder 1", {"name": "F", "waypoints": 3})])]
                notes: list[str] = []
                self.say(self.store.report_drift, [])
                self.say(self.store.report_loaded, loaded)
                load_core.record_written(self.store, {"verified_at": "t"}, {"way finder 1": "md5"}, "t",
                                         notes.append, settle_s=0, sleep=lambda s: None)
                self.assertTrue(notes and "Ledger" in notes[0], notes)

    def test_each_report_tells_the_phone_beside_the_status_credentials(self):
        # host_push's own selftest proves the POST and that it never raises (#319).
        with mock.patch.object(host_push, "tell") as tell:
            self.say(self.store.report_loaded, [("specs/a", [("way finder 2", {"name": "F", "waypoints": 3})])])
            self.say(self.store.report_collected, ["specs/b"])
            self.say(self.store.report_collected, [])
            self.say(self.store.report_refusal, "controller", ["specs/a"], "The Controller is locked.")
            self.say(self.store.report_overflow, ["specs/a"], 3, 2)
        self.assertTrue(all(c.args[0] == self.config.parent for c in tell.call_args_list))
        events = [c.args[1] for c in tell.call_args_list]
        self.assertEqual(events[0], {"event": "loaded", "loads": [{"key": "specs/a", "cards": ["way finder 2"]}]})
        self.assertEqual(events[1], {"event": "collected", "keys": ["specs/b"]})
        self.assertEqual(events[2], {"event": "refused", "keys": ["specs/a"], "reason": "The Controller is locked."})
        self.assertEqual(events[3]["event"], "refused")
        self.assertIn("3 parts do not fit 2 Cards", events[3]["reason"])
        self.assertEqual(len(events), 4, "an empty Collect tells nobody")

    def test_a_fault_in_the_middle_of_the_merge_write_is_reported_not_raised(self):
        self.put(keys.STATUS_KEY, {})
        self.net.fail = lambda kind: FAULTS["timeout"]() if kind == "upload" else None
        self.assertIn("manifest update failed", self.say(self.store.report_loaded, [("k", [])]))


if __name__ == "__main__":
    unittest.main()
