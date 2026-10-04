# Pass 49: WideFill blue halved at fixed energy and fixed R/G (p39 without the compensation) — measured, REVERTED

Base: pass-47 p47 (`~/hero3d/out/still-223/p47/` on akamel-linux), 2 rows out.
This pass's render: p49 (`~/hero3d/out/still-223/p49/`, fetched to
`hero3d-local/p49/` — git-ignored work files; the committed record is this dir).
No stale p49 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot. Takes the pass-48 Next section's #1 (wide
4g pebble median, gap 1.0) with the one lamp dose the mapping record leaves
untested.

## The one gap + hypothesis

Gap: wide 4g pebble median #2F2E1E vs union #2D2C10 (dE 7.77, gap 1.0).
Channel residual is B-selective: B 30 vs 16 (−14 levels, ~3x in linear)
with R/G matched within 2. Material path closed (MULTIPLY B saturates per
p11; Value cuts R/G away per p10; Saturation-up pushes R/G away per p8/p23;
hue peaked at 0.56 per p37; tint wide-inert per p6/p23-era windows), and the
lamp cell looked closed — BUT every lamp B dose on record carried a
compensation: p39 halved B 0.38 -> 0.19 while re-chroming G 0.68 -> 0.87 to
hold power (dosed channel ROSE, +1.30 AWAY), p43/p40 re-chromed at constant
power, p30 rotated R. A pure B cut at fixed energy and fixed R/G was never
rendered, so p39's failure is attributable to its G compensation
(interreflection from +28 % green photons), not to the B cut itself.

Hypothesis: cutting WideFill blue 0.38 -> 0.19 at fixed energy 0.75 and
fixed R/G (the exact p39 B dose, no compensation) moves wide pebble toward
#2D2C10, because the window's B excess is direct blue photons on the
camera-facing gravel facets and nothing replaces them — R/G photons held
constant, so R/G cannot overshoot the way p39's did. Scored on the wide
pebble median FIRST, plus wide soil (same lit faces, B also over at 44 vs
41), plus DoD/floor/4h intactness. Collateral watch: wide 4d p1 (p47 4.0722
vs bar <= 8), wide 4h (p47 13.823 vs 14.8 ceiling), tall-pebble margin (2.25
over bar 8 — tall never sees the fill, protected by construction). Visual
keep bar: a visible blue-cut step on the gravel courses, else revert.

## What changed (`scripts/hero/still.py`, REVERTED)

One lamp channel only: `WideFill` colour (1.0, 0.68, 0.38) -> (1.0, 0.68,
0.19), plus a pass-49 docstring clause (reverted with it). Energy 0.75,
angle 5°, frontal direction, tall-framing hide, sibling tints, pebble hue
(0.56), cameras, sky, ridges untouched. No new assets (procedural knob
only). Reverted, so `still.py` is byte-identical to the p47 kept content
(md5 a525d9cce1700572506ba557df6454ae both sides); the host stage copy was
restored to the same file and re-verified.

## What moved (p47 -> p49)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
hex-identical medians carry the identical dE by construction: wide pebble
#2F2E1E vs #2D2C10 = 7.77, tall soil #292A29 vs #1B1E24 = 7.70; gap = dE/8
per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent; 4h gap =
|v − 12.3|/2.46 per the pass-5 12.3 ±20 % spec, ceiling 14.8).
"Hex-identical" means median hex strings compare ==. Full p47-vs-p49
scorecard diff: tall framing identical to 3rd–5th-decimal noise (the fill
is hidden there); wide moves are lamp-scale only. k-shares reshuffled again
both framings while medians held — scored on medians only per the standing
tool note.

| framing | row | p47 | p49 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED — the pure B cut buys zero median levels |
| wide | 4g pebble sub-median | meanV 49.7211 / meanS 0.38026 | meanV 49.6389 / meanS 0.38884 | whisper toward (−0.08 levels, +0.008 S) — right direction, sub-quantization, not a move |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | hex-identical | PINNED (meanV −0.31 levels, median unmoved) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical | PINNED (baseline out-row untouched) |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical | PINNED — tall-pebble margin intact |
| tall/wide | 4g turf medians | #273111 4.36 / #2B3410 9.04 | hex-identical | PINNED |
| tall/wide | 4g moss medians | #313B0A / #353E0B | hex-identical | PINNED |
| tall/wide | 4g basalt medians | #0A0B0C / #0D0D0D | hex-identical (wide meanV −0.22, median unmoved) | PINNED |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | 2.0/4.0722/8.7874 | p0_1/p1 float-identical — DoD p1 gate holds at 4.0722; p5 −0.07 (not a DoD row) |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact |
| wide | 4h dark area | 13.82296 %, gap 0.6 | 13.83870 % (+0.016), gap 0.6 | noise — ceiling margin 0.98 -> 0.96 pp, never approached |
| tall | 4h dark area | 30.15915 % | 30.15915 % (4th-decimal) | PINNED |
| wide/tall | 4h edge density | 0.25259 / 0.57144 | 0.25260 / 0.57144 | pinned |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36420 / 0.25228 | 0.36420 / 0.25228 | identical to shown decimals, still in |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39110 / 0.35894 | 0.38918 / 0.35721 | still in (small moves, same side; p10 precedent: 0.388 at band edge, in) |
| tall/wide | 4a | — | 3rd–5th-decimal moves (e.g. wide 0.10 anchor 9.02584 -> 9.02588) | status unchanged, all anchors within the ΔE <= 10 bar |
| tall/wide | 4e DOF | lapvar D1 667.13/422.44 | 667.13 (−0.00 %)/421.90 (−0.13 %); σ within ±25 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | bloom_peak_L 168.20/174.40 identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; bboxes identical to p47 (tall x 0.480-1.000 y 0.448-0.885, wide x 0.602-0.931 y 0.290-0.858), still PASS | intact |

Rows out: 2 -> 2 (the same two baseline out-rows, both pinned at 0.00 dE).
Visual read: the sheets read identically to p47 at frame scale — same gravel
courses, same cake-layer read, same crowns/moss/boulders against the hero.
No blue-cut step is visible anywhere; the lamp couples to the window at
~0.1 level per halved B, below what any eye or median can score. The visual
keep bar fails outright.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target median is pinned at every scored scale (0.00 dE; only a −0.08
level mean whisper in the right direction) and the sheets show no step, so
neither half of the keep test passes. Nothing breaks — DoD floors intact
(wide p1 float-identical at 4.0722), no passing row changes status, S2 PASS
both, VRAM gate clear — but keep needs movement toward the hero or a
visible step, and this pass has neither. A reverted pass moves nothing: p47
stays the kept baseline.

Learning: the WideFill-B cell is now MAPPED from both sides and CLOSED.
p39 (halved B WITH G 0.68 -> 0.87 compensation): dosed channel rose +1
level, +1.30 dE AWAY. This pass (same B dose, NO compensation): dosed
channel flat, 0.00 dE. Together they prove the ±3 % pebble window's blue is
not direct fill-B photons at any scored scale — halving the blue lamp moves
the median zero levels with R/G held, and raising the green compensation
moves it the wrong way. The window's B excess (+14 levels, ~3x in linear)
must arrive downstream of every lamp knob: sky-ambient in shaded pixels and
the texture path's own floor (MULTIPLY B saturates per p11). Do not touch
any WideFill channel again for pebble without a new mechanism (e.g. a
window-composition change that puts different pixels under the lamp, not
more lamp doses on these pixels). Dose-response note: the lamp couples to
the wide pebble median at ~0.0 levels per halved B — this path is inert, not
merely weak. Tool note stands: score k-cluster-adjacent claims on medians
only (basalt/moss/pebble/soil/turf k-shares all reshuffled this pass while
every median held hex-identical).

Next ranked gaps (baseline still p47, still 2 rows out):

1. wide 4g pebble median, gap 1.0 (7.77; material path closed p6/p8/p10/
   p11/p23/p33/p34/p37, lamp map closed p26/p28/p29/p30/p39/p40/p43/p45/
   p49 from both sides — accept at gap 1.0, within 3% of bar 8, or asset
   work only: a genuinely low-blue gravel albedo, which no multiply, hue,
   value, saturation or lamp dose on the current texture can reach)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42,
   basalt-spec bounce mapped as AWAY by p48 — accept at gap 1.0, or asset
   work only)

Visual gaps (read the sheets): shaggy overhanging moss cap, dense dark
spruces vs open saplings (tint cell mapped at x0.85, count cell closed by
p46 — deeper/hue doses remain but stay under the p47 advisory visual bar:
no further crown dose without a VISIBLE step), rugged uneven strata vs flat
cake layers, sheened boulders (specular path falsified p48 — needs bounced
light or asset work, not more spec). Remaining unspent modelling cells, all
with known collateral: moss-cap shag/drapes geometry (never tried;
turf/moss medians are the collateral), strata SHAPE per-angle course
variation (disp/ledge/prot/thickness magnitudes all spent — needs bigger
work than a one-knob pass), deeper/hue fir-crown darkening (advisory:
visible step or revert).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p49 lamp change, then restored to the p47-kept content by the revert —
verified: md5 a525d9cce1700572506ba557df6454ae both sides) and
`~/hero3d/out/still-223/p49/` (fresh pass dir, both framings in one shot).
Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / free 19G (precheck device 1503/12282 MiB free 10779). This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in the worktree-local `.review-venv/
review-inputs/` (untracked, never committed) with `--hero-s0-csv` (the tool
re-verifies both pins itself); hero panels are the 960-px copies there
(values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p49/`
(git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-49/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/
vram/precheck/azimuth/exit_code logs). No new assets (procedural knob only
— nothing to source or licence). `scripts/hero/still.py` reverts to the p47
content, so it carries no diff.
