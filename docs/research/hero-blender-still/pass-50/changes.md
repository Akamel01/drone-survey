# Pass 50: gravel grain x2 coarser at fixed mapping registration (pebble texture-statistics dose) — measured, REVERTED

Base: pass-47 p47 (`~/hero3d/out/still-223/p47/` on akamel-linux), 2 rows out.
This pass's render: p50 (`~/hero3d/out/still-223/p50/`, fetched to
`hero3d-local/p50/` — git-ignored work files; the committed record is this dir).
No stale p50 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot. Takes the pass-49 Next section's #1 (wide
4g pebble median, gap 1.0) with the one pebble-path dose the mapping record
leaves untested: texture statistics.

## The one gap + hypothesis

Gap: wide 4g pebble median #2F2E1E vs union #2D2C10 (dE 7.77, gap 1.0).
Channel residual is B-selective: B 30 vs 16 (−14 levels) with R/G matched
within 2. Material path closed (MULTIPLY B saturates per p11; Value cuts R/G
away per p10; Saturation-up pushes R/G away per p8/p23; hue peaked at 0.56
per p37; tint wide-inert per p6/p23-era windows) and the lamp cell closed
from both sides per p49 (halving WideFill B at fixed energy and fixed R/G:
0.00 dE — the window's blue arrives downstream of every lamp knob). p11's
saturation is the tell: cutting the B multiply stopped cutting rendered B,
so the blue floor is not in the grain albedo — it is in the LIGHT on the
microfacets (sky-ambient in the inter-grain crevices and sky-facing grain
faces). Grain statistics were never dosed: rescaling the gravel texture
rebalances lit grain faces against blue crevices inside the +-3 % window
without touching any lamp, albedo, hue, tint, or composition knob.

Hypothesis: halving the v_grav Mapping scale (grains ~2x coarser, albedo
and micro-normals staying registered through the same node) moves wide
pebble toward #2D2C10, because each window pixel is then covered by larger
directly-lit grain faces with a smaller crevice fraction, so the median
loses sky-blue while R/G hold on the sunlit faces. Scored on the wide
pebble median FIRST, plus wide soil (same cut faces), plus DoD/floor/4h
intactness. Collateral watch: tall pebble (same gravel, in with 2.25 over
bar 8), wide 4d p1 (p47 4.0722 vs bar <= 8), wide 4h (p47 13.823 vs 14.8
ceiling). S2/bboxes identical by construction (no geometry change). Visual
keep bar: a visible de-blue step on the gravel courses, else revert.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob: `gravel_map` 1.0 -> 0.5, applied in `island_palette` by walking
upstream from the already-patched gravel Hue/Saturation node (its Color
input <- forest_ground_04 Diffuse image <- Mapping), guarded by two
loud asserts (TEX_IMAGE with a forest_ground_04 image; MAPPING node).
The same Mapping node also feeds the gravel nor_gl, so micro-normals scale
with the albedo (registration preserved); the cliff-detail and turf
mappings are separate nodes, untouched. Energy, lamps, tints, hues, LAYERS,
cameras, sky, ridges untouched. No new assets (procedural knob only).
Reverted, so `still.py` is byte-identical to the p47 kept content
(md5 a525d9cce1700572506ba557df6454ae both sides); the host stage copy was
restored to the same file and re-verified.

## What moved (p47 -> p50)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs
#1B1E24 = 7.70 exact, #2C2C1F vs #212111 = 5.75 exact; gap = dE/8 per pass
20, 1-decimal; gap 1.0 = out per the p19 precedent; 4h gap =
|v − 12.3|/2.46 per the pass-5 12.3 ±20 % spec, ceiling 14.8).
"Hex-identical" means median hex strings compare ==. Full p47-vs-p50 JSON
diff: every scored median holds except one 1-step soil wobble below;
k-shares reshuffled both framings while medians held — scored on medians
only per the standing tool note.

| framing | row | p47 | p50 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED — a full octave of grain rescaling buys zero median levels |
| wide | 4g pebble sub-median | meanV 49.7211 / meanS 0.38026 | meanV 49.6719 / meanS 0.37938 | whisper toward (−0.05 levels, −0.001 S) — right direction, sub-quantization, not a move |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F302C, 5.86, gap 0.7 | one R step toward (−0.12 dE, still in, not a counted row — bounce/denoise scale on an untouched material) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical | PINNED (baseline out-row untouched) |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical | PINNED — tall-pebble margin intact |
| tall/wide | 4g turf medians | #273111 4.36 / #2B3410 9.04 | hex-identical, dE flat | PINNED |
| tall/wide | 4g moss medians | #313B0A / #353E0B | hex-identical | PINNED |
| tall/wide | 4g basalt medians | #0A0B0C / #0D0D0D | hex-identical | PINNED |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | 2.0/4.0722/8.8556 | float-identical — DoD p1 gate holds at 4.0722 |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact |
| wide | 4h dark area | 13.82296 %, gap 0.6 | 13.82262 % (−0.0003), gap 0.6 | noise — ceiling margin never approached |
| tall | 4h dark area | 30.15915 % | 30.15935 % (+0.0002) | noise |
| wide/tall | 4h edge density | 0.25259 / 0.57144 | 0.25259 / 0.57144 | pinned to 5th decimal |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36420 / 0.25228 | 0.36463 / 0.25257 | still in |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39110 / 0.35894 | 0.39140 / 0.35922 | still in (same side; p10 precedent: 0.388 at band edge, in) |
| tall/wide | 4a | — | 3rd–5th-decimal sky-fit wobbles | status unchanged, all anchors within the ΔE <= 10 bar |
| tall/wide | 4e DOF | lapvar D1 667.13/422.44 | 682.92 (+2.3 %)/435.03 (+3.0 %); σ within ±25 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; bboxes identical to p47 (tall x 0.480-1.000 y 0.448-0.885, wide x 0.602-0.931 y 0.290-0.858), still PASS | intact |

Rows out: 2 -> 2 (the same two baseline out-rows, both pinned at 0.00 dE).
Visual read: the sheets read identically to p47 at frame scale — same gravel
courses, same cake-layer read, same crowns/moss/boulders against the hero.
No de-blue step is visible anywhere; coarser grain couples to the window
median at ~0.0 levels per octave. The visual keep bar fails outright.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target median is pinned at every scored scale (0.00 dE; only a −0.05
level mean whisper in the right direction) and the sheets show no step, so
neither half of the keep test passes. Nothing breaks — DoD floors intact
(wide p1 float-identical at 4.0722), no passing row changes status, S2 PASS
both, VRAM gate clear — but keep needs movement toward the hero or a
visible step, and this pass has neither. A reverted pass moves nothing: p47
stays the kept baseline.

Learning: the grain-statistics cell is now MAPPED and CLOSED. A full octave
of coarser gravel (albedo and micro-normals registered, same lamp, same
tint/hue/value) moves the wide pebble median zero levels: the window's B
excess (+14 levels with R/G matched) is invariant not just to lamp photons
(p49) and every global channel knob (p6/p8/p10/p11/p23/p33/p34/p37), but to
the lit-face/crevice mix at 2x grain. The blue is per-pixel — facet
orientation and sky-ambient coupling at sub-grain scale, or the texture's
own floor below what multiply can reach — not a statistic any mapping
rescale can rebalance. Do not touch gravel mapping scale again for pebble.
The one pebble mechanism blessed but never tried is a window-composition
change that puts different pixels under the lamp (p49 learning): flipping
the recessed middle course's grav flag 1 -> 0 would swap its shadowed
gravel pixels for soil-target cliff pixels in BOTH out-row windows at one
flag. Dose-response note: texture statistics couple to the wide pebble
median at ~0.0 levels per octave — this path is inert, not merely weak.
Tool note stands: score k-cluster-adjacent claims on medians only
(basalt/moss k-shares reshuffled again this pass while every median held
hex-identical).

Next ranked gaps (baseline still p47, still 2 rows out):

1. wide 4g pebble median, gap 1.0 (7.77; material path closed p6/p8/p10/
   p11/p23/p33/p34/p37, lamp map closed p26/p28/p29/p30/p39/p40/p43/p45/
   p49 from both sides, texture statistics closed by this pass — accept at
   gap 1.0, within 3% of bar 8; the only untried mechanism left is the
   grav-flag composition flip (middle recessed course 1 -> 0, both
   out-row windows at one flag), else asset work only: a genuinely
   low-blue gravel albedo, which no knob on the current texture can reach)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42,
   basalt-spec bounce mapped as AWAY by p48 — accept at gap 1.0, or asset
   work only)

Visual gaps (read the sheets): shaggy overhanging moss cap, dense dark
spruces vs open saplings (tint cell mapped at x0.85, count cell closed by
p46 — deeper/hue doses remain but stay under the p47 advisory visual bar:
no further crown dose without a VISIBLE step), rugged uneven strata vs flat
cake layers, sheened boulders (specular path falsified p48 — needs bounced
light or asset work, not more spec). Remaining unspent modelling cells, all
with known collateral: moss-cap relief as TEXTURE not geometry (bump, never
tried; turf/moss medians are the collateral), crown branch geometry with
visual bar, strata SHAPE per-layer thickness variation as SHAPE (disp/
ledge/prot/thickness magnitudes all spent — needs bigger work than a
one-knob pass), deeper/hue fir-crown darkening (advisory: visible step or
revert).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p50 grain change, then restored to the p47-kept content by the revert —
verified: md5 a525d9cce1700572506ba557df6454ae both sides) and
`~/hero3d/out/still-223/p50/` (fresh pass dir, both framings in one shot).
Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / free 19G (precheck
device 1503/12282 MiB free 10779). This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in the worktree-local `.review-venv/
review-inputs/` (untracked, never committed) with `--hero-s0-csv` (the tool
re-verifies both pins itself); hero panels are the 960-px copies there
(values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p50/`
(git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-50/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/
vram/precheck/azimuth/exit_code logs). No new assets (procedural knob only
— nothing to source or licence). `scripts/hero/still.py` reverts to the p47
content, so it carries no diff.
