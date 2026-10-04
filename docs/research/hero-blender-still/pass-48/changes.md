# Pass 48: basalt specular 0.15 -> 0.30 (underside sheen without crown work) — measured, REVERTED

Base: pass-47 p47 (`~/hero3d/out/still-223/p47/` on akamel-linux), 2 rows out.
This pass's render: p48 (`~/hero3d/out/still-223/p48/`, fetched to
`hero3d-local/p48/` — git-ignored work files; the committed record is this dir).
No stale p48 dir existed on the host; the driver created it fresh and both
framings rendered in the one shot. First pivot off crowns under the pass-47
reviewer advisory (binding: no further crown dose without a VISIBLE step
toward the hero's dense dark spruces — so this pass touches no crown knob).

## The one gap + hypothesis

Gap: the operator-named island gap "sheened boulders" (pass-5 visual gap;
ours read matte flat grey, the hero's read wet with sky-specular variation).
The `basalt_spec` cell is unspent since pass 2 set it (0.65 -> 0.15 to cure
pass 1's lifted floor); roughness, albedo and geometry untouched by any later
pass.

Hypothesis: raising the basalt Specular IOR Level 0.15 -> 0.30 moves the
island toward the hero's sheened boulders, because underside-boulder facets
catch sky specular highlights — brighter sheen pixels on the rock with zero
crown/strata/sky/lamp changes. Scored on the visual read (underside sheen on
the sheets) FIRST, plus the 4d floor (the known collateral pass 2 cured) and
the basalt/soil medians, plus DoD/passing-row intactness. Collateral watch:
the 4d p1 gates (p47: tall 3.07 / wide 4.07 vs bar <= 8 — the wide margin is
the thin one) and the tall-soil out-row window (specular bounce off brighter
rock can leak into adjacent courses). Wide 4h (13.82) is protected by
construction — no crown knob moves. Visual keep bar for this pivot: a visible
sheen step on the sheets toward the hero's wet rock, with nothing moving the
wrong way metrically; else revert.

## What changed (`scripts/hero/still.py`, REVERTED)

One knob: `basalt_spec` 0.15 -> 0.30 (2x, still far below hero.py's native
0.65), with a pass-48 comment. Sibling `basalt_rough` (0.80),
`tint_basalt` (0.06, 0.10, 0.22), all crown knobs (`tint_firs`, `fir_turns`,
`fir_fill_scale`), lamps, cameras, sky, ridges untouched. No new assets
(procedural knob only). Reverted, so `still.py` is byte-identical to the p47
kept content (md5 a525d9cce1700572506ba557df6454ae both sides); the host
stage copy was restored to the same file and re-verified.

## What moved (p47 -> p48)

dE76 with measure.py's own `deltaE` on sRGB tuples (the p20 method; method
re-verified this pass: #2F2E1E vs #2D2C10 = 7.77 exact, #292A29 vs #1B1E24 =
7.70 exact; gap = dE/8 per pass 20, 1-decimal; gap 1.0 = out per the p19
precedent; 4h gap = |v − 12.3|/2.46 per the pass-5 12.3 ±20 % spec, ceiling
14.8). "Hex-identical" means median hex strings compare ==. Unions: tall
soil #1B1E24, tall pebble #212111, wide pebble #2D2C10, wide soil #252729,
wide moss #384117, tall turf #283017, wide turf #1F2912 (per the look spec
§4g / pass-28 precedent); basalt medians carry no stated union, so their
moves are bounded by triangle inequality against the p26–p28 dE ~2 level
(gap 0.25) instead.

| framing | row | p47 | p48 | verdict |
|---|---|---|---|---|
| tall | 4d floor p0_1 / p1 / p5 | 1.7874/3.0722/5.0722 | 3.0722/5.7874/9.6470 | AWAY — floor lifts at every percentile (+1.28/+2.72/+4.57); DoD p1 gate (<= 8) still holds but the banked headroom burns |
| wide | 4d floor p0_1 / p1 / p5 | 2.0/4.0722/8.8556 | 4.0/7.6470/14.2126 | AWAY — (+2.0/+3.57/+5.36); p1 7.65 still <= 8 but the margin collapses to 0.35 |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #2E2F2D, 9.92, gap 1.2 | AWAY +2.22 on a baseline out-row (specular bounce leaks into the soil window — collateral beyond the predicted 4d-only) |
| wide | 4g soil median | #30302C, 5.98, gap 0.7 | #323330, 6.53, gap 0.8 | AWAY +0.56, still in |
| tall | 4g basalt median | #0A0B0C | #101112 (shift 2.03 dE) | lighter (the highlights land); still in by triangle bound (old dE ~2 + 2.03 < 8) |
| wide | 4g basalt median | #0D0D0D | #141413 (shift 2.73 dE) | lighter; still in by the same bound |
| tall | basalt_vs_474B59 | 30.25 (hero s0 29.82) | 28.27 | AWAY from s0 (−1.55 vs +0.44) |
| wide | basalt_vs_474B59 | 29.77 (hero s0 31.78) | 27.47 | AWAY from s0 (−4.31 vs −2.01) |
| wide | 4g pebble median | #2F2E1E, 7.77, gap 1.0 | hex-identical, 7.77, gap 1.0 | PINNED (baseline out-row untouched) |
| tall | 4g pebble median | #2C2C1F, 5.75, gap 0.7 | hex-identical | PINNED — tall-pebble margin intact (2.25 over bar 8) |
| tall/wide | 4g turf medians | #273111 4.36 / #2B3410 9.04 | hex-identical | PINNED |
| tall/wide | 4g moss medians | #313B0A / #353E0B | hex-identical | PINNED |
| wide | 4h dark area | 13.82296 %, gap 0.6 | 13.82196 % (−0.001) | PINNED — no crown knob moves, 14.8 ceiling never approached |
| tall | 4h dark area | 30.15915 % | 30.15692 % (−0.002) | PINNED |
| wide/tall | 4h edge density | 0.25259 / 0.57144 | 0.25259 / 0.57142 | pinned |
| tall | 4d p50 | 31.004 | 39.004 | not a DoD row; lifts with the floor |
| wide | 4d p50 | 72.2864 | 72.6884 | not a DoD row |
| tall | 4b falloff_sat D2/D1 / D3/D1 | 0.36420 / 0.25228 | 0.36885 / 0.25550 | still in (small moves, same side) |
| wide | 4b falloff_sat D2/D1 / D3/D1 | 0.39110 / 0.35894 | 0.39498 / 0.36250 | still in |
| tall/wide | 4a | — | 4th-decimal moves (e.g. tall 0.10 anchor 4.72104 -> 4.72145) | status unchanged, all anchors <= 9.03 vs the ΔE <= 10 bar |
| tall/wide | 4e DOF | lapvar D1 667.13/422.44 | 667.45 (+0.05 %)/422.47 (+0.01 %); σ within ±25 % | no row-status change (4e σ ±25 % per p2) |
| tall/wide | 4c/4f TOOL | — | bloom_peak_L 168.20/174.40 identical; grain sigma ±1e-5 | absence confirmed, not chased |
| 4i / S2 | band / bbox | 85.78125/83.37963, PASS both | bands identical; bboxes identical to p47 (tall x 0.480-1.000 y 0.448-0.885, wide x 0.602-0.931 y 0.290-0.858), still PASS | intact |

Rows out: 2 -> 2 (same two baseline out-rows; tall soil worsens 1.0 -> 1.2
but stays the same counted row).
Visual read: the underside boulders still read matte flat dark grey at frame
scale on both sheets against the hero's wet specular rock — the 2x spec dose
buys NO visible sheen step, and nothing else on the sheets moved (same
composition, same cake-layer read, crowns/strata/moss gaps unchanged). The
visual keep bar fails outright.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time
~24.3 s tall + ~25.8 s wide (exit 0, 55 s total); PNGs 2160x3840 /
3840x2160 as specified.

## Keep-or-revert: REVERTED

The visual keep bar fails (no sheen step at 2x spec) AND every row that moves
goes the wrong way: both 4d floors lift away from the hero (wide p1 margin
4.07 -> 7.65, one more such dose breaks the DoD gate), tall soil out-row
+2.22 dE, wide soil +0.56, basalt_vs away on both framings. Nothing moves
toward the hero anywhere. No passing row formally breaks and DoD holds, but
the keep test needs movement toward the hero or the island visibly closer —
this pass has neither, and it spends the floor headroom pass 2 banked. A
reverted pass moves nothing: p47 stays the kept baseline.

Learning: the `basalt_spec` cell is now MAPPED at the 0.30 dose, and it
falsifies the sheen-by-specular hypothesis at frame scale: doubling spec
lifts the whole shadow floor (+2.7/+3.6 p1) and leaks +2 levels into the
adjacent soil courses while the boulder facets show no readable highlight —
the underside is too shadow-facing for sky specular to model sheen. Do not
retry spec/rough without a bounced-light path (the rock faces away from the
sky that lights it). Dose-response note: the floor answers strongly
(~+3 p1 per +0.15 spec on wide) while the look answers not at all — this
knob is all collateral, no modelling. Tool note stands: score
k-cluster-adjacent claims on medians only (turf/moss k-shares reshuffled
again this pass while medians held hex-identical).

Next ranked gaps (baseline still p47, still 2 rows out):

1. wide 4g pebble median, gap 1.0 (7.77; lamp map exhaustive p28/p39/p40/p43/
   p45, tint/albedo spent, hue spent, geometry overshoots, crowns pinned —
   accept at gap 1.0, within 3% of bar 8, or asset work only)
2. tall 4g soil median, gap 1.0 (7.70; soil albedo matrix CLOSED by p42,
   basalt-spec bounce now mapped as AWAY — accept at gap 1.0, or asset work
   only)

Visual gaps (read the sheets): shaggy overhanging moss cap, dense dark spruces
vs open saplings (tint cell mapped at x0.85 — deeper/hue doses remain but
stay under the p47 advisory visual bar), rugged uneven strata vs flat cake
layers, sheened boulders (specular path falsified this pass — needs bounced
light or asset work, not more spec). Remaining unspent modelling cells, all
with known collateral: moss-cap shag/drapes geometry (never tried; turf/moss
medians are the collateral), strata SHAPE per-angle course variation
(disp/ledge/prot/thickness magnitudes all spent — needs bigger work than a
one-knob pass), deeper/hue fir-crown darkening (advisory: visible step or
revert).

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p48 spec change, then restored to the p47-kept content by the revert —
verified: md5 a525d9cce1700572506ba557df6454ae both sides) and
`~/hero3d/out/still-223/p48/` (fresh pass dir, both framings in one
shot). Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / free 19G (precheck
device 1503/12282 MiB). This Mac rendered nothing; review ran Mac-side via
still_review.py + pinned measure.py (26f93fce…) and measurements.csv
(2df42cf8…) in the worktree-local `.review-venv/review-inputs/` (untracked,
never committed) with `--hero-s0-csv` (the tool re-verifies both pins
itself); hero panels are the 960-px copies there (values from CSV). Review
under the worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p48/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-48/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/vram/
precheck/azimuth/exit_code logs). No new assets (procedural knob only —
nothing to source or licence). `scripts/hero/still.py` reverts to the p47
content, so it carries no diff.
