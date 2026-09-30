# Pass 10: darker gravel Value — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p10 (`~/hero3d/out/still-223/p10/`, fetched to
`hero3d-local/p10/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall soil (#2D2D29 vs #1B1E24, gap 1.3) and tall pebble (#242320 vs
#212111, gap 1.1) both read brighter than target.

Hypothesis: cutting the gravel HUE_SAT Value (`pebble_hsv` V 0.35 -> 0.28)
darkens the gravel path in both framings — tall soil+pebble move toward
target, wide pebble's blue drops toward its target's B=16, and the move reads
in 4g Value rows without touching geometry, sky or cloud.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `K2["pebble_hsv"]` (1.3, 0.35) -> (1.3, 0.28). No new assets.

## What moved (p7 -> p10; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p10 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #2D2C29, dE 9.53, gap 1.2 | improved, still out |
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #232320, dE 9.02, gap 1.1 | flat |
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #222220, dE 17.65, gap 2.2 | worse (R/G fell away from target) |
| tall | 4b falloff_sat_D2_D1 | 0.362 | 0.368 | toward band [0.38, 0.43], good direction |
| wide | 4b falloff_sat_D2_D1 | 0.383 | 0.388 | at band edge, in |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 3. Gap sum 5.3 -> ~5.5. DoD intact. Sheets read clean.
VRAM: our-render peak 3009 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

One row narrowed (-0.6 dE, still out), one row widened (+0.8 dE): the Value
knob is coupled across framings with opposite signs — tall wants darker, wide
wants brighter R/G. `scripts/hero/still.py` is restored to p7 state and p7
remains the baseline.

Learning: the wide pebble target (#2D2C10) is brighter in R/G and darker in B
than ours — no darkening knob fixes it; it needs a blue-selective cut. Tall
soil answers to darkening (10.2 -> 9.5 dE), so a blue-channel-only tint retry
(pass 6 decoupled: leave R/G, cut B) may take both tall rows without the pass-6
soil-warming cost.

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p10/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
