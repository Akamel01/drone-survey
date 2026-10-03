# Pass 35: dark-soil single-course albedo x0.5 — tried, measured, KEPT

Base: pass-34 p34 (`~/hero3d/out/still-223/p34/` on akamel-linux), 2 rows out.
This pass's render: p35 (`~/hero3d/out/still-223/p35/`, fetched to
`hero3d-local/p35/` — git-ignored work files; the committed record is this dir).
No stale p35 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 8.39, ours #292B29 vs union
#1B1E24 — ours lighter in every channel: R 41 vs 27, G 43 vs 30, B 41 vs
36). Five lever classes are spent on this row (tint p21, relief p22,
intra-family thickness p25, lamp p31, cross-family thickness p32 — all
inert-or-away at their doses), and the one question open since pass 32 is
WHAT the +-3 % soil window reads at median-defining scale: humus is not it
(p32), middle-pebble shadow is partly it (p24). p21 dosed all three soil
rows at a weak x0.85 (median 0.00, means -0.4 %), so a much-stronger
single-course dose — the option p21/p22 left untried — is untested.

Hypothesis: halving the dark-soil course albedo
(0.0110/0.0130/0.0176 -> 0.0055/0.0065/0.0088, prot/thickness/grav
untouched) moves the tall soil median toward #1B1E24, because the
dark-soil course (prot 0.01, the most recessed and hence darkest
soil-target pixels) is the last untested candidate for what the window
reads: the factor-2 cut is a falsification dose, not a tune — if the
median darkens, the window reads dark-soil pixels and albedo is a live
lever at sufficient dose; if the median stays pinned while the means drop,
the window reads non-soil pixels and the WHAT is answered the other way.
Tint is pebble-inert by p21 (both pebble medians bit-identical there), so
wide/tall pebble are predicted near-pinned; wide soil (in, gap 0.7) is
watched for collateral. No geometry, lamp, camera, sky or cloud change
(no tall lamp move at all), so silhouette/S2 hold. Scored on the tall
soil median plus DoD/passing-row intactness. Keep iff toward with no
passing-row/DoD breakage.

The final hue micro-step (0.56 -> 0.59) was considered and set aside:
pass-34 learning puts hue near its limit (G +2 past the union match, B
pinned twice running), so a third +0.03 risks G-runaway for no B movement,
while the soil WHAT probe answers a ranked gap either way it lands.

## What changed (`scripts/hero/still.py`, KEPT)

One knob dimension only: the LAYERS dark-soil row tint
(0.0110, 0.0130, 0.0176) -> (0.0055, 0.0065, 0.0088), plus the comment
above it. Sibling soil/sediment tints, thicknesses, prot values, grav
flags, pebble hue (0.56), lamps, cameras, sky, ridges untouched. No new
assets (procedural knob only).

## What moved (p34 -> p35)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified exact: #292B29 vs #1B1E24 = 8.39, #292A29 vs #1B1E24 = 7.70;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p34-vs-p35
JSON diff over tall+wide 4a–4i, not by eye; 198 cells differ, all
denoise-domain or tabulated below).

| framing | row | p34 | p35 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292B29, 8.39, gap 1.0 | #292A29, 7.70, gap 1.0 | TOWARD −0.69 (R 41->41 pinned, G 43->42 −1 toward union 30, B 41->41 pinned — exactly reverses p34's +0.69 G-leak, back to the p29–p33 hex) |
| tall | 4g soil sub-median | meanV 49.9827 / meanS 0.17193 / share 0.32363 | meanV 49.7076 / meanS 0.17017 / share 0.32336 | −0.28 levels — the dose landed in the means, median moved with it (first albedo-side toward on this row) |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact; meanV −0.0002 levels (tint stays pebble-inert) |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED; meanV −0.001 levels — ranked-#1 gap untouched, as predicted |
| wide | 4g soil median | #30302D, gap 0.7 | #30302C (B −1 LSB), gap 0.7 | 1 LSB, still in; meanV −0.29 levels — the watched collateral, no status change |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 | 2.0/4.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d p5 / p50 | 8.8596/72.3322 | 8.8556/72.2812 | −0.004/−0.05, denoise-domain, not DoD rows |
| tall | 4d p50 | 31.4224 | 31.0040 | −0.42, not a DoD row (p50 precedent: ±1 moves in p26/p27/p29/p32/p33/p34) |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36339 / 0.25171 | 0.36404 / 0.25217 | 3rd-decimal, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39037 / 0.35827 | 0.39083 / 0.35869 | 3rd-4th-decimal, still in |
| tall | 4h dark area | 30.84093 % | identical | still in |
| wide | 4h dark area | 14.23238 % | 14.23221 % | −0.00017 pp, still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move 0.0002 dE (denoise-domain, as p33/p34) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 659.00/418.12 | 658.84/417.97 (−0.02–0.04 %); sigma px ±0.001 | no row-status change |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p34, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (tall turf k-shares ±0.15 across permuted labels; wide moss k hexes
±1 LSB; informational only — k-means on changed pixels; class medians,
shares and means above are the scored rows). 4i drift_adj at 1e-20/1e-21
scale is float noise in the still-adapted run (drift_not_measurable = 1),
not drift.
Rows out: 2 -> 2 (wide pebble 1.0, tall soil 1.0 — target toward,
nothing else changed status; net across the two out-rows −0.69).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: KEPT

The target moved the right way, −0.69 dE, with the dose confirmed in the
means (−0.28 levels) and the pebble-inert prediction holding exactly
(both pebble medians hex-identical, means ±0.001): the only collateral is
wide soil −1 LSB in B on an in-status row (no status change) and
3rd-decimal 4b moves, with 4d floor float-identical on both DoD cells,
4a/4h/4e at denoise-domain scale, S2 character-identical PASS, 4i band
identical. Per the keep rule the `still.py` change stays and p35 becomes
the baseline. A kept pass still counts as the intentional pass.

Learning: the WHAT is answered — the tall soil window reads dark-soil
pixels at median-defining scale. Tint is a live lever on this row after
all, at 2x single-course dose where 0.85x across three courses was 0.00:
the median-pinned-means-moved pattern (p21/p22/p25/p32) breaks the moment
the dosed course is what the window actually reads. Note the symmetry
with p34: hue couples into tall soil at 1 LSB (+0.69), tint at 2x wins it
back (−0.69) — both levers are now mapped at LSB scale on this row.

Next ranked gaps (baseline p35):

1. wide 4g pebble median, gap 1.0 (7.77 — closest ever; hue near its
   limit per p34: accept-or-prove-B-moves, third step risks G-runaway)
2. tall 4g soil median, gap 1.0 (7.70; tint now live — second dose:
   extend x0.5 to sediment/top-soil, or a stronger dark-soil cut,
   watching wide soil, which spent 1 LSB of B this pass)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p35 tint change, KEPT) and `~/hero3d/out/still-223/p35/` (fresh pass dir,
both framings in one shot). Never `~/hero3d/web4k`, `~/drone/scratch`,
`~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes. No sudo. Host /
has 20G free. This Mac rendered nothing; review ran Mac-side via
still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) in `/tmp/review223` with `--hero-s0-csv` (the tool
re-verifies both pins itself); hero panels are the 960-px copies there
(values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p35/`
(git-ignored, never committed). Committed with this pass:
`docs/research/hero-blender-still/pass-35/` (sheets, scorecard, changes,
measure jsons, scores.json, s2.txt, render/vram/precheck/azimuth/
exit_code logs) plus the one-line `scripts/hero/still.py` tint change it
keeps (p29/p33/p34 precedent: kept passes commit the kept knob). No new
assets (procedural knob only — nothing to source or licence).
