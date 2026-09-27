# What would an award-level audit demand of this planner?

Research for [#280](https://github.com/Akamel01/drone-survey/issues/280), parent map [#224](https://github.com/Akamel01/drone-survey/issues/224) (the best UI/UX for the browser). The operator's third weight of "best" is polish at the level of Apple Design Award winners (2026-09-27).

Audited: the planner on `main` after UI-1 to UI-21, Approval (#288) and email sign-in (#289), at 1440 × 900 (mouse and keyboard) and 375 × 812 (touch), from the production build with a seeded store. Screenshots are in [`award-audit/`](award-audit/). The measurements of contrast, keyboard, fallbacks and frame rate come from UI-12's harness (`npm run check:look`, [#286](https://github.com/Akamel01/drone-survey/pull/286)).

The theme is not up for review: `docs/ui-theme/spec.md` and the reference video are the authority. Findings that would change it are listed separately at the end, for the operator, not recommended.

## 1. The checklist, from primary sources

All read 2026-09-27.

**Apple Design Awards 2026, the six categories** ([developer.apple.com/design/awards](https://developer.apple.com/design/awards/)). The four that apply to a one-operator field tool:

| Category | Apple's words | What it demands here |
|---|---|---|
| Interaction | "intuitive interfaces and effortless controls that are perfectly tailored to their platform" | every task at every width in few, obvious steps; nothing hidden behind a layout |
| Visuals and Graphics | "stunning imagery, skillfully drawn interfaces, and high-quality animations with a distinctive and cohesive theme" | the hero and glass world carried into every screen, including the empty and secondary ones |
| Inclusivity | "a great experience for all by reflecting a variety of backgrounds, abilities, and languages" | contrast, text scaling, keyboard, screen readers, reduced motion and transparency |
| Delight and Fun | "memorable, engaging, and satisfying experiences" | the moments that happen rarely (first run, first Mission, a Mission flown) feel earned |

Innovation and Social Impact are about novel platform use and societal reach; they are not the operator's goal.

**Apple Human Interface Guidelines** (the JSON behind [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)):

- Contrast: WCAG AA, 4.5:1 up to 17 pt text, 3:1 at 18 pt and for bold; if the default misses it, at least honour Increase Contrast.
- Targets: 44 × 44 pt default on iOS, 28 × 28 pt minimum; spacing between controls matters as much as size.
- Text size: support enlarging text, ideally to at least 200 %.
- Reduce Motion: reduce automatic and repetitive animation, including zooming and scaling.
- Colour: "convey information with more than color alone".
- Materials: glass is for "controls and navigation"; "don't use Liquid Glass in the content layer"; over bright content, consider "a dark dimming layer of 35 % opacity"; materials respond to Reduce Transparency and Increase Contrast.
- Motion: "add motion purposefully… don't add motion for the sake of adding motion"; "make motion optional"; feedback motion "brief and precise".
- Layout: group related items; progressive disclosure keeps layouts clear.

**Material 3 Expressive** (Google, May 2025; [Google Design research summary](https://design.google/library/expressive-material-design-google-research), [building with M3 Expressive](https://m3.material.io/blog/building-with-m3-expressive)): 46 studies, over 18,000 participants; emphasis through size, shape, colour, containment and motion helped people find the key action faster, and closed the gap for users over 45. Relevant here as evidence that a single clearly emphasised primary action per screen pays off, not as a style to adopt.

## 2. The audit, screen by screen

Score per category: 3 award level, 2 good with gaps, 1 weak, 0 missing.

| Screen | Interaction | Visuals | Inclusivity | Delight | Notes |
|---|---|---|---|---|---|
| Home, 1440 ([shot](award-audit/1440-home.png)) | 3 | 3 | 1 | 3 | The hero, the title wipe and three clear ways in. The title and small links fail contrast over the bright mist: 2.23:1 for the title at 1440 and 1.68:1 at 375 (3:1 needed), the planner link 3.46:1 (4.5:1). |
| Home, 375 ([shot](award-audit/375-home.png)) | 3 | 3 | 1 | 3 | Same as above; the pills sit in the thumb zone. |
| Planner, 1440 ([shot](award-audit/1440-planner.png)) | 2 | 3 | 1 | 2 | Cohesive glass over the photograph; keyboard walk passes (47 stops, all with rings). Text on smoke glass fails AA over snow-bright tiles for 190 of 416 measured runs (Option A in #286 fixes all but 4). The Summary shows a red "Save: choose the Site" error before the operator has done anything. |
| Missions rows, both | 1 | 2 | 2 | 2 | Every row repeats the same explanatory paragraph ("Nothing has left the planner yet. Dispatching reserves the Cards…"), so three Missions fill the screen and scanning suffers. HIG: progressive disclosure. The state is carried by words and a chip, not colour alone (good). |
| Map and menus, 1440 ([shot](award-audit/1440-basemap-menu.png)) | 3 | 3 | 2 | 2 | Menus hug their content, icons read clearly, 44 px targets. |
| Map tab, 375 ([shot](award-audit/375-map.png)) | 1 | 2 | 2 | 2 | The Summary covers the lower two thirds; the map gets 233 of 812 px. Drawing an area with a thumb on a third of the screen is the field's slowest task (map #224's first weight). |
| Settings, 375 ([shot](award-audit/375-settings.png)) | 1 | 2 | 2 | 2 | The same Summary covers the settings; the operator scrolls a small window. |
| Notice, both ([shot](award-audit/1440-notice-expanded.png)) | 3 | 3 | 3 | 3 | The reference's Live Activity motion, keyboard-operable, announced to screen readers. Award level. |
| Details sheet ([1440](award-audit/1440-sheet.png), [375](award-audit/375-sheet.png)) | 2 | 1 | 2 | 1 | A large blurred sheet holding only the Mission's name and id. The reference's sheet carries a light panel with the subject and its facts. |
| Accounts (Settings, admin) | 2 | 2 | 2 | 1 | Clear, but a pending sign-up only shows when the operator happens to open Settings. |
| Reduced motion, transparency, contrast | 3 | 3 | 3 | – | All three verified (UI-12). |
| Text at 200 % | – | – | 0 | – | Not verified anywhere. HIG asks for at least 200 %. |

## 3. Gaps worth ticketing, ranked

Ranked by the map's weights: field speed first, then beating the drone planners, then polish.

1. **The phone Summary covers the Map and Settings tabs.** Make it collapse to its lead figure (flight time) on the phone, expanding on demand, so the map and settings get the screen. Interaction; field speed. (Already raised with the operator in #286.)
2. **Contrast on glass and on the home title.** Decide Option A in #286. Inclusivity; a field tool read in sunlight.
3. **An error shown before any attempt.** The Summary's red Save refusal appears on first load. Show it only after Save is pressed, and show what Save needs next to the button beforehand. Interaction.
4. **Mission rows repeat their explanation.** Keep the headline and the one action that matters; move the paragraph behind the Details control or show it once. Interaction; scanability at the aircraft.
5. **The Details sheet is nearly empty.** Put the Mission's facts on the reference's light panel: area, flight time and flights, photos, Cards, the Site, and its lifecycle (Planned, Dispatched, Collected, Loaded, Flown with times). Visuals.
6. **Text scaling.** Test the planner at 200 % browser text and fix what breaks. Inclusivity.
7. **The rare moments.** A first-run empty state that teaches the first Mission in the hero's voice; a quiet celebration when a Mission is marked Flown. Delight, within the reference's no-overshoot motion.
8. **A pending sign-up waits unseen.** A badge on Settings (or a notice) when an Account is waiting for approval. Interaction. (The Accounts map already lists "telling the operator when someone new is waiting".)

## 4. Findings that would change the theme (for the operator; not recommended)

- **Glass in the content layer.** HIG reserves glass for controls and navigation; our Missions rows are glass tiles in the content layer. The reference video does the same (tiles and banners on the photograph), so the spec follows it deliberately.
- **Springs with bounce.** M3 Expressive's physics springs overshoot; the reference decelerates to rest with no overshoot (spec § 9). The spec wins.
- **A dimming layer.** HIG suggests a 35 % dark dimming layer under clear glass over bright content. Option A in #286 is the spec-compatible version of this (more opaque smoke glass, and a gradient behind the home title).

## 5. What could not be verified

- Real Safari and a real iPhone (headless WebKit renders no backdrop blur); the operator's phone checks are in #271 and #286.
- A screen reader walk (VoiceOver or TalkBack) beyond the accessibility tree.
- 200 % text scaling, above.
