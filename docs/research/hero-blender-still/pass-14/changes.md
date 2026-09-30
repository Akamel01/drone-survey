# Pass 14: specular 0.375 single-dial bracket — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p14 (`~/hero3d/out/still-223/p14/`, fetched to
`hero3d-local/p14/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: pass 13 showed roughness dominates the brightness change, confounding
the specular bracket (p13 darkened MORE than p12 despite higher spec).

Hypothesis: specular 0.5 -> 0.375 with roughness held at hero 0.86 isolates
the single dial — a quarter less sky sheen narrows all three palette gaps
while leaving the island bright enough to hold the 4b ratios.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `fix_strata()` setting Specular IOR Level 0.375. No new assets.

## What moved (p7 -> p14; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p14 | verdict |
|---|---|---|---|---|
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #21201C, dE 8.17, gap 1.0 | narrowed, still out |
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #282926, dE 8.34, gap 1.0 | narrowed, still out |
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #201F1C, dE 17.29, gap 2.2 | worse |
| tall | 4b falloff_sat_D2_D1 | 0.362, in | 0.352 | BROKE (band 0.38-0.43) |
| wide | 4b falloff_sat_D2_D1 | 0.383, in | 0.375, in | held |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 4. DoD broken on tall 4b. Sheets read clean; island a touch darker.
VRAM: our-render peak 3009 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

Same shape as passes 12-13: palette narrows, tall 4b breaks first.
`scripts/hero/still.py` is restored to p7 state and p7 remains the baseline.

Learning (bracket closed): the specular series reads 0.5 (palette out, 4b in)
-> 0.375 (palette closer, tall 4b out) -> 0.25 (tall fixed, tall 4b out, wide
worse) -> 0.0 (wide fixed, 4b both out). No specular value fixes a palette
row while holding 4b: the island-brightness budget that the D2/D1 saturation
ratio needs conflicts with the darkness the palette targets want. The
specular dial is exhausted; the remaining untried direction is soil-only
tints (soil layers carry grav=0, so their tints touch no pebble pixel).

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p14/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
