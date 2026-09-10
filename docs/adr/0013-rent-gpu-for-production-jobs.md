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
