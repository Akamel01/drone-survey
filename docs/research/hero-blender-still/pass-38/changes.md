# Pass 38: dark-soil G-selective albedo x0.5 — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p38 (`~/hero3d/out/still-223/p38/`, fetched to
`hero3d-local/p38/` — git-ignored work files; the committed record is this dir).
No stale p38 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70, ours #292A29 vs union
#1B1E24 — R 41 vs 27, G 42 vs 30, B 41 vs 36). Neutral soil-albedo
darkening is spent on this row (p35 single-course 2x: −0.69 toward; p36
family-wide same factor: +0.36 away with G pinned), and p36's learning
names the residual G-selective: neutral darkening closed R/B a step while G
stayed pinned and dE rose, so G (ours 42 vs union 30) is the Lab outlier.
The G-selective lever has been prescribed since p36 and never tried.

Hypothesis: halving the dark-soil course's G channel only
(0.0055/0.0065/0.0088 -> 0.0055/0.00325/0.0088, R/B pinned,
prot/thickness/grav untouched, p35's proven falsification factor on one
channel — derived, not tuned) moves the tall soil median toward #1B1E24,
because the dark-soil course is what the window reads (p35) and only its G
is in excess after neutral darkening steepened the residual. Tint is
pebble-inert at single-course dose (p21/p35), so wide/tall pebble are
predicted near-pinned (tall-pebble margin 2.25 guarded by construction);
wide soil (in, gap 0.7) is watched — p36 showed the soil windows read
different mixes. No geometry, lamp, camera, sky or cloud change (no tall
lamp move at all), so silhouette/S2 hold. Scored on the tall soil median
plus DoD/passing-row intactness. Keep iff toward with no
passing-row/DoD breakage.

The wide-pebble B-channel attack was considered and set aside: the MULTIPLY
B path is spent on that row (p6: wide unmoved; p11 B-only: wide unmoved,
tall-only −1 blue level; p23 closed tint there), hue never moved B at any
tested angle (p37), and the remaining B path (WideFill chroma) sits inside
mapped lamp coupling (p28) — while G-selective is untried with a clean
dose-response behind it (p35's factor on p35's course).

## What changed (`scripts/hero/still.py`, REVERTED)

One knob dimension only: the LAYERS dark-soil row G tint 0.0065 ->
0.00325, plus the comment above it. Sibling soil/sediment tints,
thicknesses, prot values, grav flags, pebble hue (0.56), lamps, cameras,
sky, ridges untouched. No new assets (procedural knob only). Reverted
after scoring, so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p38)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified exact: #302F2C vs #252729 = 5.38, #292A29 vs #1B1E24 = 7.70;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p35-vs-p38
JSON diff over tall+wide 4a–4i, not by eye; 180 cells differ, all
denoise-domain, k-means reshuffle, 1e-20/1e-21 float noise, or tabulated
below). Unions: tall soil #1B1E24, tall pebble #212111, wide pebble
#2D2C10, wide soil #252729 (per the look spec §4g).

| framing | row | p35 | p38 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED 0.00 (R/G/B all pinned — the G cut did not reach the median) |
| tall | 4g soil sub-median | meanV 49.7076 / meanS 0.17017 / share 0.32336 | meanV 49.6866 / meanS 0.17077 / share 0.32362 | −0.02 levels — denoise-scale, vs −0.28 on p35's neutral cut: the dose is not in the window |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact; means ±0.0001 |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED; means +0.001/−0.00003 — ranked-#1 gap untouched, as predicted |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #302F2C, 5.38, gap 0.7 | TOWARD −0.60 (G 48->47 toward union 39, R/B pinned) — the G cut landed here, not on the target |
| wide | 4g soil sub-median | meanV 53.4739 / meanS 0.15216 | meanV 53.4828 / meanS 0.15465 | +0.01 levels / +0.0025 S — median moved with means near-pinned |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | float-identical | intact (DoD p1 gate holds) |
| tall/wide | 4d p50 | 31.0040/72.2812 | 30.9358/72.2660 | −0.07/−0.02, denoise-domain, not DoD rows |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.36379 / 0.25199 | −0.0003/−0.0002, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38995 / 0.35788 | −0.0009/−0.0008, still in |
| tall | 4h dark area | 30.84093 % | identical | still in |
| wide | 4h dark area | 14.23221 % | 14.23204 % | −0.00017 pp, still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move ~0.0003 dE (denoise-domain, as p33/p34/p35) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.78/417.93 (−0.01–0.02 %); sigma px ±0.001 | no row-status change |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (tall/wide turf/moss/basalt k hexes relabelled at 1-LSB scale,
shares ±0.03 across permuted labels; informational only — k-means on
changed pixels; class medians, shares and means above are the scored
rows). 4i drift at 1e-20/1e-21 scale is float noise in the
still-adapted run (drift_not_measurable = 1), not drift.
Rows out: 2 -> 2 (same two rows; target pinned, other pinned; net
across the two out-rows 0.00).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target is pinned at every scale — median 0.00 dE with all three
channels pinned, means −0.02 levels (noise against p35's −0.28 on a live
dose). The keep rule demands toward on the target, so the `still.py`
change is reverted (working tree and host stage copy both restored to
the p35-kept state, md5-verified; p35 stays the baseline). The wide-soil
−0.60 does not save it: the keep rule is scored on the target, and
keeping a falsified dose for a non-target in-row improvement would break
the one-lever discipline. Nothing broke: DoD floors float-identical on
both framings, all passing rows held status, S2 character-identical
PASS, 4i bands identical, VRAM gate clear — a clean falsification, not a
breakage. A reverted pass still counts as the intentional pass.

Learning: the dark-soil course is now fully mapped on the tall soil
window — neutral 2x toward (p35), family-wide 2x away (p36), G-only 2x
inert (this pass, median AND means). The tall soil median pixels do not
answer dark-soil G at median-defining scale, while the wide soil window
does (−0.60 on G −1 with R/B pinned): the two soil windows read
different pixel mixes, confirming p36's read. G-selective is SPENT on
this course at falsification dose — do not retry a G-only dark-soil cut.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; hue spent p37, MULTIPLY-B spent
   p6/p11, lighting mapped p26/p28/p29/p30, albedo spent — remaining
   untried is WideFill-chroma B inside mapped lamp coupling, or accept)
2. tall 4g soil median, gap 1.0 (7.70; neutral albedo spent p36,
   G-selective spent by this pass — remaining untried is a hue-side move
   at a soil-safe dose, or accept)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p38 G-tint change, then restored to the p35-kept content by the revert —
verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p38/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in
`/tmp/review223` with `--hero-s0-csv` (the tool re-verifies both pins
itself); hero panels are the 960-px copies there (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never
committed); fetched renders under `hero3d-local/p38/` (git-ignored,
never committed). Committed with this pass:
`docs/research/hero-blender-still/pass-38/` only (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/
azimuth/exit_code logs) — no `still.py` change (reverted; p32/p36/p37
precedent). No new assets (procedural knob only — nothing to source or
licence).
