# Pass 33: gravel hue rotation toward olive — tried, measured, KEPT

Base: pass-29 p29 (`~/hero3d/out/still-223/p29/` on akamel-linux), 2 rows out.
This pass's render: p33 (`~/hero3d/out/still-223/p33/`, fetched to
`hero3d-local/p33/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.2 (dE76 9.59, ours #2F2B1E vs union
#2D2C10 — R 47 vs 45 (+2), G 43 vs 44 (−1), B 30 vs 16 (+14)). The
residual is B-dominated through a channel no lamp move has ever shifted:
frontal warm power pins B (p26/p29: +R+G, B fixed), and every chroma-side
move since has gone away (p28 re-chrome +2.04, p30 rotation +1.32). Tint,
saturation and value are likewise spent on this row (p6 wide-inert, p8/p23
saturation away, p10 value away, p11 MULTIPLY B-cut saturated at one blue
level). The one branch never rendered is p11's own prescription: "further
blue must come from the HSV side (hue rotation, untried) or from lighting"
— the lighting fork has since been mapped on four sides, hue never once.

Hypothesis: setting the gravel HUE_SAT Hue 0.5 (neutral) -> 0.53 moves the
wide pebble median toward #2D2C10, because rotating the gravel hue toward
yellow lifts G where G sits −1 short while R and B ride nearly pinned —
the only single knob whose multi-channel signature matches this residual
(R +2, G −1, B +14). Dose is derived, not tuned: ours hue ≈ 0.128 wheel
vs union ≈ 0.16, so +0.03 wheel (≈ +11°) closes the median-hex hue gap in
one step, assuming Blender's Hue offset runs positive-forward from 0.5
(stated so a wrong-signed render would falsify the sign, not the lever).
The knob is strata-local: soil pixels are near-achromatic (p23's saturation
analog left both soil medians at 0.00), so tall soil is predicted inert;
tall pebble carries the same B-heavy signature and may walk slightly either
way — watched against its 2.34 margin. No geometry, lamp, camera, sky or
cloud change, so silhouette/S2 hold. Scored on the wide pebble median plus
DoD/passing-row intactness. Keep iff toward with no passing-row/DoD breakage.

The tall-soil alternative (top-soil-vs-sediment intra-family swap, the one
soil pair never isolated) was considered and set aside: p25's class result
says intra-family swaps move means, never this median (three instances),
while hue is the last untried branch on the ranked-#1 gap.

## What changed (`scripts/hero/still.py`, KEPT)

One knob dimension only: new `K2["pebble_hue"] = 0.53` plus one line in
`island_palette()` applying it to the gravel HUE_SAT node's Hue input
(Saturation/Value line untouched). LAYERS, tints, lamps, cameras, sky,
ridges untouched. No new assets (procedural knob only).

## What moved (p29 -> p33)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified exact: #2F2B1E vs #2D2C10 = 9.59, #292A29 vs #1B1E24 = 7.70,
#2C291E vs #212111 = 5.66; gap = dE/8 per pass 20). "Hex-identical" below
means the median hex strings compare ==; "float-identical" means the JSON
values compare == to all stored decimals (checked by full p29-vs-p33 JSON
diff over tall+wide 4a–4i, not by eye).

| framing | row | p29 | p33 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2B1E, 9.59, gap 1.2 | #2F2C1E, 8.93, gap 1.1 | TOWARD −0.66 (R 47->47 held, G 43->44 matched union 0x2C, B 30->30 held) |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C2A1F, 5.85, gap 0.7 | AWAY +0.19, still IN (bar 8), margin 2.34 -> 2.15 |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | hex-identical (0.00) |
| wide | 4g soil median | #30302D, 5.55, gap 0.7 | #30302D, 5.55, gap 0.7 | hex-identical, still in |
| wide | 4g moss median | #353E0B, 4.68, gap 0.6 | #353E0B, 4.68, gap 0.6 | hex-identical, still in |
| tall | 4g moss median | #313B0A, 4.46, gap 0.6 | #313B0A, 4.46, gap 0.6 | hex-identical, still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | status unchanged |
| wide | 4g pebble sub-median | meanV 49.6895 / meanS 0.3837 / k1 0.4569 | meanV 49.6967 / meanS 0.3821 / k1 0.4480 | +0.007 levels / −0.0017 (union 53.4 / 0.574); median moved with means pinned — inverse of the usual pattern |
| tall | 4g pebble sub-median | meanV 44.9908 / meanS 0.3529 | meanV 44.9218 / meanS 0.3480 | −0.069 levels / −0.0049 — the +0.19 collateral in the mean |
| tall | 4g soil sub-median | meanV 49.9805 / meanS 0.17179 | meanV 49.9971 / meanS 0.17174 | +0.017 levels, median pinned |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 | 2.0/4.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d p5 / p50 | 8.8562/68.8636 | 8.8596/70.7554 | +0.0034 / +1.8918 levels drift, not DoD rows (p50 precedent: ±1 moves in p26/p27/p29/p32) |
| tall | 4d p50 | 31.1444 | 31.2166 | +0.0722, not a DoD row; shadow_floor_lifted 0 both framings |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36361 / 0.25187 | 0.36356 / 0.25183 | 5th-decimal, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39037 / 0.35827 | 0.39038 / 0.35827 | 5th-decimal, still in |
| tall | 4h dark area | 30.84113 % | 30.84093 % | −0.00020 pp, still in |
| wide | 4h dark area | 14.23238 % | 14.23271 % | +0.00033 pp, still in (hero s0 13.97) |
| tall/wide | 4a | — | same tokens, max abs move 0.0003 dE (denoise-domain) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 656.53/416.54 | 657.68/417.25 (+0.17–0.18 %); sigma px +0.001 | 3rd-significant-figure, no row-status change |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | band identical (85.78125/83.37963), s2.txt character-identical to p29, PASS both | intact |

Seed-0 k-means cluster hexes reshuffled ±1 LSB (informational only —
k-means on changed pixels; medians and shares above are the scored rows).
Rows out: 2 -> 2 (wide pebble 1.1, tall soil 1.0).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read, wide strata a touch warmer; the known visual gaps (rugged
strata, moss cap, spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: KEPT

The target moved the right way, −0.66 dE (gap 1.2 -> 1.1), with the
predicted channel signature (G lifted to match, R/B pinned — the Blender
Hue sign assumption confirmed, not falsified), and nothing passing broke:
the only collateral is tall pebble +0.19 away-but-in (margin 2.15 intact,
same class as p23's −0.13/p27's +0.33 on this row), every other median is
hex-identical, 4d floor float-identical on both DoD cells, 4a/4b/4h/4e move
at denoise-domain or 5th-decimal scale, S2 character-identical PASS, 4i band
identical. Per the keep rule the `still.py` change stays and p33 becomes
the baseline. A kept pass still counts as the intentional pass.

Learning: hue rotation is a live lever on the wide pebble median where
every sibling colour knob was inert-or-away — the first HSV-side toward on
that row (saturation p8/p23 away, value p10 away, MULTIPLY tint p6/p11
wide-inert). It moved the median (−0.66) with the window means nearly
pinned (+0.007 levels) — the inverse of the median-pinned-means-moved
pattern (p21/p22/p25/p32): hue acts on the median-defining pixels directly,
not through mix fractions. One dose-response point is now mapped (+0.03
wheel -> −0.66 dE with G matched); what is left is B +14 still pinned and
R +2 overshooting — a second +0.03 step would chase B at R's expense, and
the lamp side is spent, so the row is one step from either converged or
accepted.

Next ranked gaps (baseline p33):

1. wide 4g pebble median, gap 1.1
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p33 hue change, KEPT) and `~/hero3d/out/still-223/p33/` (fresh pass dir).
Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This Mac
rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in `/tmp/review223`
(the tool re-verifies both pins itself); hero panels are the 960-px copies
there (values from CSV). Review under the worktree-local `.review-venv`
(untracked, never committed); fetched renders under `hero3d-local/p33/`
(git-ignored, never committed). Committed with this pass:
`docs/research/hero-blender-still/pass-33/` (sheets, scorecard, changes,
measure jsons, scores.json, s2.txt, render/vram/precheck/azimuth/exit_code
logs) plus the two-line `scripts/hero/still.py` hue change it keeps (p29
precedent: kept passes commit the kept knob). No new assets (procedural
knob only — nothing to source or licence).
