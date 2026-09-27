# Planner field-workflow benchmark

How the leading drone mission planners walk an operator from a Site to a Flown
Mission in the field — steps/taps, phone area drawing, offline behaviour,
sunlight-and-gloves, and sourced operator sentiment — assembled from the M1–M3
evidence partials for `github:#225`, with the five patterns most worth taking
for `github:#228`.

Vocabulary follows `CONTEXT.md` (Site:23, Mission:80, Mission Spec:86, Card:100,
Controller:120, Load:134, Dispatch:138, Collect:143, Mission State:149). Each
planner's flow is framed with the repo verbs — Site → draw area → Dispatch/plan →
Collect/Load → Flown — and no competitor UI tile is called a "card".

## Method and limits

- **Channels used.** Vendor manuals/help centres and blogs (DJI support,
  `help.dronedeploy.com`, `support.dronelink.com`, `support.pix4d.com`, `flylitchi.com`,
  `manuals-ugcs.sphengineering.com`, `ardupilot.org`, `docs.qgroundcontrol.com`,
  `support.dronesmadeeasy.com`, `droneharmony.com`, `hammermissions.com`); GitHub project
  docs (`ArduPilot/ardupilot_wiki`, `mavlink/qgroundcontrol`); DJI/vendor YouTube; user
  forums and issue trackers (`mavicpilots.com`, `forum.flylitchi.com`,
  `discuss.ardupilot.org`, `community.pix4d.com`, `community.opendronemap.org`); app-store
  listings/reviews via web-search excerpts. Repo loader facts are reused, not re-derived:
  `docs/research/mission-planning-automation-2026.md:12,36,38-44`,
  `docs/research/controller-and-loader-facts-2026-09-11.md:10-98`,
  `docs/research/battery-swap-resume-2026.md:52,58`.
- **Date-read convention.** Every external source was read on **2026-09-27** unless the
  page carries its own publication date, which is then given.
- **Reddit — blocked, recorded verbatim.** Direct fetch is blocked from this host.
  `curl -sI https://old.reddit.com` returned `HTTP/2 302` with header
  `location: https://old.reddit.com/login/?reason=lor2&dest=https%3A%2F%2Fold.reddit.com%2F`
  (server `snooserv`, date `Sun, 27 Sep 2026 07:08:25 GMT`). A direct `webfetch` of a
  Reddit thread body returned only the string `Reddit` (JS/login shell). Web search **did**
  surface Reddit thread excerpts; those are used only where the material is labelled
  **community-reported**, and no Reddit thread is cited as a read source.
- **App stores.** No direct app-store *review feed* was reachable as a fetch target this
  run; Apple/Google listing and review pages were reachable only via web-search excerpts, so
  store sentiment below is quoted and labelled **community-reported**, never as a
  directly-read feed.
- **Vendor 403s.** Prior passes recorded 403s on `support.dronelink.com`
  (`docs/research/mission-specification-schemas-2026.md:120`) and on DroneDeploy help
  (`docs/research/mission-parameters-and-verification-2026.md:56,197`). This run's direct
  fetches of `help.dronedeploy.com` and `support.dronelink.com` succeeded (HTTP 200, full
  article bodies), so those 403s are recorded as intermittent/environment-specific, not
  permanent.
- **How INFERRED / best-evidence counts are made.** No vendor publishes a literal tap/step
  count for any planner here. Where a cell carries a number it is marked **INFERRED** with
  its method inline ("counted from the named tutorial/vendor page, read 2026-09-27", or
  "counted from the N numbered vendor steps + one tap per vertex"); where no defensible
  number exists the cell reads **not published**. No bare guess is presented as fact.
- **"Mission on the controller" caveat.** For the phone/tablet planners (DroneDeploy,
  Dronelink, Pix4Dcapture, Hammer, Map Pilot Pro) the Mission executes from the app tethered
  to the Controller via the DJI/MAVLink link rather than replacing a Placeholder Mission with
  a generated KMZ, so there is **no separate Load step in the repo sense** (`CONTEXT.md:134`);
  the "steps" column counts app-cold → a Mission armed and flying, **except where a cell says
  otherwise** (Map Pilot Pro starts at "area drawn"; DJI Fly counts a consumer point-to-point
  waypoint route, not a survey grid — see the next bullet). Only the DJI Fly/RC2 path
  and the Litchi/Mission-Planning hand-offs use the repo's KMZ-replacement Load mechanism.
- **Counts are not like-for-like — do not rank rows on the raw numbers.** There is no controlled
  benchmark here: each row's number is best-evidence **INFERRED** from that vendor's own
  documented procedure and the start point differs between rows. Most rows count app-cold → a
  Mission armed and flying, but **Map Pilot Pro's ≈3–5 counts only "area drawn → go"**, omitting
  the boundary drawing and pre-flight the other rows include, and **DJI Fly's number counts its
  consumer point-to-point waypoint route, not a survey-area grid**. The column shows what each
  vendor documents; it is not an apples-to-apples speed figure.
- **Sentiment labelling.** Forum, YouTube and app-store sentiment is labelled
  **community-reported**. Documented capability gaps (e.g. "DJI Fly does not support KML
  import") are vendor statements, not sentiment, and are labelled as such.

## Comparison table

Exact 8 columns, in order. Cell source refs resolve in §Sources; M3's `[S#]` tags are used
as written in the table and listed under "Power / MAVLink planners".

| Planner | Platform | Steps/taps from nothing to a Mission on the controller (start point differs by row — see Method and limits; not a like-for-like ranking) | Area drawing on a phone | Offline behaviour | Sunlight & gloves | Operator praise/hate (sourced) | Sources |
|---|---|---|---|---|---|---|---|
| **DJI Pilot 2** | DJI enterprise controller app; runs **only on controllers with a built-in screen** — RC Pro Enterprise (5.5", 1000 nits; Mavic 3E), RC Plus (7.02", 1200 nits; M30/M300/M350), RC Plus 2 (7", 1400 nits; Matrice 4). "DJI Pilot 2 can only be used on remote controllers with a built-in screen... cannot be installed separately" (heliguy). | **Plan is made on the same Controller that flies it — there is no separate Dispatch/Collect/Load hop.** Site → draw area → plan → Save; the Mission is on the Controller at Save. Two routes: **(A) draw on the controller** — Flight Route → `+` → Create a Route → Area Route → pan/zoom to the Site → tap the boundary to draw a polygon → tap the check mark → select aircraft/camera → name + altitude + overlap + speed → Save (Propeller lists 10 numbered steps; the Pilot 2 eBook lists steps 2–14). **(B) import from desktop** — draw a polygon in Google Earth → export KML → copy to microSD/USB → Flight Route → Import Route (KMZ/KML) → choose Area Route → edit → Save (Propeller; UgCS manual lists 8 steps). **INFERRED** ~20–30 taps for a default nadir mission, Route A (counted from the Propeller 10-step list + one tap per polygon vertex + each settings field); **not published** by DJI. | **No — Pilot 2 does not run on a phone.** Area drawing is done on the controller touchscreen, or with a Bluetooth/USB mouse plugged into the controller (**community-reported**). The import path lets the polygon be drawn on a desktop instead. | Offline Map Download exists (Map Settings); historically "awful... only tiny areas can be downloaded at a time", later improved with a drag-box (**community-reported**, mavicpilots). Custom offline raster layers importable as MBTiles/MapTiler from an SD card (DJI Trust Center; Hosticka YouTube). Restricted Network Mode / Local Data Mode can sever the internet link. Planning needs a loaded or cached basemap. | Screens: 1000 / 1200 / 1400 nits (vendor specs). RC Plus reviewers call it sunlight-readable without a hood (**community-reported**; `dronesreports.com` could not be re-fetched this run — transport error — so this rests on the earlier read). Touchscreen (10-point); **no DJI glove guidance found** — a controller **mitt** over the screen is the common cold-weather workaround and touchscreen gloves are unreliable on DJI touch controllers (**community-reported**). | Praise: direct on-controller planning, "dead simple to use", capable for large mapping jobs (**community-reported**, Reddit r/UAVmapping). Hate: "Planning mapping missions on DJI Pilot 2 is, frankly, a pain in the arse. Small screen, big fingers" → users plug in a mouse (**community-reported**, Reddit); offline maps poor (mavicpilots); **no AGL** — only ALT/ASL (mavicpilots); one Mission cannot hold multiple areas (Reddit); KML import throws "invalid format"/"task type error" until re-saved via geojson.io (Reddit). | heliguy; Propeller linear+oblique+import; anyflip Pilot 2 guide; UgCS route-export; DJI Trust Center privacy controls; Hosticka offline-map; dronesreports RC Plus; mavicpilots 149282 / 151966; Reddit r/UAVmapping snippets |
| **DJI Fly — Waypoint Flight mode (RC2)** | DJI Fly app on the DJI RC2 (Android, 5.5", 700 nits) or a phone/tablet via the RC-N series. Consumer path; **no survey planner**. | **Two methods, both on the Controller — again no separate Dispatch/Collect/Load.** **(1) Plan offline/at home** — power RC2 → Connection Guide → select drone → Camera View → tap map to full screen → Waypoint icon → tap once per waypoint → (optional) POIs/link → list/page icon → Save (Smog On The Line YouTube; DroneXL). **(2) In-flight record** — take off → Waypoint icon → fly to the point → press **C1** to pin (or tap `+`) → repeat → global speed → Next → GO (DJI support article; VicVideoPic). **INFERRED** ~9 setup taps + 1 tap per waypoint + Save, method (1) (counted from the Smog On The Line walkthrough); **not published**. This counts the **consumer point-to-point waypoint route only** — it has no area; for a survey grid the Mission Spec comes from a third party and the repo's Load mechanism applies, and that arm's tap count is **not published**: create a placeholder, replace `Android/data/dji.go.v5/files/waypoint/<GUID>/<GUID>.kmz` over MTP, reopen in DJI Fly (`mission-planning-automation-2026.md:38-44`; `controller-and-loader-facts-2026-09-11.md:18-27`). | **No area drawing at all** — DJI Fly has no survey polygon and no grid; point-to-point waypoints only (Pixpro: native waypoints "does not provide a survey grid with controlled overlap"). On the RC2 (phone-sized screen) you tap-to-place waypoints on the map but cannot draw an area. | Waypoints can be planned on the map **without the aircraft connected** (DJI support article). Caveat: the **first** waypoint mission on a given device needs the complete powered-up setup, then later offline editing works (**community-reported**, mavicpilots/forum.flylitchi). Offline map download is limited to tiny patches (**community-reported**). **No KML import** (DJI support article). | RC2 screen is **700 nits** constant (DJI RC2 manual). Community: adequate but dimmer than phones/RC Pro; glare needs a sunhood and matte protector (**community-reported**). Gloves: touchscreen gloves "don't work" on the RC2 for at least one user (**community-reported**, Reddit r/dji); a fleece controller mitt with a clear window is the sold workaround. | Praise (**vendor-sourced** — DJI support article/tutorials): free; plan "from the comfort of your own home" with the drone off; cross-device sync via the server, v1.17.0, **except the United States** (DJI support article). Hate (**community-reported**): 700 nits is dim vs phones (mavicpilots); offline maps tiny (Reddit r/dji); no KML import; **curved paths make grids unusable** (mavicpilots "Flying a grid..."); RC2 freezes/crashes on ~100–200 waypoint missions (mavicpilots); no AGL; no export/backup pre-1.17.0. Documented capability gaps and the v1.17.0 server-sync statement are vendor facts, not operator sentiment. | DJI Fly Waypoint support article; DJI RC2 manual; Pixpro Fly guide; DroneXL tutorial; Smog On The Line YouTube; VicVideoPic; mavicpilots 133443 / 145945 / 140288 / 144438 / 149599; Reddit r/dji snippets; repo `file:line` above |
| **DroneDeploy** | iOS 16+/iPadOS 16+ app "DroneDeploy Flight App" and Android app; also runs on supported RCs (M3E, Matrice 4E/T). | App-cold to armed Mission: New Project (5 vendor steps) + FLY tab → `+` → select plan type → edit boundary → pre-flight checklist → Start flight. **INFERRED ~10–15 taps + boundary drawing**, counted from the numbered steps in `help.dronedeploy.com` "Creating a new project using the Mobile Flight App" (5 steps) and "Mobile app flight planning" (2 groups) plus the checklist→Start flow. Apple listing markets "just two taps" from an existing plan (marketing claim, not the from-nothing count). | Tap-and-drag the white boundary points; a single tap on a point deletes it; grey `+` dots add angles; the template auto-saves on release; Undo button (`help.dronedeploy.com` "Mobile app flight planning"). | "Make Available Offline" toggle stores the map base layer on device or RC; up to **10** base maps; must fully sync; only **Standard Map Plans**; not on desktop/laptop; "Turn off Automatic Settings" first; 6 numbered steps (`help.dronedeploy.com` "Offline Flight Planning", dated 2026-04-01). | **Not published** for gloved/touch or glare. **INFERRED:** a glass touchscreen app; no glove or high-contrast mode documented. Universal tablet-glare problem is **community-reported** (`mavicpilots.com` glare threads). | **community-reported.** App Store 4.6 / 258 ratings; TrustRadius 9.2 / 7 reviews (praise: easy, polished, great support; cons: expensive, GCP/area editing slow). Reddit + mavicpilots: iOS more reliable than Android; one pilot "having to tap the checklist and start flight buttons 50 thousand times"; "DD can lock out your remote…". | help.dronedeploy.com Mobile app flight planning; Offline Flight Planning; Creating a new project (Mobile Flight App); apps.apple.com/gb/app/dronedeploy-flight-app/id971358101; trustradius.com/products/dronedeploy; Reddit r/DroneDeploy (search excerpt); mavicpilots "Question on Tablets" |
| **Dronelink** | iOS 15.6+/iPadOS, iPod, Mac (Apple silicon), visionOS; Android on Google Play. Free with in-app purchases (Starter/Basic/Premium/Elite/Growth). | Basic Mapping = **6 named vendor steps** (Add Map → boundary → direction → camera/altitude → start location → overlaps/speed), plus app install, sign-up/login and drone connect. Field alternative: **Map on-the-fly** (mark the boundary in the field). **INFERRED ≥6 taps + drawing** after setup, counted from `support.dronelink.com` "Basic Mapping – Map Mission Component Intro". | Create menu → Map → select a location; move/add boundary points with `+`; drag the Rotate Flight Direction control; drag the Map Start pin. Map on-the-fly: "mark the boundary points" directly in the field (`support.dronelink.com`). | **Two conflicting vendor statements — reported, not resolved.** (a) "Limited support": download the plan for offline use while online, **cannot create new mission plans offline**, **no offline maps**, no web offline mode; cloud sync needs an online device. (b) The vendor also documents **Map on-the-fly** ("a Map can be generated in the field … mark the boundary points") and On-the-Fly Waypoints. Which applies to which tier/version is not stated; community reports say mapping planning needs connectivity (opendronemap.org). | **Not published.** **INFERRED:** glass touchscreen; on-phone planning reported cramped/tedious → tablet recommended; no glove mode documented. | **community-reported.** App Store **4.7 / 558** ratings; Google Play **4.0 / 1.86K**. Praise: powerful, flight-simulation preview, active support (<24h) (**community-reported**); "in just a few clicks" is **vendor** App-Store listing copy. Hate: "Exciting concept, terrible UX"; "overwhelming amount of options"; phone planning "pretty shitty"; "likes to crash"; must be online to plan; paywalls (maps gated to Elite ~$99–$119/yr). | support.dronelink.com Basic Mapping; Offline Support; Can I use Dronelink while offline; Map On-the-fly; How do I synchronize…; apps.apple.com/us/app/dronelink-flight/id1451684056; play.google.com com.dronelink.dronelink; geonadir.com/dronelink-review; community.opendronemap.org/t/dronelink-any-good/15803; Reddit r/UAVmapping excerpts |
| **Litchi** (mobile flight app + Litchi Hub) | Android + iOS phone/tablet app ("also available for DJI monitors") [S2]; web planner **Litchi Hub** in a browser [S3]. Drives the aircraft over the DJI SDK on a connected Controller; the SDK-unsupported RC2 is handled by a Hub → DJI-Fly KMZ hand-off, not by the app [S1][S5]. | Vendor documents the sequence, not a count: open app → Flight Mode icon → "Waypoint" → tap the map to add waypoints or use the drawing-tool pencil → Mission Settings → **Save**; to fly: Play → pre-flight report → Start [S1]. Hub exports KMZ for the RC2 path [S5]. **INFERRED** ≈8–10 taps from nothing to a saved, flight-ready Mission on a connected device — counted from the documented sequence at `flylitchi.com/help`; **not published** as a number; no count exists for the closed RC2 hand-off. | **Partial.** Path drawing on the phone map via the drawing tool [S1]. **No native polygon/AOI grid**; gridded area missions need a CSV/KMZ imported from an external generator [S4]. | Planning works with no aircraft connection ("Missions can be planned anywhere, you do not need to be connected to the aircraft") [S1]. The **"Above Ground"** altitude mode **requires internet** (Google elevation data) [S1]. | **not published** — no vendor or forum statement found this run. | **community-reported.** Hate: no built-in polygon/grid planner (forum sends users to an external grid tool) [S4]; no automatic resume across a battery change — pilots note the last waypoint by eye [S7:52,58]. Praise: vendor marketing only ("most trusted autonomous flight app… 5000+ daily flights") [S2], not independent operator sentiment. | S1 S2 S3 S4 S5 S6 S7 |
| **Pix4Dcapture** (legacy + Pro) — **retired** | iOS and Android app. Legacy PIX4Dcapture retired **Oct 2023**; PIX4Dcapture Pro + Mission Planner retired **31 Jul 2025** and **removed from the App Store and Google Play**. | Vendor/3rd-party procedure: New plan → choose mission type (Grid/Double Grid/Circular/Polygon/Free Flight) → draw polygon → settings → save → camera settings → Start. **INFERRED ~8–10 taps + polygon drawing**, counted from the 6 numbered steps in Arboair "Flight mission planner – Pix4D Android/iOS". | Tap to place a polygon; drag green vertex dots; `+` to add a point; drag one vertex onto another to remove it; press a line and rotate to change flight-line direction (surveydrones.ie Pix4dscan mission-types PDF; Arboair guides). | "You don't need an internet connection to fly your drone, but it's better to plan a mission when you have internet access so all the basemaps can be loaded." After EOL: offline maps, terrain awareness and DEM **unavailable**; basemap service discontinued (pix4d.com blog "prepare drone flight"; support.pix4d.com EOL notice). | **Not published.** **INFERRED:** same glass touchscreen constraint; the app is dead so no current glove/glare support. | **community-reported.** Retired for "safety reasons" with the basemap removed — a vendor statement, not sentiment. Forum: Pix4D users hedging between Capture Pro and DJI Pilot 2 on Mavic 3E; Arboair recommends DJI Ground Station Pro on iPad instead. | support.pix4d.com 360047701131; support.pix4d.com important-update-regarding-pix4dcapture-pro; community.pix4d.com/t/33685; pix4d.com/blog/prepare-drone-flight-pix4dcapture; knowledge.arboair.com/article/144 (Android) & /110 (iOS); surveydrones.ie Pix4dscan-Mission-types PDF; mavicpilots thread 139559 |
| **UgCS** | **Desktop** ground station (Windows; manual lists Windows 10 / Windows 11\* 64-bit requirements) — "professional UAV **desktop** flight planning software" [S8][S10][S11]. Companion **UgCS for DJI** Android app (iOS build also documented) uploads/flies only [S8][S12]. No phone planner. | Desktop algorithm, not taps: select a tool on the route toolbar → **draw a figure on the map** → change parameters in the tool inspector → optionally add actions → connect/upload [S8]. Field-with-only-RC path: pre-save routes to the RC beforehand and fly with the RC alone, but you then **cannot change the route** and telemetry is **not recorded** [S9]. | **No** — route/area figures are drawn on the **desktop** map; the mobile app only uploads and flies pre-planned missions, plus manual flight [S8][S12]. | Offline map saving; "Flying offline"; an offline route function exists for **Android and iOS** [S9]. Once uploaded, a pre-planned flight "is not required to connect a laptop during the flight in the field" (vendor reply) [S12]. Planning itself is desktop. | **not published.** | **community-reported** (Google Play). Praise: a geologist calls it "the most versatile mission planner for the geologist studying outcrops" (constant height above ground from a DEM) [S12]. Hate: a 2019 reviewer — "I have to connect this app to a laptop during flight… should be able to plan and edit straight from the app"; vendor replied that flying pre-planned needs no laptop [S12]. | S8 S9 S10 S11 S12 |
| **Hammer Missions** (extra — clearly phone-first, citable) | Android app distributed as a direct per-drone APK for DJI smart controllers (Hammer Flights Ltd); no live iOS App Store listing. Two-part product: **Hammer Hub** (cloud/desktop planner) + **Hammer App** (field execution). | Plan in Hammer Hub (cloud) or directly in the App, then sync to device; the App has a mission store, pre-flight checklist, simulator, undo/redo. **Not published** as a tap count; **INFERRED** as multi-step (Hub plan → sync → field open → pre-flight → execute), from hammermissions.com/product + the offline article. | Grid / double-grid mapping; **fly-to-draw** for precise planning when distances are unknown (e.g. tower/facade height); "draw obstacles to go around" (hammermissions.com product + offline post). | "Developed … to operate in offline mode"; once map + mission are cached you can change parameters and **plan a new mission** offline; offline terrain-follow needs a custom DEM/DSM GeoTIFF; "connectionless mode — once a planned mission has been uploaded to the drone, no further connection is necessary" (hammermissions.com/post/drone-flight-planning-offline). | **Not published.** **INFERRED:** same glass touchscreen; no vendor glove/glare statement found. | **community-reported / vendor.** Former App Store rating, low-volume (~4.x / 58 ratings; the listing is no longer live), with a review asking "Hammer for Android" (now shipped). Vendor claims "snappy user interface", unlimited waypoints, in-built simulator. No substantive independent operator-hate thread found. | hammermissions.com/apk; hammermissions.com/product; hammermissions.com/post/drone-flight-planning-offline; hammermissions.com/post/hammer-missions-on-android |
| **Map Pilot Pro** | iOS (App Store) + Android (Google Play); also CrystalSky/embedded DJI remotes via APK; a "companion app" to the Maps Made Easy processing service [S27][S29][S30]. | "Define the area, select the level of detail, and go" — "Map Pilot handles the rest" [S30]. Features include Save Missions, Multi-Battery Management, Manual Restart Point Selection [S27][S29]. **INFERRED** ≈3–5 taps **from area drawn** (area → detail → go) — counted from the documented flow at `support.dronesmadeeasy.com`; **not published** as a number, and **not like-for-like** with the app-cold rows above (see Method and limits). | **Yes** — the area is defined by tap/drag on the tablet/phone ("Define the area, select the level of detail, and go") [S30][S27]. | "Basemap Caching for Offline Operations"; Save Mission "packs up… a version of the basemap that is available offline for field operation"; "Fully Offline Capable Terrain Awareness" — once terrain data is downloaded it is available for offline flight planning [S27][S30][S31]. | **not published.** | **community-reported** (App Store; 4.6/5). Praise: "BEST DRONE 3D MAPPING APP"; "extremely easy to use and get results fast in the field" [S28]. Hate: a DJI Fly export for a Mavic 3 Classic put "all the routes… aligned along the same line and not over the polygon"; a detailed report of failed auto-capture and RTH landing ~ten feet off [S27][S28]. | S27 S28 S29 S30 S31 |
| **QGroundControl** (MAVLink-native) | **Cross-platform, single codebase:** Android + iOS mobile, and Windows/Linux/macOS desktop; "The QGC UI targets itself more towards a **tablet+touch** style of UI"; Android 9+ APK [S21][S25]. Area drawing can be **phone/tablet or desktop** [S22]. | Open **Plan View** → **Plan Tools** → **Pattern Tool** → **Survey** → drag the polygon vertices (touch or mouse) → configure camera/transects → save/upload [S22]. When planning offline, set the vehicle type first so the right mission items are available [S23]. No published tap count. | **Yes** — the Survey pattern draws a polygonal area with draggable vertices; touch-first UI [S22][S21]. | **Offline Maps** caches tiles for a location ("Add New Set… drag to the area of interest… Download"); and you can plan a Mission with no vehicle connected (set vehicle type first) [S24][S23]. | **not published.** | **community-reported** (GitHub). Issue #9495 "terrain checker fails pretty often on large missions", with a developer fix and a re-test of large surveys (300/700/1000 waypoints) under terrain following [S26]. | S21 S22 S23 S24 S25 S26 |

### Where they are fastest

The ticket asks where these planners are fastest. No single numeric ranking is defensible — the
counts differ in start point (see *Counts are not like-for-like* above) — so the answer is
qualitative and read only from the rows already in the table:

- **Fastest for a full survey, on the Controller:** DJI Pilot 2 — it plans a controlled-overlap
  area route on the same Controller that flies it, with no Dispatch/Collect/Load hop.
  DJI Fly is faster only for point-to-point consumer routes; it has no survey grid.
- **Fastest from an area, phone-first:** Map Pilot Pro documents the shortest drawn-area → ready
  flow ("Define the area, select the level of detail, and go"), but its `≈3–5` starts at "area
  drawn", so it cannot be compared head-to-head with the app-cold rows — its app-cold cost is
  not published.
- **Fastest with no connectivity:** Hammer Missions (plan a new Mission fully offline, plus
  fly-to-draw) and Dronelink Map-on-the-fly are the only documented fresh-mission-with-no-
  connection paths; the speed there is not being blocked, not a tap count.
- **Behind in the field:** UgCS plans on desktop only, and Pix4Dcapture is retired; Litchi,
  DroneDeploy and Dronelink reach area coverage through external tools, paywalls or a full sync.

These are orderings of each vendor's documented procedure, not a measured race.

## Per-planner notes

### DJI Pilot 2

- **The key structural fact for #228:** Pilot 2 collapses the repo's
  Site → draw area → Dispatch/plan → Collect/Load chain into **one on-controller app**.
  The area is drawn (or imported) and flown on the same Controller; there is no file
  hand-off, no placeholder Mission, no MTP `Load` step. The repo's Load mechanism
  (`mission-planning-automation-2026.md:38-44`) exists precisely because DJI Fly lacks
  this; Pilot 2 does not need it.
- **Import is the desktop escape hatch.** A polygon drawn in Google Earth (or a UgCS-exported
  WPML KMZ) can be imported as an Area Route — the closest Pilot 2 gets to a "Dispatch from
  another machine" (Propeller import steps; UgCS route-export). Import reliability is the weak
  point: users hit "invalid format"/"task type error" until the KML is re-normalised through
  geojson.io or re-exported from Google Earth (**community-reported**, Reddit r/UAVmapping).
- **Offline.** Documented enterprise offline controls exist (Local Data Mode, offline map
  import via MBTiles/MapTiler from SD — DJI Trust Center), but the built-in Offline Map
  Download was widely criticised as too small until a later drag-box improvement
  (**community-reported**, mavicpilots thread 149282). Airteam/Propeller both tell operators to
  connect the controller to Wi-Fi/hotspot first so base maps load.
- **Sunlight/gloves.** Brightest screens in the DJI fleet (1200–1400 nits on RC Plus/RC Plus 2)
  and reviewers report clear sunlight reading; gloves are unaddressed by DJI for any touch
  controller, and the field answer is a controller mitt.
- **Area/route types.** Area Route (grid/mapping), Linear Route (corridor), Waypoint (manual),
  plus Smart Oblique — so Pilot 2 *does* do controlled-overlap survey planning, unlike DJI Fly
  (Propeller 3D guide; BAAM waypoint guide).
- **Hate to bank.** Small-screen polygon drawing is the recurring complaint; the shared
  workaround is plugging a mouse into the controller (**community-reported**, Reddit
  r/UAVmapping).

### DJI Fly — Waypoint Flight mode (RC2)

- **No area drawing, no grid, no KML import.** The support article is explicit: waypoints are
  pinned by flying (Fn/C1) or by tapping the map, up to 200 per route; "DJI Fly does not support
  KML flight route import." Pixpro confirms there is no controlled-overlap survey grid. This is
  why the repo needs a third party for the Mission Spec and the MTP `Load` hack.
- **Offline planning is real but conditional.** The article says you can plan on the map without
  the aircraft connected; community reports add that the **first** mission on a device must be
  created while connected, and that offline map downloads are tiny (mavicpilots 145945 / 140288;
  forum.flylitchi 20379 — **community-reported**).
- **The route the repo depends on.** For a grid, the third-party Mission Spec is written to the
  placeholder folder over MTP and reopened in DJI Fly (`mission-planning-automation-2026.md:38-44`);
  Pilot 2 has no equivalent placeholder/Load concept, which is the cleanest single contrast
  between the two DJI surfaces.
- **Curved paths are a survey killer.** DJI Fly flies Bézier/Catmull-Rom curves through waypoints
  with no straight-line option in-app; a grid flown this way bows and loses overlap
  (**community-reported**, mavicpilots 133443; forum.flylitchi 25646 for the WPML straight-line
  nuance).
- **Stability ceiling.** Pilots report RC2 freezes/crashes around 100–200 heavily-weighted
  waypoints; DJI reportedly calls 200 a guideline depending on per-waypoint action load
  (**community-reported**, mavicpilots 144438; forum.flylitchi 25646). Useful field-friction
  evidence for #228.
- **Sunlight/gloves.** RC2's 700 nits is documented; the community split is that it holds 700
  nits without dimming (unlike phones that throttle) but is still dimmer and glossier than a
  bright phone, so hoods/matte protectors are standard. Touchscreen gloves are reported
  unreliable; mitts are the workaround (**community-reported**).

### DroneDeploy

- **Field flow mapped to repo verbs:** the Site is an app "project"; you **draw area** by
  dragging the white boundary points; there is no Dispatch/Collect in the repo sense — the plan
  syncs to the tablet and the Mission is **armed and Flown** from the app. "Make Available
  Offline" is the closest analogue to Collect (pull the plan + basemap onto the device before
  leaving coverage).
- **From-nothing path (vendor-numbered, INFERRED total):** app-cold → New Project (enter
  address/GPS → "Create Project Here" → name + CRS → Continue; 5 numbered steps) → FLY tab →
  `+` → pick plan type → edit boundary → pre-flight checklist → Start flight. The Apple
  listing's "just two taps" refers to re-flying a saved template, not the from-nothing path.
- **Offline is recent and gated:** the article is dated 2026-04-01 and requires "Automatic
  Settings" off, a full sync, and is capped at 10 base maps; only **Standard Map Plans** can be
  made available offline. This is a field-friction point another planner could beat.
- **Sentiment:** the app-store picture (4.6, 258 ratings; TrustRadius 9.2) is positive; the
  forum/Reddit picture is sharper — Android instability, a slow support loop, and remote-lockup
  reports. Both are **community-reported**.

### Dronelink

- **The one app with a genuine field-only path:** besides the 6-step cloud/web Basic Mapping
  flow, Dronelink documents **Map on-the-fly** ("a Map can be generated in the field … mark the
  boundary points") and **On-the-Fly Waypoints** (fly the drone manually to mark points and
  generate a waypoint Mission). This is the closest competitor analogue to a field-first
  planner.
- **Its own offline article contradicts the field-first framing.** The vendor states "You will
  no longer be able Create new mission plans … offline" and "the mobile app does not currently
  support downloading maps for offline use", while also documenting Map on-the-fly. **Both
  claims are presented; they conflict, and the conflict is not resolved here** — which tier or
  version each applies to is not stated. Community reports echo that mapping planning needs
  connectivity (opendronemap.org, geonadir).
- **Workflow friction:** every field-funnel step is a paywall boundary — Basic covers 6 steps;
  grid pattern/oblique needs Advanced; terrain-follow/heading needs Expert; mapping itself needs
  Elite (~$99–$119/yr). The phone UX takes the most community criticism of the tablet planners
  ("terrible UX", "overwhelming amount of options", tablet recommended over phone).

### Litchi

- Two planners: the mobile **flight app** (Waypoint engine; also plans on-device) and the web
  **Litchi Hub** (successor to the older "Legacy Mission Hub"). The vendor guide still documents
  both [S1]. Hub recently added area-relevant components — "Area Height" for rooftops/raised
  surfaces, and a **Shape** flight component that imports an SVG and turns it into a waypoint
  path [S3] (confirmed via a web-search excerpt of `hub.flylitchi.com`; a direct fetch this
  run returned only the JS app shell — HTTP 200, no feature keywords — so the citation rests
  on that search excerpt, read 2026-09-27).
- The RC2 path is a **hand-off, not an integration**: plan in Hub → **Export KMZ** → copy onto
  the Controller; the forum's own step-by-step guide has the operator create a 2-waypoint
  placeholder in DJI Fly, export from Hub, then load it [S5]. (This is the KMZ-replacement
  mechanism already documented at `docs/research/mission-planning-automation-2026.md:12`.)
- Planning offline is normal ("Missions can be planned anywhere… you do not need to be connected
  to the aircraft") but **"Above Ground" altitude needs internet** for Google elevation data [S1].
- The drawing tool creates a **path**, not an area; gridded/area coverage is done outside the app
  (a forum answer sends the operator through a polygon tool, CSV export and import) [S4].
- Battery-change friction: no automatic resume; pilots note the last waypoint by eye [S7:52,58].
- **Naming caveat:** the work order says "Litchi (Cruise + Hub)", but the vendor user guide
  documents **no flight mode called "Cruise"**; the nearest thing is the Waypoint setting
  "Cruising Speed" [S1], and the app's modes are Waypoint, Orbit, Focus, Follow, Track, Panorama,
  VR and FPV [S1][S2]. This doc therefore treats "Cruise" as the Litchi mobile flight app (its
  Waypoint engine) and "Hub" as Litchi Hub.

### Pix4Dcapture

- **Headline fact:** the planner is **dead**. Legacy PIX4Dcapture was retired Oct 2023;
  PIX4Dcapture Pro + Mission Planner retired 31 Jul 2025 and were removed from both app stores;
  the vendor advises against continued use "for safety reasons" and the basemap service is
  discontinued. Pix4D now positions its software as acquisition-app-agnostic and points
  elsewhere for capture.
- **Consequence for #228:** Pix4Dcapture is a **historical reference**, not a live competitor to
  beat on field workflow. Its documented grid/double-grid draw-and-tune interaction (drag
  vertices, `+` to add, drag-to-merge to remove, rotate flight lines) is still a clean, minimal
  phone pattern worth noting.
- **Offline:** pre-EOL it worked offline for flying but wanted internet at planning time to load
  basemaps; post-EOL offline maps/terrain/DEM are gone.

### UgCS

- Editing is **desktop-only**. The field path is deliberately narrow: pre-save to the RC and fly
  with the RC alone, at the cost of no editing and no telemetry logging [S9]. The route toolbar
  is a "select tool → draw figure → set parameters → add actions" loop [S8].
- DJI lists UgCS as "professional UAV **desktop** flight planning software… creation and
  execution of automated drone flights even in areas with complex terrain", with KML/CSV import
  and custom DEMs [S11].
- Terrain is the differentiator operators cite: constant height above ground from the default
  online DEM or an uploaded DEM, and routes that parallel outcrops at different heights [S12].

### Hammer Missions (extra planner)

- **Why it qualifies as "clearly phone-first":** the field work happens in a native Android
  app with offline caching; it is explicitly built to plan *in the app* offline, and it is the
  only planner in this set that documents **planning a new Mission with no connection at all**
  plus **fly-to-draw** for height/geometry you cannot judge from a map tile. That is exactly the
  `github:#228` axis.
- **Caveat:** it is a two-part Hub+App product (so a desktop step is optional but offered), and
  it has less independent forum sentiment than the other planners — its evidence is mostly
  vendor-published. Included because it is citable from the vendor's own app-download page and
  a first-party offline-features article.

### Map Pilot Pro

- Phone/tablet-first area mapping: "Define the area, select the level of detail, and go" [S30].
  Offline is a headline feature: basemap caching, an offline copy of the basemap packed into a
  saved Mission, and terrain-aware planning that works offline once terrain tiles are downloaded
  [S27][S30][S31].
- Sentiment is mixed on the **DJI Fly hand-off**: a reviewer reports a Mavic 3 Classic export
  collapsing all routes onto one line instead of over the polygon [S27].

### QGroundControl

- The one MAVLink GCS here that is genuinely **touch-first**: "The QGC UI targets itself more
  towards a tablet+touch style of UI than a desktop mouse-based UI" [S21]; it ships Android and
  iOS builds as well as desktop [S25].
- Survey polygon lives inside a survey "complex item" on the mission list; vertices are dragged,
  with `+` to insert [S22]. Pattern set includes Survey, Corridor Scan, Structure Scan and
  landing patterns [S23].
- Offline: tile cache via **Offline Maps** [S24]; offline planning is supported but the vehicle
  type must be chosen first [S23].

## The five patterns most worth taking

Ranked by their impact on `github:#228` (weight 2 of `github:#224`): the pattern that most
changes how fast and how frictionlessly a Site becomes a Flown Mission ranks first. #228's
question itself is not decided here; each pattern only states what the evidence shows.

This list ranks on **workflow speed** only. #224's weight-1 sunlight/readable-in-sunlight and
one-handed evidence belongs to sibling `github:#226` and is not re-derived here. The five
patterns are drawn from the sources reachable this run — largely vendor documentation and help
centres — so the ordering reflects reachable evidence, not independent operator sentiment.

1. **Create a new Mission fully offline, including a fresh area.** The strongest field
   differentiator. Hammer Missions "can change parameters and plan a new mission" offline once
   the map and mission are cached, and supports offline terrain-follow with a custom DEM
   (hammermissions.com/post/drone-flight-planning-offline, read 2026-09-27); Map Pilot Pro packs
   an offline basemap copy into a saved Mission and offers "Fully Offline Capable Terrain
   Awareness" (support.dronesmadeeasy.com Terrain Awareness; Map Pilot for DJI – Introduction);
   QGroundControl caches tiles via Offline Maps and plans with no vehicle connected (docs
   qgroundcontrol Maps; Plan View). Counter-evidence for what to avoid: Dronelink documents
   "cannot create new mission plans offline" and "no offline maps" (support.dronelink.com
   Offline Support; Can I use Dronelink while offline), and DroneDeploy's offline is gated to
   Standard Map Plans, capped at 10 base maps, and needs a full sync
   (help.dronedeploy.com Offline Flight Planning, dated 2026-04-01).
2. **Direct-manipulation area drawing built for a thumb, not a mouse.** Pix4Dcapture's documented
   interaction — tap to place a polygon, drag green vertex dots, `+` to add a point, drag one
   vertex onto another to remove it, rotate the flight-line direction by pressing a line
   (surveydrones.ie Pix4dscan mission-types PDF; knowledge.arboair.com/article/144) — and
   DroneDeploy's tap-drag boundary with single-tap delete and grey `+` angle handles
   (help.dronedeploy.com Mobile app flight planning) are the cleanest minimal touch patterns;
   Map Pilot Pro reduces it to "define the area, select the level of detail, and go"
   (support.dronesmadeeasy.com). QGroundControl drags survey vertices with a touch-first UI
   (docs qgroundcontrol pattern_survey). The counter-evidence is DJI Pilot 2's on-controller
   drawing, criticised as "small screen, big fingers" with a mouse as the workaround
   (**community-reported**, Reddit r/UAVmapping).
3. **Collapse Dispatch → Collect → Load by planning on the Controller that flies it.** DJI Pilot 2
   is the only planner here that needs no file hand-off at all: Site → draw area → plan → Save,
   and the Mission is on the Controller (Propeller linear/oblique/import guides; anyflip Pilot 2
   guide). Its import route (Google Earth KML → Import Route → Area Route, UgCS route-export;
   Propeller import guide) is the nearest thing to a remote Dispatch. This is the direct
   alternative to the repo's MTP KMZ-replacement Load mechanism
   (`mission-planning-automation-2026.md:38-44`).
4. **Generate the Mission by flying it (fly-to-draw).** For geometry you cannot judge from a map
   tile (tower/facade height), Hammer Missions documents **fly-to-draw** and "draw obstacles to
   go around" (hammermissions.com/product); Dronelink documents On-the-Fly Waypoints — fly the
   drone manually to mark points and generate a waypoint Mission (support.dronelink.com On-the-
   Fly Waypoints). Note the tension that Dronelink's own offline limitation sits against its
   field functions (see "What I could not verify").
5. **Keep a citable desktop import escape hatch for complex Sites.** When on-device drawing is not
   enough, every mature toolchain offers "plan elsewhere, import into the flight app": UgCS plans
   entirely on desktop and uploads, with KML/CSV and custom DEMs (manuals-ugcs.sphengineering.com
   Flight Planning Tools; enterprise.dji.com/ecosystem/ugcs), and its pre-planned route can fly
   from the RC alone (manuals-ugcs… having-only-the-mobile-device…); DJI Pilot 2 imports a
   Google-Earth/UgCS KML (UgCS route-export); Litchi Hub exports a KMZ the operator loads into DJI
   Fly (forum.flylitchi.com/t/guide-how-to-use-litchi-hub-with-dji-fly-skyrover/24332). For the
   repo this is the current mechanism, so the pattern is "keep the escape hatch, but remove the
   multi-app friction" — the KML import failures and the Litchi Hub → DJI Fly hand-off are where
   the friction lives (Reddit r/UAVmapping snippets; forum.flylitchi thread above).

## What I could not verify

- **Literal, vendor-published tap/step counts for any planner.** None is published; every numeric
  cell in the table is **INFERRED** from numbered vendor/third-party procedures, and UgCS reads as
  a sequence because its flow is menu/desktop-driven with no defensible numeric count.
- **Reddit content.** Direct access is blocked (302 login wall; fetched body is the string
  `Reddit`). Reddit material is cited only as search-engine excerpts and labelled
  **community-reported**; no Reddit thread is cited as a read source.
- **Direct app-store review feeds.** Unreachable as a fetch target this run; store sentiment is
  taken from search excerpts and labelled **community-reported**.
- **Dronelink's Map-on-the-fly vs. offline-planning contradiction.** The vendor publishes both "a
  Map can be generated in the field" and "cannot create new mission plans offline"; which applies
  to which plan tier/version is not stated. The two claims **conflict** and this doc presents both
  rather than resolving them.
- **Dronelink offline map availability / "cannot create new mission plans offline" vs. its
  documented field functions** — same unresolved tension as above.
- **Planner-specific sunlight/gloves behaviour.** No vendor documents a glove mode, high-contrast
  mode, or sunlight rating for the phone/tablet apps; the sunlight-and-gloves column is therefore
  **INFERRED** from the general field-hardware problem (glass touchscreens, tablet glare, thermal
  auto-dimming) evidenced in community threads and a hardware-vendor guide (sinsmarts.com
  drone-tablet guide). No app-specific claim is made.
- **UgCS desktop OS matrix.** The manual's installation page documents Windows 10 / Windows 11\*
  64-bit and macOS Monterey 12+ [S10]; whether a Linux build exists is unverified. DJI describes
  the product as "desktop" [S11].
- **DJI Pilot 2 area-drawing quality on 5.5\" vs 7\" screens.** No side-by-side source read.
- **RC2 offline-map download area limits.** DJI only says "calculated by the number of map
  tiles"; the extent changed across app versions and no figure was read.
- **Pix4Dcapture Pro's current field behaviour.** The app is removed from the stores and its
  basemap service is off, so no current field evidence is obtainable; the workflow described is
  the pre-retirement documented flow.
- **Glove performance for any controller/app** is anecdotal only — no controlled source exists.
- **Cap-driven omissions.** The plan caps the table at 10 planners. Two citable M3 candidates were
  therefore left out of the table to keep the six mandatory plus four extras: **Mission Planner**
  (ArduPilot, Windows-native desktop; Draw Polygon → Auto WP → Survey (Grid), map prefetch for
  offline field use — ardupilot.org Mission Planner Overview / Camera Control in Auto Missions,
  [S13]–[S20]) and **Drone Harmony** (Android/iOS 3D scene planner, "single click" flight plans,
  cloud-synced sites offline — Google Play Drone Harmony, droneharmony.com/user-guide,
  [S32]–[S39]). Both are evidenced in M3 and can be added if the 10-row cap is lifted.
- **No JSON/CSV companion.** Not requested by the ticket (YAGNI); a machine-readable table is a
  possible `github:#228` follow-up only.

## Sources

All read 2026-09-27 unless the page carries its own publication date, which is given. M3's
`[S#]` tags are kept as they appear in the table; M1/M2 sources are listed by full URL.

### DJI surfaces (M1)

1. DJI — Introduction to Waypoint Flight Mode of DJI Fly: https://support.dji.com/help/content?customId=en-us03400007343&spaceId=34&re=US&lang=en&documentType=artical&paperDocType=paper
2. DJI RC 2 User Manual (700 nits, 5.5-in, touchscreen): https://dl.djicdn.com/downloads/DJI_RC_2/UM/2023/DJI_RC_2_User_Manual_v1.0_EN.pdf
3. DJI RC Plus User Manual (1200 cd/m², 7.02-in, IP54): https://dl.djicdn.com/downloads/DJI_RC_Plus/20230518UM/DJI_RC_Plus_User_Manual_EN_v2.0.pdf
4. DJI Trust Center — Enterprise Drone Privacy Controls (Pilot 2: Local Data Mode, offline maps, MBTiles/MapTiler): https://www.dji.com/trust-center/resource/enterprise-privacy-controls
5. heliguy — DJI Drone Apps Mobile Phone Compatibility, 2025-02-04: https://www.heliguy.com/blogs/posts/dji-app-mobile-phone-compatibility/
6. Propeller Aero — How to Plan a Linear Mission Using DJI Pilot 2: https://help.propelleraero.com/hc/en-us/articles/19384545634711-How-to-Plan-a-Linear-Mission-Using-DJI-Pilot-2
7. Propeller Aero — How to Plan a 3D (Oblique) Mission with DJI Pilot 2: https://help.propelleraero.com/hc/en-us/articles/19384415429911-How-to-Plan-a-3D-Oblique-Mission-with-DJI-Pilot-2
8. Propeller Aero — Importing and Exporting Missions with DJI Pilot 2, 2023-06-29: https://help.propelleraero.com/hc/en-us/articles/19384503055767-Importing-and-Exporting-Missions-with-DJI-Pilot-2
9. Airteam — Flight Mission Planning using DJI Pilot 2 (eBook; numbered area-route steps), dated 2026-01-31: https://anyflip.com/bzxjq/cbts/basic
10. DJI Enterprise — Creating Waypoint Missions On DJI Pilot 2: Episode 8 (YouTube), 2022-09-27: https://www.youtube.com/watch?v=rIudTGS8zFI
11. UgCS — Route export to the DJI Pilot 2 (import steps): https://manuals-ugcs.sphengineering.com/docs/route-export-to-the-dji-pilot-2
12. BAAM.tech — DJI Pilot Waypoint Mission Flight Planning, 2024-08-15: https://support.baam.tech/workflows/01-001/01-001-0006/
13. GeoCue — Flight Planning with DJI Pilot 2 (area vs waypoint routes), 2024-05-30: https://support.geocue.com/lidar-flight-planning/
14. Grant Hosticka — How to import your own map to Pilot 2 (YouTube), 2023-09-27: https://www.youtube.com/watch?v=MDt2EohFUm0
15. dronesreports — DJI RC Plus Review 2025, 2025-09-09: https://dronesreports.com/dji-rc-plus/ (**could not be re-fetched 2026-09-27 — transport error**; earlier read only)
16. mavicpilots — Mavic 3E / RC Pro Enterprise: Pilot 2 offline maps issues, 2024-11-23: https://mavicpilots.com/threads/mavic-3e-rc-pro-enterprise-_-pilot-2-app-issues-creating-and-using-offline-maps.149282/
17. mavicpilots — DJI Pilot 2 and AGL waypoint mission (no AGL in Pilot 2): https://mavicpilots.com/threads/dji-pilot-2-and-agl-waypoint-mission.151966/
18. mavicpilots — Flying a grid with waypoints without smoothed path, 2022-12-15: https://mavicpilots.com/threads/flying-a-grid-with-waypoints-without-smoothed-path.133443/
19. mavicpilots — offline waypoint mission (first mission needs full setup), 2024-05-10: https://mavicpilots.com/threads/offline-waypoint-mission.145945/
20. mavicpilots — Can waypoint missions be created without being connected?, 2023-08-27: https://mavicpilots.com/threads/can-waypoint-missions-be-created-without-being-connected.140288/
21. mavicpilots — Fly app crashes making waypoints (RC2 freeze ~100–200 WP): https://mavicpilots.com/threads/fly-app-crashes-making-waypoints.144438/
22. mavicpilots — Can DJI Fly Waypoints be Edited Without Powering up…, 2024-12-02: https://mavicpilots.com/threads/can-dji-fly-waypoints-be-edited-without-powering-up-the-drone-controller.149599/
23. mavicpilots — Phone v DJI RC (700 nits vs sustained brightness), 2024-10-19: https://mavicpilots.com/threads/phone-v-dji-rc.148828/
24. mavicpilots — controller screen glare (RC2 touchscreen, sunhoods): https://mavicpilots.com/threads/controller-screen-glare.155223/
25. Pixpro — DJI Fly App Guide, 2024-07-25: https://www.pix-pro.com/blog/dji-fly-guide-part1
26. DroneXL — DJI Mini 5 Pro Waypoint Tutorial, 2025-10-14: https://dronexl.co/2025/10/14/dji-mini-5-pro-waypoint-tutorial/
27. VicVideoPic — Waypoint on DJI Mini 4 Pro/Air 3, 2025-07-19: https://vicvideopic.com/waypoint-on-dji-mini-4-pro-air-3-air-3s-and-mavic-4-pro-how-to-create-waypoints-missions/
28. Smog On The Line — How to Set DJI Waypoints Offline (RC2) (YouTube), 2026-01-27: https://www.youtube.com/watch?v=EjoP2ZkOcO4
29. forum.flylitchi — Merging waypoint missions into a single mapping view, 2025-07-17: https://forum.flylitchi.com/t/merging-waypoint-missions-into-a-single-mapping-view/25646
30. forum.flylitchi — Can DJI Fly Waypoints be Edited Without Powering up…, 2024-12-02: https://forum.flylitchi.com/t/can-dji-fly-waypoints-be-edited-without-powering-up-the-drone-controller/20379
31. Reddit r/UAVmapping — Planning routes on Pilot 2 (mouse on controller), 2024-10-29 (snippet only, direct access blocked): https://www.reddit.com/r/UAVmapping/comments/1gf3rvk/planning_routes_on_pilot_2_butterfingers_no_more/
32. Reddit r/UAVmapping — getting KMLs into DJI Pilot 2, 2024-02-19 (snippet only): https://www.reddit.com/r/UAVmapping/comments/1auutj9/getting_kmls_into_dji_pilot_2/
33. Reddit r/UAVmapping — DJI Pilot 2 create mission with multiple areas, 2025-05-22 (snippet only): https://www.reddit.com/r/UAVmapping/comments/1kswaca/dji_pilot_2_app_create_mission_with_multiple_areas/
34. Reddit r/dji — Gloves for RC2 controller, 2024-12-09 (snippet only): https://www.reddit.com/r/dji/comments/1h9zv96/gloves_for_rc2_controller_my_two_different_pairs/
35. Repo — `docs/research/mission-planning-automation-2026.md:38-44` (RC2 KMZ-replacement mechanism).
36. Repo — `docs/research/controller-and-loader-facts-2026-09-11.md:10-27,88-94` (RC2 storage/MTP/update churn; 200-waypoint cap).

### Cloud / phone planners (M2)

**DroneDeploy**
- https://help.dronedeploy.com/hc/en-us/articles/1500004964302-Mobile-app-flight-planning (fetched)
- https://help.dronedeploy.com/hc/en-us/articles/26263580481943-Offline-Flight-Planning (fetched; article dated 2026-04-01)
- https://help.dronedeploy.com/hc/en-us/articles/31298333377559-Creating-a-new-project-using-the-Mobile-Flight-App (fetched)
- https://help.dronedeploy.com/hc/en-us/articles/1500004861101-Web-App-Flight-Planning-Desktop-Laptop (fetched)
- https://help.dronedeploy.com/hc/en-us/articles/4410554086039-Corridor-Flight (fetched)
- https://apps.apple.com/gb/app/dronedeploy-flight-app/id971358101 (search excerpt)
- https://www.trustradius.com/products/dronedeploy (search excerpt)
- https://knowledge.arboair.com/article/119-flight-mission-planner-dronedeploy (search excerpt)
- https://www.reddit.com/r/DroneDeploy/comments/1jpvfyj/android_app_issues/ (search excerpt; direct fetch blocked)
- https://mavicpilots.com/threads/question-on-tablets.134513/ (search excerpt)
- https://www.youtube.com/watch?v=m4xJWHg8viA (DroneDeploy "How to Plan a Drone Mapping Mission", transcript excerpt)

**Pix4Dcapture**
- https://support.pix4d.com/hc/en-us/articles/360047701131 (fetched)
- https://support.pix4d.com/hc/en/important-update-regarding-pix4dcapture-pro- (search excerpt)
- https://support.pix4d.com/hc/en-us/articles/209960726-Types-of-mission-Which-type-of-mission-to-choose (search excerpt)
- https://community.pix4d.com/t/end-of-support-and-development-of-pix4dcapture-pro-and-mission-planner/33685 (search excerpt)
- https://www.pix4d.com/blog/prepare-drone-flight-pix4dcapture (search excerpt)
- https://knowledge.arboair.com/article/144-flight-mission-planner-pix4d-android and /article/110-flight-mission-planner-pix4d (search excerpts)
- https://surveydrones.ie/wp-content/uploads/2021/07/Pix4dscan-Mission-types-ver1.0.pdf (search excerpt)
- https://mavicpilots.com/threads/pix4dcapture-pro-and-pix4ds-mission-planner.139559/ (search excerpt)

**Dronelink**
- https://support.dronelink.com/hc/en-us/articles/6823062938899-Basic-Mapping-Map-Mission-Component-Intro (fetched)
- https://support.dronelink.com/hc/en-us/articles/4406012655763-Offline-Support-Download-Missions-for-Offline-Use-in-Dronelink-Mobile-App (fetched)
- https://support.dronelink.com/hc/en-us/articles/360052251234-Can-I-use-Dronelink-while-offline (search excerpt)
- https://support.dronelink.com/hc/en-us/articles/7919790478995-Map-On-the-fly-Function (search excerpt)
- https://support.dronelink.com/hc/en-us/articles/22636929364371-On-the-Fly-Waypoints-Generate-Missions-in-the-Field-Using-a-Drone (search excerpt)
- https://support.dronelink.com/hc/en-us/articles/5136972798611-How-do-I-synchronize-upload-mission-plans-or-flights-between-the-web-and-mobile-apps (search excerpt)
- https://apps.apple.com/us/app/dronelink-flight/id1451684056 (search excerpt)
- https://play.google.com/store/apps/details?id=com.dronelink.dronelink (search excerpt)
- https://geonadir.com/dronelink-review/ (search excerpt)
- https://community.opendronemap.org/t/dronelink-any-good/15803 (search excerpt)
- https://www.reddit.com/r/UAVmapping/comments/12w19d9/dronelink_pricing/ (search excerpt)

**Hammer Missions**
- https://www.hammermissions.com/apk (fetched)
- https://www.hammermissions.com/post/drone-flight-planning-offline (search excerpt)
- https://www.hammermissions.com/product (search excerpt)
- https://www.hammermissions.com/post/hammer-missions-on-android (search excerpt)

**General field-hardware / sunlight-gloves (cross-planner, community-reported where noted)**
- https://www.reddit.com/r/gis/comments/12lg7qx/gis_field_work_ipad_screen_visibility/ (search excerpt)
- https://mavicpilots.com/threads/options-for-daytime-flying-and-screen-glare-on-tablets.6238/ (community-reported)
- https://mavicpilots.com/threads/controller-screen-glare-shading.131512/ (community-reported)
- https://mavicpilots.com/threads/how-do-you-handle-visibility-of-the-phone-screen-in-broad-daylight.80396/ (community-reported)
- https://dronemapperforum.com/c/equipment/best-tablet-for-field-work-with-dronedeploy (search excerpt)
- https://www.sinsmarts.com/blog/how-to-select-and-deploy-drone-tablet-for-real-world-uav-operations/ (vendor/hardware guide)

**Repo facts reused (M2)**
- `docs/research/mission-specification-schemas-2026.md:34,37,38,39` (Dronelink / UgCS / Pix4Dcapture Pro / DroneDeploy mission types already tabulated); `:120` (Dronelink 403, prior pass).
- `docs/research/mission-parameters-and-verification-2026.md:56,197` (DroneDeploy help 403, prior pass).
- `docs/research/mission-planning-community-2026.md:5-14` (Reddit hard-block, confirmed this run).

### Power / MAVLink planners (M3)

- [S1] Litchi user guide — https://flylitchi.com/help
- [S2] Litchi home — https://flylitchi.com/
- [S3] Litchi Hub — https://hub.flylitchi.com/
- [S4] Litchi forum, "Gridded waypoint missions" — https://forum.flylitchi.com/t/gridded-waypoint-missions/8543
- [S5] Litchi forum, "[GUIDE] How to use Litchi Hub with DJI Fly / SkyRover" — https://forum.flylitchi.com/t/guide-how-to-use-litchi-hub-with-dji-fly-skyrover/24332
- [S6] Apple App Store, Litchi for DJI Drones — https://apps.apple.com/us/app/litchi-for-dji-drones/id1059218666
- [S7] Repo: `docs/research/battery-swap-resume-2026.md:52,58`
- [S8] UgCS manual, "Flight Planning Tools" — https://manuals-ugcs.sphengineering.com/docs/flight-planning-tools
- [S9] UgCS manual, "How to fly UgCS routes using only an RC" — https://manuals-ugcs.sphengineering.com/docs/having-only-the-mobile-device-or-smart-controlle-with-ugcs-for-dji-in-the-field
- [S10] UgCS manual, "Installation and System Requirements" (Windows 10; Windows 11\* 64-bit) — https://manuals-ugcs.sphengineering.com/docs/installation
- [S11] DJI Enterprise ecosystem, UGCS — https://enterprise.dji.com/ecosystem/ugcs
- [S12] Google Play, "UgCS for DJI" — https://play.google.com/store/apps/details?id=com.ugcs.android.vsm.dji
- [S13] ArduPilot, "Mission Planner Overview" — https://ardupilot.org/planner/docs/mission-planner-overview.html
- [S14] ArduPilot, "Planning a Mission with Waypoints and Events" — https://ardupilot.org/plane/docs/common-planning-a-mission-with-waypoints-and-events.html
- [S15] ArduPilot, "Camera Control in Auto Missions" — https://ardupilot.org/planner/docs/common-camera-control-and-auto-missions-in-mission-planner.html
- [S16] ardupilot_wiki, `mission-planner-flight-plan.rst` — https://github.com/ArduPilot/ardupilot_wiki/blob/master/planner/source/docs/mission-planner-flight-plan.rst
- [S17] ardupilot_wiki, `mission-planner-installation.rst` — https://github.com/ArduPilot/ardupilot_wiki/blob/master/planner/source/docs/mission-planner-installation.rst
- [S18] ArduPilot/MissionPlanner README — https://github.com/ardupilot/MissionPlanner
- [S19] discuss.ardupilot.org, "Autonomous grid with terrain following" — https://discuss.ardupilot.org/t/autonomous-grid-with-terrain-following/18839
- [S20] discuss.ardupilot.org, "Current Waypoints → Polygon Feature" — https://discuss.ardupilot.org/t/current-waypoints-polygon-feature/74849
- [S21] QGroundControl Dev Guide, design philosophy — https://dev.qgroundcontrol.com/en/
- [S22] QGC Guide, "Survey (Plan Pattern)" — https://docs.qgroundcontrol.com/master/en/qgc-user-guide/plan_view/pattern_survey.html
- [S23] QGC Guide, "Plan View" — https://docs.qgroundcontrol.com/master/en/qgc-user-guide/plan_view/plan_view.html
- [S24] QGC Guide, "Maps" (offline tile sets) — https://docs.qgroundcontrol.com/master/en/qgc-user-guide/settings_view/maps.html
- [S25] QGC Guide, "Download and Install" — https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/download_and_install.html
- [S26] mavlink/qgroundcontrol issue #9495, "terrain checker fails pretty often on large missions" — https://github.com/mavlink/qgroundcontrol/issues/9495
- [S27] Apple App Store, Map Pilot Pro — https://apps.apple.com/us/app/map-pilot-pro/id1546656014
- [S28] Apple App Store, Map Pilot Pro ratings & reviews — https://apps.apple.com/us/app/map-pilot-pro/id1546656014?platform=iphone&see-all=reviews
- [S29] Maps Made Easy, Map Pilot Pro — https://www.mapsmadeeasy.com/mappilotpro
- [S30] Drones Made Easy, "Map Pilot for DJI – Introduction" — https://support.dronesmadeeasy.com/hc/en-us/articles/206018633-Map-Pilot-for-DJI-Introduction
- [S31] Drones Made Easy, "Terrain Awareness" — https://support.dronesmadeeasy.com/hc/en-us/articles/211810943-Terrain-Awareness
- [S32] Google Play, "Drone Harmony for DJI Drones" — https://play.google.com/store/apps/details?hl=en_US&id=com.droneharmony.planner
- [S33] Apple App Store, "Drone Harmony Mobile" — https://apps.apple.com/us/app/drone-harmony-mobile/id1602698517
- [S34] Drone Harmony, "User Guide" — https://www.droneharmony.com/user-guide
- [S35] Drone Harmony, "Mobile App Version 2.10.0 Release" — https://www.droneharmony.com/post/drone-harmony-mobile-app-version-2-10-0-release
- [S36] Drone Harmony, "Site Management" (cloud sync / offline) — https://www.droneharmony.com/post/2-site-management
- [S37] Drone Harmony, "Download The App" — https://www.droneharmony.com/download-the-app
- [S38] Facebook, Drone Capture group post seeking a Drone Harmony support forum — https://www.facebook.com/groups/dronecaptures/posts/3633352610269669
- [S39] DJI Enterprise ecosystem, DroneHarmony — https://enterprise.dji.com/ecosystem/droneharmony
- [S40] Repo: `docs/research/mission-planning-community-2026.md:5-14` (prior Reddit block)
- [S41] Reddit thread URL surfaced but **unread** (fetch returned only "Reddit") — https://www.reddit.com/r/UAVmapping/comments/z5ow9o/qgroundcontrol_use
