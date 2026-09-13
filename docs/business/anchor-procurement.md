# Anchor procurement and placement — first Sites

Resolves [issue #9](https://github.com/Akamel01/drone-survey/issues/9): the
off-the-shelf choice, the size and count, where to buy in Canada, and the
one-time placement and coordinate-recording procedure. The engineering
calculation behind this was already done and committed in
[docs/research/anchor-sizing-2026.md](../research/anchor-sizing-2026.md) and
[docs/research/anchor-auto-detection-2026.md](../research/anchor-auto-detection-2026.md);
this document does not repeat that arithmetic, it turns the two research
findings (sizing, then the detection-driven change to the paint pattern and
spacing) into one procurement and field checklist so the remaining work is
buying and painting, not re-deriving numbers. Consistent with
[ADR 0007](../adr/0007-anchors-for-cross-capture-registration.md), which
requires Anchors present and recorded before the first Capture of any Site.

## What to buy

**16″×16″ (40×40 cm) concrete patio slabs.**

| Retailer | Product | Price (CAD) | Source |
|---|---|---|---|
| Home Depot Canada | 16"×16" paving/patio stones | **$5–9 each** | [homedepot.ca — 16×16 paving stones](https://www.homedepot.ca/s/en/home/categories/outdoors/lawn-and-garden-centre/landscaping/16-x-16-paving-stones) |
| RONA | Oldcastle rectangular patio slab, concrete grey, 16"×16" | **$5–9 each** | [rona.ca — 16×16 patio slab](https://www.rona.ca/en/product/decor-precast-oldcastle-rectangular-patio-slab-concrete-grey-8-in-l-x-16-in-w-x-1-5-8-in-h-12059014-71005008) |

Buy at least **6** for the first Site (5 required, plus one spare in case one
is damaged, moved, or paved over before placement). At $5–9 each that is
**$30–54 CAD** in materials for the first Site's full Anchor set. Concrete
slabs need no stakes, glue, or burial — their own weight holds them in place,
which matters since they need to survive unattended outdoors for months
between Captures.

**Why this over the alternatives considered:** a 40 cm slab is the smallest
size that clears the sizing calculation's 20×-GSD design target at 100 m
altitude (the worst case in the 60–100 m flight band) with margin, and it
covers the whole altitude band with one size rather than needing a different
target per altitude. A Canadian purpose-built target (Spatial Technologies,
350×350 mm) is undersized for the 100 m case and its Canadian price could not
be confirmed. A 30 cm DIY bucket-lid target is undersized above ~80 m. Both
are documented as rejected, with the underlying pixel-per-marker math, in
[anchor-sizing-2026.md §5](../research/anchor-sizing-2026.md).

## What to paint on it

Not a plain cross — a **black-and-white four-quadrant target inside a circle**,
per the revision recorded in
[ADR 0007](../adr/0007-anchors-for-cross-capture-registration.md) and worked
out in detail in
[anchor-auto-detection-2026.md §7](../research/anchor-auto-detection-2026.md).
This pattern exists because Anchor identification is now fully automatic
(software detects the shape and matches it to a projected coordinate); the
circle gives a fast, forgiving coarse detection target, and the internal
quadrant boundaries give two crossing high-contrast lines the software uses to
find a precise, sub-pixel centre.

```
 ┌───────────────────────┐
 │      ▄▄▄▄▄▄▄▄▄▄▄      │
 │   ▄▄█ WHITE│BLACK █▄▄  │
 │  █    Q1   │  Q2    █  │
 │  █─────────┼─────────█ │   40 cm square slab,
 │  █    Q3   │  Q4    █  │   circle inscribed at ~34 cm diameter,
 │   ▀▀█ BLACK│WHITE █▀▀  │   opposite quadrants match, adjacent differ
 │      ▀▀▀▀▀▀▀▀▀▀▀      │
 └───────────────────────┘
```

**How to paint it, per slab:**

1. Prime or clean the slab face (new concrete may need a light wash to take
   paint evenly — exterior spray paint bonds better to a clean, dry surface).
2. Mask a 34 cm circle centred on the slab (a length of string and a marker, or
   a compass improvised from a nail and string, is enough — the outer circle
   only needs to be roughly round since it is used for coarse detection only).
3. Mask the circle into four quarters with two straight, perpendicular lines
   through the centre — this is the part that must be accurate, since the
   software finds its precise centre point from where these two lines cross.
4. Spray opposite quadrants the same colour and adjacent quadrants the
   opposite colour (Q1 white, Q2 black, Q3 black, Q4 white, or the mirror of
   that — the pattern only needs internal contrast, not a fixed orientation).
5. Let cure per the paint's instructions before the slab is walked on or
   handled.

**Paint:** any exterior-rated spray paint in black and white/gloss white, sold
at the same hardware stores as the slabs — e.g. Rust-Oleum's exterior spray
paint line at Home Depot Canada, commonly **$15–20 CAD per can**
([homedepot.ca — Rust-Oleum specialty spray paint](https://www.homedepot.ca/en/home/categories/decor/paint/spray-paint/f/rust-oleum-specialty/gw3-hc);
exact product and price were not confirmed for a specific SKU — check in
store for a concrete/masonry-rated exterior formula in each colour). Two cans
(one black, one white) comfortably cover the first Site's full set of slabs
with paint left over for touch-ups. Use exterior paint, not a vinyl decal or
tape: it survives UV and rain, and a faded or scuffed target is simple to
touch up with the same can.

## How many, and where

- **At least 5 Anchors per Site**, per the sizing research's citation of
  general ground-control-point guidance
  ([Propeller — Ground Sample Distance & Drone Data](https://www.propelleraero.com/blog/ground-sample-distance-gsd-calculate-drone-data/)).
  Buy 6 so one spare exists.
- **At least 8–10 metres apart.** This supersedes the sizing research's
  original 2 m figure: the auto-detection research
  ([anchor-auto-detection-2026.md §2](../research/anchor-auto-detection-2026.md))
  found that because identification is now automatic — matching each detected
  target to its nearest projected coordinate — two Anchors closer together than
  the camera-solve's positional error could be assigned to each other by
  mistake. 8–10 m is the spacing this project's own ADR 0007 revision settled
  on for that reason and is the number to use in the field, not the earlier 2 m
  figure.
- **Outside the part of the Site expected to change** — the changing footprint
  is exactly what a 3D Timelapse needs the Anchors to be stable against.
- **Spread around the perimeter, not clustered or in a straight line** — a
  line of Anchors under-constrains rotation. General block-control guidance
  recommends control concentrated at the edges of the area
  ([Penn State GEOG 892 — Ground Control Requirement](https://courses.ems.psu.edu/geog892/node/649)).
- **Somewhere a surveyor could physically reach later.** Phase 2 replaces the
  placeholder coordinates recorded below with a real survey, without reflying —
  that only works if the Anchor is still standing and still accessible when
  that happens.

## Reading and recording each Anchor's position — once, before the first flight

Per ADR 0007, the coordinate recorded here is a deliberate placeholder, not a
survey — absolute accuracy does not matter. What matters is that the same
number is used for every later Capture, since Registration ties every visit
to this one fixed value.

1. Stand directly over the centre of the painted target.
2. Run a waypoint-averaging mode on a phone or handheld GPS app — average the
   fix over 2–5 minutes of dwell rather than taking the first reading shown.
   Time-averaging measurably tightens a smartphone GPS fix relative to a single
   instantaneous reading
   ([smartphone GPS accuracy study, PLOS ONE / PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6638960/)).
3. Record the averaged latitude/longitude, and take a photo of the marker and
   its surroundings for human cross-reference later.
4. Write that single value into ODM's ground control file. Do this once per
   Anchor, for every Anchor, before the Site's first flight — an Anchor placed
   or read after the first Capture cannot join that Site's timelapse, per
   ADR 0007.

## Cost summary, first Site

| Item | Quantity | Unit cost | Total |
|---|---|---|---|
| 40×40 cm concrete patio slab | 6 | $5–9 | $30–54 |
| Exterior spray paint (black + white) | 2 cans | $15–20 | $30–40 |
| **Total materials, first Site** | | | **$60–94 CAD** |

Placing and painting is roughly an hour or two of physical work per Site,
plus the GPS-averaging pass (2–5 minutes per Anchor, so 10–30 minutes total
for 5–6 Anchors). Every subsequent Site repeats this same cost and procedure —
nothing here is a one-time investment across the whole business, it recurs per
Site onboarded.

## What I could not verify

- The exact Rust-Oleum SKU and price for a concrete/masonry-rated exterior
  spray paint in each colour — the product-category page did not return
  individual product prices; confirm in-store.
- A drone-survey-specific (rather than general aerial-photogrammetry) standard
  for the 5-Anchor minimum — this is inherited unchanged from the sizing
  research, which already flags it as a floor drawn from general guidance, not
  a rule specific to small consumer drones.

## Operator decisions and actions remaining

- Buy 6 concrete patio slabs and 2 cans of exterior spray paint (Home Depot or RONA), roughly $60–94 total for the first Site.
- Paint each slab with the black-and-white quadrant-in-circle pattern above and let it cure.
- Place at least 5 slabs per Site, 8–10 m apart, outside the changing footprint, reachable by a surveyor later.
- At placement, GPS-average each Anchor's position over 2–5 minutes, photograph it, and record the coordinate into ODM's ground control file before the first flight.
- Repeat this whole procedure for every new Site onboarded — it is a per-Site cost, not a one-time purchase.
