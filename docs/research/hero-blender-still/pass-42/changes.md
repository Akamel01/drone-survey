# Pass 42: topsoil single-course albedo x0.5 — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p42 (`~/hero3d/out/still-223/p42/`, fetched to
`hero3d-local/p42/` — git-ignored work files; the committed record is this dir).
No stale p42 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70, ours #292A29 vs union
#1B1E24 — ours lighter in every channel: R 41 vs 27, G 42 vs 30, B 41 vs
36). Four soil-albedo cells are spent on this row: dark-soil single-course
2x toward (p35: −0.69), family-wide same-factor away (p36: +0.36),
dark-soil G-only inert (p38: 0.00), sediment single-course inert at the
median with the dose confirmed in the means (p41: 0.00 median, −0.33
meanV). The pass-41 Next section ranks topsoil single-course x0.5 as the
remaining untried cell on this row, so this pass runs it rather than the
#1-ranked wide-pebble R+B-cut variant, which carries the documented
total-power failure mode (p28) — the last falsification dose in the
soil-family matrix, not a tune.

Hypothesis: halving the topsoil course albedo alone
(0.0110/0.0130/0.0176 -> 0.0055/0.0065/0.0088, prot/thickness/grav
untouched, dark-soil and sediment stay at their p35/p41 values) moves the
tall soil median toward #1B1E24, because topsoil (0.08, the topmost soil
course flanking the upper pebble band) is the only soil population never
dosed alone; if the median darkens, a second course reaches
median-defining scale and the row stays live; if the median stays pinned
while the means drop, the tall soil window reads dark-soil exclusively at
median scale and soil albedo is SPENT as a lever on this row. Predicted
0.00 on the target (the mirror cell of p41's sediment falsification, at a
smaller 0.08 population). Tint is pebble-inert at single-course dose
(p21/p35/p38/p41), so tall pebble (gap 0.7, margin 2.25 over bar 8) is
predicted near-pinned; wide soil (in, gap 0.7) is watched — p36/p38/p41
showed the soil windows read different mixes, and p41 proved a soil-course
dose can land on wide soil while missing tall. No geometry, lamp, camera,
sky or cloud change, so silhouette/S2 hold. Scored on the tall soil median
plus DoD/passing-row intactness. Keep iff toward with no
passing-row/DoD breakage.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob dimension only: the LAYERS topsoil row tint
(0.0110, 0.0130, 0.0176) -> (0.0055, 0.0065, 0.0088), plus the comment
above it. Dark-soil row already at the p35 value; sediment tint,
thicknesses, prot values, grav flags, pebble hue (0.56), lamps, cameras,
sky, ridges untouched. No new assets (procedural knob only). Reverted
after scoring, so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p42)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs
#1B1E24 = 7.70 exact; gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per
the p19 precedent). "Hex-identical" means median hex strings compare ==;
"float-identical" means JSON values compare == to all stored decimals (full
p35-vs-p42 JSON diff over tall+wide 4a–4i, not by eye; differing cells
tabulated below, all else identical). Unions: tall soil #1B1E24, tall
pebble #212111, wide pebble #2D2C10, wide soil #252729 (per the look
spec §4g).

| framing | row | p35 | p42 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED 0.00 (all three channels pinned — the topsoil cut did not reach the median, as predicted) |
| tall | 4g soil sub-median | meanV 49.7076 / meanS 0.17017 / share 0.32336 | meanV 49.6004 / meanS 0.16941 / share 0.32362 | −0.11 levels — the dose rendered weakly in the means (vs −0.33 on p41's 0.12-population dose, −0.28 on p35's live dose), median did not follow |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | #2B2C1F, 5.69, gap 0.7 | TOWARD −0.06 (R 44->43, 1 LSB; means −0.37 levels) — still IN, margin 2.25 -> 2.31 over bar 8 |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2F2D1E, 8.32, gap 1.0 | AWAY +0.55 (G 46->45, 1 LSB; means −0.35 levels — the cut rendered in this window, the wrong way) — out-row, not a passing row; gap unchanged at 1.0 |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F302C, 5.86, gap 0.7 | TOWARD −0.12 (R 48->47 toward union 37; means −0.09 levels) — still in |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in (k reshuffle only, means ±0.001) |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in (k reshuffle only, means ±0.04 wide / −0.03 tall) |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged (k-label permutation at 1-LSB scale, means pinned ±1e-4) |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | float-identical | intact (DoD p1 gate holds) |
| tall/wide | 4d p50 | 31.0040/72.2812 | 31.0040/72.2754 (−0.01 wide) | denoise-domain, not DoD rows |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.36446 / 0.25246 | +0.0004/+0.0003, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.39088 / 0.35874 | +0.00005, still in |
| tall | 4h dark area | 30.84093 % | 30.84072 % (−0.0002 pp) | still in |
| wide | 4h dark area / edge | 14.23221 % (edge 0.25252) | pct float-identical, edge +1.6e-6 | still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move ~1e-4 dE (denoise-domain, as p33–p42) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.79/417.88 (−0.01 %/−0.02 %); sigma px ±0.001 | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c identical; grain sigma ±4e-6 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (tall turf k1/k2 relabelled #202911/#3B460E -> #1C250F/#313C15 with
means pinned ±1e-4; tall pebble k1/k2 1-LSB; wide moss/basalt/turf k hexes
at 1-LSB relabel scale; informational only — k-means on changed pixels;
class medians, shares and means above are the scored rows). 4i drift at
1e-20/1e-22 scale is float noise in the still-adapted run
(drift_not_measurable = 1), not drift.
Rows out: 2 -> 2 (same two rows; target pinned, other out-row +0.55 but
gap unchanged; net across the two out-rows +0.55).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read (p35-vs-p42 PNG mean-abs diff 0.006/0.005 levels tall/wide,
p99 zero both — sub-perceptual, max 11/8 on isolated denoise pixels); the known
visual gaps (rugged strata, moss cap, spruces, boulder sheen) persist
unchanged; no regression.
VRAM: vram.log device peak 4508 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3005 MiB (derived arithmetic: 4508 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~50 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target is pinned at every scale — median 0.00 dE with all three
channels pinned, as predicted for the 0.08-population mirror cell, while
the means prove the dose rendered (−0.11 levels). The keep rule demands
toward on the target, so the `still.py` change is reverted (working tree
and host stage copy both restored to the p35-kept state, md5-verified; p35
stays the baseline). Neither off-target move saves it: the tall-pebble
−0.06 is a non-target 1-LSB wobble and the wide-soil −0.12 keeps a passing
row in place but does not move the target — keeping a falsified dose for
either would break the one-lever discipline (p38/p41 precedent). The wide
pebble +0.55 costs nothing under the keep rule (out-row, gap unchanged, no
passing row touched). Nothing broke: DoD floors float-identical on both
framings, all passing rows held status, S2 character-identical PASS, 4i
bands identical, VRAM gate clear — a clean falsification, not a breakage.
A reverted pass still counts as the intentional pass.

Learning: the soil-family albedo matrix on the tall soil window is now
CLOSED — all five cells dosed and scored: family-wide x0.85 inert (p21),
dark-soil single x0.5 toward (p35, the only live dose), family-wide x0.5
away (p36), dark-soil G-only inert (p38), sediment single x0.5 inert at the
median (p41), topsoil single x0.5 inert at the median (this pass, weaker
means move −0.11 consistent with the smaller 0.08 population). The tall
soil window reads dark-soil pixels exclusively among soil courses at
median-defining scale. Soil albedo is SPENT as a tall-soil lever — do not
retry any soil-course tint at any factor. Secondary: the topsoil cut
rendered in the WIDE windows (pebble means −0.35 with a 1-LSB median move
away, soil −0.12 toward) while missing tall entirely — a fourth data
point for the different-mixes read (p36/p38/p41), and the first sign that
topsoil pixels reach the wide pebble window.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; every lamp angle now spent
   including p39/p40, tint/albedo spent, hue spent p37; remaining is only
   the p28-literal R+B-cut variant (0.75, 1.01, 0.30), low odds: it cuts
   total power, the documented failure mode — or accept at gap 1.0,
   within 3% of bar 8)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by this
   pass — no untried tint cell remains; hue-side barred, hue walk spent —
   accept at gap 1.0, or modelling work only)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p42 topsoil-tint change, then restored to the p35-kept content by the
revert — verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p42/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in the
worktree-local `.review-venv/review-inputs/` (untracked, never committed)
with `--hero-s0-csv` (the tool re-verifies both pins itself); hero panels
are the 960-px copies there (values from CSV). Review under the
worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p42/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-42/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39/p40/p41 precedent). No new assets (procedural knob
only — nothing to source or licence).
