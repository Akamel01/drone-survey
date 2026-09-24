# Proving-flight checklist — Rehearsal Field (#10, #20)

One page, on site. Settled plan per the latest #20 comment: 120 × 100 m
(1.2 ha), 90 m altitude, 85% forward / 75% side overlap, gimbal −80°, 98
photos, 2.23 m/s, ~8.7 min — one battery per variant, two variants total.
Fly-through starts the **north-west** corner; stop-at-point starts the
**south-east** corner — that's how you tell them apart on the map preview.

## Before leaving the shop

- [ ] `python3 scripts/mission/e2e_test.py` passes (planner and writer agree).
- [ ] Dispatch the **fly-through** Spec from the planner, then the
      **stop-at-point** Spec. Note the storage keys shown.
- [ ] Card space on the aircraft: ~196 photos total (both flights) at 50 MP
      JPEG, roughly 3.5 GB. Confirm free space well above that.
- [ ] Charge four batteries (two flights, one battery each, plus margin).

## In DJI Fly, before the first flight

- [ ] **Safety settings: Max Altitude → 120 m, Max Distance → 1000 m or off.**
      Both settings live in the app, are invisible to the planner, and
      previously suspended a flight mid-mission ("reached max flight
      distance" / "reached max flight altitude") with a perfectly valid
      mission file. Nothing in the pipeline checks these for you.
- [ ] Airspace check for this location. Not automatable — the one legal step
      nothing in the pipeline does.
- [ ] Compass calibrated away from steel; wind within limits for a sub-250 g
      aircraft.
- [ ] Return-to-home altitude set above the tallest thing on site.

## Camera, before each flight (the mission file cannot carry these)

- [ ] Single-shot stills, not video/burst/panorama. JPEG, not RAW.
- [ ] Exposure locked, manual. Shutter 1/1000 s or faster. ISO as low as the
      light allows. White balance locked to a preset — never auto.
- [ ] Histogram on.
- [ ] Test shots at altitude before starting the mission: exposure sane,
      horizon level, gimbal at −80°, GPS written into EXIF.
- [ ] **Do not set the gimbal by hand.** The mission carries −80° in its own
      actions. Confirm it holds on the first pass rather than setting it in
      the camera view — aiming at a point of interest silently overrides it.

## Loading

- [ ] Plug the Linux host into the Controller. Run
      `python3 scripts/mission/load.py --newest --yes` (or let the plugged-in
      trigger do it) for the **fly-through** Spec first.
- [ ] Read the printed sheet — it names the way finder card holding this
      flight. Open that card, close and reopen its waypoint editor so DJI
      Fly indexes the new file.
- [ ] Watch the photo counter on the first pass. **A flown grid with no
      photographs is the most expensive possible outcome.**
- [ ] After landing and swapping the battery, repeat Load for the
      **stop-at-point** Spec (it overwrites the same card) and fly it.

## Record during both flights

- [ ] Real flight time and battery consumed, against the predicted 8.7 min.
- [ ] Whether the aircraft actually stops at each point in the second flight,
      and how much slower it is than predicted.
- [ ] Anything DJI Fly says or does that wasn't predicted (a suspended
      mission, a refused action, an unexpected RTH).
- [ ] Keep photographs from the two flights in separate folders.

## Pass / fail, checked back at the shop

| Check | Pass |
|---|---|
| Photo count | 98 per flight. Short means the camera's shutter interval is slower than assumed and photos were dropped — the fly-through variant is the one at risk. |
| `GimbalPitchDegree` in every photo's XMP | ≈ −80° (±2°) |
| GPS in EXIF | present and non-zero on every photo |
| Ground spacing, measured geodesically between consecutive photo positions | within ~2% of the planned spacing (same check `make_mission.py`'s `verify()` runs before Load) |
| Coverage per battery | whole 1.2 ha area completed within one battery, no low-battery RTH cut the mission short |
| Aircraft executed `takePhoto`, held the gimbal tilt, and followed the planned path | confirmed by eye against the flight log / DJI Fly's own playback |
| No unplanned RTH or suspension | mission ran start to finish as loaded |

**What this settles, once both flights pass:** the fly-through vs
stop-at-point default (#30), and it unblocks the engine quality comparison
(#24), the placement thresholds (#8), and the splat gate calibration (#29) —
all of which need real photographs from this Site.
