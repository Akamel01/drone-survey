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
