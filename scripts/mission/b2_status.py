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

import keys  # noqa: E402
from pathlib import Path

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
# The host never reserves, releases, marks Flown or judges stale: those are the
# planner's, in web/lib/model.ts. Here live only the host's own rules, plus
# cards_for and change_survived, which both sides assert against
# fixtures/card-ledger.json. Pure functions over plain data.
# ---------------------------------------------------------------------------

EMPTY_LEDGER: dict = {"pool": [], "holdings": {}}


def cards_for(ledger: dict, spec_key: str) -> list[dict]:
    """The Cards a Spec holds, in flight order. Empty means no Reservation."""
    return sorted((h for h in ledger.get("holdings", {}).values() if h["spec_key"] == spec_key),
                  key=lambda h: h["flight"])


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


def change_survived(base: dict, new: dict, after: dict) -> bool:
    """Did our change to the Ledger survive what is in the store now? Only what
    we changed is checked -- the twin of changeSurvived in web/lib/missionRecords.ts."""
    for key in ("pool", "verified_at"):
        if base.get(key) != new.get(key) and after.get(key) != new.get(key):
            return False
    held_base, held_new, held_after = base.get("holdings", {}), new.get("holdings", {}), after.get("holdings", {})
    for card in set(held_base) | set(held_new):
        if held_base.get(card) != held_new.get(card) and held_after.get(card) != held_new.get(card):
            return False
    return True


def merge_verified(ledger: dict, at: str) -> dict:
    """Stamp when the host last checked the Ledger against the Controller."""
    return {**ledger, "verified_at": at}


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
    led = {"pool": ["A", "B"], "holdings": {"A": {"card": "A", "spec_key": "specs/s/d/k.json",
                                                  "flight": 1, "flights": 1, "reserved_at": "t0"}}}
    led = merge_written(led, {"A": "abc", "B": "def"}, "t7")
    assert led["holdings"]["A"]["written_at"] == "t7" and led["holdings"]["A"]["written_md5"] == "abc"
    assert "B" not in led["holdings"], "a Card with no holding is never invented by a write report"
    # A field the planner added and this host does not know -- mission_id -- is
    # carried through the host's own writes, never dropped (#152).
    tagged = {"pool": ["A"], "holdings": {"A": {"card": "A", "spec_key": "k", "flight": 1, "flights": 1,
                                                "reserved_at": "t", "mission_id": "m-1"}}}
    assert merge_written(tagged, {"A": "abc"}, "t9")["holdings"]["A"]["mission_id"] == "m-1"
    assert merge_verified(led, "t8")["verified_at"] == "t8"

    # 8. Drift: Ledger and Controller disagree. A Card the device was not asked about is not evidence.
    pooled = {"pool": ["A", "B", "C"], "holdings": {"A": {"spec_key": "a"}, "B": {"spec_key": "b"}}}
    assert ledger_drift(pooled, {"A": "a", "B": "x", "C": None}) == [{"card": "B", "expected": "b", "found": "x"}]
    assert ledger_drift(pooled, {}) == []

    _fixture_check()
    _change_survived_check()
    print("b2_status self-check: ok")


def _change_survived_check() -> None:
    base = {"pool": ["A", "B"], "holdings": {}}
    def hold(on, card, key):
        return {**on, "holdings": {**on["holdings"], card: {"card": card, "spec_key": key}}}
    ours = hold(base, "A", "ours.json")
    theirs = hold(base, "B", "theirs.json")
    both = hold(ours, "B", "theirs.json")
    assert not change_survived(base, ours, theirs), "an overwrite from before ours landed erased ours"
    assert change_survived(base, ours, both), "a later writer who kept ours is not a conflict"
    assert not change_survived(base, {**base, "pool": ["A"]}, base), "a pool change undone is lost"
    assert not change_survived(base, merge_verified(base, "t1"), base), "a verification stamp undone is lost"


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
