"""Build the hero island in Blender 5.2 and render previews.

    blender -b --factory-startup -P hero.py -- preview <outdir>

Everything the art direction can change lives in K. The scene is rebuilt
from nothing on every run, so the script is the source of truth.
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, noise

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = ARGS[0] if ARGS else "preview"
OUT = ARGS[1] if len(ARGS) > 1 else os.path.expanduser("~/hero3d/out")
A = os.path.expanduser("~/hero3d/assets")

K = dict(
    seed=11,
    R=3.0,            # top radius, metres
    dome=0.22,        # how much the turf bulges
    strata=1.35,      # height of the cut, layered sides
    under=2.7,        # depth of the rocky underside below the cut
    lumps=0.34,       # underside lumpiness
    ledges=0.05,      # strata ledge depth
    tree_scale=0.36, overhang=0.30, droop=0.42,
    grass_density=110.0, grass_tall_density=22.0, moss_density=1600.0, flower_count=34, boulders=5, under_boulders=20,
    sun_strength=2.4, sun_angle=14.0, sun_elev=42.0, sun_azim=-55.0,
    hdri_strength=1.45,
    samples=128, res_x=608, res_y=1080,
    cam_lens=50.0, cam_elev=8.0, cam_dist=17.5, shift_x=-0.12, shift_y=0.09,
)
rng = random.Random(K["seed"])

LAYERS = [  # top to bottom
    (0.18, (0.07, 0.05, 0.035), -0.08, 0),  # humus under the turf, recessed so the turf overhangs
    (0.08, (0.50, 0.46, 0.40), -0.02, 1),   # pebble band
    (0.15, (0.34, 0.22, 0.12), 0.02, 0),    # brown soil
    (0.07, (0.52, 0.48, 0.42), -0.01, 1),   # pebble band
    (0.18, (0.56, 0.43, 0.27), 0.03, 0),    # tan sediment
    (0.09, (0.46, 0.43, 0.38), -0.02, 1),   # pebble band
    (0.14, (0.20, 0.15, 0.11), 0.01, 0),    # dark soil
    (0.20, (0.10, 0.10, 0.11), 0.05, 0),    # weathered dark rock, the start of the basalt
]
BOUNDS = []
_z = 0.0
for _t, *_ in LAYERS:
    BOUNDS.append((_z, _z + _t)); _z += _t
K["strata"] = _z

def layer_at(depth):
    for (a, b), L in zip(BOUNDS, LAYERS):
        if depth <= b:
            return L, (depth - a) / (b - a)
    return LAYERS[-1], 1.0


# ─── Geometry ────────────────────────────────────────────────────────────────
N = 160            # vertices around
PH = [rng.uniform(0, 6.283) for _ in range(6)]

def outline(t):
    return (1 + 0.07 * math.sin(2 * t + PH[0]) + 0.05 * math.sin(3 * t + PH[1])
            + 0.03 * math.sin(5 * t + PH[2]) + 0.015 * math.sin(9 * t + PH[3]))

def fbm(v, octaves=4):
    return noise.fractal(v, 1.0, 2.0, octaves)

def island_rings():
    """Rings of (points, region) from the top centre down to the bottom tip."""
    R, rings = K["R"], []
    top_k = 22
    for k in range(1, top_k + 1):
        rho = k / top_k
        pts = []
        for i in range(N):
            t = 2 * math.pi * i / N
            edge = max(0.0, (rho - 0.78) / 0.22) ** 2          # 0 inland, 1 at the rim
            lumpy = 0.5 + 0.5 * fbm(Vector((math.cos(t) * 3, math.sin(t) * 3, 1.0)))
            r = rho * R * outline(t) * (1 + K["overhang"] / R * edge * (0.6 + 0.8 * lumpy))
            x, y = r * math.cos(t), r * math.sin(t)
            z = (K["dome"] * (1 - rho ** 2.2) + 0.09 * fbm(Vector((x, y, 0)) * 0.55)
                 + 0.035 * fbm(Vector((x, y, 3.0)) * 1.9)) - K["droop"] * edge ** 1.6 * (0.5 + lumpy)
            pts.append((x, y, z))
        rings.append((pts, 0))
    side_k = 72
    for k in range(1, side_k + 1):
        tt = k / side_k
        depth = tt * K["strata"]
        pts = []
        for i in range(N):
            t = 2 * math.pi * i / N
            c, s_ = math.cos(t), math.sin(t)
            # Layers wander a little in height around the island.
            d = depth + 0.03 * fbm(Vector((c * 1.5, s_ * 1.5, 7.0)))
            (thick, tint, prot, grav), f = layer_at(d)
            crumble = -0.035 * (1 - min(f, 1 - f) * 2) ** 6          # edges of a layer erode back
            broken = 0.04 * fbm(Vector((c * 4, s_ * 4, d * 3))) + 0.02 * fbm(Vector((c * 11, s_ * 11, d * 9)))
            base = R * outline(t) * (1 - 0.03 * tt)
            r = base + prot + crumble + broken
            pts.append((r * c, r * s_, -depth))
        rings.append((pts, 1))
    under_k = 30
    for k in range(1, under_k):
        tt = k / under_k
        z = -K["strata"] - tt * K["under"]
        pts = []
        for i in range(N):
            t = 2 * math.pi * i / N
            v = Vector((math.cos(t) * 1.6, math.sin(t) * 1.6, z * 0.7))
            lump = 1 + K["lumps"] * noise.noise(v * 0.9) + 0.10 * fbm(v * 2.4)
            r = K["R"] * outline(t) * (1 - tt) ** 0.55 * lump
            pts.append((r * math.cos(t) + 0.25 * tt, r * math.sin(t) - 0.15 * tt, z))
        rings.append((pts, 2))
    return rings

def build_mesh(name, rings, regions=(0, 1, 2), cap_bottom=True, fan=True):
    bm = bmesh.new()
    centre = bm.verts.new((0, 0, K["dome"]))
    prev = None
    ring_verts = []
    for pts, region in rings:
        vs = [bm.verts.new(p) for p in pts]
        ring_verts.append((vs, region))
    first, reg0 = ring_verts[0]
    if fan and 0 in regions:
        for i in range(N):
            f = bm.faces.new((centre, first[i], first[(i + 1) % N]))
            f.material_index = 0
    for (a, _), (b, region) in zip(ring_verts, ring_verts[1:]):
        if region not in regions:
            continue
        for i in range(N):
            j = (i + 1) % N
            f = bm.faces.new((a[i], b[i], b[j], a[j]))
            f.material_index = region
    if cap_bottom and 2 in regions:
        last, _ = ring_verts[-1]
        tip = bm.verts.new((0.3, -0.2, -K["strata"] - K["under"] - 0.25))
        for i in range(N):
            f = bm.faces.new((last[i], tip, last[(i + 1) % N]))
            f.material_index = 2
    bm.verts.ensure_lookup_table()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob

def subdivide(ob, level):
    m = ob.modifiers.new("subd", "SUBSURF")
    m.levels = level
    m.render_levels = level


# ─── Materials ───────────────────────────────────────────────────────────────
def tex(name, kind):
    return f"{A}/{name}/{name}_{kind}_2k.jpg"

class NB:
    """Small helper for building shader node trees."""
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.out = self.n("ShaderNodeOutputMaterial")
        self.tc = self.n("ShaderNodeTexCoord")

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.nt.links.new(a, b)

    def inp(self, node, name):
        return next(s for s in node.inputs if s.name == name and s.enabled)

    def outp(self, node, name):
        return next(s for s in node.outputs if s.name == name and s.enabled)

    def mapped(self, scale):
        m = self.n("ShaderNodeMapping")
        m.inputs["Scale"].default_value = (scale, scale, scale)
        self.link(self.tc.outputs["Object"], m.inputs["Vector"])
        return m.outputs["Vector"]

    def image(self, path, vec, non_color=False, blend=0.3):
        node = self.n("ShaderNodeTexImage")
        node.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = "Non-Color"
        node.projection = "BOX"
        node.projection_blend = blend
        self.link(vec, node.inputs["Vector"])
        return node.outputs["Color"]

    def value(self, v):
        node = self.n("ShaderNodeValue")
        node.outputs[0].default_value = v
        return node.outputs[0]

    def math(self, op, a, b=None, clamp=False):
        node = self.n("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                node.inputs[i].default_value = x
            else:
                self.link(x, node.inputs[i])
        return node.outputs[0]

    def mix(self, a, b, fac, blend="MIX"):
        node = self.n("ShaderNodeMix", data_type="RGBA", blend_type=blend)
        for sock, x in ((node.inputs[0], fac), (node.inputs[6], a), (node.inputs[7], b)):
            if isinstance(x, (int, float)):
                sock.default_value = x
            elif isinstance(x, tuple):
                sock.default_value = x
            else:
                self.link(x, sock)
        return node.outputs[2]

    def hsv(self, col, h=0.5, s=1.0, v=1.0):
        node = self.n("ShaderNodeHueSaturation")
        node.inputs["Hue"].default_value = h
        node.inputs["Saturation"].default_value = s
        node.inputs["Value"].default_value = v
        self.link(col, node.inputs["Color"])
        return node.outputs["Color"]

    def band(self, x, a, b, soft=0.02):
        """1 inside [a, b], 0 outside, softened edges."""
        up = self.n("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        up.inputs["From Min"].default_value = a - soft
        up.inputs["From Max"].default_value = a + soft
        self.link(x, up.inputs["Value"])
        dn = self.n("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        dn.inputs["From Min"].default_value = b + soft
        dn.inputs["From Max"].default_value = b - soft
        self.link(x, dn.inputs["Value"])
        return self.math("MULTIPLY", up.outputs["Result"], dn.outputs["Result"])

    def noise(self, vec, scale, detail=6.0):
        node = self.n("ShaderNodeTexNoise")
        node.inputs["Scale"].default_value = scale
        node.inputs["Detail"].default_value = detail
        self.link(vec, node.inputs["Vector"])
        return node.outputs["Fac"]

    def principled(self, color, rough, normal_col=None, strength=1.0):
        bsdf = self.n("ShaderNodeBsdfPrincipled")
        self.link(color, bsdf.inputs["Base Color"])
        if isinstance(rough, (int, float)):
            bsdf.inputs["Roughness"].default_value = rough
        else:
            self.link(rough, bsdf.inputs["Roughness"])
        if normal_col is not None:
            nm = self.n("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = strength
            self.link(normal_col, nm.inputs["Color"])
            self.link(nm.outputs["Normal"], bsdf.inputs["Normal"])
        self.link(bsdf.outputs["BSDF"], self.out.inputs["Surface"])
        return bsdf

    def displace(self, height, scale, method="BOTH", mat=None):
        d = self.n("ShaderNodeDisplacement")
        d.inputs["Scale"].default_value = scale
        d.inputs["Midlevel"].default_value = 0.5
        self.link(height, d.inputs["Height"])
        self.link(d.outputs["Displacement"], self.out.inputs["Displacement"])
        if mat is not None:
            mat.displacement_method = method


def mat_turf():
    m = bpy.data.materials.new("turf")
    b = NB(m)
    v = b.mapped(1 / 2.0)
    ground = b.image(tex("forest_ground_04", "Diffuse"), v)
    moss = (0.2, 0.3, 0.05, 1)
    patch = b.noise(b.tc.outputs["Object"], 1.6)
    col = b.mix(b.hsv(ground, v=0.55), moss, b.math("GREATER_THAN", patch, 0.45))
    b.principled(col, 0.9, b.image(tex("forest_ground_04", "nor_gl"), v, True))
    return m

def mat_strata():
    """The cut sides: the LAYERS, tinted over detail taken from a scanned cliff face."""
    m = bpy.data.materials.new("strata")
    b = NB(m)
    obj = b.tc.outputs["Object"]
    sep = b.n("ShaderNodeSeparateXYZ"); b.link(obj, sep.inputs["Vector"])
    wobble = b.math("MULTIPLY", b.math("SUBTRACT", b.noise(b.mapped(1.5), 1.0, 3), 0.5), 0.05)
    zn = b.math("ADD", b.math("DIVIDE", sep.outputs["Z"], -K["strata"]), wobble)
    ramp = b.n("ShaderNodeValToRGB"); b.link(zn, ramp.inputs["Fac"])
    ramp.color_ramp.interpolation = "EASE"
    gramp = b.n("ShaderNodeValToRGB"); b.link(zn, gramp.inputs["Fac"])
    gramp.color_ramp.interpolation = "CONSTANT"
    els, gels = ramp.color_ramp.elements, gramp.color_ramp.elements
    for i, ((a, z), (thick, tint, prot, grav)) in enumerate(zip(BOUNDS, LAYERS)):
        for pos in (a / K["strata"] + 0.004, z / K["strata"] - 0.004):
            e = els[0] if (i == 0 and pos == a / K["strata"] + 0.004) else els.new(pos)
            e.color = (*tint, 1)
        g = gels[0] if i == 0 else gels.new(a / K["strata"])
        g.color = (grav, grav, grav, 1)
    v_cliff = b.mapped(1 / 1.6)
    detail = b.hsv(b.image(tex("cliff_side", "Diffuse"), v_cliff), s=0.0, v=1.9)
    col = b.mix(ramp.outputs["Color"], detail, 1.0, "MULTIPLY")
    v_grav = b.mapped(1 / 0.9)
    gravel = b.hsv(b.image(tex("forest_ground_04", "Diffuse"), v_grav), s=0.7, v=0.8)
    col = b.mix(col, gravel, gramp.outputs["Color"])
    roots = b.math("MULTIPLY", b.math("LESS_THAN", zn, 0.14), b.math("GREATER_THAN", b.noise(b.mapped(3.0), 2.0), 0.62))
    col = b.mix(col, (0.05, 0.04, 0.03, 1), roots)
    nrm = b.mix(b.image(tex("cliff_side", "nor_gl"), v_cliff, True), b.image(tex("forest_ground_04", "nor_gl"), v_grav, True), gramp.outputs["Color"])
    b.principled(col, 0.86, nrm, 1.3)
    b.displace(b.image(tex("cliff_side", "Displacement"), v_cliff, True), 0.05, mat=m)
    return m

def mat_basalt():
    """Dark, damp rock of the underside, with a few moss seams near the top."""
    m = bpy.data.materials.new("basalt")
    b = NB(m)
    obj = b.tc.outputs["Object"]
    v = b.mapped(1 / 2.5)
    rock = b.hsv(b.image(tex("lichen_rock", "Diffuse"), v), s=0.2, v=0.16)
    sep = b.n("ShaderNodeSeparateXYZ"); b.link(obj, sep.inputs["Vector"])
    near_top = b.math("GREATER_THAN", b.math("ADD", sep.outputs["Z"], b.math("MULTIPLY", b.noise(obj, 2.5), 0.9)), -K["strata"] - 0.15)
    mossy = b.hsv(b.image(tex("aerial_rocks_02", "Diffuse"), v), s=0.9, v=0.24)
    col = b.mix(rock, mossy, near_top)
    rough = b.math("ADD", b.math("MULTIPLY", b.image(tex("lichen_rock", "Rough"), v, True), 0.3), 0.14)
    bs = b.principled(col, rough, b.image(tex("lichen_rock", "nor_gl"), v, True), 1.4)
    bs.inputs["Specular IOR Level"].default_value = 0.65
    vor = b.n("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 0.85
    b.link(obj, vor.inputs["Vector"])
    height = b.math("ADD", b.math("MULTIPLY", vor.outputs["Distance"], 0.6), b.math("MULTIPLY", b.image(tex("lichen_rock", "Displacement"), v, True), 0.4))
    b.displace(height, 0.42, mat=m)
    return m


# ─── Assets and scattering ───────────────────────────────────────────────────
def append(blend, names):
    with bpy.data.libraries.load(f"{A}/{blend}/{blend}.blend", link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n in names]
    return [o for o in dst.objects if o]

def library(name, objs):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    for o in objs:
        for c in o.users_collection:
            c.objects.unlink(o)
        col.objects.link(o)
        o.location = (0, 0, 0)
    bpy.context.view_layer.layer_collection.children[name].exclude = True
    return col

def scatter(target, col, density, smin, smax, seed, align=True, clump=None):
    """Geometry-nodes scatter of a collection's objects over `target`."""
    ng = bpy.data.node_groups.new(f"scatter_{col.name}", "GeometryNodeTree")
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    nd, ln = ng.nodes, ng.links
    gi, go = nd.new("NodeGroupInput"), nd.new("NodeGroupOutput")
    dist = nd.new("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Density"].default_value = density
    dist.inputs["Seed"].default_value = seed
    ln.new(gi.outputs[0], dist.inputs["Mesh"])
    if clump:
        nz = nd.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = clump[2]
        nz.inputs["Detail"].default_value = 3.0
        mr = nd.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = clump[0], clump[1]
        ln.new(nz.outputs["Fac"], mr.inputs["Value"])
        mul = nd.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = density
        ln.new(mr.outputs["Result"], mul.inputs[0])
        ln.new(mul.outputs[0], dist.inputs["Density"])
    info = nd.new("GeometryNodeCollectionInfo")
    info.inputs["Collection"].default_value = col
    info.inputs["Separate Children"].default_value = True
    info.inputs["Reset Children"].default_value = True
    inst = nd.new("GeometryNodeInstanceOnPoints")
    inst.inputs["Pick Instance"].default_value = True
    ln.new(dist.outputs["Points"], inst.inputs["Points"])
    ln.new(info.outputs[0], inst.inputs["Instance"])
    rnd_i = nd.new("FunctionNodeRandomValue"); rnd_i.data_type = "INT"
    [s for s in rnd_i.inputs if s.name == "Max" and s.type == "INT"][0].default_value = 999
    [s for s in rnd_i.inputs if s.name == "Seed"][0].default_value = seed + 1
    ln.new([s for s in rnd_i.outputs if s.type == "INT"][0], inst.inputs["Instance Index"])
    spin = nd.new("FunctionNodeRandomValue"); spin.data_type = "FLOAT"
    [s for s in spin.inputs if s.name == "Max" and s.type == "VALUE"][0].default_value = 6.283
    [s for s in spin.inputs if s.name == "Seed"][0].default_value = seed + 2
    comb = nd.new("ShaderNodeCombineXYZ")
    ln.new([s for s in spin.outputs if s.type == "VALUE"][0], comb.inputs["Z"])
    e2r = nd.new("FunctionNodeEulerToRotation")
    ln.new(comb.outputs[0], e2r.inputs[0])
    if align:
        rot = nd.new("FunctionNodeRotateRotation")
        rot.rotation_space = "LOCAL"
        ln.new(dist.outputs["Rotation"], rot.inputs["Rotation"])
        ln.new(e2r.outputs[0], rot.inputs["Rotate By"])
        ln.new(rot.outputs[0], inst.inputs["Rotation"])
    else:
        ln.new(e2r.outputs[0], inst.inputs["Rotation"])
    sc = nd.new("FunctionNodeRandomValue"); sc.data_type = "FLOAT"
    [s for s in sc.inputs if s.name == "Min" and s.type == "VALUE"][0].default_value = smin
    [s for s in sc.inputs if s.name == "Max" and s.type == "VALUE"][0].default_value = smax
    [s for s in sc.inputs if s.name == "Seed"][0].default_value = seed + 3
    ln.new([s for s in sc.outputs if s.type == "VALUE"][0], inst.inputs["Scale"])
    ln.new(inst.outputs[0], go.inputs[0])
    mod = target.modifiers.new(f"scatter_{col.name}", "NODES")
    mod.node_group = ng
    return target


def carrier(name, rings, regions, level=2, fan=True):
    """A copy of part of the island's surface, used only to carry scattered plants."""
    ob = build_mesh(name, rings, regions, cap_bottom=False, fan=fan)
    subdivide(ob, level)
    return ob


# ─── Scene ───────────────────────────────────────────────────────────────────
def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    root = bpy.data.objects.new("IslandRoot", None)
    sc.collection.objects.link(root)

    rings = island_rings()
    island = build_mesh("Island", rings)
    for m in (mat_turf(), mat_strata(), mat_basalt()):
        island.data.materials.append(m)
    subdivide(island, 3)
    island.parent = root

    # Plants: grass, moss and flowers ride on copies of the top.
    top_rings = [r for r in rings if r[1] == 0]
    lip_rings = [r for r in rings if r[1] == 0][-5:] + [r for r in rings if r[1] == 1][:3]
    grass_small = library("lib_grass", append("grass_medium_01", {f"grass_medium_01_{s}_LOD0" for s in
                          ("tiny_a", "tiny_b", "tiny_c", "tiny_d", "tiny_e", "tiny_f", "small_a", "small_b", "mid_b", "mid_c")}))
    grass_tall = library("lib_grass_tall", append("grass_medium_01", {f"grass_medium_01_tall_{s}_LOD0" for s in "abc"}))
    moss = library("lib_moss", append("moss_01", {f"moss_01_{s}_LOD0" for s in "abcdefghij"} | {"moss_01_tall_a_LOD0", "moss_01_tall_b_LOD0"}))
    flowers = library("lib_flowers", append("flower_heliophila", {"flower_heliophila_small_LOD0", "flower_heliophila_medium_LOD0"}))

    for name, col, dens, smin, smax, seed, clump in (
        ("TopMoss", moss, K["moss_density"], 2.0, 3.4, 3, None),
        ("TopGrass", grass_small, K["grass_density"], 0.6, 1.1, 5, (0.46, 0.62, 0.9)),
        ("TopGrassTall", grass_tall, K["grass_tall_density"], 0.45, 0.85, 7, (0.5, 0.65, 1.3)),
    ):
        ob = carrier(name, top_rings, (0,))
        scatter(ob, col, dens, smin, smax, seed, clump=clump)
        ob.parent = root
    lip = carrier("LipMoss", lip_rings, (0, 1), fan=False)
    scatter(lip, moss, K["moss_density"] * 2.2, 3.0, 5.0, 9)
    lip.parent = root
    fl = carrier("Flowers", top_rings, (0,))
    area = math.pi * K["R"] ** 2
    scatter(fl, flowers, K["flower_count"] / area, 0.35, 0.6, 13)
    fl.parent = root

    # A few mossy boulders half sunk in the turf.
    rocks = append("rock_moss_set_01", {"rock_moss_set_01_rock04", "rock_moss_set_01_rock05", "rock_moss_set_01_rock06"})
    for n_ in range(K["boulders"]):
        src = rocks[n_ % len(rocks)]
        ob = src.copy(); sc.collection.objects.link(ob)
        ang, rad = rng.uniform(0, 6.28), rng.uniform(0.6, 2.5)
        ob.location = (rad * math.cos(ang), rad * math.sin(ang), K["dome"] * (1 - (rad / K["R"]) ** 2.2) - 0.05)
        ob.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 6.28))
        ob.scale = (rng.uniform(0.09, 0.17),) * 3
        ob.parent = root

    # Big, rounded, dark boulders make the underside bulbous rather than a cone.
    basalt = island.data.materials[2]
    for n_ in range(K["under_boulders"]):
        src = rocks[n_ % len(rocks)]
        ob = src.copy(); ob.data = src.data.copy(); sc.collection.objects.link(ob)
        ob.data.materials.clear(); ob.data.materials.append(basalt)
        t_ = rng.uniform(0.08, 0.75); ang = rng.uniform(0, 6.28)
        rad = K["R"] * outline(ang) * (1 - t_) ** 0.55 * 0.82
        ob.location = (rad * math.cos(ang), rad * math.sin(ang), -K["strata"] - t_ * K["under"])
        ob.rotation_euler = (rng.uniform(0, 6.28), rng.uniform(0, 6.28), rng.uniform(0, 6.28))
        ob.scale = (rng.uniform(0.32, 0.62) * (1.1 - t_ * 0.5),) * 3
        ob.parent = root

    # Three small firs, clustered back-left like the reference.
    firs = append("fir_sapling_medium", {"fir_sapling_medium_a_LOD0", "fir_sapling_medium_b_LOD0", "fir_sapling_medium_c_LOD0"})
    spots = [(-0.5, 0.7, 1.0), (-1.5, -0.2, 0.78), (0.5, 1.5, 0.74)]
    firs = sorted(firs, key=lambda o: o.name)
    for (x, y, s), src in zip(spots, (firs[0], firs[1], firs[0])):
        # Three copies of a sapling turned about its trunk fill it out into a full crown.
        for k, turn in enumerate((0.0, 2.1, 4.2)):
            ob = src.copy(); sc.collection.objects.link(ob)
            ob.location = (x, y, K["dome"] * 0.6)
            ob.rotation_euler = (0, 0, turn + rng.uniform(-0.3, 0.3))
            ob.scale = (K["tree_scale"] * s * (1 - 0.06 * k),) * 3
            ob.parent = root

    # Light: overcast sky for the fill, a soft sun for shape and the wet highlights.
    world = bpy.data.worlds.new("sky"); sc.world = world
    nb = NB.__new__(NB); world.use_nodes = True; nb.nt = world.node_tree; nb.nt.nodes.clear()
    env = nb.n("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(f"{A}/kloofendal_overcast_puresky/kloofendal_overcast_puresky_4k.hdr")
    bg = nb.n("ShaderNodeBackground"); bg.inputs["Strength"].default_value = K["hdri_strength"]
    out = nb.n("ShaderNodeOutputWorld")
    # The sky lights from above only: below the horizon is dark ground, so the underside falls into shadow.
    tc = nb.n("ShaderNodeTexCoord"); sep = nb.n("ShaderNodeSeparateXYZ")
    nb.link(tc.outputs["Generated"], sep.inputs["Vector"])
    ramp = nb.n("ShaderNodeMapRange"); ramp.inputs["From Min"].default_value = -0.15; ramp.inputs["From Max"].default_value = 0.08
    nb.link(sep.outputs["Z"], ramp.inputs["Value"])
    mixg = nb.n("ShaderNodeMix", data_type="RGBA")
    mixg.inputs[6].default_value = (0.012, 0.016, 0.02, 1)
    nb.link(env.outputs["Color"], mixg.inputs[7]); nb.link(ramp.outputs["Result"], mixg.inputs[0])
    nb.link(mixg.outputs[2], bg.inputs["Color"]); nb.link(bg.outputs["Background"], out.inputs["Surface"])
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = K["sun_strength"]; sun.data.angle = math.radians(K["sun_angle"])
    sun.data.color = (1.0, 0.95, 0.88)
    az, el = math.radians(K["sun_azim"]), math.radians(K["sun_elev"])
    src = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    sun.rotation_euler = (-src).to_track_quat("-Z", "Y").to_euler()
    sc.collection.objects.link(sun)

    # Camera: fixed; the island turns under it.
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = K["cam_lens"]
    sc.collection.objects.link(cam); sc.camera = cam
    target = Vector((0, 0, -0.4))
    dist = K["cam_dist"]
    el = math.radians(K["cam_elev"])
    cam.location = target + Vector((0, -dist * math.cos(el), dist * math.sin(el)))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.shift_x, cam.data.shift_y = K["shift_x"], K["shift_y"]

    r = sc.render
    r.engine = "CYCLES"
    r.resolution_x, r.resolution_y = K["res_x"], K["res_y"]
    r.film_transparent = True
    sc.cycles.samples = K["samples"]
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.refresh_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    return root


def render_preview(root):
    os.makedirs(OUT, exist_ok=True)
    for i, deg in enumerate((0, 90, 180, 270)):
        root.rotation_euler = (0, 0, math.radians(deg))
        bpy.context.scene.render.filepath = f"{OUT}/az{deg:03d}.png"
        bpy.ops.render.render(write_still=True)
        print("rendered", deg, flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=f"{OUT}/hero.blend")


root = build()
if MODE == "preview":
    render_preview(root)
