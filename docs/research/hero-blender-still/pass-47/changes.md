# Pass 47: fir crown albedo x0.85 (spruce darkening without new copies) — measured, KEPT

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p47 (`~/hero3d/out/still-223/p47/`, fetched to
`hero3d-local/p47/` — git-ignored work files; the committed record is this dir).
No stale p47 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot. Second modelling/asset pass of the continued
run (lamp map closed by p45, count cell closed by p46).

## The one gap + hypothesis

Gap: the operator-named island gap "dense dark spruces vs open sapling crowns"
(pass-5 visual gap, open since research start). The p46 Next section ranks the
`tint_firs` material cell first among the remaining unspent modelling cells,
with the known collateral "moves tall turf + wide turf/4h".

Hypothesis: darkening the existing fir crowns via `tint_firs` x0.85 moves the
island toward the hero's dense dark spruces, because each crown's needle/branch
pixels render darker — more dark pixels per crown with zero new dark-conifer
pixels from count. FirFill count/geometry untouched, lamps/cameras/sky/ridges
untouched. Scored on the visual read (crown darkness on the sheets) FIRST,
plus the turf medians (mostly tree pixels) and wide 4h, plus DoD/passing-row
intactness. Collateral watch: wide 4h (baseline 14.23 vs the pass-5 14.8
ceiling, ~0.57 pp headroom) and the tall-pebble margin (2.25 over bar 8);
no tall lamp touched.

## What changed (`scripts/hero/still.py`, KEPT)

One knob: `tint_firs` (0.25, 0.32, 0.18) -> (0.2125, 0.272, 0.153), uniform
x0.85 (the p21 soil-tint falsification dose), hue preserved, with a pass-47
comment. Sibling tints, `fir_turns` (1.57,), `fir_fill_scale` (0.55), LAYERS,
lamps, cameras, sky, ridges untouched. No new assets (procedural knob only).
Kept, so `still.py` now carries the p47 tint (md5 a525d9cce1700572506ba557df6454ae);
the host stage copy is the same scp'd file.

## What moved (p35 -> p47)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method; method
re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs #1B1E24 =
7.70 exact, #2A3410 vs #1F2912 = 8.97 exact, #2B3511 vs #1F2912 = 9.20 exact;
gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19 precedent; 4h gap
= |v − 12.3|/2.46 per the pass-5 12.3 ±20 % spec, ceiling 14.8). "Hex-identical"
means median hex strings compare ==; "float-identical" means JSON values
compare == to all stored decimals (full p35-vs-p47 diff via the committed
p46 JSONs: p46 was reverted byte-identical to p35, so p46-vs-p47 deltas are
p35-vs-p47 deltas modulo denoise-domain noise; tall/wide k-share wobbles
scored on medians only per the p46 tool note). Unions: tall soil #1B1E24,
tall pebble #212111, wide pebble #2D2C10, wide soil #252729, wide moss
#384117, tall turf #283017, wide turf #1F2912 (per the look spec §4g /
pass-28 precedent).

| framing | row | p35 | p47 | verdict |
|---|---|---|---|---|
| wide | 4h dark area | 14.23221 %, gap 0.8, in | 13.82296 %, gap 0.6 | TOWARD hero s0 13.97 (−0.41 pp; now −0.15 under s0), still in — headroom to the 14.8 ceiling grows 0.57 -> 0.98 pp |
| wide | 4h edge density | 0.25252 | 0.25259 | pinned at baseline |
| wide | 4g turf median | #2B3511, 9.20, gap 1.2 | #2B3410, 9.04, gap 1.1 | TOWARD −0.16 (meanV +0.91 but k-reshuffle — medians rule per p46); still out, not a counted row (p35 precedent) |
| tall | 4g turf median | #283212, 4.37, gap 0.5 | #273111, 4.36, gap 0.5 | one hex-step darker, dE flat −0.01 (meanV −0.89 levels — darker crowns); still in |
| tall | 4h dark area | 30.84093 % | 30.15915 % (−0.68 pp) | still in (toward hero mean 28.23; −0.59 vs hero s0 30.75) |
| tall | 4h edge density | 0.57115 | 0.57144 | pinned |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED — tint does not touch the gravel window (baseline out-row untouched) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | hex-identical, 7.70, gap 1.0 | PINNED (baseline out-row untouched) |
| wide | 4g soil / moss / basalt medians | #30302C / #353E0B / #0D0D0D | all hex-identical | PINNED, still in |
| tall | 4g pebble / moss / basalt medians | #2C2C1F / #313B0A / #0A0B0C | all hex-identical | PINNED — tall-pebble margin intact |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | p0_1/p1 float-identical (4.0722); p5 same; p50 72.3003->72.2864 (not a DoD row) | DoD p1 gate (<= 8) holds at 4.0722 |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.36420 / 0.25228 | still in |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.39110 / 0.35894 | still in |
| tall/wide | 4a | — | 5th–6th-decimal moves | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 667.13 (+1.2 %)/422.44 (+1.1 %); σ within ±25 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | wide bloom_peak_L 173.69->174.40 (crown-domain); grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; bboxes identical to p35 (no geometry change), still PASS | intact |

Rows out: 2 -> 2 (the same two baseline out-rows, both pinned).
Visual read: the crowns still read as open lighter saplings at frame scale
against the hero's dense near-black spruces — the x0.85 darkening did not buy
a visible step toward the hero, and nothing else on the sheets moved (same
composition, same cake-layer read, strata/moss/boulder gaps unchanged).
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: KEPT

The visual half of the keep test fails (no visible step toward dense dark
spruces at x0.85), but the target-metric half passes: wide 4h −0.41 pp toward
hero s0 on a counted passing row (gap 0.8 -> 0.6) and wide turf median
−0.16 dE toward its union, with zero passing rows broken, DoD floors intact
(tall float-identical, wide p1 4.07 <= 8), S2 PASS both with bboxes identical
to baseline, 4i bands identical, VRAM gate clear. A small banked gain that
also buys wide-4h headroom (0.57 -> 0.98 pp) for future crown work. A kept
pass moves the baseline: p47 is the new kept state.

Learning: the `tint_firs` albedo cell is now MAPPED at the x0.85 dose, with
a surprise in the dose direction: darkening crowns REDUCED the dark-area
fraction on both framings (wide −0.41 pp, tall −0.68 pp) instead of raising
it — albedo darkening is not a dark-area adder (the 4h classifier evidently
drops the darkest crown cores, or equivalent). Do not assume tint→4h-up.
Untested continuations in this cell: a deeper uniform dose (x0.7) or a hue
push toward near-black green (R/B cut deeper than G). Tall turf dE is flat
at this dose (4.37 -> 4.36) while wide turf moves (−0.16) — the wide
framing's crowns (with FirFill copies) respond more. Tool note stands:
score k-cluster-adjacent claims on medians only (both framings' turf/moss
k-clusters reshuffled again this pass while medians moved ≤1 hex step).

Next ranked gaps (new baseline p47, still 2 rows out):

1. wide 4g pebble median, gap 1.0 (7.77; lamp map exhaustive p28/p39/p40/p43/
   p45, tint/albedo spent, hue spent, geometry overshoots, crowns pinned —
   accept at gap 1.0, within 3% of bar 8, or asset work only)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42 —
   accept at gap 1.0, or asset work only)

Visual gaps (read the sheets): shaggy overhanging moss cap, dense dark spruces
vs open saplings (tint cell mapped at x0.85 — deeper/hue doses remain; count
cell closed by p46), rugged uneven strata vs flat cake layers, sheened
boulders. Remaining unspent modelling cells, all with known collateral:
deeper/hue fir-crown darkening (this pass moved wide 4h DOWN, so headroom
grew — a deeper dose is affordable), boulder sheen via basalt spec/rough
(moves the 4d floor that pass 1 lifted), strata SHAPE per-angle course
variation (disp/ledge/prot/thickness magnitudes all spent — needs bigger work
than a one-knob pass).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p47 tint change, KEPT — md5 a525d9cce1700572506ba557df6454ae) and
`~/hero3d/out/still-223/p47/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / free (precheck device
1503/12282 MiB). This Mac rendered nothing; review ran Mac-side via
still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) in the worktree-local `.review-venv/review-inputs/` (untracked,
never committed) with `--hero-s0-csv` (the tool re-verifies both pins
itself); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p47/` (git-ignored, never committed).
Committed with this pass: `scripts/hero/still.py` (the kept one-knob tint
change) + `docs/research/hero-blender-still/pass-47/` (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/azimuth/
exit_code logs). No new assets (procedural knob only — nothing to source
or licence).
