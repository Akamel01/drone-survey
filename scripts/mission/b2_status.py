#!/usr/bin/env python3
"""Report Collects and Loads to the cloud manifest the planner reads.

The manifest is one small JSON object at specs/_status/missions.json, keyed by
key: {collected_at, loaded_at, parts, cards: [{card, name, waypoints}]}. The
host is its only writer; the planner only reads. Uploads use a dedicated
status key (read specs/, write status/*) that collect.py/load.py take as
--status-config — never the read-only collect key, never the delivery key.

Network only, no Controller: importing this file cannot touch a mount.
"""

import datetime
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

STATUS_KEY = "specs/_status/missions.json"
# Underscore-prefixed inside specs/ on purpose: store keys are confined to the
# specs/ prefix, and collect.py's Spec pattern only matches three-segment
# site/date/file keys, so the manifest is invisible to Collect.


def utcnow() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def merge_collected(manifest: dict, keys: list[str], at: str) -> dict:
    """Stamp collected_at on newly Collected keys; never touch existing entries."""
    for key in keys:
        manifest.setdefault(key, {}).setdefault("collected_at", at)
    return manifest


def merge_loaded(manifest: dict, entries: list[tuple[str, list[tuple[str, dict]]]], at: str) -> dict:
    """Record one verified Load per Spec: loaded_at plus the exact cards."""
    for key, loaded in entries:
        manifest.setdefault(key, {}).update(
            {
                "loaded_at": at,
                "parts": len(loaded),
                "cards": [
                    {"card": card, "name": part["name"], "waypoints": part["waypoints"]}
                    for card, part in loaded
                ],
            }
        )
    return manifest


def download_manifest(api_url: str, download_url: str, bucket: str, token: str) -> dict:
    """The manifest so far; {} when the host has never reported (not an error)."""
    url = f"{download_url}/file/{bucket}/{urllib.parse.quote(STATUS_KEY, safe='/')}"
    req = urllib.request.Request(url, headers={"Authorization": token})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        sys.exit(f"manifest download failed: {e.code} {e.reason}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach B2: {e.reason}")


def upload_manifest(api_url: str, token: str, bucket_id: str, manifest: dict) -> None:
    body = json.dumps(manifest, indent=1, sort_keys=True).encode()
    req = urllib.request.Request(
        f"{api_url}/b2api/v2/b2_get_upload_url",
        data=json.dumps({"bucketId": bucket_id}).encode(),
        headers={"Authorization": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            up = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"manifest upload url failed: {e.code} {e.reason}")
    import hashlib

    req = urllib.request.Request(
        up["uploadUrl"],
        data=body,
        headers={
            "Authorization": up["authorizationToken"],
            "X-Bz-File-Name": urllib.parse.quote(STATUS_KEY, safe="/"),
            "Content-Type": "application/json",
            "X-Bz-Content-Sha1": hashlib.sha1(body).hexdigest(),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60):
            pass
    except urllib.error.HTTPError as e:
        sys.exit(f"manifest upload failed: {e.code} {e.reason}")


def _selftest() -> None:
    # 1. Collect stamps only new keys; a re-collect changes nothing.
    m: dict = {"a": {"collected_at": "t0"}}
    merge_collected(m, ["a", "b"], "t1")
    assert m == {"a": {"collected_at": "t0"}, "b": {"collected_at": "t1"}}, m

    # 2. A Load records per-mission cards exactly.
    m = {}
    merge_loaded(
        m,
        [("specs/f/2026-09-17/k.json", [("WAYFINDER 1", {"name": "F", "waypoints": 32})])],
        "t2",
    )
    assert m == {
        "specs/f/2026-09-17/k.json": {
            "loaded_at": "t2",
            "parts": 1,
            "cards": [{"card": "WAYFINDER 1", "name": "F", "waypoints": 32}],
        }
    }, m

    # 3. A Load never clobbers the collected_at underneath it.
    m = {"k": {"collected_at": "t0"}}
    merge_loaded(m, [("k", [])], "t2")
    assert m["k"]["collected_at"] == "t0", m

    print("b2_status self-check: ok")


if __name__ == "__main__":
    _selftest()
