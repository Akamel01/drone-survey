# Pass 43: WideFill R+B cut at constant chroma power — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p43 (`~/hero3d/out/still-223/p43/`, fetched to
`hero3d-local/p43/` — git-ignored work files; the committed record is this dir).
No stale p43 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.0 (dE76 7.77, ours #2F2E1E vs union
#2D2C10 — R 47 vs 45 (+2), G 46 vs 44 (+2), B 30 vs 16 (+14)). The
pass-42 Next section ranks this gap #1 and names exactly one remaining
untried cell on it: the p28-literal R+B-cut variant (0.75, 1.01, 0.30) —
p28's full-vector R+B cut with the freed 0.33 compensated fully into G so
the chroma sum stays 2.06. Every other lamp angle is spent: full-vector at
fixed energy away +2.04 (p28), B-selective with compensation away +1.30
(p39), R-selective with compensation away +2.71 (p40); tint/albedo spent,
hue spent (p37); power bounded both sides (p27/p29).

Hypothesis: cutting R (1.0 -> 0.75, the overshot channel, back toward
0x2D) and B (0.38 -> 0.30, the +14 channel, slowing its growth) together,
with the full compensation into G (0.68 -> 1.01, the channel nearest its
union target) holding total chroma power exactly, moves the wide pebble
median toward #2D2C10 without p28's darkening/desaturation failure,
because per-channel lamp add scales with colour (p26/p29 mapping) and
total power is held. The tall framing never sees the lamp (hidden in
render_shot) so the tall-pebble margin (2.25 over bar 8) and the tall soil
row are protected by construction. No geometry, camera, sky or cloud
change, so silhouette/S2 hold. Scored on the wide pebble median plus
DoD/passing-row intactness. Keep iff toward with no passing-row/DoD
breakage. Predicted low odds: both single cuts rebalanced through the
compensation channel with B rising every time.

## What changed (`scripts/hero/still.py`, REVERTED)

One lamp colour only: `WideFill` (1.0, 0.68, 0.38) -> (0.75, 1.01, 0.30),
plus the docstring clause above it. Energy 0.75, angle 5°, frontal
direction, tall-framing hide, sibling tints, pebble hue (0.56), cameras,
sky, ridges untouched. No new assets (procedural knob only). Reverted
after scoring, so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p43)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact, #2C2D21 vs
#2D2C10 = 10.48 exact; gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per
the p19 precedent). "Hex-identical" means median hex strings compare ==;
"float-identical" means JSON values compare == to all stored decimals (full
p35-vs-p43 JSON diff over tall+wide 4a–4i, not by eye; differing cells
tabulated below, all else identical). Unions: tall soil #1B1E24, tall
pebble #212111, wide pebble #2D2C10, wide soil #252729, wide moss #384117
(per the look spec §4g / pass 28).

| framing | row | p35 | p43 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2C2D21, 10.48, gap 1.3 | AWAY +2.71 (R 47->44: cut overshot past union 45 by −1; G 46->45 toward 44; B 30->33 away from 16 — the pinned channel rose a third time) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 / share 0.03491 | meanV 47.5259 / meanS 0.30199 / share 0.03659 | −2.20 levels / −0.078 S — the p28/p40 darkening/desaturation signature recurred despite constant chroma power |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED; means ±0.0001 levels (denoise) — lamp-hide protection held |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact |
| tall | 4g all other medians | moss/basalt/turf hexes | hex-identical | status unchanged (means at 1e-4/1e-5 denoise scale) |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F312C, 6.56, gap 0.8 | AWAY +0.58, still in |
| wide | 4g moss median | #353E0B, 4.68, gap 0.6 | #333E0B (R −2 LSB), 4.79, gap 0.6 | +0.11, still in |
| wide | 4g basalt median | #0D0D0D | #0C0E0D (1-LSB drift class, p29 precedent) | still in |
| wide | 4g turf median | #2B3511 | #2B3611 (G +1 LSB) | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 | 2.0 | float-identical | intact |
| wide | 4d floor p1 / p5 | 4.0722/8.8556 | 4.7152/8.8596 | DoD p1 gate (<= 8) holds; p5 not a DoD row |
| wide | 4d p50 | 72.2812 | 73.2632 (+0.98) | denoise-domain, not a DoD row |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 6th-decimal moves | still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38204 / 0.35060 | still in |
| tall | 4h dark area | 30.84093 % | float-identical | still in |
| wide | 4h dark area | 14.23221 % | 14.82424 % (+0.59 pp) | past the in-precedent max (p28: 14.63 in; hero s0 13.97) — watched; moot under revert, restored with it |
| tall/wide | 4a | — | max abs move ~0.006 dE (wide horizon rows, lamp-domain) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.84 (+0.00 %)/420.04 (+0.49 %); sigma px +0.002 | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Rows out: 2 -> 2 (target 1.0->1.3 away, tall soil pinned; net across the
two out-rows +2.71).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read (p35-vs-p43 PNG mean-abs diff 0.000/0.091 levels tall/wide,
p99 0/2, max 3/9 on isolated denoise pixels; the tall frame is
bit-identical at frame scale — the hide held perfectly); the known visual
gaps (rugged strata, moss cap, spruces, boulder sheen) persist unchanged;
no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +2.71 dE (gap 1.0 -> 1.3): the R cut
overshot past the union (−1) while B — the channel this lever cannot
touch — rose +3 and dominated in Lab, with the p28/p40 darkening/
desaturation signature recurring (meanV −2.20, meanS −0.078) despite
constant chroma power. The keep rule is scored on the target dE, and +2.71
is not borderline. DoD floors hold (tall float-identical, wide p1 4.72 <=
8), S2 character-identical PASS, 4i bands identical, VRAM gate clear;
wide 4h drifted past its in-precedent (+0.59 pp) but is restored by the
revert rather than ruled on. A clean falsification, not a breakage. A
reverted pass still counts as the intentional pass.

Learning: the WideFill chroma lever is now CLOSED in all four tried
directions — full-vector at fixed energy (p28: +2.04), B-selective with
compensation (p39: +1.30), R-selective with compensation (p40: +2.71),
R+B combined with full G compensation (this pass: +2.71 with the same R
overshoot and B rise as p40). Any lamp-colour cut rebalances through the
compensation/mix-shift channel while B — geometrically pinned under
frontal light (p26/p29: +6R/+4G/+0B) — rises relatively every time, and
the window darkens/desaturates regardless of the power bookkeeping. Do
not retry a WideFill colour change at any dose or compensation; lamp power
is bounded both sides (p27/p29). The tall-hide confinement re-confirmed
(all tall medians hex-identical, tall 4d float-identical, tall PNG
mean-abs 0.000).

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; accept-first — every lamp angle
   now spent including this pass, tint/albedo spent, hue spent p37; no
   untried parameter cell remains — accept at gap 1.0, within 3% of bar 8,
   or modelling work only)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42 —
   no untried tint cell remains; hue-side barred, hue walk spent — accept
   at gap 1.0, or modelling work only)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders. These are now the only unspent levers on either row —
modelling/asset work, untouched since pass 17/18 except
protrusion/thickness colour-levers, kept small and procedural.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p43 lamp-chroma change, then restored to the p35-kept content by the
revert — verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p43/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in the
worktree-local `.review-venv/review-inputs/` (untracked, never committed)
with `--hero-s0-csv` (the tool re-verifies both pins itself); hero panels
are the 960-px copies there (values from CSV). Review under the
worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p43/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-43/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39/p40/p41/p42 precedent). No new assets
(procedural knob only — nothing to source or licence).
