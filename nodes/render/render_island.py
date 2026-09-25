"""Render a cut island (C1 dir) to the Showcase raw stills (C3).

    blender -b --factory-startup -P render_island.py -- ISLAND_DIR RAW_WIDE RAW_TALL
    python3 render_island.py --self-test        # framing math, no Blender needed

The scene is the render subset of scripts/hero/hero.py:506-555: the overcast
HDRI sky, one soft sun, the camera, Cycles/OPTIX, AgX and denoising.  Nothing
is generated on the captured top -- no trees, moss or grass.

Art constants below are the hero's (scripts/hero/hero.py:16-30); everything
else in its K is geometry or dressing and does not exist here.
"""
import math
import os
import sys

K = dict(
    sun_strength=2.4,
    sun_angle=14.0,
    sun_elev=42.0,
    sun_azim=-55.0,
    hdri_strength=1.45,
    samples=128,
    cam_lens=50.0,
    cam_elev=8.0,
)

WIDE = (3840, 2160)  # C3 raw-wide.png
TALL = (2160, 3840)  # C3 raw-tall.png

ASSETS = "/opt/showcase/assets"  # baked into the image, never a home directory
SKY = "kloofendal_overcast_puresky/kloofendal_overcast_puresky_4k.hdr"
SENSOR_WIDTH = 36.0  # Blender's default sensor, mm

# C4: the island is wholly in frame and its centre lands at these normalised
# device coordinates -- x right, y up.  OUT_X 0.5 -> 0.75 W (right third),
# OUT_Y -0.3 -> 0.65 H (lower half).
OUT_X, OUT_Y = 0.5, -0.3
FIT = 0.8  # the island fills at most this fraction of the half-frame


# ─── pure vector math and framing ────────────────────────────────────────────
def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(a):
    n = math.sqrt(_dot(a, a))
    if n == 0.0:
        raise ValueError("zero-length vector")
    return (a[0] / n, a[1] / n, a[2] / n)


def _corners(bbox):
    (x0, y0, z0), (x1, y1, z1) = bbox
    return [(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]


def _center(bbox):
    (x0, y0, z0), (x1, y1, z1) = bbox
    return ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)


def _diag(bbox):
    (x0, y0, z0), (x1, y1, z1) = bbox
    return math.dist((x0, y0, z0), (x1, y1, z1))


def _tans(res_x, res_y, lens, sensor=SENSOR_WIDTH):
    """Half-angle tangents with Blender's AUTO sensor fit (sensor on the long side)."""
    half = sensor / 2.0 / lens
    if res_x >= res_y:
        return half, half * res_y / res_x
    return half * res_x / res_y, half


def _basis(elev_deg):
    """Camera basis for an orbit-style camera on the -Y side, looking up +Y and down.

    u is the unit target->camera direction, f forward, r right, up camera-up;
    matches mathutils' to_track_quat("-Z", "Y") for this direction.
    """
    el = math.radians(elev_deg)
    u = (0.0, -math.cos(el), math.sin(el))
    f = (0.0, math.cos(el), -math.sin(el))
    r = (1.0, 0.0, 0.0)
    return u, f, r, _cross(r, f)


def frame_camera(bbox, res_x, res_y, lens=None, elev_deg=None, fit=FIT, out_x=OUT_X, out_y=OUT_Y):
    """Place a camera so the island is wholly in frame and composed per C4.

    bbox is ((min_x, min_y, min_z), (max_x, max_y, max_z)) in world space.
    Returns a dict with `location`, `target` and the projection fields
    `project()` needs; pure Python, no bpy/mathutils, so `--self-test` runs
    without Blender.
    """
    lens = K["cam_lens"] if lens is None else lens
    elev_deg = K["cam_elev"] if elev_deg is None else elev_deg
    if not 0.0 < fit < 1.0:
        raise ValueError(f"fit must be within (0, 1), got {fit}")
    if abs(out_x) >= fit or abs(out_y) >= fit:
        raise ValueError(f"composition target ({out_x}, {out_y}) is outside the fitted frame")

    centre = _center(bbox)
    qs = [_sub(p, centre) for p in _corners(bbox)]
    tan_h, tan_v = _tans(res_x, res_y, lens)
    u, f, r, up = _basis(elev_deg)

    def fits(d):
        for q in qs:
            depth = _dot(q, f) + d  # aiming offset is perpendicular to f
            if depth <= 0.0:
                return False
            if abs(_dot(q, r) + out_x * d * tan_h) > depth * tan_h * fit:
                return False
            if abs(_dot(q, up) + out_y * d * tan_v) > depth * tan_v * fit:
                return False
        return True

    # Start from the distance that fits the island with the camera aimed at its
    # centre, then grow until the composition offset also fits.
    d = max([1e-6]
            + [abs(_dot(q, r)) / (tan_h * fit) - _dot(q, f) for q in qs]
            + [abs(_dot(q, up)) / (tan_v * fit) - _dot(q, f) for q in qs])
    for _ in range(256):
        if fits(d):
            break
        d *= 1.05
    else:
        raise ValueError("camera distance did not converge")

    # Aim the axis past the island centre, so the centre lands right and low.
    delta = _add(_mul(r, -out_x * d * tan_h), _mul(up, -out_y * d * tan_v))
    target = _add(centre, delta)
    location = _add(target, _mul(u, d))
    return dict(location=location, target=target, forward=f, up=up, right=r,
                lens=lens, res_x=res_x, res_y=res_y, tan_h=tan_h, tan_v=tan_v,
                distance=d, fit=fit, out_x=out_x, out_y=out_y)


def project(cam, point):
    """Project a world point through a `frame_camera` result -> (ndc_x, ndc_y, depth)."""
    v = _sub(point, cam["location"])
    depth = _dot(v, cam["forward"])
    if depth <= 0.0:
        raise ValueError(f"point {point} is behind the camera")
    return (_dot(v, cam["right"]) / (depth * cam["tan_h"]),
            _dot(v, cam["up"]) / (depth * cam["tan_v"]), depth)


# ─── self-test (no bpy) ──────────────────────────────────────────────────────
_CASES = (
    ("cube", ((-3.0, -3.0, -2.0), (3.0, 3.0, 2.0))),
    ("translated", ((97.0, 44.0, -9.0), (103.0, 50.0, -5.0))),
    ("tall", ((-1.5, -1.5, -8.0), (1.5, 1.5, 8.0))),
    ("flat", ((-4.0, -4.0, -0.2), (4.0, 4.0, 0.2))),
    ("tiny", ((-0.01, -0.01, -0.01), (0.01, 0.01, 0.01))),
)


def self_test():
    for name, bbox in _CASES:
        for res in (WIDE, TALL):
            cam = frame_camera(bbox, *res)
            for p in _corners(bbox):
                ndc_x, ndc_y, depth = project(cam, p)
                assert depth > 0.0, f"{name}: corner behind the camera"
                assert abs(ndc_x) <= cam["fit"] + 1e-9, f"{name}: corner outside x frame"
                assert abs(ndc_y) <= cam["fit"] + 1e-9, f"{name}: corner outside y frame"
            ndc_x, ndc_y, _ = project(cam, _center(bbox))
            assert abs(ndc_x - OUT_X) < 1e-6, f"{name}: centre not at OUT_X"
            assert abs(ndc_y - OUT_Y) < 1e-6, f"{name}: centre not at OUT_Y"
            px = (ndc_x + 1.0) / 2.0 * res[0]
            py = (1.0 - ndc_y) / 2.0 * res[1]
            assert 2.0 * res[0] / 3.0 <= px <= res[0], f"{name}: centre not in right third"
            assert res[1] / 2.0 <= py <= res[1], f"{name}: centre not in lower half"
            assert cam["location"][1] < cam["target"][1], f"{name}: camera not on the -Y side"
            assert cam["location"][2] > cam["target"][2], f"{name}: camera not above the target"
            print(f"  {name:10s} {res[0]}x{res[1]}  centre=({px:7.1f}, {py:7.1f})px  "
                  f"dist={cam['distance']:.3f}m  corners in frame")
    a = frame_camera(_CASES[0][1], 1920, 1080)
    b = frame_camera(_CASES[1][1], 1920, 1080)
    centre_a, centre_b = _center(_CASES[0][1]), _center(_CASES[1][1])
    for k in ("location", "target"):
        off_a, off_b = _sub(a[k], centre_a), _sub(b[k], centre_b)
        assert all(abs(off_a[i] - off_b[i]) < 1e-9 for i in range(3)), \
            f"framing is not translation invariant ({k})"
    assert a["distance"] == b["distance"], "framing is not translation invariant (distance)"
    print(f"self-test ok: {len(_CASES)} synthetic bboxes x 2 aspects; "
          f"translation invariant")


# ─── Blender scene (hero subset) ─────────────────────────────────────────────
def _resolve_missing_images(island_dir):
    """Point imported images at a real file when the MTL path missed.

    The island's own textures/ win; the baked assets are the fallback.
    """
    import glob
    import bpy
    for image in bpy.data.images:
        path = bpy.path.abspath(image.filepath)
        if path and os.path.isfile(path):
            continue
        name = os.path.basename(image.filepath)
        if not name:
            continue
        hits = (glob.glob(os.path.join(island_dir, "**", name), recursive=True)
                + glob.glob(os.path.join(ASSETS, "**", name), recursive=True))
        if hits:
            print(f"render: resolved {name} -> {hits[0]}", flush=True)
            image.filepath = hits[0]
            image.reload()
        else:
            print(f"render: image not found: {image.filepath}", file=sys.stderr)


def _scene_bbox():
    import bpy
    from mathutils import Vector
    points = []
    for ob in bpy.context.scene.objects:
        if ob.type == "MESH":
            points.extend(ob.matrix_world @ Vector(corner) for corner in ob.bound_box)
    if not points:
        raise SystemExit("render: no mesh objects to frame")
    lo = tuple(min(p[i] for p in points) for i in range(3))
    hi = tuple(max(p[i] for p in points) for i in range(3))
    return (lo, hi)


def _sky(sc):
    """hero.py:506-527 -- overcast HDRI above, dark ground below the horizon."""
    import bpy
    path = os.path.join(ASSETS, SKY)
    if not os.path.isfile(path):
        raise SystemExit(f"render: sky HDRI missing at {path}; it is baked into the image")
    world = bpy.data.worlds.new("sky")
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(path)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = K["hdri_strength"]
    out = nt.nodes.new("ShaderNodeOutputWorld")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -0.15
    ramp.inputs["From Max"].default_value = 0.08
    nt.links.new(sep.outputs["Z"], ramp.inputs["Value"])
    mixg = nt.nodes.new("ShaderNodeMix")
    mixg.data_type = "RGBA"
    mixg.inputs[6].default_value = (0.012, 0.016, 0.02, 1)
    nt.links.new(env.outputs["Color"], mixg.inputs[7])
    nt.links.new(ramp.outputs["Result"], mixg.inputs[0])
    nt.links.new(mixg.outputs[2], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def _sun(sc):
    """hero.py:521-527 -- one soft sun for shape and wet highlights."""
    import bpy
    from mathutils import Vector
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = K["sun_strength"]
    sun.data.angle = math.radians(K["sun_angle"])
    sun.data.color = (1.0, 0.95, 0.88)
    az, el = math.radians(K["sun_azim"]), math.radians(K["sun_elev"])
    src = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    sun.rotation_euler = (-src).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)


def _cycles(sc):
    """hero.py:540-555 -- Cycles on OPTIX, denoised, AgX."""
    import bpy
    sc.render.engine = "CYCLES"
    sc.cycles.samples = K["samples"]
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "OPTIX"
    except TypeError:
        pass
    prefs.refresh_devices()
    if prefs.compute_device_type == "OPTIX" and any(d.type == "OPTIX" for d in prefs.devices):
        for d in prefs.devices:
            d.use = d.type == "OPTIX"
    else:
        sc.cycles.device = "CPU"
        print("render: no OPTIX device; falling back to CPU", file=sys.stderr)
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"


def render(island_dir, raw_wide, raw_tall):
    import bpy
    from mathutils import Vector

    obj_path = os.path.join(island_dir, "island.obj")
    if not os.path.isfile(obj_path):
        raise SystemExit(f"render: no island.obj under {island_dir!r} (C1 island dir)")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=obj_path, forward_axis="Y", up_axis="Z")
    if not any(ob.type == "MESH" for ob in bpy.context.scene.objects):
        raise SystemExit("render: island.obj imported no mesh objects")
    _resolve_missing_images(island_dir)

    bbox = _scene_bbox()
    print(f"render: island bbox {bbox}", flush=True)

    sc = bpy.context.scene
    _sky(sc)
    _sun(sc)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit = "AUTO"
    cam.data.sensor_width = SENSOR_WIDTH
    _cycles(sc)
    sc.render.film_transparent = True  # C3: Grading composites the sky
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_percentage = 100

    for (res_x, res_y), path in ((WIDE, raw_wide), (TALL, raw_tall)):
        spec = frame_camera(bbox, res_x, res_y)
        cam.data.lens = spec["lens"]
        cam.location = spec["location"]
        cam.rotation_euler = (Vector(spec["target"]) - Vector(spec["location"])
                              ).to_track_quat("-Z", "Y").to_euler()
        cam.data.clip_start = max(0.01, spec["distance"] / 1000.0)
        cam.data.clip_end = spec["distance"] + 2.0 * _diag(bbox)
        sc.render.resolution_x, sc.render.resolution_y = res_x, res_y
        sc.render.filepath = os.path.abspath(path)
        bpy.ops.render.render(write_still=True)
        print(f"render: wrote {path} {res_x}x{res_y}", flush=True)


def _argv(argv):
    return argv[argv.index("--") + 1:] if "--" in argv else argv[1:]


def main(argv):
    args = _argv(argv)
    if args == ["--self-test"]:
        self_test()
        return
    if len(args) != 3:
        raise SystemExit(
            "usage: blender -b --factory-startup -P render_island.py -- "
            "ISLAND_DIR RAW_WIDE RAW_TALL   (or: python3 render_island.py --self-test)")
    render(*args)


if __name__ == "__main__":
    main(sys.argv)
