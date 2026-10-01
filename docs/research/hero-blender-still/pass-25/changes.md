# Pass 25: dark-soil thickening inside the soil family — tried, measured, REVERTED

Base: pass-24 p24 (`~/hero3d/out/still-223/p24/` on akamel-linux), 2 rows out.
This pass's render: p25 (`~/hero3d/out/still-223/p25/`, fetched to
`hero3d-local/p25/` — git-ignored work files; the committed record is this dir).
`scripts/hero/still.py` was restored to the p24 state after the revert, so the
tree carries no code change from this pass — only this dir is committed.

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70 vs bar 8; ours #292A29 vs
union #1B1E24 — ours lighter). Pass 24 proved the tall soil window reads the
strata courses as a pixel mix: thinning the recessed middle pebble to the
0.08 floor moved the median -0.91 dE where tint (p21, 0.00 dE) and relief
(p22, 0.00 dE, +2.00 dE collateral on tall pebble) could not. The middle
pebble is now at its floor, so the remaining mix lever on this row is inside
the soil family itself: the dark soil course (thickened 0.10 -> 0.12 in p24
with no isolated read) versus the less-recessed sediment.

Hypothesis: the dark soil course (prot 0.01, the most recessed soil row)
contributes the darkest soil pixels to the tall soil window, so thickening
it 0.12 -> 0.14 at the expense of the less-recessed sediment (prot 0.03,
0.12 -> 0.10) swaps mid-tone soil pixels for darker soil pixels, dropping
the tall soil median toward #1B1E24; same soil-target albedo both sides and
pebble courses untouched, so the thin tall-pebble margin (2.34 over bar 8)
is fully protected, and total strata thickness is unchanged so
silhouette/S2 hold. Scored on the tall soil median plus DoD intactness.

## What changed (`scripts/hero/still.py`, reverted)

One knob dimension only: LAYERS thicknesses — dark soil 0.12 -> 0.14,
sediment 0.12 -> 0.10; middle pebble floor, proud pebble courses, top soil,
humus, rock, all prot values, tints, grav flags untouched. Total strata
unchanged. No new assets (procedural knob only).

## What moved (p24 -> p25)

dE76 recomputed with measure.py's own `srgb_to_lab`/`deltaE` on RGB tuples
(the p24 method; verified: p24 figures reproduce exactly —
#28261E vs #2D2C10 = 13.08, #292A29 vs #1B1E24 = 7.70).

| framing | row | p24 | p25 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | bit-identical, 0.00 dE |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C291E, 5.66, gap 0.7 | bit-identical, still IN (bar 8) |
| wide | 4g pebble median | #28261E, 13.08, gap 1.6 | #28261F, 13.76, gap 1.7 | AWAY +0.68 on 1 LSB (B 0x1E->0x1F; near-black Lab is steep) |
| wide | 4g soil median | #2D2D2B | #2D2D2B | bit-identical, still in |
| tall/wide | soil meanV (sub-median) | 49.98 / 51.35 | 49.88 / 51.23 | darker both, -0.10/-0.12 levels, median unmoved |
| tall | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07 | bit-identical | intact |
| wide | 4d floor p0_1 / p1 / p5 | 1.86/3.79/6.93 | 2.00/3.79/6.93 | p0_1 drift +0.14 levels; DoD row p1 bit-identical |
| tall/wide | 4b falloff_sat | 0.364 / 0.384 | 0.363 / 0.384 | 3rd-decimal noise |
| tall/wide | 4h dark area | 30.84 / 14.19 % | bit-identical | intact |
| 4a / 4i / S2 | — | — | 4a 4th-decimal noise, band 85.78/83.38 identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.7, tall soil 1.0). Visual read: sheets show
no change at frame scale — same cake-layer strata read, no regression, no
improvement; S2 bboxes bit-identical both framings.
VRAM: vram.log device peak 4512 MiB, precheck baseline 1503 MiB, cycles leg
2192 MiB (Mem high-water), our-render peak 3009 MiB, gate 6144 MiB. 4K time
~55 s both framings (exit 0).

## Keep-or-revert: REVERTED

The target did not move — tall soil median bit-identical at 7.70 dE — while
a non-target out-row drifted away (wide pebble +0.68 dE on one LSB) and a
non-DoD floor cell drifted (wide p0_1 +0.14). DoD holds (S2 PASS, 4d p1
bit-identical both framings, 4a/4i intact) and the sheets show no
regression, but the keep rule is that the target moves without breaking a
passing row or DoD: it did not move, so the LAYERS change is reverted and
p24 stays the baseline. The sub-median meanV darkening (-0.10/-0.12) with a
pinned median is the third instance of the median-vs-mean pattern (p21, p22,
p25): soil-family-internal mix surgery moves means, not the median.

Learning: the soil-family mix lever is exhausted — dark-soil thickening
shifts only sub-median means. The tall soil median moved exactly once in
five passes (p24, via cross-family pebble-shadow-pixel surgery) and is
otherwise pinned across tint, relief, and two thickness geometries; what is
left on this row is per-pixel light transport in shadowed recesses, not mix
fractions.

Next ranked gaps (baseline p24, final):

1. wide 4g pebble median, gap 1.7
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Passes 6-25 summary

Final baseline: p24 (this pass reverted, so the tree's `still.py` is the
p24 state). Rows out: pass-5 p5b 4 -> pass-7 p7 3 -> final p24 2.

| baseline | rows out | which rows |
|---|---|---|
| pass-5 p5b | 4 | wide pebble 2.1, wide 4h 1.3, tall soil 1.3, tall pebble 1.1 |
| pass-7 p7 | 3 | wide pebble, tall soil, tall pebble (wide 4h fixed) |
| final p24 | 2 | wide pebble 1.6, tall soil 1.0 (tall pebble in at 0.7) |

Keeps vs reverts tally over passes 6-25 (20 passes): 5 kept
(7: wide-only crown copies; 18/19: per-layer pebble protrusion + harder
swing; 20: per-layer pebble thickness; 24: middle-pebble thinning to floor)
against 15 reverted
(6: olive pebble tint; 8: gravel saturation; 9: rugged ledges; 10: darker
gravel Value; 11: blue-channel-only tint; 12/13/14: specular ladder;
15: soil tints x0.7; 16: cliff detail Value; 17: strata displacement;
21: soil tint x0.85; 22: flush soil courses; 23: gravel saturation 1.3->1.5;
25: dark-soil thickening).

The three biggest learnings:

1. Window-mix surgery beats shading levers on palette medians. Per-layer
   thickness changes (p20, p24) moved medians where albedo tints (p6, p11,
   p15, p21: all 0.00 dE on their targets), saturation (p8, p23: away or
   0.00) and specular ladders (p12-14) could not — the labeler windows read
   pixel mix, and shadow-dominated pixels swallow albedo scaling whole.
2. Relief is a colour lever with collateral. Protrusion moves (p18/19 kept,
   p22 reverted at +2.00 dE cost to tall pebble) re-light neighbouring
   windows as much as their own; the thin tall-pebble margin (2.34 over
   bar 8) constrains every geometry move, which is why p24's pebble-free
   soil-family attempt was the right last idea even though it failed.
3. Medians pin while means move. Three passes (p21, p22, p25) shifted
   sub-median means with bit-identical medians: the median is a step
   function of window mix, and only a mix change crossing 50% moves it.
   The measures can also go blind in the other direction — p24 moved a
   median with zero frame-scale read change.

Ranked recommendations for any future work:

1. Accept tall soil (gap 1.0, dE 7.7 vs bar 8 — within 4% of the bar):
   tint, relief, and three thickness geometries are exhausted on it.
2. Wide pebble (gap 1.7) is the only remaining material gap with real
   distance; every colour-side lever tried on it was inert or away, so it
   wants per-pixel recess lighting or new gravel geometry, not another tint.
3. Spend effort on the visual gaps (rugged strata, moss cap, spruces,
   boulder sheen): they dominate the sheet read and the measures cannot
   see them — the next dE gain that does not change the frame is worth
   less than any frame-scale change the measures cannot score.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; content
restored to the p24 state by the revert) and
`~/hero3d/out/still-223/p25/` (fresh pass dir). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` (sha-verified against the
pins); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed);
fetched renders under `hero3d-local/p25/` (git-ignored, never committed).
Committed with this pass: only `docs/research/hero-blender-still/pass-25/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/vram/precheck logs).
No new assets (procedural knob only — nothing to source or licence).
