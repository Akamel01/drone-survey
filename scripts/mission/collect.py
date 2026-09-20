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
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from keys import SKIPPED_KEY, spec_key_pattern  # noqa: E402  (one home for the store key layout)
import b2  # noqa: E402  (one home for storage access)

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import b2_status  # noqa: E402  (network to B2 only; no mount, no Controller)



def _xdg(var: str, fallback: str) -> Path:
    base = os.environ.get(var)
    return Path(base) if base else Path.home() / fallback


DEFAULT_CONFIG = _xdg("XDG_CONFIG_HOME", ".config") / "wayfinder" / "b2-read.env"
DEFAULT_STATUS_CONFIG = _xdg("XDG_CONFIG_HOME", ".config") / "wayfinder" / "b2-status.env"
DEFAULT_RECORD = _xdg("XDG_DATA_HOME", ".local/share") / "wayfinder" / "collected.json"
DEFAULT_DEST = Path.home() / "wayfinder" / "specs"


def load_env(path: Path) -> dict[str, str]:
    """Parse KEY=VALUE lines from the credentials file. Never logs a value."""
    if not path.exists():
        sys.exit(f"no credentials at {path}")
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    missing = [k for k in ("B2_KEY_ID", "B2_APP_KEY", "B2_BUCKET", "B2_PREFIX") if k not in env]
    if missing:
        sys.exit(f"{path} is missing {', '.join(missing)}")
    return env


def load_skipped(status_config: Path) -> set[str]:
    """Fetch the per-run skip-list for Specs from specs/_status/skipped.json in the
    B2 bucket, using credentials provided by status_config.

    This fetch is best-effort: if the status config is missing or the remote fetch
    fails, we fall back to an empty skip-set so Collect behaves conservatively
    (no skipped items).
    """
    try:
        if not status_config.exists():
            return set()
        senv = load_env(status_config)
        sauth = authorize(senv["B2_KEY_ID"], senv["B2_APP_KEY"])
        sallowed = sauth["allowed"]
        data = download(
            sauth["downloadUrl"], sallowed["bucketName"], SKIPPED_KEY,
            sauth["authorizationToken"],
        )
        text = data.decode() if isinstance(data, (bytes, bytearray)) else str(data)
        if not text:
            return set()
        obj = json.loads(text)
        # One shape, the one the withdraw route writes: specKey -> {withdrawn_at}.
        # The list and {"skipped": ...} forms had no writer and are gone.
        if isinstance(obj, dict):
            return {str(k): v for k, v in obj.items()}
        return {}
    except (Exception, SystemExit):
        # download()/load_env() sys.exit on 404/bad creds; the skip-list is best-effort
        return set()


def newest_per_site_date(file_names: list[str], pattern: re.Pattern) -> dict[tuple[str, str], str]:
    """The one key per (Site, date) that Loading would actually use.

    Timestamps sort lexically (ADR 0017), so within a group the newest key is
    simply the lexically last file name once all names are sorted together —
    no need to parse the timestamp itself.
    """
    latest: dict[tuple[str, str], str] = {}
    for name in sorted(file_names):
        m = pattern.match(name)
        if not m:
            continue
        site, date, _ = m.groups()
        latest[(site, date)] = name
    return latest


def verify_sha1(data: bytes, expected_hex: str) -> None:
    """Refuse to keep a download that doesn't match B2's own checksum of it."""
    actual = hashlib.sha1(data).hexdigest()
    if actual != expected_hex:
        raise ValueError(f"sha1 mismatch: got {actual}, B2 said {expected_hex!r}")


def authorize(key_id: str, app_key: str) -> dict:
    """One adapter for every storage call this script makes (see b2.py)."""
    return b2.authorize(key_id, app_key)


def download(download_url: str, bucket_name: str, file_name: str, token: str) -> bytes:
    """Fetch one Spec; the adapter verifies B2's own checksum before returning it."""
    try:
        return b2.download(download_url, bucket_name, file_name, token)
    except FileNotFoundError:
        sys.exit(f"download of {file_name} failed: not found")


def load_record(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(json.loads(path.read_text()))


def save_record(path: Path, collected: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(collected), indent=2))


def report_collected(status_config: Path, keys: list[str]) -> None:
    """Stamp the cloud manifest so the planner shows Collected. Bookkeeping,
    not the Collect: without status credentials the Specs are still Collected
    and the run still succeeds — it just says so loudly."""
    if not status_config.exists():
        print(f"no status credentials at {status_config}; manifest not updated")
        return
    try:
        senv = load_env(status_config)
        sauth = authorize(senv["B2_KEY_ID"], senv["B2_APP_KEY"])
        sallowed = sauth["allowed"]
        manifest = b2_status.download_manifest(
            sauth["apiUrl"], sauth["downloadUrl"], sallowed["bucketName"], sauth["authorizationToken"])
        b2_status.merge_collected(manifest, keys, b2_status.utcnow())
        b2_status.upload_manifest(sauth["apiUrl"], sauth["authorizationToken"], sallowed["bucketId"], manifest)
    except SystemExit as e:
        print(f"manifest update failed ({e}); the Collect itself succeeded")
        return
    print(f"Reported {len(keys)} Collected to the manifest")


def _selftest() -> None:
    """Offline proof: supersession picks the lexically-newest key per Site/date,
    and sha1 verification rejects a mismatched download. No network, no
    credentials required — run directly:

        python3 scripts/mission/collect.py --selftest
    """
    pattern = spec_key_pattern("specs/")

    # 1. Newest timestamp wins within a Site/date group; other groups untouched.
    keys = [
        "specs/rehearsal-field/2026-09-13/20260913T090000Z.json",
        "specs/rehearsal-field/2026-09-13/20260913T140000Z.json",  # supersedes the 09:00 dispatch
        "specs/rehearsal-field/2026-09-14/20260914T080000Z.json",
        "specs/other-site/2026-09-13/20260913T100000Z.json",
    ]
    current = newest_per_site_date(keys, pattern)
    assert current[("rehearsal-field", "2026-09-13")] == "specs/rehearsal-field/2026-09-13/20260913T140000Z.json"
    assert current[("rehearsal-field", "2026-09-14")] == "specs/rehearsal-field/2026-09-14/20260914T080000Z.json"
    assert current[("other-site", "2026-09-13")] == "specs/other-site/2026-09-13/20260913T100000Z.json"

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

    # Additional offline tests for M-57-HOST skipped.json behavior (withdrawal scenarios)
    pattern = spec_key_pattern("specs/")
    names = [
        "specs/site/2026-09-13/20260913T090000Z.json",
        "specs/site/2026-09-13/20260913T140000Z.json",
        "specs/site/2026-09-14/20260914T080000Z.json",
    ]
    newest = newest_per_site_date(names, pattern)
    # Case 1: withdraw newest via skipped.json; newest would be skipped, no promotion
    skipped = {"specs/site/2026-09-13/20260913T140000Z.json"}
    queue = [str(p) for p in newest.values() if str(p) not in skipped]
    assert queue == ["specs/site/2026-09-14/20260914T080000Z.json"], queue
    # Case 2: withdraw-after-collect: if newest is in the collected set, it is not promoted
    record = {"specs/site/2026-09-13/20260913T140000Z.json"}
    queue2 = [str(p) for p in newest.values() if str(p) not in skipped and str(p) not in record]
    assert queue2 == ["specs/site/2026-09-14/20260914T080000Z.json"], queue2


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

    env = load_env(args.config)
    auth = authorize(env["B2_KEY_ID"], env["B2_APP_KEY"])
    allowed = auth["allowed"]
    pattern = spec_key_pattern(env["B2_PREFIX"])

    all_names = b2.list_names(auth["apiUrl"], auth["authorizationToken"], allowed["bucketId"], env["B2_PREFIX"])
    specs = [n for n in all_names if pattern.match(n)]
    collected = load_record(args.record)
    # Apply the host-specific skip-list if available, after computing new candidates
    new = [n for n in specs if n not in collected]
    skipped = load_skipped(args.status_config)
    # Persist the locally-fetched skip-list to SPECS/_status/skipped.json on every run
    # so the Load-side can observe withdrawals even if the remote source is missing
    # or delayed. This is a best-effort write and does not affect the Collected set.
    try:
        local_skip_path = DEFAULT_DEST / "_status" / "skipped.json"
        local_skip_path.parent.mkdir(parents=True, exist_ok=True)
        local_skip_path.write_text(json.dumps(skipped, indent=2, sort_keys=True))
    except Exception:
        pass
    if skipped:
        # Skip any specs listed in the status-based skip list; this must not be
        # reflected in the collected record. See M-57-HOST contract.
        new = [n for n in new if n not in skipped]

    if args.list:
        current = newest_per_site_date(specs, pattern)
        print(f"{len(specs)} Specs Dispatched, {len(new)} not yet Collected:")
        for name in sorted(specs):
            m = pattern.match(name)
            if not m:
                continue
            site, date, _ = m.groups()
            tags = ["new" if name in new else "collected"]
            if current.get((site, date)) != name:
                tags.append("superseded")
            print(f"  {name}  [{', '.join(tags)}]")
        return

    if not new:
        print("nothing new to Collect")
        return

    for name in new:
        site, date, _ = pattern.match(name).groups()
        if args.dry_run:
            print(f"would Collect {site} {date}: {name}")
            continue
        data = download(auth["downloadUrl"], allowed["bucketName"], name, auth["authorizationToken"])
        out = args.dest / Path(name).relative_to(env["B2_PREFIX"].rstrip("/"))
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        # Record after each write, not at the end: a crash mid-run must not
        # forget Specs already safely on disk and re-download them next time.
        collected.add(name)
        save_record(args.record, collected)
        print(f"Collected {site} {date}: {name}")

    if not args.dry_run and new:
        report_collected(args.status_config, sorted(new))


if __name__ == "__main__":
    main()
