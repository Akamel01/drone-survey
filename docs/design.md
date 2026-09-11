# Aerial Survey Production System — Design

Status: agreed 2026-09-10. Supersedes the stack described in
[the handoff](handoff-2026-09-10.md).

This document is the spec handed to the build phase. It states the shape of the
system and the reasoning that is not obvious from the shape. Where a decision
was contested, the argument lives in an ADR under [`adr/`](adr/) and is linked
rather than repeated. Vocabulary is defined once in [`../CONTEXT.md`](../CONTEXT.md)
and used precisely here — capitalised terms are glossary terms.

---

## 1. What the system is for

A one-person aerial-survey business turns repeated visits to a Site into
finished deliverables that clients pay for. Phase 1 sells two:

- an **Orthomosaic** — a uniform-scale top-down map of a Site
- a **Gaussian Splatting** Reconstruction — an explorable 3D scene

Phase 2 adds the **3D Timelapse**, the same Site across dates. It is deferred,
not dropped, and section 8 explains what phase 1 must do to keep it possible.

Everything targets **visual-grade**: relative geometry sound, appearance
finished, no stated absolute accuracy. Survey-grade work needs Ground Control
Points and better positioning hardware than a DJI Mini 5 Pro provides, and
claiming it now would be selling something we cannot deliver.

**The primary goal is automation**
([ADR 0015](adr/0015-automation-is-the-primary-goal.md)). The operator's manual
work is limited to client-facing work, driving to the Site, and flying.
Everything else — mission planning, preparing the controller, go/no-go checks,
processing, quality control, delivery and retention — is automated. Deliverable
quality is not traded for it: every automated step carries a quality gate, and a
person is involved only when a gate fails, never as a routine step.

## 2. Constraints the design answers to

**Budget.** Software spend is approximately zero. This is a real constraint, not
a preference, and it was tested rather than assumed: the affordable tier of the
obvious commercial tool cannot export georeferenced Orthomosaics at all, so the
commercial entry point is thousands of dollars ([ADR 0001](adr/0001-opendronemap-for-orthomosaics.md)).

**Licensing.** Deliverables are sold, so any engine whose licence forbids
commercial use is unusable regardless of quality. This excludes most of the
well-known Gaussian Splatting implementations ([ADR 0003](adr/0003-permissive-splat-engines-only.md)).

**Hardware.** One GPU host and one thin laptop, detailed in section 3.

**Capture.** A consumer drone with GPS and no RTK. This is why Registration
across dates is the hardest problem in the system ([ADR 0007](adr/0007-anchors-for-cross-capture-registration.md)).

## 3. Compute topology

| Machine | Role |
|---|---|
| `akamel-linux` — RTX 4070 SUPER, 12GB VRAM, i7-14700F, 62GB RAM, Ubuntu 24.04 | **First choice for everything**, including jobs it runs slowly. Development, iteration, interactive inspection |
| Remote RTX 3090, 24GB VRAM — separate network, reachable over SSH, time-limited | Second choice: jobs that do not fit locally, during the hours it is available |
| Rented GPU, hourly | Third choice: jobs that do not fit locally when the 3090 will not be free soon enough |
| MacBook Air M1, 8GB | Control client only |
| Object storage | Client delivery |

The two machines reach each other over Tailscale, which the Runner uses for
dispatch. Docker with the NVIDIA container runtime is already configured on the
GPU host, so engines run as containers and none of the source-build work from
the proof-of-concept needs repeating.

**The laptop does not view results.** The original plan had it as a light
viewing client; 8GB cannot be trusted to open large scenes, and rendering a
large splat alone wants several gigabytes of VRAM. Interactive inspection —
including splat cleaning, which runs in a browser — happens against the GPU host
over Tailscale. The Air issues commands and reads reports.

**Work runs locally by default, even when that is slower**
([ADR 0014](adr/0014-compute-placement-ladder.md)). Running locally moves no
data, waits for no availability window, depends on nobody and costs nothing per
run. A job that takes three hours here rather than one hour elsewhere is usually
the better job, because these are batch runs with nobody waiting.

Work leaves the local host only when it will not fit. The 3090's 24GB then lifts
the Fitting ceiling above the scale we intend to fly; its access is time-limited
with someone else holding priority, so jobs queue for a window rather than
starting on arrival. Rented compute is the third rung, for a job that fits
neither locally nor into the next window.

**The Runner decides placement before a job starts, not by failing.** Fitting and
dense reconstruction can exhaust memory hours in, so sizing is estimated up front
from image count, resolution and the settings requested, and compared against a
measured threshold per target. Those thresholds do not exist yet and must be
established by running jobs of increasing size until they fail; until then they
should be conservative, since a queued window is cheaper than hours of wasted
compute.

**The 3090's availability is checked, not assumed** — reachable, inside the
permitted window, and the card actually free rather than merely the host
answering.

**The local host is shared, and that still constrains what fits.** It runs an
unrelated production stack of around forty containers with several hundred
gigabytes of volumes:

- Reconstruction jobs contend for RAM with a running service. A job that
  overcommits takes that service down. This is now a reason to rent rather than
  a risk to absorb.
- VRAM is borrowed. An embedding model was found pinned indefinitely, holding
  roughly half the card; the arrangement is that reconstruction and that model do
  not run at once.
- Free disk is the tightest resource. A dedicated SSD is planned; until it
  exists, working space is scarce and cold Captures are archived off the working
  volume.

**Every Node must run in a freshly provisioned environment**, not only on a
machine configured by hand. Containerised, no reliance on local state, inputs and
outputs addressed explicitly. This follows from renting, and it is worth having
regardless of where a job lands.

## 4. Pipeline model

A Pipeline is a **Manifest**: a declarative file naming its Nodes, their inputs
and outputs, and the edges between them. A thin **Runner** executes a Manifest,
placing each Node's work on the machine meant to do it
([ADR 0006](adr/0006-pipelines-as-declarative-manifests.md)).

There is no workflow engine. The general ones solve problems this system does
not have, at the cost of operational surface on the machine least able to spare
it. The deciding argument is that a Manifest has two readers: the Runner
executes it, and the planned developer view draws it. Defining Pipelines as data
means the graph can be drawn without an engine to interrogate.

**Node reuse is structural.** A Node is a named unit that any Manifest may
reference, so shared steps exist once by construction rather than by discipline.
This is how the no-duplicated-logic requirement is met.

### Node inventory

| Node | Purpose | Used by |
|---|---|---|
| `ingest` | Copy a Capture into the working store, verify completeness | both |
| `exif-audit` | Confirm GPS and camera metadata are present; report coverage | both |
| `filter` | Reject blurred, misexposed and near-duplicate frames | both |
| `frame-extract` | Video to frames | footage-derived only |
| `geotag-backfill` | Interpolate SRT telemetry onto extracted frames | footage-derived only |
| `correct` | Exposure consistency and white balance; must preserve EXIF and XMP | both |
| `register` | Tag Anchors and emit the ground control file tying this Capture to the Site frame | both |
| `solve` | Camera solve via ODM's SfM stage | both |
| `reconstruct` | ODM dense reconstruction, mesh, orthophoto | Orthomosaic |
| `export-cog` | Orthophoto to Cloud-Optimized GeoTIFF with overviews | Orthomosaic |
| `export-colmap` | Camera solve to COLMAP format | Gaussian Splatting |
| `train-splat` | splatfacto training | Gaussian Splatting |
| `clean-splat` | Crop, remove floaters, trim ground noise | Gaussian Splatting |
| `compress-splat` | Trained splat to compressed web format | Gaussian Splatting |
| `render` | Camera paths to frames | cinematic deliverables |
| `grade` | Aesthetic pass on rendered output | cinematic deliverables |
| `export-mesh` | Mesh and point cloud into deliverable and viewer formats | when delivered |
| `bundle` | Assemble a Delivery Bundle, including third-party licence notices | both |
| `publish` | Deploy a Delivery Bundle to static hosting | both |

`ingest`, `exif-audit`, `filter`, `correct`, `register`, `solve`, `bundle` and
`publish` are shared by both phase-1 Pipelines. `frame-extract` and `geotag-backfill` exist for material
that already exists as footage; they are not part of the supported capture path
([ADR 0002](adr/0002-stills-from-grid-missions-not-video.md)).

`clean-splat` is human-in-the-loop. Aerial splats arrive with floaters and
ground-plane noise, and removing them is judgement, not a parameter. The Runner
should treat it as a Node that blocks awaiting an operator rather than pretend
it is automatic.

### The two phase-1 Pipelines

```
Shared head:
  ingest → exif-audit → filter → correct → register → solve

Orthomosaic:
  <shared head> → reconstruct → export-cog → bundle → publish

Gaussian Splatting:
  <shared head> → export-colmap → train-splat → clean-splat
                → compress-splat → bundle → publish

Footage-derived input, prepended when a Capture is video rather than stills:
  frame-extract → geotag-backfill → <shared head>
```

They share everything up to and including `solve`, diverge, and rejoin at
`bundle`. The footage path has its own head because extracted frames carry no
EXIF until `geotag-backfill` has run, so `exif-audit` cannot precede it.

`register` runs before `solve` because the ground control file it emits is an
input to the solve, not a correction applied afterwards
([ADR 0007](adr/0007-anchors-for-cross-capture-registration.md)).

`reconstruct` is written here as one Node but is several hour-scale stages. It
should be split along ODM's own stage boundaries, because a single opaque
multi-hour Node defeats the resume behaviour that
[ADR 0006](adr/0006-pipelines-as-declarative-manifests.md) identifies as the
thing we are taking on ourselves.

### Why `solve` is one Node and not two

Both products need camera poses, so a shared upstream SfM node is the obvious
design. It is not buildable: ODM cannot accept an external camera solve, so a
shared node would have to be ODM's own internal stage, extracted by forking its
pipeline for no gain ([ADR 0005](adr/0005-reuse-odm-camera-solve-for-splatting.md)).

Instead `solve` **is** ODM, run only as far as its camera solve, and its output
serves whichever Pipeline continues. Where one Capture feeds both products, the
solve happens once and both share a coordinate frame.

That case is less common than it sounds. A Nadir Grid Mission is the right
Capture for an Orthomosaic and poor input for Gaussian Splatting, which wants
oblique views around a subject. A Site flown for both usually yields two
Captures, each with its own solve, related to each other by the same Registration
mechanism used across dates.

> **Resolved, with a trade-off.** Nerfstudio reads ODM's output natively, so no
> COLMAP conversion is inherently required — but the native importer needs files
> ODM writes near the end of its run, making it incompatible with stopping
> early. Running ODM to completion is the safer default: the conversion path
> forces the principal point to the image centre for perspective cameras and
> degrades silently. See [ADR 0004](adr/0004-splatfacto-as-the-splat-engine.md).
> Resolve the stop-point with a documented flag rather than a patch — ODM is
> AGPL-3.0, and modifying it changes our obligations
> ([ADR 0001](adr/0001-opendronemap-for-orthomosaics.md)).

## 5. Capture standard

Capture is part of the system, not a precondition of it. A Capture flown wrongly
cannot be rescued in software, so its requirements are specified and checkable.

**Orthomosaic Captures** are stills from an automated Nadir Grid Mission: gimbal
at −90° locked, 80% forward and 70% side Overlap, constant altitude, locked
exposure, and the grid extended at least one pass beyond the Site boundary. The
aircraft flies on the **standard battery** only: the Plus battery takes it over
250g and out of the microdrone category. The reasoning and the failure modes are
in the [flight planning reference](flight-planning.html).

**Every Grid Mission is flown with oblique passes alongside the nadir grid.** A
nadir-only block lets systematic error accumulate into a dome: the reconstructed
surface bows, because nothing in the geometry distinguishes a small lens-model
error from real curvature. Adding oblique imagery breaks that ambiguity, and the
reported reduction in vertical error is up to two orders of magnitude. It costs
one extra pass and no new hardware, which makes it the cheapest accuracy
available to us.

This is also why flying unworked Sites matters beyond compliance: oblique passes
sit lower and closer to structures than the nadir grid, and are exactly what the
five-metre bystander floor would otherwise restrict.

**Every Site gets Anchors before its first flight** — marked positions outside
the part of the Site that changes, present in every Capture
([ADR 0007](adr/0007-anchors-for-cross-capture-registration.md)). Anchors are
not Ground Control Points: their real-world coordinates are unknown, and they
exist to tie Captures to each other rather than to absolute space.

**Every Site gets a Cadence at onboarding** — an interval *and* a time of day. A
3D Timelapse can only be assembled from Captures that were already being
collected, so the interval is fixed when the Site is taken on rather than when
the timelapse Pipeline is eventually built.

The time of day is fixed for a different reason, and it resolves a conflict
between two requirements that would otherwise be left to chance. Captures are
flown when the Site is not being worked, which pushes them toward early morning,
evening and weekends. Early morning and evening are exactly when the sun is
lowest, and long shadows are what the capture standard warns against. **Weekends
around midday satisfy both**: no workers, and the sun high enough not to lay
shadows across the Site.

Consistency then matters more than any single Capture's quality. Two Captures of
one Site flown at different times of day differ in shadow direction and length
everywhere, which reads as the whole Site changing rather than the construction
changing, and gives Registration spurious surface differences to fit against.
Flying a Site at the same time of day every time is therefore part of its
Cadence, not an operator preference.

Anchors and Cadence produce no phase-1 value. They are the price of phase 2
remaining possible, and they cost almost nothing at the time they must be paid.

## 6. Appearance

Gaussian Splatting bakes appearance into the model, so the interactive
deliverable cannot be treated after the fact. Colour work therefore splits by
purpose ([ADR 0009](adr/0009-correction-on-input-grading-on-output.md)):

**Correction** runs on input images before `solve`. Exposure consistency, white
balance, lens profile — deterministic and technical. It earns its place on
reconstruction quality rather than looks: inconsistent exposure across a flight
degrades feature matching and produces visible seams.

**Grading** runs on rendered output, per deliverable. Aesthetic, reversible, and
it never touches the Reconstruction.

The interactive embed shows a corrected model: neutral, clean, technically
sound. Cinematic deliverables carry a graded look on top. The test for which
side an adjustment belongs on is whether a reasonable person could disagree
about it — if so, it is Grading.

## 7. Viewing and delivery

No single open-source tool covers a georeferenced raster, a splat, and a mesh
for both inspection and web embedding. Each deliverable uses the tool built for
it ([ADR 0008](adr/0008-fit-for-purpose-viewers.md)):

| Data | Local inspection | Client-facing |
|---|---|---|
| Gaussian Splatting | SuperSplat Editor (MIT) | SuperSplat Viewer (MIT) |
| Orthomosaic | QGIS | MapLibre GL JS (BSD-3) reading the COG directly |
| Mesh, point cloud | CloudCompare (GPL-2.0-or-later) | Potree (BSD-2) |

A **Delivery Bundle** is a self-contained directory holding the deliverables and
what is needed to view them, deployed to **object storage** at an unlisted URL
([ADR 0011](adr/0011-static-delivery-bundles.md)). Object storage specifically:
the common static-site hosts cap individual files well below the size of a real
Orthomosaic. Cross-origin headers must be configured, and the Bundle must carry
the licence notices of the third-party viewers it redistributes. Nothing runs behind it: a
Cloud-Optimized GeoTIFF is read by the browser over HTTP range requests with no
tile server, and the splat viewer is a static site.

Two consequences worth stating plainly. An unlisted URL is obscurity, not access
control — acceptable for visual-grade work, and the first client with real
confidentiality requirements is the trigger to revisit. And because a Bundle is
static and self-contained, archiving a finished project means keeping a
directory, not keeping a system running.

Delivery is deliberately not hosted on the GPU box. That machine runs an
unrelated production service, and coupling client availability to its
maintenance windows trades a real risk for a saving that does not exist.

## 8. Phase 2

The 3D Timelapse is deferred because it is gated by the calendar rather than by
engineering: it cannot be demonstrated, sold, or debugged until one Site has
been captured repeatedly over months
([ADR 0010](adr/0010-phase-one-excludes-the-3d-timelapse.md)).

Phase 1 keeps it reachable by collecting for it from the first flight — Anchors
on every Site, a fixed Cadence, and Captures retained rather than discarded once
delivered.

A two-dimensional version is available in phase 1 at almost no cost: a
before-and-after swipe between two Orthomosaics of the same Site uses mature
existing tooling. It is a genuine deliverable, and it exercises Registration on
easier ground before the 3D version depends on it.

Also deferred: Ground Control Points and survey-grade accuracy, interactive
control from the developer graph view, and client authentication.

## 8a. Operating legally

The first version of this document specified the system in detail and never
asked whether the work may be sold. That is a gap in the plan rather than in the
architecture, and it gates the first paid flight rather than any build step.

**Before a paid flight.** Commercial operation requires pilot certification,
operator registration, and Remote ID, and the specific obligations differ by
country: the United States requires Part 107 certification, registration, and
Remote ID, and commercial use removes the sub-250g exemption entirely. The
United Kingdom requires a Flyer ID and an Operator ID, with camera drones
registering at any weight. The European Union requires operator registration and
carries **legally mandatory** third-party insurance, which the United States does
not. Commercial clients generally demand proof of liability cover regardless of
whether the law requires it. Order of magnitude: one to two thousand a year and
paperwork, not engineering.

The operating country is **Canada**: Canadian Aviation Regulations Part IX,
administered by Transport Canada, together with Canadian privacy law. The full
checklist, with fees and sources, is in
[the compliance research](research/canada-compliance-2026.md). What matters at
the level of this document:

**The aircraft is a microdrone.** The Mini 5 Pro is under 250g in flight
configuration, which in Canada removes registration, the pilot certificate, and
the safety-assurance requirement — for commercial work as well as recreational,
since Canada does not distinguish the two for microdrones. The earlier plan for
Advanced Operations certification, and the five-metre bystander limit that came
from the aircraft's safety-assurance declaration, no longer apply.

**That status holds only in flight configuration, and the pilot must be able to
show it.** The standard battery keeps the aircraft under 250g; the Plus battery,
propeller guards or any accessory can take it over, at which point registration,
certification and the declaration limits all return. The capture standard
therefore specifies the standard battery.

Microdrone operation is still regulated: no reckless or negligent flight,
staying clear of aerodromes, emergency sites and restricted airspace, and
trespass and privacy law apply in full.

**Captures are still flown when the Site is not being worked**, for reasons that
stand on their own. Moving people, plant and vehicles are a known source of
reconstruction artifacts, so an empty Site reconstructs more cleanly.
Moving people, plant and vehicles are a known source of reconstruction
artifacts, so an empty Site reconstructs more cleanly. Imagery of an empty
Site contains far less personal information, which materially reduces the
retention problem in [ADR 0012](adr/0012-twelve-month-capture-retention.md)
rather than merely bounding it. And an empty Site is simply safer to fly.

Insurance is a commercial expectation rather than a federal mandate, and clients
will ask for it regardless.

**Imagery of people and private property.** Aerial capture over inhabited areas
records identifiable people, vehicles and neighbouring private property by
default. That makes us a data controller under GDPR and comparable regimes,
with obligations we have not designed for: a lawful basis for the processing,
storage limitation, and the ability to erase on request.

This **directly contradicts** section 8's plan to retain every Capture
indefinitely so that a future timelapse can use it. Wanting the data for a
product we have not built yet is not a lawful basis, and it is not one of the
exceptions to the right of erasure. The contradiction is real and is not
solvable by engineering.

**Resolved: Captures are retained for twelve months, then deleted**
([ADR 0012](adr/0012-twelve-month-capture-retention.md)). The limit applies to
raw Captures; whether derived Reconstructions may outlive it depends on whether
they still identify anyone at our capture resolution, which is part of the
compliance work rather than an assumption to make here.

The consequence for section 8 is direct: a 3D Timelapse cannot be assembled from
raw Captures older than a year, so the Reconstruction becomes the durable
artifact and reprocessing from source has a deadline.

Deletion has to be scheduled and logged. A retention limit that is written down
and never executed documents an obligation being ignored, which is worse than
having none.

## 9. Risks

**The differentiating deliverable has no off-the-shelf answer.** Mature swipe
tooling exists for 2D maps; nothing production-ready exists for presenting a 3D
scene across dates. Phase 2 is a real engineering project, not a feature, and
deferring it makes it later rather than cheaper. If clients turn out to buy the
timelapse above everything else, that changes the plan rather than the schedule.

**Registration degrades as the Site succeeds.** Automatic alignment locks onto
geometry that has not changed, which is exactly what a construction site removes
over time. Anchors are the mitigation and they are unproven at our scale. This
is the single most likely thing to fail quietly.

**The GPU host is shared with production.** Every heavy job runs beside a live
service on one machine, with contended RAM, borrowed VRAM, and scarce disk. The
dedicated SSD helps disk and nothing else.

**Capture quality carries risk that software absorbed elsewhere.** ODM degrades
less gracefully than commercial engines on marginal input and reports less about
why. We chose to control input quality rather than buy tolerance for bad input,
which makes flight discipline load-bearing.

**No client-facing quality report.** Commercial tools ship one; we do not. If a
client ever needs a result defended, that is ours to produce.

**Full-resolution Fitting does not fit the local card, and this is now measured.**
Two runs on 180 video frames at 8 megapixels both ran out of video memory — the
second after evaluation was disabled and fragmentation fixed, failing inside
training at 79% of the way through. Only about 10.9 GB of the card is usable,
since the production stack holds the rest permanently. Real stills carry six
times the pixels, so full-resolution Fitting of a real Capture should be expected
to leave the local host under ADR 0014, unless densification is capped or the
images downscaled at some cost to quality that has not been measured. Both
failures arrived 12 to 15 minutes in, which is the case for deciding placement
before a job starts rather than by attempting it
([measurements](research/splat-first-runs-2026-09-10.md)).

ODM, by contrast, used 4.7 GiB of RAM for the same frames — comfortable, though
again a floor rather than a threshold for real stills
([measurements](research/odm-first-run-2026-09-10.md)).

**No stated ceiling on viewable scene size.** Nothing published says how large a
splat the client-facing viewer will open on an ordinary device. A deliverable
that will not load is indistinguishable from no deliverable.

**Single aircraft, and a supply-side risk.** One airframe, no backup, and a
manufacturer added to the FCC Covered List in December 2025 with this model
never officially sold in the United States. A crash mid-contract has no
mitigation, and replacement may not be straightforward.

**The shared host's threat model covers contention, not exposure.** Client
imagery will sit on a machine running forty unrelated containers. Nothing in
this design addresses what that means for confidentiality.

**Microdrone status is fragile.** It depends on flight configuration: fitting
the Plus battery or any accessory moves the aircraft over 250g, and with it every
registration, certification and declaration requirement returns at once. This is
easy to do without noticing and should be enforced by the capture standard
rather than remembered.

## 10. Open questions

Low-stakes, and none block starting:

- Which static host for Delivery Bundles
- The Grading toolchain
- The Manifest schema itself, and the language the Runner is written in
- Sizing and mount point for the dedicated SSD

## 11. First moves

1. Put insurance, the privacy policy and the client contract in place. As a
   microdrone the aircraft needs no registration or certificate, so this is the
   only compliance work, and it gates paid flying and nothing else.
2. Buy and mount the SSD; establish hot working space and cold archive.
3. Establish and verify connectivity to the 3090 host. It is on a different
   Tailscale account, so decide between plain SSH, Tailscale's sharing, or
   adding it to the tailnet, then prove the whole path: key-based login, a
   container run end to end, and a large file moved both ways at a measured
   rate. Transfer time is part of a job's duration and should be a number, not
   an assumption.
4. Stand up ODM as a container service on the local host and put one existing
   Capture through it end to end, ignoring the Manifest entirely. Learn what the
   Nodes actually need before declaring them, and **measure**: peak memory, peak
   disk, wall clock. Then repeat with progressively larger Captures until
   something fails. Those failure points are the placement thresholds in
   [ADR 0014](adr/0014-compute-placement-ladder.md), and nothing else in this
   design can supply them.
5. Fly one small Site properly — Anchors placed, Nadir Grid Mission, stills — and
   run it through the same path.
6. Only then write the Manifest and the Runner, against Nodes whose real inputs
   and outputs are known.

The last step comes last deliberately. The Node inventory in section 4 is a design, not
an observation, and declaring the interface before running the tools is the
reliable way to get it wrong.
