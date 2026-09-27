# Which app architecture for offline at a Site, Loading the RC2, and push? (2026-09-27)

Research for ticket [#231](https://github.com/Akamel01/drone-survey/issues/231), under the parent
map [#229](https://github.com/Akamel01/drone-survey/issues/229). One operator, one phone, three
needs the browser planner cannot meet: **work offline at a Site**, **Load Missions onto the RC2**
without the Linux host, and **receive push** when a Mission changes state. The choice is between
**Native (SwiftUI + Jetpack Compose)**, **React Native with Expo**, and an **installable PWA**
(with or without Capacitor wrappers).

**Settled input, not re-litigated.** [#230](https://github.com/Akamel01/drone-survey/issues/230)
decided that **a phone cannot Load a Mission onto the RC2 over USB — on either platform**. The
RC2 keeps the USB host role and exposes MTP only, measured at
`docs/adr/0016-mission-generation-and-loading-for-the-rc2.md:480-485`; iOS has no route at all
(`origin/research/phone-loads-rc2:docs/research/phone-loads-rc2.md`, read 2026-09-27). Loading therefore stays on a small Linux
board cabled to the RC2, and the phone drives that board over Wi-Fi. **The USB/ADB axis is not a
differentiator between the three stacks, and this document does not compare them on it.**

Method: primary sources (vendor documentation, specifications, framework source) preferred;
forum and marketing pages labelled; every source carries the date it was read. Anything not read
or measured is marked **INFERRED**. Sources were read on 2026-09-27. Repo facts are cited as
`path:line`.

## Verdict

| Need | Winner | Deciding fact |
|---|---|---|
| Offline at a Site | **PWA** (Expo a close second) | It reuses all of `web/lib` and the UI, and IndexedDB + a service worker ship offline with no new toolchain. Expo reuses the domain logic but none of the UI. (`web/lib/*.ts`; [MDN Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API), read 2026-09-27) |
| Loading onto the RC2 | **No stack** | Settled by #230: the RC2 wins USB host, MTP only. The phone drives the Linux board over Wi-Fi, which all three stacks do equally well. |
| Push | **PWA** — unless the operator accepts a separate ntfy app | Web Push on iOS 16.4+ installed web apps "do[es] not need … the Apple Developer Program". APNs from Expo or Capacitor requires a **paid** Apple account. ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [Expo](https://docs.expo.dev/push-notifications/push-notifications-setup); [Capacitor](https://capacitorjs.com/docs/guides/push-notifications-firebase), read 2026-09-27) |
| Reuse of `web/lib` | **PWA** | 15 of 19 non-test modules are pure TypeScript and run unchanged in the browser; Expo reuses those 15 but rewrites every component; Native re-implements them twice. (`web/lib/*.ts`) |
| Build & release effort | **PWA** | No account, no review, no signing; a deploy is the release. Native/Expo need signing, store review and, on iOS, the paid program. ([Apple testflight](https://developer.apple.com/testflight/), read 2026-09-27) |
| Agent build/test | **PWA** | Playwright is already a dev dependency and already drives this repo's UI check. Expo/Native need an emulator and/or simulator plus a second toolchain. (`web/package.json:25`; `web/scripts/map-chrome-check.mjs:1-16`) |
| Store-account cost | **PWA** | Apple **USD 99 per membership year**; Google Play **USD 25 one-time**. PWA is zero. ([Apple enroll](https://developer.apple.com/programs/enroll/); [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435), read 2026-09-27) |

## Direct answers

### 1. Offline at a Site

**What the phone should keep.** Because `PRODUCT.md` fixes software spend at approximately zero
and this is one operator with no roles, the phone must not hold Backblaze credentials: a store
listing or an APK is a public binary, and `B2_KEY_ID` / `B2_APP_KEY` in it would be a disclosure
of the Spec bucket (`web/lib/b2.ts:16-20`; ADR 0017). The phone instead speaks to the existing
Next.js API routes, which stay the only holder of the storage keys, gated by the Wayfinder
passphrase in an `x-wayfinder-key` header (`web/lib/auth.ts:10-28`). So the phone keeps:

- the Mission records it is showing, and the **Card Ledger** (`web/lib/model.ts:82-94`);
- the **Mission Specs** for Missions that are Dispatched or Loaded — a Spec is never edited, so
  caching one is safe (ADR 0016, `web/lib/spec.ts:1-8`);
- an **outbox** of operator actions taken while away from the network — Dispatch, Withdraw, Mark
  Flown, and edits to a Planned Mission (`web/lib/model.ts:26-51`);
- the **basemap tiles** for the Site's area. `PRODUCT.md` says the map is Esri satellite imagery
  "fetched over the network", so without a pre-fetched tile cache the map is blank at a Site with
  no signal.

**How each stack stores it.**

- **PWA.** IndexedDB (optionally via [Dexie](https://dexie.org/docs/), a wrapper over "IndexedDB —
  the standard database in every browser", read 2026-09-27) holds records and the outbox;
  the service worker's Cache Storage holds the app shell and, if wanted, map tiles — a service
  worker "intercept[s] network requests" and caches responses so the app "behaves … when the
  network is not available" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API),
  read 2026-09-27). The existing planner already uses one browser store: the passphrase lives in
  `localStorage` (`web/lib/actions.ts:75,85`; the key it is stored under is `PASSPHRASE_KEY`,
  `web/lib/passphrase.ts:14`). Everything in `web/lib` is browser code already.
- **Expo / React Native.** `expo-sqlite` gives "a database that can be queried through a SQLite
  API. The database is persisted across restarts"; it exposes WAL, transactions, a key-value store
  and a `localStorage` shim ([Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite),
  read 2026-09-27). [WatermelonDB](https://watermelondb.dev/docs) (read 2026-09-27) is the
  offline-first alternative — "Offline-first. Sync with your own backend", SQLite-backed,
  React-observable — but it is a framework to adopt, not a few lines. Offline map tiles have no
  PWA-equivalent switch: MapLibre's React Native binding would replace the existing `maplibre-gl`
  (`web/components/MapPane.tsx:1-20`).
- **Native.** SwiftData/Core Data on iOS and Room/SQLite on Android: two implementations of one
  store, and the derivation rules in `web/lib/missionRecords.ts` and the Card rules in
  `web/lib/model.ts` must be re-implemented in Swift and in Kotlin, or shared through a Kotlin
  Multiplatform layer. Two copies of a state machine that ADR 0021 exists to keep single is the
  clearest drift risk of the three.

**How offline edits reach the store, and how conflicts resolve** (the parent map lists this as not
yet specified). Recommendation:

1. **The outbox replays actions, not files.** Each queued item is one operator action against one
   Mission id, posted to the same route the browser uses. Because the store mints one file per
   Mission (`web/lib/keys.ts`, `MISSIONS_PREFIX`), two actions on two Missions can never collide.
2. **Guard each write with the record's own `updated_at`.** `MissionRecord` already carries
   `updated_at` (`web/lib/missionRecords.ts`). Re-read before writing, the way `updateLedger`
   already re-reads and re-decides rather than clobbering (`web/lib/missionStore.ts:121-148`). On
   a mismatch, show both and let the operator choose — ADR 0021's "no silent failure" and its rule
   that the operator's answer wins.
3. **Accept that a replayed Dispatch can still be refused.** Dispatch reserves Cards against the
   shared Ledger (`web/lib/model.ts:121-161`, ADR 0022). Queued offline, it is an intent; on
   replay the store may answer "no Cards free", which is exactly the refusal ADR 0022 wants the
   operator to see while they can act on it. Withdraw likewise refuses if the skip list changed
   underneath it (`web/lib/missionStore.ts:162-182`). Surface these in the glossary's words, not as
   generic errors.
4. **One operator means last-write-wins per record is enough**, with the `updated_at` guard as the
   visible backstop. There is no multi-user merge problem to solve (`PRODUCT.md`: "One person …
   no other users and no roles").

**Stack verdict.** PWA wins on reuse and on the app shell/tiles/service-worker story; Expo is a
workable second because the domain logic is portable; Native pays twice.

### 2. USB and ADB access on Android

**Settled by #230, and not a differentiator.** The RC2 keeps the USB host role and exposes MTP
only; cabled directly and through an OTG adapter it "kept the USB host role and only charged the
phone" (`docs/adr/0016-mission-generation-and-loading-for-the-rc2.md:480-485`). iOS has no route at
all (`origin/research/phone-loads-rc2:docs/research/phone-loads-rc2.md`, read 2026-09-27). The chosen path is a small Linux board
with a USB-A host port cabled to the Controller, driven from the phone over Wi-Fi
(`docs/adr/0016-...:487-493`).

The consequence for this ticket is narrow and worth stating plainly: **all three stacks can drive
that board over HTTP or a WebSocket on the operator's hotspot.** Raw USB is only reachable from
Native and React Native (Android), and even there it buys nothing, because the RC2 will not yield
host role. A PWA cannot open a raw USB device, and does not need to. **This axis does not separate
the stacks.**

### 3. Push

Ticket [#232](https://github.com/Akamel01/drone-survey/issues/232) is the deep study of zero-spend
push; this section states only what the stack choice forces. (Cross-reference; not duplicated.)

- **PWA, installed.** Web Push is supported for Home Screen web apps on iOS and iPadOS 16.4+, and
  "You do not need to be a member of the Apple Developer Program to use it" — it rides the same
  APNs underneath ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
  read 2026-09-27). Two constraints: the app must have been added to the Home Screen, and the push
  permission request must follow "direct user interaction — such as tapping on a 'subscribe'
  button". On Android, Web Push works from Chrome and shows when installed. **Cost: zero.**
- **Expo / React Native.** `expo-notifications` abstracts FCM (Android) and APNs (iOS). But the
  setup guide says of iOS: "**A paid Apple Developer Account is required to generate
  credentials**" ([Expo](https://docs.expo.dev/push-notifications/push-notifications-setup), read
  2026-09-27). Android FCM is free. So this path breaks `PRODUCT.md`'s zero spend **on iOS alone**.
- **Capacitor.** The Push Notifications plugin routes through Firebase/APNs, and the guide states
  "To test push notifications on iOS, Apple requires that you have [a paid Apple Developer
  account]" ([Capacitor](https://capacitorjs.com/docs/guides/push-notifications-firebase), read
  2026-09-27). The wrapper does not escape the APNs account requirement.
- **Native.** The same APNs requirement, with more signing work.
- **Relay (ntfy-style).** A self-hosted relay can deliver to its own client app without the
  operator paying Apple; #232 covers the routes and limits. Stack consequence: if the operator
  accepts notifications arriving in *some* app rather than in this product, the stack choice
  stops mattering for push.

Note also App Store Guideline 4.5.4: "Push Notifications must not be required for the app to
function" ([Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
read 2026-09-27) — a constraint on any native build, not a problem for the PWA.

**Stack verdict.** If notifications must appear from this product with no money spent, **the PWA is
the only iOS option**; native/Expo/Capacitor force the USD 99/year.

### 4. Reuse of `web/lib`

`web/` is Next.js 16.3.5, React 19.2.8, TypeScript 5, with `maplibre-gl` as the only runtime
dependency (`web/package.json`). Concrete reuse per stack:

**Transfers unchanged to the PWA, and as source to Expo; must be re-implemented for Native:**

| Module | What it holds | Portability |
|---|---|---|
| `web/lib/model.ts` | Mission states, Card Ledger, reservation rules | Pure; no I/O |
| `web/lib/spec.ts` | `MissionSpec`, both gates, Site id and slug rules | Pure |
| `web/lib/keys.ts` | The whole store key layout | Pure |
| `web/lib/mission.ts` | Grid/orbit geometry and `preview()` | Pure |
| `web/lib/missionRecords.ts` | The one derivation of a Mission's state | Pure over plain data |
| `web/lib/missionView.ts` | Row reading and the glossary's words | Pure |
| `web/lib/missions.ts`, `aoi.ts`, `basemap.ts`, `hero.ts`, `notice.ts`, `sheet.ts`, `delivery.ts`, `actions.ts`, `passphrase.ts` | Manifest types, polygon ops, basemap choice, hero picks, notices, sheets, delivery maths, action state, passphrase storage | Pure or browser-only |

That is 15 of 19 non-test modules (`web/lib/*.ts`, test files excluded): the 15 that import no
Node builtin and use no `Buffer`, so they run unchanged in the browser. `model.ts` itself is
"no fetch, no storage, no React" by construction (`web/lib/model.ts:1-10`), which is why they are
reachable from any front end.

**Server-only (imports `node:crypto`/`Buffer`); the app modules must be replaced on a phone (all stacks):** `web/lib/b2.ts` (imports
`node:crypto`, uses `Buffer`, `web/lib/b2.ts:1,57,123,154`), `web/lib/auth.ts`
(`node:crypto` `timingSafeEqual`, `web/lib/auth.ts:1`), `web/lib/missionStore.ts` (imports
`b2.ts`), `web/lib/fakeStore.ts` (the in-memory store the API-route tests install under `fetch`,
`web/lib/fakeStore.ts:9`), and the API routes under `web/app/api/**`, which declare `export const runtime =
"nodejs"` and `preferredRegion = "yyz1"` (`web/app/api/missions/dispatch/route.ts:27-28`). On a
phone these are reached over HTTPS, not re-implemented.

**UI.** The React components total ~3,400 lines (`MapPane.tsx` 1,284; `Sidebar.tsx` 739;
`MissionList.tsx` 583; `SummaryBar.tsx` 247; `HeroScene.tsx` 285; `Notice.tsx` 144; `Sheet.tsx`
109), styled with CSS modules against `docs/ui-theme/spec.md`.

- **PWA:** all of it renders as-is.
- **Expo:** every component is rewritten in React Native primitives, and `maplibre-gl` is replaced
  by a React Native map binding. The CSS theme becomes a token layer.
- **Native:** SwiftUI and Compose implementations of the same screens, twice, with only the theme
  spec shared.

**Stack verdict.** PWA reuses everything; Expo reuses the rules and the theme but not the UI;
Native reuses neither the UI nor (without extra machinery) the rules.

### 5. Build and release effort

- **PWA.** The build already exists. A release is a deploy; the update path is the service worker
  lifecycle — a new worker installs in the background and activates when no page is still on the
  old one ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API), read
  2026-09-27). Installation on iOS is done from Safari's Share menu, Add to Home Screen
  ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), read
  2026-09-27). **No account, no review, no signing.** And because `PRODUCT.md` says "Clients never
  see this interface" and there is one operator, a store listing buys nothing.
- **Expo / React Native.** EAS Build or a local build; on iOS, installing on a device or
  TestFlight needs the paid program. A free Apple account gives a **Personal Team** with real
  limits: "You can register up to 10 App IDs, which expire after 7 days"; 3 devices; "Provisioning
  profiles that enable apps to be installed on a device will expire 7 days from issuance"
  ([Apple account overview](https://developer.apple.com/help/account/basics/about-your-developer-account),
  read 2026-09-27). TestFlight is not on the free row of Apple's own feature table (same page), and
  external testing goes through App Review ([TestFlight](https://developer.apple.com/testflight/),
  read 2026-09-27). Publishing risks Guideline 4.2 Minimum Functionality: "features, content, and
  UI that elevate it beyond a repackaged website"
  ([Apple Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), read
  2026-09-27) — this app does real planning offline, so it is defensible, but review is a cost.
  Android can sidestep the store by sideloading an APK, or pay USD 25 for Play.
- **Capacitor.** Same web build plus a native project per platform; distribution carries the same
  store accounts and reviews as Expo when published.
- **Native.** Two codebases, two signing stories, two reviews, TestFlight/internal testing —
  the most effort on every count.

### 6. Agent build and test

This is where the existing repo gives the PWA a structural advantage: Playwright is already a dev
dependency (`web/package.json:25`) and a repo script already drives the real UI headlessly —
`web/scripts/map-chrome-check.mjs:1-16` launches `chromium` from `playwright-core`, and its
comment documents the one-time `npx playwright-core install chromium`. An agent can therefore
exercise the phone UI, offline behaviour (Playwright can take the page offline) and service-worker
caching **in the repo it is already in**.

- **PWA:** Playwright (Chromium) headless on macOS and Linux CI; unit tests via the existing
  `node --test` runner (`web/package.json:10`). Cheapest loop, no emulator boot.
- **Expo / React Native:** Jest/React Native Testing Library for logic; [Maestro](https://docs.maestro.dev/)
  (read 2026-09-27) runs YAML flows against Android and iOS ("mobile and web UI automation") and
  has a CI story with GitHub Actions, with a hosted Maestro Cloud option; [Detox](https://wix.github.io/Detox/docs/introduction/getting-started)
  (read 2026-09-27) is the gray-box E2E framework that "test[s] your mobile app while it's running
  on a real device or simulator" and has a "Preparing for CI" guide. Expo's own push guide says
  push is testable "on an Android Emulator with Google Play services, or on an iOS Simulator running
  on Xcode 14 or later" ([Expo](https://docs.expo.dev/push-notifications/push-notifications-setup),
  read 2026-09-27). Cost: an Android SDK and Xcode on the agent machine, and emulator/simulator
  boots are heavier than a headless browser.
- **Native:** XCTest and XCUITest for iOS; Compose UI tests (instrumented, needing an emulator) or
  Robolectric for Android. Two toolchains, two test languages, and instrumented tests need a
  running device. Apple's simulator runs in "Device Hub … on your Mac" and "don't replicate the
  performance or features of a physical device"
  ([Xcode](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices),
  read 2026-09-27) — so a macOS agent can run it, but the maintenance surface is the largest.

**Stack verdict.** PWA wins; Expo is viable but adds a second toolchain; Native doubles it.

### 7. Zero spend

`PRODUCT.md` states "Software spend is approximately zero", and the operator is one person with no
roles. The verified current figures:

- **Apple Developer Program: "99 USD per membership year"**, prices varying by region
  ([Apple enroll](https://developer.apple.com/programs/enroll/), read 2026-09-27). Required for
  TestFlight and for iOS APNs push credentials (Expo and Capacitor above).
- **Google Play: "There is a US$25 one-time registration fee"** ([Play Console](https://support.google.com/googleplay/android-developer/answer/6112435),
  read 2026-09-27). Personal accounts created after 2023-11-13 also "must meet specific testing
  requirements before they can make their app available on Google Play", including verifying
  access to an Android device through the Play Console mobile app (same page).
- **PWA: no account, no fee.** The only recurring cost is the hosting already paid for (the
  Next.js deployment) and, if wanted, a domain.

Weighed against a product whose stated spend is approximately zero, the USD 99/year is not a small
line — it is the line. It also buys push and distribution the product does not strictly need,
since the operator is the only user and can install a web app from Safari in seconds.

**Stack verdict.** PWA. Native and Expo each break zero spend for iOS; Android alone could be free
by sideloading, but then the operator has only half an app.

## Per stack

### Installable PWA (no Capacitor needed for the three needs)

**Strengths.** All of `web/lib` and all UI reused; the phone talks to the existing API routes, so
no storage key ever leaves the server; IndexedDB + a service worker give offline records, outbox
and cached tiles; Web Push is the only zero-spend push on iOS; no signing, no review, no account;
Playwright already tests this repo headlessly; one deploy updates every installed home-screen app.

**Weaknesses.** iOS installation is a manual Safari step and Web Push on iOS requires that install
and a user-initiated subscribe; background execution is best-effort (see risks); a service worker
must be kept away from `/hero/v1/`, which `web/next.config.ts` deliberately serves with no
service worker in front; a regressed service worker can pin a stale app until it activates.

**When it wins.** Whenever the three needs are the whole story — which, after #230 and the Linux
board, they are.

### React Native with Expo

**Strengths.** Reuses the 15 pure `web/lib` modules as source; one codebase for both platforms;
`expo-sqlite` and WatermelonDB are mature offline stores; FCM Android push is free; a real native
app can be sideloaded on Android and shipped to iOS if the operator later pays; Expo's dev tooling
and Maestro/Detox cover agent testing.

**Weaknesses.** Every component and the map are rewritten; iOS push needs the USD 99/year; the
phone must still reach the API routes (same as the PWA) — so the native shell buys little the PWA
cannot already do; a second toolchain and emulator/simulator dependence in CI.

**When it wins.** If a native capability the PWA cannot reach turns out to be required — reliable
background notification handling beyond Web Push, a native map with packaged offline regions, or
store distribution for its own sake. Then Expo is the cheaper of the two native routes.

### Native (SwiftUI + Jetpack Compose)

**Strengths.** The most platform-faithful result — background modes, native maps, system
integrations; best performance and battery behaviour; no web runtime.

**Weaknesses.** Two codebases and two of every rule; the Mission state machine and Card rules in
`web/lib/model.ts` and `web/lib/missionRecords.ts` get a second and third implementation, inviting
the exact drift ADR 0021 removed; highest build/release/test cost; USD 99/year for iOS; App Review
4.2 applies.

**When it wins.** Only if the product later needs deep platform integration (background location,
ARKit, Watch) that neither the PWA nor Expo can supply — none of which the three stated needs
require.

## Recommendation per need

| Need | Recommendation |
|---|---|
| Offline at a Site | Build the phone app as an **installable PWA** over the existing Next.js planner. Add a manifest, a service worker that caches the app shell and the Site's map tiles, an IndexedDB outbox, and a replay path through the existing API routes; guard each Mission write with its `updated_at`. |
| Loading onto the RC2 | **No stack change.** Keep the Linux board as the Loader and drive it from the app over Wi-Fi; #230 settled this. |
| Push | **Web Push from the installed PWA** — the only zero-spend route that reaches iOS. If the operator accepts a separate client, an ntfy-style relay removes the install requirement, per #232. Do not build native push unless the operator decides to pay Apple. |
| Reuse of `web/lib` | **PWA reuses all of it.** If a native route is ever chosen, reuse the 15 pure modules verbatim in Expo; never re-implement the state machine by hand. |
| Build & release | **PWA:** no accounts, no review; install from Safari/Chrome; release by deploy. |
| Agent build/test | **Playwright on the existing repo** for the PWA; add Maestro only if an Expo build is ever adopted. |
| Store-account cost | **Zero.** Defer the Apple USD 99/year and Google USD 25 decisions to #233; the PWA path needs neither. |

## Overall recommendation

**Ship the phone experience as an installable PWA built from the existing Next.js planner, and
spend the native budget only if a named capability proves it necessary.**

Reasoning, in the order the ticket asks:

1. **Loading is off the table as a tie-breaker.** #230 removed the one need that would have
   forced a native shell, and left a Wi-Fi conversation with a Linux board that a web app is
   perfectly good at.
2. **Offline is a web problem with a good web answer.** IndexedDB, a service worker and a tile
   cache cover what a phone must keep; the domain rules that make those records meaningful are
   already pure TypeScript in `web/lib`.
3. **Push decides it.** Web Push on an installed iOS web app is the only route to a notification
   from this product that does not pay Apple. Native push is not better here; it is merely more
   expensive.
4. **Zero spend is a stated product constraint, not a preference.** The PWA honours it exactly;
   the alternatives each introduce the first recurring software cost the product has.
5. **The agent loop is the product's build method.** The repo already tests its own UI with
   Playwright; a PWA keeps building and testing inside one toolchain.

How this feeds the siblings: for **#233 (do we pay for store accounts?)**, this finding says the
decision can be deferred — nothing in the three needs requires a store account, and the only
purchase with any pull is the Apple USD 99/year, which is needed only for native iOS push. For
**#234 (which architecture?)**, the recommendation is the installable PWA, with Expo as the
recorded fallback and explicit triggers for revisiting: iOS Web Push proving unreliable in the
field; the operator wanting a packaged offline map region the service worker cannot hold; or a
decision to distribute through a store.

## What could break

| Risk | Where it bites | Mitigation / note |
|---|---|---|
| iOS Web Push needs the web app installed, and the permission must follow a tap | Push simply never arrives if the operator has not added it to the Home Screen | Show an in-app "Add to Home Screen, then enable notifications" step; WebKit, read 2026-09-27 |
| iOS evicts IndexedDB / Cache Storage under pressure | Offline records or the outbox could be cleared | **Unverified** — no primary source read. Keep the outbox small, flush when online, warn before clearing. |
| Background flush is Chromium-only | The outbox only drains while the app is foregrounded on iOS | Design the outbox to flush on foreground; treat Background Sync as an enhancement. **INFERRED** from the API surface MDN lists (it names Background Sync separately and not as universally present), read 2026-09-27 |
| Service worker must not intercept `/hero/v1/` | Hero video range requests break | `web/next.config.ts` already serves those with no service worker in front; scope the worker to exclude that path |
| A stale service worker pins an old app | Operator keeps an older planner | MDN's activate-when-idle lifecycle; add a visible "update ready" notice |
| Offline Dispatch replayed into no free Cards | A queued Dispatch is refused after reconnect | This is ADR 0022 working as intended; announce it in the glossary's words so the operator can withdraw or fly something |
| The API routes are unreachable offline | Every store action fails until signal returns | The outbox is the answer; never let a failed action look like success |
| Map tiles may not be cacheable in bulk | No offline basemap | Esri's terms for pre-caching satellite tiles were **not verified**; check before relying on it |
| Native/Expo on iOS costs USD 99/year | Breaks `PRODUCT.md` zero spend | Do not adopt without deciding #233 |
| A native shell re-implements the state machine | Drift from `web/lib/model.ts` | If Expo is ever adopted, import the pure modules rather than porting them |
| App Review 4.2 (repackaged website) | A future native build could be rejected | The PWA path avoids review entirely; Apple Review Guidelines, read 2026-09-27 |

## Could not verify

- **Android emulator in CI.** `developer.android.com/studio/run/emulator` and its `.md` form both
  timed out from this environment (attempted 2026-09-27), so the claim that an Android emulator
  can be driven headless on a CI runner is **INFERRED**, not sourced.
- **iOS Safari storage eviction.** No primary source was read on whether, and at what threshold,
  Safari clears IndexedDB, Cache Storage or service-worker registrations for a home-screen web
  app. The risk row above is deliberately marked unverified.
- **Background Sync / Periodic Background Sync in Safari.** MDN lists these APIs but not their
  Safari availability in the pages read (2026-09-27); the outbox design assumes foreground flush
  rather than relying on either.
- **Esri offline-caching terms.** `PRODUCT.md` names Esri satellite imagery and OpenStreetMap as
  alternatives, but this run did not read Esri's terms on pre-fetching tiles for offline use.
- **Whether `next` in this repo can register a service worker as configured.** `web/next.config.ts`
  is minimal (a `Cache-Control` header rule only); no `output`, no PWA plugin, no existing
  manifest or service worker was found. The PWA recommendation assumes one can be added; the
  mechanism was not proven in this repo.
- **Whether Expo Go (not a development build) can receive iOS push without the paid account.** The
  Expo setup guide directs the reader to EAS Build and a paid account; the non-EAS path
  (`local-app-development`) was linked but not read (2026-09-27). This does not change the
  conclusion, because iOS APNs credentials require the paid account either way.
- **Play's specific personal-account test-count and duration** ("12 testers for 14 days" is widely
  quoted) — the page read states only that testing requirements exist (read 2026-09-27).
- **ntfy's exact delivery path on iOS.** Left to #232 rather than duplicated here.

## Sources

All web sources read 2026-09-27.

Primary (vendor / specification / framework):

- Apple, *Become a member* — https://developer.apple.com/programs/enroll/ (USD 99 per membership year)
- Apple, *Developer account overview* — https://developer.apple.com/help/account/basics/about-your-developer-account (Personal Team limits; TestFlight requires membership)
- Apple, *TestFlight* — https://developer.apple.com/testflight/ (internal/external testing)
- Apple, *App Review Guidelines* — https://developer.apple.com/app-store/review/guidelines/ (4.2 Minimum Functionality; 4.5.4 push)
- Apple, *Running your app on simulated or physical devices* — https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices.md (Device Hub; simulator caveats)
- Google, *Get started with Play Console* — https://support.google.com/googleplay/android-developer/answer/6112435 (USD 25 one-time; personal-account testing requirements)
- WebKit, *Web Push for Web Apps on iOS and iPadOS* — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (iOS 16.4+; no Apple Developer Program needed)
- Dash/Apple, *Expo push notifications setup* — https://docs.expo.dev/push-notifications/push-notifications-setup (paid Apple account required; simulator/emulator limits)
- Expo, *Expo SQLite* — https://docs.expo.dev/versions/latest/sdk/sqlite (persisted SQLite, WAL, kv-store)
- Capacitor, *Cross-platform Native Runtime for Web Apps* — https://capacitorjs.com/docs
- Capacitor, *Push Notifications – Firebase* — https://capacitorjs.com/docs/guides/push-notifications-firebase (paid Apple account required on iOS)
- MDN, *Service Worker API* — https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API (offline caching, lifecycle, push)
- Maestro, *Documentation* — https://docs.maestro.dev/ (mobile + web UI automation, CI)
- Detox, *Getting Started* — https://wix.github.io/Detox/docs/introduction/getting-started (React Native E2E, CI guide)
- WatermelonDB, *Check out the README* — https://watermelondb.dev/docs (offline-first SQLite)
- Dexie, *Documentation* — https://dexie.org/docs/ (IndexedDB wrapper)

Repo documents and code read 2026-09-27:

- `PRODUCT.md`; `CONTEXT.md`; `web/package.json`; `web/tsconfig.json`; `web/next.config.ts`
- `web/lib/model.ts`, `spec.ts`, `keys.ts`, `mission.ts`, `missionRecords.ts`, `missionView.ts`,
  `missions.ts`, `b2.ts`, `auth.ts`, `missionStore.ts`, `passphrase.ts`, `actions.ts`
- `web/components/MapPane.tsx`, `Sidebar.tsx`, `MissionList.tsx`, `SummaryBar.tsx`, `HeroScene.tsx`
- `web/app/api/missions/dispatch/route.ts`, `web/app/api/specs/route.ts`
- `web/scripts/map-chrome-check.mjs`
- `docs/adr/0016-mission-generation-and-loading-for-the-rc2.md` (loading, USB, Linux board)
- `docs/adr/0017-mission-specs-through-object-storage-in-canada.md` (B2 Canada, key scopes)
- `docs/adr/0019-mission-status-through-the-store.md` (manifest through the store)
- `docs/adr/0021-one-mission-one-lifecycle-in-the-store.md` (one lifecycle; browser storage rejected)
- `docs/adr/0022-cards-are-reserved-at-dispatch.md` (Card reservation)
- `origin/research/phone-loads-rc2:docs/research/phone-loads-rc2.md` (settled #230)
- Tickets #229, #230, #231, #232, #233, #234 (via `gh issue view`, read-only, 2026-09-27)

Unfetched, recorded: `developer.android.com/studio/run/emulator` (timed out, 2026-09-27);
`usb.org` specification pages are behind adopter agreements and were not needed here, the USB facts
being settled in `origin/research/phone-loads-rc2:docs/research/phone-loads-rc2.md`.
