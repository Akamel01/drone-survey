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

from __future__ import annotations

import datetime
import json
import sys

import keys  # noqa: E402
import b2  # noqa: E402  (one home for storage access)
from pathlib import Path

STATUS_KEY = keys.STATUS_KEY
LEDGER_KEY = keys.LEDGER_KEY
# Underscore-prefixed inside specs/ on purpose: store keys are confined to the
# specs/ prefix, and collect.py's Spec pattern only matches three-segment
# site/date/file keys, so the manifest is invisible to Collect.
NOTICE_KEY = "_notice"


class QueueOverflowError(Exception):
    """The waiting queue does not fit the way finder cards. Raised before any
    card is touched so the caller can report it and refuse atomically."""


class LedgerRefusal(Exception):
    """A Load the Card Ledger does not authorise: a Spec with no Reservation, a
    Reservation that does not match what the writer produced, or a Card pool
    that has changed since it was calibrated (ADR 0022).

    Raised before any card is touched, so the refusal is atomic. The message
    always states what the operator does next — a failure is never silent, and
    the host never falls back to choosing Cards itself, because that is the
    defect this exists to end.
    """


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


def merge_refusal(manifest: dict, kind: str, keys: list[str], reason: str, at: str) -> dict:
    """Record a refusal the Ledger caused: nothing was Loaded, the Controller is
    as it was, and the operator can see which Missions did not go and why.

    `reason` is the whole refusal, because every refusal already states what to
    do next — a failure is never silent, and never merely a code (ADR 0018).
    """
    manifest[NOTICE_KEY] = {"type": kind, "at": at, "waiting": keys, "reason": reason}
    return manifest


def merge_drift(manifest: dict, drift: list[dict], at: str) -> dict:
    """Record where the Ledger and the Controller disagree. Reported against the
    Load, never corrected: a difference here is the only evidence that a Card
    holds something other than what was planned (ADR 0022)."""
    if drift:
        manifest["_drift"] = {"at": at, "cards": drift}
    else:
        manifest.pop("_drift", None)
    return manifest


def clear_notice(manifest: dict) -> dict:
    """A successful Load retires any past refusal."""
    manifest.pop(NOTICE_KEY, None)
    return manifest


# ---------------------------------------------------------------------------
# The Card Ledger (ADR 0022)
#
# The Python twin of web/lib/model.ts. Same rules, same names, same shapes, and
# both sides assert against fixtures/card-ledger.json so they cannot drift.
# Pure functions over plain data: no mount, no network, no Controller.
# ---------------------------------------------------------------------------

EMPTY_LEDGER: dict = {"pool": [], "holdings": {}}


def card_unavailable(ledger: dict, card: str) -> str | None:
    """Why a Card cannot be reused, or None when it can.

    A Card is occupied by a Mission that has not been Flown. Withdrawing or
    superseding that Mission releases it, because what it holds is no longer
    current. The pool is what is calibrated, never what is hoped for.
    """
    if card not in ledger.get("pool", []):
        return "not calibrated"
    held = ledger.get("holdings", {}).get(card)
    if not held or held.get("flown_at"):
        return None
    return (f"holds an unflown Mission ({held['spec_key']}, "
            f"flight {held['flight']} of {held['flights']})")


def available_cards(ledger: dict) -> list[str]:
    return [c for c in ledger.get("pool", []) if card_unavailable(ledger, c) is None]


def reserve_cards(ledger: dict, needed: int) -> dict:
    """The outcome of asking for Cards at Dispatch: {"ok": True, "cards": [...]}
    or a refusal naming what is in the way. The planner does the reserving; the
    host holds this so both languages assert the same rule."""
    free = available_cards(ledger)
    if needed > len(free):
        blocking = [(c, card_unavailable(ledger, c)) for c in ledger.get("pool", [])]
        blocking = [(c, why) for c, why in blocking if why is not None]
        reason = (f"no Cards are calibrated; {needed} needed" if not blocking else
                  f"{needed} Cards needed, {len(free)} free. " +
                  "; ".join(f"{c}: {why}" for c, why in blocking))
        return {"ok": False, "reason": reason, "available": len(free), "needed": needed}
    return {"ok": True, "cards": free[:needed]}


def with_reservation(ledger: dict, cards: list[str], spec_key: str, reserved_at: str) -> dict:
    """Claim Cards for a Spec's flights. Returns a new Ledger; never mutates."""
    holdings = dict(ledger.get("holdings", {}))
    for i, card in enumerate(cards):
        holdings[card] = {"card": card, "spec_key": spec_key,
                          "flight": i + 1, "flights": len(cards), "reserved_at": reserved_at}
    return {**ledger, "holdings": holdings}


def with_release(ledger: dict, spec_key: str) -> dict:
    """Give back every Card held for a Spec — what Withdrawn and Superseded do.
    A Flown holding is the record of what was flown and is left alone."""
    holdings = {c: h for c, h in ledger.get("holdings", {}).items()
                if not (h["spec_key"] == spec_key and not h.get("flown_at"))}
    return {**ledger, "holdings": holdings}


def cards_for(ledger: dict, spec_key: str) -> list[dict]:
    """The Cards a Spec holds, in flight order. Empty means no Reservation."""
    return sorted((h for h in ledger.get("holdings", {}).values() if h["spec_key"] == spec_key),
                  key=lambda h: h["flight"])


def stale_cards(ledger: dict, live_spec_keys: set[str]) -> list[dict]:
    """A Card holding a Mission that is no longer current. The Controller cannot
    report this — its own labels are frozen at creation (ADR 0016)."""
    return [h for h in ledger.get("holdings", {}).values()
            if h.get("written_at") and not h.get("flown_at") and h["spec_key"] not in live_spec_keys]


def ledger_drift(ledger: dict, on_device: dict) -> list[dict]:
    """Where the Ledger and the Controller disagree. Reported, never quietly
    corrected. A Card the device was not asked about is not evidence."""
    drift = []
    for card in ledger.get("pool", []):
        if card not in on_device:
            continue
        expected = (ledger.get("holdings", {}).get(card) or {}).get("spec_key")
        found = on_device[card]
        if expected != found:
            drift.append({"card": card, "expected": expected, "found": found})
    return drift


def merge_written(ledger: dict, written: dict, at: str) -> dict:
    """Stamp written_at on each holding the host verified by read-back.

    `written` is {card: md5 of the file now on the Controller}. The md5 is what
    lets the next plug-in say whether a Card still holds what was written: a
    Load is only reported once its read-back has already matched.
    """
    holdings = dict(ledger.get("holdings", {}))
    for card, digest in written.items():
        if card not in holdings:
            continue
        holdings[card] = {**holdings[card], "written_at": at, "written_md5": digest}
    return {**ledger, "holdings": holdings}


def merge_verified(ledger: dict, at: str) -> dict:
    """Stamp when the host last checked the Ledger against the Controller."""
    return {**ledger, "verified_at": at}


def download_ledger(download_url: str, bucket: str, token: str) -> dict:
    """The Ledger so far; an empty one when the host has never written it.

    An empty Ledger is not a licence to choose Cards: every Spec then has no
    Reservation and is refused by name, which is the point (ADR 0022).
    """
    try:
        found = json.loads(b2.download(download_url, bucket, LEDGER_KEY, token))
    except FileNotFoundError:
        return dict(EMPTY_LEDGER)
    return {"pool": found.get("pool", []), "holdings": found.get("holdings", {}),
            **({"verified_at": found["verified_at"]} if "verified_at" in found else {})}


def upload_ledger(api_url: str, token: str, bucket_id: str, ledger: dict) -> None:
    b2.upload(api_url, token, bucket_id, LEDGER_KEY,
              json.dumps(ledger, indent=1, sort_keys=True).encode())


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
          [("way finder 1", {"name": "F", "waypoints": 32, "path_length_m": 828})])],
        "t2",
    )
    assert m == {
        "specs/f/2026-09-17/k.json": {
            "loaded_at": "t2",
            "parts": 1,
            "cards": [{"card": "way finder 1", "name": "F", "waypoints": 32, "path_length_m": 828}],
        }
    }, m

    # 2b. A part from a writer that reported no distance still records a card.
    m = {}
    merge_loaded(m, [("k", [("way finder 1", {"name": "F", "waypoints": 32})])], "t2")
    assert m["k"]["cards"] == [{"card": "way finder 1", "name": "F", "waypoints": 32}], m

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

    # 5. A Ledger refusal is recorded like any other: what did not go, and what
    #    to do about it. A later success retires it.
    m = {}
    merge_refusal(m, "no-reservation", ["k"], "no Card is reserved for k; Dispatch it again.", "t4")
    assert m["_notice"]["type"] == "no-reservation" and "Dispatch" in m["_notice"]["reason"], m
    clear_notice(m)
    assert "_notice" not in m, m

    # 6. Drift is recorded while it lasts and cleared when it stops. Recorded,
    #    never corrected: the Ledger keeps saying what was planned.
    m = {}
    merge_drift(m, [{"card": "way finder 2", "expected": "a", "found": "b"}], "t5")
    assert m["_drift"]["cards"][0]["card"] == "way finder 2", m
    merge_drift(m, [], "t6")
    assert "_drift" not in m, m

    # 7. written_at is only ever stamped on a Card the Ledger already holds, and
    #    carries the md5 the read-back proved, so the next plug-in can check it.
    led = with_reservation({"pool": ["A", "B"], "holdings": {}}, ["A"], "specs/s/d/k.json", "t0")
    led = merge_written(led, {"A": "abc", "B": "def"}, "t7")
    assert led["holdings"]["A"]["written_at"] == "t7" and led["holdings"]["A"]["written_md5"] == "abc"
    assert "B" not in led["holdings"], "a Card with no holding is never invented by a write report"
    assert merge_verified(led, "t8")["verified_at"] == "t8"

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
