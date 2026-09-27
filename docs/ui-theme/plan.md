# UI Theme — Plan

Status: agreed 2026-09-24. Builds the look in [`spec.md`](spec.md) into the
planner. Product truth is in [`../../PRODUCT.md`](../../PRODUCT.md); vocabulary
in [`../../CONTEXT.md`](../../CONTEXT.md) and [spec § 15](spec.md#15-vocabulary).

## Decisions

Settled with the operator before any ticket was written.

| # | Decision | Why |
|---|---|---|
| 1 | The phone is a full planner: every desktop capability works by touch | Recorded in PRODUCT.md as binding |
| 2 | Follow the reference faithfully; adapt layout only where the planner needs it | A restyle of the old layout would be polish on a discarded look |
| 3 | Wide screens: the map full-bleed, Missions, Settings and Summary as floating glass panels | The reference's first rule is that the image is the surface; here the map is the image |
| 4 | A pre-rendered 3D hero scene behind the phone's Missions view, blurred behind Settings | The operator wants the reference's live depth; a video loop gives it without a second 3D engine or battery drain |
| 5 | No accent hue: selection is a white pill with dark ink; warning and error colours stay | The reference draws colour from the image, not the UI |
| 6 | Manrope for titles and lead figures, system font for text, monospace for data | The reference's wide geometric display face is much of its character |
| 7 | Target: the operator's phone, and Safari and Chrome on the MacBook Air | Glass is the costly part; the budget is set against the real phone |
| 8 | Motion: notice pop-up, blurred sheets, phone view push, press states, count-up only when a Mission opens | Figures that spin on every slider move would be noise |
| 9 | One epic, child issues in the repo's format, one pull request each, merged in dependency order | Matches how this repo already works |
| 10 | Hero subject: a floating island, no drone | It is what the business makes, a 3D model of a place; the work may grow beyond drones |
| 11 | The camera stays still and the island turns, one full turn in 40 s, the same way in every framing, island always on the right | Premium rather than advert; decided on the finished loop, 2026-09-25 |
| 12 | Hero placement per [spec § 4.2](spec.md#42-mission-controls-hero-scene) | |
| 13 | Hero made with Higgsfield during the trial, then upscaled and interpolated locally to a 4K/120 master; browsers get 60 fps cuts | [`hero-pipeline.md`](hero-pipeline.md) |
| 14 | Build from the spec directly, no generated mock-ups | The reference video already sets the bar |
| 15 | No screen element is called a card | Card is a glossary term |
| 16 | Remove a corner by tapping it, then "Remove corner"; right-click stays as a shortcut | A long-press is a hidden gesture that fights dragging |
| 17 | With no stored passphrase, the phone's Missions view asks for it in place | Today it points at a box that view hides |
| 18 | Birds are a separate sprite layer, side-on, a flock every 9–20 s | Natural speed whatever the island does; generated birds looked stiff |
| 19 | Map controls are two buttons with menus (Base map radio, Overlays checkboxes) in option A material, per spec §8 | Base map and overlays are different kinds of control and must not share one row; clear glass failed legibility over bright ground, so 40 % white with dark ink |
| 20 | Map control buttons go icon-only below 1000 px (badge count on Overlays); base maps get icons in the tab bar line style, shown in the menu and on the wide button instead of names | Operator review 2026-09-26: text on the buttons crowded the phone; accessible names carry the wording so nothing lives in tooltips only |

## What the phone cannot do today

Found by reading the map code and running the planner at 375 px wide:

- Reshaping the area — dragging a corner, adding one from a midpoint, resizing
  a circle, moving the shape — listens only for mouse events.
- Removing a corner needs a right-click.
- The map's handles are 8–12 px across; a finger needs 44.
- The Missions view tells the operator to type the passphrase into a box that
  the view hides.
- Some explanations (the per-battery split of a Mission's flights) exist only
  as mouse-hover titles.

## Sequence

```
UI-1 foundation ─┬─> UI-3 layout shell ─┬─> UI-4 Missions list ──┬─> UI-8 notice ──┐
UI-2 hero scene ─┘                      ├─> UI-5 Settings        │   UI-9 sheets ──┤
                                        ├─> UI-6 Summary ────────┘                 ├─> UI-11 motion ─> UI-12 verification
UI-10 touch parity ─────────────────────┴─> UI-7 map chrome ───────────────────────┘
```

UI-1, UI-2 and UI-10 can start at once. UI-10 changes behaviour only, so it
is the most valuable ticket to land first.

| Ticket | Builds | Blocked by |
|---|---|---|
| UI-1 | Tokens, materials, fonts, focus ring, reduced-transparency / contrast / motion fallbacks | — |
| UI-2 | Hero scene: the delivery files, the component that picks, plays and pauses them, and the bird layer ([`hero-preview.html`](hero-preview.html) is the prototype) | — |
| UI-3 | Layout: floating glass panels over the full-bleed map; phone views and tab bar; hero placement | UI-1, UI-2 |
| UI-4 | Missions list: Mission rows, lifecycle chips, filters; passphrase in place on the phone | UI-3 |
| UI-5 | Settings: sections, fields, segmented pills, sliders, selects on glass | UI-3 |
| UI-6 | Summary: lead figure, tiles, actions; hover-only explanations made visible | UI-3 |
| UI-7 | Map chrome: basemap and layer toggles, the drawing panel; overlay colours unchanged | UI-3, UI-10 |
| UI-8 | The notice, replacing result text under the summary and the rows | UI-4, UI-6 |
| UI-9 | Sheets: removal confirmation and a Mission's details | UI-4 |
| UI-10 | Area editing by touch; 44 px hit areas; tap a corner to remove it | — |
| UI-11 | Motion: count-up, press states, phone view push, hero sharpen and blur, sheet stagger | UI-4 to UI-10 |
| UI-12 | Verification: sunlight contrast, glass over the map on the phone, fallbacks, keyboard | UI-11 |

## Definition of done, every ticket

- Works by touch at 375 px wide and by mouse and keyboard on a wide screen.
- `npm test`, `npm run lint` and `npm run build` pass in `web/`.
- `prefers-reduced-motion` honoured for anything the ticket animates.
- No screen element is called a card.
