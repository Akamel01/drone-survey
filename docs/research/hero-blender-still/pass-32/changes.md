# Pass 32: dark-soil-from-humus thickness swap — tried, measured, REVERTED

Base: pass-29 p29 (`~/hero3d/out/still-223/p29/` on akamel-linux), 2 rows out.
This pass's render: p32 (`~/hero3d/out/still-223/p32/`, fetched to
`hero3d-local/p32/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70, ours #292A29 vs union
#1B1E24 — ours lighter in every channel: R 41 vs 27, G 42 vs 30, B 41 vs
36). The lamp class is closed on both framings (p31 measured the tall fill
AWAY +1.25 with pebble collateral, wide mapped on three sides), so per the
brief this pass takes a soil-side composition lever with no light added.
The median is a step function of window mix (p25 learning): intra-family
soil swaps move only means (p25 dark-soil-vs-sediment: 0.00 dE), while
cross-family mix surgery is the one class that has ever moved this median
(p20 −0.78, p24 −0.91, both pebble→soil). p25 tested dark soil 0.14 funded
by sediment — soil fraction constant — so funding it from OUTSIDE the soil
family is untried: humus carries neutral-dark (0.030, 0.028, 0.025),
lighter than the soil target, and sits at the top of the stack.

Hypothesis: thickening the dark soil course (0.12 -> 0.14, prot 0.01, the
most recessed soil row and hence the darkest soil-target pixels) at the
expense of the humus (0.18 -> 0.16) moves the tall soil median toward
#1B1E24, because it raises the total soil fraction at a non-soil course's
expense (the p24 class) while recruiting darker members into the soil
window and removing lighter humus interlopers — all without brightening a
single pixel, touching a pebble course, or adding light. Total strata
thickness is unchanged so silhouette/S2 hold, and the tall-pebble margin
(2.34 over bar 8, intact at baseline) is protected by construction since
no pebble geometry moves. Scored on the tall soil median plus
DoD/passing-row intactness, watching wide pebble (gap 1.2, out) and tall
pebble. Keep iff toward with no passing-row/DoD breakage.

## What changed (`scripts/hero/still.py`, since reverted)

One knob dimension only: LAYERS thicknesses — humus 0.18 -> 0.16, dark
soil 0.12 -> 0.14; middle-pebble floor, proud pebble courses, top soil,
sediment, rock, all prot values, tints, grav flags, lamps untouched.
Pebble sum unchanged (0.50), total strata unchanged. No new assets
(procedural knob only).

## What moved (p29 -> p32)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified: #2F2B1E vs #2D2C10 = 9.59, #292A29 vs #1B1E24 = 7.70; gap = dE/8
per pass 20).

| framing | row | p29 | p32 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | UNMOVED (0.00 dE, bit-identical) |
| wide | 4g pebble median | #2F2B1E, 9.59, gap 1.2 | #2C281E, 11.60, gap 1.45 | AWAY +2.01 (R 47->44, G 43->40, B 30->30 pinned — darkened, wrong direction; union wants brighter 53.4 meanV) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #27251D, 5.95, gap 0.7 | AWAY +0.29, still IN (bar 8), margin 2.34 -> 2.05 |
| tall | 4g moss median | #313B0A | #313B0A | bit-identical, still in |
| wide | 4g moss median | #353E0B | #353E0B | bit-identical, still in |
| tall/wide | 4g basalt median | #0A0B0C / #0D0D0D | bit-identical | still in |
| tall/wide | 4g turf median | #283212 / #2B3511 | bit-identical | status unchanged |
| wide | 4g soil median | #30302D | #302F2D | 1 LSB (B), still in |
| tall | 4g soil sub-median | meanV 49.98 / meanS 0.172 / share 0.324 | meanV 49.79 / meanS 0.170 / share 0.324 | −0.19 levels darker, median pinned — fourth median-vs-mean instance (p21/p22/p25) |
| tall | 4g pebble sub-median | meanV 44.99 / meanS 0.353 | meanV 41.47 / meanS 0.322 | −3.52 levels — the whole window darkened, median +0.29 |
| wide | 4g pebble sub-median | meanV 49.69 / meanS 0.384 | meanV 46.44 / meanS 0.348 | −3.25 levels, median +2.01 |
| tall | 4d floor p0_1 / p1 / p5 / p50 | 1.79/3.07/5.07/31.14 | 1.79/3.07/5.07/31.00 | floor bit-identical; p50 drift −0.14 (not a DoD row); shadow_floor_lifted 0 |
| wide | 4d floor p0_1 / p1 / p5 / p50 | 2.0/4.07/8.86/68.86 | 2.0/4.07/8.86/68.32 | floor bit-identical; p50 drift −0.54 (not a DoD row); shadow_floor_lifted 0 |
| tall | 4h dark area | 30.84 % | 30.84 % | −0.0006 pp, still in |
| wide | 4h dark area | 14.23 % | 14.23 % | bit-identical, still in |
| tall | 4a | — | max abs move 0.0003 (denoise-domain) | status unchanged |
| wide | 4a | — | max abs move 0.0001 (denoise-domain) | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | band identical, bboxes character-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.45, tall soil 1.0 — baseline p29 restored
by the revert, so the ledger stays wide pebble 1.2, tall soil 1.0).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap, spruces,
boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4512 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3009 MiB (derived arithmetic: 4512 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: REVERTED

The target did not move — tall soil median bit-identical at 7.70 dE
(0.00) — while the watched out-row paid heavily: wide pebble +2.01 dE
(R −3, G −3, B pinned), the largest single-pass collateral on that row in
the log, plus tall pebble +0.29. DoD holds (S2 PASS, 4d floor
bit-identical both framings, 4a/4i intact) and the sheets show no
regression, but the keep rule is that the target moves without breaking a
passing row or DoD: it did not move, so the LAYERS change is reverted and
p29 remains the baseline. A reverted pass still counts as the intentional
pass.

Learning: humus is not what the tall soil window reads — the fourth
median-pinned-means-moved instance (meanV −0.19, median 0.00) — but humus
thickness IS live on the wide pebble window, and wrong-signed: thinning
the top stratum darkened both pebble windows' means (−3.5/−3.2 levels)
while the union wants them brighter. Mechanism guess: humus-overhang
occlusion/shading of the top proud pebble, not pixel mix (no pebble
geometry moved, yet both pebble medians shifted). The cross-family class
is thereby refined: it moves a median when the funded course is what the
target window reads (p24's middle-pebble shadow) and taxes a neighbour
window when it merely re-lights it. Soil-fraction surgery funded from
outside the soil family is now measured once (0.00 + collateral), joining
tint, relief, intra-family thickness, and lamps as spent on this row.

Next ranked gaps (baseline p29, unchanged):

1. wide 4g pebble median, gap 1.2
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; content
restored to the p29 state by the revert) and `~/hero3d/out/still-223/p32/`
(fresh pass dir). Never `~/hero3d/web4k`, `~/drone/scratch`,
`~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes. No sudo. Host / has
20G free. This Mac rendered nothing; review ran Mac-side via still_review.py
+ pinned measure.py (26f93fce…) and measurements.csv (2df42cf8…) in
`/tmp/review223` (the tool re-verifies both pins itself); hero panels are
the 960-px copies there (values from CSV). Review under the worktree-local
`.review-venv` (untracked, never committed); fetched renders under
`hero3d-local/p32/` (git-ignored, never committed). Committed with this
pass: only `docs/research/hero-blender-still/pass-32/` (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/azimuth/
exit_code logs). `scripts/hero/still.py` restored to p29 state — no code
change kept. No new assets (procedural knob only — nothing to source or
licence).
