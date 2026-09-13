# Aerial Survey

A production system that turns drone footage of a site into finished visual
deliverables for paying clients: 3D models, orthomosaic maps, and 3D timelapses.

## Language

### Product grades

**Visual-grade**:
A deliverable whose relative geometry is sound and whose appearance is finished,
but which carries no stated absolute accuracy and is not a record of measurement.
_Avoid_: non-survey, marketing-grade, approximate

**Survey-grade**:
A deliverable anchored to real-world coordinates by Ground Control Points, whose
absolute accuracy is stated in centimetres and which stands as a record of
measurement.
_Avoid_: accurate, precise, professional-grade

### Capture

**Site**:
The physical location being surveyed. The unit a client buys work about. A Site
is identified once at onboarding by a short identifier that never changes; the
name written beside it is a label that may. Cadence is fixed against a Site and
Captures accumulate under it, so identity has to outlive any renaming.
_Avoid_: the name as the identifier, location, job, project

**Capture**:
One visit to a Site producing the images a Reconstruction is built from. A Site
accumulates many Captures over time; a 3D Timelapse is built from them.

**Cadence**:
The interval at which a Site is recaptured, and the time of day it is recaptured
at. Both are fixed when the Site is onboarded: a 3D Timelapse can only be
assembled from Captures that were already being collected, and only reads as one
subject changing if the light did not change with it.
_Avoid_: schedule, frequency, interval

**Grid Mission**:
An automated flight covering a Site in parallel passes at fixed altitude, camera
at Nadir, capturing stills at a spacing chosen to guarantee Overlap.
The capture method for Orthomosaics.
_Avoid_: lawnmower, mapping mission, survey flight

**Overlap**:
The proportion of a Site's surface appearing in more than one image, stated
separately along a flight pass and between adjacent passes. The dominant control
on whether a Reconstruction succeeds.
_Avoid_: coverage, redundancy

**Nadir**:
Camera orientation pointing down, at or near vertical. Our Grid Missions fly
the gimbal at −80°, ten degrees off vertical, which still counts as Nadir. The
orientation an Orthomosaic requires, and the one an appearance-focused Capture
usually avoids.
_Avoid_: top-down, vertical, overhead

**Ground Control Point**:
A marked position on a Site whose real-world coordinates are independently known,
used to anchor a Reconstruction to absolute space.
_Avoid_: GCP on first use, marker, target, control

**Anchor**:
A marked position placed outside the part of a Site that changes, present in
every Capture, used to register Captures to one another. Its real-world
coordinates are not known — that is what separates it from a Ground Control
Point.
_Avoid_: marker, target, pseudo-GCP, tie point

**Registration**:
Bringing two or more Captures of the same Site into a single coordinate frame so
they can be compared. Distinct from georeferencing, which places a single
Reconstruction into absolute space.
_Avoid_: alignment, matching, co-registration

### Flight

**Mission**:
Everything the aircraft executes on one flight: where each waypoint is, where
the camera looks, what happens at each point, how fast and how it moves between
them, and what it does if something goes wrong. A Grid Mission is one kind.
_Avoid_: KML, flight plan file, route

**Mission Spec**:
The planner's record of a Mission, in our own format, from which the file the
Controller reads is generated. A Spec is never edited: a change is a new Spec
that supersedes the earlier one.
_Avoid_: JSON, plan, config, mission file

**Controller**:
The handheld unit the operator flies with, which runs the flight app and holds
the Missions. The system supports one exact Controller — a specific model on a
specific app and firmware version, proven by a test flight — not a family of
them.
_Avoid_: RC, remote, smart controller

**Placeholder Mission**:
A Mission created by hand on the Controller once, so that a slot exists for a
generated Mission to replace. Its own contents never fly.
_Avoid_: dummy mission, dummy file, template

**Load**:
To replace a Placeholder Mission on the Controller with a generated Mission.
_Avoid_: inject, upload, transfer, sync, push

**Dispatch**:
To put a Mission Spec into the store from the planner. A Dispatched Spec is
waiting to be Collected; nothing has reached the Controller yet.
_Avoid_: upload, send, sync

**Collect**:
To fetch Dispatched Mission Specs onto the host that Loads. Collecting is what
the host does on its own; Loading is what happens when the Controller is
plugged in.
_Avoid_: download, pull, sync

### Deliverables

**Orthomosaic**:
A single top-down raster of a Site, corrected so that scale is uniform across the
whole image and distances can be read off it directly.
_Avoid_: ortho, stitched map, aerial photo

**3D Timelapse**:
A sequence of reconstructions of one Site from successive Captures, presented so
that change over time is visible.
_Avoid_: timelapse (ambiguous with plain video), 4D

### Reconstruction

**Reconstruction**:
The 3D result derived from one Capture, by either Gaussian Splatting or
Photogrammetry. The thing that gets graded, edited, and delivered.
_Avoid_: model (overloaded with ML model), scan, output

**Gaussian Splatting**:
A reconstruction technique representing a scene as coloured 3D gaussians,
optimised to reproduce the source views. Strong on appearance, weak as a
measurable surface.
_Avoid_: splat (ambiguous with the file), 3DGS on first use

**Fitting**:
The optimisation that produces a Gaussian Splatting Reconstruction: gaussians are
adjusted over many iterations until rendering them reproduces the Capture's
images. The tools call this training, and their commands keep that name, but
nothing is learned and nothing transfers — the result describes one Capture of
one Site and every Capture is fitted from scratch.
_Avoid_: training (implies a reusable model), inference, prediction

**Photogrammetry**:
A reconstruction technique deriving explicit geometry — point cloud, then mesh —
from overlapping images. Strong as a measurable surface, weaker on appearance.
_Avoid_: MVS, dense reconstruction

**Structure from Motion**:
The step recovering camera positions and a sparse point cloud from unordered
images. A prerequisite of both Gaussian Splatting and Photogrammetry.
_Avoid_: SfM on first use, camera solve, alignment

### Pipeline structure

**Pipeline**:
An automated route from a Capture to one kind of deliverable. Each product has
its own — Orthomosaic, Gaussian Splatting, 3D Timelapse — rather than one
pipeline branching internally.
_Avoid_: workflow, job, process

**Node**:
One named step in a Pipeline, with declared inputs and outputs. A Node belongs
to no single Pipeline: any manifest that needs the step references the same one.
_Avoid_: stage, task, step, operation

**Manifest**:
The declarative description of a Pipeline — its Nodes, and the edges between
them. Read both by the runner that executes it and by anything that draws it.
_Avoid_: config, definition, graph file

**Runner**:
The component that executes a Manifest, placing each Node's work on whichever
machine is meant to do it.
_Avoid_: orchestrator, scheduler, engine

### Appearance

**Correction**:
Deterministic per-image adjustment applied before reconstruction — exposure
consistency, white balance, lens profile. Justified by reconstruction quality,
not by taste, and baked irreversibly into whatever is built from the images.
_Avoid_: colour correction, normalisation, pre-processing

**Grading**:
Aesthetic treatment applied to rendered output, per deliverable. Reversible, and
it never alters the Reconstruction it was rendered from.
_Avoid_: colour grading, toning, post

### Delivery

**Delivery Bundle**:
The self-contained set of files handed to a client for one project — the
deliverables plus whatever is needed to view them. Readable on its own, with
nothing running behind it.
_Avoid_: package, export, deliverables folder

