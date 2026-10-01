# Pass 24: thin recessed middle pebble to floor, +0.02 to dark soil — kept

Base: pass-20 p20 (`~/hero3d/out/still-223/p20/` on akamel-linux), 2 rows out.
This pass's render: p24 (`~/hero3d/out/still-223/p24/`, fetched to
`hero3d-local/p24/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.1 (dE76 8.61 vs bar 8; ours #2B2B29 vs
union #1B1E24 — ours lighter). Three approaches pinned it at exactly 8.61:
soil tint x0.85 (p21, median 0.00 dE, means -0.4 %) and soil-course flush
(p22, median 0.00 dE) prove the window pixels are shadow-dominated, where
albedo scaling is swallowed and relief reshuffles the *pebble* window
instead (tall pebble +2.00 dE in p22). Colour-side levers on wide pebble
are likewise closed (tint p6 inert on wide, saturation p23 away +0.71).
A bounce/fill lamp would lighten a median that needs darkening — wrong
direction. Deepening the soil recess darkens in the right direction but
re-runs p22's mechanism, which spent 2.0 of tall pebble's 2.34 margin for
zero soil gain — rejected as margin-unsafe.

Hypothesis: the tall soil window still reads shadow pixels of the recessed
middle pebble course, so thinning that course to the 0.08 floor (0.10 ->
0.08) and giving the +0.02 to the dark soil row (0.10 -> 0.12) swaps
middle-pebble shadow pixels for soil-target pixels in the soil window,
dropping the tall soil median toward #1B1E24; total strata thickness held
constant so silhouette/S2 hold, and the mechanism is window-mix surgery —
the one class with precedent (p20 thickness moved tall soil -0.78 dE),
not shading. Scored on the tall soil median plus DoD intactness, with
tall pebble (margin 2.34) watched for collateral.

## What changed (`scripts/hero/still.py`, kept)

One knob dimension only: LAYERS thicknesses — middle pebble 0.10 -> 0.08
(the 0.08 floor), dark soil 0.10 -> 0.12; proud pebble courses, top soil,
sediment, humus, rock, all prot values, tints, grav flags untouched.
Pebble sum 0.52 -> 0.50, total strata unchanged. No new assets
(procedural knob only).

## What moved (p20 -> p24)

dE76 recomputed with measure.py's own `srgb_to_lab`/`deltaE`, which
reproduces the prior passes' figures exactly (p20 #28261E vs #2D2C10 =
13.08, #2B2B29 vs #1B1E24 = 8.61, #2C291E vs #212111 = 5.66).

| framing | row | p20 | p24 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #2B2B29, 8.61, gap 1.1 | #292A29, 7.70, gap 1.0 | TOWARD -0.91 |
| wide | 4g pebble median | #28261E, 13.08, gap 1.6 | #28261E, 13.08, gap 1.6 | bit-identical |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C291E, 5.66, gap 0.7 | bit-identical, still IN (bar 8) |
| wide | 4g soil median | #2E2E2C | #2D2D2B | 1 LSB, noise, still in |
| tall/wide | soil meanV (sub-median) | 50.50 / 51.83 | 49.98 / 51.35 | darker both, -0.52/-0.48 levels |
| tall/wide | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07, 2.0/3.79/6.93 | bit-identical | intact |
| tall/wide | 4d p50 (midtone, not floor) | 31.647 / 65.477 | 31.144 / 65.397 | drift -0.50/-0.08, not a DoD row |
| tall/wide | 4b falloff_sat | 0.362 / 0.383 | 0.364 / 0.384 | 3rd-decimal noise |
| tall/wide | 4h dark area | 30.84 / 14.19 % | +0.0006 / +0.0003 pp | 5th-decimal noise |
| 4a / 4i / S2 | — | — | 4a 4th-decimal noise, band 85.78/83.38 identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.6, tall soil 1.0). Visual read: sheets show
no change at frame scale — same cake-layer strata read, no regression, no
improvement; S2 bboxes bit-identical both framings.
VRAM: vram.log device peak 4512 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3009 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0).

## Keep-or-revert: KEPT

The target moved -0.91 dE — the first soil-median movement in three passes —
with both pebble medians bit-identical (tall margin 2.34 fully preserved),
4d floor bit-identical, S2 PASS, 4a/4i intact, and no visual regression on
the sheets, so the LAYERS change stays and p24 becomes the new baseline.
Honest limit: gap 1.0 is still out, and the move came with no frame-scale
read change — mix surgery works on the median while the cake-layer look
persists.

Learning: the tall soil window does read the middle pebble course — thinning
it moved the median where tint and relief could not. The remaining mix
lever on this row is the dark soil course itself (now 0.12, thickened this
pass with no isolated read) or accepting the row near the bar; the wide
pebble row has no untried safe lever left (tint inert, saturation away,
thickness worked once in p20, Value-side unpromising on a B-heavy error).

Next ranked gaps (baseline p24):

1. wide 4g pebble median, gap 1.6
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p24/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` (sha-verified against the
pins); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed);
fetched renders under `hero3d-local/p24/` (git-ignored, never committed).
Committed with this pass: `scripts/hero/still.py` (LAYERS change, kept)
plus only `docs/research/hero-blender-still/pass-24/` (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck logs).
