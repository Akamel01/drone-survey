# Domain model — automated post-flight processing

Written 2026-09-19. Extends the vocabulary in [`CONTEXT.md`](../../CONTEXT.md);
it does not replace it. Capitalised terms already defined there keep their
meaning exactly, and this document adds only what the target pipeline needs.

## Reconciling the requested entity list with the existing language

The brief asks for entities named Flight, Dataset, Image, Camera, Camera Pose,
Control Point, Checkpoint, CRS, Alignment, Component, Reconstruction, Point
Cloud, Mesh, Texture, DSM, DTM, Orthomosaic, Measurement, Survey Result, QA
Result, Processing Job, Processing Stage, Configuration, Artifact, Report,
External Processing Job, Delivery Package.

Several of those already exist here under other names, and introducing both
would be the single most expensive mistake available in this design — two names
for one thing is how a glossary rots.

| Requested | Resolution |
|---|---|
| Flight | **Mission** is the flight plan; **Capture** is the visit that produces images. "Flight" is ambiguous between them and is not adopted. |
| Dataset | **Capture**. A Dataset by any other definition would be a second name for the same set of images. |
| Reconstruction | Already defined. Kept unchanged. |
| Orthomosaic | Already defined. Kept unchanged. |
| Processing Stage | **Node** already means "one named step with declared inputs and outputs". Kept. |
| Configuration | Split into **Profile** (versioned, shared) and **Job Config** (resolved, per-run). One entity here would hide the versioning question. |
| Delivery Package | **Delivery Bundle** already defined. Kept unchanged. |
| Control Point / Checkpoint | Both adopted, and both distinct from the existing **Anchor**. See below — this distinction is the most error-prone part of the model. |

New entities this model introduces: Image, Camera, Camera Pose, Control Point,
Checkpoint, CRS, Alignment, Component, Point Cloud, Mesh, Texture, DSM, DTM,
Measurement, Survey Result, QA Result, Processing Job, Profile, Job Config,
Artifact, Report, External Processing Job.

## Boundaries

Four contexts. The boundaries are drawn where the *language changes*, which is
also where the failure modes stop being shared.

**1. Capture context** — Site, Mission, Capture, Image, Camera, Anchor, Control
Point, Checkpoint. Owns what the world was and what the aircraft did. Nothing
here knows what an engine is.

**2. Processing context** — Processing Job, Node, Profile, Job Config,
Alignment, Component, Camera Pose, Reconstruction, Point Cloud, Mesh, Texture,
DSM, DTM, Orthomosaic. Owns turning images into geometry. This is the context
RealityScan would sit inside, and the only one an engine swap should touch.

**3. Assurance context** — QA Result, Measurement, Survey Result, Report. Owns
the verdict. Deliberately separate from Processing: **the thing that produces an
artifact must not be the thing that passes it.** An engine's own report is
evidence, not a verdict.

**4. Delivery context** — Artifact, Delivery Bundle, retention. Owns what the
client receives and for how long.

The engine boundary sits *inside* context 2 and nowhere else. If adopting
RealityScan forces a change in contexts 1, 3 or 4, that is a signal the
abstraction has leaked and should be treated as a finding, not absorbed.

## Entities

### Capture context

**Image** — one photograph in a Capture. Identity: content hash of the original
file, not filename — filenames collide across cards and flights, hashes do not.
Carries EXIF, XMP, GNSS position, and a validation verdict. Immutable once
ingested; `correct` produces a *derived* Image with its own identity and a
reference to its source, because Correction is baked in irreversibly
(ADR 0009) and the original must remain recoverable.

**Camera** — a physical sensor and lens combination. Distinct from Image
because calibration belongs to the Camera across many Images. Identity: make,
model, lens, and serial where available. Holds a calibration: intrinsics,
distortion model, and whether those were fixed or solved.

**Control Point** — a marked position whose real-world coordinates are
independently known, used to anchor a Reconstruction to absolute space. This is
`CONTEXT.md`'s Ground Control Point. Has: an identifier stable across Captures,
a coordinate in a stated CRS, a per-axis accuracy, a weight, and a set of image
observations (Image + pixel coordinate).

**Checkpoint** — identical in structure to a Control Point and different in
exactly one respect: **it is excluded from the solve.** Its residual is
therefore an independent measure of accuracy rather than a measure of fit. The
model must make it impossible to use a Checkpoint in the solve by accident, so
the excluded-ness is a property of the point, set at definition time, not a
flag passed to a solver.

**Anchor** — already defined: a marked position whose coordinates are *not*
known, used to register Captures to each other. Kept distinct from Control
Point. The three are easy to conflate and the consequences differ sharply: a
bad Control Point moves the model, a bad Checkpoint lies about accuracy, a bad
Anchor breaks cross-date comparison only.

**Coordinate Reference System (CRS)** — a value object, not an entity: an
EPSG code plus an explicit vertical datum/geoid. Modelled as a value because two
CRSs with the same definition are the same CRS. Every coordinate-bearing thing
in the system carries one; **a coordinate without a CRS is not representable**
in this model, which is the cheapest available defence against the silent
CRS mismatch that gate C3 treats as critical.

### Processing context

**Processing Job** — one execution of one Manifest against one Capture,
producing one set of Artifacts. Identity: a job id. Holds: the Capture
reference, the resolved Job Config, per-Node state, timings, resource usage,
and a terminal verdict. The unit of restart, of audit, and of cost.

**Node** — as already defined. A Node execution within a Job has its own state:
pending / running / succeeded / failed / skipped-because-complete.

**Profile** — a named, **versioned, immutable** set of engine and pipeline
settings. Versioned because provenance requires it: to explain why two Captures
of one Site differ, the settings must be recoverable exactly. A change is a new
version, never an edit — the same rule `CONTEXT.md` already applies to Mission
Specs.

**Job Config** — the fully resolved settings for one Job: a Profile version,
plus per-dataset overrides, plus resolved paths. Recorded in full inside the
Job, so a Job is reproducible without consulting anything external.

**Alignment** — the result of solving camera geometry for a Capture. Holds the
set of Camera Poses, the resulting Components, and alignment statistics. One
Capture may have several Alignments over time (the existing pipeline already
solves twice, around `register`), so Alignment is an entity with identity, not
an attribute of Capture.

**Camera Pose** — position and orientation of one Image, in a stated CRS, with
an uncertainty and a registered/unregistered status. Belongs to an Alignment,
references an Image and a Camera.

**Component** — a maximal set of Images that aligned into one connected
geometry. **Multiple Components are a failure signal, not a feature**: a Capture
that splits means the imagery did not connect, and the model surfaces that as a
first-class property rather than letting the pipeline quietly proceed on the
largest one. Holds: image count, share of the Capture, and whether it was
selected.

**Reconstruction** — as already defined, with an added attribute: the technique
(Photogrammetry or Gaussian Splatting) and the Alignment it derives from.

**Point Cloud** — sparse or dense, with point count, density, coverage, CRS,
and provenance (which Alignment or Reconstruction produced it). Sparse and dense
are one entity with a kind, not two: they differ in how they were made, not in
what they are.

**Mesh** — triangulated surface. Attributes: triangle and vertex counts,
manifoldness, hole statistics, bounding region, CRS, level of detail. A Mesh may
derive from another Mesh (decimation, external retopology), so it carries a
parent reference — this is what makes an external round-trip auditable.

**Texture** — image maps plus UV assignment bound to a specific Mesh. Bound to
the Mesh version, because retopology invalidates a texture and the model should
make that consequence visible rather than discovering it at delivery.

**DSM** — raster elevation of the first reflective surface, derived from a
Point Cloud or Mesh.

**DTM** — raster elevation of bare earth, requiring a ground classification.
Modelled separately from DSM, and **not** as a variant of it, precisely because
producing one requires a capability (ground classification) that producing the
other does not. Whether anything in the stack can actually produce a DTM is an
open question the research must answer; the model keeps the distinction so the
answer cannot be fudged.

**Orthomosaic** — as already defined, plus GSD, extent, CRS, and coverage.

### Assurance context

**QA Result** — a verdict on one subject (an Artifact, a Node, or a whole Job)
from one named, versioned check. Holds: the check's identity and version, the
measured values, the thresholds applied, and a verdict of
**PASS / PASS WITH WARNING / FAIL / REQUIRES MANUAL REVIEW**. Thresholds are
recorded *with the result*, not looked up later — otherwise tightening a
threshold silently rewrites history, and the calibration period described in
`docs/design.md` depends on comparing old verdicts to new ones.

A Job's verdict is derived from its QA Results by a stated rule, never set
directly.

**Measurement** — one derived quantity: a distance, an elevation, an area, a
volume, a profile, a cross-section. Carries the method, the inputs, the value,
a unit, an uncertainty, and the CRS. A Measurement without an uncertainty is
not a survey output and the model refuses to represent one.

**Survey Result** — a set of Measurements plus checkpoint residuals, forming
the accuracy statement for a Capture. This is the entity that may carry the
phrase "survey-grade", and only if the E-survey gates were met.

**Report** — a rendered document for humans. **Always derived from QA Results
and Survey Results, never a source of truth.** An engine's own HTML report is
ingested as evidence into QA Results; it is never the verdict itself. This is
the model-level expression of gate C5.

### Delivery context

**Artifact** — any file the pipeline produces that might leave it. Identity:
content hash. Carries kind, format, size, CRS where applicable, the Job and
Node that produced it, the Profile version in force, and an integrity verdict
from an independent reader. Provenance is an attribute of the Artifact rather
than a separate log, so an artifact separated from its context still knows
where it came from.

**External Processing Job** — an execution of a non-engine tool (GDAL, PDAL,
CloudCompare, a splatting trainer) against Artifacts, producing Artifacts. Has
the same shape as a Processing Job on purpose: the same identity, config
versioning, state and QA treatment. Modelling external work as second-class is
how provenance gaps appear, and the boundary between engine and external tool
is expected to move as capabilities are verified.

**Delivery Bundle** — as already defined. Adds: the Artifacts included, the
Reports, licence notices, the Job it came from, and a retention class.

## Key relationships

```
Site 1─* Capture 1─* Image *─1 Camera
Site 1─* Anchor
Site 1─* Control Point
Site 1─* Checkpoint

Capture 1─* Processing Job
Processing Job 1─1 Job Config *─1 Profile(version)
Processing Job 1─* Node execution 1─* Artifact

Processing Job 1─* Alignment 1─* Component
Alignment 1─* Camera Pose *─1 Image
Alignment 1─* Reconstruction
Reconstruction 1─* Point Cloud
Reconstruction 1─* Mesh 1─* Texture
Point Cloud ─> DSM ─> DTM
Reconstruction ─> Orthomosaic

Artifact 1─* QA Result
Node execution 1─* QA Result
Processing Job 1─1 QA Result (derived verdict)

Capture 1─1 Survey Result 1─* Measurement
QA Result *─1 Report
Artifact *─* Delivery Bundle
External Processing Job *─* Artifact
```

## Lifecycles

**Capture**: planned → flown → ingested → validated → processing → delivered →
retained → expired. A Capture never returns to an earlier state; a re-process
is a new Processing Job against the same Capture.

**Processing Job**: registered → running → (succeeded | failed | abandoned) →
assured → released. A Job may re-enter *running* on resume, which is the only
backward transition permitted anywhere in the model, and it is permitted because
restartability is a requirement.

**Artifact**: produced → validated → (published | quarantined). An Artifact
that has not been validated cannot be published — expressed as a state
transition rather than a rule a caller may forget.

**Profile**: drafted → active → superseded. Never edited, never deleted, because
old Jobs reference it.

**QA Result**: immutable once written. Re-checking produces a new QA Result with
a new check version. This is what makes the calibration period measurable.

## Identity and provenance

| Entity | Identifier | Why |
|---|---|---|
| Site | short opaque id, fixed at onboarding | already specified; must outlive renaming |
| Capture | Site id + capture timestamp | naturally unique, human-readable, sorts correctly |
| Image | content hash | filenames collide across cards; hashes do not |
| Camera | make/model/lens/serial | calibration is shared across Images |
| Control Point / Checkpoint | Site-scoped stable name | must be recognisable across Captures |
| Processing Job | opaque job id | must be unique across engines and hosts |
| Profile | name + monotonic version | provenance requires exact recoverability |
| Artifact | content hash | dedupe, integrity, and identity in one |
| QA Result | job id + subject + check name + check version | makes re-checks comparable |

**Provenance chain.** Every Artifact resolves to: the Job, the Node, the Profile
version, the Job Config, the Alignment, the Capture, the Images, the Cameras,
and the Control Points — with engine name and version recorded at every step.
The engine's version belongs in that chain explicitly, because the point of this
investigation is that the engine may change, and a deliverable must always be
able to say which one made it.
