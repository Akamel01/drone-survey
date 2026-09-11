# Automate everything except talking to clients, driving, and flying

This is the primary goal of the business, and it ranks above every other design
preference in this repository except one: deliverable quality is not traded for
it.

The operator's manual work is limited to:

- **client-facing work** — finding clients, communicating with them, agreeing
  scope and price
- **driving** to the Site
- **flying** the aircraft, and the physical work that goes with being on Site

Everything else is automated: planning the mission, preparing the aircraft's
controller, checking whether a flight can go ahead, ingesting the Capture,
processing, quality control, assembling and publishing the delivery, and
retention.

## Reconciling automation with quality

Automation does not get to lower the bar. The rule that makes both goals hold at
once is that **humans are involved by exception, never by routine**. Every
automated step carries a quality gate. When the gate passes, work continues
without anyone looking. When it fails, the work stops and is flagged — it is
never delivered on the strength of an automated step that could not vouch for
itself.

Where automation cannot yet match a human's judgement for a step, the manual step
may remain temporarily, but it is recorded as a debt to remove, not accepted as
part of the design.

## Consequences

This changes parts of the design that were settled before the goal was stated.
Each is now a problem to solve rather than a feature:

- **Anchor tagging** is manual per Capture under ADR 0007. It must become
  automatic detection, which may change what a physical Anchor looks like — so it
  must be settled before any markers are made.
- **Splat cleaning** is human-in-the-loop in the design, because removing
  floaters was judged to need judgement. It must become automatic with a quality
  gate, and this is the step where automation and quality are most likely to
  conflict.
- **The delivery gate** was narrowed to an operator looking at the result before
  it is sent. That becomes an automated gate with human review only on failure.
- **Mission planning and loading** were manual — drawing a grid in a planner and
  copying a file onto the controller by hand. Both become part of the pipeline.

Some physical work cannot be removed and is not meant to be: placing Anchors when
a Site is first taken on, swapping batteries, and connecting the controller to a
computer if that is the only way to load a mission. The test for anything else
the operator is asked to do is whether it is client-facing, driving, or flying.
If it is none of those, it is a candidate for automation.

The cost is real engineering in places the design had previously accepted a
person. That is the intended trade: the business's capacity is bounded by the
operator's time, and time spent on anything other than clients and flying is
capacity lost.
