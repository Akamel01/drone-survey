"""One Blender still (tall + wide) matching the hero's frame 0 — the whole
composition in one scene: hero island + in-scene sky ramp + displaced terrain
+ bounded valley-mist volume + depth-keyed haze + two cameras.

    blender -b --factory-startup --python-exit-code 1 \
      -P scripts/hero/still.py -- render <outdir> [--shot tall|wide|both] \
      [--warmup] [--res WxH] [--k2 key=value] [--az DEG]

`hero.py` is loaded as a module (HERO_PY env, default ~/hero3d/hero.py); its
import-time build is discarded (hero.py:568), `K`/`LAYERS` are patched, and
`build()` runs again.  `grade.py` is never imported or called: colour is
finished in-scene (ADR-223-04/10, report §2b/§2e).  Design:
.autoforge/architecture/report.md and decisions.md (ADR-223-01…11).

Outputs: <outdir>/tall-s0-f0.png (2160x3840) and <outdir>/wide-s0-f0.png
(3840x2160), PNG RGB 8-bit; --warmup adds <outdir>/warmup.png (380x675).
"""
import argparse
import importlib.util
import math
import os
import sys

import bpy
from mathutils import Vector

# ─── Constants ───────────────────────────────────────────────────────────────
RENDER_RES = {"tall": (2160, 3840), "wide": (3840, 2160)}   # report §2a
WARMUP_RES = (380, 675)
CLIP_END = 20000.0            # terrain lives at 0.7-4.5 km; sky depth-gate below

# Sky ramp stops, report §2b: (screen row, linear RGB), row measured from the
# top of the frame.  Positions inside the ramp window are recomputed per
# framing from `sky_top_row`/`sky_bot_row`; rows are the anchors of the §2b
# table (0.02…0.68 H tall, 0.02…0.58 H wide, the wide last stop clamped as the
# look spec requires).  The world sits on TexCoord.Window (verified: Window.y
# == 1-row bit-exact on 5.2.1), because Generated.Z there is NOT the ray z.
SKY_STOPS = {
    "tall": [
        (0.02, (0.01764, 0.03955, 0.06848)),   # #24384A
        (0.10, (0.05613, 0.13014, 0.21586)),   # #436580
        (0.25, (0.09759, 0.19120, 0.31399)),   # #587998
        (0.40, (0.18782, 0.30499, 0.43415)),   # #7896B0
        (0.55, (0.28744, 0.40198, 0.52712)),   # #92AAC0
        (0.68, (0.55201, 0.60383, 0.66539)),   # #C4CCD5
    ],
    "wide": [
        (0.02, (0.02519, 0.04817, 0.07819)),   # #2C3E4F
        (0.10, (0.08022, 0.15593, 0.25016)),   # #506E89
        (0.25, (0.13287, 0.22697, 0.33716)),   # #66839D
        (0.40, (0.25415, 0.35640, 0.47932)),   # #8AA1B8
        (0.55, (0.48515, 0.55834, 0.65141)),   # #B9C5D3
        (0.58, (0.48515, 0.55834, 0.65141)),   # clamp
    ],
}

# LAYERS per ADR-223-09: pebble bands dark chromatic olive so the labeler's
# max-chroma non-green band picks a real stratum; soil and weathered rock carry
# the linear targets directly.  Thicknesses keep the strata sum at 1.09 and
# every pebble band >= 0.08.
LAYERS = [  # top to bottom
    (0.18, (0.07, 0.05, 0.035), -0.08, 0),          # humus under the turf
    (0.08, (0.015, 0.015, 0.006), -0.02, 1),        # pebble band
    (0.15, (0.0110, 0.0130, 0.0176), 0.02, 0),      # soil -> #1B1E24
    (0.08, (0.015, 0.015, 0.006), -0.01, 1),        # pebble band
    (0.17, (0.0110, 0.0130, 0.0176), 0.03, 0),      # sediment -> soil target
    (0.09, (0.015, 0.015, 0.006), -0.02, 1),        # pebble band
    (0.14, (0.0110, 0.0130, 0.0176), 0.01, 0),      # dark soil
    (0.20, (0.0027, 0.0037, 0.0056), 0.05, 0),      # weathered rock -> #090C11
]

# K2: the composition knobs, all overridable with --k2 (dotted keys address a
# framing, e.g. --k2 tall.fstop=2.4).  Camera starts per report §2a.
K2 = {
    "tall": dict(
        lens=50.0, dist=23.5, elev=8.0, shift_x=-0.12, shift_y=0.09,
        fstop=2.0, focus_dist=23.5, exposure=0.0, sensor_fit="AUTO",
        sky_top_row=0.02, sky_bot_row=0.68,
        haze_gain=0.90, haze_depth_max=6000.0,
        haze_colour=(0.55201, 0.60383, 0.66539),   # #C4CCD5
    ),
    "wide": dict(
        # wide camera is the one pass 1 fits (report §2a "tune" / Q2); starts
        # at tall's geometry until the bbox wrapper moves it.
        lens=50.0, dist=23.5, elev=8.0, shift_x=-0.12, shift_y=0.09,
        fstop=2.8, focus_dist=23.5, exposure=0.0, sensor_fit="HORIZONTAL",
        sky_top_row=0.02, sky_bot_row=0.58,
        haze_gain=0.90, haze_depth_max=6000.0,
        haze_colour=(0.48515, 0.55834, 0.65141),   # #B9C5D3
    ),
    "under": 1.9,            # ADR-223-02: 2.7 -> 1.9; never patch strata alone
    "az": 0.0,               # island azimuth, degrees (#222 az000 mapping)
    "tint_turf": (1.0, 1.0, 1.0),     # ADR-223-09 per-material multiply scales
    "tint_strata": (1.0, 1.0, 1.0),
    "tint_basalt": (1.0, 1.0, 1.0),
    "vol_density": 3e-4,     # valley mist, ADR-223-07
    "vol_top": -450.0,       # below terrain ridge tops (~ -300 m)
    "vol_height": 250.0,     # ladder: 250 -> 150
    "vol_footprint": 7000.0, # ladder: 7 -> 4 km
    "vol_step_rate": 1.0,    # ladder: 1 -> 2 -> 4
    "vol_max_steps": 1024,
    # terrain, report §2c re-sized so the silhouette lands in the tall
    # MountainBand 0.72-0.95 H / HorizonHaze 0.62-0.72 H (see M1.md: the
    # 16 km grid of the report would sit at rows 0.42-0.45).
    "terrain_size": 4000.0,
    "terrain_y": 400.0,      # grid spans y -1.6..+2.4 km, i.e. rows ~0.58-1.0
    "terrain_base_z": -900.0,
    "terrain_relief": 600.0, # ridge tops -> ~ -300 m
    "terrain_detail": 80.0,
    "mist_start": 300.0,     # Mist pass (ADR-223-05): saturates on the far band
    "mist_depth": 2500.0,
}


# ─── CLI ─────────────────────────────────────────────────────────────────────
def parse_res(text):
    try:
        w, h = text.lower().split("x")
        return int(w), int(h)
    except ValueError:
        raise argparse.ArgumentTypeError("resolution must be WxH, e.g. 960x540")


def parse_value(text):
    if text.lower() in ("true", "false"):
        return text.lower() == "true"
    if "," in text:
        try:
            return tuple(float(x) for x in text.split(","))
        except ValueError:
            return text
    try:
        return int(text)          # F1: int-typed RNA knobs (vol_max_steps) need int
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        return text


def apply_k2(k2, pairs):
    for pair in pairs:
        key, sep, text = pair.partition("=")
        if not sep:
            raise SystemExit(f"still: --k2 expects key=value, got {pair!r}")
        value = parse_value(text)
        head, dot, tail = key.partition(".")
        if dot and isinstance(k2.get(head), dict):
            k2[head][tail] = value
        else:
            k2[key] = value


def parse_args(argv):
    ap = argparse.ArgumentParser(prog="still.py", description=__doc__.splitlines()[0])
    ap.add_argument("mode", choices=["render"])
    ap.add_argument("outdir")
    ap.add_argument("--shot", choices=["tall", "wide", "both"], default="both")
    ap.add_argument("--warmup", action="store_true")
    ap.add_argument("--res", type=parse_res, help="override per-shot resolution")
    ap.add_argument("--k2", action="append", default=[], metavar="key=value")
    ap.add_argument("--az", type=float, default=None, help="island azimuth, deg")
    # M3 seam F-M3-1: Blender 5.2.2 wants Cycles addon options after "--", so
    # "--cycles-print-stats" lands in our argv; Blender consumes it, we don't.
    ap.add_argument("--cycles-print-stats", action="store_true",
                    help="accepted for Blender's Cycles CLI (post --); ignored here")
    return ap.parse_args(argv)


# ─── Import seam (ADR-223-01, D-223-04) ──────────────────────────────────────
def load_hero():
    path = os.path.expanduser(os.environ.get("HERO_PY", "~/hero3d/hero.py"))
    spec = importlib.util.spec_from_file_location("hero", path)
    if spec is None or spec.loader is None:
        print(f"still: ERROR cannot load hero.py from {path}")
        sys.exit(2)
    module = importlib.util.module_from_spec(spec)
    sys.modules["hero"] = module
    spec.loader.exec_module(module)
    return module


def patch_layers(hero, layers):
    """F1: hero.BOUNDS/-K['strata'] are derived at import (hero.py:43-47) and
    go stale the moment LAYERS changes; recompute both before build()."""
    hero.LAYERS = list(layers)
    hero.BOUNDS = []
    z = 0.0
    for thickness, *_ in hero.LAYERS:
        hero.BOUNDS.append((z, z + thickness))
        z += thickness
    hero.K["strata"] = z


# ─── Scene additions (report §2b-§2e) ───────────────────────────────────────
def wrap_world(world):
    """Keep hero's HDRI lighting chain (hero.py:506-520) verbatim and mix the
    emission ramp in for camera rays only (ADR-223-03)."""
    nt = world.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    bg = out.inputs["Surface"].links[0].from_node
    for link in list(out.inputs["Surface"].links):
        nt.links.remove(link)

    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.name = "SkyMapRange"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.name = "SkyRamp"
    ramp.color_ramp.interpolation = "LINEAR"
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = 1.0
    mix = nt.nodes.new("ShaderNodeMixShader")
    lp = nt.nodes.new("ShaderNodeLightPath")

    nt.links.new(tc.outputs["Window"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Y"], mr.inputs[0])
    nt.links.new(mr.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], em.inputs["Color"])
    nt.links.new(bg.outputs[0], mix.inputs[1])                  # lighting branch
    nt.links.new(em.outputs[0], mix.inputs[2])                  # camera branch
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return nt


def set_sky(nt, framing, spec):
    """Point the ramp window at this framing's row anchors and lay its stops
    (Window.y = 1 - row, so positions = (top - row) / (top - bot), §2b)."""
    mr = nt.nodes["SkyMapRange"]
    top, bot = spec["sky_top_row"], spec["sky_bot_row"]
    mr.inputs[1].default_value = 1.0 - top
    mr.inputs[2].default_value = 1.0 - bot
    elements = nt.nodes["SkyRamp"].color_ramp.elements
    while len(elements) > 1:
        elements.remove(elements[-1])
    for i, (row, colour) in enumerate(SKY_STOPS[framing]):
        p = min(max((top - row) / (top - bot), 0.0), 1.0)
        if i == 0:
            elements[0].position, elements[0].color = p, (*colour, 1.0)
        else:
            elements.new(p).color = (*colour, 1.0)


def tint_material(mat, scale):
    """ADR-223-09: one Mix(MULTIPLY) between the material's colour source and
    its Principled Base Color; `scale` is the measured-median convergence knob."""
    if mat is None:
        return
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    link = next(l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"])
    source = link.from_socket
    nt.links.remove(link)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    scale = (scale, scale, scale) if isinstance(scale, (int, float)) else tuple(scale)
    mix.inputs[7].default_value = (*scale, 1.0)
    nt.links.new(source, mix.inputs[6])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])


def build_terrain(k2):
    """ADR-223-06: 256x256 displaced grid, two CLOUDS textures, two-tone rock."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=256, y_subdivisions=256,
                                    size=k2["terrain_size"])
    ob = bpy.context.active_object
    ob.name = "Terrain"
    ob.location = (0.0, k2["terrain_y"], k2["terrain_base_z"])
    for name, size, strength in (("ridges", 900.0, k2["terrain_relief"]),
                                 ("detail", 260.0, k2["terrain_detail"])):
        tex = bpy.data.textures.new(f"terrain_{name}", "CLOUDS")
        tex.noise_scale = size
        tex.noise_depth = 3
        mod = ob.modifiers.new(f"terrain_{name}", "DISPLACE")
        mod.texture = tex
        mod.strength = strength
        mod.mid_level = 0.0
    mat = bpy.data.materials.new("terrain")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 1.0
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.4
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = (0.020, 0.030, 0.020, 1.0)   # dark forest rock
    mix.inputs[7].default_value = (0.060, 0.062, 0.055, 1.0)   # scree
    nt.links.new(noise.outputs["Fac"], mix.inputs[0])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    ob.data.materials.append(mat)
    return ob


def build_volume(k2):
    """ADR-223-07: one bounded static box, noise x vertical falloff density."""
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    ob = bpy.context.active_object
    ob.name = "ValleyMist"
    ob.scale = (k2["vol_footprint"], k2["vol_footprint"], k2["vol_height"])
    ob.location = (0.0, 0.0, k2["vol_top"] - k2["vol_height"] / 2.0)
    mat = bpy.data.materials.new("valley_mist")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumeScatter")
    vol.inputs["Color"].default_value = (0.62, 0.68, 0.75, 1.0)  # haze-tinted
    tc = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 23.0    # ~300 m features on a 7 km box
    noise.inputs["Detail"].default_value = 2.0
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    fall = nt.nodes.new("ShaderNodeMapRange")     # dense at the bottom, 0 on top
    fall.inputs[1].default_value, fall.inputs[2].default_value = -0.5, 0.5
    fall.inputs[3].default_value, fall.inputs[4].default_value = 1.0, 0.0
    mul1 = nt.nodes.new("ShaderNodeMath")
    mul1.operation = "MULTIPLY"
    mul2 = nt.nodes.new("ShaderNodeMath")
    mul2.operation = "MULTIPLY"
    mul2.inputs[1].default_value = k2["vol_density"]
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], fall.inputs[0])
    nt.links.new(noise.outputs["Fac"], mul1.inputs[0])
    nt.links.new(fall.outputs[0], mul1.inputs[1])
    nt.links.new(mul1.outputs[0], mul2.inputs[0])
    nt.links.new(mul2.outputs[0], vol.inputs["Density"])
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    ob.data.materials.append(mat)
    return ob


def build_compositor(sc):
    """ADR-223-05: Mist -> gain, Depth gates the sky out, mix toward haze."""
    view_layer = sc.view_layers[0]
    view_layer.use_pass_mist = True
    view_layer.use_pass_z = True          # the compositor's "Depth" output
    sc.render.use_compositing = True
    nt = bpy.data.node_groups.new("still_comp", "CompositorNodeTree")
    nt.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    out = nt.nodes.new("NodeGroupOutput")
    rl = nt.nodes.new("CompositorNodeRLayers")
    # M3: haze passes come from a second view layer without the mist volume, so
    # Mist/Depth are surface distances (deterministic) instead of volume-event
    # noise; the volume still renders in the main layer's Combined.
    hv = sc.view_layers.new("haze")
    hv.use_pass_mist = True
    hv.use_pass_z = True
    vol_coll = bpy.data.collections.new("haze_src")
    sc.collection.children.link(vol_coll)
    vol_ob = bpy.data.objects["ValleyMist"]
    for c in list(vol_ob.users_collection):
        c.objects.unlink(vol_ob)
    vol_coll.objects.link(vol_ob)
    hv.layer_collection.children["haze_src"].exclude = True
    rl_haze = nt.nodes.new("CompositorNodeRLayers")
    rl_haze.layer = "haze"
    gain = nt.nodes.new("ShaderNodeMapRange")
    gain.name = "HazeGain"
    gain.inputs[1].default_value, gain.inputs[2].default_value = 0.0, 1.0
    near = nt.nodes.new("ShaderNodeMath")
    near.name = "HazeNear"
    near.operation = "LESS_THAN"
    fac = nt.nodes.new("ShaderNodeMath")
    fac.operation = "MULTIPLY"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.name = "HazeMix"
    mix.data_type = "RGBA"
    mix.blend_type = "MIX"
    nt.links.new(rl_haze.outputs["Mist"], gain.inputs[0])
    nt.links.new(rl_haze.outputs["Depth"], near.inputs[0])
    nt.links.new(gain.outputs[0], fac.inputs[0])
    nt.links.new(near.outputs[0], fac.inputs[1])
    nt.links.new(fac.outputs[0], mix.inputs[0])
    nt.links.new(rl.outputs["Image"], mix.inputs[6])
    nt.links.new(mix.outputs[2], out.inputs[0])
    sc.compositing_node_group = nt
    return nt


def set_haze(nt, spec):
    nt.nodes["HazeGain"].inputs[4].default_value = spec["haze_gain"]
    nt.nodes["HazeNear"].inputs[1].default_value = spec["haze_depth_max"]
    nt.nodes["HazeMix"].inputs[7].default_value = (*spec["haze_colour"], 1.0)


def setup_camera(cam, spec):
    """hero.py:529-538 camera formula; DOF explicit, sensor fit per spec
    (tall AUTO = hero parity, F2; wide HORIZONTAL = AUTO landscape)."""
    cam.data.lens = spec["lens"]
    cam.data.sensor_fit = spec["sensor_fit"]
    cam.data.clip_start = 0.1
    cam.data.clip_end = CLIP_END
    target = Vector((0.0, 0.0, -0.4))
    elev = math.radians(spec["elev"])
    cam.location = target + Vector((0.0, -spec["dist"] * math.cos(elev),
                                    spec["dist"] * math.sin(elev)))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.shift_x, cam.data.shift_y = spec["shift_x"], spec["shift_y"]
    dof = cam.data.dof
    dof.use_dof = True
    dof.focus_distance = spec["focus_dist"]
    dof.aperture_fstop = spec["fstop"]


def render_shot(sc, framing, outdir, res, camera, world_nt, comp_nt, spec):
    set_sky(world_nt, framing, spec)
    set_haze(comp_nt, spec)
    sc.camera = camera
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.exposure = spec["exposure"]
    sc.render.filepath = os.path.join(outdir, f"{framing}-s0-f0.png")
    bpy.ops.render.render(write_still=True)
    print(f"still: wrote {sc.render.filepath} {res[0]}x{res[1]}", flush=True)


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    args = parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    apply_k2(K2, args.k2)
    if args.az is not None:
        K2["az"] = args.az
    shots = ["tall", "wide"] if args.shot == "both" else [args.shot]
    outdir = os.path.expanduser(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    # ADR-223-01 seam: hero.py must see "none" mode, then its import-time build
    # (D-223-04: hero.py:568) is discarded before the patched rebuild.
    sys.argv = [sys.argv[0], "--", "none"]
    hero = load_hero()
    bpy.ops.wm.read_homefile(use_empty=True)

    hero.K["under"] = K2["under"]
    hero.K2 = K2
    patch_layers(hero, LAYERS)
    root = hero.build()
    if bpy.data.objects.get("Island") is None:
        print(f"still: ERROR no 'Island' after hero.build() — is HERO_PY "
              f"({os.environ.get('HERO_PY', '~/hero3d/hero.py')}) the real hero.py?")
        sys.exit(2)

    sc = bpy.context.scene
    root.rotation_euler = (0.0, 0.0, math.radians(K2["az"]))
    sc.render.film_transparent = False          # override hero.py:543
    sc.cycles.samples = 128                     # pass-1 contract (report §2d)
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.view_settings.view_transform = "Standard"  # ADR-223-04
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.display_settings.display_device = "sRGB"
    sc.cycles.volume_bounces = 1                # ADR-223-07 start
    sc.cycles.volume_step_rate = K2["vol_step_rate"]
    sc.cycles.volume_max_steps = int(K2["vol_max_steps"])
    if sc.world.mist_settings:
        sc.world.mist_settings.start = K2["mist_start"]
        sc.world.mist_settings.depth = K2["mist_depth"]
        sc.world.mist_settings.falloff = "LINEAR"
    world_nt = wrap_world(sc.world)
    build_terrain(K2)
    build_volume(K2)
    for name, key in (("turf", "tint_turf"), ("strata", "tint_strata"),
                      ("basalt", "tint_basalt")):
        tint_material(bpy.data.materials.get(name), K2[key])
    comp_nt = build_compositor(sc)

    cam_tall = bpy.data.objects["Cam"]
    cam_wide = bpy.data.objects.new("CamWide", bpy.data.cameras.new("CamWide"))
    sc.collection.objects.link(cam_wide)
    setup_camera(cam_tall, K2["tall"])
    setup_camera(cam_wide, K2["wide"])
    cameras = {"tall": cam_tall, "wide": cam_wide}

    image = sc.render.image_settings
    image.file_format = "PNG"
    image.color_mode = "RGB"
    image.color_depth = "8"
    print(f"still: shots={shots} outdir={outdir} az={K2['az']} "
          f"res={args.res or 'native'}", flush=True)

    if args.warmup:
        set_sky(world_nt, shots[0], K2[shots[0]])
        set_haze(comp_nt, K2[shots[0]])
        sc.camera = cameras[shots[0]]
        sc.render.resolution_x, sc.render.resolution_y = WARMUP_RES
        sc.view_settings.exposure = K2[shots[0]]["exposure"]
        sc.render.filepath = os.path.join(outdir, "warmup.png")
        bpy.ops.render.render(write_still=True)
        print(f"still: wrote {sc.render.filepath} (warm-up)", flush=True)

    for framing in shots:
        render_shot(sc, framing, outdir, args.res or RENDER_RES[framing],
                    cameras[framing], world_nt, comp_nt, K2[framing])


if __name__ == "__main__":
    main()
