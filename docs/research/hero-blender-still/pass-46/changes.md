# Pass 46: second FirFill crown turn (spruce densification) — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p46 (`~/hero3d/out/still-223/p46/`, fetched to
`hero3d-local/p46/` — git-ignored work files; the committed record is this dir).
No stale p46 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot. First modelling/asset pass of the continued
run (lamp map closed by p45).

## The one gap + hypothesis

Gap: the operator-named island gap "dense dark spruces vs open sapling crowns"
(pass-5 visual gap, open since research start). The `fir_turns` modelling cell
was never varied; the p45 Next section ranks it the #1 modelling lead, with the
known collateral "moves wide 4h + wide turf".

Hypothesis: adding a second FirFill turn at 3.14 rad — a counter-rotated
half-scale crown per fir — closes the silhouette gaps the single 90-degree copy
leaves and moves the island toward the hero's dense dark spruces, because each
sapling gains a second occluding crown layer. FirFill copies hide on tall in
render_shot, so tall rows, the tall-pebble margin (2.25 over bar 8) and the tall
DoD floor hold by construction. Scored on the visual read (crown density on the
sheets) FIRST, plus wide 4h movement, plus DoD/passing-row intactness.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob: `fir_turns` (1.57,) -> (1.57, 3.14) with a pass-46 comment; sibling
tints, `fir_fill_scale` (0.55), LAYERS, lamps, cameras, sky, ridges untouched.
No new assets (procedural knob only). Reverted after scoring, so `still.py` is
byte-identical to the p35-kept state (md5 662096e29793608673b1f18450c6f484)
and the host stage copy was restored to match (same md5).

## What moved (p35 -> p46)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method; method
re-verified this pass: #2A3410 vs #1F2912 = 8.97 exact, #2B3511 vs #1F2912 =
9.20 exact, #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs #1B1E24 = 7.70 exact;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent; 4h gap
= |v − 12.3|/2.46 per the pass-5 12.3 ±20 % spec, ceiling 14.8). "Hex-identical"
means median hex strings compare ==; "float-identical" means JSON values
compare == to all stored decimals (full p35-vs-p46 JSON diff over tall+wide
4a–4i: 165 cells differ — tall all denoise-domain plus a k-means clustering
wobble, wide tabulated below). Unions: tall soil #1B1E24, tall pebble #212111,
wide pebble #2D2C10, wide soil #252729, wide moss #384117, tall turf #283017,
wide turf #1F2912 (per the look spec §4g / pass-28 precedent).

| framing | row | p35 | p46 | verdict |
|---|---|---|---|---|
| wide | 4h dark area | 14.23221 %, gap 0.8, in | 14.92577 %, gap 1.1 | OUT — over the pass-5 14.8 ceiling. The known collateral arrived (+0.69 pp) and broke a passing row |
| wide | 4h edge density | 0.25252 | 0.24955 | crowns filled (fewer edges), consistent with densification |
| wide | 4g turf median | #2B3511, 9.20, gap 1.2 | #2A3410, 8.97, gap 1.1 | TOWARD −0.23 (meanV −1.70 levels, meanS +0.011 — darker crowns); still out, not a counted row (p35 precedent) |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED — crowns do not touch the gravel window |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | hex-identical, 5.98, gap 0.7 | PINNED, still in |
| wide | 4g moss median | #353E0B, 4.68, gap 0.6 | hex-identical, 4.68, gap 0.6 | PINNED, still in (k-share wobble only) |
| wide | 4g basalt median | #0D0D0D | hex-identical | still in |
| tall | 4g medians (all five) | #2C2C1F / #292A29 / #313B0A / #283212 / #0A0B0C | all hex-identical | PINNED — hide protection held; tall-pebble margin 2.25 intact |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | p0_1/p1 float-identical (4.0722); p5 8.8556 (p50 72.2812->72.3003, not a DoD row) | DoD p1 gate (<= 8) holds at 4.0722 |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 7th-decimal moves | still in (edge 0.353 per p11) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38581 / 0.35408 | still in |
| tall | 4h dark area | 30.84093 % | 30.84093 % (5th-decimal) | still in |
| tall/wide | 4a | — | tall 5th–6th-decimal; wide max abs move ~0.0001 dE | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 658.85 (+0.00 %)/395.73 (−5.3 %); sigma px −0.00/−1.35 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c wide bloom_peak_L 174.40->173.69 (crown-domain); grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; bboxes identical to p35 (no geometry change), still PASS | intact |

Rows out: 2 -> 3 (wide 4h joined the out-rows; the two baseline out-rows pinned).
Visual read: sheets show marginally fuller crowns at frame scale but the
saplings still read open against the hero's dense dark spruces — the +0.69 pp
of dark area did not buy a visible step toward the hero, and nothing else on
the sheets moved (same composition, same cake-layer read, strata/moss/boulder
gaps unchanged). No improvement worth a broken row.
VRAM: vram.log device peak 4512 MiB (112 samples), precheck baseline
1503 MiB, our-render peak 3009 MiB (derived arithmetic: 4512 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The densification worked mechanically (edge density down, turf darker, dark
area up) but its first-order effect landed on the one row the p45 Next section
said it would move — wide 4h — and pushed it over the pass-5 14.8 ceiling
(14.23 -> 14.93, gap 0.8 -> 1.1), while the target visual (dense dark spruces)
did not visibly arrive and both baseline out-rows stayed pinned. A passing row
broke for no keep-qualifying gain, so the change comes out. DoD floors hold
(tall float-identical, wide p1 4.07 <= 8), S2 PASS both with bboxes identical
to baseline, 4i bands identical, VRAM gate clear. A reverted pass still counts
as the intentional pass.

Learning: the `fir_turns` densification cell is now MAPPED at the +1-turn
dose, with its dose direction recorded: each added turn costs ~+0.7 pp of wide
4h against a ceiling with only ~0.6 pp of headroom left at baseline (14.23 vs
14.8). Do not add FirFill turns at any dose — the 4h ceiling binds before the
crowns read dense. Crown work must come from a lever that darkens/closes
crowns WITHOUT adding dark-conifer pixels: fir crown material darkening
(`tint_firs`, moves tall too — tall turf has headroom, gap ~0.7, but the
tall-pebble margin must be watched) or smaller `fir_fill_scale` (denser core,
fewer outlying dark pixels — untested direction). Tool note: tall 4g turf
k-means clusters wobble across measure runs (p35 JSON k1 #202911/0.59 vs p45
and p46 both #1E2711/0.52 — p45-vs-p46 identical to 4 decimals) while medians
stay hex-identical; score k-cluster-adjacent claims on medians only.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; lamp map exhaustive p28/p39/p40/p43/
   p45, tint/albedo spent, hue spent, geometry overshoots, crowns pinned —
   accept at gap 1.0, within 3% of bar 8, or asset work only)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42 —
   accept at gap 1.0, or asset work only)

Visual gaps (read the sheets): shaggy overhanging moss cap, dense dark spruces
vs open saplings (turn-count cell now mapped — material/scale cells remain),
rugged uneven strata vs flat cake layers, sheened boulders. Remaining unspent
modelling cells, all with known collateral: fir crown darkening via
`tint_firs` (moves tall turf + wide turf/4h — tall turf gap ~0.7 has room),
boulder sheen via basalt spec/rough (moves the 4d floor that pass 1 lifted),
strata SHAPE per-angle course variation (disp/ledge/prot/thickness magnitudes
all spent — needs bigger work than a one-knob pass).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p46 fir-turn change, then restored to the p35-kept content by the revert —
verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p46/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / free (precheck device
1503/12282 MiB). This Mac rendered nothing; review ran Mac-side via
still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) in the worktree-local `.review-venv/review-inputs/` (untracked,
never committed) with `--hero-s0-csv` (the tool re-verifies both pins
itself); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p46/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-46/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39/p40/p41/p42/p43/p44/p45 precedent). No new assets
(procedural knob only — nothing to source or licence).
