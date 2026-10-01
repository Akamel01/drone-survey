# Pass 22: soil courses flush with proud pebble (light-side) — tried, measured, REVERTED

Base: pass-20 p20 (`~/hero3d/out/still-223/p20/` on akamel-linux), 2 rows out.
This pass's render: p22 (`~/hero3d/out/still-223/p22/`, fetched to
`hero3d-local/p22/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.1 (dE76 8.61 vs bar 8; ours #2B2B29 vs
union #1B1E24 — ours lighter). Pass 21 proved the soil median is
shadow-dominated: a x0.85 albedo cut moved the median 0.00 dE (means -0.4 %).
Wide pebble (gap 1.6) was left alone again: passes 18-20 exhausted its
geometry levers, and exposure-side work risks the sky (4a is in DoD).

Hypothesis: bringing the three recessed grav=0 soil courses flush with the
proud pebble bands (prot 0.02/0.03/0.01 -> 0.05/0.05/0.05, x `ledge_scale`
2.0) fills measure.py's +-3 %-of-island-height soil window with directly-lit
soil pixels carrying the linear soil target instead of recess-shadow plus
proud-pebble lip pixels, dropping the tall soil median toward #1B1E24;
silhouette max is unchanged (0.05 was already the pebble max) so S2 holds,
and tints/sky/basalt are untouched so 4a, 4d and 4i hold; wide soil
(dE ~5, in) and tall pebble (dE 5.66, in) are watched for collateral.

## What changed (`scripts/hero/still.py`, since reverted)

One knob dimension only: the `prot` of the three grav=0 soil rows —
soil 0.02 -> 0.05, sediment 0.03 -> 0.05, dark soil 0.01 -> 0.05 (flush
with the two proud pebble courses at 0.05). Thicknesses, tints, grav flags,
pebble/humus/rock untouched. No new assets (procedural knob only).

## What moved (p20 -> p22)

dE76 recomputed with the same routine that reproduces the prior passes'
figures exactly (p20 #28261E vs #2D2C10 = 13.08, #2B2B29 vs #1B1E24 = 8.61).

| framing | row | p20 | p22 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2B2B29, 8.61, gap 1.1 | #2B2B29, 8.61, gap 1.1 | UNMOVED (0.00 dE) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #322D22, 7.66, gap 1.0 | AWAY +2.00, still IN (bar 8) but margin 2.34 -> 0.34 |
| wide | 4g pebble median | #28261E, 13.08, gap 1.6 | #2E2B23, 12.96, gap 1.6 | -0.12, noise |
| wide | 4g soil median | #2E2E2C | #2E2E2B | 1 LSB, noise, still in |
| tall/wide | soil meanV (sub-median) | 50.50 / 51.83 | 50.60 / 51.67 | +0.10/-0.16 levels, noise (tall went lighter) |
| tall/wide | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07, 2.0/3.79/6.93 | identical | intact |
| tall/wide | 4d p50 (midtone, NOT floor) | 31.647 / 65.477 | 32.719 / 65.045 | +1.07/-0.43 drift, not a DoD row |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.361 / 0.382 | 3rd-decimal noise |
| tall/wide | 4h dark area | 30.84 / 14.19 % | identical | unmoved |
| 4a / 4i / S2 | — | — | tokens/hexes identical, band 85.78/83.38 identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.6, tall soil 1.1). Visual read: sheets show
no change at frame scale — same cake-layer strata read, no regression, no
improvement.
VRAM: vram.log device peak 4510 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3007 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0).

## Keep-or-revert: REVERTED

The target moved 0.00 dE while a passing row paid for the experiment: tall
pebble went 5.66 -> 7.66 dE (+2.00, margin over the bar nearly spent at
0.34). Flushing the soil courses did not put lit soil pixels in the soil
window — the medians are bit-identical — but it did re-light the pebble
window (likelier: the middle recessed pebble course's neighbours coming
forward changed occlusion/mix in the tall pebble window). A change that
spends a passing row's margin for zero target gain is not kept, so
`scripts/hero/still.py` is restored to p20 state and p20 remains the
baseline. A reverted pass still counts as the intentional pass.

Learning: soil-course protrusion is not a lever on the tall soil median
either (0.00 dE, just like tint in p21) — but unlike tint it is not
*inert*: it moves the tall pebble median ~2 dE. Protrusion anywhere in the
strata stack re-mixes the pebble window. The tall soil row has now resisted
tint (p21) and relief (p22) at these doses; its median pixels are pinned by
the window mix, not by any single course's shading. Next options: a much
stronger single-course dose (spends neighbours' margins blind), the middle
recessed pebble course itself (its shadow may be what the soil window is
actually reading), or leaving the strata rows and taking a fresh visual gap.

Next ranked gaps (baseline p20, unchanged):

1. wide 4g pebble median, gap 1.6
2. tall 4g soil median, gap 1.1

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p22/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free (Mac / has 97G free). This Mac rendered
nothing; review ran Mac-side via still_review.py + pinned measure.py
(26f93fce…) and measurements.csv (2df42cf8…) in `/tmp/review223`
(sha-verified against the pins); hero panels are the 960-px copies there
(values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p22/`
(git-ignored, never committed). Committed with this pass: only
`docs/research/hero-blender-still/pass-22/` (sheets, scorecard, changes,
measure jsons, scores.json, s2.txt, render/vram/precheck logs).
`scripts/hero/still.py` restored to p20 state — no code change kept.
