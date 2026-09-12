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

## Revision, 2026-09-10 — the premise was too narrow

This ADR argued from cost, on the assumption that the alternatives were
open-source tools or expensive commercial ones. That was wrong: there is a third
category, and it was worth checking properly.

**RealityScan** — the current name for RealityCapture — is genuinely free below
$1M of annual revenue, has a real command-line interface including orthomosaic
and ground-control commands, and its video-memory requirement is comfortably
within our card. On quality it is a serious tool, not a compromise. It was
dismissed too quickly the first time on a one-line "Windows-only".

It is still not the right choice here, on operational grounds rather than
quality or price. Its Linux path is Epic's own experimental build running under
a compatibility layer, and it requires a kernel newer than the one this host
runs — a host carrying an unrelated production stack, where a kernel upgrade is
a real risk taken for our convenience. There is also an unconfirmed report of it
hanging on authentication dialogs when run headless, which is precisely the
failure mode that matters for automation.

What OpenDroneMap offers is not superior reconstruction. It is that it runs
natively, in a container, headless, on the machine we already have, alongside
everything else already on it. For an automated pipeline that is the property
that decides the question. RealityScan's real strength is mesh and 3D
reconstruction speed, which overlaps ground already covered by the Gaussian
Splatting choice rather than the orthomosaic gap this ADR exists to fill.

Nothing surveyed alongside it — Metashape, Zephyr Free, Pix4D, DroneDeploy, Site
Scan, iTwin Capture, Correlator3D — is free for commercial use while also
producing georeferenced orthomosaics.

**A standing option, deliberately off-pipeline.** RealityScan on an ordinary
Windows machine is a reasonable manual second opinion for a job ODM handles
badly. That is a fallback for hard datasets, not a pipeline component, and no
automation should be built on its Linux path until Epic stops calling it
experimental.

## Revision, 2026-09-10 — the real blocker is the licence, not the platform

Two corrections to the reasoning above, from a deeper verification pass. The
decision is unchanged; the argument for it was partly wrong.

**The kernel objection was weaker than stated.** Ubuntu 24.04's hardware-enablement
kernels have shipped 6.14 or newer since 24.04.3, so the requirement is
satisfiable without changing distribution. The real cost is a reboot of a host
running forty production containers, which is a scheduling problem rather than a
technical barrier. The headless authentication hang is now confirmed first-party
by Epic staff rather than being a single unverified report, and it has a
documented workaround.

**The blocker is the licence.** RealityScan's terms bar "service bureau" use, and
the established industry meaning of that phrase — using your own software to
process other people's work for a fee — plausibly describes this business
exactly. Whether Epic intends that reading could not be resolved, because the
licence text is behind a login. That ambiguity is itself disqualifying: building
a business on a tool whose terms may prohibit the business is not a risk worth
taking to save on an engine that has a working free alternative.

This subsumes the earlier operational argument. Even with the kernel satisfied,
the container question answered and the authentication hang worked around,
RealityScan is unavailable until someone reads the actual terms and finds them
permissive. The Windows-machine fallback recorded above carries the same
question and should not be used commercially until it is answered.

## Revision, 2026-09-12 — OpenDroneMap forked, and the fork was measured

**The project this ADR chose has split.** In April 2026 the maintainer of WebODM
left OpenDroneMap and took WebODM with him into a separate organisation, forking
the engine as **ODX**, with matching `NodeODX` and `ClusterODX` services. Both
sides are alive and similarly active — roughly equal commit rates over the
following months — so a future reader will reasonably ask why we stayed on the
original. This records the answer.

**It was benchmarked rather than argued about.** The same 180 frames, the same
options, the same host, back to back, against a freshly run control
(`docs/research/odx-benchmark-2026-09-12.md`):

| | ODM 3.5.6, low | ODX 3.8.3, low | ODX 3.8.3, medium |
|---|---|---|---|
| Wall time | 406 s | 271 s | 526 s |
| Cameras registered | 178 of 180 | 164 of 180 | 180 of 180 |
| Dense points | 1,025,371 | 299,542 | 1,271,088 |

At equal settings the fork is a third faster because it reconstructs
considerably less. One setting higher it beats the control on every
reconstruction measure and takes 30% longer. **No tested setting produced the
control's output faster than the control did**, so the fork's headline claim does
not hold on our hardware and there is no reason to move.

**The decision is unchanged, and cheap to revisit.** `NodeODX` serves the same
REST endpoints and option names as NodeODM, confirmed by diffing the published
API documents and by querying a live container, so switching later would cost
almost nothing in our code. This measurement used video frames, which tests
throughput rather than deliverable quality; it is worth repeating once real
Grid Mission stills exist.

**Two related tools from the same organisation were rejected outright.**
`ClusterODX` cannot pin a task to a chosen machine, which is exactly what the
placement ladder in [ADR 0014](0014-compute-placement-ladder.md) requires, and
`CloudODX` is a client for a processing endpoint rather than a way to rent one
(`docs/research/odx-cluster-cloud-2026-09-12.md`). Their `OpenSplat` engine is a
genuine find, but it belongs to
[ADR 0004](0004-splatfacto-as-the-splat-engine.md) rather than here.

One detail from that organisation's work is worth keeping regardless of engine:
**`cog` defaults to off in NodeODX**, where NodeODM turns it on and delivers a
file that fails GDAL's validator. The conversion code itself is unchanged between
the two, so `export-cog` remains a real Node under either engine.
