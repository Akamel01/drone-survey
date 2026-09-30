# How long does our field workflow take today? (#227)

Baseline of the operator's path from opening the planner to a Dispatched Mission, at 375 x 812 with touch. This replaces the first attempt: its 98 s was 64 % the script's own `waitForTimeout` calls, and it skipped the Site, the Mission name and the Save sheet. Its numbers are not valid and are gone.

Data: [`field-workflow-check/baseline.json`](field-workflow-check/baseline.json). Script: `web/scripts/field-workflow-check.mjs`. Run: `bash web/scripts/remote-check.sh check:field-workflow` (Linux host, GPU Chromium; nothing ran on the Mac). Built from `main` at UI-29 and LOADER-1, after UI-27 (#304) collapsed the Summary.

## The path measured

Open the planner, Map tab, Polygon on the map toolbar, four corners, Finish area, Save Mission (the sheet): type a Mission name, find a Site by typing part of its name (run A) or create a new one (run B), confirm; Missions tab; Dispatch that Mission; read its status ("Dispatched", "Waiting to be Collected").

Save and Dispatch really happen: the real Mission lifecycle over the in-memory store, answered in the script's process the way `web/e2e/save-mission.test.mjs` does it. Each run asserts the stored Mission (state `dispatched`, right Site, one save sent, one Card reserved). The store is seeded with three Sites (Quarry Road, West Quarry, Rehearsal Field), three Planned Missions and three Cards.

Settings is not visited: with the area drawn, Save is enabled, the date is set on load, the sheet asks for the name and the Site itself, and the plan has no problems (asserted every run). Nothing else in Settings is needed for Save or Dispatch.

Run A types `west` and chooses West Quarry; run B types `Ridge Lake` and chooses New Site: Ridge Lake. The Mission name is `north half` in both. Two runs of each, in one invocation, order A1 A2 B1 B2, each in a fresh browser context and store.

## How it is measured

- **Effort** is counted where the operator acts: every tap goes through one helper, typed characters are counted as typed (real key events), a scroll is counted when a control is not reachable where it is (off screen or covered) and is then scrolled to. A tap to focus a text field is counted only when the field does not already have focus. View switches are the Map and Missions tab taps.
- **App time** is measured in the page, on its own clock: from the step's last `pointerup` or `input` event to the first animation frame in which the next control is ready. Ready is Playwright's own actionability: present, enabled, visible, not moving between two frames, not covered. The wait is a `requestAnimationFrame`-polled predicate on the real element or state (the drawing panel's title and corner count, the Save sheet's field, the option, the row's Dispatch button, the row's status chip), started before the action so no script round trip is in the number. There is no fixed wait anywhere; the only timer is a 20 s hang guard. Frame resolution is about 16 ms.
- "Open the planner" runs from navigation start to the Map tab being ready. It has no operator effort.
- Corner taps are at the fractions of the map that `area-edit-check.mjs` uses on the phone.
- The script copies the locators of `save-mission.test.mjs` (`saveButton`, `sheetOf`, `fields`, `rowOf`) and of `area-edit-check.mjs` (`tool`, Finish area); it cannot import them, because the test file runs its suite on import.

## Result

| Step | Taps | Chars A / B | Switches | Scrolls | A1 ms | A2 ms | B1 ms | B2 ms |
|---|---|---|---|---|---|---|---|---|
| 1. Open the planner | 0 | 0 / 0 | 0 | 0 | 216 | 214 | 211 | 201 |
| 2. Map tab | 1 | 0 / 0 | 1 | 0 | 475 | 464 | 479 | 481 |
| 3. Polygon tool | 1 | 0 / 0 | 0 | 0 | 52 | 67 | 45 | 48 |
| 4. Corner 1 | 1 | 0 / 0 | 0 | 0 | 58 | 42 | 19 | 28 |
| 5. Corner 2 | 1 | 0 / 0 | 0 | 0 | 35 | 69 | 54 | 74 |
| 6. Corner 3 | 1 | 0 / 0 | 0 | 0 | 42 | 44 | 44 | 50 |
| 7. Corner 4 | 1 | 0 / 0 | 0 | 0 | 100 | 174 | 125 | 93 |
| 8. Finish area | 1 | 0 / 0 | 0 | 0 | 186 | 223 | 221 | 222 |
| 9. Save Mission (open the sheet) | 1 | 0 / 0 | 0 | 0 | 67 | 51 | 61 | 54 |
| 10. Type the Mission name | 0 | 10 / 10 | 0 | 0 | 547 | 555 | 574 | 558 |
| 11. Type the Site | 1 | 4 / 10 | 0 | 0 | 48 | 30 | 25 | 30 |
| 12. Choose the Site | 1 | 0 / 0 | 0 | 0 | 65 | 61 | 61 | 68 |
| 13. Confirm (Save Mission) | 1 | 0 / 0 | 0 | 0 | 63 | 65 | 62 | 71 |
| 14. Missions tab | 1 | 0 / 0 | 1 | 0 | 472 | 475 | 479 | 485 |
| 15. Dispatch | 1 | 0 / 0 | 0 | 0 | 52 | 48 | 54 | 54 |
| 16. Read the status | 0 | 0 / 0 | 0 | 0 | - | - | - | - |
| **Total** | **13** | **14 / 20** | **2** | **0** | **2478** | **2582** | **2514** | **2515** |

Per run: 13 taps, 2 view switches, 0 scrolls; 14 typed characters with an existing Site (A) and 20 with a new one (B). App time is 2.5 s in all four runs (2478, 2582, 2514, 2515 ms). The script's wall time per run is 3.1 to 3.3 s; the difference is Playwright's own action overhead, which is not counted as app time. The Mission name field already has focus when the sheet opens, so no tap is counted for it.

## Where the effort goes

From the numbers only.

1. **Drawing the area: 6 of 13 taps.** Polygon tool, four corners, Finish area. It has no characters and no switches, and each step waits 19 to 223 ms for the app.
2. **The Save sheet: 4 taps and every typed character.** Open, the Site field, choose the Site, confirm; 10 characters for the name and 4 (A) or 10 (B) for the Site, so 14 or 20 characters in one sheet. Choosing a new Site (B) costs 6 more characters than finding an existing one (A) and the same taps.
3. **The two view switches, Map and Missions: 2 taps, and 2 of the 2 switches.** They are also the slowest taps for the app: about 475 ms each until the next control is ready, together about 950 ms of the 2.5 s (38 %). The slowest other wait is 550 ms after the Mission name is typed, until the Site field is ready.

Dispatch is one tap and about 50 ms; reading the status is free. No step needed a scroll.

## What this does not say

- Why the two tab switches and the wait after the name take about 475 to 550 ms. That needs a performance trace, which was not taken.
- Anything about a real network: the Mission routes are answered in the script's process, so there is no round trip to the store. Times are on the Linux host's GPU Chromium, not a phone.
- Time the operator spends: tapping, typing and reading are not timed, only what the app takes after each action.

## Changes to `remote-check.sh` and `remote-check-host.sh`

Kept, one word each: `check:field-workflow` added to the serve table in both files. The script needs the URL of a built, served app as its first argument, and only serve mode builds, starts the server on a free port and passes the URL; an unknown script name runs with no URL and no server. Nothing else was changed there.

## Reproduce

```
bash web/scripts/remote-check.sh check:field-workflow
```

The host build occasionally fails fetching Google Fonts; run it again.
