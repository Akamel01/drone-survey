# Pass 36: soil-family x0.5 production dose — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p36 (`~/hero3d/out/still-223/p36/`, fetched to
`hero3d-local/p36/` — git-ignored work files; the committed record is this dir).
No stale p36 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: tall 4g soil median, gap 1.0 (dE76 7.70, ours #292A29 vs union
#1B1E24 — ours lighter in every channel: R 41 vs 27, G 42 vs 30, B 41 vs
36). Pass 35 proved the tall soil window reads soil-course pixels at
median-defining scale (single-course 2x cut: median −0.69 dE with the
means), where the p21 0.85x family-wide dose was 0.00 — so the production
dose is the same proven factor extended to the two sibling soil courses.

Hypothesis: extending the x0.5 albedo cut from the dark-soil course to the
top-soil and sediment courses (all three soil rows at
0.0055/0.0065/0.0088, prot/thickness/grav untouched) moves the tall soil
median toward #1B1E24, because tripling the darkened soil-target pixel
population at the already-proven factor darkens the window further; tint is
pebble-inert (p21/p35), so wide/tall pebble are predicted near-pinned, with
wide soil (in, gap 0.7) watched for collateral. No geometry, lamp, camera,
sky or cloud change (no tall lamp move at all), so silhouette/S2 hold.
Scored on the tall soil median plus DoD/passing-row intactness. Keep iff
toward with no passing-row/DoD breakage.

The final hue micro-step (0.56 -> 0.59) was considered and set aside again:
p34 puts hue near its limit (G +2 past the union match, B pinned twice),
while the soil production dose tests the ranked-#2 gap directly.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob dimension only: the LAYERS top-soil and sediment row tints
(0.0110, 0.0130, 0.0176) -> (0.0055, 0.0065, 0.0088), plus the comment
above them. Dark-soil row already at the p35 value; pebble hue (0.56),
thicknesses, prot values, grav flags, lamps, cameras, sky, ridges
untouched. No new assets (procedural knob only). Reverted after scoring,
so `still.py` is byte-identical to the p35-kept state and the host stage
copy was restored to match.

## What moved (p35 -> p36)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified exact: #292A29 vs #1B1E24 = 7.70, #2C291E vs #212111 = 5.66;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p35-vs-p36
JSON diff over tall+wide 4a–4i, not by eye; 198 cells differ, all
denoise-domain, k-means reshuffle, or tabulated below). Unions: tall soil
#1B1E24, tall pebble #212111, wide pebble #2D2C10, wide soil #252729
(per the look spec §4g).

| framing | row | p35 | p36 | verdict |
|---|---|---|---|---|
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #282A28, 8.06, gap 1.0 | AWAY +0.36 (R 41->40 toward union 27, G 42->42 pinned vs union 30, B 41->40 toward union 36 — neutral darkening with G pinned raised Lab dE) |
| tall | 4g soil sub-median | meanV 49.7076 / meanS 0.17017 / share 0.32336 | meanV 49.3044 / meanS 0.16758 / share 0.32348 | −0.40 levels — the dose landed in the means, median moved with it the wrong way |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2F2D1E, 8.32, gap 1.0 | AWAY +0.55 collateral (R pinned, G 46->45 toward union 44, B 30 pinned vs union 16 — G-toward yet Lab-away) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 | meanV 49.3034 / meanS 0.37847 | −0.42 levels — dose visible in means, median against |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F2F2C, 5.21, gap 0.7 | TOWARD −0.77, still in — the one row that answers neutral darkening |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | #2B2C1F, 5.69, gap 0.7 | −0.06, still IN (bar 8), margin 2.31 intact |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 / p50 | 1.7874/3.0722/5.0722/31.0040 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d p50 | 72.2812 | 72.2620 | −0.02, denoise-domain, not a DoD row |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.36519 / 0.25296 | +0.001, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.39132 / 0.35914 | +0.0005, still in |
| tall | 4h dark area | 30.84093 % | 30.84113 % | +0.0002 pp, still in |
| wide | 4h dark area | 14.23221 % | 14.23238 % | +0.00017 pp, still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move ~1e-4 dE (denoise-domain, as p33/p34/p35) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.73/417.88 (−0.02 %); sigma px ±0.001 | no row-status change |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (tall turf k-shares ±0.16 across permuted labels; wide turf k hexes
relabelled; informational only — k-means on changed pixels; class medians,
shares and means above are the scored rows). 4i drift_adj at 1e-20/1e-21
scale is float noise in the still-adapted run (drift_not_measurable = 1),
not drift.
Rows out: 2 -> 2 (same two rows, both further out; net across the two
out-rows +0.91).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +0.36 dE, and the other out-row moved
+0.55 with it as collateral — the keep rule demands toward, so the
`still.py` change is reverted (working tree and host stage copy both
restored to the p35-kept state; p35 stays the baseline). Nothing broke:
DoD floors float-identical on both framings, all passing rows held
status, S2 PASS both, 4i bands identical, VRAM gate clear — a clean
falsification, not a breakage. A reverted pass still counts as the
intentional pass.

Learning: neutral soil-albedo darkening has hit its limit on the tall
soil median. p35's single-course 2x moved G −1 (toward, −0.69); p36's
family-wide same-factor moved R −1 B −1 with G pinned (away, +0.36) —
at median-defining scale the window now reads a G-selective residual
(ours G42 vs union 30 is the high outlier while R/B closed a step), and
neutral darkening steepens it in Lab. The wide soil window reads a
different pixel mix: it still answers neutral darkening (−0.77, still
in). Wide pebble's +0.55 on a G-toward step confirms its residual is
B-side/chroma (ours B30 vs union 16 dominates), not lightness — tint and
albedo are now spent on both out-rows.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77 — hue near its limit per p34:
   final micro-step 0.56 -> 0.59 under accept-or-prove-B-moves; third
   step risks G-runaway, take it only with eyes open)
2. tall 4g soil median, gap 1.0 (7.70; neutral albedo falsified by this
   pass — next live direction is G-selective: a green-channel tint or a
   hue-side move at a soil-safe dose, watching wide pebble's B-side)

Family-wide x0.5 soil albedo is answered AWAY — do not retry it.

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p36 tint change, then restored to the p35-kept content by the revert —
verified: two `0.0110` sibling rows back) and `~/hero3d/out/still-223/p36/`
(fresh pass dir, both framings in one shot). Never `~/hero3d/web4k`,
`~/drone/scratch`, `~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes.
No sudo. Host / has 20G free. This Mac rendered nothing; review ran
Mac-side via still_review.py + pinned measure.py (26f93fce…) and
measurements.csv (2df42cf8…) in `/tmp/review223` with `--hero-s0-csv`
(the tool re-verifies both pins itself); hero panels are the 960-px
copies there (values from CSV). Review under the worktree-local
`.review-venv` (untracked, never committed); fetched renders under
`hero3d-local/p36/` (git-ignored, never committed). Committed with this
pass: `docs/research/hero-blender-still/pass-36/` only (sheets,
scorecard, changes, measure jsons, scores.json, s2.txt, render/vram/
precheck/azimuth/exit_code logs) — no `still.py` change (reverted; p32
precedent). No new assets (procedural knob only — nothing to source or
licence).
