# Mission generator hands-on test — 2026-09-10

A hands-on test of `drone-flightplan`, the open-source mission generator
recommended by the mission planning research. The research established that the
library exists; this test establishes what it actually produces for our aircraft
and capture standard, and where it is wrong.

## What it is

| | |
|---|---|
| Package | `drone-flightplan` 1.0.0, from the Humanitarian OpenStreetMap Team's Drone Tasking Manager |
| Licence | **AGPL-3.0-only** |
| Python | ≥3.10 |
| Pinned dependency | **`gdal==3.10.3` exactly** |
| Aircraft supported | DJI Mini 4 Pro, **DJI Mini 5 Pro**, DJI Air 3, Potensic Atom 1 and 2, plus MAVLink, QGroundControl and Litchi output |
| DJI output | WPML inside a KMZ, `droneEnumValue` 68 for the Mini 5 Pro |
| Terrain following | Supported when a DEM GeoTIFF is supplied with `--inraster` |

**Installing it.** The exact GDAL pin makes pip compile GDAL 3.10.3's Python
bindings against whatever GDAL is installed, and that fails on anything newer.
It failed on macOS with Homebrew GDAL 3.13 and on Linux in the latest GDAL image.
It installs cleanly in `ghcr.io/osgeo/gdal:ubuntu-small-3.10.3`, where system
GDAL matches the pin. That is the image a Node should build from.

**Licence.** Running the generator as a separate process that writes mission
files carries no obligations, for the same reason as ADR 0001. Importing it into
our own code that is later distributed or exposed over a network would. The fixes
below require either importing its API or patching it, so the Node must stay
internal.

## Test

A 100 m × 90 m polygon at 80 m altitude, 80% forward and 70% side overlap,
Mini 5 Pro, in both flight modes.

### Two flight modes, and only one takes photos

| Mode | Waypoints | Photo actions | What takes the photos |
|---|---|---|---|
| `waylines` — continuous flight | 11 | **none**, gimbal actions only | interval shooting armed by hand in DJI Fly |
| `waypoints` — stop at each point | 66 | **55 `takePhoto`**, triggered on reaching each point | the mission itself |

This is the finding that matters most for ADR 0015. **If DJI Fly executes
`takePhoto` on arrival at a waypoint for the Mini 5 Pro, waypoints mode needs no
manual step to capture photos.** Overlap is then exact, because photos are taken
at computed positions rather than by a timer that drifts with wind and speed.
Waylines mode cannot avoid the manual interval-shooting step.

Whether DJI Fly honours those actions is **not verified**. It needs the
operator's video transcripts or one flight with the RC2.

### Camera settings

- **Gimbal pitch is −80°, not −90°.** The library's `GimbalAngle` enum includes
  `NADIR = "-90"`, but the command line never sets it; it defaults to
  `OFF_NADIR`. It can be set to −90° through the Python API. A slightly off-nadir
  camera is a known way to reduce doming, so this default looks deliberate. It
  still differs from the capture standard.
- **The Mini 5 Pro is modelled as a 12 MP camera** (`image_width_px` 4032). The
  real sensor is 50 MP, 8192×6144. Sensor size and focal length are correct, so
  field of view, footprint and spacing are unaffected. **GSD-based planning is
  wrong for 50 MP**: requesting 1.47 cm/px would plan the flight at about 41 m
  rather than 80 m. The Node must specify altitude, never GSD.
- **Altitude is relative to the take-off point** unless a DEM is supplied, so
  sloped Sites need the DEM option.

## Bug 1 — spacing shrinks with latitude

**Confirmed.** The generator computes spacing in metres, then lays the grid out
in Web Mercator (EPSG:3857) without correcting for its scale factor. Web Mercator
stretches distance by 1/cos(latitude), so true ground spacing comes out at the
intended spacing × cos(latitude).

The same 100 m × 90 m area at four latitudes, where the formula intends 15.84 m
between photos:

| Latitude | cos(latitude) | Measured ÷ intended spacing | Waypoints |
|---|---|---|---|
| 0° | 1.000 | 0.997 | 28 |
| 30° | 0.866 | 0.863 | 41 |
| 49.3° | 0.652 | 0.650 | 66 |
| 60° | 0.500 | 0.498 | 97 |

The ratio equals cos(latitude) at every latitude tested. At 49.3°N, line spacing
measured 19.6 m against an intended 30 m, which is again ×0.652.

**Consequences in Canada, 43–60°N:** spacing shrinks by 27–50%. A Site needs up to
twice the photos, flight time and batteries that were intended, overlap varies
from Site to Site, and the library's flight-time and battery estimates are wrong
by the same factor. The error inflates overlap rather than reducing it, so
quality does not suffer, but the operator's time does.

The library's main users map near the equator, which is probably why nobody has
reported it.

## Bug 2 — speed is fixed at 11.5 m/s

**Read from the source, not yet flight-tested.** In `calculate_parameters`:

```python
if ground_speed > 12 and drone_type in [DJI_MINI_5_PRO, DJI_MINI_4_PRO, DJI_AIR_3]:
    ground_speed = 11.5
elif drone_type == POTENSIC_ATOM_1:
    ground_speed = 8.0
else:
    ground_speed = 11.5
```

For any computed speed of 12 m/s or less, the `else` branch still sets 11.5 m/s.
The generated WPML shows `waypointSpeed` 11.5 as expected.

**This one does cost quality in waylines mode.** Photos there come from a time
interval, so spacing = speed × interval. At 11.5 m/s with the default 2-second
interval, photos are 23 m apart. Against the real 86 m along-track footprint at
80 m, that is about **73% forward overlap, below the 80% standard**. Waypoints
mode is unaffected, because its photo positions are computed.

A source comment also says speeds over 12 m/s make the RC2 drop to 2.5 m/s, and
the file carries `autoFlightSpeed` 2.5. How the RC2 actually behaves needs a
flight.

## Loading the mission onto the RC2 from macOS and Linux

The research named `aft-mtp-cli` from Homebrew for macOS. That is out of date:

| Option | Status |
|---|---|
| `whoozle-android-file-transfer` (provides `aft-mtp-cli`) | **Disabled in Homebrew on 2026-09-01**; fails the Gatekeeper check |
| `simple-mtpfs` | Deprecated; will be disabled 2027-06-21 |
| `libmtp` 1.1.23 | Maintained and bottled; provides `mtp-detect`, `mtp-files`, `mtp-sendfile` and related tools |
| Linux `jmtpfs` / `libmtp` | Available |

Mission loading is better placed on the Linux host, where the tooling is
healthier and the other Nodes already run. **Whether the RC2 actually lets its
DJI Fly waypoint folder be overwritten over MTP is not verified** and needs the
controller connected.

## What the Node must do

1. Build from the GDAL 3.10.3 image.
2. Always set altitude, never GSD, until the camera model reflects 50 MP.
3. **Correct the latitude bug**, preferably by laying the grid out in a local UTM
   projection rather than Web Mercator; otherwise by dividing the intended spacing
   by cos(latitude) before it is applied.
4. **Use waypoints mode**, if flight evidence confirms DJI Fly honours
   `takePhoto`, so that capture needs no manual step and overlap is exact.
5. Set gimbal pitch explicitly, to whichever angle the capture standard settles on.
6. Pass a DEM for sloped Sites.
7. Verify every generated plan before loading it: photo count, true ground
   spacing measured the way this test did, and the gimbal angle. The latitude bug
   went unnoticed because nothing checked the output against the request.

## Not verified

- Whether DJI Fly on the RC2 executes `takePhoto` actions at waypoints for the
  Mini 5 Pro.
- Whether the RC2's waypoint folder can be written over MTP from Linux.
- The RC2's behaviour at the 11.5 m/s speed the generator writes.
- Whether waypoints mode's stop at every point is fast enough to cover a Site on
  a practical number of batteries.
