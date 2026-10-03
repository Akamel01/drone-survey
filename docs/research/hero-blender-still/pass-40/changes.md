# Pass 40: WideFill R-selective re-chrome at constant chroma power — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p40 (`~/hero3d/out/still-223/p40/`, fetched to
`hero3d-local/p40/` — git-ignored work files; the committed record is this dir).
No stale p40 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.0 (dE76 7.77, ours #2F2E1E vs union
#2D2C10 — R 47 vs 45 (+2), G 46 vs 44 (+2), B 30 vs 16 (+14)). The lamp-B
path closed in p39 (B-halving at constant chroma power raised rendered B
systematically — facets geometrically pin lamp B), hue is spent (p37:
third step walked G/B away, B never moved at any angle), power is bounded
both sides (p27/p29: R overshoot measured, now +2 past the union), and the
p28 full-vector re-chrome cut total power (the documented failure mode).
The one remaining lamp angle is the overshot channel alone: p29 measured
R crossing from matched to overshot and named the bound (another +25%
dose adds ~+1R/+1G with B pinned, so R runs away), but no pass has ever
cut R selectively.

Hypothesis: cutting the WideFill R channel only
((1.0, 0.68, 0.38) -> (0.75, 0.93, 0.38), the p28 R dose, the freed 0.25
compensated fully into G so the chroma sum stays 2.06, B pinned, energy
0.75 untouched) moves the wide pebble median R back toward 0x2D without
p28's darkening/desaturation failure, because per-channel lamp add scales
with colour (p26/p29 mapping: +6R/+4G/+0B) and total power is held exactly;
the known cost is G (already +2, absorbs the compensation — low odds, hence
accept-first framing), while B is geometrically pinned and not expected to
move via this lever. The tall framing never sees the lamp (hidden in
render_shot) so the tall-pebble margin (2.25 over bar 8) and the tall soil
row are protected by construction. No geometry, camera, sky or cloud
change, so silhouette/S2 hold. Scored on the wide pebble median plus
DoD/passing-row intactness. Keep iff toward with no passing-row/DoD
breakage.

The tall-soil single-course sediment/topsoil x0.5 was considered and set
aside for this pass: it is the orchestrator's rank 2 and stays untried,
while the R-cut is the last untried lamp angle on the rank-1 gap — one
lever, one framing, full tall confinement.

## What changed (`scripts/hero/still.py`, REVERTED)

One lamp colour only: `WideFill` (1.0, 0.68, 0.38) -> (0.75, 0.93, 0.38),
plus the docstring clause above it. Energy 0.75, angle 5°, frontal
direction, tall-framing hide, sibling tints, pebble hue (0.56), cameras,
sky, ridges untouched. No new assets (procedural knob only). Reverted
after scoring, so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p40)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p35-vs-p40
JSON diff over tall+wide 4a–4i, not by eye; 182 cells differ, all
denoise-domain, k-means reshuffle, or tabulated below). Unions: tall soil
#1B1E24, tall pebble #212111, wide pebble #2D2C10, wide soil #252729 (per
the look spec §4g).

| framing | row | p35 | p40 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2C2D21, 10.48, gap 1.3 | AWAY +2.71 (R 47->44: cut overshot past union 45 by −1; G 46->45 toward 44; B 30->33 away from 16 — the pinned channel rose again) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 / share 0.03491 | meanV 47.3390 / meanS 0.29792 / share 0.03680 | −2.38 levels / −0.082 S — the p28 darkening/desaturation signature recurred despite constant chroma power |
| wide | 4g pebble k-clusters | k1 #323020 / k2 #202013 / k3 #484531 | k1 #2D2E22 / k2 #1D1E16 / k3 #434430 | B +2/+3 in the two darker clusters (systematic, not noise); brightest cluster R −5/G −1/B −1 |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED; means ±0.00001 levels (denoise) — lamp-hide protection held |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact; k-hexes identical, means ±0.00005 |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F302C (R −1 LSB), 5.86, gap 0.7 | TOWARD −0.12, still in; means −0.33 levels / +0.007 S — watched collateral, no status change |
| wide | 4g moss median | #353E0B, 4.68, gap 0.6 | #333E0B (R −2 LSB), 4.79, gap 0.6 | +0.11, still in |
| wide | 4g basalt median | #0D0D0D | #0C0D0D (G −1 LSB) | 1-LSB drift class (p29 precedent), still in |
| wide | 4g turf median | #2B3511 | #2B3611 (G +1 LSB) | status unchanged (vs_517046 toward, informational) |
| wide/tall | 4g moss/basalt/turf (tall) | #313B0A / #0A0B0C / #283212 | hex-identical | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 | 2.0 | float-identical | intact |
| wide | 4d floor p1 / p5 | 4.0722/8.8556 | 4.7152/8.7874 | DoD p1 gate (<= 8) holds; p5 not a DoD row |
| wide | 4d p50 | 72.2812 | 73.0506 (+0.77) | denoise-domain, not a DoD row |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 4th-6th-decimal moves | still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38469 / 0.35302 | toward band both (spec means 0.384/0.320 per p26), still in |
| tall | 4h dark area | 30.84093 % | 30.84113 % (+0.0002 pp) | still in |
| wide | 4h dark area | 14.23221 % | 14.74764 % (+0.52 pp) | past the in-precedent max (p28: 14.63 in; hero s0 13.97) — watched; moot under revert, restored with it |
| tall/wide | 4a | — | same tokens, max abs move ~0.005 dE (wide horizon rows, lamp-domain) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.85 (+0.00 %)/419.30 (+0.32 %); sigma px +0.002 | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | bloom float-identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Rows out: 2 -> 2 (target 1.0->1.3 away, tall soil pinned;
net across the two out-rows +2.71).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +2.71 dE (gap 1.0 -> 1.3): the R cut
overshot past the union (−1) while B — the channel this lever cannot
touch — rose +3 and dominated in Lab, with the p28 darkening/
desaturation signature recurring (meanV −2.38, meanS −0.082) despite
constant chroma power. G improving does not save it — the keep rule is
scored on the target dE, and +2.71 is not borderline. DoD floors hold
(tall float-identical, wide p1 4.72 <= 8), S2 character-identical PASS,
4i bands identical, VRAM gate clear; wide 4h drifted past its
in-precedent (+0.52 pp) but is restored by the revert rather than ruled
on. A clean falsification, not a breakage. A reverted pass still counts
as the intentional pass.

Learning: the R-selective lamp path is now falsified at dose, and with it
constant-power WideFill chroma rotation is spent in both tried directions
(B-cut p39: +1.30 with B rising; R-cut this pass: +2.71 with B rising
again). Any lamp-colour cut rebalances through the compensation/mix-shift
channel and B — geometrically pinned under frontal light (p26/p29:
+6R/+4G/+0B) — rises relatively every time. Do not retry a WideFill
chroma cut at any dose or compensation. The tall-hide confinement
re-confirmed (all tall medians hex-identical, tall 4d float-identical,
tall k-hexes identical).

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; accept-first — every lamp angle
   now spent including this pass (power p27/p29, full-vector chroma p28,
   B-selective p39, R-selective p40), tint/albedo spent, hue spent p37;
   remaining is only the p28-literal R+B-cut variant (0.75, 1.01, 0.30),
   low odds: it cuts total power, the documented failure mode — or accept
   at gap 1.0, within 3% of bar 8)
2. tall 4g soil median, gap 1.0 (7.70; neutral albedo spent p36,
   G-selective spent p38 — remaining untried is single-course x0.5
   extended to sediment or topsoil alone, p35-style falsification dose on
   a course the window may not read, watching wide soil; hue-side barred,
   hue walk spent)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p40 lamp-chroma change, then restored to the p35-kept content by the
revert — verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p40/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in the
worktree-local `.review-venv/review-inputs/` (untracked, never committed)
with `--hero-s0-csv` (the tool re-verifies both pins itself); hero panels
are the 960-px copies there (values from CSV). Review under the
worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p40/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-40/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39 precedent). No new assets (procedural knob
only — nothing to source or licence).
