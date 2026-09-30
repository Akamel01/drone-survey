# Pass 8: gravel saturation boost — tried, measured, REVERTED

Base: pass-7 p7 (`~/hero3d/out/still-223/p7/` on akamel-linux), 3 rows out.
This pass's render: p8 (`~/hero3d/out/still-223/p8/`, fetched to `hero3d-local/p8/`
— git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: both pebble medians read grey and under-saturated — wide #232320 vs
#2D2C10 (dE 16.86, gap 2.1), tall #242320 vs #212111 (dE 9.03, gap 1.1).
Pebble meanS sits ~0.2 below hero in both framings (0.26/0.28 vs 0.53/0.45).

Hypothesis: raising the gravel HUE_SAT Saturation (`pebble_hsv` S 1.3 -> 1.7)
shifts both pebble medians toward their olive targets because the knob acts
only on the gravel-mapped pixels — so S2, 4a, 4d and 4i cannot move, and the
move should read mostly in 4g Saturation/Value rows.

## What changed (`scripts/hero/still.py`, since reverted)

One knob only: `K2["pebble_hsv"]` (1.3, 0.35) -> (1.7, 0.35).
No new assets (procedural knob only).

## What moved (p7 -> p8; dE = dE76 vs target hex, tol dE 8)

| framing | row | p7 | p8 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #232320, dE 16.86, gap 2.1 | #232220, dE 17.58, gap 2.2 | worse (+0.7 dE, wrong way) |
| tall | 4g pebble median | #242320, dE 9.03, gap 1.1 | #24231F, dE 8.3, gap 1.0 | narrowed, still out |
| tall | 4g soil median | #2D2D29, dE 10.17, gap 1.3 | #2E2C28, dE 10.16, gap 1.3 | unmoved |
| wide/tall | pebble meanS | 0.257 / 0.282 | 0.275 / 0.303 | +0.02, an order of magnitude short |
| tall | 4b falloff_sat_D2_D1 | 0.362, in | 0.357 | drifted toward the pass-6 break edge (0.353) |
| wide/tall | 4h dark area | 14.19 / 30.84 % | 14.19 / 30.84 % | unmoved, as predicted |
| wide | 4d p1 / tall 4d p1 | 3.79 / 3.07 | 3.79 / 3.07 | unmoved |
| 4a slopes/R2 | all in | identical to 3 dp | unmoved | unmoved |
| 4i cloud band | 85.78 / 83.38 %H | 85.78 / 83.38 %H | unmoved | unmoved |
| S2 | PASS both | PASS both, same bbox | intact | intact |

Rows out: 3 -> 3. DoD intact (S2 PASS both framings, 4d p1 3.07 / 3.79,
all 4a rows in, 4i band 85.78 / 83.38 %H in). Sheets read clean.
VRAM: our-render peak 3011 MiB, gate 6144 MiB. 4K time ~55 s both framings.

## Keep-or-revert: REVERTED

+0.4 Saturation buys only +0.02 meanS — reaching the +0.2 deficit needs an
absurd S, and the wide median moved the wrong way (G -1). Same lesson as
pass 6: the gravel-path palette knobs do not reach the wide framing's pebble,
whose flat light washes tint/saturation shifts out. `scripts/hero/still.py`
is restored to p7 state and p7 remains the baseline. A reverted pass still
counts as the intentional pass.

Learning: wide pebble needs an exposure/lighting-side approach, not a
palette knob; tall pebble answers weakly to saturation (9.0 -> 8.3 dE) but a
bigger S step risks the tall 4b edge (0.362 -> 0.357 already).

## Next ranked gaps (baseline p7, unchanged)

1. wide 4g pebble median, gap 2.1 — exposure/lighting-side, not palette
2. tall 4g soil median, gap 1.3
3. tall 4g pebble median, gap 1.1 — saturation direction weak, tint direction
   proven (pass 6) but coupled; retry needs a hue-side or masked approach

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap, dense
dark spruces vs open saplings, rugged uneven strata vs flat cake layers,
sheened boulders — asset/modelling work, not parameter passes.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p8/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 25G free. This Mac rendered nothing (Blender never ran
here); review ran Mac-side via still_review.py + pinned measure.py
(26f93fce…) and measurements.csv (2df42cf8…) extracted from
`research/hero-look-spec` (@90d3219), sha256-verified against the pins; hero
panels cropped bit-exact from the committed pass-7 sheets (values come from
the CSV, panels are composition-only). Repro check: the harness re-scores
hero3d-local/p7 byte-identical to the committed pass-7 scores.json (244/244
rows, 0 diffs). Review ran under a worktree-local venv (`.review-venv`,
untracked, never committed) because no Mac python ships numpy+Pillow together.
