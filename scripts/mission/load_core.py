"""The Load module: the Load decisions and the two seams. No file-system or
network access lives in this file, and its import graph is checked to prove it."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable, Mapping, Protocol, Sequence

import b2_status  # the pure Card Ledger functions (cards_for, ledger_drift,
                  # merge_written, merge_verified, change_survived) and its types
import keys      # SPEC_PREFIX, so spec_key() is byte-identical to today's


# --- errors -----------------------------------------------------------------

class LoadFailed(Exception):
    """A Load that stopped. The message says what was put back and what to do.

    Raised rather than exiting, so every way a Load can fail reaches the
    manifest and the planner's banner (#162). A bare exit reached only the cron
    log, which is how a locked Controller or a failed read-back went unseen.
    """


class LedgerUnreadable(Exception):
    """The Ledger could not be read, which is not the same as an empty one."""


class ControllerBusy(Exception):
    """Another Load holds the Controller. Replaces load.py:328's exit."""


class NotOnController(Exception):
    """A planned Card is not on the Controller. Replaces load.py:390's exit."""


class ControllerUnreadable(Exception):
    """The Controller's Missions could not be listed. Carries load.py:155's message."""


# --- the Controller seam ----------------------------------------------------

class Controller(Protocol):
    """Everything that touches the mounted RC2, over the live KMZ of each Card."""

    def present(self) -> bool:
        """mounted(MOUNT) — load.py:284-289. False for a missing storage dir and for EIO."""

    def mount(self) -> None:
        """remount(MOUNT) — load.py:301-309. Raises LoadFailed."""

    def hold(self) -> None:
        """controller_lock() — load.py:315-330. Raises ControllerBusy; keep the handle open."""

    def survey(self) -> list[tuple[int | None, str]]:
        """(createTime, slot GUID) per Placeholder, oldest first — load.py:160-179."""

    def present_guids(self) -> set[str]:
        """Directory names under waypoint/. Raises ControllerUnreadable with load.py:155's
        message when the listing fails."""

    def read(self, guid: str) -> bytes | None:
        """The live KMZ bytes, or None when that Card is not on the Controller."""

    def write(self, guid: str, source: Path) -> str:
        """unlink the live KMZ, write source in its place keeping the live createTime
        (load.py:395-400 + 409-410), and return the md5 of the bytes written."""

    def backup(self, guid: str, backups: Path) -> None:
        """Copy the live KMZ to backups/{guid}.kmz, if not already there (load.py:392-393)."""

    def restore(self, guid: str, backups: Path) -> None:
        """Put backups/{guid}.kmz back (load.py:339-340). OSError propagates."""


# --- the store seam ---------------------------------------------------------

class Store(Protocol):
    """The Card Ledger and the cloud manifest, over B2."""

    def fetch_ledger(self) -> dict:
        """The Card Ledger; raises LedgerUnreadable. load.py:1099-1116."""

    def publish_ledger(self, ledger: dict) -> None:
        """Write it back. Prints its own notices, never raises. load.py:1150-1163."""

    def report_drift(self, drift: list[dict]) -> None:
        """load.py:1206-1222 (prints the agree/reported line)."""

    def report_refusal(self, kind: str, spec_keys: list[str], reason: str) -> None:
        """load.py:1255-1269; the dedupe is gone from this method (see load.py)."""

    def report_overflow(self, spec_keys: list[str], needed: int, have: int) -> None:
        """load.py:1272-1293; `have` is now passed in."""

    def report_loaded(self, entries: list[tuple[str, list[tuple[str, dict]]]]) -> None:
        """load.py:1296-1316. Unchanged shape, still fed b2_status.merge_loaded parts."""


# --- data -------------------------------------------------------------------

@dataclass(frozen=True)
class Part:
    """One Mission the writer produced."""

    name: str
    waypoints: int
    source: Path                      # the writer report's "out"
    fields: Mapping[str, object] = field(default_factory=dict)   # path_length_m, problems, ...
    written_md5: str | None = None

    @classmethod
    def from_report(cls, report: Mapping[str, object]) -> "Part":
        """The writer's per-Mission report entry as a Part (make_mission.py:495-500)."""
        fields = {k: v for k, v in report.items() if k not in ("out", "name", "waypoints")}
        return cls(name=report["name"], waypoints=report["waypoints"],
                   source=Path(report["out"]), fields=fields)

    def manifest_fields(self) -> dict:
        """{**fields, "name", "waypoints"} — what b2_status.merge_loaded reads."""
        return {**self.fields, "name": self.name, "waypoints": self.waypoints}


@dataclass(frozen=True)
class Queue:
    """What one plug-in should Load, and the adoption decision (load.py:58-121)."""

    waiting: tuple[Path, ...]              # Specs to Load, in queue order
    adopted: tuple[Path, ...] | None       # None: a Loaded record existed.
                                           # set: it did not — adopt these, Load nothing.


@dataclass(frozen=True)
class Planned:
    """One part of a plan: which Spec's Mission goes into which Card."""

    spec: Path
    card: str
    guid: str
    part: Part


@dataclass(frozen=True)
class Plan:
    """One plug-in's decisions, made before anything is touched."""

    queue: tuple[Path, ...]                # every waiting Spec that held a Reservation
    parts: tuple[Planned, ...]             # one per Mission part, in queue order

    def by_spec(self) -> list[tuple[Path, list[tuple[str, Part]]]]:
        """(spec, [(card, part), ...]) groups, in queue order (load.py:1078-1085)."""
        groups: list[tuple[Path, list[tuple[str, Part]]]] = []
        for planned in self.parts:
            if groups and groups[-1][0] == planned.spec:
                groups[-1][1].append((planned.card, planned.part))
            else:
                groups.append((planned.spec, [(planned.card, planned.part)]))
        return groups


@dataclass(frozen=True)
class LoadResult:
    """What a verified Load put on the Controller."""

    loaded: tuple[Planned, ...]            # parts carry written_md5 from the read-back


# --- the operations the ticket names ----------------------------------------

def _tail(p: Path, specs_root: Path) -> str:
    """The path as the skip list writes it: under specs/, prefix dropped (load.py:104-112)."""
    try:
        t = p.relative_to(specs_root.parent).as_posix()
        if t.startswith(keys.SPEC_PREFIX):
            return t[len(keys.SPEC_PREFIX):]
        return t
    except Exception:
        return str(p)


def queue_specs(found: Sequence[Path], loaded: set[str] | None, skipped: set[str],
                specs_root: Path) -> Queue:
    """Every Collected Spec not yet Loaded and not withdrawn, in path order.

    load.py:58-121 without file access: the caller globs `specs_root`, parses
    the Loaded record into `loaded` (None when there is no record), and the
    skip list into `skipped`.

    Path order is Site, then date, then Dispatch stamp. The order no longer
    decides anything: each Spec goes into the Cards reserved for it at Dispatch
    (ADR 0022), and one plug-in Loads the whole queue or none of it.

    A lost record (`loaded=None`) Loads nothing (ADR 0017, #38): it adopts
    everything already there as Loaded and says so, rather than overwriting
    cards on a guess. The adopted Specs come back in `Queue.adopted` for the
    caller to write; nothing found means nothing to adopt.

    The host keeps no supersession rule of its own (ADR 0021): supersession is
    decided in the store, which puts a superseded Spec on the skip list just as
    Withdraw does, and whether a Spec may Load is decided by its Reservation.
    """
    found = tuple(sorted(found, key=lambda f: f.relative_to(specs_root).as_posix()))
    if not found:
        return Queue((), None)
    if loaded is None:
        return Queue((), found)
    waiting = tuple(f for f in found if str(f) not in loaded)
    if not skipped:
        return Queue(waiting, None)
    tails = set()
    for s in skipped:
        if isinstance(s, str) and s.startswith(keys.SPEC_PREFIX):
            tails.add(s.split(keys.SPEC_PREFIX, 1)[-1])
        else:
            tails.add(str(s))
    return Queue(tuple(f for f in waiting if _tail(f, specs_root) not in tails), None)


def split_reserved(queue: Sequence[Path], ledger: dict, specs_root: Path
                   ) -> tuple[tuple[Path, ...], tuple[Path, ...]]:
    """(Specs holding a Reservation, Specs without one), each in queue order
    (load.py:124-127)."""
    held = [s for s in queue if b2_status.cards_for(ledger, spec_key(s, specs_root))]
    return tuple(held), tuple(s for s in queue if s not in held)


def pool_drift(slots: Mapping[str, str], controller: Controller) -> list[str]:
    """Every way the Card pool no longer matches what was calibrated.

    A Card is a Placeholder Mission the operator made by hand, and the slot GUID
    is its identity — so a Placeholder deleted or remade since the calibration
    was written shows up here, a remade one as the disappearance of the GUID it
    used to have. The calibration is not trusted on its own: a Load into a Card
    that may no longer be what it was is the failure this detector exists to
    prevent (ADR 0022).

    A Placeholder the pool does not know about is **not** drift. The operator
    keeps far more Placeholders than are calibrated — 38 on the Controller
    against 5 calibrated — and calling those drift refused every Load (#118).

    A listing that fails is ControllerUnreadable, reported as the one change.
    """
    calibrated = {guid: name for name, guid in slots.items()}
    try:
        present = controller.present_guids()
    except ControllerUnreadable as e:
        return [str(e)]
    return [f"{calibrated[g]} ({g}) was calibrated but is no longer on the Controller"
            for g in sorted(calibrated) if g not in present]


def survey_disagrees(rows: Sequence[tuple[int | None, str]],
                     slots: Mapping[str, str]) -> list[str]:
    """Where creation order and the hand-calibrated names disagree.

    Empty means every Card calibrated by hand sits exactly where creation order
    predicts it, which is the only evidence that would let the rest be named
    the same way (load.py:182-195).
    """
    by_guid = {guid: name for name, guid in slots.items()}
    known = [(i, by_guid[guid]) for i, (_, guid) in enumerate(rows) if guid in by_guid]
    missing = [n for n in by_guid.values() if n not in [k for _, k in known]]
    problems = [f"{n} is calibrated but is not on the Controller" for n in sorted(missing)]
    problems += [f"{name} is {i + 1} in creation order, not {name.split()[-1]}"
                 for i, name in known if str(i + 1) != name.split()[-1]]
    return problems


def observe_cards(ledger: dict, slots: Mapping[str, str], controller: Controller
                  ) -> dict[str, str | None]:
    """What each Card the host has written actually holds now, in Ledger terms.

    The read-back the loader already performs is the evidence, and the md5 it
    recorded at Load is the check: a Card whose file still hashes to what was
    written holds that Spec, and anything else is reported as unknown rather
    than guessed at. Cards this host has never written are left out — the
    Controller was not asked about them, so they are evidence of nothing
    (load.py:234-255).
    """
    seen: dict[str, str | None] = {}
    for card, held in ledger.get("holdings", {}).items():
        if card not in slots or not held.get("written_md5"):
            continue
        data = controller.read(slots[card])
        if data is None:
            seen[card] = None
            continue
        digest = hashlib.md5(data).hexdigest()
        seen[card] = held["spec_key"] if digest == held["written_md5"] else f"unknown contents (md5 {digest})"
    return seen


def reserved_plan(entries: Sequence[tuple[Path, Sequence[Part]]], ledger: dict,
                  slots: Mapping[str, str], specs_root: Path) -> tuple[Planned, ...]:
    """(spec, card, slot GUID, part) for every part, taken from the Reservation.

    Cards come from the Ledger, never chosen fresh here: a Card was claimed when
    its Spec was Dispatched, and the host's job is to honour that claim. A Spec
    with no Reservation is refused by name rather than given a Card, because
    choosing one is exactly the defect ADR 0022 ends (load.py:198-231).
    """
    parts: list[Planned] = []
    for spec, group in entries:
        key = spec_key(spec, specs_root)
        held = b2_status.cards_for(ledger, key)
        if not held:
            raise b2_status.LedgerRefusal(
                f"no Card is reserved for {key}; nothing was touched. This Spec was Dispatched "
                f"before Cards were reserved at Dispatch, or the Card Ledger could not be read. "
                f"Withdraw it and Dispatch it again from the planner, which reserves a Card and "
                f"says so before you leave.")
        if len(held) != len(group):
            raise b2_status.LedgerRefusal(
                f"{key} reserved {len(held)} Card(s) at Dispatch but its plan makes {len(group)} "
                f"Mission(s); nothing was touched. The Spec and the Reservation disagree — "
                f"Withdraw it and Dispatch it again so the two are made from the same plan.")
        for holding, part in zip(held, group):
            card = holding["card"]
            if card not in slots:
                raise b2_status.LedgerRefusal(
                    f"{key} is reserved for {card}, which is not calibrated on this Controller; "
                    f"nothing was touched. Calibrate {card} into wayfinder_slots.json, or Withdraw "
                    f"the Spec and Dispatch it again against the calibrated pool.")
            parts.append(Planned(spec=spec, card=card, guid=slots[card], part=part))
    return tuple(parts)


def plan(entries: Sequence[tuple[Path, Sequence[Part]]], ledger: dict,
         slots: Mapping[str, str], controller: Controller, specs_root: Path) -> Plan:
    """Decide one plug-in Load, refusing before anything is touched.

    Order preserved from load_all (load.py:354-383), the writer already having
    run:
      1. queue overflow, whole queue vs the calibrated pool → b2_status.QueueOverflowError
      2. pool_drift → b2_status.LedgerRefusal ("the Card pool has changed ...")
      3. reserved_plan → b2_status.LedgerRefusal
      4. each planned Card present on the Controller → NotOnController (load.py:390 text)

    The "present" check is `controller.read(guid) is None`: a Placeholder
    directory whose KMZ is gone is not a Loadable Card (load.py:389 checks the
    KMZ file, not the directory).
    """
    total = sum(len(group) for _, group in entries)
    if total > len(slots):
        # A backstop, not the gate. Availability is decided at Dispatch now, and
        # a Spec that got this far already holds a Reservation (ADR 0022).
        waiting = ", ".join(spec.name for spec, _ in entries)
        raise b2_status.QueueOverflowError(
            f"{total} parts waiting ({waiting}) but only {len(slots)} way finder cards; "
            f"nothing was touched. Dispatch fewer missions or clear a card, then replug.")
    changed = pool_drift(slots, controller)
    if changed:
        raise b2_status.LedgerRefusal(
            "the Card pool has changed since it was calibrated; nothing was touched:\n  "
            + "\n  ".join(changed)
            + "\nRecalibrate the pool into wayfinder_slots.json before Loading again, so a Mission "
              "is never written into a Card that is no longer what it was.")
    parts = reserved_plan(entries, ledger, slots, specs_root)
    for planned in parts:
        if controller.read(planned.guid) is None:
            raise NotOnController(
                f"{planned.card} ({planned.guid}) is not on the Controller; is it plugged in and unlocked?")
    return Plan(queue=tuple(spec for spec, _ in entries), parts=parts)


def _restore(plan: Plan, controller: Controller, backups: Path) -> list[str]:
    """Put every planned Card back from its backup; the Cards that could not be."""
    lost = []
    for planned in plan.parts:
        try:
            controller.restore(planned.guid, backups)
        except OSError:
            lost.append(planned.card)
    return lost


def put_back(lost: Sequence[str], backups: Path) -> str:
    """load.py:346-351, verbatim."""
    if not lost:
        return f"Every card was put back as it was (backups in {backups})."
    return (f"{', '.join(lost)} could not be put back and may hold half a file: do not fly "
            f"{'it' if len(lost) == 1 else 'them'}. Plug the Controller back in; the Load runs again "
            f"from the start and rewrites {'it' if len(lost) == 1 else 'them'} (backups in {backups}).")


def apply(plan: Plan, controller: Controller, backups: Path) -> LoadResult:
    """Write every part, re-mount, read all back, roll back on any mismatch.

    The md5 controller.write returns is the expected hash; the bytes
    controller.read returns are the read-back, and None is a mismatch — never
    md5(None). A failed write or read puts every Card back and names it with
    put_back, both messages verbatim from load.py:417-422.
    """
    for planned in plan.parts:
        controller.backup(planned.guid, backups)
    try:
        expected = {planned.guid: controller.write(planned.guid, planned.part.source)
                    for planned in plan.parts}
        controller.mount()
        digests: dict[str, str] = {}
        bad = []
        for planned in plan.parts:
            data = controller.read(planned.guid)
            if data is None:
                bad.append(planned.card)
                continue
            digest = hashlib.md5(data).hexdigest()
            digests[planned.guid] = digest
            if digest != expected[planned.guid]:
                bad.append(planned.card)
    except (OSError, LoadFailed) as e:
        raise LoadFailed(f"The Controller stopped answering part-way through the Load ({e}). "
                         + put_back(_restore(plan, controller, backups), backups)) from e
    if bad:
        raise LoadFailed(f"What the Controller holds did not match what was written, for {', '.join(bad)}. "
                         + put_back(_restore(plan, controller, backups), backups)
                         + " Unplug and plug it in again to retry.")
    # The read-back is the evidence, so the hash it just proved is what goes
    # into the Ledger: a write is never reported that was not verified.
    loaded = tuple(replace(planned, part=replace(planned.part, written_md5=digests[planned.guid]))
                   for planned in plan.parts)
    return LoadResult(loaded=loaded)


def verify(ledger: dict, slots: Mapping[str, str], controller: Controller, now: str
           ) -> tuple[dict, list[dict]]:
    """Check the Ledger against the Controller at this plug-in and stamp
    verified_at; return it with the drift rows.

    Drift is reported and never corrected: the Ledger keeps saying what was
    planned, because the difference is the only evidence that a Card holds
    something else (ADR 0022). The caller prints the lines and puts them in the
    manifest (load.py:1192-1203).
    """
    drift = b2_status.ledger_drift(ledger, observe_cards(ledger, slots, controller))
    return b2_status.merge_verified(ledger, now), drift


def update(store: Store, change: Callable[[dict], dict], *, settle_s: float,
           sleep: Callable[[float], None], tries: int = 3) -> dict:
    """Apply change to the Ledger as it is now, write it only if it changed, and
    check the write survived.

    Re-read immediately before writing, as the planner does: a Load takes long
    enough for the operator to Dispatch in the middle of it, and writing back
    the copy read at the start would erase that Reservation. Then read back
    after a moment, because the store has no compare-and-swap: a planner write
    in flight when ours landed can overwrite it, and ours can overwrite theirs
    -- the planner checks its side the same way (#152, load.py:1122-1147).
    """
    # ponytail: narrows the race to the settle window; only a store with
    # compare-and-swap, or one writer, closes it.
    for _ in range(tries):
        base = store.fetch_ledger()
        changed = change(base)
        if changed == base:
            return changed
        store.publish_ledger(changed)
        if settle_s:
            sleep(settle_s)
        after = store.fetch_ledger()
        if b2_status.change_survived(base, changed, after):
            return after
    raise LedgerUnreadable("the Card Ledger kept changing while the host was writing it, "
                           "so its change could not be confirmed")


def publish_pool(store: Store, pool: Sequence[str], notify: Callable[[str], None], *,
                 settle_s: float, sleep: Callable[[float], None]) -> dict:
    """Put the calibrated Card names into the Ledger, so the planner can reserve.

    Nothing else writes the pool, and it is published on every run, before the
    queue is even looked at (load.py:875-899). `notify` is called only when the
    pool actually changed.
    """
    names = list(pool)
    was: list = []

    def with_pool(ledger: dict) -> dict:
        was[:] = ledger.get("pool") or []
        return ledger if ledger.get("pool") == names else {**ledger, "pool": names}

    ledger = update(store, with_pool, settle_s=settle_s, sleep=sleep)
    if was != names:
        notify(f"published the Card pool to the Ledger: {len(names)} Cards (was {len(was)})")
    return ledger


def stamp_verified(store: Store, verified: dict, notify: Callable[[str], None], *,
                   settle_s: float, sleep: Callable[[float], None]) -> None:
    """Carry this run's verified_at onto the Ledger as it is now (load.py:1166-1172)."""
    try:
        update(store, lambda fresh: {**fresh, "verified_at": verified["verified_at"]}
               if "verified_at" in verified else fresh, settle_s=settle_s, sleep=sleep)
    except LedgerUnreadable as e:
        notify(f"{e}; verified_at was not recorded")


def record_written(store: Store, verified: dict, written: Mapping[str, str], now: str,
                   notify: Callable[[str], None], *, settle_s: float,
                   sleep: Callable[[float], None]) -> None:
    """Record the Cards this Load proved, onto the Ledger as it is now.

    The Cards are already written and read back, so this is bookkeeping: loud
    when it fails, never fatal, and never a write-back of the copy read before
    the Load, which would erase a Reservation made while it ran
    (load.py:1175-1189).
    """
    try:
        update(store, lambda fresh: b2_status.merge_written(
            {**fresh, **({"verified_at": verified["verified_at"]} if "verified_at" in verified else {})},
            dict(written), now), settle_s=settle_s, sleep=sleep)
    except LedgerUnreadable as e:
        notify(f"{e}; the Cards were Loaded but the Ledger does not yet say so. The next plug-in "
               f"verifies them against the Controller.")


REPEAT_AFTER_S = 30 * 60  # load.py:1226


def refusal_is_news(last: dict | None, reason: str, now: float) -> bool:
    """Whether this refusal is worth another write to the store.

    Cron runs every minute while the Controller is plugged in, and a refusal
    that does not change -- a locked Controller, a Ledger that cannot be read --
    would otherwise spend a download and an upload every minute saying the same
    thing. Said again after half an hour, so a stale banner is refreshed
    (load.py:1229-1241 with the parsed record passed in; `last=None` means no
    record, which is news).
    """
    if last is None:
        return True
    return last.get("reason") != reason or now - float(last.get("at", 0)) > REPEAT_AFTER_S


def spec_key(spec: Path, specs_root: Path) -> str:
    """The cloud key for a Collected Spec: its path under ~/wayfinder/specs/.

    Path.resolve() is the one path-resolution call inherited from
    load.py:1070-1075; it is kept so the key is byte-identical.
    """
    try:
        return keys.SPEC_PREFIX + spec.resolve().relative_to(specs_root.resolve()).as_posix()
    except ValueError:
        return spec.name


def group_by_spec(loaded: Sequence[Planned]) -> list[tuple[Path, list[tuple[str, Part]]]]:
    """(spec, [(card, part), ...]) groups, in queue order (load.py:1078-1085)."""
    groups: list[tuple[Path, list[tuple[str, Part]]]] = []
    for planned in loaded:
        if groups and groups[-1][0] == planned.spec:
            groups[-1][1].append((planned.card, planned.part))
        else:
            groups.append((planned.spec, [(planned.card, planned.part)]))
    return groups
