# Pass 29: raise the WideFill energy at fixed chroma — tried, measured, KEPT

Base: pass-26 p26 (`~/hero3d/out/still-223/p26/` on akamel-linux), 2 rows out.
This pass's render: p29 (`~/hero3d/out/still-223/p29/`, fetched to
`hero3d-local/p29/` — git-ignored work files; the committed record is this dir).

## The one gap + hypothesis

Gap: wide 4g pebble median, gap 1.3 (dE76 10.24, ours #2E2A1E vs union
#2D2C10 — R matched at +1 LSB, G −2, B +14). Pass 28 proved chroma and
power are coupled through this lamp: re-chroming the WideFill at fixed
energy cut its total power and the target moved the wrong way (+2.04,
darker and desaturated). The untried power-side move is the symmetric one:
more of the same light, no hue shift. Pass 26 mapped the lamp's
per-channel add at energy 0.6 (+6R/+4G/+0B over p24 with B pinned by the
frontal geometry), so a +25% dose should lift G (−2 short) toward 0x2C
while B stays pinned.

Hypothesis: raising the WideFill energy 0.6 -> 0.75 at fixed chroma (1.0,
0.68, 0.38) moves the wide pebble median toward #2D2C10, because the
lamp's per-channel add scales with energy at fixed ratios — more G where
G is −2 short, B pinned near full-on by geometry; the scored risk is R
(matched +1 LSB) overshooting past 0x2D, which is pass 27's a priori
objection, never measured until now. The tall framing never sees the lamp
so the thin tall-pebble margin (2.34 over bar 8) is protected by
construction, and no geometry changes so silhouette/S2 hold. Scored on
the wide pebble median plus DoD/passing-row intactness, watching wide
soil (gap 0.65) and basalt (gap 0.25), which also take the fill.

The tall-soil second-fill alternative was considered and rejected before
rendering, fourth pass running: fill can only lighten, tall soil
(#292A29 vs #1B1E24, lighter in every channel) needs darkening — p24's
direction argument still holds, and p25 recommends accepting that row
(gap 1.0, within 4% of bar 8) over more light.

## What changed (`scripts/hero/still.py`, KEPT)

One knob of one lamp: `WideFill` energy 0.6 -> 0.75; colour (1.0, 0.68,
0.38), angle 5°, frontal direction, and the tall-framing hide all
untouched (plus a docstring clause noting the raise). No new assets
(procedural lamp only).

## What moved (p26 -> p29)

dE76 recomputed with measure.py's own `deltaE` on RGB tuples (the p20
method; verified: #2E2A1E vs #2D2C10 = 10.24, #2F2B1E vs #2D2C10 = 9.59,
#292A29 vs #1B1E24 = 7.70, #2C291E vs #212111 = 5.66, moss union #384117
per pass 3; gap = dE/8 per pass 20).

| framing | row | p26 | p29 | verdict |
|---|---|---|---|---|
| wide | 4g pebble median | #2E2A1E, 10.24, gap 1.3 | #2F2B1E, 9.59, gap 1.2 | TOWARD −0.65 (R 46->47 vs 45: p27's overshoot confirmed, +1 LSB past; G 42->43 toward; B 30->30 pinned) |
| tall | 4g soil median | #292A29, 7.70, gap 1.0 | #292A29, 7.70, gap 1.0 | bit-identical |
| tall | 4g pebble median | #2C291E, 5.66, gap 0.7 | #2C291E, 5.66, gap 0.7 | bit-identical, margin 2.34 intact |
| wide | 4g soil median | #2F2F2C, 5.21, gap 0.65 | #30302D, 5.55, gap 0.7 | AWAY +0.34, still in |
| wide | 4g moss median | #343D0B, 4.41, gap 0.55 | #353E0B, 4.68, gap 0.6 | AWAY +0.27, still in |
| wide/tall | 4g basalt median | #0C0D0D / #0A0B0C | #0D0D0D / #0A0B0C | wide R +1 LSB (drift 0.33 dE vs p26), tall bit-identical; still in |
| wide | 4g pebble sub-median | meanV 48.83 / meanS 0.377 / k1 0.465 | meanV 49.69 / meanS 0.384 / k1 0.457 | V and S toward union (53.4 / 0.574); k1 share −0.008 vs union 0.544 |
| tall | 4g all medians | — | every median bit-identical; only 5th-decimal float noise in shares/means | lamp-hide protection held perfectly |
| wide | 4d floor p0_1 / p1 / p5 / p50 | 2.0/4.0/8.07/68.11 | 2.0/4.07/8.86/68.86 | DoD p1 gate (lift iff >= 8.0) intact; p5/p50 drift, not DoD rows |
| tall | 4d floor p0_1 / p1 / p5 | 1.79/3.07/5.07 | bit-identical | intact |
| wide | 4h dark area | 14.23 % | 14.23 % | +0.004 pp, still in (hero s0 13.97) |
| tall | 4h dark area | 30.84 % | 30.84 % | −0.0002 pp |
| wide/tall | 4a | — | same tokens, haze-dE moves <= 0.001 (denoise-domain) | status unchanged |
| 4i / S2 | band / bbox | 85.78/83.38, PASS both | band identical, bboxes character-identical, PASS both | intact |

Rows out: 2 -> 2 (wide pebble 1.2, tall soil 1.0). Visual read: sheets show
no change at frame scale — same composition and cake-layer read, wide
strata a touch warmer; the known visual gaps (rugged strata, moss cap,
spruces, boulder sheen) persist unchanged; no regression.
VRAM: vram.log device peak 4510 MiB (105 samples), precheck baseline
1503 MiB, our-render peak 3007 MiB (derived arithmetic: 4510 − 1503),
render.log Cycles leg Mem high-water 2192 MiB, gate 6144 MiB. 4K time ~55 s
total (exit 0).

## Keep-or-revert: KEPT

The target moved the right way, −0.65 dE (gap 1.3 -> 1.2), and nothing
passing broke: wide soil and moss drifted away-but-in (+0.34/+0.27, gaps
0.7/0.6), basalt moved 1 LSB (0.33 dE), the tall framing is bit-identical,
and every DoD gate holds — the same shape as pass 26's keep (−2.84 with
away-but-in soil/basalt). Pass 27's R-overshoot objection is now measured
rather than a priori: R did overshoot (+1 LSB past the union) and the net
still improved, because the G lift and pinned B outweighed it — which
bounds this lever: the next +25% dose would add roughly another +1R/+1G
with B pinned, so R runs away while G has only 1 LSB left to gain. Per the
keep rule the `still.py` change stays and p29 becomes the baseline. A kept
pass still counts as the intentional pass.

Learning: the fill-side lever's dose curve is now mapped on both sides —
0.0 -> 0.6 moved the pebble median −2.84 (p26), 0.6 -> 0.75 moved it −0.65
(this pass), and the R channel has crossed from matched to +2 overshoot
while B never moves under frontal light. Power is nearly spent on this
row: what is left is a constant-power chroma rotation (untried: G
compensated up as R/B come down, p28's prescription), mix surgery (every
thickness swap spent, p20/p24/p25), or accepting the row at gap 1.2. The
tall framing's third straight bit-identical pass confirms the per-framing
lamp as a safe confinement mechanism.

Next ranked gaps (baseline p29):

1. wide 4g pebble median, gap 1.2
2. tall 4g soil median, gap 1.0

Visual gaps (unchanged, read the sheets): rugged uneven strata vs flat cake
layers, shaggy overhanging moss cap, dense dark spruces vs open saplings,
sheened boulders.

## Touches note

Host (akamel-linux) touched only `~/hero3d/still223/still.py` (scp; the
p29 energy raise, KEPT) and `~/hero3d/out/still-223/p29/` (fresh pass dir).
Never `~/hero3d/web4k`, `~/drone/scratch`, `~/drone/webcheck`,
`~/wayfinder`, sme-/arch- volumes. No sudo. Host / has 20G free. This Mac
rendered nothing; review ran Mac-side via still_review.py + pinned
measure.py (26f93fce…) and measurements.csv (2df42cf8…) in `/tmp/review223`
(sha-verified against the pins; the tool re-verifies both pins itself);
hero panels are the 960-px copies there (values from CSV). Review under
the worktree-local `.review-venv` (untracked, never committed); fetched
renders under `hero3d-local/p29/` (git-ignored, never committed).
Committed with this pass: `docs/research/hero-blender-still/pass-29/`
(sheets, scorecard, changes, measure jsons, scores.json, s2.txt, render/
vram/precheck/azimuth/exit_code logs) plus the one-knob `scripts/hero/
still.py` energy raise it keeps (p26 precedent: kept passes commit the
kept knob). No new assets (procedural lamp only — nothing to source or
licence).
