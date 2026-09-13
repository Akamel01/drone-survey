# Status of #30 (mission planning Node) and #31 (battery-swap Captures) — 2026-09-13

Read against ADR 0016 (all revisions, especially the four dated 2026-09-13),
`docs/research/battery-swap-resume-2026.md`, and the code in `scripts/mission/`
and `web/`. Verified by running, before any change was made:

```
python3 scripts/mission/e2e_test.py       # all checks pass
python3 scripts/mission/load.py --selftest       # ok
python3 scripts/mission/push_to_rc.py --selftest # ok
python3 scripts/mission/collect.py --selftest    # ok
```

**Conclusion up front: both tickets are implemented in code.** No pure-code
gap of any substance was found. Two items are genuinely open, and both need a
decision the operator hasn't made yet, not a bug fix — they are recorded below
rather than built speculatively.

## #31 — Captures that pause for a battery swap and continue

Research settled the design question: DJI Fly has no breakpoint resume for
this aircraft (`docs/research/battery-swap-resume-2026.md`). The decision
recorded in ADR 0016 is a Site larger than one battery flies as **several
Missions**, cut at the end of a flight line, sharing one seam waypoint, one
Placeholder slot per part, operator swaps the battery and opens the next card
by hand.

| Requirement (ADR 0016 / ticket) | Where implemented |
|---|---|
| Split sized to battery endurance first, capped at 200 waypoints | `scripts/mission/make_mission.py:104-136` (`split_rows`), mirrored in `web/lib/mission.ts:146-182` (`splitPlan`) |
| Cut at end of a flight line, never mid-line | same functions — they iterate whole `rows`/rings, never slice one |
| Consecutive parts share a seam waypoint | `make_mission.py:130` (`cur = [cur[-1]]`) / `mission.ts:174` (`cur = 1`); proven by `e2e_test.py:224-228` ("part N and N+1 share the seam waypoint") |
| Each part named by Site, date and part | `make_mission.py:433-434,581` (`f"{spec['site']} {spec['date']}"`, `f"{args.name} part {i}"`) |
| Each part is its own Placeholder slot | `scripts/mission/load.py:52-63` (`cards()`, `assign()`) — part *i* → card `WAYFINDER i` |
| A Spec with more parts than calibrated cards is refused, not truncated | `load.py:58-63` (`assign`), proven by `load.py`'s `_selftest` (`more parts than cards was accepted` guard, `load.py:191-197`) |
| Operator told which card to open, before the Controller is plugged in | `web/components/SummaryBar.tsx:141-162` (`cardsFor`, shown on successful Dispatch); `load.py:226-232` prints the same sheet at Load time |
| Both fly-through and stop-at-point offered, operator picks | `spec.ts:10,62`, `Sidebar.tsx` turn-mode control, `make_mission.py --turn` |
| Camera interval caps speed above the blur budget | `make_mission.py:538-546`, `mission.ts:326-327`; both cap the requested speed by `spacing / interval_s` |
| Distance limit from take-off point is a *manual* check, since it lives in the app and can be switched off | Deliberate, not a gap: `Sidebar.tsx:330` shows `home_distance_m` with a tooltip telling the operator to check it against DJI Fly's own setting, because "that limit lives in the app and cannot be read from here" |

**Nothing left to implement for #31.** What remains is exactly what the
ticket's own first comment says remains: "where a cut is placed relative to
the take-off point, and what the real coverage per battery turns out to be"
— both are measurements from a flight, not code (see the checklist below,
which is #10/#20's job).

## #30 — Build the mission planning Node

The Node is the pair `web/` (planner, in the browser) + `scripts/mission/make_mission.py`
(writer, the single authority on the KMZ) + `scripts/mission/load.py` (puts a
built Spec's parts onto the Controller). ADR 0016's final, settled shape ("the
Node writes the KMZ itself") is what's built.

| Requirement | Where implemented |
|---|---|
| Own schema is the master copy, KMZ is build output, version-controlled | `web/lib/spec.ts` (`MissionSpec`), `make_mission.py:413-435` (`load_spec`) reads it, nothing hand-edits the KMZ |
| Altitude, never GSD | `spec.ts:57` (`altitude_m`), `make_mission.py --altitude`; no GSD input path exists anywhere |
| Latitude bug fixed — grid laid out in local metres, not Web Mercator | `make_mission.py:41-49` (`local_frame`, equirectangular about the centroid); `mission.ts:69-79` (`localFrame`), identical method |
| Waypoints mode, `takePhoto` at every position | `make_mission.py:278-285` (`placemark`, action `takePhoto`, trigger `reachPoint`) |
| Gimbal −80°, as an action (`gimbalRotate`/`gimbalEvenlyRotate`), not the per-waypoint field | `make_mission.py:205-237`; `waypointGimbalPitchAngle` left at 0 (`make_mission.py:288`), matching the dialect read off the Controller |
| KMZ dialect matches the RC2: two files, `uav.com` namespace, `parallel` groups, `goBack` on signal loss | `make_mission.py:191-202,341-378`; asserted by `e2e_test.py:202-212` |
| Validated against the aircraft's own limits (gimbal, speed) plus our rules (≤200 waypoints, ≤120 m altitude, geodesic spacing drift ≤2%) before Load | `make_mission.py:31-32` (`LIMITS`), `380-410` (`verify`); `load.py:66-79` (`build`) refuses to Load anything `verify` or the ceiling checks flagged |
| Photo spacing verified geodesically against the request, not assumed from the projection | `make_mission.py:394-400` (`verify`, measures `geodesic_m` between consecutive same-line waypoints and compares to `plan["fwd_spacing_m"]`) |
| Grid clipped to the area (not its bounding box), margin beyond the boundary is a passes count, not metres | `make_mission.py:169-180`, `mission.ts:361-370`; regression-tested by the triangle case in `e2e_test.py:356-361` |
| Oblique / orbit capture (ADR: "the generator covers nadir grids only… needs geometry of our own") | Since built: `make_mission.py:295-338` (`orbit_rings`), `mission.ts:221-307` (`orbitPreview`), full UI in `Sidebar.tsx` (mission-type toggle, subject/radius/rings/direction controls), covered by two `orbit_case()` runs in `e2e_test.py:365-369` |
| Planner and writer never disagree on what will fly | `scripts/mission/e2e_test.py` drives both from one Spec and diffs every figure (spacing, photo count, part count, path length, flight time, per-waypoint fields) each run |
| Dispatch: Spec leaves the browser only through a server-side function holding the storage credential | `web/app/api/dispatch/route.ts` (Node runtime, `DISPATCH_SECRET` header, B2 credentials never sent to the client) |
| Loader: WAYFINDER cards, `createTime` preserved, backup before write, read-back-or-roll-back | `scripts/mission/load.py` entire file, `scripts/mission/push_to_rc.py:110-197` (`read_create_time`, `with_create_time`, `pilot_visible_name`) |

**Nothing left to implement for #30 either**, with one open item recorded
below rather than built.

## Open items — deliberately not implemented

**DEM for sloped Sites** (item 6 of the original generator requirements,
carried over from before the "we write the KMZ ourselves" pivot, and never
mentioned again in any later ADR revision). Every Mission today writes
`executeHeightMode = relativeToStartPoint` (`make_mission.py:366`), so a
sloped Site would fly at the wrong height above ground partway across it.
**Not implemented**, because it isn't a fill-in-the-function fix: it needs a
DEM data source (which raster, how it's fetched, its licence) that hasn't
been decided, and inventing one now would be exactly the kind of speculative
schema growth the boundaries on this task rule out. No Site flown or planned
so far has meaningful slope, so nothing is blocked. Flag for the operator: a
decision on a DEM source is a prerequisite before a sloped Site is planned.

**Max-distance-from-home as a coded gate.** ADR 0016 says the Controller's
declared maximum altitude and distance should be checked before Load "since
nothing else can catch the conflict." Altitude *is* coded (120 m legal
ceiling, matches what the operator set in DJI Fly). Distance deliberately is
not: it's an app setting the operator can turn off entirely, so a hardcoded
constant would be wrong as often as right. The planner instead computes and
displays the true distance to the furthest waypoint
(`web/lib/mission.ts` `home_distance_m`, shown in `Sidebar.tsx:330` with a
tooltip naming this exact tradeoff) so the operator checks it against
whatever DJI Fly is actually set to. This is a design choice already made,
not a gap.

**A Spec whose part count exceeds the calibrated WAYFINDER cards (currently
5)** is refused at Load time (`load.py:58-63`), not at Dispatch time. The
planner has no visibility into `wayfinder_slots.json` (it lives on the Linux
host, not in the browser's reach) so it cannot warn earlier. ADR 0016 frames
the fixed assignment rule as "a reversible default… nothing in it is hard to
change," i.e. a known, accepted limitation rather than something the ticket
asked for. Left as is.

## What was implemented in this session

Nothing — the review above is the deliverable for #30/#31. All four existing
checks (`e2e_test.py`, and the three `--selftest`s) were run before any
investigation and pass unchanged; no code in `scripts/mission/` or `web/` was
modified.
