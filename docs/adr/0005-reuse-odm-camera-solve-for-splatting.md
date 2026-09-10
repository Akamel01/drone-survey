# Reconstruct once in ODM; the splat trainer consumes that camera solve

Both pipelines need camera poses, so the obvious move was a shared upstream
Structure from Motion node feeding Orthomosaic and Gaussian Splatting alike.
We are not building one. ODM runs OpenSfM as an internal stage, and there is no
supported way to feed it an external camera solve — the COLMAP-into-ODM
direction relies on unmaintained tooling and carries a real principal-point
incompatibility. A shared upstream node would therefore have to be OpenSfM
itself, which means forking ODM's own pipeline to extract a stage it already
runs, for no gain.

Instead the solve is reused in the direction that works: ODM runs, and where the
same Capture also feeds Gaussian Splatting, its OpenSfM output is converted to
COLMAP format and handed to the trainer. One solve, one coordinate frame, no
duplicated compute.

## Consequences

The splat pipeline gains a data dependency on an ODM artifact. This is a
sequencing constraint between pipelines, not shared logic, and it is the reason
they can be compared in the same coordinate frame at all.

The reuse only applies when a single Capture genuinely serves both products.
Per ADR 0002 they usually do not: a Nadir Grid Mission is the right capture for
an Orthomosaic and poor input for Gaussian Splatting, which wants oblique views
around a subject. When a Site is flown twice for two purposes, each Capture
keeps its own solve, and the two results have to be aligned by the same
mechanism used to align Captures across dates.
