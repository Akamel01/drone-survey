# Use OpenDroneMap for orthomosaic production

Orthomosaics are the one deliverable where mature commercial engines exist, so
the open-source default was worth challenging rather than assuming. It does not
survive the challenge on price: Agisoft Metashape's affordable Standard tier
cannot export georeferenced orthomosaics at all, putting the real commercial
entry point at Metashape Professional ($3,499) or Pix4Dmapper (~$4,000/year),
both outside the budget. OpenDroneMap is competitive on quality for our target:
a 2025 ISPRS comparison finds it produces results comparable to Metashape, with
relative accuracy of one to three times the ground sample distance. It is also
Docker-native and driven over an HTTP API by NodeODM, which fits the CLI-first
requirement without adapting a GUI-oriented tool.

## Considered options

RealityCapture is free below $1M revenue and was the strongest commercial
candidate, but it is Windows-only. Adopting it would mean booting the GPU host
into Windows and abandoning headless orchestration, which costs more than the
licence saves.

## Consequences

OpenDroneMap degrades less gracefully than the commercial engines on marginal
input — thin structures, water, dense vegetation, and insufficient overlap — and
reports less about why a reconstruction went wrong. We absorb that by
controlling capture quality rather than by buying tolerance for bad input, which
makes the flight plan part of the system rather than a precondition of it.

Commercial tools also ship client-facing quality reports that we now have to
produce ourselves if clients ever ask us to defend a result.

This decision covers orthomosaics only. The Gaussian Splatting pipeline is a
separate choice, and open source leads the field there for different reasons.

## Revision, 2026-09-10

This ADR never stated OpenDroneMap's licence, which is an omission given that
ADR 0003 rejects engines on licensing grounds. **OpenDroneMap, NodeODM and
WebODM are AGPL-3.0.**

Selling the output is unaffected: program output is not a derivative work, and
the network clause binds only a *modified* version that network users can reach.
Two obligations follow from that, and both constrain the build:

Prefer a documented flag over a patch. Section 4 of the design has an open
question about stopping ODM at its camera solve; resolving it by modifying ODM
turns us into a modifier, and if any modified component is ever reachable over a
network by anyone other than the operator, the source-offer obligation applies.

Never let a client reach NodeODM, even through a thin proxy. Delivery is static
files precisely because nothing needs to.
