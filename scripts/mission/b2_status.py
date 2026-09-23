#!/usr/bin/env python3
"""Report Collects and Loads to the cloud manifest the planner reads.

The manifest is one small JSON object at specs/_status/missions.json, keyed by
key: {collected_at, loaded_at, parts, cards: [{card, name, waypoints,
path_length_m}]}. The host is its only writer; the planner only reads, and
compares those figures with what it predicted before the Load (#128). Uploads
use a dedicated status key (read specs/, write status/*) that collect.py and
load.py take as --status-config — never the read-only collect key, never the
delivery key.

Network only, no Controller: importing this file cannot touch a mount.
"""

import datetime
import json
import sys

import keys  # noqa: E402
import b2  # noqa: E402  (one home for storage access)
from pathlib import Path

STATUS_KEY = keys.STATUS_KEY
# Underscore-prefixed inside specs/ on purpose: store keys are confined to the
# specs/ prefix, and collect.py's Spec pattern only matches three-segment
# site/date/file keys, so the manifest is invisible to Collect.
NOTICE_KEY = "_notice"


class QueueOverflowError(Exception):
    """The waiting queue does not fit the WAYFINDER cards. Raised before any
    card is touched so the caller can report it and refuse atomically."""


def utcnow() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def merge_collected(manifest: dict, keys: list[str], at: str) -> dict:
    """Stamp collected_at on newly Collected keys; never touch existing entries.

    Also ensure additive, forward-compatible metadata exists for future
    host Web/JOIN logic: a Collected entry may carry `parts` and `cards` in
    the manifest. These are currently populated at Load time, but we stamp
    them here with sane defaults so the consumer can rely on their presence
    even before any Load has occurred.
    """
    for key in keys:
        ent = manifest.setdefault(key, {})
        ent.setdefault("collected_at", at)
        # Additive defaults for future host join logic (no impact if already set)
        ent.setdefault("parts", 0)
        ent.setdefault("cards", [])
    return manifest


def merge_loaded(manifest: dict, entries: list[tuple[str, list[tuple[str, dict]]]], at: str) -> dict:
    """Record one verified Load per Spec: loaded_at plus the exact cards."""
    for key, loaded in entries:
        manifest.setdefault(key, {}).update(
            {
                "loaded_at": at,
                "parts": len(loaded),
                # path_length_m is the writer's own measurement of the file it
                # wrote, under the same name summaries.json uses for the
                # planner's prediction, so the two can be compared directly.
                # The Controller's own card figures are frozen at Placeholder
                # creation (ADR 0016), so this is the only distance the
                # operator can trust.
                "cards": [
                    {"card": card, "name": part["name"], "waypoints": part["waypoints"],
                     **({"path_length_m": part["path_length_m"]} if "path_length_m" in part else {})}
                    for card, part in loaded
                ],
            }
        )
    return manifest


def merge_overflow(manifest: dict, keys: list[str], needed: int, have: int, at: str) -> dict:
    """Record an atomic refusal: nothing was Loaded, the RC is as it was, and
    the operator can see which missions did not fit and what to do."""
    manifest[NOTICE_KEY] = {
        "type": "overflow",
        "at": at,
        "waiting": keys,
        "parts_needed": needed,
        "cards_have": have,
        "action": "Dispatch fewer missions or clear a card, then replug the Controller.",
    }
    return manifest


def clear_notice(manifest: dict) -> dict:
    """A successful Load retires any past refusal."""
    manifest.pop(NOTICE_KEY, None)
    return manifest


def download_manifest(api_url: str, download_url: str, bucket: str, token: str) -> dict:
    """The manifest so far; {} when the host has never reported (not an error)."""
    try:
        return json.loads(b2.download(download_url, bucket, STATUS_KEY, token))
    except FileNotFoundError:
        return {}


def upload_manifest(api_url: str, token: str, bucket_id: str, manifest: dict) -> None:
    body = json.dumps(manifest, indent=1, sort_keys=True).encode()
    b2.upload(api_url, token, bucket_id, STATUS_KEY, body)


def _selftest() -> None:
    # 1. Collect stamps only new keys; a re-collect changes nothing.
    m: dict = {"a": {"collected_at": "t0"}}
    merge_collected(m, ["a", "b"], "t1")
    # New entries get defaults for additive metadata; existing entries retain their
    # original collected_at timestamp.
    assert m == {
        "a": {"collected_at": "t0", "parts": 0, "cards": []},
        "b": {"collected_at": "t1", "parts": 0, "cards": []},
    }, m

    # 2. A Load records per-mission cards exactly.
    m = {}
    merge_loaded(
        m,
        [("specs/f/2026-09-17/k.json",
          [("WAYFINDER 1", {"name": "F", "waypoints": 32, "path_length_m": 828})])],
        "t2",
    )
    assert m == {
        "specs/f/2026-09-17/k.json": {
            "loaded_at": "t2",
            "parts": 1,
            "cards": [{"card": "WAYFINDER 1", "name": "F", "waypoints": 32, "path_length_m": 828}],
        }
    }, m

    # 2b. A part from a writer that reported no distance still records a card.
    m = {}
    merge_loaded(m, [("k", [("WAYFINDER 1", {"name": "F", "waypoints": 32})])], "t2")
    assert m["k"]["cards"] == [{"card": "WAYFINDER 1", "name": "F", "waypoints": 32}], m

    # 3. A Load never clobbers the collected_at underneath it.
    m = {"k": {"collected_at": "t0"}}
    merge_loaded(m, [("k", [])], "t2")
    assert m["k"]["collected_at"] == "t0", m

    # 4. Overflow records the refusal; a later success clears it.
    m = {}
    merge_overflow(m, ["a", "b"], 7, 5, "t3")
    assert m["_notice"]["type"] == "overflow" and m["_notice"]["waiting"] == ["a", "b"], m
    clear_notice(m)
    assert "_notice" not in m, m

    _fixture_check()
    print("b2_status self-check: ok")


def _fixture_check() -> None:
    """The committed fixture is the cross-language contract for the record shapes:
    if this side and the web side ever disagree, one of the two checks fails."""
    import json
    from pathlib import Path

    # Deployed to the host as a flat directory rather than a checkout, so the
    # fixture is genuinely absent there. Skipping loudly beats failing the whole
    # self-check: the web side asserts the same shapes and only runs in a
    # checkout, so a disagreement between the two is still caught.
    fixture_path = Path(__file__).resolve().parents[2] / "fixtures" / "store-records.json"
    if not fixture_path.is_file():
        print(f"record-shape fixture absent ({fixture_path}); that check skipped")
        return
    fixture = json.loads(fixture_path.read_text())
    key = next(iter(fixture["manifest"]))
    merged = merge_collected(json.loads(json.dumps(fixture["manifest"])),
                             ["specs/new/2026-09-17/20260917T100000Z.json"], "2026-09-17T10:00:00Z")
    assert merged["specs/new/2026-09-17/20260917T100000Z.json"]["collected_at"] == "2026-09-17T10:00:00Z"
    # The fixture's own values are the contract: merging must carry them through
    # rather than replace them with something this test wrote itself.
    original = fixture["manifest"][key]
    assert merged[key]["cards"] == original["cards"], merged[key]["cards"]
    assert merged[key]["parts"] == original["parts"]
    assert original["collected_at"] and original["loaded_at"]
    for k, v in fixture["skip_list"].items():
        assert isinstance(k, str) and isinstance(v.get("withdrawn_at"), str)
    draft = fixture["draft"]
    assert draft["spec"]["site"] and draft["updated_at"]
    print("b2_status fixture: ok")


if __name__ == "__main__":
    _selftest()
