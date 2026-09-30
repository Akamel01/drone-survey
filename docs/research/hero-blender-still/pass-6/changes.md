# Pass 6: olive pebble tint — tried, measured, REVERTED

Base: pass-5 p5b (`~/hero3d/out/still-223/p5b/` on akamel-linux), 4 rows out.
This pass's render: p6 (`~/hero3d/out/still-223/p6/`, fetched to `hero3d-local/p6/`
— git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: pass 5's thicker pebble courses read neutral grey (wide #232320 vs #2D2C10,
gap 2.1 — the largest; tall #242320 vs #212111, gap 1.1) while both targets are
dark olive (low blue, warm R/G).

Hypothesis: changing `pebble_tint` (the MULTIPLY on the gravel path in
`island_palette`) from (0.80, 0.80, 0.30) to (0.95, 0.93, 0.15) moves the
wide + tall pebble medians toward #2D2C10 / #212111 because halving the blue
multiply and lifting R/G shifts the gravel hue toward olive without touching
geometry, sky, or basalt — so S2, 4a, 4d and 4i cannot move.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `K2["pebble_tint"]` (0.80, 0.80, 0.30) -> (0.95, 0.93, 0.15).
No new assets (procedural knob only — nothing to source or licence).

## What moved (p5b -> p6, gaps.py normalised gap/tol)

| framing | row | p5b | p6 | verdict |
|---|---|---|---|---|
| tall | 4g pebble median | #242320, 9.03, gap 1.1 | #25241F, 7.73, in | FIXED |
| wide | 4g pebble median | #232320, 16.86, gap 2.1 | #242320, 16.79, gap 2.1 | unmoved |
| tall | 4g soil median | #2D2D29, 10.17, gap 1.3 | #2E2E29, 10.95, gap 1.4 | worse (+0.8 dE) |
| tall | 4b falloff_sat_D2_D1 | 0.362, gap 0.7, in | 0.353, gap 1.1 | BROKE (band 0.380-0.430) |
| wide | 4h dark area | 15.44 %, gap 1.3 | 15.44 %, gap 1.3 | unmoved |

Rows out: 4 -> 4. Gap sum: 5.8 -> 5.9. DoD intact (S2 PASS both framings,
4d p1 3.07 / 3.79, all 4a rows in, 4i band 85.78 / 83.38 %H in).
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

The knob is coupled: it fixes tall pebble but the same tint path warms tall
soil (+0.8 dE) and shifts the tall D2 saturation ratio off its band edge
(0.362 -> 0.353 vs 0.380 lo — marginal-in to out), while wide pebble does not
respond at all (wide framing's flatter light/exposure washes the tint shift
out). One row fixed, one row broken, net gap sum worse: not progress, so
`scripts/hero/still.py` is restored to p5b state and p5b remains the baseline.
A reverted pass still counts as the intentional pass.

Learning for a retry: tall pebble answers to olive tint (9.0 -> 7.7 dE), so
pair it with a decoupled compensator (e.g. a pebble-only mask treatment that
leaves the soil/D2 path alone) instead of the shared gravel MULTIPLY; wide
pebble needs its own approach — likely exposure-side, not tint-side.

## Next ranked gaps (baseline p5b, unchanged)

1. wide 4g pebble median, gap 2.1 — needs a wide-specific approach (see above)
2. tall 4g soil median, gap 1.3
3. wide 4h dark area 15.4 % vs 12.3 +-20 %, gap 1.3
4. tall 4g pebble median, gap 1.1 — tint direction proven, retry decoupled

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders — asset/modelling work, not parameter passes.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p6/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 28G free. This Mac rendered nothing (Blender never ran
here); review ran Mac-side via still_review.py + pinned measure.py.
