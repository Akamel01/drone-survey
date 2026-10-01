# Pass 23: gravel saturation 1.3 -> 1.5 — tried, measured, REVERTED

Base: pass-20 p20 (`~/hero3d/out/still-223/p20/` on akamel-linux), 2 rows out.
This pass's render: p23 (`~/hero3d/out/still-223/p23/`, fetched to
`hero3d-local/p23/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.6 (dE76 13.08 vs bar 8; ours #28261E vs
union #2D2C10). The measured deficit is chroma, not lightness: wide pebble
meanS 0.314 vs hero s0 0.528, and the median's B channel (0x1E) sits far
above the target's (0x10). Pass 6 proved `pebble_tint` is a tall-only lever
(wide unmoved 16.86 -> 16.79) that breaks tall 4b, so the tint path is not
retried; `pebble_hsv` Saturation has not moved since pass 3.

Hypothesis: raising gravel HSV Saturation 1.3 -> 1.5 (Value untouched)
pushes olive R,G up and B down on the lit proud-course pixels that pass 20's
thickness put into measure.py's +-3 % pebble window, pulling the wide pebble
median toward #2D2C10; tall pebble is undersaturated too (meanS 0.361 vs hero
s0 0.448) so it moves the same direction and its margin is spent toward
target, not away; the knob is strata-local so sky, basalt, 4d, 4i and S2
hold. Scored on the wide/tall pebble medians plus DoD intactness.

## What changed (`scripts/hero/still.py`, since reverted)

One knob dimension only: `K2["pebble_hsv"]` (1.3, 0.35) -> (1.5, 0.35) —
Saturation only, Value untouched. LAYERS, tints, grav flags, pebble_tint,
cameras, sky, ridges untouched. No new assets (procedural knob only).

## What moved (p20 -> p23)

dE76 recomputed with the same routine that reproduces the prior passes'
figures exactly (p20 #28261E vs #2D2C10 = 13.08, #2B2B29 vs #1B1E24 = 8.61,
#2C291E vs #212111 = 5.66).

| framing | row | p20 | p23 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #28261E, 13.08, gap 1.6 | #28251E, 13.79, gap 1.7 | AWAY +0.71 |
| wide | 4g pebble meanS (sub-median) | 0.314 | 0.330 | right direction, +0.016 (tiny) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C281D, 5.53, gap 0.7 | toward, -0.13, still IN (bar 8) |
| tall | 4g soil median | #2B2B29, 8.61, gap 1.1 | #2B2B29, 8.61, gap 1.1 | UNMOVED (0.00 dE) |
| wide | 4g soil median | #2E2E2C | #2E2E2B | 1 LSB, noise, still in |
| tall/wide | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07, 2.0/3.79/6.93 | identical | intact |
| tall/wide | 4b falloff_sat | 0.361 / 0.382 | 0.359 / 0.380 | -0.002 both, 3rd-decimal noise |
| tall/wide | 4h dark area | 30.84 / 14.19 % | identical | unmoved |
| 4a / 4i / S2 | — | — | tokens/hexes identical, 4a numerics 4th-decimal noise, band 85.78/83.38 identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.7, tall soil 1.1). Visual read: sheets show
no change at frame scale — same cake-layer strata read, no regression, no
improvement.
VRAM: vram.log device peak 4510 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3007 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0 after 55 s).

## Keep-or-revert: REVERTED

The target moved the wrong way (+0.71 dE on wide pebble, gap 1.6 -> 1.7)
while nothing else paid for information worth keeping — tall pebble drifted
-0.13 but stays IN either way, and every DoD row is intact — so
`scripts/hero/still.py` is restored to p20 state and p20 remains the
baseline. A reverted pass still counts as the intentional pass.

Learning: gravel saturation is not a lever on the wide pebble median at this
dose — worse than inert, it separates mean from median: meanS rose +0.016 in
the right direction while the max-chroma median moved away, so the labeler's
pick does not follow the window mean. The wide median pixels are evidently
not lit olive pixels that take chroma (shadow/desaturated mix where
+saturation grows the B-relative error: #28261E -> #28251E). Colour-side
levers tried on wide pebble and closed: pebble_tint (p6, unmoved + broke
4b), saturation (p23, away). Remaining on this row: the Value/lightness side
of the gravel path, or the strata rows are left and a fresh visual gap is
taken instead. Tall pebble survived untouched in spirit (5.66 -> 5.53,
margin 2.47).

Next ranked gaps (baseline p20, unchanged):

1. wide 4g pebble median, gap 1.6
2. tall 4g soil median, gap 1.1

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp) and
`~/hero3d/out/still-223/p23/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` (sha-verified against the
pins); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed);
fetched renders under `hero3d-local/p23/` (git-ignored, never committed).
Committed with this pass: only `docs/research/hero-blender-still/pass-23/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/vram/
precheck logs). `scripts/hero/still.py` restored to p20 state — no code
change kept.
