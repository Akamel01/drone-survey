"""A gull-like bird with a biomechanically shaped wingbeat, rendered as sprite frames.

    blender -b --factory-startup -P bird.py -- <outdir>

Frames 1..FLAP are one wingbeat (fast downstroke with the wing fully spread,
slower upstroke with the hand folding back at the wrist); frame FLAP+1 is the
glide pose. The bird faces +Y; the camera sees it side-on, a little below and
ahead, so it crosses the screen left to right. Pack the frames with sprite.py.
"""
import bpy, bmesh, math, os, sys

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/bird"
FLAP = 16            # frames per wingbeat
SIZE = 192           # sprite cell, px
DOWN = 0.55          # share of the beat spent on the downstroke
UP_DEG, DOWN_DEG = 48.0, -34.0

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
mat = bpy.data.materials.new("feather")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.045, 0.045, 0.05, 1)
bsdf.inputs["Roughness"].default_value = 0.8


def mesh_obj(name, verts, faces, parent=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob


def ellipsoid(name, rx, ry, rz, loc, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    for v in bm.verts:
        v.co.x *= rx; v.co.y *= ry; v.co.z *= rz
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    ob.parent = parent; ob.location = loc
    return ob


body = ellipsoid("body", 0.055, 0.19, 0.05, (0, 0, 0))
ellipsoid("head", 0.04, 0.05, 0.038, (0, 0.2, 0.02), body)
mesh_obj("tail", [(-0.05, -0.16, 0), (0.05, -0.16, 0), (0.07, -0.3, 0), (-0.07, -0.3, 0)], [(0, 1, 2, 3)], body)


def wing(side):
    """Arm (shoulder to wrist) and hand (wrist to tip); side is +1 left, -1 right."""
    s = side
    arm = mesh_obj(f"arm{s}", [(0, 0.085, 0), (s * 0.24, 0.075, 0.01), (s * 0.24, -0.075, 0), (0, -0.095, 0)],
                   [(0, 1, 2, 3) if s > 0 else (3, 2, 1, 0)], body, (s * 0.04, 0.02, 0.01))
    # The hand tapers to a pointed, slightly swept tip, with a notch where the primaries separate.
    hv = [(0, 0.075, 0), (s * 0.13, 0.045, 0), (s * 0.27, -0.03, 0), (s * 0.33, -0.1, 0),
          (s * 0.21, -0.085, 0), (s * 0.10, -0.08, 0), (0, -0.075, 0)]
    hand = mesh_obj(f"hand{s}", hv, [tuple(range(7)) if s > 0 else tuple(reversed(range(7)))], arm, (s * 0.24, 0, 0))
    return arm, hand


armL, handL = wing(1)
armR, handR = wing(-1)


def pose(p, glide=False):
    """Joint angles for phase p in [0, 1)."""
    if glide:
        return math.radians(6), 0.0, 0.0, 0.0
    if p < DOWN:                                          # downstroke: fast, fully spread
        t = p / DOWN
        elev = UP_DEG + (DOWN_DEG - UP_DEG) * (0.5 - 0.5 * math.cos(math.pi * t))
        fold, droop = 0.0, -8 * math.sin(math.pi * t)     # hand lags a little
    else:                                                 # upstroke: slower, hand folds back
        t = (p - DOWN) / (1 - DOWN)
        elev = DOWN_DEG + (UP_DEG - DOWN_DEG) * (0.5 - 0.5 * math.cos(math.pi * t))
        fold = 58 * math.sin(math.pi * t) ** 1.3
        droop = 26 * math.sin(math.pi * t)
    bob = 0.018 * math.sin(2 * math.pi * p)               # body rises on the downstroke
    return math.radians(elev), math.radians(fold), math.radians(droop), bob


def apply(frame, p, glide=False):
    elev, fold, droop, bob = pose(p, glide)
    for arm, hand, s in ((armL, handL, 1), (armR, handR, -1)):
        arm.rotation_euler = (0, -s * elev, 0)
        hand.rotation_euler = (0, s * droop * 0.5, -s * fold)
        arm.keyframe_insert("rotation_euler", frame=frame)
        hand.keyframe_insert("rotation_euler", frame=frame)
    body.location = (0, 0, bob)
    body.keyframe_insert("location", frame=frame)


for f in range(FLAP + 1):                                 # one extra keyframe closes the loop for motion blur
    apply(f + 1, (f % FLAP) / FLAP)
apply(FLAP + 3, 0.0, glide=True)

# Camera: side-on, a little below and ahead; the bird crosses left to right.
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.05
sc.collection.objects.link(cam); sc.camera = cam
from mathutils import Vector
cam.location = Vector((2.6, 0.55, -0.42))   # the bird's side, a little below and ahead
cam.rotation_euler = (Vector((0, 0, 0.02)) - cam.location).to_track_quat("-Z", "Y").to_euler()

world = bpy.data.worlds.new("w"); sc.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.5, 0.58, 0.66, 1)

r = sc.render
r.engine = "CYCLES"; sc.cycles.samples = 48; sc.cycles.use_denoising = True
r.resolution_x = r.resolution_y = SIZE
r.film_transparent = True
r.use_motion_blur = True; r.motion_blur_shutter = 0.45
sc.view_settings.view_transform = "Standard"
os.makedirs(OUT, exist_ok=True)
for f in range(1, FLAP + 1):
    sc.frame_set(f)
    r.filepath = f"{OUT}/flap_{f:02d}.png"
    bpy.ops.render.render(write_still=True)
r.use_motion_blur = False
sc.frame_set(FLAP + 3)
r.filepath = f"{OUT}/glide.png"
bpy.ops.render.render(write_still=True)
print("bird frames done")
