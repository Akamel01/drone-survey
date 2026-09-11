# Waypoint OS (PilotByte) v1.6.5 — Static Analysis

Method: both archives were extracted read-only into a scratchpad directory and inspected with `unzip`, `strings`, `file`, `grep`, and two small Python scripts (a squashfs reader and an asar reader, both stdlib-only — `zlib`/`struct`/`json`). **Nothing from either archive was executed, opened, mounted, or installed.** The Linux AppImage (`WaypointOS-1.6.5-x86_64.AppImage`) is an ELF binary with an appended SquashFS filesystem (gzip-compressed, superblock at file offset 188392); that filesystem contains a standard Electron `resources/app.asar`, which was parsed directly from its 16-byte pickle header + JSON manifest + concatenated file data. The macOS zip contains two `.dmg` files that were only string-scanned (never mounted) to confirm same app name and version `1.6.5`. All extracted files were deleted from the scratchpad at the end of this analysis.

## Summary

Waypoint OS is an **Electron 31.7.7 / Chromium 126 / Node 20.18.0** desktop app (not Tauri), built with React 18 + Vite/Rollup, MapLibre GL, Turf.js, terra-draw, sql.js (SQLite-in-WASM), xmlbuilder2, and JSZip — all MIT/BSD-3-Clause, no copyleft or commercial-use restriction, and the app's own `package.json` declares `"license": "MIT"`. It generates a standard **DJI WPML KMZ** (`wpmz/template.kml` + `wpmz/waylines.wpml`, xmlns `http://www.dji.com/wpmz/1.0.2`) exactly as documented in DJI's own WPML spec, built client-side in the renderer with `xmlbuilder2` and zipped with `JSZip`. It supports exactly two mission types — an automated boustrophedon **grid/mapping** survey over a hand-drawn or KML-imported polygon, and a manually-drawn **"custom"** route (points/lines/circles) with three heading modes (follow-route, fixed heading, point-of-interest). There is no orbit-pattern generator, no double-grid, no corridor mode, and no facade mode. The only DJI action it ever emits is `takePhoto` on a `reachPoint` trigger; there is no startRecord/stopRecord/hover/rotateYaw/gimbalRotate action in the codebase at all. Waypoint-count limits (drone-specific, default 175 for consumer models including the Mini 5 Pro, editable 10–65535) drive a client-side splitter that produces `<name>_part1.kmz`, `_part2.kmz`, … files, breaking only at full line boundaries — the app calls this the "Turn-Only" vs "Full" **waypoint mode**, not a trigger-strategy toggle for the split itself. The app never talks to a DJI controller: export is a native Save dialog to an arbitrary local path; there is no MTP/ADB code, no reference to the DJI Fly package name or its `Android/data/.../files/waypoint/<GUID>/` folder anywhere in the bundle. There is no CLI, no headless mode, no local HTTP server, and no IPC surface reachable from outside the Electron process — but the **KMZ format itself is fully reproducible**, since the two XML-writer functions were recovered verbatim (quoted below) and require nothing but a project record and a waypoint list. Network use is all free/keyless: OSM/ArcGIS/CartoDB map tiles, Nominatim search, Open-Meteo elevation, and a GitHub Releases API check/download for self-updates against `Pilotbyte-Master/waypointos-releases` — no login, account, licence key, or telemetry/analytics call exists anywhere in the app, and mission generation works fully offline except for optional basemap imagery and optional terrain-following.

## 1. App type and stack

- **Framework**: Electron, not Tauri. Confirmed by `resources/app.asar`, `chrome-sandbox`, `LICENSE.electron.txt`, `v8_context_snapshot.bin`, and per-locale `.pak` files inside the AppImage's squashfs.
- **Versions** (from `strings` on the extracted Electron binary `waypoint-os`): `Electron/31.7.7`, `Chrome/126.0.6478.234`, `node.js/v20.18.0`.
- **App package.json** (`asar-out/package.json`):
  ```json
  {
    "name": "waypoint-os",
    "version": "1.6.5",
    "description": "Desktop app for creating DJI drone mapping missions",
    "main": "out/main/index.js",
    "author": "Pilotbyte",
    "license": "MIT",
    "dependencies": {
      "@turf/turf": "^6.5.0", "jszip": "^3.10.1", "maplibre-gl": "^5.24.0",
      "react": "^18.3.1", "react-dom": "^18.3.1", "react-router-dom": "^6.23.1",
      "sql.js": "^1.12.0", "terra-draw": "^1.31.1", "terra-draw-maplibre-gl-adapter": "^1.4.1",
      "xmlbuilder2": "^3.1.1", "zustand": "^4.5.2"
    }
  }
  ```
- **Bundled library versions actually shipped** (from each package's own `package.json`) and licence: `@turf/turf` 6.5.0 (MIT), `jszip` 3.10.1 (MIT/GPL-3.0 dual — app uses under MIT), `maplibre-gl` 5.24.0 (BSD-3-Clause), `react`/`react-dom` 18.3.1 (MIT), `react-router-dom` 6.30.3 (MIT), `sql.js` 1.14.1 (MIT, SQLite compiled to WASM), `terra-draw` 1.31.1 (MIT), `terra-draw-maplibre-gl-adapter` 1.4.1 (MIT), `xmlbuilder2` 3.1.1 (MIT), `zustand` 4.5.7 (MIT). All permissive; nothing GPL-only is invoked (JSZip's dual MIT/GPLv3 licence lets the app use the MIT branch).
- Renderer is a single Vite/Rollup-bundled file `out/renderer/assets/index-DAGBTEhr.js` (63,353 minified lines) plus `index-CE890MGt.css`; main process is `out/main/index.js` (946 lines, unminified); preload is `out/preload/index.js` (42 lines).
- Persistence: an actual SQLite database (`missions.db` via `sql.js`) in Electron's `userData` directory, not files-on-disk JSON — `initDatabase()` in `out/main/index.js` creates tables `drone_profiles`, `projects`, `boundaries`, `custom_routes` and re-serializes the whole DB to disk on every write (`persist()` calls `db.export()` + `fs.writeFileSync`).

## 2. Output format

KMZ, not bare KML. `packageKmz()` (renderer bundle) builds it with JSZip:

```js
function packageKmz(templateKml, waylinesWpml) {
  const zip = new JSZip();
  const wpmz = zip.folder("wpmz");
  wpmz.file("template.kml", templateKml);
  wpmz.file("waylines.wpml", waylinesWpml);
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
```

So the KMZ contains exactly `wpmz/template.kml` and `wpmz/waylines.wpml` — the standard two-file DJI WPML layout, with no `wpmz/res/` folder (no embedded thumbnail/tiles).

**Namespace**: `http://www.dji.com/wpmz/1.0.2` (DJI's own, not a generic `uav.com` namespace). Both documents declare:
```js
.ele("kml", { xmlns: "http://www.opengis.net/kml/2.2", "xmlns:wpml": "http://www.dji.com/wpmz/1.0.2" })
```

**The XML-writing code**, recovered verbatim from `out/renderer/assets/index-DAGBTEhr.js`:

```js
function buildTemplateKml(project, drone2) {
  const doc = xmlbuilder2_minExports.create({ version: "1.0", encoding: "UTF-8" }).ele("kml", {
    xmlns: "http://www.opengis.net/kml/2.2",
    "xmlns:wpml": "http://www.dji.com/wpmz/1.0.2"
  }).ele("Document").ele("wpml:author").txt("Waypoint OS").up().ele("wpml:createTime").txt(Date.now().toString()).up()
    .ele("wpml:updateTime").txt(Date.now().toString()).up()
    .ele("wpml:missionConfig")
      .ele("wpml:flyToWaylineMode").txt("safely").up()
      .ele("wpml:finishAction").txt(project.finish_action).up()
      .ele("wpml:exitOnRCLost").txt("goContinue").up()
      .ele("wpml:executeRCLostAction").txt(project.rc_lost_action).up()
      .ele("wpml:takeOffSecurityHeight").txt(String(project.takeoff_height_m)).up()
      .ele("wpml:globalTransitionalSpeed").txt(String(project.speed_ms)).up()
      .ele("wpml:droneInfo")
        .ele("wpml:droneEnumValue").txt(String(drone2.drone_enum_value)).up()
        .ele("wpml:droneSubEnumValue").txt(String(drone2.drone_sub_enum_value)).up()
      .up().up().up()
    .ele("Folder").ele("name").txt("Waylines Folder").up().ele("open").txt("1").up().up().up();
  return doc.end({ prettyPrint: true });
}

function buildWaylinesWpml(waypoints, project, drone2) {
  const headingMode = effectiveHeadingMode(project);
  const doc = xmlbuilder2_minExports.create({ version: "1.0", encoding: "UTF-8" }).ele("kml", {
    xmlns: "http://www.opengis.net/kml/2.2",
    "xmlns:wpml": "http://www.dji.com/wpmz/1.0.2"
  }).ele("Document").ele("wpml:missionConfig")
      /* same missionConfig block as template.kml */
    .up().up()
    .ele("Folder")
      .ele("wpml:templateId").txt("0").up()
      .ele("wpml:executeHeightMode").txt("relativeToStartPoint").up()
      .ele("wpml:waylineId").txt("0").up()
      .ele("wpml:distance").txt("0").up()
      .ele("wpml:duration").txt("0").up()
      .ele("wpml:autoFlightSpeed").txt(String(project.speed_ms)).up();
  for (const wp of waypoints) {
    const placemark = folder.ele("Placemark").ele("Point").ele("coordinates").txt(`${wp.lng},${wp.lat}`).up().up()
      .ele("wpml:index").txt(String(wp.index)).up()
      .ele("wpml:executeHeight").txt(String(wp.altitude)).up()
      .ele("wpml:waypointSpeed").txt(String(project.speed_ms)).up()
      .ele("wpml:waypointHeadingParam")
        .ele("wpml:waypointHeadingMode").txt(headingMode).up()
        .ele("wpml:waypointHeadingAngle").txt(String(Math.round(wp.heading))).up()
      .up()
      .ele("wpml:waypointTurnParam")
        .ele("wpml:waypointTurnMode").txt("toPointAndStopWithDiscontinuityCurvature").up()
        .ele("wpml:waypointTurnDampingDist").txt("0").up()
      .up()
      .ele("wpml:useStraightLine").txt("1").up()
      .ele("wpml:gimbalHeadingYawBase").txt("aircraft").up()
      .ele("wpml:gimbalRotateMode").txt("absoluteAngle").up();
    if (wp.photoTrigger) {
      placemark.ele("wpml:actionGroup")
        .ele("wpml:actionGroupId").txt(String(wp.index)).up()
        .ele("wpml:actionGroupStartIndex").txt(String(wp.index)).up()
        .ele("wpml:actionGroupEndIndex").txt(String(wp.index)).up()
        .ele("wpml:actionGroupMode").txt("sequence").up()
        .ele("wpml:actionTrigger").ele("wpml:actionTriggerType").txt("reachPoint").up().up()
        .ele("wpml:action")
          .ele("wpml:actionId").txt("0").up()
          .ele("wpml:actionActuatorFunc").txt("takePhoto").up()
          .ele("wpml:actionActuatorFuncParam")
            .ele("wpml:fileSuffix").txt("").up()
            .ele("wpml:payloadPositionIndex").txt("0").up()
          .up().up().up().up();
    }
    placemark.up();
  }
  return doc.end({ prettyPrint: true });
}
```

`executeHeightMode` is always `relativeToStartPoint` (not `EGM96`/`AGL`/`aboveGroundLevel`, and no DEM-following height mode is ever emitted — see §3). Turn mode is always hard-coded to `toPointAndStopWithDiscontinuityCurvature` — the app never emits the "pass-through / continuity-curvature" (fly-through) turn style.

## 3. Mission patterns and parameters

Only two `mission_type` values exist: `"mapping"` and `"custom"`. There is no orbit-pattern generator, corridor mode, facade mode, or double-grid mode — "orbit" only appears as a manually hand-drawn circle inside the free-draw ("custom") tool (`terra-draw`), tooltip: *"Draw circle orbit — click center, drag to size, click to place."*

**Mapping (grid) plan** — `generateFlightPlan()`:
- Footprint/GSD math (`calculateFootprint`, `calculateGsd`, `calculateLineSpacing`, `calculatePhotoSpacing`):
  ```js
  function calculateFootprint(drone2, altitudeM) {
    const widthM = drone2.sensor_width_mm / drone2.focal_length_mm * altitudeM;
    const heightM = drone2.sensor_height_mm / drone2.focal_length_mm * altitudeM;
    return { widthM, heightM };
  }
  function calculateGsd(sensorWidthMm, altitudeM, focalLengthMm, imageWidthPx) {
    return sensorWidthMm * altitudeM * 100 / (focalLengthMm * imageWidthPx);
  }
  function calculateLineSpacing(footprintWidthM, sideOverlap)  { return footprintWidthM  * (1 - sideOverlap); }
  function calculatePhotoSpacing(footprintHeightM, frontOverlap) { return footprintHeightM * (1 - frontOverlap); }
  ```
- Flight-line angle: user-set (`project.flight_angle`, 0–359°) or auto-derived as perpendicular to the polygon's longest edge (`getLongestAxisAngle`).
- Lines are swept across the rotated bounding box at `lineSpacingM` intervals, clipped to the polygon (`generateClippedLines`), ordered boustrophedon-style (`applySerpentineOrder`), and each line gets a 15 m overshoot (`const OVERSHOOT_M = 15`).
- Waypoints are placed at each line's start/end, plus interior points spaced at `photoSpacingM` along each line **only** when `waypoint_mode === "full"` (see §5 for `"turnOnly"`).
- **User-set**: altitude, speed, front/side overlap, gimbal pitch, flight angle (or auto), finish action, RC-lost action, take-off height, heading mode, waypoint mode (full/turnOnly), terrain-follow on/off, mission type, max-waypoints override.
- **Derived**: footprint width/height, line spacing, photo spacing, GSD, rotation angle (when auto), per-waypoint heading (bearing of the line), estimated flight time (`totalDistanceM / speed_ms`), photo count, area.

**Custom plan** — `generateCustomPlan()`: a manually drawn route (points/lines/orbit) becomes waypoints 1:1 (or densified for terrain-follow), with one of three heading strategies (`project.custom_heading_mode`):
```js
const headingFor = (i2) => {
  if (project.custom_heading_mode === "fixed")
    return ((project.custom_heading_deg ?? 0) % 360 + 540) % 360 - 180;
  if (project.custom_heading_mode === "poi" && project.poi_lat !== null && project.poi_lng !== null)
    return bearing(point$3([route[i2][1], route[i2][0]]), point$3([project.poi_lng, project.poi_lat]));
  /* default: follow the route direction, bearing to next point */
};
```
Note the POI mode is **not** a native WPML "point toward POI" mode — the bearing to the POI is computed once per waypoint in JS and baked into `wpml:waypointHeadingAngle` with `waypointHeadingMode = "smoothTransition"`. There is no `wpml:waypointPoiPoint` tag anywhere in the writer.

**Heading mode resolution** (`effectiveHeadingMode`):
```js
function effectiveHeadingMode(project) {
  if (project.mission_type !== "custom") return project.heading_mode;      // default: "followWayline"
  if (project.custom_heading_mode === "fixed") return "smoothTransition";
  if (project.custom_heading_mode === "poi")
    return project.poi_lat !== null && project.poi_lng !== null ? "smoothTransition" : "followWayline";
  return "followWayline";
}
```

**Terrain following** is not DJI's native `followSurface`/`relativeToGround` executeHeightMode. It is computed entirely client-side: waypoints are densified every 30 m (`TERRAIN_SAMPLE_INTERVAL_M`, capped at `MAX_DENSIFIED_POINTS = 5000`), elevations for each point are fetched from Open-Meteo, and a per-waypoint relative altitude is computed against the first waypoint's elevation, then written into `wpml:executeHeight` under the always-`relativeToStartPoint` height mode:
```js
async function applyTerrainFollowing(waypoints, aglAltitudeM) {
  const elevations = await getElevations(waypoints.map((wp) => [wp.lat, wp.lng]));
  const reference = elevations[0];
  const adjusted = waypoints.map((wp, i2) => ({
    ...wp,
    altitude: Math.max(MIN_RELATIVE_ALTITUDE_M, Math.round((aglAltitudeM + elevations[i2] - reference) * 10) / 10)
  }));
  ...
}
```
`MIN_RELATIVE_ALTITUDE_M = 5`. No DEM file import, no offline elevation model — it is purely a live Open-Meteo API call, and terrain-follow silently degrades to a hard error state if the network call fails or the route is "too long" (mission blocked from export in that case, see §9).

## 4. Actions per waypoint

The **only** DJI action ever emitted, anywhere in the codebase, is `takePhoto` — there is no `startRecord`, `stopRecord`, `hover`, `rotateYaw`, or `gimbalRotate` actuator function in the bundle (confirmed by grep across the whole renderer bundle; the only hits for those words are UI tooltip strings, not action-writer code). It fires via a single `wpml:actionTrigger` of type `reachPoint` (never `betweenAdjacentPoints` or `multipleTiming`), one action per group, `actionGroupMode = "sequence"`. Photo actions only exist on waypoints flagged `photoTrigger: true`, i.e. only in the "mapping" grid plan's interval points (§3); the "custom" route plan never sets `photoTrigger`, so free-drawn routes/orbits carry **zero** camera actions — the user is expected to trigger the camera manually in DJI Fly.

## 5. Limits and splitting; "Turn-Only" vs "Full"

**Waypoint Mode** (UI label) is what the app's own tooltip calls the trigger strategy:
- **"Full"** (`waypoint_mode: "full"`) — tooltip: *"Trigger a photo at every interval point."* Inserts extra waypoints along each flight line spaced at `photoSpacingM`, each one carrying a `takePhoto` action.
- **"Turn Only"** (`waypoint_mode: "turnOnly"`) — tooltip: *"Waypoints only at line turns."* Hint text: *"Line endpoints only — start interval shooting manually."* No interval waypoints or photo actions are generated at all; only line start/end points exist. The user must start DJI Fly's own interval/timed photography manually in this mode.

This is decided in `buildWaypoints()`:
```js
if (params.waypointMode === "full" && params.photoSpacingM > 0 && totalLengthM > params.photoSpacingM) {
  // insert interval waypoints with photoTrigger: true
}
```

**Waypoint-count limit and splitting** — the limit is per-drone (`drone_profiles.max_waypoints`, default 175 for every built-in consumer model, 100 for a newly created custom drone template, editable range clamped to `[10, 65535]`), optionally overridden per-project (`max_waypoints_override`):
```js
function effectiveMaxWaypoints(project, drone2) {
  return project?.max_waypoints_override ?? drone2?.max_waypoints ?? 100;
}
```
When the generated plan exceeds this, `SplitExportModal` warns: *"This mission has N waypoints, but your aircraft's per-mission limit is M. Exceeding it can cause the mission to fail to upload or the controller to become unresponsive."* — and offers "Export Full Mission" (ignore the limit) or "Optimize & Split." The splitter never breaks a flight line mid-pass — only at segment (line) boundaries — and re-joins adjoining chunk endpoints that share a coordinate:
```js
function smartSplitWaypoints(waypoints, maxPerChunk) {
  if (waypoints.length <= maxPerChunk) return [waypoints.map((wp, i2) => ({ ...wp, index: i2 }))];
  // build segments split at any non-photoTrigger waypoint (i.e. line ends)
  // then greedily pack segments into chunks <= maxPerChunk, re-indexing per chunk
}
```
Split KMZs are named `<MissionName>_part1.kmz`, `_part2.kmz`, … (underscored mission name), each independently re-based for terrain altitude if terrain-follow is active (each part's `wpml:executeHeight` is relative to that part's own first waypoint — the UI explicitly warns *"take off near the first waypoint of the part you are flying"*). There is **no separate limit on action count** — only the waypoint-count ceiling above governs splitting; grep across the bundle found no distinct `MAX_ACTIONS`-style constant.

## 6. Drone models and camera constants

Hard-coded `DRONE_PROFILES` table (`out/main/index.js`), seeded into SQLite on first run:

| Model | Sensor (mm) | Focal (mm) | Image (px) | Max speed (m/s) | Max alt (m) | droneEnumValue | Max waypoints |
|---|---|---|---|---|---|---|---|
| Mini 4 Pro | 9.6 × 7.2 | 8.7 | 4032×3024 | 16 | 4000 | 68 | 175 |
| **Mini 5 Pro** | **9.6 × 7.2** | **8.7** | **4032×3024** | **18** | **4000** | **68** | **175** |
| Air 3 / Air 3S | 9.6 × 7.2 | 8.7 | 4032×3024 | 21 | 4000 | 68 | 175 |
| Mavic 3 / 3 Classic / 3 Pro | 17.3 × 13 | 12.29 | 5280×3956 | 21 | 6000 | 68 | 175 |
| Mavic 4 Pro | 36 × 24 | 24 | 7728×5152 | 21 | 6000 | 68 | 175 |
| Lito X1 | 9.6 × 7.2 | 8.7 | 4032×3024 | 18 | 4620 | 68 | 175 |

`drone_sub_enum_value` is `0` for every profile. A code comment explains `drone_enum_value: 68` is used as a shared/generic "consumer WPML code" for every listed model because "DJI doesn't publish per-model codes" — i.e. the app does not distinguish drone hardware inside the WPML payload itself, only inside its own UI/limits logic. A DB migration also shows the app once shipped `Matrice 4E`/`Matrice 4T` profiles that are now deleted unless a saved project still references them.

**`finishAction`**: user-selectable, options are `goHome` ("Return to Home", default), `autoLand` ("Auto Land"), `hover` ("Hover"), `gotoFirstWaypoint` ("Go to First Waypoint").

**`executeRCLostAction`**: user-selectable, options are `goBack` ("Return to Home", default), `hover` ("Hover"), `autoLand` ("Auto Land").

**`exitOnRCLost`**: **not** user-configurable — hard-coded to `"goContinue"` in both `buildTemplateKml` and `buildWaylinesWpml`.

## 7. Controller loading

The app never talks to a DJI RC controller. There is no MTP or ADB code anywhere in the bundle (grepped both main and renderer for `adb`, `mtp`, `Android/data`, `RC2`, `GUID`, `waypoint/<uuid>` patterns — no genuine hits, only unrelated substring matches inside a Unicode character-class table and DOM "activation"/"guidance" internals from a bundled XML/DOM library). Export is purely local: `dialogSaveKmz` opens a native OS save dialog (default filter `*.kmz`), and `fileWriteKmz` writes the buffer to whatever path the user picked via plain `fs.promises.writeFile`. Getting the file onto the RC2/DJI Fly `Android/data/<pkg>/files/waypoint/<GUID>/` folder is entirely a manual, out-of-app step (e.g. sideloading via MTP/file manager) that Waypoint OS does not participate in or automate.

## 8. Automation surface

- No CLI flags: `out/main/index.js` never reads `process.argv`.
- No headless mode: `electron.app.whenReady()` always creates a `BrowserWindow` and loads `out/renderer/index.html`.
- No local HTTP server or socket listener in either process (`grep` for `createServer`/`listen(` returned nothing).
- IPC is only main↔renderer via `contextBridge`/`ipcRenderer.invoke`, not reachable externally; the exposed surface (`out/preload/index.js`) is project/boundary/drone/route CRUD, KML import dialog, KMZ save dialog + write, and self-update controls — nothing that accepts an external mission description.
- **The real automation path is the file format itself**: the WPML XML and KMZ packaging recovered in §2 are simple enough (author, createTime/updateTime, missionConfig, one Folder of Placemarks, one optional actionGroup per waypoint) to regenerate from a script without the GUI at all — no obfuscation, no binary/proprietary encoding, no signature or checksum embedded in the file that DJI Fly would reject. Feeding a self-produced KMZ built to this exact structure into the same `Android/data/.../waypoint/<GUID>/` file location should be indistinguishable from Waypoint OS's own output, as far as static analysis can determine.

## 9. Network behaviour

Every URL literal found in the bundle:

| URL | Purpose | Auth/account needed? |
|---|---|---|
| `https://api.github.com/repos/Pilotbyte-Master/waypointos-releases/releases/latest` | Update check (`update:check` IPC) | No |
| (release asset `browser_download_url`, from the above JSON) | Update download (`update:download` IPC), verified afterwards with `spctl`/Authenticode + quarantine flag | No |
| `https://api.open-meteo.com/v1/elevation` | Terrain-following elevation lookups, batched 100 coords/request, 20 s timeout | No (free public API) |
| `https://nominatim.openstreetmap.org/search?${params}` | Address/place search box | No |
| `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Street basemap tiles | No |
| `https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png` | Label-only overlay basemap | No |
| `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Satellite basemap tiles | No |

No login screen, no account/licence-key check, and **no telemetry or analytics endpoint of any kind** exists in the code (grepped for `analytics`, `telemetry`, `sentry`, `mixpanel`, `posthog`, `segment.io`-style patterns — none found). `exportBlockReason()` only blocks export if terrain-following is enabled but its Open-Meteo call hasn't resolved yet — there is no licence-based export gate. **Mission generation over a hand-drawn boundary works fully offline**; network is only touched for optional basemap tiles/search, optional terrain-follow, and optional self-update checks.

## 10. Licence

The app's own `package.json` declares `"license": "MIT"`. `LICENSE.electron.txt` (MIT, Electron/GitHub Inc.) and `LICENSES.chromium.html` (Chromium's full third-party notice bundle) ship inside the AppImage, standard for any Electron app. No EULA, terms-of-service, or commercial-use-restriction text was found anywhere in either archive (grepped for "EULA", "end user license", "terms of service", "privacy policy" across the whole extracted tree — no hits). Every bundled JS dependency (`@turf/turf`, `jszip`, `maplibre-gl`, `react`/`react-dom`, `react-router-dom`, `sql.js`, `terra-draw`, `terra-draw-maplibre-gl-adapter`, `xmlbuilder2`, `zustand`) carries a permissive licence (MIT or BSD-3-Clause) with no field-of-use or commercial restriction.

## Could not determine

- **macOS build internals**: the two `.dmg` files were only string-scanned for a version/name match (both show `WaypointOS` and `1.6.5`), per the task's "confirm it is the same app and version" instruction. They were not mounted or extracted, so the macOS `app.asar`/Info.plist/entitlements were not independently verified — this analysis treats the Linux build as authoritative for code content and assumes macOS/Windows builds share the same renderer bundle (very likely, since Electron apps ship one JS bundle across platforms, but not directly confirmed here).
- **Whether a DJI Fly-generated KMZ from Waypoint OS actually imports/flies successfully on a Mini 5 Pro + RC2** — this is a static read of the source, not a flight test; DJI Fly's own KMZ validation (checksums, size caps, additional required tags beyond what's shown here) was not tested against a real controller.
- **Full list of every WPML tag DJI Fly expects** (e.g. optional `wpml:payloadParam`/camera-specific blocks) beyond what this app actually emits — since the app's writer is minimal, it's possible DJI Fly silently defaults some fields Waypoint OS omits; that behavior lives in DJI Fly's parser, not in this codebase, and wasn't observable statically.
- **Exact Windows-build behavior** — not provided as an archive to analyze; inferred only from the platform-conditional code paths (`pickAsset`, `verifyWindowsInstaller`) visible in the shared `out/main/index.js`.
