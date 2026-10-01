"""One Blender still (tall + wide) matching the hero's frame 0 — the whole
composition in one scene: hero island + in-scene sky ramp + layered mountain
ridges with valley fog and aerial haze (camera-only, shader-side) + two cameras.

Pass 2 (#223) replaced pass 1's single terrain grid, valley-mist volume box and
second "haze" view layer with per-framing ridge strips whose haze and fog live
in their own material: layered, noise-free, and one view layer per render.

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
from mathutils import Vector, noise

# ─── Constants ───────────────────────────────────────────────────────────────
RENDER_RES = {"tall": (2160, 3840), "wide": (3840, 2160)}   # report §2a
WARMUP_RES = (380, 675)
CLIP_END = 60000.0            # ridge strips reach ~20 km


def srgb(hexstr):
    """'#RRGGBB' -> linear RGB (so a Standard-view emission lands on the hex)."""
    c = [int(hexstr[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# One screen-space ramp per framing, row 0.02 (top) -> 1.0 (bottom), sRGB hex.
# It is the sky (world, camera rays) AND the aerial-haze colour the ridges fade
# into at that row, so far mountains converge on the sky exactly like haze.
# Rows <= 0.68 tall / 0.58 wide are the look spec's s0 anchors (hero-look-
# spec.md §4a).  Pass 2: the 0.02 anchor is measure.py's 5-px "same" moving
# average of the first row, i.e. 3/5 of the true colour, so the stop carries
# anchor/0.6 (pass 1 used the anchor itself and rendered a dark cap: 4a
# anchor 0.02 #16222D vs hero #24384A).  Same for wide's clamped 0.58 row
# (#767C82 / 0.6).  Rows below are the hazed-mountain colours read off the
# hero frame-0 panels (row means over x 0.02-0.40 tall / 0.02-0.55 wide).
# The world sits on TexCoord.Window (Window.y == 1-row, verified on 5.2.1).
STOPS = {
    "tall": [(0.02, "#3C5D7B"), (0.10, "#436580"), (0.25, "#587998"),
             (0.40, "#7896B0"), (0.55, "#92AAC0"), (0.68, "#C4CCD5"),
             (0.72, "#C4CCD6"), (0.80, "#A9BBCF"), (0.90, "#8098B2"),
             (1.00, "#7690AB")],
    "wide": [(0.02, "#496784"), (0.10, "#506E89"), (0.25, "#66839D"),
             (0.40, "#8AA1B8"), (0.55, "#B9C5D3"), (0.58, "#CBD4DE"),
             (0.62, "#C3CCD7"), (0.70, "#AFBECE"), (0.80, "#A0B2C4"),
             (0.90, "#879BB0"), (1.00, "#788EA5")],
}
FOG = "#E4EAF0"               # valley cloud-sea colour before aerial haze
RIDGE_ROCK = (0.004, 0.012, 0.030)   # forested far slopes, linear albedo
RIDGE_ROCK2 = (0.012, 0.024, 0.048)

# LAYERS per ADR-223-09: pebble bands dark chromatic olive so the labeler's
# max-chroma non-green band picks a real stratum; soil and weathered rock carry
# the linear targets directly.  Thicknesses keep the strata sum at 1.09 and
# every pebble band >= 0.08.
LAYERS = [  # top to bottom
    # pass 4: the humus is neutral-dark and the pebble courses stand out
    # (+prot) so measure.py's max-chroma row lands on a pebble course, not on
    # the shadowed humus under the turf lip (pass 3's grey "pebble" median)
    (0.18, (0.030, 0.028, 0.025), -0.08, 0),        # humus under the turf
    # pass 5: pebble courses twice as thick (soil thinner) so they can fill
    # measure.py's +-3 %-of-island-height pebble window
    # pass 20 (#223): per-layer THICKNESS, not relief — pass 19 proved
    # protrusion is a colour lever, not a shape lever (frame-scale read still
    # cake layers). The hero's courses differ in thickness, so the two proud
    # olive courses go thick (0.16/0.18 -> 0.20/0.22) at the expense of the
    # recessed middle course (0.16 -> 0.10, still >= 0.08 floor) and the top
    # soil (0.10 -> 0.08): pebble sum 0.50 -> 0.52, total strata unchanged,
    # so silhouette/S2 hold while the +-3 % pebble window fills with lit
    # olive instead of recessed-shadow pixels.
    (0.20, (0.015, 0.015, 0.006), 0.050, 1),        # pebble band, proud+thick
    (0.08, (0.0110, 0.0130, 0.0176), 0.02, 0),      # soil -> #1B1E24
    (0.10, (0.015, 0.015, 0.006), 0.000, 1),        # pebble band, recessed+thin
    (0.12, (0.0110, 0.0130, 0.0176), 0.03, 0),      # sediment -> soil target
    (0.22, (0.015, 0.015, 0.006), 0.050, 1),        # pebble band, proud+thick
    (0.10, (0.0110, 0.0130, 0.0176), 0.01, 0),      # dark soil
    (0.20, (0.0027, 0.0037, 0.0056), 0.05, 0),      # weathered rock -> #090C11
]

# K2: the composition knobs, all overridable with --k2 (dotted keys address a
# framing, e.g. --k2 tall.fstop=2.4).  Camera starts per report §2a.
#
# ridges: (distance m, crest row, relief in rows, aerial haze 0-1, fog top)
# per framing, far to near.  A strip's crest peaks land on `crest row` and its
# relief reaches `relief` rows below it; `haze` is how far the strip is mixed
# toward the STOPS colour of its row; `fog top` is the valley-fog line in the
# strip's own relief units (0 = relief bottom, 1 = crest).
K2 = {
    "tall": dict(
        lens=50.0, dist=22.23, elev=8.0, shift_x=-0.204, shift_y=0.146,
        fstop=2.0, focus_dist=22.23, exposure=0.0, sensor_fit="AUTO",
        ridges=[(20000.0, 0.640, 0.050, 0.88, 0.15),
                (11000.0, 0.670, 0.080, 0.80, 0.15),
                (6000.0, 0.690, 0.090, 0.68, 0.25),
                (3200.0, 0.705, 0.110, 0.55, 0.35),
                (1800.0, 0.720, 0.200, 0.50, -0.40)],
        haze_right=0.75,     # extra haze toward the frame's right (S2 mask)
        haze_right_from=0.45,
        grass_value=0.24,    # hero turf s0 #242E11 tall, #1B250A wide
        fir_fill=False,      # extra crown copies (4h: tall has room, wide not)
    ),
    "wide": dict(
        lens=50.0, dist=30.35, elev=8.0, shift_x=-0.27, shift_y=0.028,
        fstop=2.8, focus_dist=30.35, exposure=0.0, sensor_fit="HORIZONTAL",
        ridges=[(20000.0, 0.430, 0.060, 0.97, 0.15),
                (11000.0, 0.500, 0.120, 0.93, 0.35),
                (6000.0, 0.600, 0.130, 0.84, 0.25),
                (3200.0, 0.770, 0.150, 0.45, 0.15),
                (1800.0, 0.900, 0.220, 0.34, 0.10)],
        haze_right=0.65,
        haze_right_from=0.35,
        grass_value=0.16,
        fir_fill=True,
    ),
    "ridge_freq": 2.0,       # crest noise frequency per strip distance
    "ridge_gain": 0.45,      # octave gain: lower = smoother peaks
    "ridge_width": 0.12,     # crest cross-section, strip-distance units
    "fog_scale": 30.0,       # wisp noise scale (local units)
    "fog_noise": 1.6,        # wisp amplitude, relief units
    "fog_soft": 0.4,         # fog edge width, relief units
    "fog_max": 0.6,         # fog opacity cap
    # island knobs patched into hero.K before build().  Pass 2: the hero's
    # underside is ~0.14 H tall / 0.24 H wide against ~0.11 / 0.20 in pass 1,
    # and its firs are ~15 % shorter relative to the island.
    # Pass 3: the hero's strata are about twice as thick, and its underside is
    # a mass of big boulders rather than a smooth cone.
    "under": 1.94,           # ADR-223-02 set 1.9 (from 2.7); pass 2 2.4; pass 3 2.1; pass 5 1.94
    "layers_scale": 1.5,     # LAYERS thicknesses x this (strata 1.09 -> 1.64)
    "lumps": 0.55,           # hero.py 0.34
    "under_boulders": 50,    # hero.py 20
    "boulder_scale": 1.5,    # underside boulders, x hero.py's size
    "boulder_push": 1.08,    # and pushed out from the axis, so they bulge
    "tree_scale": 0.30,      # hero.py 0.36
    "az": 0.0,               # island azimuth, degrees (#222 az000 mapping)
    "tint_turf": (0.55, 0.62, 0.30),  # ADR-223-09 per-material multiply scales
    "tint_strata": (1.0, 1.0, 1.0),
    # pass 2: pass 1's 4d lift was the basalt's glossy sky reflection (hero.py
    # Specular IOR Level 0.65, roughness 0.14-0.44), not its albedo.
    "tint_basalt": (0.06, 0.10, 0.22),
    "basalt_spec": 0.15,
    "basalt_rough": 0.80,
    # pass 3 palette: Poly Haven asset shader-group inputs.  Their sheen of
    # sky specular read frosty under Standard view (turf #3A4528 vs #283017).
    "grass": dict(Specular=0.15, Saturation=1.5, Value=0.40),   # Value per framing: grass_value
    "moss": dict(Saturation=1.3, Value=1.0),    # Value = the rim's
    "moss_top_value": 0.40,  # moss Value on the island top
    "moss_y": (-2.2, 0.3),   # world y ramp: front (low in frame) -> back
    "tint_firs": (0.25, 0.32, 0.18),
    "fir_turns": (1.57,),
    "fir_fill_scale": 0.55,       # extra crown copies per fir (radians)   # the hero's spruces are darker
    # pass 7 (#223): 0.75 -> 0.55 targets wide 4h only — FirFill copies hide on
    # tall, so tall rows cannot move; 0.85->0.75 moved wide 4h 15.7->15.4 %
    # pebble courses are the gravel texture (hero.py mat_strata, HSV s 0.7
    # v 0.8): the hero's are dark olive (#212111), ours read grey (#262626)
    "pebble_hsv": (1.3, 0.35),
    "pebble_tint": (0.80, 0.80, 0.30),
    "ledge_scale": 2.0,      # LAYERS protrusions x this: rugged strata
    "strata_disp": 0.12,     # hero.py mat_strata displacement 0.05
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


def set_sky(nt, framing):
    """Lay this framing's STOPS on a SkyMapRange -> SkyRamp pair (world or
    ridge material).  Window.y = 1 - row; the ramp spans rows top..1.0."""
    stops = STOPS[framing]
    top = stops[0][0]
    mr = nt.nodes["SkyMapRange"]
    mr.inputs[1].default_value = 1.0 - top
    mr.inputs[2].default_value = 0.0
    elements = nt.nodes["SkyRamp"].color_ramp.elements
    while len(elements) > 1:
        elements.remove(elements[-1])
    for i, (row, hexstr) in enumerate(stops):
        p = (row - top) / (1.0 - top)
        colour = (*srgb(hexstr), 1.0)
        if i == 0:
            elements[0].position, elements[0].color = p, colour
        else:
            elements.new(p).color = colour


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


def fix_basalt(k2):
    """Pass 2: matte the underside rock.  hero.py:336-338 makes it wet and
    glossy (roughness 0.14-0.44, Specular IOR Level 0.65); under Standard view
    that reflection of the bright sky was pass 1's lifted floor (4d p1 12.8/16.6
    with the albedo already at 8 %)."""
    nt = bpy.data.materials["basalt"].node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Specular IOR Level"].default_value = k2["basalt_spec"]
    for link in list(bsdf.inputs["Roughness"].links):
        nt.links.remove(link)
    bsdf.inputs["Roughness"].default_value = k2["basalt_rough"]


def island_palette(k2):
    """Pass 3: darker, more chromatic grass and moss (the asset shader groups'
    own Hue/Saturation/Value/Specular inputs) and olive pebble courses."""
    for mat_name, key in (("grass_medium_01", "grass"), ("grass_medium_01.001", "grass"),
                          ("moss_01", "moss")):
        nt = bpy.data.materials[mat_name].node_tree
        group = next(n for n in nt.nodes if n.type == "GROUP")
        for name, value in k2[key].items():
            group.inputs[name].default_value = value
    # pass 4: moss darker at the back than at the front.  measure.py splits
    # the island's green at its median row: the hero's upper half is dark
    # (#283017), its lower half bright moss (#384117); one moss_01 covers both.
    nt = bpy.data.materials["moss_01"].node_tree
    group = next(n for n in nt.nodes if n.type == "GROUP")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    by_z = nt.nodes.new("ShaderNodeMapRange")
    by_z.inputs[1].default_value, by_z.inputs[2].default_value = k2["moss_y"]
    by_z.inputs[3].default_value = k2["moss"]["Value"]
    by_z.inputs[4].default_value = k2["moss_top_value"]
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Y"], by_z.inputs[0])
    nt.links.new(by_z.outputs[0], group.inputs["Value"])
    nt = bpy.data.materials["strata"].node_tree
    hsv = next(n for n in nt.nodes if n.type == "HUE_SAT"
               and abs(n.inputs["Saturation"].default_value - 0.7) < 1e-6)   # the gravel
    hsv.inputs["Saturation"].default_value, hsv.inputs["Value"].default_value = k2["pebble_hsv"]
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type, mix.blend_type = "RGBA", "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[7].default_value = (*k2["pebble_tint"], 1.0)
    targets = [link.to_socket for link in hsv.outputs["Color"].links]
    for sock in targets:
        nt.links.new(mix.outputs[2], sock)       # replaces the input's old link
    nt.links.new(hsv.outputs["Color"], mix.inputs[6])
    next(n for n in nt.nodes if n.type == "DISPLACEMENT").inputs["Scale"].default_value = k2["strata_disp"]
    for name in ("fir_sapling_medium_branches", "fir_sapling_medium_twigs"):
        tint_material(bpy.data.materials.get(name), k2["tint_firs"])


def fill_firs(k2):
    """Pass 4: the hero's spruces are dense dark crowns; hero.py stacks three
    turned copies of a sapling per tree (hero.py:496-503).  Add more turns so
    the crowns close up (this is what darkens measure.py's turf median, whose
    upper-half green pixels are mostly tree).  The copies are "FirFill*";
    render_shot shows them only where the framing's `fir_fill` is set."""
    firs = [ob for ob in bpy.data.objects if ob.name.startswith("fir_sapling_medium")
            and ob.parent is not None]
    for ob in firs:
        for turn in k2["fir_turns"]:
            extra = ob.copy()
            extra.name = "FirFill_" + ob.name
            bpy.context.scene.collection.objects.link(extra)
            extra.rotation_euler.z += turn
            extra.scale = ob.scale * k2["fir_fill_scale"]


def bulk_underside(k2):
    """Pass 3: hero.py's underside boulders (copies carrying the basalt
    material, hero.py:480-490) scaled up and pushed out so they bulge."""
    basalt = bpy.data.materials["basalt"]
    for ob in bpy.data.objects:
        if ob.name != "Island" and ob.type == "MESH" and basalt.name in ob.data.materials:
            ob.scale = ob.scale * k2["boulder_scale"]
            ob.location.x *= k2["boulder_push"]
            ob.location.y *= k2["boulder_push"]


def ridge_relief(u, v, seed, k2):
    """Relief of a ridge strip at local (u across, v in depth), both in units
    of the strip's distance; ~1 at the peaks, ~0 at the relief bottom and
    well below it off the crest (the valleys, under the fog)."""
    crest, amp, freq, norm = 0.0, 1.0, k2["ridge_freq"], 0.0
    for octave in range(4):
        n = noise.noise(Vector((u * freq + seed * 17.3, seed * 5.1, octave * 3.7)))
        crest += amp * (1.0 - abs(n)) ** 3          # ridged: sharp peaks
        norm += amp
        amp, freq = amp * k2["ridge_gain"], freq * 2.07
    # massif envelope: a few high summits, low saddles between them
    massif = 0.5 + 0.5 * noise.noise(Vector((u * k2["ridge_freq"] * 0.45 + seed * 3.1, seed * 1.7, 5.5)))
    crest = crest / norm * (0.35 + 0.65 * massif) / 0.8
    vc = v - 0.03 * noise.noise(Vector((u * 4.0, seed * 2.3, 9.1)))   # wavy crest line
    fall = math.exp(-(vc / k2["ridge_width"]) ** 2)
    detail = 0.10 * noise.fractal(Vector((u * 40.0, v * 40.0, seed)), 1.0, 2.0, 4)
    return crest * fall - 2.5 * (1.0 - fall) + detail


def ridge_material(k2):
    """Ridge shading, camera rays only: lit rock -> valley fog (by local height
    + noise, plus a right-hand fog ramp) -> aerial haze toward the STOPS colour
    of the pixel's row by the strip's own `haze` fraction."""
    mat = bpy.data.materials.new("ridges")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N, L = nt.nodes.new, nt.links.new
    out = N("ShaderNodeOutputMaterial")
    tc = N("ShaderNodeTexCoord")
    loc = N("ShaderNodeSeparateXYZ")
    L(tc.outputs["Object"], loc.inputs["Vector"])
    win = N("ShaderNodeSeparateXYZ")
    L(tc.outputs["Window"], win.inputs["Vector"])

    def attr(name):
        a = N("ShaderNodeAttribute")
        a.attribute_type, a.attribute_name = "OBJECT", name
        return a.outputs["Fac"]

    def math_node(op, a, b):
        m = N("ShaderNodeMath")
        m.operation = op
        for sock, x in zip(m.inputs, (a, b)):
            if isinstance(x, float):
                sock.default_value = x
            else:
                L(x, sock)
        return m.outputs[0]

    # lit rock: two dark forest tones
    tone = N("ShaderNodeTexNoise")
    tone.inputs["Scale"].default_value = 60.0
    L(tc.outputs["Object"], tone.inputs["Vector"])
    rock = N("ShaderNodeMix")
    rock.data_type = "RGBA"
    rock.inputs[6].default_value = (*RIDGE_ROCK, 1.0)
    rock.inputs[7].default_value = (*RIDGE_ROCK2, 1.0)
    L(tone.outputs["Fac"], rock.inputs[0])
    bsdf = N("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 1.0
    L(rock.outputs[2], bsdf.inputs["Base Color"])

    # valley fog: full below fog_top - soft, none above fog_top + soft/2,
    # the line broken up by noise into wisps; capped at fog_max opacity
    squash = N("ShaderNodeMapping")        # relief units span ~3.5, u/v ~0.3:
    squash.inputs["Scale"].default_value = (1.0, 1.0, 0.08)   # keep wisps off iso-height stripes
    L(tc.outputs["Object"], squash.inputs["Vector"])
    wisp = N("ShaderNodeTexNoise")
    wisp.inputs["Scale"].default_value = k2["fog_scale"]
    wisp.inputs["Detail"].default_value = 4.0
    L(squash.outputs["Vector"], wisp.inputs["Vector"])
    h = math_node("ADD", loc.outputs["Z"],
                  math_node("MULTIPLY", math_node("SUBTRACT", wisp.outputs["Fac"], 0.5), k2["fog_noise"]))
    top = attr("fog_top")
    fog = N("ShaderNodeMapRange")
    L(h, fog.inputs[0])
    L(math_node("ADD", top, k2["fog_soft"] / 2), fog.inputs[1])
    L(math_node("SUBTRACT", top, k2["fog_soft"]), fog.inputs[2])
    fog.inputs[4].default_value = k2["fog_max"]
    fog_em = N("ShaderNodeEmission")
    fog_em.inputs["Color"].default_value = (*srgb(FOG), 1.0)
    mix1 = N("ShaderNodeMixShader")
    L(fog.outputs[0], mix1.inputs[0])
    L(bsdf.outputs["BSDF"], mix1.inputs[1])
    L(fog_em.outputs[0], mix1.inputs[2])

    # aerial haze toward the row's ramp colour (same STOPS as the sky)
    mr = N("ShaderNodeMapRange")
    mr.name = "SkyMapRange"
    ramp = N("ShaderNodeValToRGB")
    ramp.name = "SkyRamp"
    ramp.color_ramp.interpolation = "LINEAR"
    L(win.outputs["Y"], mr.inputs[0])
    L(mr.outputs[0], ramp.inputs["Fac"])
    haze_em = N("ShaderNodeEmission")
    L(ramp.outputs["Color"], haze_em.inputs["Color"])
    # extra haze toward the frame's right, where the hero has cloud sea under
    # the island (and where measure.py's S2 mask reads dark ridges as island)
    right = N("ShaderNodeMapRange")
    right.name = "HazeRight"
    L(win.outputs["X"], right.inputs[0])
    haze = attr("haze")
    mix2 = N("ShaderNodeMixShader")
    L(math_node("ADD", haze, math_node("MULTIPLY", math_node("SUBTRACT", 1.0, haze), right.outputs[0])),
      mix2.inputs[0])
    L(mix1.outputs[0], mix2.inputs[1])
    L(haze_em.outputs[0], mix2.inputs[2])
    L(mix2.outputs[0], out.inputs["Surface"])
    return mat


def row_z(spec, cam, d, row):
    """World z at horizontal distance d ahead of `cam` that projects to screen
    `row` (0 top, 1 bottom) on the frame's centre column.  Sensor fit: tall AUTO
    puts 36 mm on the long (vertical) side; wide HORIZONTAL on the width."""
    sensor_h = 36.0 if spec["sensor_fit"] == "AUTO" else 36.0 * 2160 / 3840
    t = ((0.5 - row) * sensor_h + spec["shift_y"] * 36.0) / spec["lens"]
    e = math.atan(t) - math.radians(spec["elev"])
    return cam.location.z + d * math.tan(e)


def build_ridges(framing, spec, cam, mat, nx=720, ny=48):
    """One strip per `ridges` entry, meshed in local units (u, v in distance
    units, relief in relief units) and scaled into place, so fog/noise scales
    read the same on screen at every distance."""
    obs = []
    for i, (d, crest, relief, haze, fog_top) in enumerate(spec["ridges"]):
        z0 = row_z(spec, cam, d, crest + relief)
        amp = row_z(spec, cam, d, crest) - z0
        verts, faces = [], []
        for j in range(ny + 1):
            v = -0.15 + 0.30 * j / ny
            for k in range(nx + 1):
                u = -0.9 + 1.8 * k / nx
                verts.append((u, v, ridge_relief(u, v, i + (7 if framing == "wide" else 0), K2)))
        for j in range(ny):
            for k in range(nx):
                a = j * (nx + 1) + k
                faces.append((a, a + 1, a + nx + 2, a + nx + 1))
        me = bpy.data.meshes.new(f"Ridge_{framing}_{i}")
        me.from_pydata(verts, [], faces)
        me.polygons.foreach_set("use_smooth", [True] * len(faces))
        me.materials.append(mat)
        ob = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.location = (cam.location.x, cam.location.y + d, z0)
        ob.scale = (d, d, amp)
        ob["haze"], ob["fog_top"] = haze, fog_top
        for vis in ("diffuse", "glossy", "transmission", "volume_scatter", "shadow"):
            setattr(ob, f"visible_{vis}", False)          # the island never sees it
        obs.append(ob)
    return obs


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


def render_shot(sc, framing, path, res, camera, sky_nts, ridges, spec):
    for nt in sky_nts:
        set_sky(nt, framing)
    for name, obs in ridges.items():
        for ob in obs:
            ob.hide_render = name != framing
    for ob in bpy.data.objects:
        if ob.name.startswith("FirFill"):
            ob.hide_render = not spec["fir_fill"]
    for mat_name in ("grass_medium_01", "grass_medium_01.001"):
        group = next(n for n in bpy.data.materials[mat_name].node_tree.nodes if n.type == "GROUP")
        group.inputs["Value"].default_value = spec["grass_value"]
    hr = bpy.data.materials["ridges"].node_tree.nodes["HazeRight"]
    hr.inputs[1].default_value = spec["haze_right_from"]
    hr.inputs[2].default_value = spec["haze_right_from"] + 0.4
    hr.inputs[4].default_value = spec["haze_right"]
    sc.camera = camera
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.view_settings.exposure = spec["exposure"]
    sc.render.filepath = path
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
    for key in ("tree_scale", "lumps", "under_boulders"):
        hero.K[key] = K2[key]
    hero.K2 = K2
    patch_layers(hero, [(t * K2["layers_scale"], tint, prot * K2["ledge_scale"], grav)
                        for t, tint, prot, grav in LAYERS])
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
    world_nt = wrap_world(sc.world)
    for name, key in (("turf", "tint_turf"), ("strata", "tint_strata"),
                      ("basalt", "tint_basalt")):
        tint_material(bpy.data.materials.get(name), K2[key])
    fix_basalt(K2)
    island_palette(K2)
    bulk_underside(K2)
    fill_firs(K2)

    cam_tall = bpy.data.objects["Cam"]
    cam_wide = bpy.data.objects.new("CamWide", bpy.data.cameras.new("CamWide"))
    sc.collection.objects.link(cam_wide)
    setup_camera(cam_tall, K2["tall"])
    setup_camera(cam_wide, K2["wide"])
    cameras = {"tall": cam_tall, "wide": cam_wide}
    mat = ridge_material(K2)
    ridges = {f: build_ridges(f, K2[f], cameras[f], mat) for f in ("tall", "wide")}
    sky_nts = (world_nt, mat.node_tree)

    image = sc.render.image_settings
    image.file_format = "PNG"
    image.color_mode = "RGB"
    image.color_depth = "8"
    print(f"still: shots={shots} outdir={outdir} az={K2['az']} "
          f"res={args.res or 'native'}", flush=True)

    if args.warmup:
        render_shot(sc, shots[0], os.path.join(outdir, "warmup.png"), WARMUP_RES,
                    cameras[shots[0]], sky_nts, ridges, K2[shots[0]])
    for framing in shots:
        render_shot(sc, framing, os.path.join(outdir, f"{framing}-s0-f0.png"),
                    args.res or RENDER_RES[framing], cameras[framing], sky_nts,
                    ridges, K2[framing])


if __name__ == "__main__":
    main()
