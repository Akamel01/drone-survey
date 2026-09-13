#!/usr/bin/env python3
"""Fetch Dispatched Mission Specs from B2 onto this host, ready to be Loaded.

Collecting and Loading are different moments (CONTEXT.md): this runs on its
own schedule to gather what the planner Dispatched, and a Controller is only
ever written by push_to_rc.py, by hand, when one is plugged in. This script
has no MTP code path and no import of push_to_rc — there is no line in this
file that could write to a Controller, so a lost or corrupted local record
(ADR 0017) can only ever cause a redundant download, never a bad Load.

The B2 key read from credentials is confined server-side to specs/ and can
list and read but not write or delete, so this script would be safe even
without that design choice.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

B2_AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account"


def _xdg(var: str, fallback: str) -> Path:
    base = os.environ.get(var)
    return Path(base) if base else Path.home() / fallback


DEFAULT_CONFIG = _xdg("XDG_CONFIG_HOME", ".config") / "wayfinder" / "b2-read.env"
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


def spec_key_pattern(prefix: str) -> re.Pattern:
    """Specs are keyed <prefix><site-id>/<date>/<dispatch-timestamp>.json (ADR 0017)."""
    return re.compile(rf"^{re.escape(prefix)}([^/]+)/([^/]+)/([^/]+)\.json$")


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
    """v2 authorize only — v3 nests this same data under apiInfo and breaks every field access below."""
    token = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
    req = urllib.request.Request(B2_AUTHORIZE_URL, headers={"Authorization": f"Basic {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"authorize failed: {e.code} {e.reason}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach B2: {e.reason}")


def list_specs(api_url: str, token: str, bucket_id: str, prefix: str) -> list[str]:
    """All file names under prefix, following nextFileName until B2 stops paging."""
    names: list[str] = []
    start = None
    while True:
        body: dict = {"bucketId": bucket_id, "prefix": prefix, "maxFileCount": 1000}
        if start:
            body["startFileName"] = start
        req = urllib.request.Request(
            f"{api_url}/b2api/v2/b2_list_file_names",
            data=json.dumps(body).encode(),
            headers={"Authorization": token, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                page = json.load(resp)
        except urllib.error.HTTPError as e:
            sys.exit(f"list failed: {e.code} {e.reason}")
        names.extend(f["fileName"] for f in page["files"])
        start = page.get("nextFileName")
        if not start:
            return names


def download(download_url: str, bucket_name: str, file_name: str, token: str) -> bytes:
    """Fetch one Spec and verify it against B2's own X-Bz-Content-Sha1 before returning it."""
    url = f"{download_url}/file/{bucket_name}/{urllib.parse.quote(file_name, safe='/')}"
    req = urllib.request.Request(url, headers={"Authorization": token})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            expected = resp.headers.get("X-Bz-Content-Sha1", "")
    except urllib.error.HTTPError as e:
        sys.exit(f"download of {file_name} failed: {e.code} {e.reason}")
    verify_sha1(data, expected)
    return data


def load_record(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(json.loads(path.read_text()))


def save_record(path: Path, collected: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(collected), indent=2))


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
    p.add_argument("--selftest", action="store_true", help="run the offline self-check and exit")
    args = p.parse_args()

    if args.selftest:
        _selftest()
        return

    env = load_env(args.config)
    auth = authorize(env["B2_KEY_ID"], env["B2_APP_KEY"])
    allowed = auth["allowed"]
    pattern = spec_key_pattern(env["B2_PREFIX"])

    all_names = list_specs(auth["apiUrl"], auth["authorizationToken"], allowed["bucketId"], env["B2_PREFIX"])
    specs = [n for n in all_names if pattern.match(n)]
    collected = load_record(args.record)
    new = [n for n in specs if n not in collected]

    if args.list:
        current = newest_per_site_date(specs, pattern)
        print(f"{len(specs)} Specs Dispatched, {len(new)} not yet Collected:")
        for name in sorted(specs):
            site, date, _ = pattern.match(name).groups()
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


if __name__ == "__main__":
    main()
