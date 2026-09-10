# Pipelines are declarative manifests executed by a thin runner

We need node-based pipelines that share common steps rather than duplicating
them, driven from the command line. No headless node-graph orchestrator exists
for photogrammetry — Meshroom's is bound to its GUI, and general workflow
engines do not appear in this domain at all. So the choice was between adopting
a general engine (Prefect, Dagster, Airflow, Snakemake) and defining the
pipelines ourselves.

A Pipeline is therefore a **manifest**: a declarative file naming its Nodes,
their inputs and outputs, and the edges between them. A thin runner executes a
manifest, dispatching work to the GPU host over Tailscale SSH and driving ODM
through the NodeODM API.

The general engines solve problems we do not have — multi-tenant scheduling,
dynamic fan-out, cluster-wide retry semantics — for one operator running
hour-scale jobs on a single GPU host that is already carrying a production
service. Their cost is operational surface on exactly the machine that can least
afford it.

The deciding argument is that the manifest has **two consumers**. The runner
executes it; the planned developer view on the website draws it. Phase 1 of that
view is visualisation only, and a pipeline defined as data can be drawn without
an engine to interrogate. One source of truth, rendered and executed by
different readers.

## Consequences

Node reuse becomes structural rather than a matter of discipline. A Node is a
named unit referenced from any manifest that needs it, so shared steps like
frame extraction or geotag backfill exist once by construction.

We own what an engine would have given us free: retries, failure handling, and
resume. Resume is the one that matters, because splat training and dense
reconstruction run for hours and a failure near the end is expensive. This is
accepted deliberately, and it is the first thing to re-examine if the runner
starts growing features rather than staying thin.

When phase 2 brings interactive control from the website, the manifest is
already the contract between the two. That work adds an execution API; it does
not rewrite the pipelines.

## Revision, 2026-09-10

This ADR presented the choice as a binary between a general workflow engine and
a runner of our own, and it skipped the middle. **NodeODM already has a job
queue with concurrency and slot management**, and we had already committed to
driving ODM through it. Make and systemd units are also unconsidered options
that cover part of the ground.

The decision stands, narrowed: the Runner should **delegate** rather than
reimplement. ODM work is queued through NodeODM's own mechanism, and the Runner
sequences Nodes and moves artifacts between them rather than scheduling.

**Thinness now has a stated threshold**, because the original ADR set none while
listing exactly the features that constitute a workflow engine. The Runner is no
longer thin once it needs any of: its own persistent job store, a scheduler, a
retry policy engine, or a concurrency model beyond "one job at a time on the GPU
host". Reaching any of those is the trigger to stop extending it and adopt
something existing. Resume is the exception, and belongs in how Nodes are
structured — small enough that re-running one is cheap — rather than in
machinery that can resume an arbitrary long step.
