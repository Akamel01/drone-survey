# Pass 37: gravel hue third step 0.56 -> 0.59 — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p37 (`~/hero3d/out/still-223/p37/`, fetched to
`hero3d-local/p37/` — git-ignored work files; the committed record is this dir).
No stale p37 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.0 (dE76 7.77, ours #2F2E1E vs union
#2D2C10 — R 47 vs 45 (+2), G 46 vs 44 (+2), B 30 vs 16 (+14)). Two mapped
hue points both cut dE (0.50 -> 0.53: −0.70; 0.53 -> 0.56: −1.17) with R/B
pinned and only G walking.

Hypothesis: raising `pebble_hue` 0.56 -> 0.59 at the same +0.03 dose (even
spacing 0.50/0.53/0.56/0.59, derived not tuned) moves the wide pebble median
toward #2D2C10, because rotation gain in Lab beat the G-overshoot cost at
both mapped steps — either the wheel starts moving B/R toward at higher
angle, or dE falls a third time as G-overshoot cost stays below rotation
gain. The knob is pebble-first (p34: 1-LSB soil coupling), so tall pebble
may walk ~±0.2 (watched against its 2.31 margin) and tall soil is predicted
near-inert. No geometry, lamp, camera, sky or cloud change (no tall lamp
move at all), so silhouette/S2 hold. Scored on the wide pebble median plus
DoD/passing-row intactness. Keep iff toward with no passing-row/DoD breakage.

The tall-soil G-selective lever was considered and set aside: hue is the
live lever on the ranked-#1 gap with two toward points, while G-selective
is untried with no dose-response behind it.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob dimension only: `K2["pebble_hue"] = 0.56 -> 0.59` plus the comment
at the K2 entry and the one-line comment update at the Hue application
site (p33/p34 precedent). LAYERS, tints, lamps, cameras, sky, ridges
untouched. No new assets (procedural knob only). Reverted after scoring,
so `still.py` is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p37)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
verified exact: #2F2F1F vs #2D2C10 = 7.92, #292A29 vs #1B1E24 = 7.70;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p35-vs-p37
JSON diff over tall+wide 4a–4i, not by eye; 194 cells differ, all
denoise-domain, k-means reshuffle, 1e-20 float noise, or tabulated below).
Unions: tall soil #1B1E24, tall pebble #212111, wide pebble #2D2C10, wide
soil #252729 (per the look spec §4g).

| framing | row | p35 | p37 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2F2F1F, 7.92, gap 1.0 | AWAY +0.15 (R pinned 47 vs union 45, G 46->47 away from 44, B 30->31 away from 16 — both walkers went the wrong way) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 | meanV 49.5495 / meanS 0.37609 | −0.17 levels — means eased while the median walked away |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | #2C2D1F, 5.90, gap 0.7 | AWAY +0.15 (G 44->45, 1 LSB, R/B pinned), still IN (bar 8), margin 2.25 -> 2.10 intact |
| tall | 4g pebble sub-median | meanV 45.0194 / meanS 0.34808 | meanV 45.8716 / meanS 0.35719 | +0.85 levels / +0.009 — the step landed in the means, median took only the 1 LSB |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED — the p34 1-LSB leak did not repeat; hue decoupled here this step |
| tall | 4g soil sub-median | meanV 49.7076 / meanS 0.17017 | meanV 49.9514 / meanS 0.17295 | +0.24 levels — drift without median movement |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2F302C, 5.86, gap 0.7 | TOWARD −0.12 (R 48->47 toward union 37), still in |
| wide/tall | 4g moss median | #353E0B / #313B0A | hex-identical | still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | hex-identical | still in |
| wide/tall | 4g turf median | #2B3511 / #283212 | hex-identical | status unchanged |
| tall | 4d floor p0_1 / p1 / p5 / p50 | 1.7874/3.0722/5.0722/31.0040 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d p50 | 72.2812 | 73.5560 | +1.27, denoise-domain, not a DoD row (p50 precedent: ±1 moves) |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.36255 / 0.25114 | −0.0015/−0.0010, still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.39143 / 0.35924 | +0.0006/+0.0006, still in |
| tall | 4h dark area | 30.84093 % | 30.84032 % | −0.0006 pp, still in |
| wide | 4h dark area | 14.23221 % | 14.23238 % | +0.00017 pp, still in (hero s0 13.97) |
| tall/wide | 4a | — | max abs move ~0.0003 dE (denoise-domain, as p33/p34/p35) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 660.25/418.69 (+0.17–0.22 %); sigma px +0.001 | no row-status change |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | band identical, s2.txt character-identical to p35, PASS both | intact |

Seed-0 k-means cluster hexes/shares reshuffled at label-permutation
scale (tall/wide turf/moss/basalt k hexes relabelled at 1-LSB scale,
shares ±0.02 across permuted labels; informational only — k-means on
changed pixels; class medians, shares and means above are the scored
rows). 4i drift_adj at 1e-20/1e-21 scale is float noise in the
still-adapted run (drift_not_measurable = 1), not drift.
Rows out: 2 -> 2 (same two rows; target further out, other pinned; net
across the two out-rows +0.15).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4508 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3005 MiB (derived arithmetic: 4508 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +0.15 dE, with both walking channels (G
and B) stepping away and R pinned — the keep rule demands toward, so the
`still.py` change is reverted (working tree and host stage copy both
restored to the p35-kept state, md5-verified; p35 stays the baseline).
Nothing broke: DoD floors float-identical on both framings, all passing
rows held status, S2 PASS both, 4i bands identical, VRAM gate clear — a
clean falsification, not a breakage. A reverted pass still counts as the
intentional pass.

Learning: hue has peaked at 0.56 on wide pebble. Dose-response is now
three mapped points: −0.70, −1.17, +0.15 — the third +0.03 step walked G
+1 past match AND B +1 the wrong way with R pinned, so rotation gain no
longer beats overshoot cost in Lab. The wheel never moved B at any tested
angle (0.50/0.53/0.56/0.59: B pinned, pinned, pinned, +1-away), and B
+14 is the dominant residual (ours 31 vs union 16) — hue is SPENT on this
row, not near its limit but past it. Tall soil decoupling this step
(hex-identical median) confirms the p34 leak was 1-LSB noise, not a
trend: the knob is pebble-local after all.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; hue falsified at 0.59, lighting
   mapped p26/p28/p29/p30, albedo spent — remaining untried is a
   B-selective lever at a pebble-safe dose, or accept)
2. tall 4g soil median, gap 1.0 (7.70; neutral albedo falsified by p36 —
   next live direction is G-selective: a green-channel tint or a
   hue-side move at a soil-safe dose, watching wide pebble's B-side)

Third hue step 0.56 -> 0.59 is answered AWAY — do not retry it; 0.56
stays the hue value.

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p37 hue change, then restored to the p35-kept content by the revert —
verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p37/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in
`/tmp/review223` with `--hero-s0-csv` (the tool re-verifies both pins
itself); hero panels are the 960-px copies there (values from CSV).
Review under the worktree-local `.review-venv` (untracked, never
committed); fetched renders under `hero3d-local/p37/` (git-ignored,
never committed). Committed with this pass:
`docs/research/hero-blender-still/pass-37/` only (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/
azimuth/exit_code logs) — no `still.py` change (reverted; p32/p36
precedent). No new assets (procedural knob only — nothing to source or
licence).
