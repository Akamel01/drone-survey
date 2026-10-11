#!/usr/bin/env python3
"""Write the DJI Fly Missions a Dispatched Spec records, in the dialect the RC2 itself uses.

The structure here is copied from a mission built by hand in DJI Fly on the
operator's own RC2 and read back over USB (docs/research/rc2-native-mission-2026-09-12.md):
a KMZ holding wpmz/template.kml and wpmz/waylines.wpml in the uav.com namespace,
with parallel action groups and goBack on signal loss.

This writer computes no geometry. Dispatch records in the Spec the parts it
reserved Cards for, waypoint by waypoint (web/lib/mission.ts, the one place a
Mission is laid out and split; #346, ADR 0017). This file serialises each part
and gates it against the request and the aircraft's limits before it is loaded.

Usage:
  make_mission.py --spec dispatched.json --out mission.kmz
"""
import argparse
import json
import math
import time
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

# DJI Mini 5 Pro. Sensor and lens are as DJI publishes them; the pixel count is the
# real 50 MP one. Here only to gate the plan against the requested Overlap.
SENSOR_W_MM, SENSOR_H_MM, FOCAL_MM = 9.6, 7.2, 8.7
IMAGE_W_PX = 8192
DRONE_ENUM, DRONE_SUB_ENUM = 68, 0

# Read off the controller's own capability files, not from a library's constants.
LIMITS = {"gimbal_pitch": (-90.0, 55.0), "speed": (0.1, 15.0), "max_waypoints": 200}
ALTITUDE_CEILING_M = 120
NS = "http://www.uav.com/wpmz/1.0.2"

# Stopping at a photo point costs roughly one v/a of extra time per waypoint.
# Only for the flight time the report states; the split itself is decided at
# Dispatch with web/lib/mission.ts's copy of this constant.
STOP_ACCEL_MS2 = 2.5

UNRECORDED = ("this Spec carries no recorded plan: it was Dispatched before Dispatch recorded "
              "the Missions its Cards were reserved for. Withdraw it and Dispatch it again "
              "from the planner.")


def geodesic_m(a, b):
    """Haversine distance in metres, for verifying what we produced."""
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


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


def xml_text(text: str) -> str:
    """Text safe inside the Mission file. Escaping is not enough: XML 1.0 has no
    way to carry most control characters at all, so a Site name holding one made
    a file the Controller cannot read. The planner refuses them now (#152); this
    covers Specs written before it did, or by hand."""
    return escape("".join(ch for ch in text if ch in "\t\n\r" or ord(ch) >= 0x20 and ord(ch) != 0x7f))


def write_kmz(path, name, pts, speed, turn_mode, poi=None):
    """pts are the recorded waypoints: (lat, lon, altitude m, gimbal pitch deg)."""
    now = int(time.time() * 1000)
    cfg = mission_config(speed)
    template = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="{NS}">
  <Document>
    <wpml:author>wayfinder: {xml_text(name)}</wpml:author>
    <wpml:createTime>{now}</wpml:createTime>
    <wpml:updateTime>{now}</wpml:updateTime>
{cfg}
  </Document>
</kml>
"""
    body = "".join(
        placemark(i, p[0], p[1], p[2], speed, p[3], turn_mode, i == 0, poi)
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


def gate(part, spec, speed):
    """Check one recorded part against the request and the aircraft's limits before it is loaded.

    The plan was computed elsewhere, so this checks the waypoints themselves:
    nothing here trusts the planner's own figures (ADR 0016).
    """
    f, problems = spec["flight"], []
    lo, hi = LIMITS["speed"]
    if not lo <= speed <= hi:
        problems.append(f"speed {speed} outside the aircraft's {lo}..{hi}")
    if len(part) > LIMITS["max_waypoints"]:
        problems.append(f"{len(part)} waypoints exceeds DJI Fly's {LIMITS['max_waypoints']}")
    lo, hi = LIMITS["gimbal_pitch"]
    if any(not lo <= p[3] <= hi for p in part):
        problems.append(f"gimbal outside the aircraft's {lo}..{hi}")
    highest = max(p[2] for p in part)
    if highest > ALTITUDE_CEILING_M:
        problems.append(f"altitude {highest} m is above the {ALTITUDE_CEILING_M} m ceiling")

    # Measured, not assumed: neighbouring photo positions on the ellipsoid.
    gaps = [geodesic_m(part[i], part[i + 1]) for i in range(len(part) - 1)]

    if spec.get("mission_type", "grid") == "orbit":
        o = spec["orbit"]
        slant = math.hypot(o["radius_m"], highest - o.get("target_height_m", 0.0))
        across = SENSOR_W_MM / FOCAL_MM * slant
        # Neighbours on one ring, not the climb between rings.
        ring = sorted(g for i, g in enumerate(gaps) if part[i][2] == part[i + 1][2])
        measured = ring[len(ring) // 2] if ring else float("nan")
        overlap = (1 - measured / across) * 100 if ring else 100.0
        if overlap < 60:
            problems.append(f"only {overlap:.0f}% overlap between neighbouring photos; "
                            f"raise photos per ring or the radius")
    else:
        if any(p[2] != f["altitude_m"] or p[3] != f["gimbal_pitch_deg"] for p in part):
            problems.append(f"waypoints are not all at the requested {f['altitude_m']} m "
                            f"and {f['gimbal_pitch_deg']} degrees")
        across = SENSOR_W_MM / FOCAL_MM * f["altitude_m"]
        along = SENSOR_H_MM / FOCAL_MM * f["altitude_m"]
        intended = along * (1 - f["forward_overlap_pct"] / 100)
        side = across * (1 - f["side_overlap_pct"] / 100)
        # Along one pass, not the turn between passes.
        same_line = sorted(g for g in gaps if g < side * 0.9)
        measured = same_line[len(same_line) // 2] if same_line else float("nan")
        drift = abs(measured - intended) / intended * 100
        if drift > 2:
            problems.append(f"measured spacing {measured:.2f} m differs from intended "
                            f"{intended:.2f} m by {drift:.1f}%")
        # The camera, not the aircraft, sets the pace when a photo is due at every
        # waypoint: flying faster than spacing / interval drops photographs silently.
        interval = spec["camera"]["interval_s"]
        if interval > 0 and speed > intended / interval + 0.01:
            problems.append(f"speed {speed} m/s outruns the {interval:g}s shutter interval "
                            f"at {intended:.2f} m spacing")
    return problems, measured


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True, help="Mission Spec JSON as Dispatch wrote it")
    ap.add_argument("--out", required=True)
    ap.add_argument("--name")
    args = ap.parse_args()

    spec = json.loads(Path(args.spec).read_text())
    if spec.get("version") != 1:
        raise SystemExit(f"unsupported Mission Spec version {spec.get('version')!r}")
    plan = spec.get("plan")
    if not plan or not plan.get("parts") or not all(plan["parts"]):
        print(json.dumps({"problems": [UNRECORDED]}, indent=2))
        return 1

    orbit = spec.get("mission_type", "grid") == "orbit"
    turn = spec["flight"]["turn"]
    turn_mode = ("toPointAndPassWithContinuityCurvature" if turn == "through"
                 else "toPointAndStopWithContinuityCurvature")
    poi = None
    if orbit:
        o = spec["orbit"]
        poi = (o["center"][0], o["center"][1], float(o.get("target_height_m", 0.0)))
    speed = plan["speed_ms"]
    base = args.name or f"{spec['site']} {spec['date']}".strip()
    parts = plan["parts"]

    out = Path(args.out)
    results, failed = [], False
    for i, part in enumerate(parts, 1):
        path = out if len(parts) == 1 else out.with_name(f"{out.stem}-part{i}{out.suffix}")
        name = base if len(parts) == 1 else f"{base} part {i}"
        problems, measured = gate(part, spec, speed)
        dist = sum(geodesic_m(part[j], part[j + 1]) for j in range(len(part) - 1))
        penalty = len(part) * speed / STOP_ACCEL_MS2 if turn == "stop" else 0.0
        write_kmz(path, name, part, speed, turn_mode, poi)
        failed = failed or bool(problems)
        results.append({
            "out": str(path), "name": name, "waypoints": len(part),
            "measured_fwd_spacing_m": round(measured, 2),
            "path_length_m": round(dist),
            "flight_time_min_at_speed": round((dist / speed + penalty) / 60, 1),
            "problems": problems,
        })

    print(json.dumps({"mission_type": spec.get("mission_type", "grid"), "turn": turn,
                      "parts": len(parts), "speed_ms": speed, "missions": results}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
