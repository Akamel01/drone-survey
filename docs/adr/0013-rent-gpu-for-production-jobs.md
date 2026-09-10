# Develop on the local host; rent GPU for production jobs

The compute topology was designed around two owned machines, and several of the
design's constraints came from that assumption rather than from the problem. The
GPU host has 12GB of video memory and shares its RAM, disk and thermal headroom
with an unrelated production service, which put a ceiling on dataset size and a
real risk on someone else's uptime.

Hourly GPU rental removes both, and the price is not a trade-off worth agonising
over: roughly one to three dollars per job, so a realistic month of eight jobs
costs less than a subscription to anything. A rented card with twice the video
memory lifts the splat-training ceiling from a few hundred images to something
above the scale we intend to fly.

So: **develop and iterate locally, run production jobs on rented compute when
they exceed what the local host can comfortably do.**

## Consequences

The local host stops being the bottleneck it was described as, which means
several risks recorded against it are now bounded rather than structural. It
keeps its real value — a fast loop with no provisioning, no data transfer, and
no per-run cost — which is what development actually needs.

Every Node must therefore be able to run in a freshly provisioned environment,
not only on a machine that has been set up by hand. This is a constraint on how
Nodes are built rather than an extra feature: containerised, no reliance on
local state, inputs and outputs addressed explicitly. That discipline is worth
having regardless of where the work runs.

Data transfer becomes part of a job's cost and duration. Captures are large, and
moving them to rented compute and results back is real time and, on some
providers, real money. Provider choice should weigh egress charges, and jobs
should be batched rather than run piecemeal.

A third party now sits inside the production path. Rented instances vanish,
regions fill up, and prices move. Nothing about a job should be unrecoverable if
an instance disappears mid-run, which raises the value of the resume behaviour
that [ADR 0006](adr/0006-pipelines-as-declarative-manifests.md) already
identified as ours to build.

Client imagery will be processed on infrastructure we do not own. That belongs
in the privacy policy required by
[ADR 0012](adr/0012-twelve-month-capture-retention.md), and in client contracts,
rather than being discovered later.

## Revision, 2026-09-10 — a borrowed 24GB machine replaces renting as the plan

A third machine is available that this ADR did not know about: an RTX 3090 with
24GB of video memory, on a separate network, reachable over SSH. Access to it is
time-limited — certain hours, with someone else holding priority — so it is
schedulable rather than on-demand.

That suits the work. Fitting and dense reconstruction are batch jobs measured in
hours with nobody waiting on the result, so queueing for an availability window
costs almost nothing. Its 24GB lifts the Fitting ceiling above the scale we
intend to fly, which was the reason renting looked necessary.

**Renting therefore becomes the fallback**, not the plan: used when the window
will not arrive soon enough and a job cannot wait. Everything recorded above
about renting still applies when it happens, but the privacy consequence largely
does not — a known machine is not a third party, so client imagery does not
routinely leave infrastructure we control.

The containerisation requirement stands, and now earns its place for a better
reason than renting gave it. Three heterogeneous targets — the local card, the
borrowed one, and a rented one — are exactly the case where a Node that assumes
a hand-configured machine cannot move. Running in a freshly provisioned
environment is what makes the pool usable at all.

Connectivity to the 3090 is a build step with a testable outcome, not an
assumption. The two machines are on different Tailscale accounts, so the route
must be chosen and then proven end to end: authentication, a container run, and
a measured transfer rate in both directions. Transfer time is part of a job's
duration and belongs in scheduling decisions as a number.
