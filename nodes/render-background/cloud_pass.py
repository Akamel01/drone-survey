"""Render the Showcase cloud layers (M3): one static HDRI-lit 1-bounce Cycles
volumetric sea per framing, framed exactly like the island turn plus margin.

    blender -b --factory-startup -P nodes/render-background/cloud_pass.py -- \
        ISLAND_DIR CLOUDS_WIDE CLOUDS_TALL
    python3 nodes/render-background/cloud_pass.py --self-test   # no Blender needed

nodes/render/render_island.py is imported read-only for its framing math and is
never edited by this Node.  Each output is (W + 2*MARGIN_PX) x H: the island
camera's frame with MARGIN_PX of extra scenery on each side, so grade can pan
the layer horizontally without wrap/crossfade and still sample real pixels.
The central WxH window is the island camera's exact view; --self-test proves
that identity in pure Python through render_island.project().

The volume is a bounded box in the island's frame, lit by the shared overcast
HDRI world (render_island._sky), film_transparent so the layer is RGBA and
grade composites it behind the island (ADR-2).  Static: no frame index and no
wall clock enters the scene, so a re-render is stable; the drift is grade's job.
"""
import math
import os
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
_RENDER_DIR = os.path.normpath(os.path.join(_HERE, os.pardir, "render"))
if _RENDER_DIR not in sys.path:
    sys.path.insert(0, _RENDER_DIR)
import render_island  # noqa: E402  (path must be set first; no bpy at import)

MARGIN_PX = 96  # per side; the island camera's WxH window sits at the layer's centre

SAMPLES = render_island.K["samples"]  # 128, same as the island pass
VOLUME_BOUNCES = 1  # Q6 fallback 1: bounded box, one volume bounce (architecture §2.6)
VOLUME_STEP_RATE = 2.0  # "moderate": coarser than the 1.0 default, tuned by the pilot

CLOUD_FEATURE = 0.25  # noise feature size, in island spans
CLOUD_OPACITY = 3.0  # unit-path opacity per island span, before noise mask and falloff
NOISE_WINDOW = (0.45, 0.75)  # noise Fac window remapped to the cloud mask
BOX_MARGIN = 0.8  # box half-extent in x/y, as a fraction of the nearest camera distance
BOX_TOP = 0.5  # box top, as a fraction of the way from the island's base to the lowest camera
BOX_BOTTOM = 1.0  # box bottom, in island spans below the island's base


# ─── camera: the island frame plus MARGIN_PX per side ────────────────────────
def output_res(res):
    """The cloud layer resolution for an island framing: (W + 2*MARGIN_PX, H)."""
    return (res[0] + 2 * MARGIN_PX, res[1])


def _sensor_width(res):
    """AUTO fits the long side (render_island._tans): widen the sensor only when
    the long side is horizontal, so a tall layer keeps the island's vertical FOV."""
    w, h = res
    if w >= h:
        return render_island.SENSOR_WIDTH * (w + 2 * MARGIN_PX) / w
    return render_island.SENSOR_WIDTH


def cloud_camera(bbox, res):
    """The layer camera for one framing: the island camera's placement at `res`
    (render_island.frame_camera, render_island.py:114), reprojected at
    (W+192, H) with the matching sensor width.

    For any world point, the layer's projected y equals the island camera's, and
    its projected x sits MARGIN_PX right of the island camera's pixel; the
    central WxH crop is therefore the island frame exactly (proved in self_test).
    """
    cam = dict(render_island.frame_camera(bbox, *res))
    out_x, out_y = output_res(res)
    sensor = _sensor_width(res)
    tan_h, tan_v = render_island._tans(out_x, out_y, cam["lens"], sensor=sensor)
    cam.update(res_x=out_x, res_y=out_y, tan_h=tan_h, tan_v=tan_v, sensor=sensor)
    return cam


# ─── self-test (no bpy) ─────────────────────────────────────────────────────
def self_test():
    assert MARGIN_PX == 96, "the margin is frozen in architecture §2.6"
    assert SAMPLES == render_island.K["samples"] == 128
    assert VOLUME_BOUNCES == 1 and VOLUME_STEP_RATE == 2.0
    assert output_res(render_island.WIDE) == (4032, 2160)
    assert output_res(render_island.TALL) == (2352, 3840)
    assert abs(_sensor_width(render_island.WIDE) - 37.8) < 1e-12  # 36 * 4032/3840
    assert _sensor_width(render_island.TALL) == render_island.SENSOR_WIDTH

    worst = 0.0
    for name, bbox in render_island._CASES:
        union = render_island._union_bbox(bbox)
        for res in (render_island.WIDE, render_island.TALL):
            frame_cam = render_island.frame_camera(union, *res)
            cloud_cam = cloud_camera(union, res)
            assert (cloud_cam["res_x"], cloud_cam["res_y"]) == output_res(res)
            for key in ("location", "target", "lens", "distance"):
                assert cloud_cam[key] == frame_cam[key], f"{name}: {key} moved"
            for p in render_island._corners(union) + [render_island._center(union)]:
                xf, yf, df = render_island.project(frame_cam, p)
                xc, yc, dc = render_island.project(cloud_cam, p)
                assert dc == df, f"{name}: depth changed"
                assert abs(yc - yf) < 1e-12, f"{name}: vertical crop shifted"
                assert abs(xc - xf * res[0] / cloud_cam["res_x"]) < 1e-12, \
                    f"{name}: horizontal scale is not the margin"
                pxf = (xf + 1.0) / 2.0 * res[0]
                pxc = (xc + 1.0) / 2.0 * cloud_cam["res_x"]
                assert 0.0 <= pxf <= res[0], f"{name}: island frame x outside itself"
                worst = max(worst, abs(pxc - (pxf + MARGIN_PX)))
                assert worst < 1e-9, f"{name}: crop identity drifted ({worst}px)"
        wide_out, tall_out = output_res(render_island.WIDE), output_res(render_island.TALL)
        print(f"  {name:10s} {wide_out[0]}x{wide_out[1]} and {tall_out[0]}x{tall_out[1]}"
              f"  centre = island frame + {MARGIN_PX}px/axis")

    assert _argv(["blender", "-b", "-P", "cloud_pass.py", "--", "a", "b", "c"]) == ["a", "b", "c"]
    assert _argv(["cloud_pass.py", "--self-test"]) == ["--self-test"]
    for bad in ([], ["a"], ["a", "b"], ["a", "b", "c", "d"]):
        try:
            main(["cloud_pass.py"] + bad)
        except SystemExit as exc:
            assert "usage" in str(exc), f"usage missing for {bad}"
        else:
            raise AssertionError(f"main accepted {bad}")
    print(f"res: wide {output_res(render_island.WIDE)} tall {output_res(render_island.TALL)}; "
          f"sensors {_sensor_width(render_island.WIDE):.1f}/"
          f"{_sensor_width(render_island.TALL):.1f}mm; samples {SAMPLES}")
    print(f"cli: --self-test and the 3-arg Blender form dispatch; other counts exit")
    print(f"self-test ok: {len(render_island._CASES)} synthetic bboxes x 2 framings, "
          f"crop identity exact to {worst:.1e}px")


# ─── Blender scene: bounded volume under the shared sky ─────────────────────
def _cycles_volume(sc):
    """1 volume bounce, biased Distance sampling, a moderate step rate (§2.6)."""
    sc.cycles.volume_bounces = VOLUME_BOUNCES
    sc.cycles.volume_sampling = "DISTANCE"
    sc.cycles.seed = 0  # explicit: same scene renders the same layer
    for name in ("volume_step_rate", "volume_step_size"):  # renamed across versions
        if hasattr(sc.cycles, name):
            setattr(sc.cycles, name, VOLUME_STEP_RATE)
            return
    print("cloud: no volume step-rate property; Cycles defaults apply", file=sys.stderr)


def _cloud_material(span, zlo, zhi):
    """Grey-white sea: noise puffs, denser low, fading to clear at the box top.

    Object coordinates: the box mesh is built in world space at the origin, so
    the noise and the height falloff are isotropic and in metres, not box units.
    """
    import bpy
    mat = bpy.data.materials.new("CloudVolume")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    coords = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = 1.0 / (CLOUD_FEATURE * span)
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.6
    nt.links.new(coords.outputs["Object"], noise.inputs["Vector"])

    mask = nt.nodes.new("ShaderNodeMapRange")
    mask.inputs["From Min"].default_value = NOISE_WINDOW[0]
    mask.inputs["From Max"].default_value = NOISE_WINDOW[1]
    nt.links.new(noise.outputs["Fac"], mask.inputs["Value"])

    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coords.outputs["Object"], sep.inputs["Vector"])
    fall = nt.nodes.new("ShaderNodeMapRange")
    fall.inputs["From Min"].default_value = zlo
    fall.inputs["From Max"].default_value = zhi
    fall.inputs["To Min"].default_value = 1.0
    fall.inputs["To Max"].default_value = 0.0
    nt.links.new(sep.outputs["Z"], fall.inputs["Value"])

    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    nt.links.new(mask.outputs["Result"], mul.inputs[0])
    nt.links.new(fall.outputs["Result"], mul.inputs[1])
    dens = nt.nodes.new("ShaderNodeMath")
    dens.operation = "MULTIPLY"
    dens.inputs[1].default_value = CLOUD_OPACITY / span
    nt.links.new(mul.outputs["Value"], dens.inputs[0])

    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (0.92, 0.94, 0.97, 1.0)
    nt.links.new(dens.outputs["Value"], vol.inputs["Density"])

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(tr.outputs["BSDF"], out.inputs["Surface"])  # closed box: the volume is the look
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return mat


def _build_volume(bbox, specs):
    """A bounded box around the island.  Its top stays below the lowest camera
    and its x/y faces outside every camera, so a ray that never descends into
    the sea meets no volume at all (clear sky); the geometric top edge fades
    smoothly because the path length through the medium goes to zero there."""
    import bpy
    (x0, y0, z0), (x1, y1, z1) = bbox
    span = max(x1 - x0, y1 - y0, z1 - z0)
    d_min = min(spec["distance"] for spec in specs.values())
    cam_z = min(spec["location"][2] for spec in specs.values())
    half_xy = BOX_MARGIN * d_min
    zlo = z0 - BOX_BOTTOM * span
    zhi = z0 + BOX_TOP * (cam_z - z0)
    assert half_xy < d_min and zhi < cam_z, "the volume box must not swallow a camera"

    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    verts = [(x, y, z) for x in (cx - half_xy, cx + half_xy)
             for y in (cy - half_xy, cy + half_xy) for z in (zlo, zhi)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh = bpy.data.meshes.new("CloudBox")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    ob = bpy.data.objects.new("CloudBox", mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(_cloud_material(span, zlo, zhi))
    print(f"cloud: volume box x/y ±{half_xy:.1f}m z [{zlo:.1f}, {zhi:.1f}] "
          f"(island span {span:.1f}m; features {CLOUD_FEATURE * span:.1f}m, "
          f"density {CLOUD_OPACITY / span:.4f}/m)", flush=True)
    return ob


def render(island_dir, wide_path, tall_path):
    """Render one cloud layer per framing: RGBA, island framing + margin."""
    import bpy
    from mathutils import Vector

    obj_path = os.path.join(island_dir, "island.obj")
    if not os.path.isfile(obj_path):
        raise SystemExit(f"cloud: no island.obj under {island_dir!r} (C1 island dir)")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=obj_path, forward_axis="Y", up_axis="Z")
    meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
    if not meshes:
        raise SystemExit("cloud: island.obj imported no mesh objects")

    bbox = render_island._union_bbox(render_island._scene_bbox())
    for ob in meshes:
        ob.hide_render = True  # grade draws the island over this layer (ADR-2)
    print(f"cloud: island bbox {bbox}", flush=True)

    sc = bpy.context.scene
    render_island._sky(sc)
    render_island._cycles(sc)
    _cycles_volume(sc)

    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.sensor_fit = "AUTO"
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.resolution_percentage = 100

    specs = {res: cloud_camera(bbox, res)
             for res in (render_island.WIDE, render_island.TALL)}
    _build_volume(bbox, specs)

    for res, path in ((render_island.WIDE, wide_path), (render_island.TALL, tall_path)):
        spec = specs[res]
        cam.data.lens = spec["lens"]
        cam.data.sensor_width = spec["sensor"]
        cam.location = spec["location"]
        cam.rotation_euler = (Vector(spec["target"]) - Vector(spec["location"])
                              ).to_track_quat("-Z", "Y").to_euler()
        cam.data.clip_start = max(0.01, spec["distance"] / 1000.0)
        cam.data.clip_end = spec["distance"] + 2.0 * math.dist(bbox[0], bbox[1])
        sc.render.resolution_x, sc.render.resolution_y = spec["res_x"], spec["res_y"]
        sc.render.filepath = os.path.abspath(path)
        t0 = time.monotonic()
        bpy.ops.render.render(write_still=True)
        print(f"cloud: {res[0]}x{res[1]} frame -> {spec['res_x']}x{spec['res_y']} in "
              f"{time.monotonic() - t0:.1f}s -> {path}", flush=True)


def _argv(argv):
    return argv[argv.index("--") + 1:] if "--" in argv else argv[1:]


USAGE = ("usage: blender -b --factory-startup -P nodes/render-background/cloud_pass.py -- "
         "ISLAND_DIR CLOUDS_WIDE CLOUDS_TALL   (or: python3 cloud_pass.py --self-test)")


def main(argv):
    args = _argv(argv)
    if args == ["--self-test"]:
        self_test()
        return
    if len(args) != 3:
        raise SystemExit(USAGE)
    render(*args)


if __name__ == "__main__":
    main(sys.argv)
