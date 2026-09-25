# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the operator, who owns the business, plans every Mission and flies
it. There are no other users and no roles. Clients never see this interface.

The operator meets it in two scenes:

- **At the desk**, on a MacBook Air in Safari or Chrome, planning Missions for a
  Site: drawing its area, choosing settings, saving, dispatching.
- **At the aircraft**, on a phone outdoors, deciding which Mission to open and
  load, and making any change the day calls for.

## Product Purpose

Mission Control is the planner for an aerial-survey business (see
[`CONTEXT.md`](CONTEXT.md) for the vocabulary). It turns a Site's area and
capture settings into Missions, keeps them in the shared store, and dispatches
them so the host can Load them onto the Controller's Cards. Success is a Mission
that flies the capture the Reconstruction needs, planned without the operator
doing anything a machine could do ([ADR 0015](docs/adr/0015-automation-is-the-primary-goal.md)).

## Operating Context

- One screen, `/plan`: the Missions, the map, the settings of the Mission being
  edited, and a summary with Save and Dispatch.
- The map is Esri satellite imagery (OpenStreetMap as the alternative), fetched
  over the network.
- Missions live in the shared store, not the browser
  ([ADR 0021](docs/adr/0021-one-mission-one-lifecycle-in-the-store.md)); store
  actions are gated by a passphrase.
- A phone opens on the Missions, because "which Mission do I open?" is the
  question asked at the aircraft.

## Capabilities and Constraints

- **Every capability works at every width.** Anything the operator can do on the
  desktop they can do on the phone — drawing and editing an area, placing the
  home point and point of interest, every setting, saving, dispatching. A narrow
  layout may hide a column behind a switcher; it never removes a function.
- Software spend is approximately zero.
- Terms in the interface are the glossary's terms. In particular, **Card** means
  a Placeholder Mission on the Controller and nothing else.

## Brand Commitments

- The product is called Mission Control.
- The visual direction is fixed by the reference video, specified in
  [`docs/ui-theme/spec.md`](docs/ui-theme/spec.md).

## Evidence on Hand

None. There are no testimonials, clients or published figures, and none may be
invented.

## Product Principles

1. **Parity across devices.** The phone is a full planner, not a viewer.
2. **No silent failure.** Every refusal says what happened and what to do next.
3. **The operator's words.** Interface copy uses the glossary, not the system's
   internals.
4. **Nothing a machine could do.** The interface asks the operator only for
   decisions, never for bookkeeping.

## Accessibility & Inclusion

WCAG 2.2 AA. The phone is read outdoors in daylight, so text contrast holds
against the brightest backdrop it can sit on.
