# A Mission is one thing with one lifecycle, and it lives in the store

The planner kept Missions in two places that did not know about each other. The
Plan tab read a list held in browser local storage; the Mission status tab read
drafts and Specs from the store and rendered one row per record. A Mission that
had been dispatched therefore appeared twice, under two names — the name the
operator typed and the slug used as its storage key — in two states, with two
sets of buttons, and only one of the two carried its point count and distance.

The operator's report was that the tab was "completely unacceptable" and needed
a redesign. Reading it confirmed worse: the screen was a faithful view of three
files joined together, so its vocabulary was storage vocabulary. `draft`,
`queued`, `withdrawn` and `superseded` appear nowhere in `CONTEXT.md`. They were
invented at the rendering layer, and `dispatched` was doing two unrelated jobs —
"this draft was dispatched" on one row, and "this Spec is next in line" on
another — while colliding with the name of the button.

## Decision

**A Mission is one thing, shown once, moving through states named after the
verbs that cause them.** Planned, Dispatched, Collected, Loaded, Flown,
Withdrawn, Superseded — defined in `CONTEXT.md`, and the same words the
glossary already used for the actions.

**`queued` is not a state.** The glossary says a Dispatched Spec is waiting to
be Collected; how many are ahead of it is something the Mission has, not
somewhere it is. Its removal ends the contradiction where pressing Dispatch
produced something that did not say "dispatched".

**Missions live in the shared store, not in the browser.** Browser storage is
per-origin, per-browser and per-device: the operator lost sight of their saved
Missions simply by opening a different deployment URL, and a cleared cache would
have destroyed them with no warning. Losing planning work is one of three things
the operator named as never acceptable.

**Nothing is deleted.** Removing a Mission archives it. Withdrawn and superseded
Missions are archived too, hidden behind a filter rather than mixed into the
list — which by itself takes the current view from fourteen rows to about four.

**Editing a Dispatched Mission is an ordinary operation.** The glossary already
makes it safe: a Spec is never edited, a change is a new Spec that supersedes
the earlier one. So edit-and-redispatch is the model's native move, and the
withdrawal of the old Spec is automatic and stated. Only a Mission already
**Loaded** is guarded, because a file is then already in the field.

**Two Missions may share a Site and a date**, told apart by a Mission Name.
Supersession applies within one name. Without this, planning a grid and an orbit
of one Site on one day would silently discard one of them.

**Flown is asserted, not merely observed.** Imagery arriving for a Site and date
is evidence the system infers from; the operator's own mark decides. They may
mark a Mission Flown before imagery lands, or unmark one the imagery suggested,
and their answer wins. Where the two disagree, both are shown.

## Consequences

**The Site stops being created by accident.** The field labelled "Site name" was
being typed fresh for each Mission, quietly creating a new Site every time. A
Site is the unit a client buys work about, identified once at onboarding, with
Captures accumulating under it — so this was breaking the 3D Timelapse before it
was ever built. Choosing an existing Site and naming the Mission separates the
two.

**One list, rendered in both tabs.** The tabs stay for now; the list does not
diverge, because there is only one of it. Merging them into a single screen,
with a layout for the phone the operator actually holds in the field, is #151.

**The existing store is not migrated.** Everything in it is rehearsal data from
before a real Site was flown. Migrating means writing code that runs once,
against records whose provenance is not fully trusted, to preserve data nobody
needs. The two Cards currently holding Missions are cleared by hand.

**Durability is two-tiered, and only one tier costs anything.** The browser
holds the edit in progress, so a closed tab loses nothing; the store holds each
saved version. A realistic planning day is a few hundred small writes, against a
daily transaction cap that one misbehaving 30-second poll once spent 2,880 of.
Per-keystroke writes to the store were considered and rejected on that basis.

**The screen is built for one question.** "Is this Mission going to fly
correctly, and which Card do I open?" — read before leaving, and again with the
Controller in hand. It is not an operations console, and the dense list it used
to be is the design that failed.
