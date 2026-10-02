# Pass 30: constant-power WideFill chroma rotation — tried, measured, REVERTED

Base: pass-29 p29 (`~/hero3d/out/still-223/p29/` on akamel-linux), 2 rows out.
This pass's render: p30 (`~/hero3d/out/still-223/p30/`, fetched to
`hero3d-local/p30/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.2 (dE76 9.59, ours #2F2B1E vs union
#2D2C10 — R +2 past 0x2D after p29's dose, G −1 short of 0x2C, B +14
pinned). Pass 29 bounded the power lever both ways: another +25% dose adds
roughly +1R/+1G with B pinned, so R runs away while G has 1 LSB left to
gain; p28's re-chrome failed by cutting total power (−5%, +2.04 away,
darker and desaturated). The untried move the record prescribes twice over
(p28's "G compensated up as R/B come down", p29's Learning) is the
constant-power chroma rotation: trim the overshooting channel and
compensate where the residual is short, holding total power so p28's
darkening trap cannot fire.

Hypothesis: rotating the WideFill chroma (1.0, 0.68, 0.38) -> (0.85, 0.72,
0.38) at fixed energy 0.75 moves the wide pebble median toward #2D2C10,
because at constant total luminance the lamp's per-channel add rotates —
−15% R where R overshoots +2 past 0x2D (walks R back without p29's
runaway), +6% G where G sits −1 short (lifts toward 0x2C), B held where
the frontal geometry pins it; total luminance is held within 0.5%
(0.7264 -> 0.7231 per-energy by Rec.709 weights), so p28's total-power cut
is avoided by construction. Note on the work order's gloss ("trim R while
holding G+B power"): holding G+B literally while trimming R cuts total
power ~7%, deeper than p28's −5% cut that moved +2.04 the wrong way — the
compensation has to go somewhere, and G is the short channel, so this pass
holds total power per p28's prescription instead. The tall framing never
sees the lamp so the thin tall-pebble margin (2.34 over bar 8) is
protected by construction, and no geometry changes so silhouette/S2 hold.
Scored on the wide pebble median plus DoD/passing-row intactness, watching
wide soil (gap 0.7) and moss (gap 0.6), which also take the fill.

The tall-soil second-fill alternative was considered and rejected before
rendering, fifth pass running: fill can only lighten, tall soil (#292A29
vs #1B1E24, lighter in every channel) needs darkening — p24's direction
argument still holds, and p25 recommends accepting that row (gap 1.0,
within 4% of bar 8) over more light.

## What changed (`scripts/hero/still.py`, since reverted)

One line of one lamp: `WideFill` colour (1.0, 0.68, 0.38) -> (0.85, 0.72,
0.38); energy 0.75, angle 5°, frontal direction, and the tall-framing hide
all untouched (plus a docstring clause noting the rotation, reverted with
it). No new assets (procedural lamp only).

## What moved (p29 -> p30)

dE76 recomputed with measure.py's own `deltaE` on RGB tuples (the p20
method; verified: #2F2B1E vs #2D2C10 = 9.59, #2E2A1F vs #2D2C10 = 10.91,
#292A29 vs #1B1E24 = 7.70, #2C291E vs #212111 = 5.66, moss union #384117
per pass 3; gap = dE/8 per pass 20).

| framing | row | p29 | p30 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2F2B1E, 9.59, gap 1.2 | #2E2A1F, 10.91, gap 1.4 | AWAY +1.32 (R 47->46 toward as predicted; G 43->42 away; B 30->31 away) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | bit-identical |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C291E, 5.66, gap 0.7 | bit-identical, margin 2.34 intact |
| wide | 4g soil median | #30302D, 5.55, gap 0.7 | #30302D, bit-identical | held |
| wide | 4g moss median | #353E0B, 4.68, gap 0.6 | #343D0B, 4.41, gap 0.55 | TOWARD −0.28, still in |
| wide/tall | 4g basalt median | #0D0D0D / #0A0B0C | #0C0D0D / #0A0B0C | wide R −1 LSB (~0.3 dE drift), tall bit-identical; still in |
| wide | 4g pebble sub-median | meanV 49.69 / meanS 0.384 / k1 0.457 | meanV 48.87 / meanS 0.361 / k1 0.456 | darker AND desaturated — p28's signature, away from union (53.4 / 0.574) |
| tall | 4g all medians | — | basalt/moss/pebble/soil/turf medians all bit-identical | lamp-hide protection held perfectly |
| wide | 4d floor p0_1 / p1 / p5 / p50 | 2.0/4.07/8.86/68.86 | 2.0/4.07/8.79/68.83 | DoD p1 gate (lift iff >= 8.0) intact; p5/p50 drift, not DoD rows |
| tall | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07 | bit-identical | intact |
| wide | 4h dark area | 14.23 % | 14.45 % | +0.21 pp, still in (hero s0 13.97) |
| tall | 4h dark area | 30.84 % | 30.84 % | +0.0002 pp |
| wide/tall | 4a | — | same best_tokens, haze-dE moves <= 0.0002 (denoise-domain) | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | band identical, bboxes character-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.4, tall soil 1.0). Visual read: sheets show
no change at frame scale — same composition and cake-layer read, wide
strata a touch cooler; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4508 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3005 MiB (derived arithmetic: 4508 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: REVERTED

The target moved the wrong way, +1.32 dE (gap 1.2 -> 1.4). Only the
predicted third of the hypothesis fired: R walked back 47->46, but G moved
away (43->42, the +6% compensation never lifted it) and B crept up
(30->31) — the window went darker and desaturated (meanV −0.8, meanS
−0.023), p28's exact signature despite total luminance held within 0.5%.
The lesson is sharper than "hold total power": for a median this dark, the
R trim itself dims the R-driven facets and the G compensation lands
elsewhere (moss took it: −0.28 toward on wide moss, the only row that
improved). Chroma rotation at any power level steers hue into neighbours
rather than the pebble median — the lamp's per-channel add does not map
onto the median channel-by-channel. Per the keep rule the `still.py`
change is reverted and p29 remains the baseline. A reverted pass still
counts as the intentional pass.

Learning: the fill-side lever is now mapped on three sides — more warm
power (p26 −2.84, p29 −0.65, both with R running away), dimmer re-chrome
(p28 +2.04), constant-power rotation (this pass +1.32). All three agree:
the wide pebble median tracks warm power up to p29's dose and every
chroma-side move since has gone away (+2.04, +1.32). What is left on this
row is mix surgery (every thickness swap spent, p20/p24/p25) or accepting
it at gap 1.2 — the residual is B-dominated (+14 of 9.59 dE sits in a
channel the frontal geometry pins; even matched R+G leaves a gap ≈ 1.0).
The tall framing's fourth straight bit-identical pass confirms the
per-framing lamp as a safe confinement mechanism — the miss cost nothing
outside wide (one neighbouring row improved, the rest held).

Next ranked gaps (baseline p29, unchanged):

1. wide 4g pebble median, gap 1.2
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; content
restored to the p29 state by the revert) and `~/hero3d/out/still-223/p30/`
(fresh pass dir). Never `~/hero3d/web4k`, `~/drone/scratch`,
`~/drone/webcheck`, `~/wayfinder`, sme-/arch- volumes. No sudo. Host / has
20G free. This Mac rendered nothing; review ran Mac-side via still_review.py
+ pinned measure.py (26f93fce…) and measurements.csv (2df42cf8…) in
`/tmp/review223` (the tool re-verifies both pins itself); hero panels are
the 960-px copies there (values from CSV). Review under the worktree-local
`.review-venv` (untracked, never committed); fetched renders under
`hero3d-local/p30/` (git-ignored, never committed). Committed with this
pass: only `docs/research/hero-blender-still/pass-30/` (sheets, scorecard,
changes, measure jsons, scores.json, s2.txt, render/vram/precheck/azimuth/
exit_code logs). `scripts/hero/still.py` restored to p29 state — no code
change kept. No new assets (procedural lamp only — nothing to source or
licence).
