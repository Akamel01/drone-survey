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
The physical location being surveyed. The unit a client buys work about.

**Capture**:
One visit to a Site producing the images a Reconstruction is built from. A Site
accumulates many Captures over time; a 3D Timelapse is built from them.

**Grid Mission**:
An automated flight covering a Site in parallel passes at fixed altitude, camera
pointed straight down, capturing stills at a spacing chosen to guarantee Overlap.
The capture method for Orthomosaics.
_Avoid_: lawnmower, mapping mission, survey flight

**Overlap**:
The proportion of a Site's surface appearing in more than one image, stated
separately along a flight pass and between adjacent passes. The dominant control
on whether a Reconstruction succeeds.
_Avoid_: coverage, redundancy

**Nadir**:
Camera orientation pointing straight down. The orientation an Orthomosaic
requires, and the one an appearance-focused Capture usually avoids.
_Avoid_: top-down, vertical, overhead

**Ground Control Point**:
A marked position on a Site whose real-world coordinates are independently known,
used to anchor a reconstruction to absolute space.
_Avoid_: GCP on first use, marker, target, control

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

**Photogrammetry**:
A reconstruction technique deriving explicit geometry — point cloud, then mesh —
from overlapping images. Strong as a measurable surface, weaker on appearance.
_Avoid_: MVS, dense reconstruction

**Structure from Motion**:
The step recovering camera positions and a sparse point cloud from unordered
images. A prerequisite of both Gaussian Splatting and Photogrammetry.
_Avoid_: SfM on first use, camera solve, alignment
