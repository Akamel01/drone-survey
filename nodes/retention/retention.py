#!/usr/bin/env python3
from __future__ import annotations

"""Delete Captures and their derived outputs twelve months after the date flown.

ADR 0012 and the privacy policy (section 5): deletion is scheduled, executed
and logged, and the log is what shows the policy is real. Everything kept for
a Capture lives under <root>/<site-id>/<YYYY-MM-DD flown>/, so one directory
per Capture is the unit that expires. Pass every root that holds Capture data
(raw imagery, run workdirs, local Bundles).

Dry run by default: it lists what is due and deletes nothing.

    python3 expire_captures.py --root ~/drone/captures             # what is due
    python3 expire_captures.py --root ~/drone/captures --delete    # monthly job
    python3 expire_captures.py --selftest
"""

import argparse
import json
import re
import shutil
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import emit_report  # noqa: E402

DATE_DIR = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DEFAULT_LOG = Path.home() / "drone" / "deletion-log.jsonl"


def expiry(flown: date) -> date:
    """Same calendar day a year later; a Capture flown on 29 February expires on 1 March."""
    try:
        return flown.replace(year=flown.year + 1)
    except ValueError:
        return date(flown.year + 1, 3, 1)


def due(roots: list[Path], today: date) -> list[tuple[Path, str, date]]:
    """(directory, site id, date flown) for every Capture past its twelve months."""
    found = []
    for root in roots:
        for capture in sorted(root.glob("*/*")):
            if not (capture.is_dir() and DATE_DIR.match(capture.name)):
                continue
            # A Capture holds images, not more date-named directories. Pointing
            # --root one level too high makes a Site look like a Capture, and
            # deleting it would take the fresh Captures inside it too.
            if any(child.is_dir() and DATE_DIR.match(child.name) for child in capture.iterdir()):
                print(f"refusing {capture}: it contains date-named directories, "
                      f"so it is a container, not a Capture", file=sys.stderr)
                continue
            flown = date.fromisoformat(capture.name)
            if expiry(flown) <= today:
                found.append((capture, capture.parent.name, flown))
    return found


def size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def expire(roots: list[Path], log: Path, today: date, delete: bool, out_report: Path | None = None) -> int:
    captures = due(roots, today)
    for capture, site, flown in captures:
        entry = {"site": site, "flown": flown.isoformat(), "path": str(capture), "bytes": size(capture)}
        if not delete:
            print(f"due: {json.dumps(entry)}")
            continue
        shutil.rmtree(capture)
        entry["deleted_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        log.parent.mkdir(parents=True, exist_ok=True)
        with log.open("a") as f:  # one line per deletion, written only after it happened
            f.write(json.dumps(entry) + "\n")
        print(f"deleted: {json.dumps(entry)}")
    # A run that found nothing is logged too, so the log proves the job ran every month.
    if delete:
        with log.open("a") as f:
            f.write(json.dumps({"run": today.isoformat(), "deleted": len(captures)}) + "\n")
    if out_report is not None:
        emit_report(out_report, {
            "deleted": sorted(str(c) for c, _, _ in captures),
            "cutoff": expiry(today).isoformat(),
            "dry_run": not delete,
        })
    return len(captures)


def _selftest() -> None:
    assert expiry(date(2026, 9, 13)) == date(2027, 9, 13)
    assert expiry(date(2028, 2, 29)) == date(2029, 3, 1)
    with tempfile.TemporaryDirectory() as tmp:
        root, log = Path(tmp) / "captures", Path(tmp) / "log.jsonl"
        for rel in ("site-a/2025-09-12", "site-a/2025-09-14", "site-b/2025-01-01", "site-b/notes"):
            (root / rel).mkdir(parents=True)
            (root / rel / "img.jpg").write_bytes(b"x" * 10)
        today = date(2026, 9, 13)

        assert expire([root], log, today, delete=False) == 2
        assert (root / "site-a/2025-09-12").exists() and not log.exists()  # dry run deletes nothing

        assert expire([root], log, today, delete=True) == 2
        assert not (root / "site-a/2025-09-12").exists() and not (root / "site-b/2025-01-01").exists()
        assert (root / "site-a/2025-09-14").exists()  # one day short of its year
        assert (root / "site-b/notes").exists()  # not a Capture directory, never touched
        lines = [json.loads(l) for l in log.read_text().splitlines()]
        assert [l.get("site") for l in lines[:2]] == ["site-a", "site-b"] and lines[0]["bytes"] == 10
        assert lines[-1] == {"run": "2026-09-13", "deleted": 2}
    print("expire_captures self-check: ok")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--root", type=Path, action="append", default=[], help="a directory of <site-id>/<date> Captures")
    p.add_argument("--log", type=Path, default=DEFAULT_LOG, help="append-only deletion log")
    p.add_argument("--delete", action="store_true", help="actually delete; without it this is a dry run")
    p.add_argument("--selftest", action="store_true")
    p.add_argument("--out-report", type=Path, help="where to write this run's report (the Node contract)")
    args = p.parse_args()
    if args.selftest:
        _selftest()
        return
    if not args.root:
        sys.exit("pass at least one --root")
    missing = [r for r in args.root if not r.is_dir()]
    if missing:
        sys.exit(f"not a directory: {', '.join(map(str, missing))}")
    expire(args.root, args.log, date.today(), args.delete, args.out_report)


if __name__ == "__main__":
    main()
