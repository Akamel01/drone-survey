# What DJI Fly actually writes on the RC2 — 2026-09-12

A mission built by hand in DJI Fly on the operator's own RC2, then read back over
USB. Until now every claim about this file format came from reverse-engineered
tools or forum posts. This is first-hand evidence from the exact controller and
aircraft the business flies, and it contradicts several of them.

**The mission was built deliberately to exercise the features we care about:**
six waypoints, a photo action at each, a five-second hover, headings pointed at a
point of interest, and a −90° gimbal.

## Getting it off the controller

| | |
|---|---|
| Connection | USB-C to the Linux host; the controller enumerates as `2ca3:1021 DJI KATMAI-IDP`, serial `6UZTP6R001S5XA`, at high speed |
| Tool | `jmtpfs` (libmtp 1.1.21), mounted read-only in practice; nothing was written |
| Recognition | **libmtp does not know this device** — "VID=2ca3 and PID=1021 is UNKNOWN" — and falls back to generic Android handling, which works |
| Path | `Internal shared storage/Android/data/dji.go.v5/files/waypoint/` |

**`Android/data` is readable over USB on the RC2.** This was the single largest
unknown in the loading design, sourced previously only from forum reports, and it
holds on this hardware.

**The package is `dji.go.v5`, with no `com.` prefix.** The guide the operator was
given says `com.dji.go.v5`, which does not exist on the device.

### What a mission looks like on disk

```
waypoint/
├── 888F850E-CFDC-4F53-B789-19D16ACABC76/
│   ├── 888F850E-CFDC-4F53-B789-19D16ACABC76.kmz   2,039 bytes
│   └── image/ShotSnap.json                        {"WAY_POINT":{},"POI_POINT":{}}
├── capability/                                     five JSON files, below
└── map_preview/888F850E-…/888F850E-….jpg          thumbnail
```

The mission is a **KMZ**, not a KML. The folder and the file share one GUID.

## The capability files — aircraft limits, written by the app

Nothing in prior research mentioned these. They sit beside the missions and
record what the connected aircraft allows:

| File | Contents |
|---|---|
| `GIMBAL_PITCHCapability.json` | `{"max":55.0,"min":-90.0}` |
| `GIMBAL_ROLLCapability.json` | `{"max":45.0,"min":-180.0}` |
| `SPEEDCapability.json` | `{"defaultValue":2.5,"max":15.0,"min":0.1}` |
| `LOST_ACTIONCapability.json` | `["RTH","Hover","Landing","Continue"]` |
| `ZOOMCapability.json` | `[{"defaultValue":1.0,"maxValue":4.0,"minValue":1.0,"type":"WIDE_CAM"}]` |

**These are the bounds a generated mission must respect**, and they come from the
aircraft rather than from a table in someone's source code. Two matter
immediately:

- **Speed can reach 15 m/s**, where `drone-flightplan` hard-codes a 11.5 m/s
  ceiling it attributes to an RC2 quirk.
- **Gimbal pitch spans −90° to +55°**, so −80° is comfortably inside range.

## The mission file itself

Two files inside the KMZ, both in the **`http://www.uav.com/wpmz/1.0.2`**
namespace:

| Entry | Size |
|---|---|
| `wpmz/template.kml` | 823 bytes — mission configuration only, no waypoints |
| `wpmz/waylines.wpml` | 19,392 bytes — the six waypoints and their actions |

This settles three disputed points at once:

1. **DJI Fly writes two files.** `drone-flightplan` writes only `waylines.wpml`,
   so its output is structurally unlike anything DJI Fly produces.
2. **The namespace is `uav.com`, not `dji.com`.** Waypoint OS and
   `drone-flightplan` both emit `dji.com`, the enterprise dialect. FlyPath, which
   reverse-engineered a real device dump, has it right.
3. **`template.kml` here carries no waypoints** — only mission configuration.
   That differs from FlyPath's note that both files must hold identical waypoint
   lists, and is worth testing before relying on either shape.

### Mission configuration, identical in both files

```xml
<wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
<wpml:finishAction>goHome</wpml:finishAction>
<wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
<wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
<wpml:globalTransitionalSpeed>2</wpml:globalTransitionalSpeed>
<wpml:droneInfo><wpml:droneEnumValue>68</wpml:droneEnumValue>
<wpml:droneSubEnumValue>0</wpml:droneSubEnumValue></wpml:droneInfo>
```

**On losing the controller's signal, DJI Fly's own mission returns home.** Both
generators we examined hard-code `goContinue` — keep flying the mission with no
link. That is a safety default we would have shipped without noticing, and it is
now settled by the aircraft's own app.

`droneEnumValue` 68 matches what `drone-flightplan` writes for the Mini 5 Pro.

### What the six waypoints contain

| | |
|---|---|
| Height | `executeHeight` 41 on every waypoint, `executeHeightMode` `relativeToStartPoint` |
| Speed | `waypointSpeed` 2 on every waypoint; `autoFlightSpeed` 2.5 |
| Heading | `towardPOI` on five, `followWayline` on the last, with a real `waypointPoiPoint` of 49.189604, −122.839556, 50.0 |
| Turn | **two modes in one mission**: `toPointAndStopWithContinuityCurvature` on the first and last, `toPointAndPassWithContinuityCurvature` on the middle four |
| Actions | 5 × `takePhoto`, 5 × `gimbalEvenlyRotate`, 1 × `gimbalRotate`, 1 × `hover` (5 s) |
| Triggers | every action group is `reachPoint` |
| Group mode | every group is **`parallel`** |

**Confirmed honoured on consumer hardware**, all previously unverified:
`takePhoto` at a waypoint, `hover` with a duration, `towardPOI` heading with a
point of interest, and per-waypoint turn behaviour.

**`actionGroupMode` is `parallel`.** Both generators write `sequence`.

**The last waypoint carries no actions**, so a six-point mission takes five
photos.

**`waypointHeadingPathMode` is `followBadArc`** on every waypoint — the literal
string DJI uses, and a reminder that this dialect is not a cleaned-up spec.

### Where the gimbal angle lives, and what cancels it

The first mission read off the controller recorded **no gimbal angle at all** —
every field zero — even though the operator had set −90°. A second reading, after
the operator re-applied the tilt and set headings to manual, resolved it.

| Field | First reading | Second reading |
|---|---|---|
| `gimbalPitchRotateAngle`, inside gimbal actions | 0 × 6 | **−90 × 6** |
| `gimbalPitchRotateEnable`, in the explicit `gimbalRotate` | 0 | **1** |
| `waypointGimbalPitchAngle`, per waypoint | 0 | 0 |
| `waypointHeadingMode` | `towardPOI` × 5 | `manually` × 1, `followWayline` × 5 |

**Tilt is carried by the gimbal *actions*, not by the per-waypoint gimbal field.**
`waypointGimbalHeadingParam` / `waypointGimbalPitchAngle` is present on every
waypoint and stays 0 whether or not a tilt is set, so it is not where the angle
belongs. A generator must write `gimbalRotate` and `gimbalEvenlyRotate` actions
with `gimbalPitchRotateAngle`, and set `gimbalPitchRotateEnable` on the explicit
one.

**Pointing at a point of interest cancels the tilt.** In the first mission the
operator set −90° and then chose a point of interest; DJI Fly aimed the camera at
that point and wrote the tilt out as zero. The two controls are mutually
exclusive in the app, and the point of interest wins.

That interaction constrains the capture standard directly:

- **Grid Missions** fly with `followWayline` or `manually` heading, so their
  −80° tilt can be written into the mission and will hold.
- **Orbits around a structure**, which the Gaussian Splatting capture wants, use
  `towardPOI` — and there the point of interest sets the camera angle. A fixed
  tilt cannot be combined with it, so an orbit's framing has to be arranged
  through the point of interest's own altitude rather than through a tilt value.

### The file is live, not a stale export

Editing the mission in DJI Fly and saving rewrites this KMZ immediately:
`executeHeight` went 41 → 48, the file's checksum changed, and its timestamp
advanced. An earlier concern — that the app might keep the authoritative mission
in a private database and leave this file behind as a partial export — does not
hold. What the app saves is what sits here.

## Consequences for what we build

- **Write both files**, in the `uav.com` namespace, matching this structure —
  not the enterprise dialect that two of the three candidate generators emit.
- **Default to returning home on signal loss**, as the app does.
- **Validate against the capability files**, which state the aircraft's real
  limits, rather than against constants in a third-party library.
- **`drone-flightplan`'s output diverges from this file in namespace, file count,
  action group mode and signal-loss behaviour.** Using it unmodified would put a
  structurally foreign mission onto the controller.
