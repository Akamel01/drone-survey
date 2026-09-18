#!/usr/bin/env python3
"""Retention runs as a Node and selects exactly the expired Captures.

ADR 0017 puts Captures on a 12-month clock. That rule lives in
nodes/retention/retention.py, but the rule is only real if it is reachable and
its decision is checked: this drives pipeline/manifests/retention.json through
the Runner on a fixture tree and reads the report the Node wrote.

Offline, no network, no bucket. One command:

    python3 nodes/check_retention.py [--allow-skips]
"""

from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNNER = REPO_ROOT / "pipeline" / "runner.py"
MANIFEST = REPO_ROOT / "pipeline" / "manifests" / "retention.json"


def main() -> None:
    assert MANIFEST.is_file(), f"retention has no Manifest to run: {MANIFEST}"
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "run"
        root = work / "captures"
        today = dt.date.today()

        def capture(days_old: int, marker: str) -> Path:
            d = root / "site-a" / (today - dt.timedelta(days=days_old)).isoformat()
            d.mkdir(parents=True)
            (d / marker).write_text("x")
            return d

        expired = capture(400, "old.jpg")
        fresh = capture(10, "new.jpg")

        result = subprocess.run(
            [sys.executable, str(RUNNER), str(MANIFEST), "--workdir", str(work)],
            capture_output=True, text=True, timeout=300,
        )
        assert result.returncode == 0, result.stdout + result.stderr

        report_path = work / "nodes" / "expire" / "report.json"
        assert report_path.is_file(), "the Runner did not verify a report output"
        report = json.loads(report_path.read_text())
        assert report["dry_run"] is True, "a run with no --delete must be a dry run"
        assert str(expired) in json.dumps(report["deleted"]), "an expired Capture must be selected"
        assert str(fresh) not in json.dumps(report["deleted"]), "a fresh Capture must not be selected"
        assert expired.exists() and (expired / "old.jpg").exists(), "a dry run must delete nothing"
        print("[ok] retention: the Runner ran the Node; the expired Capture was selected, the fresh one was not, and nothing was deleted")


if __name__ == "__main__":
    main()
