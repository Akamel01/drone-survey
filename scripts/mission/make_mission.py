#!/usr/bin/env python3
"""Write a DJI Fly grid mission for the Mini 5 Pro, in the dialect the RC2 itself uses.

The structure here is copied from a mission built by hand in DJI Fly on the
operator's own RC2 and read back over USB (docs/research/rc2-native-mission-2026-09-12.md):
a KMZ holding wpmz/template.kml and wpmz/waylines.wpml in the uav.com namespace,
with parallel action groups and goBack on signal loss.

Geometry is laid out in local metres about the area's centroid, never in Web
Mercator — that projection's scale factor is what makes drone-flightplan's
spacing shrink by cos(latitude) (hotosm/drone-tm#887).

Usage:
  make_mission.py --aoi lat,lon lat,lon lat,lon lat,lon --out mission.kmz --name "Site A nadir"
"""
import argparse
import json
import math
import sys
import time
import zipfile
from pathlib import Path

# DJI Mini 5 Pro. Sensor and lens are as DJI publishes them; the pixel count is the
# real 50 MP one, not the 12 MP figure drone-flightplan and Waypoint OS both assume.
SENSOR_W_MM, SENSOR_H_MM, FOCAL_MM = 9.6, 7.2, 8.7
IMAGE_W_PX, IMAGE_H_PX = 8192, 6144
DRONE_ENUM, DRONE_SUB_ENUM = 68, 0

# Read off the controller's own capability files, not from a library's constants.
LIMITS = {"gimbal_pitch": (-90.0, 55.0), "speed": (0.1, 15.0), "max_waypoints": 200}
NS = "http://www.uav.com/wpmz/1.0.2"

# Stopping at a photo point costs roughly one v/a of extra time per waypoint:
# decelerate to a halt, accelerate back. An estimate until the rehearsal measures
# it. web/lib/mission.ts holds the same constant and must be changed with it.
STOP_ACCEL_MS2 = 2.5


def local_frame(points):
    """Equirectangular metres about the centroid. Good to well under 0.1% over a Site."""
    lat0 = sum(p[0] for p in points) / len(points)
    lon0 = sum(p[1] for p in points) / len(points)
    m_per_lat = 111132.92 - 559.82 * math.cos(2 * math.radians(lat0)) + 1.175 * math.cos(4 * math.radians(lat0))
    m_per_lon = 111412.84 * math.cos(math.radians(lat0)) - 93.5 * math.cos(3 * math.radians(lat0))
    to_xy = lambda lat, lon: ((lon - lon0) * m_per_lon, (lat - lat0) * m_per_lat)
    to_ll = lambda x, y: (y / m_per_lat + lat0, x / m_per_lon + lon0)
    return to_xy, to_ll


def geodesic_m(a, b):
    """Haversine distance in metres, for verifying what we produced."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def footprint(alt_m):
    """Ground footprint of one frame, and the ground distance one pixel covers."""
    across = SENSOR_W_MM / FOCAL_MM * alt_m
    along = SENSOR_H_MM / FOCAL_MM * alt_m
    return across, along, across / IMAGE_W_PX * 100  # cm per pixel


def longest_edge_angle(xy):
    best, ang = -1.0, 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        d = math.hypot(x2 - x1, y2 - y1)
        if d > best:
            best, ang = d, math.atan2(y2 - y1, x2 - x1)
    return ang


def inside(pt, poly):
    x, y = pt
    hit = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def poly_distance(pt, poly):
    """0 if the point is inside the polygon, otherwise the distance to its nearest edge."""
    if inside(pt, poly):
        return 0.0
    x, y = pt
    best = float("inf")
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        dx, dy = x2 - x1, y2 - y1
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length2))
        best = min(best, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return best


def split_rows(rows, ceiling, speed=0.0, stop_per_point=0.0, battery_seconds=0.0):
    """Cut at the end of a flight line, never mid-line, sharing a waypoint at each seam.

    The battery decides this before the waypoint ceiling does. Mirrors splitPlan()
    in web/lib/mission.ts. Each part finishes by returning home, so the operator
    swaps the battery and selects the next part by hand — resuming a Mission across
    a power cycle is not available on this aircraft (ADR 0016), and the shared seam
    waypoint is what makes continuing exact.
    """
    def cost(i):
        row = rows[i]
        d = sum(geodesic_m(row[j][:2], row[j + 1][:2]) for j in range(len(row) - 1))
        # The leg from the end of the previous pass to the start of this one is
        # flown too, and on a long Site it is not a rounding error.
        if i > 0:
            d += geodesic_m(rows[i - 1][-1][:2], row[0][:2])
        return (d / speed + len(row) * stop_per_point) if speed > 0 else 0.0

    parts, minutes, cur, cur_seconds = [], [], [], 0.0
    for i, row in enumerate(rows):
        c = cost(i)
        too_many = cur and len(cur) + len(row) > ceiling
        too_long = cur and battery_seconds > 0 and cur_seconds + c > battery_seconds
        if too_many or too_long:
            parts.append(cur)
            minutes.append(cur_seconds / 60)
            cur = [cur[-1]]
            cur_seconds = 0.0
        cur.extend(row)
        cur_seconds += c
    parts.append(cur)
    minutes.append(cur_seconds / 60)
    return parts, minutes


def plan_grid(aoi_ll, alt, fwd_overlap, side_overlap, margin_passes):
    """Photo positions covering the area, on lines along its longest edge."""
    to_xy, to_ll = local_frame(aoi_ll)
    poly = [to_xy(lat, lon) for lat, lon in aoi_ll]
    across, along, gsd = footprint(alt)
    side_spacing = across * (1 - side_overlap / 100)
    fwd_spacing = along * (1 - fwd_overlap / 100)

    theta = longest_edge_angle(poly)
    c, s = math.cos(-theta), math.sin(-theta)
    rot = [(x * c - y * s, x * s + y * c) for x, y in poly]
    unrot = lambda x, y: (x * math.cos(theta) - y * math.sin(theta), x * math.sin(theta) + y * math.cos(theta))

    xs = [p[0] for p in rot]
    ys = [p[1] for p in rot]
    # The grid is extended a full pass beyond the boundary: design.md section 5.
    x0, x1 = min(xs) - margin_passes * fwd_spacing, max(xs) + margin_passes * fwd_spacing
    y0, y1 = min(ys) - margin_passes * side_spacing, max(ys) + margin_passes * side_spacing

    lines, y, flip = [], y0, False
    # Step at exactly the intended spacing. Dividing the line into equal parts
    # instead stretches the gap between photos and quietly loses Overlap — the
    # first run of this generator did that and drifted 2.2%.
    n = max(2, math.ceil((x1 - x0) / fwd_spacing) + 1)
    while y <= y1 + 1e-6:
        row = [(x0 + i * fwd_spacing, y) for i in range(n)]
        lines.append(row[::-1] if flip else row)
        flip = not flip
        y += side_spacing

    # Keep only the positions that serve the area: inside it, or within the margin
    # of passes beyond its boundary. Without this the grid covers the area's
    # bounding box, which for any shape but a rectangle is mostly photographs of
    # somewhere else — a triangle came out 87 of 102 positions outside it.
    #
    # The distance is measured in passes rather than metres. One pass along a line
    # and one pass across are different distances, and the margin has to mean the
    # same thing in both directions.
    norm = lambda p: (p[0] / fwd_spacing, p[1] / side_spacing)
    npoly = [norm(p) for p in rot]
    lines = [[p for p in row if poly_distance(norm(p), npoly) <= margin_passes + 1e-9] for row in lines]
    lines = [row for row in lines if row]

    rows_ll = [[to_ll(*unrot(x, y)) for x, y in row] for row in lines]
    pts = [p for row in rows_ll for p in row]
    return pts, rows_ll, {
        "gsd_cm": gsd, "footprint_across_m": across, "footprint_along_m": along,
        "side_spacing_m": side_spacing, "fwd_spacing_m": fwd_spacing,
        "lines": len(lines), "photos": len(pts),
    }


def mission_config(speed):
    return f"""    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>goHome</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:globalTransitionalSpeed>{speed:g}</wpml:globalTransitionalSpeed>
      <wpml:droneInfo>
        <wpml:droneEnumValue>{DRONE_ENUM}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>{DRONE_SUB_ENUM}</wpml:droneSubEnumValue>
      </wpml:droneInfo>
    </wpml:missionConfig>"""


def placemark(i, lat, lon, alt, speed, pitch, turn_mode, first, poi=None):
    # DJI Fly writes an explicit gimbalRotate on the first waypoint and
    # gimbalEvenlyRotate on the rest; mirroring that rather than inventing a shape.
    if first:
        gimbal = f"""          <wpml:action>
            <wpml:actionId>2</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase>
              <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
              <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
              <wpml:gimbalPitchRotateAngle>{pitch:g}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateEnable>1</wpml:gimbalRollRotateEnable>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
              <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
              <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
              <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
"""
    else:
        gimbal = f"""          <wpml:action>
            <wpml:actionId>2</wpml:actionId>
            <wpml:actionActuatorFunc>gimbalEvenlyRotate</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:gimbalPitchRotateAngle>{pitch:g}</wpml:gimbalPitchRotateAngle>
              <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
"""
    # An orbit aims the aircraft at its subject; a grid follows the flight line.
    if poi:
        heading = (
            "          <wpml:waypointHeadingMode>towardPOI</wpml:waypointHeadingMode>\n"
            "          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>\n"
            f"          <wpml:waypointPoiPoint>{poi[0]:.12f},{poi[1]:.12f},{poi[2]:g}</wpml:waypointPoiPoint>\n"
        )
    else:
        heading = (
            "          <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>\n"
            "          <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>\n"
            "          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>\n"
        )
    return f"""      <Placemark>
        <Point>
          <coordinates>
            {lon:.12f},{lat:.12f}
          </coordinates>
        </Point>
        <wpml:index>{i}</wpml:index>
        <wpml:executeHeight>{alt:g}</wpml:executeHeight>
        <wpml:waypointSpeed>{speed:g}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
{heading}          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
          <wpml:waypointHeadingPoiIndex>0</wpml:waypointHeadingPoiIndex>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>{turn_mode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>0</wpml:useStraightLine>
        <wpml:actionGroup>
          <wpml:actionGroupId>{i + 1}</wpml:actionGroupId>
          <wpml:actionGroupStartIndex>{i}</wpml:actionGroupStartIndex>
          <wpml:actionGroupEndIndex>{i}</wpml:actionGroupEndIndex>
          <wpml:actionGroupMode>parallel</wpml:actionGroupMode>
          <wpml:actionTrigger>
            <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
          </wpml:actionTrigger>
          <wpml:action>
            <wpml:actionId>1</wpml:actionId>
            <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
            <wpml:actionActuatorFuncParam>
              <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
              <wpml:useGlobalPayloadLensIndex>0</wpml:useGlobalPayloadLensIndex>
            </wpml:actionActuatorFuncParam>
          </wpml:action>
{gimbal}        </wpml:actionGroup>
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>0</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
      </Placemark>
"""


def orbit_rings(orbit, camera_interval, speed):
    """Photo positions around a subject: one ring per altitude, each starting due north.

    Mirrors orbitPreview() in web/lib/mission.ts. The gimbal angle is computed per
    ring from the slant geometry, so the fixed tilt and the point-of-interest
    framing agree rather than fight — ADR 0016 records that a heading aimed at a
    point of interest otherwise cancels a fixed angle.
    """
    lat0, lon0 = orbit["center"]
    to_xy, to_ll = local_frame([(lat0, lon0)])
    n = int(round(orbit["photos_per_ring"]))
    r = float(orbit["radius_m"])
    direction = 1 if orbit.get("clockwise", True) else -1
    target_h = float(orbit.get("target_height_m", 0.0))

    rings = []
    for alt in sorted(float(a) for a in orbit["altitudes_m"]):
        # Looking down at the subject from this ring: negative is below horizontal.
        pitch = -math.degrees(math.atan2(alt - target_h, r))
        pitch = max(LIMITS["gimbal_pitch"][0], min(LIMITS["gimbal_pitch"][1], pitch))
        ring = []
        for i in range(n):
            th = direction * 2 * math.pi * i / n
            lat, lon = to_ll(math.sin(th) * r, math.cos(th) * r)
            ring.append((lat, lon, alt, pitch))
        rings.append(ring)

    arc = 2 * math.pi * r / n
    cap = arc / camera_interval if camera_interval > 0 else float("inf")
    if speed > cap:
        print(f"speed capped at {cap:.2f} m/s by the {camera_interval:g}s shutter interval "
              f"(was {speed:g})", file=sys.stderr)
        speed = round(cap, 2)

    slant = max(math.hypot(r, ring[0][2] - target_h) for ring in rings)
    across = SENSOR_W_MM / FOCAL_MM * slant
    return rings, speed, {
        "gsd_cm": across / IMAGE_W_PX * 100,
        "arc_spacing_m": arc,
        "overlap_pct": (1 - arc / across) * 100,
        "rings": len(rings),
        "photos": sum(len(x) for x in rings),
        "slant_range_m": slant,
    }


def write_kmz(path, name, pts, alt, speed, pitch, turn_mode, poi=None):
    now = int(time.time() * 1000)
    cfg = mission_config(speed)
    template = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="{NS}">
  <Document>
    <wpml:author>{name}</wpml:author>
    <wpml:createTime>{now}</wpml:createTime>
    <wpml:updateTime>{now}</wpml:updateTime>
{cfg}
  </Document>
</kml>
"""
    # A grid flies one height at one angle; an orbit carries its own per ring.
    body = "".join(
        placemark(i, p[0], p[1], p[2] if len(p) > 2 else alt, speed,
                  p[3] if len(p) > 3 else pitch, turn_mode, i == 0, poi)
        for i, p in enumerate(pts)
    )
    waylines = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="{NS}">
  <Document>
{cfg}
    <Folder>
      <wpml:templateId>0</wpml:templateId>
      <wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode>
      <wpml:waylineId>0</wpml:waylineId>
      <wpml:distance>0</wpml:distance>
      <wpml:duration>0</wpml:duration>
      <wpml:autoFlightSpeed>{speed:g}</wpml:autoFlightSpeed>
{body}    </Folder>
  </Document>
</kml>
"""
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("wpmz/template.kml", template)
        z.writestr("wpmz/waylines.wpml", waylines)


def verify(pts, plan, alt, speed, pitch, turn="through"):
    """Check the mission against the request and the aircraft's limits before it is loaded."""
    problems = []
    lo, hi = LIMITS["gimbal_pitch"]
    if not lo <= pitch <= hi:
        problems.append(f"gimbal {pitch} outside the aircraft's {lo}..{hi}")
    lo, hi = LIMITS["speed"]
    if not lo <= speed <= hi:
        problems.append(f"speed {speed} outside the aircraft's {lo}..{hi}")
    if len(pts) > LIMITS["max_waypoints"]:
        problems.append(f"{len(pts)} waypoints exceeds DJI Fly's {LIMITS['max_waypoints']}; split required")
    if alt > 120:
        problems.append(f"altitude {alt} m is above the 120 m ceiling")

    # Measured, not assumed: the along-line spacing as flown on the ellipsoid.
    same_line = [geodesic_m(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    same_line = sorted(d for d in same_line if d < plan["side_spacing_m"] * 0.9)
    measured = same_line[len(same_line) // 2] if same_line else float("nan")
    drift = abs(measured - plan["fwd_spacing_m"]) / plan["fwd_spacing_m"] * 100
    if drift > 2:
        problems.append(f"measured spacing {measured:.2f} m differs from intended {plan['fwd_spacing_m']:.2f} m by {drift:.1f}%")

    dist = sum(geodesic_m(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
    # Stopping at each point buys a still taken at rest and costs time per waypoint.
    penalty = len(pts) * speed / STOP_ACCEL_MS2 if turn == "stop" else 0.0
    return {
        "measured_fwd_spacing_m": round(measured, 2),
        "path_length_m": round(dist),
        "flight_time_min_at_speed": round((dist / speed + penalty) / 60, 1),
        "problems": problems,
    }


def load_spec(path, args):
    """Fill the arguments from a Mission Spec written by the planner (web/lib/spec.ts)."""
    spec = json.loads(Path(path).read_text())
    if spec.get("version") != 1:
        raise SystemExit(f"unsupported Mission Spec version {spec.get('version')!r}")
    f, cam = spec["flight"], spec["camera"]
    # A Spec written before orbits existed has neither field, and is a grid.
    args.mission_type = spec.get("mission_type", "grid")
    args.orbit = spec.get("orbit")
    args.aoi = [f"{lat},{lon}" for lat, lon in spec.get("aoi", [])]
    args.altitude = f["altitude_m"]
    args.forward_overlap = f["forward_overlap_pct"]
    args.side_overlap = f["side_overlap_pct"]
    args.gimbal = f["gimbal_pitch_deg"]
    args.speed = f["speed_ms"]
    args.turn = f["turn"]
    args.margin_passes = f["margin_passes"]
    # A Spec written before battery splitting existed keeps the flag's default.
    args.battery = f.get("battery_minutes", args.battery)
    args.interval = cam["interval_s"]
    if not args.name:
        args.name = f"{spec['site']} {spec['date']}".strip()
    return spec


def run_orbit(args):
    """Write an orbit Mission: rings of photo positions aimed at a subject.

    The capture a nadir grid cannot produce. Splatting wants to see a subject from
    around it, and design.md section 5 requires oblique passes alongside the grid
    for the same reason: nothing in a nadir-only block distinguishes a small lens
    error from real curvature, so the surface bows.
    """
    if not args.orbit or not args.orbit.get("center"):
        print(json.dumps({"problems": ["no point of interest set"]}, indent=2))
        return 1

    rings, speed, plan = orbit_rings(args.orbit, args.interval, args.speed)
    poi = (args.orbit["center"][0], args.orbit["center"][1],
           float(args.orbit.get("target_height_m", 0.0)))
    turn_mode = ("toPointAndPassWithContinuityCurvature" if args.turn == "through"
                 else "toPointAndStopWithContinuityCurvature")

    longest = max(len(r) for r in rings)
    if longest > LIMITS["max_waypoints"]:
        print(json.dumps({"problems": [
            f"one ring holds {longest} waypoints, more than DJI Fly's {LIMITS['max_waypoints']}"
        ]}, indent=2))
        return 1
    stop_per_point = speed / STOP_ACCEL_MS2 if args.turn == "stop" else 0.0
    parts, part_minutes = split_rows(rings, LIMITS["max_waypoints"], speed,
                                     stop_per_point, args.battery * 60)

    out = Path(args.out)
    results, failed = [], False
    for i, part in enumerate(parts, 1):
        path = out if len(parts) == 1 else out.with_name(f"{out.stem}-part{i}{out.suffix}")
        name = args.name if len(parts) == 1 else f"{args.name} part {i}"

        problems = []
        lo, hi = LIMITS["speed"]
        if not lo <= speed <= hi:
            problems.append(f"speed {speed} outside the aircraft's {lo}..{hi}")
        highest = max(p[2] for p in part)
        if highest > 120:
            problems.append(f"altitude {highest} m is above the 120 m ceiling")
        if plan["overlap_pct"] < 60:
            problems.append(f"only {plan['overlap_pct']:.0f}% overlap between neighbouring "
                            f"photos; raise photos per ring or the radius")

        dist = sum(geodesic_m(part[j][:2], part[j + 1][:2]) for j in range(len(part) - 1))
        penalty = len(part) * speed / STOP_ACCEL_MS2 if args.turn == "stop" else 0.0
        write_kmz(path, name, part, args.altitude, speed, args.gimbal, turn_mode, poi)
        failed = failed or bool(problems)
        results.append({
            "out": str(path), "name": name, "waypoints": len(part),
            "path_length_m": round(dist),
            "flight_time_min_at_speed": round((dist / speed + penalty) / 60, 1),
            "problems": problems,
        })

    print(json.dumps({"mission_type": "orbit", "turn": args.turn, "parts": len(parts),
                      "speed_ms": speed, "battery_minutes": args.battery,
                      "part_minutes": [round(m, 4) for m in part_minutes],
                      **plan, "missions": results}, indent=2))
    return 1 if failed else 0


def main():
    ap = argparse.ArgumentParser()
    ap.set_defaults(mission_type="grid", orbit=None)
    ap.add_argument("--spec", help="Mission Spec JSON from the planner; supplies everything but --out")
    ap.add_argument("--aoi", nargs="+", help="polygon corners as lat,lon")
    ap.add_argument("--out", required=True)
    ap.add_argument("--name")
    ap.add_argument("--altitude", type=float, default=80.0)
    ap.add_argument("--forward-overlap", type=float, default=80.0)
    ap.add_argument("--side-overlap", type=float, default=70.0)
    ap.add_argument("--gimbal", type=float, default=-80.0)
    ap.add_argument("--speed", type=float, default=5.0)
    ap.add_argument("--margin-passes", type=float, default=1.0)
    ap.add_argument("--battery", type=float, default=16.0,
                    help="usable flying minutes on one battery; splits the Mission so each "
                         "part can be flown on a fresh one. 0 disables the limit")
    ap.add_argument("--turn", choices=["through", "stop"], default="through",
                    help="fly through each photo point, or stop at it")
    ap.add_argument("--interval", type=float, default=0.0,
                    help="slowest the camera can shoot, in seconds; caps speed so no photo is missed")
    ap.add_argument("--reverse", action="store_true",
                    help="run the lines from the opposite end, so two otherwise identical "
                         "missions start at different corners and can be told apart on the Controller")
    args = ap.parse_args()

    if args.spec:
        load_spec(args.spec, args)
    if not args.name:
        ap.error("--spec, or both --aoi and --name, are required")
    if args.mission_type == "orbit":
        return run_orbit(args)
    if not args.aoi:
        ap.error("--spec, or both --aoi and --name, are required")

    # The camera, not the aircraft, sets the pace when a photo is due at every
    # waypoint: DJI Fly cannot shoot faster than its interval, and a mission
    # flown quicker than that silently drops photographs.
    if args.interval > 0:
        _, along, _ = footprint(args.altitude)
        spacing = along * (1 - args.forward_overlap / 100)
        cap = spacing / args.interval
        if args.speed > cap:
            # Notices go to stderr: stdout is the machine-readable report.
            print(f"speed capped at {cap:.2f} m/s by the {args.interval:g}s shutter interval "
                  f"(was {args.speed:g})", file=sys.stderr)
            args.speed = round(cap, 2)

    aoi = [tuple(float(v) for v in c.split(",")) for c in args.aoi]
    pts, rows, plan = plan_grid(aoi, args.altitude, args.forward_overlap, args.side_overlap, args.margin_passes)
    turn_mode = ("toPointAndPassWithContinuityCurvature" if args.turn == "through"
                 else "toPointAndStopWithContinuityCurvature")

    if args.reverse:
        rows = rows[::-1]
        # Keep the lawnmower continuous after flipping the running order: each line
        # starts at whichever end is nearer where the previous one finished.
        for i in range(1, len(rows)):
            if geodesic_m(rows[i][0], rows[i - 1][-1]) > geodesic_m(rows[i][-1], rows[i - 1][-1]):
                rows[i] = rows[i][::-1]
        pts = [p for row in rows for p in row]

    # Cut at the end of a flight line, never mid-line, and let consecutive parts
    # share a waypoint so no coverage is lost at the seam (ADR 0016).
    # Balance the parts rather than filling each to the ceiling: packing greedily
    # gives a long leg followed by a stub, which is a poor sequence in the field.
    longest = max(len(r) for r in rows)
    if longest > LIMITS["max_waypoints"]:
        print(json.dumps({"problems": [
            f"one flight line holds {longest} waypoints, more than DJI Fly's "
            f"{LIMITS['max_waypoints']}; the area is too long to split at a line boundary"
        ]}, indent=2))
        return 1
    stop_per_point = args.speed / STOP_ACCEL_MS2 if args.turn == "stop" else 0.0
    parts, part_minutes = split_rows(rows, LIMITS["max_waypoints"], args.speed,
                                     stop_per_point, args.battery * 60)

    out = Path(args.out)
    results, failed = [], False
    for i, part in enumerate(parts, 1):
        path = out if len(parts) == 1 else out.with_name(f"{out.stem}-part{i}{out.suffix}")
        name = args.name if len(parts) == 1 else f"{args.name} part {i}"
        report = verify(part, plan, args.altitude, args.speed, args.gimbal, args.turn)
        write_kmz(path, name, part, args.altitude, args.speed, args.gimbal, turn_mode)
        failed = failed or bool(report["problems"])
        results.append({"out": str(path), "name": name, "waypoints": len(part), **report})

    print(json.dumps({"turn": args.turn, "parts": len(parts),
                      "battery_minutes": args.battery,
                      "part_minutes": [round(m, 4) for m in part_minutes],
                      **plan, "missions": results}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
