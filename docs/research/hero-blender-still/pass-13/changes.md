# Pass 13: half specular on strata — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p13 (`~/hero3d/out/still-223/p13/`, fetched to
`hero3d-local/p13/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: pass 12 zeroed the strata specular and fixed the wide pebble outright
(16.86 -> 6.77 dE) but broke 4b both framings by darkening the island.

Hypothesis: specular 0.5 -> 0.25 (roughness held at hero 0.86) lands between:
the olive albedo partly shows, the island stays bright enough to hold the 4b
saturation ratios.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `fix_strata()` setting Specular IOR Level 0.25 (roughness
untouched). No new assets.

## What moved (p7 -> p13; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p13 | verdict |
|---|---|---|---|---|
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #1D1C17, dE 7.68, gap 1.0 | FIXED (barely) |
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #242522, dE 7.33, gap 0.9 | FIXED |
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #1C1B18, dE 18.01, gap 2.3 | worse (over-darkened) |
| tall | 4b falloff_sat_D2_D1 | 0.362, in | 0.339 | BROKE (band 0.38-0.43) |
| wide | 4b falloff_sat_D2_D1 | 0.383, in | 0.363, in | held |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.85 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 2, but one of the two is the tall 4b DoD row, and the wide
pebble worsened. DoD broken. Sheets read clean; island darker.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

Two fixes against one broken DoD row plus one worsened target row is not a
baseline: every later pass would build on a broken DoD. `scripts/hero/still.py`
is restored to p7 state and p7 remains the baseline.

Learning: the specular response is steep and framing-asymmetric — spec 0.0
fixes wide and breaks 4b both; spec 0.25 fixes tall, breaks tall 4b, and
over-darkens wide. The island-brightness budget that 4b needs conflicts with
the darkness the palette targets want: a specular-only bracket cannot satisfy
both. Note p13 darkened more than p12 despite higher spec — roughness 0.86
vs 1.0 dominates the brightness change, so any retry must move ONE of the two
dials, not both. Next: spec 0.375 at roughness 0.86 (single-dial bracket).

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p13/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
