# Field UI evidence — sunlight, gloves and one hand (2026)

Resolves [Akamel01/drone-survey#226](https://github.com/Akamel01/drone-survey/issues/226).

The operator meets the planner **at the aircraft, on a phone outdoors**
(`PRODUCT.md:14-19`) and the product already declares it — "every capability works
at every width" (`PRODUCT.md:44-47`), "the phone is read outdoors in daylight, so
text contrast holds against the brightest backdrop" (`PRODUCT.md:74-75`), and
"the phone is a full planner: every desktop capability works by touch"
(`docs/ui-theme/plan.md:13`). This document is the evidence base for how those
claims should be built and measured. It is a **rule table**: every rule has a
source, the date this worker read it (2026-09-27), and a check that fails when the
rule is broken.

Provenance follows the house convention (`docs/research/mission-parameters-and-verification-2026.md:3`):
**Confirmed** = read in a primary source and cited inline; **Inferred** = my
synthesis, or a secondary/blog source, flagged as such.

## The lead finding

**The planner ships 44 px targets; the only measured gloved standard asks for
15–20 mm.** Platform minimums cluster low — Apple 44 pt (≈8.5 mm once the 2016
study converts it), Android/Material 48 dp (≈9 mm), Windows 7.5 mm — but the
military standard behind glove use is **15 mm ungloved / 20 mm gloved**, and the
2016 in-vehicle study that tested it found participants made **no activation
errors at all** in the MIL-STD-1472 sizing condition, with or without gloves, and
were measurably less accurate below it. 20 mm ≈ **76 CSS px** at 96 dpi. Any
target the operator must hit with a glove on — Load, Save, Dispatch, the Mission
list, the map menu — is roughly **half** the size the glove evidence supports.

## 1. Minimum touch targets

| Rule | Source (read 2026-09-27) | Check |
|---|---|---|
| Non-text/UI targets meet **24 × 24 CSS px**, or pass the spacing exception. | WCAG 2.2 SC 2.5.8 (AA) — [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Confirmed: "at least 24 by 24 CSS pixels", with the **Essential** exception explicitly covering dense digital-map pins. | `node web/scripts/field-ux-check.mjs` — asserts zero interactive elements under 24×24 at 375×812 and 390×844. |
| Larger targets meet **44 × 44 CSS px**. | WCAG 2.2 SC 2.5.5 (AAA) — [Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html). Confirmed: "at least 44 by 44 CSS pixels". | Same script reports every element under 44×44 (the project's declared floor, `docs/ui-theme/spec.md:447-448`). |
| Touch interfaces use **≥ 44 × 44 pt**, with a **7–10 mm** physical target and ~8 dp spacing. | Apple, *UI Design Dos and Don'ts* — [developer.apple.com/design/tips](https://developer.apple.com/design/tips/) ("at least 44 points x 44 points"). Android — [Touch target size](https://support.google.com/accessibility/android/answer/7101858): "at least 48dp … about 9mm … recommended target size for touchscreen objects is 7-10mm", separated by 8 dp. Both read 2026-09-27. | Script asserts the 24 px hard floor; the 44 px floor is reported as the project's chosen bar. |
| Size targets to the **consequence of a mistap**, not only to a floor. | Microsoft, *Targeting* — [guidelines-for-targeting](https://learn.microsoft.com/en-us/windows/apps/develop/input/guidelines-for-targeting). Confirmed: 7.5 mm default; "targets that have severe consequences if touched in error should have greater padding and be placed further from the edge". | Manual/procedural: the primary field actions (Load, Save, Dispatch) are reviewed against this; a Playwright check can assert they are ≥ 44 px and ≥ 8 px apart. |

Apple's HIG `buttons`/`layout` pages render only with JavaScript and could not be
fetched verbatim; the 60 pt centre-spacing figure quoted in the discovery brief is
therefore carried as **Inferred** (§7).

## 2. Gloves (the decision-relevant finding)

| Rule | Source (read 2026-09-27) | Check |
|---|---|---|
| Where gloves are worn, targets reach the **MIL-STD-1472 gloved size — 20 mm (≈76 CSS px), 3 mm separation** — not the 8.5–9 mm platform floor. | Ray, Michelson, Price & Fausset, *Touch Zone Sizing for Mobile Devices in Military Applications* (2016), abstract read via the [Exa library mirror](https://exa.ai/library/publication/98hw7348kdr) — **secondary mirror; the proceedings DOI is still unfound (§7)**. Confirmed from the abstract: "participants … made no errors … in the MIL-STD-1472 sizing condition irrespective of gloves", and gloves reduced first-try accuracy. The **15 mm ungloved / 20 mm gloved** figures themselves are quoted from the 2016 study via the discovery brief as **secondary — I could not open the current MIL-STD-1472 clause (§7)**. | `node web/scripts/field-ux-check.mjs` reports every field action under 44 px; the doc's build rule is that Load/Save/Dispatch/Mission-list/menu targets are raised to ≥ 76 px (or 2× the base) pending #228's decision. |
| Capacitive touch fails with a glove at all; thickness/standoff from the panel is the dominant factor. | Hoober, *Design for Fingers, Touch, and People, Part 1* (2017), confirmed read: capacitive touch "doesn't work with any old pen as a stylus, **when wearing gloves**, or even when your skin is too dry". Practitioner source (UXmatters), **secondary**. The dedicated glove-physics paper (Ocular Touch) was not fetched this session (§7). | Procedural: no glove mode is proposed for the browser (see §7); the check is the enlarged target/spacing rule above, which is glove-agnostic. |

**Gap, stated plainly.** 44 CSS px measures ≈ 11.6 mm at the CSS reference pixel
(1/96 in) and ≈ 8.5 mm as Apple's 44 pt; 48 dp ≈ 9 mm. The measured gloved
requirement is 20 mm ≈ 76 px. Real command output for the conversion:
`44px at 96dpi = 11.6 mm ; 20mm at 96dpi = 75.6 px`. Whatever the conversion, the
planner's 44 px floor is roughly half the gloved evidence base.

## 3. Thumb reach and one-handed layouts

| Rule | Source (read 2026-09-27) | Check |
|---|---|---|
| Primary content sits in the screen **centre**, because people prefer to view and touch there; targets there can be smaller than corner targets. | Hoober, *Design for Fingers… Part 1* (2017) — [UXmatters](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php). Confirmed: "**75%** of users touch the screen only with one thumb"; "**fewer than 50%** … hold their phone with one hand"; "**36%** … cradle"; people "prefer to view and touch the center"; centre targets "as small as **7 millimeters**", corner targets "about **12 millimeters**". Practitioner, **secondary**; his 2013 column is explicitly superseded and must not be cited. | Playwright: place primary field actions (the Mission list, Dispatch) in the lower-centre of the 375×812 viewport and assert they are within the reach envelope; the generic size sweep (§1) covers the rest. |
| One-handed thumb targets reach **9.2 mm (discrete) / 9.6 mm (serial)**, and edge targets extend to the screen edge. | Parhi, Karlson & Bederson, *Target Size Study for One-Handed Thumb Use on Small Touchscreen Devices*, MobileHCI 2006 — [UMD HCIL TR PDF](https://www.cs.umd.edu/hcil/trs/2006-11/2006-11.htm). Confirmed (peer-reviewed): "**9.2 mm for single-target tasks and 9.6 mm for multi-target tasks**"; "targets on the right side of the screen for right-handed users … should extend all the way to the edge". | Manual: the narrow tab bar's outer tabs (Missions/Settings) sit flush to the viewport edges. |

Keep the naive "thumb-sweep heatmap" out of the design: Hoober's own 2017 piece
calls it "the well-known, but incorrect thumb-sweep chart". Prefer reach facts and
"enlarge corners" over a decorative zone diagram.

## 4. Sunlight readability, contrast and glare

| Rule | Source (read 2026-09-27) | Check |
|---|---|---|
| Text holds **4.5:1** (3:1 for large text); enhanced text holds **7:1**. | WCAG 2.2 SC 1.4.3 (AA) — [contrast-minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) ("at least 4.5:1 … Large-scale text … at least 3:1"); SC 1.4.6 (AAA) 7:1 is stated on the same page. Confirmed. | `node web/scripts/field-ux-check.mjs` computes the map-pill ink against its composited fill and asserts ≥ 4.5:1 on bright and mid tiles. |
| UI boundaries/states and meaningful icons hold **3:1**. | WCAG 2.2 SC 1.4.11 (AA) — [non-text-contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): "contrast ratio of at least 3:1 against adjacent color(s)". Confirmed. This is the citable basis for the focus ring (`web/app/globals.css:82`) and the pill border (`web/components/MapPane.module.css:91`). | Manual: the 2 px white focus ring plus 4 px dark halo is compared against bright sky and dark glass; a computed-style check can assert both border colours are present. |
| Sunlight legibility is governed by **peak luminance and anti-reflection**, not by panel technology. | *Liquid crystal display and organic light-emitting diode display: present status and future perspectives*, **Light: Science & Applications** 7, 17168 (2017) — [nature.com/articles/lsa2017168](https://www.nature.com/articles/lsa2017168), DOI 10.1038/lsa.2017.168. Confirmed: for phones (~4.4 % reflectance) the LCD/OLED ambient-contrast-ratio crossover is **107 lux** (72 lux with an in-cell polarizer); beyond it LCD "takes over"; "**Display brightness and surface reflection have key roles in the sunlight readability** of a display device." | Procedural: this is a *web* app, so the remedy is high text/backdrop contrast and opaque-ink chrome over imagery — the machine check above plus a physical glare check (§7). |

**Correcting the ticket's premise.** "OLED is better in sunlight" is **not
supported**. The 2017 review shows OLED's dark-state contrast advantage holds only
in dim ambient light; under bright light a higher peak luminance and a lower
surface reflectance dominate, and LCD can match or beat OLED — so a bright phone
screen in daylight erases OLED's apparent edge. A second, 2023 vehicle-display
study and a 2012 phone-display study point the same way; neither was fetched this
session (§7). **Confirmed** by the 2017 primary; the two corroborating papers are
**Inferred/secondary** here.

## 5. Web haptics

| Rule | Source (read 2026-09-27) | Check |
|---|---|---|
| Do **not** rely on vibration feedback in the web planner; treat it as an optional Android-only enhancement with a silent fallback. | W3C, *Vibration API* — [w3.org/TR/vibration](https://www.w3.org/TR/vibration/) (Candidate Recommendation Draft, 21 May 2026). Confirmed: "implemented in Chromium-based browsers. WebKit has published a position opposing this specification. Firefox removed its implementation in version 129." W3C *Implementation Report* — [w3c.github.io/vibration/reports/implementation.html](https://w3c.github.io/vibration/reports/implementation.html): "implemented in a single browser engine (Blink)"; Gecko removed in v129 (2024-08-06); WebKit "never shipped the API and formally opposes it"; Firefox-for-Android returns `true` but "produces no haptic feedback". | `node web/scripts/field-ux-check.mjs` **probes** `typeof navigator.vibrate` and prints it — explicitly **not a pass/fail**: absence is the correct result on iOS Safari. |
| The product's browser floor guarantees no iOS web haptics. | `web/package.json:28-33` (`Safari >= 13`, `iOS >= 13`) plus the W3C implementation report above. | Covered by the same probe; the script never asserts that vibration fires. |

This **confirms and strengthens** `docs/ui-theme/spec.md:463-464` ("the web has no
iOS haptics; `navigator.vibrate` exists only on Android"). It is stronger than the
spec states: the API is now Blink-only, **not Baseline**, and Firefox removed it in
v129. `navigator.vibrate()`'s "Limited availability / not Baseline" status is
recorded on [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
(secondary, not fetched this session). The native apps of map #229 are **not**
bound by this limitation — iOS exposes a native haptics API — so the doc flags it
for #229 rather than reversing the web decision.

## 6. Error prevention under time pressure

| Rule | Source (read 2026-09-27) | Check |
|---|---|---|
| Actions that modify or delete user-controllable data are **reversible**, **checked** at entry, or **confirmed** before they commit. | WCAG 2.2 SC 3.3.4 (AA) — [error-prevention-legal-financial-data](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html): "at least one of the following … Reversible … Checked … Confirmed". Confirmed. | Procedural: Dispatch/Withdraw and any delete get one of the three; a Playwright test can assert a confirm step exists before a destructive store call. |
| Errors are identified and a correction suggested as they happen. | WCAG 2.2 SC 3.3.1 (Error Identification, A) and SC 3.3.3 (Error Suggestion, AA); both are enumerated in the WCAG 2.2 baseline — [w3.org/TR/WCAG22](https://www.w3.org/TR/WCAG22/). Confirmed by SC number; the individual Understanding pages were not opened this session. | Procedural: the passphrase/store error surface names the field and the fix (the notice, `web/app` post-#215). |
| Detected input problems are **rejected at entry**, not after a long invalid entry; touch feedback is explicit because touch gives none; multi-step entry is avoided under load. | FAA **AC 120-76D**, *Authorization for Use of Electronic Flight Bags* (10/27/17) — [faa.gov … ac_120-76d.pdf](https://www.faa.gov/documentLibrary/media/advisory_circular/ac_120-76d.pdf). Confirmed verbatim: ¶11.10 "incorporate input error checking to detect input errors at the earliest possible point during entry, rather than on completion of a possibly lengthy invalid entry"; ¶11.8 "touch screens provide little or no tactile feedback … visual and/or aural or other touch activation feedback is especially important"; ¶11.12 "**Avoid complex, multi-step data entry tasks** during taxi, takeoff, descent, approach, landing, and non-cruise phases"; ¶11.3 legibility "under the full range of lighting conditions … to include daytime use in **direct sunlight**", brightness "adjustable in fine increments", and must "not produce objectionable glare or reflections". | Procedural: Save/Dispatch validate at field level (not on submit) and avoid multi-step entry at the aircraft; the field-glare checklist (§7) covers sunlight. |

Aviation is used here as the field-app case study because no agriculture or
surveying primary was found (§7); the load — gloved, bright light, time pressure —
is the same.

## What the planner already does, and the gap

**Exists (cite, don't rediscover):**

- 44 px targets in the touch surfaces — glass pills `web/components/MapPane.module.css:84`,
  menu items `:245`, draw actions `:431`; sheet close `web/components/Sheet.module.css:103-104`;
  invisible 44 px map hit layers `web/components/MapPane.tsx:228,246,257`.
- Sunlight reasoning already done right: the map chrome moved from white-on-clear-glass
  to **40 % white fill with dark ink**, precisely because a translucent white fill
  "can never hold *white* text to 4.5:1 against a bright tile"
  (`web/components/MapPane.module.css:79-97`, `.pill` at `:84-102`, ink `--ink:#0B0B0C`
  at `web/app/globals.css:18`).
- Focus ring and fallbacks: 2 px white ring + 4 px dark halo (`web/app/globals.css:82`);
  `@supports not (backdrop-filter…)`, `prefers-contrast: more`, `prefers-reduced-transparency`
  (`web/app/globals.css:88-99`).

**The gap, measured:**

- **Targets are half the gloved floor.** 44 px vs 20 mm (≈76 px); no coarse-pointer or
  gloved-size rule exists anywhere in `web/` (no `@media (pointer: coarse)`).
- **No one-handed placement rule.** The narrow switcher sits at the bottom
  (`web/app/plan/page.tsx:22-25,43-53`), but Save/Dispatch live in the Summary/Sheet
  and their thumb reach is untested.
- **Contrast is modelled, not measured.** The 40 % pill fill composites to
  **15.22:1** over a paper-bright tile `#cfcfcf` and **9.36:1** over mid-grey, but
  **4.31:1** over a near-black tile `#1a1a1a` — i.e. below 4.5:1. Real output:
  `bright 15.22:1, mid 9.36:1, dark 4.31:1`. The design must keep the pills off very
  dark imagery, or the pill fill opacity must rise — the check in §4 makes this
  visible.
- **Haptics ruled out correctly** (`docs/ui-theme/spec.md:463-464`) and now confirmed
  as Blink-only (§5); flag for #229.

Downstream: **#188** (UI-12) is the verification gate that measures these against the
finished theme; **#228** (grilling) decides which field workflow to make fastest
first and must choose the target size from the evidence range, not silently pick 44.

## What I could not verify

- **MIL-STD-1472 current revision and clause.** Which issue (D/E/F/G/H) sets the
  15 mm/20 mm figures, and whether the 20 mm "gloved" figure is still current, was
  not confirmed — the current standard could not be opened this session; the figures
  are carried as **secondary** via the 2016 study.
- **The 2016 glove study's proceedings DOI.** Its abstract (authors, n = 6, glove
  accuracy effect, zero errors at MIL-STD-1472 sizing) was read via the Exa mirror;
  the citable proceedings DOI/venue remains unfound.
- **Apple HIG `buttons`/`layout` verbatim text** (JavaScript-only pages). The 44 pt
  figure is confirmed from `developer.apple.com/design/tips`, but the **60 pt
  centre-spacing** rule and the exact HIG wording are **Inferred** from the discovery
  brief.
- **Agriculture / surveying field-app primaries.** None found; John Deere / Trimble /
  AgLeader / USGS leads remain unverified. The aviation (FAA) and military
  (MIL-STD-1472) sources carry the gloved/bright-light/time-pressure load instead.
- **FAA successor AC 120-76E** identity, and the fact that AC 120-76D was cancelled
  2024-06-12 — the D text was the citable HF guidance read here; the E revision was
  not verified.
- **Corroborating sunlight papers** — the 2023 vehicle-display study and the 2012
  phone-display study — were not fetched; the OLED correction rests on the Light:
  Science & Applications 2017 primary, with the other two as **secondary**.
- **Real sunlight/glare legibility.** A machine check can only assert contrast
  ratios; actual glare needs a **physical field check**. Proposed: a manual
  glare checklist in the genre of `docs/field/proving-flight-checklist.md`.
- **Whether `prefers-contrast: more` / `prefers-reduced-transparency` are honoured
  on the operator's actual phone** — assumed in `web/app/globals.css:88-99`,
  unverified on device.
- **Which single target size the operator needs.** The evidence gives a *range*
  (44 px baseline; ≈76 px gloved; 7 mm centre / 12 mm corners; 9.2–9.6 mm thumb).
  This doc presents the range and a defensible default (raise field actions toward
  20 mm); the decision belongs to #228, and no number was silently chosen.
