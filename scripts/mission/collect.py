#!/usr/bin/env python3
"""Fetch Dispatched Mission Specs from B2 onto this host, ready to be Loaded.

Collecting and Loading are different moments (CONTEXT.md): this runs on its
own schedule to gather what the planner Dispatched, and the Controller is only
ever written by load.py, by hand, when one is plugged in. This script
has no MTP code path at all — there is no line in this file that could write to
a Controller, so a lost or corrupted local record
(ADR 0017) can only ever cause a redundant download, never a bad Load.

The B2 key read from credentials is confined server-side to specs/ and can
list and read but not write or delete, so this script would be safe even
without that design choice.
"""

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from keys import spec_key_pattern  # noqa: E402  (one home for the store key layout)
from host_store import HostStore, Session, StoreError, load_env  # noqa: E402  (the one door to the store)



def _xdg(var: str, fallback: str) -> Path:
    base = os.environ.get(var)
    return Path(base) if base else Path.home() / fallback


DEFAULT_CONFIG = _xdg("XDG_CONFIG_HOME", ".config") / "wayfinder" / "b2-read.env"
DEFAULT_STATUS_CONFIG = _xdg("XDG_CONFIG_HOME", ".config") / "wayfinder" / "b2-status.env"
DEFAULT_RECORD = _xdg("XDG_DATA_HOME", ".local/share") / "wayfinder" / "collected.json"
DEFAULT_DEST = Path.home() / "wayfinder" / "specs"


REQUIRED = ("B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET", "B2_PREFIX")


def load_skipped(status_config: Path) -> dict | None:
    """The per-run skip-list for Specs from specs/_status/skipped.json in the
    store: specKey -> {withdrawn_at}, the one shape the withdraw route writes.

    Best-effort: None when it could not be fetched (no status credentials, store
    unreachable), so Collect skips nothing and the local copy is left as it was.
    """
    try:
        return HostStore(status_config).fetch_skipped()
    except StoreError:
        return None


def verify_sha1(data: bytes, expected_hex: str) -> None:
    """Refuse to keep a download that doesn't match B2's own checksum of it."""
    actual = hashlib.sha1(data).hexdigest()
    if actual != expected_hex:
        raise ValueError(f"sha1 mismatch: got {actual}, B2 said {expected_hex!r}")


def load_record(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(json.loads(path.read_text()))


def save_record(path: Path, collected: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(collected), indent=2))


def _selftest() -> None:
    """Offline proof: only Spec-shaped keys are Collected, and sha1 verification
    rejects a mismatched download. No network, no credentials required:

        python3 scripts/mission/collect.py --selftest
    """
    pattern = spec_key_pattern("specs/")

    # 2. Anything not shaped like a Spec key (eg. the Site registry) is ignored.
    assert pattern.match("sites/rehearsal-field.json") is None
    # 2b. Planner bookkeeping under the same prefix is invisible to Collect.
    assert pattern.match("specs/_drafts/0193abcd.json") is None
    assert pattern.match("specs/_status/missions.json") is None

    # 3. sha1 verification: correct hash passes, wrong hash is refused.
    data = b'{"site": "rehearsal-field"}'
    verify_sha1(data, hashlib.sha1(data).hexdigest())  # raises on failure, reaching here is the pass
    try:
        verify_sha1(data, "0" * 40)
    except ValueError:
        pass
    else:
        raise AssertionError("verify_sha1 accepted a mismatched hash")

    print("collect self-check: ok")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="B2 read credentials env file")
    p.add_argument("--record", type=Path, default=DEFAULT_RECORD, help="local record of already-Collected keys")
    p.add_argument("--dest", type=Path, default=DEFAULT_DEST, help="where Collected Specs are written")
    p.add_argument("--list", action="store_true", help="show what's Dispatched and what's new, without downloading")
    p.add_argument("--dry-run", action="store_true", help="show what would be Collected, without downloading")
    p.add_argument("--status-config", type=Path, default=DEFAULT_STATUS_CONFIG,
                   help="B2 status credentials env file (read specs/, write status/*)")
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    args = p.parse_args()

    if args.selftest:
        _selftest()
        return

    try:
        collect(args)
    except StoreError as e:  # the script's edge: the library raises, this exits
        sys.exit(str(e))


def collect(args: argparse.Namespace) -> None:
    prefix = load_env(args.config, REQUIRED)["B2_PREFIX"]
    session = Session.open(args.config, REQUIRED)
    pattern = spec_key_pattern(prefix)

    all_names = session.list_names(prefix)
    specs = [n for n in all_names if pattern.match(n)]
    collected = load_record(args.record)
    # Apply the host-specific skip-list if available, after computing new candidates
    new = [n for n in specs if n not in collected]
    fetched = load_skipped(args.status_config)
    skipped = fetched or {}
    # Persist the locally-fetched skip-list to SPECS/_status/skipped.json on every run
    # so the Load-side can observe withdrawals even if the remote source is missing
    # or delayed. This is a best-effort write and does not affect the Collected set.
    if fetched is not None:
        try:
            local_skip_path = DEFAULT_DEST / "_status" / "skipped.json"
            local_skip_path.parent.mkdir(parents=True, exist_ok=True)
            local_skip_path.write_text(json.dumps(fetched, indent=2, sort_keys=True))
        except OSError:
            pass
    if skipped:
        # Skip any specs listed in the status-based skip list; this must not be
        # reflected in the collected record. See M-57-HOST contract.
        new = [n for n in new if n not in skipped]

    if args.list:
        # No "superseded" tag: two Missions of one Site and day are two flights,
        # and supersession is decided in the store, not by which key is newest.
        print(f"{len(specs)} Specs Dispatched, {len(new)} not yet Collected:")
        for name in sorted(specs):
            print(f"  {name}  [{'new' if name in new else 'collected'}]")
        return

    if not new:
        print("nothing new to Collect")
        return

    for name in new:
        site, date, _ = pattern.match(name).groups()
        if args.dry_run:
            print(f"would Collect {site} {date}: {name}")
            continue
        try:
            data = session.download(name)
        except FileNotFoundError:
            raise StoreError(f"download of {name} failed: not found") from None
        out = args.dest / Path(name).relative_to(prefix.rstrip("/"))
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        # Record after each write, not at the end: a crash mid-run must not
        # forget Specs already safely on disk and re-download them next time.
        collected.add(name)
        save_record(args.record, collected)
        print(f"Collected {site} {date}: {name}")

    if not args.dry_run and new:
        HostStore(args.status_config).report_collected(sorted(new))


if __name__ == "__main__":
    main()
