# Use splatfacto on gsplat as the Gaussian Splatting engine

ADR 0003 narrowed the field to permissively licensed engines, leaving splatfacto
(Nerfstudio on gsplat, Apache 2.0) and OpenSplat (AGPLv3). We chose splatfacto.

OpenSplat had the more convenient integration: it reads ODM's OpenSfM output
natively, where splatfacto needs a conversion step to COLMAP format first. That
conversion is a single node, written once and then not thought about again,
which is a small price for what splatfacto gives back — the most active
ecosystem in this area, the memory-efficiency work behind gsplat, more mature
export and viewer tooling downstream, and a licence with no clause anyone has to
reason about later.

The memory point is not incidental. The GPU host has 12GB of VRAM shared with a
production service, and aerial captures of a few hundred images are precisely
where that ceiling is tested.

## Consequences

The pipeline needs an SfM format conversion node that would not exist had we
chosen OpenSplat. It is small, but it is real, and it is a place where camera
conventions can silently disagree between tools — worth a check that poses
survive the conversion rather than assuming they do.

## Revision, 2026-09-10

The comparison above was wrong on one point, and the correction introduces a
trade-off that was not visible when the decision was made. The decision itself
stands: the deciding factor was always the licence.

Nerfstudio ships a native importer for ODM output, so splatfacto does **not**
inherently require a COLMAP conversion. The advantage claimed for OpenSplat here
was overstated.

However, that importer reads files ODM writes near the **end** of its pipeline.
Running ODM only as far as the camera solve and using the native importer are
therefore mutually exclusive, and the pipeline must choose:

- **Run ODM to completion** and import natively. Simple and well-supported, but
  the full pipeline is run even for a Capture that only feeds splatting.
- **Stop at the camera solve** and convert. Faster, but the conversion path
  forces the principal point to the image centre for perspective cameras,
  discarding calibration. Only one camera model round-trips it, and the drone's
  lens is not guaranteed to be fitted with that model.

The second option degrades silently, which makes it the more dangerous default.
Prefer running ODM to completion until measurement shows the saving is worth the
risk, and if the conversion path is ever taken, verify the principal point
survives rather than assuming it.
