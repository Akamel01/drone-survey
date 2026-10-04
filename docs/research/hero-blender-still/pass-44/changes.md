# Pass 44: turf-rim overhang 0.30 -> 0.45 — tried, measured, REVERTED

Base: pass-35 p35 (`~/hero3d/out/still-223/p35/` on akamel-linux), 2 rows out.
This pass's render: p44 (`~/hero3d/out/still-223/p44/`, fetched to
`hero3d-local/p44/` — git-ignored work files; the committed record is this dir).
No stale p44 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot.

## The one gap + hypothesis

Gap: the moss-cap overhang visual (operator-named island gap) plus the
ranked-#1 wide 4g pebble median, gap 1.0 (dE76 7.77, ours #2F2E1E vs union
#2D2C10 — R 47 vs 45 (+2), G 46 vs 44 (+2), B 30 vs 16 (+14)). The p43 Next
section leaves both out-rows accept-first-or-modelling and names modelling
as the only unspent frontier. The `overhang` knob (hero.py island_rings:
rim radius grows with K["overhang"]) was never varied in any pass — the
only rim-lip cell on the map (disp magnitude p17, ledge p9, per-layer
prot p18/19/22/27, thickness p20/24 spent; lamp colour spent p28/39/40/43).

Hypothesis: pushing the turf-rim lip outward past the recessed humus
(0.30 -> 0.45, +50 %) strengthens the shaggy-overhang read and its lip
shadow, shifting the pebble/soil window mix from lit to shadow pixels and
moving the wide pebble median toward #2D2C10; same verts moved so poly/VRAM
stay neutral, and sky/ridges/cloud are untouched so 4a/4i hold. Scored on
the visual overhang read plus the wide pebble median plus DoD/passing-row
intactness. Keep iff the lip reads stronger without breaking a passing
row/DoD. Predicted risk (p9 sign lesson): shadow darkening overshooting
past the union.

## What changed (`scripts/hero/still.py`, REVERTED)

Two lines only, following the existing hero.K patch pattern: K2
`"overhang": 0.45` with a pass-44 comment, plus `"overhang"` in the
`("tree_scale", "lumps", "under_boulders")` patch tuple in main().
Cameras, lamps, tints, pebble hue (0.56), LAYERS, sky, ridges untouched.
No new assets (procedural knob only). Reverted after scoring, so `still.py`
is byte-identical to the p35-kept state (md5
662096e29793608673b1f18450c6f484) and the host stage copy was restored to
match (same md5).

## What moved (p35 -> p44)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method;
method re-verified this pass: #292A29 vs #1B1E24 = 7.70 exact, #2C2C1F vs
#212111 = 5.75 exact, #2F2E1E vs #2D2C10 = 7.77 exact, #30302C vs #252729 =
5.98 exact, #353E0B vs #384117 = 4.68 exact; gap = dE/8 per pass 20,
1-decimal; gap 1.0 = out per the p19 precedent). "Hex-identical" means
median hex strings compare ==; "float-identical" means JSON values compare
== to all stored decimals (full p35-vs-p44 JSON diff over tall+wide
4a–4i, not by eye; differing cells tabulated below, all else identical).
Unions: tall soil #1B1E24, tall pebble #212111, wide pebble #2D2C10, wide
soil #252729, wide moss #384117, tall turf #283017, wide turf #1F2912,
basalt #090C11 / #0A0B0F (per the look spec §4g / pass-28 precedent).

| framing | row | p35 | p44 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | #24231A, 12.75, gap 1.6 | AWAY +4.98 (R 47->36: overshot past union 45 by −9; G 46->35: past 44 by −9; B 30->26: still +10 over union 16 — the pinned channel barely moved while R/G blew past) |
| wide | 4g pebble sub-median | meanV 49.7210 / meanS 0.38027 / share 0.03491 | meanV 40.2397 / meanS 0.30815 / share 0.03989 | −9.48 levels / −0.072 S — lip-shadow darkening/desaturation, an order past any lamp pass |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | #202118, 4.67, gap 0.6 | TOWARD −1.08, still IN (bar 8), margin 2.25 -> 3.33 — consolation on an already-in row |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #282927, 7.83, gap 1.0 | +0.13, still out; meanV −1.80 levels (shadow reached it, median did not follow) |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #2E2E2A, 5.37, gap 0.7 | TOWARD −0.61, still in |
| tall/wide | 4g moss median | #313B0A, 4.46 / #353E0B, 4.68, gap 0.6 | #313C0B, 4.36 / #353F0C, 4.61, gap 0.5/0.6 | −0.10/−0.07, still in |
| tall/wide | 4g basalt median | #0A0B0C / #0D0D0D | hex-identical | still in |
| tall | 4g turf median | #283212, 4.37, gap 0.5 | #283311, 5.62, gap 0.7 | +1.25, still in (margin narrowed) |
| wide | 4g turf median | #2B3511, 9.20 | #2C3611, 9.89 | +0.69; outside bar 8 at baseline too — no status change, not a counted row (p35 precedent: rows-out counts pebble+soil only) |
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | float-identical (no tall-4d diff lines) | intact (DoD p1 gate holds) |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | float-identical | intact (DoD p1 gate <= 8 holds at 4.0722) |
| tall/wide | 4d p50 | 31.0040/72.2812 | 30.7874/69.8328 | −0.22/−2.45, denoise-domain, not DoD rows |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36404 / 0.25217 | 0.35894 / 0.24863 | still in (edge 0.353 per p11) — margin narrowed, watched |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39083 / 0.35869 | 0.38362 / 0.35207 | still in |
| tall | 4h dark area | 30.84093 % | 30.89816 % (+0.06 pp) | still in |
| wide | 4h dark area | 14.23221 % | 14.27957 % (+0.05 pp) | still in (in-precedent max p28: 14.63) |
| tall/wide | 4a | — | max abs move ~0.0003 dE (denoise-domain) | status unchanged |
| tall/wide | 4e DOF | lapvar D1 658.84/417.97 | 656.92 (−0.29 %)/432.55 (+3.47 %); sigma px −0.06 %/+0.53 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | 4c identical (wide bloom_falloff 1.4014->1.4010 denoise); grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; tall bbox identical, wide bbox 0.602-0.931 -> 0.599-0.939 (rim growth, still PASS) | intact |

Rows out: 2 -> 2 (target 1.0->1.6 away, tall soil pinned at 1.0; net across
the two out-rows +5.11).
Visual read: the turf lip extends marginally at frame scale but the strata
still read as flat cake layers — none of the hero's shaggy dripping moss,
embedded stones, or uneven courses appeared; the olive bands simply went
darker under the lip shadow. No other regression at frame scale.
VRAM: vram.log device peak 4518 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3015 MiB (derived arithmetic: 4518 − 1503),
render.log Cycles leg Mem high-water 2200 MiB, gate 6144 MiB. 4K time
~55 s total (exit 0); PNGs 2160x3840 / 3840x2160 as specified.

## Keep-or-revert: REVERTED

The target moved the wrong way, +4.98 dE (gap 1.0 -> 1.6): the lip shadow
overshot R and G a full 9 levels past the union while B — the channel this
row cannot shed — moved only −4 and still dominates in Lab. It is the same
B-pinned story as every lamp pass (p28/p39/p40/p43), now delivered through
geometry instead of light. The tall-pebble −1.08 is consolation on an
already-in row, not a keep. DoD floors hold (both framings float-identical
on p0_1/p1/p5), S2 PASS both, 4i bands identical, VRAM gate clear; no
passing row broke (margins narrowed on tall 4b and tall turf, restored by
the revert rather than ruled on). A clean falsification, not a breakage. A
reverted pass still counts as the intentional pass.

Learning: the overhang lever is now CLOSED at this dose and direction
(0.30 -> 0.45): rim-lip geometry couples into the pebble windows purely as
shadow darkening, which overshoots R/G while B stays pinned — geometry
cannot fix a B-channel residual either. Do not retry overhang up at any
dose (the coupling is monotonic shadow); overhang down contradicts the
visual gap outright. The moss-cap overhang read needs asset-level work
(dripping moss geometry, embedded stones — the hero's actual lip detail),
not a rim-radius knob.

Next ranked gaps (baseline p35, restored):

1. wide 4g pebble median, gap 1.0 (7.77; accept-first — lamp angles spent,
   tint/albedo spent, hue spent, geometry overshoots — accept at gap 1.0,
   within 3% of bar 8, or asset work only)
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
p44 overhang change, then restored to the p35-kept content by the
revert — verified: md5 662096e29793608673b1f18450c6f484 both sides) and
`~/hero3d/out/still-223/p44/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 19G free. This
Mac rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in the
worktree-local `.review-venv/review-inputs/` (untracked, never committed)
with `--hero-s0-csv` (the tool re-verifies both pins itself); hero panels
are the 960-px copies there (values from CSV). Review under the
worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p44/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-44/`
only (sheets, scorecard, changes, measure jsons, scores.json, s2.txt,
render/vram/precheck/azimuth/exit_code logs) — no `still.py` change
(reverted; p36/p37/p38/p39/p40/p41/p42/p43 precedent). No new assets
(procedural knob only — nothing to source or licence).
