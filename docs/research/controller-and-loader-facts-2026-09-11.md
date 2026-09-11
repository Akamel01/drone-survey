# Controller and mission-loader facts (2026-09-11)

Research for a solo Canadian drone-survey business flying a DJI Mini 5 Pro on a DJI RC2,
loading computer-generated waypoint missions by overwriting the mission file inside a
placeholder mission's folder. Primary sources (DJI manuals/support/GitHub, vendor docs)
preferred; forum threads marked as such; no YouTube; Reddit skipped (login wall).

## Direct answers

1. **RC2 storage access.** DJI does not publish the RC2's exact Android version in any
   source found (confirmed nowhere; see "Could not verify"). The waypoint folder is
   `Internal storage/Android/data/dji.go.v5/files/waypoint/` — package name is
   **`dji.go.v5`** (no `com.` prefix), confirmed by APKPure/mi9 APK listings and multiple
   forum/tool docs. It **is** visible and writable over MTP from a computer on current
   firmware for most users, but this is inconsistent: multiple forum reports say Windows
   MTP treats the folder as hidden or fails to show it, while Android File Transfer on
   Mac, another Android device, or ADB works reliably. Each mission is a GUID-named
   subfolder containing a `<guid>.kmz` file (WPML format inside the KMZ, not raw KML) with
   a same-named `.jpg` preview kept in a sibling `map_preview` folder. No separate
   mission-list database file was documented in any source; DJI Fly v1.17.0+ added
   optional cloud sync of missions (off in the US) as an alternative discovery path
   ([dronexl.co](https://dronexl.co/2025/05/15/dji-fly-app-and-rc-2-firmware-update/), inference
   from version-history search). Confirmed reports exist of updates hiding/breaking the
   folder: forum reports name **DJI Fly v1.18.2** as making the folder disappear
   ([Litchi Forum](https://forum.flylitchi.com/t/waypoint-folder-is-no-longer-visible-on-my-rc-2/27453)),
   and a separate RC2 firmware/app update deleted saved waypoint missions, later fixed in
   **RC2 firmware v1.17.1** ([mavicpilots.com](https://mavicpilots.com/threads/missing-waypoint-missions-after-update.151741/) — forum-reported).

2. **Update control.** No source (including DJI's own support content) documents an
   in-app way to defer or pin DJI Fly app or RC2/aircraft firmware updates indefinitely;
   forum consensus is that skipping an aircraft update is possible but an RC/controller
   update prompt can recur and some aircraft may refuse to arm until updated (forum-reported,
   not independently confirmed against an official DJI statement). Firmware **downgrade**
   is possible only via DJI Assistant 2 to a version below what's installed; the RC2
   specifically was reported by users as difficult/unsupported to downgrade
   ([XDA Forums](https://xdaforums.com/t/dji-rc2-firmware-downgrade-or-swap-from-another-rc2.4666995/) — forum-reported).
   DJI Fly has changed the waypoint feature multiple times across 2025–2026: v1.17.0
   (~May 2025) added cross-controller cloud sync of missions; v1.18.0 (~Sept 2025) added
   Mini 5 Pro support; v1.20.0 (~March 2026) added Avata 360; v1.21.0 added Lito 1/Lito X1
   support — none of these release notes were readable in full text (PDF fetch failed),
   so version numbers/dates come from secondary summaries and should be treated as
   approximate.

3. **RC-N series with a phone.** On Android 11–15, `Android/data/<package>/` is hidden
   from other **apps** by scoped storage (introduced Android 10/11) but remains reachable
   by the phone's own Files app, by ADB, and by MTP from a computer — the restriction is
   app-to-app, not device-to-computer
   ([developer.android.com](https://developer.android.com/about/versions/11/privacy/storage),
   [source.android.com](https://source.android.com/docs/core/storage/scoped)). In practice
   forum users still report per-device/per-OEM MTP flakiness. iPhone is reported possible
   for at least one tool (MavenBridge, via iCloud Drive per one forum-derived description)
   but the mechanism is not officially documented and no primary Apple/DJI source confirms
   direct filesystem access — treat "iPhone works" as vendor marketing/inference, not
   confirmed. Third-party tools supporting RC-N + phone setups: **Litchi Mission
   (Hub) Bridge** (auto-detects a connected device, lists/overwrites waypoint flights;
   [litchiutilities.com](https://www.litchiutilities.com/docs/import.php)), **MavenBridge**
   (desktop app for RC2/RC Pro/RC Pro 2/Android/iOS,
   [mavenpilot.com/mavenbridge](https://www.mavenpilot.com/mavenbridge/)), **WaypointMap**
   (web planner, exports KMZ, documents RC-N1/N2/N3 workflow,
   [waypointmap.com](https://www.waypointmap.com/Home/Tutorial)), and **FlyPath** (QGIS
   plugin exporting native WPML KMZ, replace-only workflow requiring a placeholder mission,
   [github.com/dronnix-io/FlyPath](https://github.com/dronnix-io/FlyPath)).

4. **Mobile SDK v5 and the Mini 5 Pro (as of Sept 2026).** Not supported. Three separate
   open GitHub issues ask for Mini 5 Pro support in `dji-sdk/Mobile-SDK-Android-V5`
   — [#630](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/630),
   [#692](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/692) (opened Jan 12,
   2026), and [#810](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/810) — none
   have any DJI maintainer response, label, or linked PR as of the fetch date. RC2 SDK
   support is likewise unresolved: [issue #539](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/539)
   (opened April 2025, asking whether MSDK 5.14.0 works with the RC2) has zero replies.
   No evidence found of any change to RC2's SDK-support status.

5. **PilotByte's Waypoint OS.** Made by **Pilotbyte**, explicitly "Not affiliated with or
   endorsed by DJI." Free, no tiers, licensed for commercial use "on day one" with "no
   'personal only' restrictions," conditioned on holding a valid FAA Part 107 or
   equivalent certificate ([pilotbyte.com/waypoint-os](https://www.pilotbyte.com/waypoint-os)).
   Supports Mini 4 Pro, Mini 5 Pro, Air 3, Air 3S, Mavic 3, Mavic 3 Classic, Mavic 3 Pro,
   Mavic 4 Pro, with new drones added as free-update profiles. It is a native desktop
   GUI app (Windows/macOS, code-signed and notarized on Mac) distributed via
   [github.com/Pilotbyte-Master/waypointos-releases](https://github.com/Pilotbyte-Master/waypointos-releases)
   (binaries only, no source); **no command-line, headless, or API mode is documented
   anywhere** in the product page or release README. The product page's loading
   instructions are generic ("export a DJI-compatible KMZ file, transfer it to your
   controller, load the mission in DJI Fly") — it does **not** publish an exact RC2 file
   path or naming convention.

6. **Mission waypoint/action limits.** Per DJI's own support article, DJI Fly's Waypoint
   Flight mode allows **up to 200 waypoints per mission**
   ([support.dji.com](https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en)),
   listed as applicable to Air 3, Air 3S, Mavic 3/3 Classic/3 Pro, Mavic 4 Pro (and
   variants), Mini 5 Pro, and Lito X1. That article does not state a numeric cap on
   actions per waypoint or per mission; no other source found gives one either — treat
   any per-waypoint action-count limit as unconfirmed.

---

## 1. RC2 storage access

- **Android version:** not found in any DJI, forum, or teardown source searched (RC2
  spec pages, release-notes PDF metadata, XDA threads). DJI's product pages describe the
  RC2 only as having an "Android-based" integrated screen without a version number.
- **Folder path and package name:** `Android/data/dji.go.v5/files/waypoint/` — the
  package is `dji.go.v5`, confirmed via the DJI Fly APK's own package identifier as
  listed on [APKPure](https://apkpure.com/dji-fly/dji.go.v5) and
  [mi9.com](https://mi9.com/package/dji.go.v5), and independently corroborated by forum
  and vendor-tool documentation
  ([mavicpilots.com](https://mavicpilots.com/threads/how-to-access-waypoint-folder-on-rc-rc2-from-windows.149588/),
  [litchiutilities.com](https://www.litchiutilities.com/docs/import.php)). No source used
  `com.dji.go.v5`.
- **MTP visibility/writability:** Reports are mixed. The DJI-Mission-Installer tool
  explicitly documents the RC2 as MTP-only (no official ADB support) and states MTP
  "requires no special setup but can sometimes be slower"
  ([github.com/MjosDrone/DJI-Mission-Installer](https://github.com/MjosDrone/DJI-Mission-Installer)).
  Separately, forum threads report the waypoint directory being effectively hidden over
  Windows MTP for some users, while Android File Transfer on macOS or a second Android
  device sees it fine (forum-reported,
  [mavicpilots.com](https://mavicpilots.com/threads/how-to-access-waypoint-folder-on-rc-rc2-from-windows.149588/)).
- **GUID folder contents:** each waypoint mission folder is named with a GUID/UUID; inside
  is a single `<guid>.kmz` file (DJI's WPML-format mission data zipped as KMZ, distinct
  from generic Google Earth KML), and a same-named `.jpg` thumbnail kept in a sibling
  `waypoint/map_preview/` folder, not inside the mission's own folder
  ([litchiutilities.com](https://www.litchiutilities.com/docs/import.php),
  corroborated by [gist.github.com/probonopd](https://gist.github.com/probonopd/329f85964eee9e48b0354016face681f)
  reverse-engineering notes on the Mini 4 Pro/DJI Fly format). No separate mission-list
  database file (e.g., SQLite) was documented in any source checked. DJI Fly v1.17.0
  reportedly added optional cloud upload/sync of waypoint missions, disabled in the US
  ([dronexl.co](https://dronexl.co/2025/05/15/dji-fly-app-and-rc-2-firmware-update/) — this
  is an inference stitched from a secondary summary, not a directly quoted DJI release
  note; treat as unconfirmed detail).
- **Update breakage reports:**
  - Litchi Forum thread "Waypoint folder is no longer visible on my RC 2" attributes the
    change to DJI software **v1.18.2**
    ([forum.flylitchi.com](https://forum.flylitchi.com/t/waypoint-folder-is-no-longer-visible-on-my-rc-2/27453) — forum-reported).
  - mavicpilots.com "Waypoints folder is lost (RC2)" and "Missing Waypoint Mission's After
    Update" threads report a Mavic 4 Pro-era update disabling cloud waypoint storage in
    the US and causing app malfunction, with **RC2 firmware v1.17.1** cited as the fix for
    a related "flight plan disappearing" bug
    ([mavicpilots.com/threads/waypoints-folder-is-lost-rc2.153350](https://mavicpilots.com/threads/waypoints-folder-is-lost-rc2.153350/),
    [mavicpilots.com/threads/missing-waypoint-missions-after-update.151741](https://mavicpilots.com/threads/missing-waypoint-missions-after-update.151741/) — both forum-reported).

## 2. Update control

- No official DJI documentation found describing a setting to defer or permanently pin
  DJI Fly app or RC2/aircraft firmware updates. DJI's own support content frames updates
  as effectively mandatory for continued operation: "DJI products stop working if they
  are not updated with the latest software" per DJI's update-troubleshooting guidance
  (paraphrased from [support.dji.com](https://support.dji.com/help/content?customId=en-us03400006835&spaceId=34&re=US&lang=en) search summary — the exact wording could not be independently re-verified against the live page in this session).
- Forum consensus (not an official DJI statement) is that a controller/RC firmware update
  prompt can sometimes be skipped once, with the drone still flying but possibly missing
  features or showing persistent warnings; some models reportedly refuse to arm without
  the update (forum-reported, unsourced to a specific thread beyond aggregated search
  summaries — flagged for follow-up).
- Firmware downgrade is possible only through DJI Assistant 2, and only to a version
  older than what is currently installed; the RC2 was reported as difficult or
  unsupported to downgrade by users attempting it
  ([xdaforums.com](https://xdaforums.com/t/dji-rc2-firmware-downgrade-or-swap-from-another-rc2.4666995/) — forum-reported; the page itself returned 403 to automated fetch, so this rests on the search-result summary only, not a direct read).
- Waypoint-feature version churn found in DJI Fly 2025–2026 (from secondary
  summaries/search results, not confirmed against full DJI release-note text since the
  official PDF could not be parsed):
  - v1.17.0 (~May 2025): cross-controller cloud sync of waypoint missions.
  - v1.18.0 (~Sept 2025): Mini 5 Pro aircraft support added.
  - v1.20.0 (~March 2026): Avata 360 support.
  - v1.21.0: Lito 1 / Lito X1 support.
  These are app-level aircraft/feature additions, not necessarily changes to the waypoint
  file format itself — the report distinguishes this because no source confirmed or
  denied a WPML/KMZ schema change across these versions.

## 3. RC-N series with a phone, as an alternative

- **Scoped storage mechanics (Android 11–15):** `Android/data/<package>/` and
  `Android/obb/` are blocked from third-party **app** access starting Android 11, but
  remain accessible via the device's own Files app, ADB, or MTP to a connected computer
  — this is Google's documented behavior, not a per-OEM quirk
  ([developer.android.com/about/versions/11/privacy/storage](https://developer.android.com/about/versions/11/privacy/storage),
  [source.android.com/docs/core/storage/scoped](https://source.android.com/docs/core/storage/scoped)).
  In practice, forum threads (e.g. "Best Android Device For Litchi Mission Bridge Waypoint
  File Import Into DJI Fly") report real-world compatibility varying by device/OEM, with
  at least one tablet (Samsung Galaxy Tab S7-FE) throwing errors on import
  ([mavicpilots.com](https://mavicpilots.com/threads/best-android-device-for-litchi-mission-bridge-waypoint-file-import-into-dji-fly.156623/) — forum-reported).
- **iPhone:** No primary Apple or DJI source confirms direct filesystem/MTP access to an
  iOS app sandbox (iOS has no equivalent of MTP file browsing into app-private storage).
  MavenBridge's own marketing lists "iPhone and iPad running DJI Fly" as supported
  ([mavenpilot.com/mavenbridge](https://www.mavenpilot.com/mavenbridge/)), and one
  secondary description attributes this to an iCloud Drive-based transfer mechanism, but
  this is vendor-stated, not independently verified — flagged as inference/vendor-claim,
  not confirmed fact.
- **Third-party tool support for RC-N/phone setups:**
  - **Litchi Mission (Hub) Bridge** — companion desktop app to Litchi Hub; detects a
    connected device and lists/overwrites waypoint flights automatically
    ([litchiutilities.com/docs/import.php](https://www.litchiutilities.com/docs/import.php)).
  - **MavenBridge** — free desktop tool (Win/Mac) supporting DJI RC2, RC Pro, RC Pro 2,
    Android, and iOS/iPadOS running DJI Fly; can also pull missions off a device for
    reuse elsewhere ([mavenpilot.com/mavenbridge](https://www.mavenpilot.com/mavenbridge/)).
  - **WaypointMap** — free web-based mission planner exporting KMZ; documents workflows
    for RC-N1/RC-N2/RC-N3 as well as RC2/iPhone-via-KMZ-only paths
    ([waypointmap.com/Home/Tutorial](https://www.waypointmap.com/Home/Tutorial)). Built
    and run by a single named individual (a YouTube creator), per its own about content
    — noted as a smaller, less institutional vendor than the others.
  - **FlyPath** — open-source QGIS plugin exporting native DJI WPML KMZ files for 2D
    orthomosaic mapping; explicitly documents the placeholder-mission requirement ("can
    only replace a mission that already exists on the RC and cannot create a brand-new
    one... create it in DJI Fly first, even a 3-point dummy, then Auto Detect RC")
    ([github.com/dronnix-io/FlyPath](https://github.com/dronnix-io/FlyPath),
    [plugins.qgis.org/plugins/FlyPath](https://plugins.qgis.org/plugins/FlyPath/)).

## 4. DJI Mobile SDK v5 and the Mini 5 Pro (as of September 2026)

- The Mini 5 Pro is **not** listed as supported in Mobile SDK V5 as of this research.
  Three open, unanswered GitHub issues request it:
  - [#630](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/630) "Mini 5 Pro support"
  - [#692](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/692) "Mini 5 Pro Support" —
    opened Jan 12, 2026 by a third-party developer asking to add support; zero comments,
    no labels, no milestone, no linked PR as of fetch.
  - [#810](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/810) "Mini 5 Pro / Lito 1
    / Lito X1 support"
- RC2 SDK support is separately unresolved: [issue #539](https://github.com/dji-sdk/Mobile-SDK-Android-V5/issues/539)
  ("MSDK 5.14.0 - Does it support DJI RC 2?", opened April 2025) has no replies from DJI
  or anyone else. No source found documents any change — positive or negative — to the
  RC2's historical lack of Mobile SDK support.
- The DJI SDK Forum's own "What devices does Mobile SDK V5 support" article sits behind
  DJI's Zendesk login wall and could not be fetched in this session
  ([sdk-forum.dji.net](https://sdk-forum.dji.net/hc/en-us/articles/25552010279961-What-devices-does-Mobile-SDK-V5-support) — redirects to an auth-gated Zendesk login); its content is not represented above and should be treated as unread.

## 5. PilotByte's "Waypoint OS"

- **Maker:** Pilotbyte. The product page states "Not affiliated with or endorsed by DJI."
- **Licence/terms:** Free, "lifetime," no tiers/upsells/expiration stated. Explicitly
  "Licensed for commercial use on day one. No 'personal only' restrictions," but the page
  conditions use on holding "a valid FAA Part 107 certificate (or equivalent in your
  jurisdiction)" — relevant to a Canadian operator as "or equivalent" (i.e., a Transport
  Canada Pilot Certificate), though the page does not name Canada specifically
  ([pilotbyte.com/waypoint-os](https://www.pilotbyte.com/waypoint-os)).
- **Supported drones:** Mini 4 Pro, Mini 5 Pro, Air 3, Air 3S, Mavic 3, Mavic 3 Classic,
  Mavic 3 Pro, Mavic 4 Pro. Page states new drones with waypoint support are added as
  free-update profiles over time.
- **Update history:** No version numbers or changelog on the marketing page. Actual
  binaries are distributed from
  [github.com/Pilotbyte-Master/waypointos-releases](https://github.com/Pilotbyte-Master/waypointos-releases),
  a binaries-only repo (no source) hosting versioned installers named
  `WaypointOS-<version>-[arm64/x64].[dmg/exe]` for Windows and macOS (Intel/Apple
  Silicon); macOS builds are code-signed and notarized. The app is stated to
  self-check this repo for updates. No dated release history was found (the README
  documents the mechanism, not a log of past versions).
- **Command-line/headless/API:** None documented anywhere found — product page and
  release README both describe it strictly as a GUI desktop app ("A real desktop
  application that runs entirely on your machine").
- **RC2 loading guide path/naming:** The product page gives only a generic instruction —
  "export a DJI-compatible KMZ file. Transfer it to your controller, load the mission in
  DJI Fly" — with **no specific file path or file-naming convention published** for the
  RC2. (For contrast, the general DJI Fly convention documented by other vendors, e.g.
  Litchi and DJI-Mission-Installer, is `Android/data/dji.go.v5/files/waypoint/<guid>/<guid>.kmz`
  matching an existing placeholder mission's GUID — Waypoint OS's own docs do not restate
  this.)

## 6. Mission waypoint and action limits in DJI Fly

- DJI's own support article "Introduction to Waypoint Flight Mode of DJI Fly" states:
  "You can pin up to **200 waypoints**" per mission
  ([support.dji.com](https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en&documentType=artical&paperDocType=paper)).
  The article lists applicable aircraft as Air 3, Air 3S, Mavic 3 Classic, Mavic 3,
  Mavic 4 Pro, Mavic 3 Cine, Mavic 3 Pro Cine, Mavic 4 Pro 512GB, Mavic 3 Pro, **Mini 5
  Pro**, and Lito X1 — notably, Mini 4 Pro was not named in the fetched excerpt of this
  particular article version, though other DJI/vendor sources (droneblog.com, pix-pro.com)
  independently describe waypoint missions on the Mini 4 Pro, so the omission is likely
  an artifact of the fetch/excerpt rather than an actual restriction — flagged for
  verification against the live article.
  Other parameters in the same article: speed 0.1–15.0 m/s (default 2.5 m/s, with
  per-model global caps — e.g. Mini 4 Pro/Air 3 capped at 12 m/s, Mavic 4 Pro at 15 m/s),
  hover time 0–30 s per waypoint (default 0 s), and a requirement that the current
  position be within 10 km of the mission's starting waypoint to begin.
  **No numeric limit on actions per waypoint or per mission is stated in this article.**
- A separate, older DJI GS Pro FAQ describes a **99-waypoint** cap with automatic
  mission-splitting into 99-waypoint groups for larger plans
  ([dji.com/ground-station-pro/faq](https://www.dji.com/ground-station-pro/faq) via search
  summary) — this applies to the older **GS Pro / DJI Pilot** app family, not DJI Fly, and
  should not be conflated with the 200-waypoint DJI Fly figure above. Listed here only to
  flag the discrepancy for anyone cross-referencing older DJI documentation.

## Could not verify

- **Exact Android version on the RC2** (11, 12, 13, or otherwise) — not stated by DJI,
  and no teardown/root source found gave a definitive number.
- **A per-waypoint or per-mission action-count limit in DJI Fly** — no source, primary or
  secondary, states a number; may simply not be documented publicly.
- **Whether DJI Fly blocks flight entirely (vs. restricting features) until an update is
  installed** — search summaries suggest a spectrum of behavior (skip-once vs. hard
  block vs. feature restriction) but no single authoritative DJI statement was retrieved
  describing current (Sept 2026) enforcement precisely.
- **The mechanism by which MavenBridge accesses an iPhone/iPad's DJI Fly waypoint data**
  — vendor claims iOS support; no technical explanation from a primary source was found,
  and iOS's app-sandbox model makes unmediated file access unlikely without some
  DJI-Fly-side export/iCloud step the vendor doesn't document.
  Not independently confirmed.
- **Full, verbatim DJI Fly release notes for 2025–2026** — the official RC2 release-notes
  PDFs could not be parsed as text by the tools available in this session (binary/PDF
  stream content only); all version/date claims for v1.17.0–v1.21.0 above rest on search
  engine summaries of secondary sites, not a direct read of DJI's own changelog.
- **DJI SDK Forum's official "What devices does Mobile SDK V5 support" article** — blocked
  by a login wall (Zendesk auth redirect); content not reviewed.
- **Exact wording of DJI's mandatory-update policy statement** — paraphrased from a
  search-result summary of support.dji.com content, not confirmed against the live page
  text.
- Several mavicpilots.com thread pages returned HTTP 403 to automated fetch (anti-bot
  protection); those threads are represented above only via search-engine snippet
  summaries, not full text — treat direct quotes attributed to them as approximate.
