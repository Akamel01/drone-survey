# Place work locally first, then on the borrowed card, then on rented compute

Three compute targets exist and a job must land on exactly one. The order is
fixed, and it is a preference rather than a cost calculation:

1. **The local 4070**, even when it is slower.
2. **The borrowed 3090**, when the job does not fit locally and the machine is
   available.
3. **Rented compute**, when the job does not fit locally and the 3090 will not be
   available soon enough.

Local is preferred because slower is not the same as worse here. Running locally
moves no data, waits for no availability window, depends on nobody, costs
nothing per run, and fails in a place we can inspect directly. A job that takes
three hours locally instead of one hour remotely is usually the better job,
because these are batch runs with nobody waiting on the result. The cost of the
remote options is not their price; it is coordination.

## Deciding before the job runs, not by failing

Placement has to be decided from what is knowable up front. Fitting and dense
reconstruction do not fail fast — a job can exhaust video memory hours in, after
the expensive part is already spent — so "attempt locally and fall back on
error" is a bad rule despite being the obvious one.

The Runner therefore sizes a job before placing it, from properties of the
Capture that are known in advance: image count, resolution, and the settings the
Manifest asks for. It compares that estimate against a threshold per target and
places accordingly.

**The thresholds are measured, not guessed.** Nothing in this design yet knows
what a 500-image Capture actually costs in memory on either card, and published
figures vary too much to plan on. The first thresholds come from deliberately
running jobs of increasing size until they fail, and they start conservative,
because the cost of unnecessarily using the 3090 is a queued window, while the
cost of a wrong local placement is hours of wasted compute.

## Knowing whether the 3090 is usable

Availability must be **checkable by the Runner**, not remembered by an operator.
Access is time-limited, with someone else holding priority, so the check is at
least: is the host reachable, are we inside the permitted window, and is the card
actually free rather than merely reachable. A machine that answers on SSH while
someone else is using the GPU is not available.

Falling through to rented compute is a decision the Runner may make on its own
for a job that cannot wait, but it spends money, so the threshold for it should
be explicit in the Manifest rather than implicit in the Runner.

## Consequences

Placement is a Runner responsibility, not a Node one. A Node declares what it
needs; it does not choose where it runs. This keeps Nodes portable, which is the
same property containerisation is there to protect.

Every Node that might run on more than one target must be genuinely portable,
including its inputs. Placement is only free to choose if the data can follow.

Jobs will sometimes run locally and take much longer than they had to. That is
the intended behaviour and should not be treated as a bug or quietly tuned away.
If it becomes genuinely painful, the fix is to revisit the thresholds with
measurements, not to reorder the ladder by feel.
