# Pass 41: sediment single-course albedo x0.5 — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p41 (`~/hero3d/out/still-223/p41/`, fetched to
`hero3d-local/p41/` — git-ignored work files; the committed record is this dir).
No stale p41 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70, ours #292A29 vs union
#1B1E24 — ours lighter in every channel: R 41 vs 27, G 42 vs 30, B 41 vs
36). Three soil-albedo cells are mapped on this row: dark-soil single-course
2x toward (p35: −0.69), family-wide same-factor away (p36: +0.36 with G
pinned), dark-soil G-only inert (p38: 0.00 median AND means). p36 confounds
two courses, so the untried cell is one OTHER soil course alone at the proven
p35 factor — a falsification dose, not a tune.

Hypothesis: halving the sediment course albedo alone
(0.0110/0.0130/0.0176 -> 0.0055/0.0065/0.0088, prot/thickness/grav
untouched, topsoil stays) moves the tall soil median toward #1B1E24, because
sediment (0.12, the same pixel population as the proven dark-soil dose, prot
0.03 the next-most-recessed soil-target course flanking the recessed middle
pebble — p25's named sibling in the soil-family mix question) shares the
shadowed luminance bin p35 proved the window reads; if the median darkens,
sediment pixels reach median-defining scale and albedo is a live lever on a
second course; if the median stays pinned while the means drop, the window
reads dark-soil exclusively. Tint is pebble-inert at single-course dose
(p21/p35/p38), so wide/tall pebble are predicted near-pinned (tall-pebble
margin 2.25 guarded by construction); wide soil (in, gap 0.7) is watched —
p36/p38 showed the soil windows read different mixes. No geometry, lamp,
camera, sky or cloud change (no tall lamp move at all), so silhouette/S2
hold. Scored on the tall soil median plus DoD/passing-row intactness. Keep
iff toward with no passing-row/DoD breakage.

Topsoil single-course x0.5 was considered and set aside for this pass:
sediment is the stronger falsification (0.12 population matches the proven
p35 dose exactly; 0.08 would leave a pinned result ambiguous between
"window does not read it" and "dose too small"), and p25 framed
dark-soil-vs-sediment as the soil-family pair — topsoil stays the one
remaining untried cell either way this lands.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob dimension only: the LAYERS sediment row tint
(0.0110, 0.0130, 0.0176) -> (0.0055, 0.0065, 0.0088), plus the comment
above it. Dark-soil row already at the p35 value; topsoil tint,
thicknesses, prot values, grav flags, pebble hue (0.56), lamps, cameras,
sky, ridges untouched. No new assets (procedural knob only). Reverted
after scoring, so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p41)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs
#1B1E24 = 7.70 exact; gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per
the p19 precedent). "Hex-identical" means median hex strings compare ==;
"float-identical" means JSON values compare == to all stored decimals (full
p35-vs-p41 JSON diff over tall+wide 4a–4i, not by eye; 192 cells differ, all
denoise-domain, k-means reshuffle, 1e-20/1e-21 float noise, or tabulated
below). Unions: tall soil #1B1E24, tall pebble #212111, wide pebble
#2D2C10, wide soil #252729 (per the look spec §4g).

| framing | row | p35 | p41 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED 0.00 (R/G/B all pinned — the sediment cut did not reach the median) |
| tall | 4g soil sub-median | meanV 49.7076 / meanS 0.17017 / share 0.32336 | meanV 49.3791 / meanS 0.16835 / share 0.32362 | −0.33 levels — the dose rendered in the means (vs −0.28 on p35's live dose, −0.02 on p38's inert one), median did not follow: the p21/p22/p25 median-vs-mean pattern again |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact; means −0.006 levels (tint stays pebble-inert) |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED; means −0.06 levels — ranked-#1 gap untouched, as predicted |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F2F2C, 5.21, gap 0.7 | TOWARD −0.77 (R 48->47 / G 48->47 toward union 37/39, B 44 pinned vs 41) — the sediment cut landed here, not on the target; still in |
| wide | 4g soil sub-median | meanV 53.4739 / meanS 0.15216 | meanV 53.1797 / meanS 0.15082 | −0.29 levels — median moved with the means |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | float-identical (no wide-4d diff lines) | intact (DoD p1 gate holds) |
| tall/wide | 4d p50 | 31.0040/72.2812 | 31.0040/72.2620 (−0.02 wide) | denoise-domain, not DoD rows |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.36477 / 0.25267 | +0.0007/+0.0005, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.39127 / 0.35909 | +0.0004, still in |
| tall | 4h dark area | 30.84093 % | 30.84052 % (−0.0004 pp) | still in |
| wide | 4h dark area | 14.23221 % | 14.23238 % (+0.0002 pp) | still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move ~1e-4 dE (denoise-domain, as p33–p40) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.77/417.96 (−0.01 %/−0.00 %); sigma px ±0.001 | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (tall pebble k2/k3 labels swapped #1C1C12<->#3D3C27 at ±0.003
shares; wide pebble k-hexes identical, shares ±0.005; tall/wide moss,
basalt, turf k hexes at 1-LSB relabel scale; informational only —
k-means on changed pixels; class medians, shares and means above are the
scored rows). 4i drift at 1e-20/1e-21 scale is float noise in the
still-adapted run (drift_not_measurable = 1), not drift.
Rows out: 2 -> 2 (same two rows; target pinned, other pinned; net
across the two out-rows 0.00).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read (p35-vs-p41 PNG mean-abs diff 0.013/0.010 levels tall/wide,
p99 zero both — sub-perceptual, max 9 on isolated denoise pixels); the known
visual gaps (rugged strata, moss cap, spruces, boulder sheen) persist
unchanged; no regression.
VRAM: vram.log device peak 4512 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3009 MiB (derived arithmetic: 4512 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target is pinned at every scale — median 0.00 dE with all three
channels pinned, while the means prove the dose rendered (−0.33 levels,
stronger than p35's −0.28 on the live dose). The keep rule demands toward
on the target, so the `still.py` change is reverted (working tree and host
stage copy both restored to the p35-kept state, md5-verified; p35 stays
the baseline). The wide-soil −0.77 does not save it: the keep rule is
scored on the target, and keeping a falsified dose for a non-target
in-row improvement would break the one-lever discipline (p38 precedent).
Nothing broke: DoD floors float-identical on both framings, all passing
rows held status, S2 character-identical PASS, 4i bands identical, VRAM
gate clear — a clean falsification, not a breakage. A reverted pass still
counts as the intentional pass.

Learning: the tall soil window reads dark-soil pixels exclusively among
soil courses at median-defining scale — neutral 2x toward on dark-soil
(p35), inert on sediment (this pass, median AND all channels pinned with
the dose confirmed in the means). And sediment reproduces p36's wide-soil
hex move exactly (#30302C -> #2F2F2C, −0.77 both): p36's wide-soil toward
was sediment alone, topsoil contributed nothing there — the wide soil
window reads sediment while the tall one does not, confirming p36/p38's
different-mixes read at a third data point. Sediment albedo is SPENT as a
tall-soil lever at falsification dose — do not retry it.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; every lamp angle now spent
   including p39/p40, tint/albedo spent, hue spent p37; remaining is only
   the p28-literal R+B-cut variant (0.75, 1.01, 0.30), low odds: it cuts
   total power, the documented failure mode — or accept at gap 1.0,
   within 3% of bar 8)
2. tall 4g soil median, gap 1.0 (7.70; dark-soil neutral spent p35,
   family-wide spent p36, G-selective spent p38, sediment spent by this
   pass — remaining untried is topsoil single-course x0.5 alone,
   p35-style falsification dose on the last unread course (0.08
   population, weaker falsification than sediment's 0.12), watching wide
   soil; hue-side barred, hue walk spent — or accept at gap 1.0)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p41 sediment-tint change, then restored to the p35-kept content by the
revert — verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p41/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in the
worktree-local `.review-venv/review-inputs/` (untracked, never committed)
with `--hero-s0-csv` (the tool re-verifies both pins itself); hero panels
are the 960-px copies there (values from CSV). Review under the
worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p41/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-41/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39/p40 precedent). No new assets (procedural knob
only — nothing to source or licence).
