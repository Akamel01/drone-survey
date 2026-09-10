# Anchor sizing and marking procedure (2026)

Resolves the AFK-able half of [Akamel01/drone-survey#9](https://github.com/Akamel01/drone-survey/issues/9):
size, count/placement rule, off-the-shelf sourcing, and the one-time coordinate-read
procedure for physical Anchors, per
[ADR 0007](/Users/akamel/Documents/Drone/docs/adr/0007-anchors-for-cross-capture-registration.md).
Not in scope, per the issue: durable materials engineering or a hardened manufactured spec.

## Recommendation

**Buy 16"×16" (40×40 cm) concrete patio slabs and paint a high-contrast cross/quadrant
target on each. Place at least 5 per Site, spread around the edge of the Site outside
the changing footprint, no two closer than 2 m, at points a surveyor could reach later.**

- One size covers the whole 60–100 m altitude band. At 100 m (worst case, lowest
  resolution) a 40 cm target still spans ~22 pixels of ground sample distance — above
  every "reliable identification" threshold found in the sources below, with more
  margin at 60–80 m.
- $5–9 CAD each at Home Depot Canada / RONA, no fabrication, no waiting on a supplier.
  This is literally the issue's own suggestion ("painted paving slabs") sized against
  the drone's actual optics instead of guessed.
- A purpose-built alternative exists from a Canadian supplier (Spatial Technologies,
  350×350 mm cross/circle targets) but is smaller than the size this calculation
  recommends — see §5.
- 5 Anchors is the floor from general GCP-distribution guidance, not a drone-survey-
  specific standard; see §6 for the reasoning and §7 caveats.

## 1. Camera specs (DJI Mini 5 Pro)

Source: DJI's official spec page, fetched directly.
[dji.com/mini-5-pro/specs](https://www.dji.com/mini-5-pro/specs)

| Spec | Value |
|---|---|
| Sensor | 1-inch CMOS, 50 MP effective |
| Max still resolution | 8192 × 6144 px |
| Lens focal length | 24 mm, stated as "format equivalent" (35 mm-equivalent) |
| Aperture | f/1.8 |
| Field of view | 84° (DJI states this as a single FOV figure; for this sensor shape it is the **diagonal** FOV — see the consistency check in §2) |
| Focus range | 0.5 m to ∞ |

**Not published by DJI**: the sensor's physical width/height in mm, the lens's actual
(non-equivalent) focal length in mm, and pixel pitch. I fetched the spec page directly
and confirmed these are absent — DJI gives only the 35 mm-equivalent focal length and
the diagonal FOV. Because of this, §2 uses a calculation method that needs only the
*published* numbers (FOV + resolution), and cross-checks it against a second method
that assumes the physical sensor size is DJI's own long-standing "1-inch" class
(13.2 × 8.8 mm, the same nominal size used across the Phantom 4 Pro / Mavic 3 line).
Both give the same answer within ~5%, so the assumption isn't load-bearing, but flagging
it per §7.

## 2. Ground Sample Distance at 60/80/100 m

**Method A — diagonal FOV (uses only DJI-published numbers, no assumption needed):**

Diagonal pixel count:
√(8192² + 6144²) = √(67,108,864 + 37,748,736) = √104,857,600 = **10,240 px**

Ground diagonal footprint at altitude H: D = 2·H·tan(FOV/2) = 2·H·tan(42°), tan(42°) ≈ 0.9004

| Altitude H | Diagonal footprint D = 2H·tan(42°) | GSD = D / 10,240 px |
|---|---|---|
| 60 m | 2×60×0.9004 = 108.05 m | 108.05/10240 = **1.055 cm/px** |
| 80 m | 2×80×0.9004 = 144.06 m | 144.06/10240 = **1.407 cm/px** |
| 100 m | 2×100×0.9004 = 180.08 m | 180.08/10240 = **1.759 cm/px** |

**Method B — width-equivalence cross-check** (assumes nominal 1″ sensor 13.2×8.8 mm,
giving an actual focal length of 24 mm ÷ (36 mm/13.2 mm) = 24 ÷ 2.727 = 8.8 mm):

GSD (cm/px) = sensor width (mm) × H (m) × 100 / (focal length (mm) × image width px)
= 13.2 × H × 100 / (8.8 × 8192)

| Altitude H | Calculation | GSD |
|---|---|---|
| 60 m | 13.2×60×100/(8.8×8192) = 79,200/72,089.6 | **1.099 cm/px** |
| 80 m | 13.2×80×100/(8.8×8192) = 105,600/72,089.6 | **1.465 cm/px** |
| 100 m | 13.2×100×100/(8.8×8192) = 132,000/72,089.6 | **1.831 cm/px** |

Both methods agree to within ~4–5%. Method B is consistently the more conservative
(larger GSD ⇒ larger required marker), so **the marker-sizing arithmetic below uses
Method B's numbers**: ≈1.1, 1.5, 1.8 cm/px at 60/80/100 m.

GSD formula source (standard form used above):
[Pix4D — Ground sampling distance (GSD)](https://support.pix4d.com/hc/en-us/articles/202559809-What-is-the-Ground-Sampling-Distance-GSD-)

## 3. How many pixels a marker needs

No single number is universal; the guidance clusters into a floor and a "do it properly" band:

- **Floor, ~5× GSD**, cited independently by:
  - Pix4D: "a GCP target should be five to ten times the dimensions of the GSD" —
    [Pix4D best practices](https://support.pix4d.com/hc/en-us/articles/202557489)
  - OpenDroneMap: "a common rule of thumb is that target size should be at least
    five times the GSD" — [ODM ground control points docs](https://docs.opendronemap.org/gcp/)
  - Propeller: "minimum target size is at least 5× the GSD" —
    [Propeller — Ground Control in Drone Surveying](https://www.propelleraero.com/blog/things-to-know-about-ground-control-in-drone-surveying/)
- **Pix4D's own automatic target detection (AutoGCP)** requires "at least 20 times
  the average GSD" — [Pix4D — Automatic target detection](https://support.pix4d.com/hc/en-us/articles/4402423894545).
  Manual tagging (what ADR 0007 specifies — a human tags Anchors per Capture) is more
  forgiving than automatic detection, but 20× is a good target for *repeatable, precise
  center-picking by eye across many separate visits*, which is the actual requirement here
  ("precise, repeatable centre identification" per the issue).
- **Propeller**, for durable targets meant to work across a range of altitudes (our
  situation exactly — one marker size for 60–100 m): "15–25× is common for durable
  reusable targets" — [same Propeller article](https://www.propelleraero.com/blog/things-to-know-about-ground-control-in-drone-surveying/).
- **ODM's own worked example** cross-validates the higher end: "30×30 cm markers are
  sufficient for a DJI Phantom 4 Pro flying 50 m above the ground" —
  [ODM ground control points docs](https://docs.opendronemap.org/gcp/). The P4 Pro has the
  same nominal 1″/13.2 mm sensor class and a 20 MP, 5472×3648 sensor; running that
  aircraft's numbers through Method B gives GSD ≈ 1.37 cm/px at 50 m, so ODM's fielded
  30 cm target is ~22× GSD — landing right inside the 15–25× band above, from an
  independent real-world data point rather than a rule of thumb.
- **ODM's ArUco fiducial markers** (a different, code-based target style) want "minimum
  20×20 px, optimal 30×30 px" across the marker — same source as above.

**Design multiple used below: 20× GSD**, at the worst-case (100 m, coarsest resolution)
altitude. It sits inside the 15–25× "durable, multi-altitude" band, matches Pix4D's own
automatic-detection bar, and matches ODM's independently-fielded example — three
converging data points, not one cherry-picked number. The bare 5× floor exists but is a
"can I make it out at all" threshold, not a "precise, repeatable" one, which is what the
issue asks for.

## 4. Required marker size

Required size (cm) = 20 × GSD (cm/px) at each altitude, worst case first:

| Altitude | GSD (Method B) | 20× GSD |
|---|---|---|
| 100 m | 1.831 cm/px | 20 × 1.831 = **36.6 cm** |
| 80 m | 1.465 cm/px | 20 × 1.465 = 29.3 cm |
| 60 m | 1.099 cm/px | 20 × 1.099 = 22.0 cm |

The binding constraint is the 100 m case: 36.6 cm. Rounding up to the nearest
widely-stocked size gives **40 cm (16 in)**.

Checking the margin a fixed 40 cm marker actually gives at each altitude
(pixels-across = 40 / GSD):

| Altitude | GSD | Pixels across a 40 cm marker | Multiple of GSD |
|---|---|---|---|
| 60 m | 1.099 cm/px | 40/1.099 = 36.4 px | 36× |
| 80 m | 1.465 cm/px | 40/1.465 = 27.3 px | 27× |
| 100 m | 1.831 cm/px | 40/1.831 = 21.9 px | 22× |

Even at 100 m the margin (22×) still clears the 20× design target and Pix4D's automatic-
detection bar; at 60–80 m the margin is generous. **40 cm is the one size that covers
the whole 60–100 m envelope with margin, not just at the mean altitude.**

## 5. Design and sourcing

**Pattern.** High-contrast cross, checkerboard, or circular targets are the three
standard styles; for aerial GCPs specifically, "a circular target is best suited... in
the condition in which the target appears with few pixels in the image" — i.e. exactly
the tight-margin 100 m case here —
[survey of GCP target types, Redalyc/SciELO](https://www.redalyc.org/journal/3939/393956631002/html/).
A cross or quadrant checkerboard is easier to hand-paint accurately and is the more
common field choice; either is fine given the 40 cm size already carries margin. Center
the pattern so there is one unambiguous pixel to tag, not an edge or corner.

**Color/contrast.** "Colors are chosen for contrast against the ground: orange and
white on grass or soil, black and white in mixed terrain" —
[JOUAV — Guide to GCPs](https://www.jouav.com/blog/ground-control-points.html). Exterior
paint (not vinyl decal) survives UV and rain better and is trivially touched up if it
fades or gets scuffed.

**Off the shelf in Canada, ranked:**

1. **16"×16" (40×40 cm) concrete patio slab**, painted — matches the calculated size
   exactly, self-weighting (no anchoring/staking needed, doesn't blow away or need
   burial), $5–9 CAD, stocked at Home Depot Canada and RONA —
   [Home Depot Canada 16×16 patio stones](https://www.homedepot.ca/s/en/home/categories/outdoors/lawn-and-garden-centre/landscaping/16-x-16-paving-stones),
   [RONA 16×16 patio slab](https://www.rona.ca/en/product/decor-precast-oldcastle-rectangular-patio-slab-concrete-grey-8-in-l-x-16-in-w-x-1-5-8-in-h-12059014-71005008).
   This is the recommendation.
2. **Purpose-built Canadian supplier target**: Spatial Technologies sells 350×350 mm
   (35 cm) cross/circle GCP targets —
   [spatialtechnologies.ca](https://spatialtechnologies.ca/products/ground-control-target-350x350-mm-with-cross).
   35 cm is under the 36.6 cm break-even for 100 m, so this only clears the 20×
   design bar below ~95 m; usable, but doesn't cover the full stated altitude band with
   margin the way the 40 cm slab does. I could not retrieve this vendor's CAD pricing —
   the product page content is paginated/JS-rendered and only partially fetched.
3. **DIY bucket-lid combo** (community-documented, not Canada-specific): a 12"
   (~30 cm) 5-gallon pail lid taped into a checkerboard, sometimes backed on a white
   access panel — $1–2 per target, reusable indefinitely —
   [DIY drone community writeup](https://diydrones.com/profiles/blogs/creating-quality-gcps-for-mapping-tips).
   At 30 cm this is 30/1.83 ≈ 16× GSD at 100 m — below the 20× design target, though
   above the bare 5× floor. Workable if a Site is never flown above ~80 m, but not the
   one-size-for-everything answer the issue wants; excluded from the primary
   recommendation for that reason, not because it's a bad marker.

## 6. Count and distribution

- **Minimum 5 Anchors per Site.** Cited directly: "a survey of any size requires a
  minimum of five GCPs to be adequately covered" —
  [Propeller — Ground Sample Distance & Drone Data](https://www.propelleraero.com/blog/ground-sample-distance-gsd-calculate-drone-data/),
  and separately "at least 10 across the area to be reconstructed [is] recommended... for
  aerial photography to achieve results of highest quality" per Agisoft-oriented guidance
  found via
  [BCcampus / Agisoft workflow chapter](https://pressbooks.bccampus.ca/ericsaczuk/chapter/chapter-1-3-ground-control-points/)
  — treat 5 as the floor and 8–10 as comfortable for a larger Site.
- **Spacing.** "Ground Control Points should always be at least 6 feet (or 2 meters)
  apart to decrease the risk of marking the wrong GCP during data processing" —
  [Propeller — Ground Control in Drone Surveying](https://www.propelleraero.com/blog/things-to-know-about-ground-control-in-drone-surveying/).
- **Layout.** Spread around the perimeter rather than clustered — general
  photogrammetric block-control guidance recommends control concentrated at the edges
  of the area with additional interior points for larger or terrain-varied sites —
  [Penn State GEOG 892 — Ground Control Requirement](https://courses.ems.psu.edu/geog892/node/649).
  Avoid placing all Anchors in a line (collinear points under-constrain rotation).
- **Site-specific constraint from ADR 0007, not from the photogrammetry literature**:
  every Anchor must sit outside the part of the Site expected to change, and somewhere
  "a surveyor could later reach" for the phase-2 resurvey. That overrides pure
  distribution-quality advice where the two conflict — e.g. skip an interior point if
  the interior is the part that's going to be under construction.

## 7. Reading and recording each Anchor's position once

ADR 0007 is explicit that absolute accuracy doesn't matter here (the coordinate is a
deliberate placeholder fiction that phase 2 replaces); what matters is that the number
written down is a stable, repeatable read of that specific point, since it's typed once
into ODM's ground control file and never touched again until a surveyor replaces it.

- **Consumer smartphone/handheld GPS is the right tool.** Single-fix horizontal
  accuracy for smartphones is commonly measured at roughly 3–13 m —
  [Smartphone GPS accuracy study in an urban environment, PLOS ONE / PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6638960/).
  That's fine for a placeholder; ADR 0007 doesn't need better.
- **Cheap accuracy improvement: time-averaging a fix.** Standing at the marker and
  letting a GPS app log and average position over several minutes measurably tightens
  the fix versus a single instantaneous reading — "point averaging function... improves
  the precision of transect measurements" —
  [same PLOS ONE / PMC study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6638960/).
  Differential-style correction can take this further (reported ~30–60% error reduction,
  e.g. 3–4 m down toward ~1 m) —
  [DGNSS-CP smartphone correction study, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4934336/)
  — but that requires infrastructure/apps beyond a bare phone GPS and is optional given
  ADR 0007's "absolute accuracy doesn't matter" framing.
- **Practical procedure**: at Site onboarding, for each Anchor, stand over its center,
  run a waypoint-averaging mode (many free GPS logger apps support this — average over
  2–5 minutes of dwell) rather than taking the first fix shown, record the averaged
  lat/lon (and a photo of the marker for human cross-reference), and write that single
  value into ODM's ground control file. Do this once per Anchor, before the first flight,
  per ADR 0007's requirement that Anchors and their placeholder coordinates exist from
  the first Capture.

## What I could not verify

- **DJI's actual (non-equivalent) focal length and the sensor's physical width/height
  in mm.** DJI's spec page publishes only the 35 mm-equivalent focal length (24 mm) and
  a single diagonal FOV (84°); I fetched the page directly and confirmed no mm sensor
  dimensions or actual focal length are given. The primary GSD calculation (§2, Method A)
  sidesteps this by using only DJI's published diagonal FOV and native resolution.
  Method B's 13.2×8.8 mm figure is a reasonable but *assumed* cross-check value (it's the
  nominal "1-inch" size DJI has used on its own Phantom 4 Pro / Mavic 3 cameras), not a
  Mini 5 Pro-specific confirmed spec.
- **Exact pixel pitch / photosite size** — not published, not independently derivable
  without the unverified physical sensor width above.
- **Spatial Technologies' CAD pricing and full size range** — their product page
  content didn't fully load via fetch; only the 350×350 mm size and cross/circle pattern
  options were confirmed.
- **A single authoritative "the" pixel-count threshold for GCP identification** does not
  exist — the field ranges from a 5× GSD floor to 20–25× for stricter/automatic/durable
  use, per §3. The 20× design multiple used here is a reasoned middle point backed by
  three converging sources (Pix4D AutoGCP, Propeller's durable-target band, ODM's fielded
  example), not a single agreed standard.
- **A drone-survey-specific (as opposed to general aerial photogrammetry) standard for
  Anchor count.** The 5-minimum / 2 m-spacing numbers come from general GCP guidance
  (Propeller, Agisoft-oriented course material), not a rule specific to small consumer
  drones or to ADR 0007's correspondence-only (not bundle-adjusted survey-grade) use case.
  Given ADR 0007's registration is correspondence-based rather than a full geodetic
  adjustment, more Anchors mainly buy redundancy against occlusion/damage to one marker
  across visits, not adjustment accuracy — so treat 5 as a floor to raise, not a target
  to hit exactly.
