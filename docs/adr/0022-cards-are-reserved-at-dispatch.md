# A Card is reserved at Dispatch, and a Ledger records what each one holds

The loader chose Cards like this:

```python
free = cards()
```

Every Load began at the first Card. "Free" meant unused *within that one run* —
not free of a Mission the operator had not yet flown. So Loading three Missions,
flying none, and Dispatching a fourth the next day overwrote the first. The
overflow check compared the parts waiting against the *total* number of Cards,
never the available number.

The system had no notion of Card occupancy anywhere. The planner's predicted
Card was computed from the waiting queue alone, which is why the status screen
showed one Mission heading for WAYFINDER 1, a second for WAYFINDER 2, and a
third for WAYFINDER 1 and 2 — three Missions, two Cards, no contradiction
detected.

The operator found this by reading the screen, not from a failure. It had not
bitten yet only because no two Missions had been outstanding at once.

## Decision

**A Card is reserved when a Spec is Dispatched, not when the host Loads it.**
The Card stops being a prediction and becomes a fact: the screen can name it
without hedging, and — the point — a Dispatch that cannot be satisfied is
refused **at the planner, while the operator can still do something about it**,
rather than at a plug-in they may be hundreds of kilometres from home for.

**A Card is occupied until its Mission is Flown**, or until that Mission is
Withdrawn or Superseded, which release it because what it holds is no longer
current. An explicit release exists as well, because inference will sometimes be
wrong and the operator must never be stuck.

**When no Card is available, the Dispatch is refused.** Not "overwrite the
oldest" — that is the defect above promoted to a policy. Not "ask which to
release" — the Load runs unattended on a cron with nobody watching.

**The Card Ledger lives in the store**, written by the host that Loads, so the
planner can read it and answer at Dispatch time. It is **checked against the
Controller at each plug-in**: the host already reads every Card back to verify a
Load, so the evidence exists and was simply never recorded. A Card whose
contents disagree with the Ledger is reported, never quietly corrected.

**A reservation never expires.** One older than a few days is flagged as
probably forgotten. Expiry would release a Card silently, and the operator would
plug in expecting their Mission and find another in its place — the exact class
of failure this decision exists to end.

**A Card holding a Withdrawn or Superseded Mission is stale, and stale is an
alarm.** The Controller cannot tell the operator this: ADR 0016 measured that a
Card's displayed name, distance and point count are frozen at its creation, so a
62-waypoint Mission still read "900m(5)". The planner is the only thing that can
say *this Card holds a Mission that is no longer current, do not fly it*.

## Consequences

**All 34 Cards must be calibrated before this ships** (#118). Only five are
mapped to their device folders today, and reserving at Dispatch means a Card is
held from Dispatch rather than from Load — so a five-Card pool binds much
sooner. The loader must also detect that the pool has changed rather than
trusting the file, which is cheap to build alongside the Ledger and expensive to
retrofit.

**A mismatch between what was planned and what was written blocks readiness.**
It is the only detector for flying the wrong Mission, because the Controller
cannot be asked. A grey note on a row is how that gets missed; it must withhold
the "open WAYFINDER 2" affirmation instead.

**#134 stops mattering.** Two orderings disagreed about which Mission Loads
first — the host sorts by path, the planner numbered by stamp. With Cards
reserved at Dispatch, the Card no longer depends on queue position at all.

**A Spec occupies as many Cards as it has Missions.** `CONTEXT.md` defines a
Mission as what the aircraft executes on one flight, so a Site too large for one
battery is several Missions and several Cards. The screen names them as flights
— "Flight 1 of 2, WAYFINDER 1" — with the reason stated once, because the Card
is where to find it and the flight is what to do.

**This is worth testing before it is trusted.** One defect of this shape means
the class was never tested at all; #152 is that stress test, and it is scoped
against this model rather than the one being replaced.

## Amended 2026-09-24: what the field showed

**The Controller can be asked, once, inside a Card.** The list's name, distance
and point count are frozen at a Card's creation, but the point count shown
inside an opened Card is the file's own. The operator confirmed it on the RC2,
and calibration (#118) was done by reading it. So a Loaded row now names the
count its Card must show — "Open way finder 1. Check it shows 184 points" —
and says not to fly if it differs.

**That is the answer to #155, renaming a Card.** A Placeholder keeps its folder
when renamed, so a rename or a swap passes every check the host can make. The
count checked inside the Card, at the moment of flying, catches it every flight.
Recalibrating is `calibrate.py`, about ten minutes. A re-declaration screen and
statistical detection were considered and not built: the count check covers
both, at the point where the mistake would matter. Its known ceiling is two
swapped Cards holding Missions with the same point count.

**The host keeps no supersession rule of its own** (#161). It used to Load only
the newest Spec per Site and date, which disagreed with the planner about two
named Missions on one day, and it refused the whole Load for any Spec without a
Reservation. It now Loads exactly the Specs that hold one; the rest are set
aside by name. An unreadable Ledger is refused, never read as empty, because
publishing onto an empty copy erased every Reservation.
