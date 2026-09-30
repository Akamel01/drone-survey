# Pass 17: rugged strata displacement — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p17 (`~/hero3d/out/still-223/p17/`, fetched to
`hero3d-local/p17/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap (visual, read the sheets): the hero's strata are rugged uneven courses;
ours read as flat cake layers. Texture-side palette knobs are exhausted
(passes 6-16), so this pass turns to modelling.

Hypothesis: raising mat_strata displacement 0.12 -> 0.20 roughens the cut
faces into uneven courses. Displacement is surface relief, so the silhouette
and S2 bbox should hold, and medians should barely move — this pass is scored
on the visual read plus DoD intactness.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `K2["strata_disp"]` 0.12 -> 0.20. No new assets.

## What moved (p7 -> p17)

| framing | row | p7 | p17 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2D2D29 | #2C2B28 | one level, flat |
| wide | 4g soil median | #302F2A | #2E2E2A | one level, flat, still in |
| tall/wide | 4g pebble median | #242320 / #232320 | #242320 / #232220 | unmoved |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.363 / 0.384 | unmoved |
| tall/wide | 4b contrast D1 | 15.15 / 11.97 | 15.15 / 11.98 | unmoved |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.14 / 3.07 | moved, still in |
| 4a / 4i / S2 | — | — | identical, PASS both | intact |

Rows out: 3 -> 3. DoD intact. Visual read: the courses still present as flat
cake layers at frame scale — no ruggedness gain visible on the sheets.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

No measured movement and no visible ruggedness gain: the displacement texture
amplitude at this scale does not read as uneven courses. `scripts/hero/still.py`
is restored to p7 state and p7 remains the baseline.

Learning: surface-relief magnitude is not what makes the hero's strata read
rugged — its courses vary in thickness/protrusion per layer (our LAYERS prot
is a uniform 0.015 on all three pebble bands). Next: pebble-course protrusion
per layer, which casts real crevice shadows.

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p17/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
