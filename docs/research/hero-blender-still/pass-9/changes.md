# Pass 9: rugged ledges for strata shading — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p9 (`~/hero3d/out/still-223/p9/`, fetched to `hero3d-local/p9/`
— git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall soil (#2D2D29 vs #1B1E24, gap 1.3), tall pebble (#242320 vs #212111,
gap 1.1) and wide pebble (#232320 vs #2D2C10, gap 2.1) all read brighter than
target. Passes 6 and 8 proved palette knobs do not reach the wide framing.

Hypothesis: raising `ledge_scale` 2.0 -> 2.6 deepens ledge self-shadowing, so
the strata medians darken toward target in both framings through shading, not
palette — turf (own material), basalt (own material), sky and cloud cannot
move, so S2, 4a, 4d and 4i should hold.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `K2["ledge_scale"]` 2.0 -> 2.6. No new assets.

## What moved (p7 -> p9; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p9 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #242321, dE ~17.6 | worse (+1 R, brighter) |
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #252421 | worse (+1 R/G) |
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #2E2D2A | worse (+1 R) |
| wide | 4g soil median | in | #30302B (was #302F2A) | +1 G, still in |
| turf/basalt/moss | both | — | byte-identical medians | unmoved, as predicted |
| tall/wide | 4h dark area | 30.84 / 14.19 % | 30.84 / 14.19 % | unmoved |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.362 / 0.383 | unmoved |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.14 / 3.07 | moved, still in (bar ≤ 8) |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 3 (all three worse by ~1 level). DoD intact. Sheets read clean
— the island reads slightly flatter-lit, not more rugged.
VRAM: our-render peak 3007 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

The hypothesis had the wrong sign: bigger protrusions catch more top-light and
the medians brightened. Shading-side darkening via ledge geometry is out.
`scripts/hero/still.py` is restored to p7 state and p7 remains the baseline.

Learning: two palette directions (tint, saturation) and one geometry direction
(ledge) all fail to move the wide pebble toward olive; the residual is likely
in how the wide camera's flatter view angle lights the gravel faces — a
light-angle or per-face treatment, not a global knob.

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p9/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing; review ran Mac-side
via still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…); hero panels from the committed pass-7 sheets (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never committed).
