"""Every store key the host scripts build or parse. The Python twin of
`web/lib/keys.ts`, and the only place a key literal lives on this side.

A Spec is `specs/<site>/<date>/<dispatch stamp>.json` (ADR 0016/0017). The
underscore-prefixed paths sit inside `specs/` on purpose: the collector's Spec
pattern matches only three-segment site/date/file keys, so drafts and the status
records are invisible to Collect.
"""

from __future__ import annotations

import re

SPEC_PREFIX = "specs/"
DRAFTS_PREFIX = "specs/_drafts/"
STATUS_KEY = "specs/_status/missions.json"
SUMMARIES_KEY = "specs/_status/summaries.json"
SKIPPED_KEY = "specs/_status/skipped.json"


def spec_key_pattern(prefix: str) -> re.Pattern:
    """Specs are keyed <prefix><site-id>/<date>/<dispatch-timestamp>.json (ADR 0017)."""
    return re.compile(rf"^{re.escape(prefix)}([^/]+)/([^/]+)/([^/]+)\.json$")


def make_spec_key(prefix: str, site: str, date: str, stamp: str) -> str:
    """The key a Spec is written under; the twin of web/lib/keys.ts's makeSpecKey."""
    return f"{prefix}{site}/{date}/{stamp}.json"


def parse_spec_key(key: str):

    """The Site, date and stamp of a Spec key; None for anything else."""
    m = spec_key_pattern(SPEC_PREFIX).match(key)
    if not m:
        return None
    site, date, stamp = m.groups()
    return {"site": site, "date": date, "stamp": stamp}


def _selftest() -> None:
    """The committed fixture is the contract both languages read: if this
    grammar and web/lib/keys.ts ever disagree, one of the two suites fails."""
    import json
    from pathlib import Path

    fixture = json.loads((Path(__file__).resolve().parents[2] / "fixtures" / "store-keys.json").read_text())
    pattern = spec_key_pattern(SPEC_PREFIX)
    for entry in fixture["spec_keys"]:
        assert parse_spec_key(entry["key"]) == {k: entry[k] for k in ("site", "date", "stamp")}, entry
        assert make_spec_key(SPEC_PREFIX, entry["site"], entry["date"], entry["stamp"]) == entry["key"], entry
    for key in fixture["not_spec_keys"]:
        assert pattern.match(key) is None, key
        assert parse_spec_key(key) is None, key
    assert DRAFTS_PREFIX == fixture["drafts_prefix"]
    assert f"{DRAFTS_PREFIX}{fixture['draft_key']['id']}.json" == fixture["draft_key"]["key"]
    assert (STATUS_KEY, SKIPPED_KEY, SUMMARIES_KEY) == (
        fixture["status_keys"]["missions"], fixture["status_keys"]["skipped"], fixture["status_keys"]["summaries"])
    print("keys self-check: ok")


if __name__ == "__main__":
    _selftest()
