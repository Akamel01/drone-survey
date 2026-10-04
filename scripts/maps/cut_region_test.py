"""Offline checks of cut_region.py: the disk floor, the build lookup, the
manifest, and the queue's bookkeeping. No network, no pmtiles binary."""

import datetime
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cut_region as c  # noqa: E402


class Space(unittest.TestCase):
    def test_stops_under_the_floor(self):
        with mock.patch.object(c, "free_bytes", return_value=5 * c.GB + c.GB // 2):
            with self.assertRaises(c.Stop):
                c.check_space(Path("."))

    def test_room_is_what_is_free_above_the_floor(self):
        with mock.patch.object(c, "free_bytes", return_value=15 * c.GB):
            self.assertEqual(c.check_space(Path(".")), 10 * c.GB)


class Build(unittest.TestCase):
    def test_falls_back_to_the_newest_build_that_exists(self):
        seen = []

        def head(url):
            seen.append(url)
            return url.endswith("20261002.pmtiles")

        stamp, url = c.latest_build(datetime.date(2026, 10, 4), head=head)
        self.assertEqual((stamp, url), ("20261002", "https://build.protomaps.com/20261002.pmtiles"))
        self.assertEqual(len(seen), 3)

    def test_none_in_a_week_stops(self):
        with self.assertRaises(c.Stop):
            c.latest_build(datetime.date(2026, 10, 4), head=lambda u: False)


class Manifest(unittest.TestCase):
    def test_a_recut_replaces_the_region_and_keeps_the_others(self):
        old = {"regions": [{"id": "bc", "build": "1"}, {"id": "ab", "build": "1"}]}
        new = c.with_region(old, {"id": "bc", "build": "2"})
        self.assertEqual([(r["id"], r["build"]) for r in new["regions"]], [("ab", "1"), ("bc", "2")])


class Queue(unittest.TestCase):
    AUTH = {"allowed": {"bucketId": "bid"}, "downloadUrl": "d", "authorizationToken": "t", "apiUrl": "a"}
    ENV = {"B2_BUCKET": "bkt"}

    def run_queue(self, requests, publish):
        files = [{"fileName": f"{c.REQUESTS_PREFIX}{r['id']}.json", "fileId": f"id-{r['id']}"} for r in requests]
        by_name = {f["fileName"]: json.dumps(r).encode() for f, r in zip(files, requests)}
        written, deleted = {}, []
        with mock.patch.object(c, "list_files", return_value=files), \
             mock.patch.object(c.b2, "download", side_effect=lambda dl, bkt, key, tok: by_name[key]), \
             mock.patch.object(c, "put_bytes", side_effect=lambda a, b, key, data: written.__setitem__(key, json.loads(data))), \
             mock.patch.object(c, "_api", side_effect=lambda a, call, body: deleted.append(body["fileName"]) or {}):
            n = c.process_queue(self.AUTH, self.ENV, publish=publish)
        return n, written, deleted

    def test_a_cut_request_is_marked_cutting_then_removed(self):
        req = {"id": "bc", "name": "BC", "bbox": [1, 2, 3, 4], "status": "queued"}
        n, written, deleted = self.run_queue([req], lambda r, a, e: {})
        self.assertEqual(n, 1)
        self.assertEqual(written[c.REQUESTS_PREFIX + "bc.json"]["status"], "cutting")
        self.assertEqual(deleted, [c.REQUESTS_PREFIX + "bc.json"])

    def test_a_failed_cut_stays_with_its_reason_and_does_not_stop_the_next(self):
        def publish(r, a, e):
            if r["id"] == "bc":
                raise c.Stop("only 6.0 GB is free")

        reqs = [{"id": "bc", "status": "queued"}, {"id": "ab", "status": "queued"}]
        n, written, deleted = self.run_queue(reqs, publish)
        self.assertEqual(n, 1)
        self.assertEqual((written[c.REQUESTS_PREFIX + "bc.json"]["status"], written[c.REQUESTS_PREFIX + "bc.json"]["message"]), ("failed", "only 6.0 GB is free"))
        self.assertEqual(deleted, [c.REQUESTS_PREFIX + "ab.json"])

    def test_requests_that_are_not_queued_are_left_alone(self):
        n, written, deleted = self.run_queue([{"id": "bc", "status": "failed"}], lambda r, a, e: {})
        self.assertEqual((n, written, deleted), (0, {}, []))


class Cut(unittest.TestCase):
    def test_refuses_without_the_binary(self):
        with tempfile.TemporaryDirectory() as d, mock.patch.object(c, "PMTILES", Path(d) / "pmtiles"):
            with self.assertRaises(c.Stop) as cm:
                c.cut({"id": "bc", "bbox": [0, 0, 1, 1]}, "u", Path(d) / "o")
            self.assertIn("binary", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
