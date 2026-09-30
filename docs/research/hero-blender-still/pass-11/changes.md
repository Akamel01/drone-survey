# Pass 11: blue-channel-only pebble tint — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p11 (`~/hero3d/out/still-223/p11/`, fetched to
`hero3d-local/p11/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall pebble #242320 vs #212111 (dE 9.03, gap 1.1) with tall soil
#2D2D29 vs #1B1E24 (gap 1.3) beside it. Pass 6's full olive tint fixed tall
pebble (9.0 -> 7.7 dE) but its R/G lift warmed tall soil (+0.8 dE) and pushed
the tall 4b edge out — so the fix direction is proven but the knob is coupled
in R/G.

Hypothesis: cutting only the MULTIPLY blue (`pebble_tint` B 0.30 -> 0.15,
R/G held at 0.80) moves tall pebble toward olive without the pass-6
soil-warming cost, because soil's excess is brightness, not blue (soil B 41
vs target 36 — a B cut helps slightly or not at all, but cannot warm it).

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `K2["pebble_tint"]` (0.80, 0.80, 0.30) -> (0.80, 0.80, 0.15).
No new assets.

## What moved (p7 -> p11; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p11 | verdict |
|---|---|---|---|---|
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #24231F, dE 8.3, gap 1.0 | narrowed, still out |
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #2D2D29, dE 10.17 | unmoved (as predicted — no warming) |
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #232320, dE 16.86 | unmoved (pass-6 precedent holds) |
| tall | 4b falloff_sat_D2_D1 | 0.362, gap 0.7 | 0.358, gap ~0.9 | drifted toward the edge, still in |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 3. Gap sum 5.3 -> ~5.2. DoD intact. Sheets read clean.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

Same outcome as pass 8 (tall pebble -0.7 dE, still out; 4b edge -0.004):
narrowing without fixing, at a small cost to a passing row's margin, is not
progress. `scripts/hero/still.py` is restored to p7 state and p7 remains the
baseline.

Learning: the B-cut effect saturates — MULTIPLY B 0.30 -> 0.15 buys exactly
one blue level (32 -> 31) while the olive targets need B 16-23. The gravel
base blue is already near its floor through this path; further blue must come
from the HSV side (hue rotation, untried) or from lighting, not from a deeper
MULTIPLY.

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.0-1.1 — MULTIPLY path exhausted; try hue-side

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p11/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
