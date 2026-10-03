# Pass 39: WideFill B-halving at constant chroma power — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p39 (`~/hero3d/out/still-223/p39/`, fetched to
`hero3d-local/p39/` — git-ignored work files; the committed record is this dir).
No stale p39 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.0 (dE76 7.77, ours #2F2E1E vs union
#2D2C10 — R 47 vs 45, G 46 vs 44, B 30 vs 16). B (+14) is the dominant
residual and the one channel no pass has directly moved at median scale:
MULTIPLY-B spent (p6: wide unmoved; p11 B-only: wide unmoved), tint closed
(p23), hue never moved B at any tested angle (p37), lamp power bounded both
sides (p27/p29), full-vector lamp chroma spent (p28 — but it cut total
power, the documented failure mode). The remaining B angle the record had
not tried is a B-selective lamp cut that holds chroma power constant.

Hypothesis: halving the WideFill B channel only
((1.0, 0.68, 0.38) -> (1.0, 0.87, 0.19), R pinned, energy 0.75 untouched —
the p35 x0.5 falsification factor on the outlier channel, the freed 0.19
compensated fully into G so the chroma sum stays 2.06) moves the wide
pebble median B down toward 0x10 without p28's darkening/desaturation
failure, because p26/p28 mapped the median as tracking total fill power
more than chroma and the power is held exactly here; the tall framing never
sees the lamp (hidden in render_shot) so the tall-pebble margin (2.25 over
bar 8) and the tall soil row are protected by construction. R predicted
near-pinned (within 2 LSB, p27/p29 overshoot risk if fed — hence pinned);
wide soil (in, gap 0.7), moss and basalt watched, they take the fill. No
geometry, camera, sky or cloud change, so silhouette/S2 hold. Scored on the
wide pebble median plus DoD/passing-row intactness. Keep iff toward with
no passing-row/DoD breakage.

The p28-literal R+B-cut variant ((0.75, 1.01, 0.30)) was considered and set
aside for this pass: R sits within 2 LSB of the union and p28's R cut
overshot past it (46->43), while B is +14 out — dose the outlier channel
first, one lever.

## What changed (`scripts/hero/still.py`, REVERTED)

One lamp colour only: `WideFill` (1.0, 0.68, 0.38) -> (1.0, 0.87, 0.19),
plus the docstring clause above it. Energy 0.75, angle 5°, frontal
direction, tall-framing hide, sibling tints, pebble hue (0.56), cameras,
sky, ridges untouched. No new assets (procedural knob only). Reverted
after scoring, so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p39)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p35-vs-p39
JSON diff over tall+wide 4a–4i, not by eye; 159 cells differ, all
denoise-domain, k-means reshuffle, or tabulated below). Unions: tall soil
#1B1E24, tall pebble #212111, wide pebble #2D2C10, wide soil #252729 (per
the look spec §4g).

| framing | row | p35 | p39 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2D2D1F, 9.07, gap 1.1 | AWAY +1.30 (R 47->45 matched exactly; G 46->45 toward 44; B 30->31 away from 16 — the dosed channel rose) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 / share 0.03491 | meanV 48.2057 / meanS 0.33650 / share 0.04051 | −1.52 levels / −0.044 S — the p28 darkening/desaturation signature recurred despite constant chroma power |
| wide | 4g pebble k-clusters | k1 #323020 / k2 #202013 / k3 #484531 | k1 #333221 / k2 #202016 / k3 #484733 | B +1/+3/+2 in ALL three clusters — systematic, not noise; class mix reshuffled (k-shares 0.448->0.410 / 0.331->0.402 / 0.221->0.188, non-permutation scale) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED; means −0.0001 levels (denoise) — lamp-hide protection held |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact; means ±0.00003 |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | hex-identical, 5.98, gap 0.7 | PINNED; means −0.23 levels / −0.0008 S — watched collateral, no status change |
| wide | 4g moss median | #353E0B, 4.68, gap 0.6 | #343E0B (R −1 LSB), 4.71, gap 0.6 | +0.03, still in; means +0.09 levels / +0.006 S |
| wide | 4g basalt median | #0D0D0D | #0D0D0C (B −1 LSB) | 1-LSB drift class (p29 precedent), still in; means −0.13 levels |
| wide | 4g turf median | #2B3511 | #2B3611 (G +1 LSB) | status unchanged (vs_517046 25.14->24.62, toward −0.52, informational) |
| wide/tall | 4g moss/basalt/turf (tall) | #313B0A / #0A0B0C / #283212 | hex-identical | status unchanged; tall turf k-labels reshuffled at ±1-5 LSB (sub-LSB render dither, informational — medians identical, means ±0.0002) |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 | 2.0/4.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d p5 / p50 | 8.8556/72.2812 | 8.8596/72.9812 (+0.004/+0.70) | not DoD rows (p5/p50 precedent) |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 4th-6th-decimal moves | still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38627 / 0.35454 (−0.0046/−0.0041) | still in (moved toward band; was in at 0.39083) |
| tall | 4h dark area | 30.84093 % | 30.84072 % (−0.0002 pp) | still in |
| wide | 4h dark area | 14.23221 % | 14.53379 % (+0.30 pp) | still in (p28 precedent: 14.63 in; hero s0 13.97) |
| tall/wide | 4a | — | same tokens, max abs move ~0.0005/~0.004 dE (wide horizon rows, lamp-domain) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.84 (−0.0003 %)/419.91 (+0.46 %); sigma px ±0.001 | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | bloom float-identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Rows out: 2 -> 2 (same two rows; target 1.0->1.1 away, tall soil pinned;
net across the two out-rows +1.30).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~50 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +1.30 dE (gap 1.0 -> 1.1), and the dosed
channel is what rose: lamp B halved, rendered B +1 on the median and
+1/+3/+2 across all three k-clusters, while R matched the union exactly
and G improved. R/G improving does not save it — the keep rule is scored
on the target dE, and a +1.30 move is not borderline. Nothing else broke:
DoD floors float-identical on both framings, all passing rows held
status, S2 character-identical PASS, 4i bands identical, VRAM gate clear —
a clean falsification, not a breakage. A reverted pass still counts as
the intentional pass.

Learning: the WideFill B path is now closed at falsification dose, and
with it the last untried B angle on this row (MULTIPLY p6/p11, tint p23,
hue p37, power p26/p29, full-vector chroma p28 all spent before). Lamp B
does not address median B: halving it raised rendered B systematically
while the p28 darkening/desaturation signature recurred (meanV −1.52,
meanS −0.044) DESPITE constant chroma power — the median tracks more
than lamp-colour-sum, and the G compensation rebalanced the class mix
darker (shares +16 %, k-shares at non-permutation scale). The window
reads facets where lamp B is geometrically pinned (p26 mapping: lamp
add +6R/+4G/+0B), so a lamp-B cut can only ever act through the
compensation channel — which is what moved, the wrong way. Do not retry
a lamp-B cut at any dose. The tall-hide confinement re-confirmed (all
tall medians hex-identical, tall 4d float-identical).

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; every B angle now spent including
   this pass — remaining is only the p28-literal R+B-cut variant
   (0.75, 1.01, 0.30), low odds given p28's R overshoot and this pass's
   mix-shift, or accept)
2. tall 4g soil median, gap 1.0 (7.70; neutral albedo spent p36,
   G-selective spent p38 — remaining untried is single-course x0.5
   extended to sediment or topsoil, p35-style falsification dose on a
   course the window may not read, watching wide soil; hue-side barred,
   hue walk spent)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p39 lamp-chroma change, then restored to the p35-kept content by the
revert — verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p39/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in
`/tmp/review223` with `--hero-s0-csv` (the tool re-verifies both pins
itself); hero panels are the 960-px copies there (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never
committed); fetched renders under `hero3d-local/p39/` (git-ignored,
never committed). Committed with this pass:
`docs/research/hero-blender-still/pass-39/` only (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/
azimuth/exit_code logs) — no `still.py` change (reverted; p36/p37/p38
precedent). No new assets (procedural knob only — nothing to source or
licence).
