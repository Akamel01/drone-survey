# Pass 45: wide-only cool frontal fill (WideFill R<->B mirror) — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p45 (`~/hero3d/out/still-223/p45/`, fetched to
`hero3d-local/p45/` — git-ignored work files; the committed record is this dir).
No stale p45 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.0 (dE76 7.77, ours #2F2E1E vs union
#2D2C10 — R 47 vs 45 (+2), G 46 vs 44 (+2), B 30 vs 16 (+14)). The p44 Next
section ranks this gap #1 and names the only unmapped lamp cell on it: the
cool direction. Every warm lamp angle is spent (full-vector at fixed energy
away +2.04 p28, B-selective with compensation away +1.30 p39, R-selective
with compensation away +2.71 p40, R+B combined with full G compensation
away +2.71 p43; power bounded both sides p27/p29), tint/albedo spent
(p6/p23), hue spent (p33/p34/p37), geometry-shadow overshoots (p44).

Hypothesis: adding a wide-only cool frontal fill — the exact R<->B
channel-mirror of the kept WideFill (SUN energy 0.75, angle 5 deg, colour
(0.38, 0.68, 1.0), same frontal geometry) — moves the wide pebble/soil
window medians toward their unions, because it is the inverse of all warm
fills tried and the single unmapped lamp cell: if the B-pinned residual
answers to blue-side light the way the warm residual answered to warm-side
mapping (p26/p29), the mirror dose shows it. Primary prediction from
per-channel add scaling is AWAY-or-pinned on the +B residual (cool light
raises lit-pixel B while R/G hold), so this is a falsification dose, not a
tune (p35 precedent): keep only if a labelling mix-shift moves an out-row
median toward its union despite the per-pixel physics. Tall never sees the
lamp (hidden in render_shot with WideFill), so the tall-pebble margin (2.25
over bar 8) and the tall soil row are protected by construction. No
geometry, camera, sky or cloud change, so silhouette/S2 hold. Scored on the
wide pebble median plus DoD/passing-row intactness.

## What changed (`scripts/hero/still.py`, REVERTED)

One new lamp plus its hide wiring, following the existing WideFill pattern:
`add_cool_fill()` (SUN "CoolFill", energy 0.75, angle 5 deg, colour
(0.38, 0.68, 1.0), frontal from the camera side slightly above), called in
main() after `add_wide_fill()`; the render_shot hide becomes a loop over
("WideFill", "CoolFill") hiding both unless wide. Sibling tints, pebble hue
(0.56), LAYERS, cameras, sky, ridges untouched. No new assets (procedural
knob only). Reverted after scoring, so `still.py` is byte-identical to the
p35-kept state (md5 662096e29793608673b1f18450c6f484) and the host stage
copy was restored to match (same md5).

## What moved (p35 -> p45)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #2F2F24 vs #2D2C10 = 11.23 exact,
#31322F vs #252729 = 6.15 exact, #35400C vs #384117 = 5.05 exact,
#313B0A vs #384117 = 4.46 exact, #2F2E1E vs #2D2C10 = 7.77 exact;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent).
"Hex-identical" means median hex strings compare ==; "float-identical"
means JSON values compare == to all stored decimals (full p35-vs-p45 JSON
diff over tall+wide 4a–4i, not by eye; 190 cells differ, all denoise-domain
or tabulated below). Unions: tall soil #1B1E24, tall pebble #212111, wide
pebble #2D2C10, wide soil #252729, wide moss #384117, tall turf #283017,
wide turf #1F2912 (per the look spec §4g / pass-28 precedent).

| framing | row | p35 | p45 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #2F2F24, 11.23, gap 1.4 | AWAY +3.46 (R 47->47: pinned at +2 over union 45; G 46->47: away from 44; B 30->36: +6 away from 16 — the pinned channel rose a fifth time, p28/p39/p40/p43/p45) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 / share 0.03491 | meanV 50.4799 / meanS 0.30235 / share 0.03877 | +0.76 levels brightening (cool light adds) with −0.078 S desaturation — the p28/p40/p43 desat signature recurred at exactly p43's −0.078; share +0.0039 mix-shift toward a bluer population, the keep-path that did not materialize |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical, 5.75, gap 0.7 | PINNED, still IN (bar 8), margin 2.25 intact — hide protection held |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED; meanV −0.00007 levels (denoise) — lamp-hide protection held |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #31322F, 6.15, gap 0.8 | AWAY +0.18, still in |
| tall/wide | 4g moss median | #313B0A, 4.46 / #353E0B, 4.68, gap 0.6 | tall hex-identical; wide #35400C, 5.05, gap 0.6 | wide +0.37, still in |
| tall/wide | 4g basalt median | #0A0B0C / #0D0D0D | tall hex-identical; wide #0E0E0F (1–2 LSB lamp-domain brightening) | still in |
| tall | 4g turf median | #283212 | hex-identical | status unchanged |
| wide | 4g turf median | #2B3511, 9.20 | #2C3712, 10.09 | +0.89; outside bar 8 at baseline too — no status change, not a counted row (p35 precedent: rows-out counts pebble+soil only) |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | 2.0722/4.8596/9.9278 | DoD p1 gate (<= 8) holds at 4.8596; p5 not a DoD row; p50 72.2812->75.4758 lamp-domain brightening, not a DoD row |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 6th–7th-decimal moves | still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38988 / 0.35767 | still in |
| tall | 4h dark area | 30.84093 % | 30.84072 % (−0.0002 pp) | still in |
| wide | 4h dark area | 14.23221 % | 14.72804 % (+0.50 pp) | past the in-precedent max (p28: 14.63 in; hero s0 13.97) — watched; moot under revert, restored with it (p43 precedent: 14.82 watched, restored) |
| tall/wide | 4a | — | tall max abs move ~0.0003 dE (denoise-domain); wide max abs move ~0.015 dE (horizon rows, lamp-domain) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.85 (+0.00 %)/429.16 (+2.68 %); sigma px +0.000/+0.33 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c identical (wide bloom_falloff 1.4014->1.4061 denoise, p44 precedent); grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; tall bbox identical, wide bbox 0.602-0.931 identical to p35 (no geometry change — unlike p44's rim growth), still PASS | intact |

Rows out: 2 -> 2 (target 1.0->1.4 away, tall soil pinned at 1.0; net across
the two out-rows +3.46).
Visual read: sheets show no change at frame scale — same composition and
cake-layer read; the known visual gaps (rugged strata, moss cap, spruces,
boulder sheen) persist unchanged; the cool fill leaves no frame-scale tint.
No regression.
VRAM: vram.log device peak 4508 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3005 MiB (derived arithmetic: 4508 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +3.46 dE (gap 1.0 -> 1.4), exactly on the
primary prediction: cool light raised the pinned B channel +6 while R/G
stayed or drifted, with the warm-pass desaturation signature recurring
(−0.078 S, exactly p43's value) and the labelling mix-shift resolving
toward a bluer population — the keep-path did not materialize. DoD floors
hold (tall float-identical, wide p1 4.86 <= 8), S2 PASS both with bboxes
identical to baseline, 4i bands identical, VRAM gate clear; no passing row
broke (wide 4h drifted past its in-precedent but is restored by the revert
rather than ruled on). A clean falsification, not a breakage. A reverted
pass still counts as the intentional pass.

Learning: the cool-side lamp cell is now CLOSED at mirror dose, and with
it the lamp map is exhaustive in every colour direction — warm full-vector
(p28), warm power both sides (p27/p29), B-selective (p39), R-selective
(p40), R+B combined (p43), cool mirror (this pass) — plus geometry-shadow
(p44): all away-or-pinned on the B-pinned residual, B rising every time a
lamp is touched. Do not retry any lamp addition, removal, or re-chrome at
any dose, direction, or compensation; lamp power is bounded. The
tall-hide confinement re-confirmed (all tall medians hex-identical, tall
4d float-identical, tall PNG means at denoise scale).

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; accept-first — every lamp angle
   now spent including the cool side, tint/albedo spent, hue spent,
   geometry overshoots — accept at gap 1.0, within 3% of bar 8, or asset
   work only)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42 —
   no untried tint cell remains; hue-side barred — accept at gap 1.0, or
   asset work only)

Visual gaps (unchanged, read the sheets): shaggy overhanging moss cap,
dense dark spruces vs open saplings, rugged uneven strata vs flat cake
layers, sheened boulders. Remaining unspent modelling cells, all with
known collateral: spruce density via `fir_turns` (never varied — moves
wide 4h + wide turf), boulder sheen via basalt spec/rough (moves the 4d
floor that pass 1 lifted), strata SHAPE per-angle course variation
(disp/ledge/prot/thickness magnitudes all spent — needs bigger work than
a one-knob pass).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p45 lamp change, then restored to the p35-kept content by the revert —
verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p45/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 19G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in the
worktree-local `.review-venv/review-inputs/` (untracked, never committed)
with `--hero-s0-csv` (the tool re-verifies both pins itself); hero panels
are the 960-px copies there (values from CSV). Review under the
worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p45/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-45/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39/p40/p41/p42/p43/p44 precedent). No new assets
(procedural knob only — nothing to source or licence).
