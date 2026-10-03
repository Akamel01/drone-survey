# Pass 34: gravel hue second step 0.53 -> 0.56 — tried, measured, KEPT

Base: pass-33 p33 (`~/hero3d/out/still-223/p33/` on akamel-linux), 2 rows out.
This pass's render: p34 (`~/hero3d/out/still-223/p34/`, fetched to
`hero3d-local/p34/` — git-ignored work files; the committed record is this dir).
No stale p34 dir existed on the host (the interrupted attempt left nothing);
the driver created it fresh and both framings rendered in the one shot.

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.1 (dE76 8.93, ours #2F2C1E vs union
#2D2C10 — R 47 vs 45 (+2), G 44 vs 44 (matched), B 30 vs 16 (+14)). The
0.50 -> 0.53 step proved hue is the only live lever on this row (first
HSV-side toward in 30+ passes) with a clean signature: G lifted to match
while R and B rode pinned. G is now exactly placed, so this step cannot
gain on G — it tests whether dE keeps falling as the rotation continues
at higher angle (even-spacing dose 0.50/0.53/0.56, derived not tuned):
either the wheel starts moving B/R toward, or the G-overshoot cost stays
below the rotation gain as in Lab geometry. The knob is pebble-local
(p33: every soil/moss/basalt/turf median hex-identical, 4d floor
float-identical), so tall soil is predicted near-inert and tall pebble
may walk ~±0.2 (p33's +0.19 class) — watched against its 2.15 margin.
No geometry, lamp, camera, sky or cloud change (no tall lamp move at
all), so silhouette/S2 hold. Scored on the wide pebble median plus
DoD/passing-row intactness. Keep iff toward with no passing-row/DoD breakage.

The tall-soil alternative was considered and set aside again: five lever
classes are exhausted there (tint p21, relief p22, thickness p25/p32,
lamp p31 — all inert-or-away, the only movers p20/p24 already in
baseline), while hue is the live lever on the ranked-#1 gap.

## What changed (`scripts/hero/still.py`, KEPT)

One knob dimension only: `K2["pebble_hue"] = 0.53 -> 0.56` plus the
one-line comment update at the Hue application site. LAYERS, tints,
lamps, cameras, sky, ridges untouched. No new assets (procedural knob only).

## What moved (p33 -> p34)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified exact: #2F2C1E vs #2D2C10 = 8.93, #292A29 vs #1B1E24 = 7.70;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p33-vs-p34
JSON diff over tall+wide 4a–4i, not by eye; 205 cells differ, all
denoise-domain or tabulated below).

| framing | row | p33 | p34 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2C1E, 8.93, gap 1.1 | #2F2E1E, 7.77, gap 1.0 | TOWARD −1.17 (R 47->47 pinned, G 44->46 +2 past union 44, B 30->30 pinned — dE fell despite the G overshoot) |
| tall | 4g pebble median | #2C2A1F, 5.85, gap 0.7 | #2C2C1F, 5.75, gap 0.7 | TOWARD −0.10, still IN (bar 8), margin 2.15 -> 2.25 |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292B29, 8.39, gap 1.0 | AWAY +0.69 (G 42->43, 1 LSB leak, R/B pinned), still OUT — no status change, no passing row broke |
| wide | 4g soil median | #30302D, gap 0.7 | hex-identical | still in |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| wide | 4g pebble sub-median | meanV 49.6967 / meanS 0.3821 | meanV 49.7222 / meanS 0.3803 | +0.026 levels / −0.0018 — median moved with means near-pinned (hue signature, as p33) |
| tall | 4g pebble sub-median | meanV 44.9218 / meanS 0.34802 | meanV 45.0197 / meanS 0.34805 | +0.098 levels / +0.00003 — same signature |
| tall/wide | 4g soil sub-median | meanV 49.9971 / 53.7854, meanS 0.17174 / 0.15359 | meanV 49.9827 / 53.7629, meanS 0.17193 / 0.15364 | −0.014/−0.023 levels — near-pinned, median +0.69 from the 1 LSB |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 | 2.0/4.0722 | float-identical | intact (DoD p1 gate holds) |
| tall/wide | 4d p50 | 31.2166/70.7554 | 31.4224/72.3322 | +0.21/+1.58, not DoD rows (p50 precedent: ±1 moves in p26/p27/p29/p32/p33) |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36356 / 0.25183 | 0.36339 / 0.25171 | 4th-decimal, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39038 / 0.35827 | 0.39037 / 0.35827 | 5th-6th-decimal, still in |
| tall | 4h dark area | 30.84093 % | identical | still in |
| wide | 4h dark area | 14.23271 % | 14.23238 % | −0.00033 pp, still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move 0.0003 dE (denoise-domain, as p33) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 657.68/417.25 | 659.00/418.12 (+0.20–0.21 %); sigma px +0.001–0.002 | no row-status change |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p33, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (wide turf k-shares ±0.16 across permuted labels; informational
only — k-means on changed pixels; class medians, shares and means above
are the scored rows).
Rows out: 2 -> 2 (wide pebble 1.0, tall soil 1.0 — both moved, neither
changed status; wide pebble 7.77 is the closest this row has ever been).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~50 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: KEPT

The target moved the right way, −1.17 dE (gap 1.1 -> 1.0, the largest
single-pass toward on this row since p20), with R/B still pinned and no
passing row broken: tall pebble went the right way too (−0.10, margin up
to 2.25), every other passing median is hex-identical, 4d floor
float-identical on both DoD cells, 4a/4b/4h/4e at denoise-domain or
4th-decimal scale, S2 character-identical PASS, 4i band identical. The
one collateral is tall soil +0.69 on an already-OUT row (no status
change, no passing row broke) — net across the two out-rows is −0.48
dE, and the gain sits on the ranked-#1 gap. Per the keep rule the
`still.py` change stays and p34 becomes the baseline. A kept pass still
counts as the intentional pass.

Learning: dose-response point #2 is mapped (0.53 -> 0.56: G +2 past the
union match, R/B pinned again, yet dE fell −1.17 — rotation gain beats
G-overshoot cost in Lab at this step). The near-inert-soil prediction
was falsified at 1-LSB scale (tall soil G +1, +0.69): the hue knob
couples weakly into the soil window, so the lever is pebble-first, not
pebble-only. G now sits +2 past match with B still +14 pinned — the
wheel has not moved B in two steps, so hue is near its limit: a third
+0.03 risks G-runaway for no B movement.

Next ranked gaps (baseline p34):

1. wide 4g pebble median, gap 1.0 (7.77 — closest ever; accept-or-prove-B-moves)
2. tall 4g soil median, gap 1.0 (8.39; hue couples 1 LSB — needs its own
   lever; remaining untried is the p21/p22 much-stronger single-course
   dose, or accept)

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p34 hue change, KEPT) and `~/hero3d/out/still-223/p34/` (fresh pass dir,
both framings in one shot). Never `~/hero3d/web4k`, `~/drone/scratch`,
`~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes. No sudo. Host /
has 20G free. This Mac rendered nothing; review ran Mac-side via
still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) in `/tmp/review223` (the tool re-verifies both pins itself);
hero panels are the 960-px copies there (values from CSV). Review under
the worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p34/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-34/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) plus the two-line
`scripts/hero/still.py` hue change it keeps (p29/p33 precedent: kept
passes commit the kept knob). No new assets (procedural knob only —
nothing to source or licence).
