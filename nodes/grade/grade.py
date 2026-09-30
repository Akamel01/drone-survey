"""Showcase grade Node: the hero's dreamy grade, ported verbatim.

`scripts/hero/grade.py:5-22` (haze, glow, lift) is copied expression-for-expression;
only the hero's sheet-building tail is dropped and file plumbing added. Pillow
only — no Blender, no GPU, no network. The Node takes image paths only: it cannot
name a Reconstruction or an island dir, grading never alters the Reconstruction.

M4: the look comes from `grade-params.json` (checked in, canonical); frames mode
composites a per-frame sky (sky plate resized to the frame, then the cloud layer
pasted at the loop-periodic drift offset) and writes `grade-report.json`.
`grade()` and `_hero_grade()` are untouched: params are applied by setting the
module globals HAZE/GLOW/LIFT, so the AST parity extraction sees the same values.
"""
import argparse
import ast
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import emit_report, sha256_file  # noqa: E402

from PIL import Image, ImageChops, ImageFilter

HAZE, GLOW, LIFT = 0.09, 0.2, 0.04  # defaults, only used when no params file is given
REPO_ROOT = Path(__file__).resolve().parents[2]
PARAM_KEYS = {"haze", "glow", "lift", "clouds"}
CLOUD_KEYS = {"enabled", "period_frames", "amplitude_px", "direction"}
sky_path = None


def grade(isl):
    sky = Image.open(sky_path).convert("RGB").resize(isl.size, Image.LANCZOS)
    # Aerial perspective: the island takes on the sky behind it, more towards its base.
    haze_col = sky.filter(ImageFilter.GaussianBlur(40))
    grad = Image.linear_gradient("L").resize(isl.size)                   # 0 top, 255 bottom
    amount = grad.point(lambda v: int(255 * (HAZE * 0.6 + HAZE * 0.9 * v / 255)))
    rgb = isl.convert("RGB")
    hazed = Image.composite(haze_col, rgb, amount)
    out = sky.copy()
    out.paste(hazed, (0, 0), isl.getchannel("A"))
    # Soft glow from the bright parts, like the diffusion of a cinema lens.
    bright = out.point(lambda v: max(0, v - 150) * 2).filter(ImageFilter.GaussianBlur(18))
    out = ImageChops.add(out, bright.point(lambda v: int(v * GLOW)))
    # Lifted, blue-grey shadows.
    tone = Image.new("RGB", out.size, (74, 98, 116))
    return Image.blend(out, tone, LIFT)


def run(in_wide, in_tall, sky, out_wide, out_tall):
    global sky_path
    sky_path = sky
    for src, dst in ((in_wide, out_wide), (in_tall, out_tall)):
        grade(Image.open(src).convert("RGBA")).save(dst)


N_FRAMES = 243  # files per framing dir; mirrors nodes/render/render_island.py (M2)


def _exact_keys(obj, keys, where):
    unknown = sorted(set(obj) - keys)
    if unknown:
        raise ValueError(f"{where}: unknown key(s): {', '.join(unknown)}")
    missing = sorted(keys - set(obj))
    if missing:
        raise ValueError(f"{where}: missing key(s): {', '.join(missing)}")


def load_params(path, n=N_FRAMES):
    """Read and fail-loud validate `grade-params.json`; returns (params, file sha256).

    Unknown top-level/clouds keys, wrong types, a period that does not divide
    the n-frame loop, or a direction other than right/left are all errors, so a
    bad params file can never silently change the look.
    """
    raw = Path(path).read_bytes()
    try:
        params = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"params {path}: not valid JSON: {e}") from e
    if not isinstance(params, dict):
        raise ValueError(f"params {path}: top level must be an object")
    _exact_keys(params, PARAM_KEYS, f"params {path}")
    for key in ("haze", "glow", "lift"):
        if isinstance(params[key], bool) or not isinstance(params[key], (int, float)):
            raise ValueError(f"params {path}: {key} must be a number")
    clouds = params["clouds"]
    if not isinstance(clouds, dict):
        raise ValueError(f"params {path}: clouds must be an object")
    _exact_keys(clouds, CLOUD_KEYS, f"params {path}: clouds")
    if not isinstance(clouds["enabled"], bool):
        raise ValueError(f"params {path}: clouds.enabled must be true or false")
    period = clouds["period_frames"]
    if not isinstance(period, int) or isinstance(period, bool) or period <= 0:
        raise ValueError(f"params {path}: clouds.period_frames must be a positive integer")
    amp = clouds["amplitude_px"]
    if not isinstance(amp, int) or isinstance(amp, bool) or amp < 0:
        raise ValueError(f"params {path}: clouds.amplitude_px must be a non-negative integer")
    if (n - 1) % period:
        raise ValueError(
            f"params {path}: clouds.period_frames {period} does not divide the "
            f"{n}-frame loop (n-1 = {n - 1} must be a multiple)")
    if clouds["direction"] not in ("right", "left"):
        raise ValueError(f"params {path}: clouds.direction must be 'right' or 'left', "
                         f"got {clouds['direction']!r}")
    return params, hashlib.sha256(raw).hexdigest()


def _default_params():
    return {"haze": HAZE, "glow": GLOW, "lift": LIFT,
            "clouds": {"enabled": False, "period_frames": N_FRAMES - 1,
                       "amplitude_px": 0, "direction": "right"}}


def apply_params(params):
    """Set the module globals grade() reads, so the hero-parity extraction sees them too."""
    global HAZE, GLOW, LIFT
    HAZE, GLOW, LIFT = params["haze"], params["glow"], params["lift"]


def offset(i, period_frames, amplitude_px, direction):
    """Drift of the cloud layer at frame i, in px; 'left' is the negated sine."""
    px = round(amplitude_px * math.sin(2 * math.pi * i / period_frames))
    return -px if direction == "left" else px


def _build_frame_sky(plate, layer, size, offset_px):
    """Compose the frame-size sky: `plate` is already resized to `size`; the layer is not.

    x0 is the centred paste position minus the drift; the layer margin must
    cover 2*amplitude_px or the pan would expose an edge (checked by caller).
    """
    x0 = (layer.width - size[0]) // 2 - offset_px
    sky = plate.copy()
    sky.paste(layer, (-x0, 0), layer)  # layer is RGBA; it is its own mask
    return sky


def grade_frames(frames_dir, sky, out_dir, n=N_FRAMES, params=None, clouds_path=None):
    """Grade a frame dir: frame_{i:03d}.png in, same names out (M3, D2).

    One shared grade() does every frame, so the turn look cannot fork from
    the stills look (#192 wiring stays valid). Grading is deterministic, so
    M2's first==last input copy grades to first==last output with no
    special-casing. Missing input raises; output count always equals n.

    M4: with clouds enabled the sky for frame i is the plate resized to the
    frame size, then the cloud layer pasted at offset(i) — one reused temp PPM
    per framing is passed as sky_path into the unchanged grade(). offset(n-1)
    == offset(0) when period_frames divides n-1, so first==last survives.
    """
    global sky_path
    p = params if params is not None else _default_params()
    apply_params(p)
    clouds = p["clouds"]
    if not clouds["enabled"]:
        if clouds_path is not None:
            raise ValueError("clouds.enabled is false but a cloud layer was given")
        sky_path = sky
        return _grade_dir(frames_dir, out_dir, n)
    if clouds_path is None:
        raise ValueError("clouds.enabled is true but no cloud layer was given")
    with Image.open(sky) as im:
        plate = im.convert("RGB")
    with Image.open(clouds_path) as im:
        layer = im.convert("RGBA")
    with Image.open(os.path.join(frames_dir, "frame_000.png")) as im:
        size = im.size
    extra = layer.width - size[0]
    if extra < 2 * clouds["amplitude_px"]:
        raise ValueError(
            f"cloud layer {clouds_path} is {extra}px wider than the frame but "
            f"amplitude_px is {clouds['amplitude_px']}: re-render clouds with a wider margin")
    plate = plate.resize(size, Image.LANCZOS)
    os.makedirs(out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="grade-sky-") as td:
        tmp = os.path.join(td, "sky.ppm")
        for i in range(n):
            _build_frame_sky(
                plate, layer, size,
                offset(i, clouds["period_frames"], clouds["amplitude_px"],
                       clouds["direction"])).save(tmp)
            sky_path = tmp
            name = f"frame_{i:03d}.png"
            grade(Image.open(os.path.join(frames_dir, name)).convert("RGBA")).save(
                os.path.join(out_dir, name))
    return n


def _grade_dir(frames_dir, out_dir, n):
    """Plain plate-only loop (sky_path set by the caller); the pre-M4 behavior."""
    os.makedirs(out_dir, exist_ok=True)
    for i in range(n):
        name = f"frame_{i:03d}.png"
        grade(Image.open(os.path.join(frames_dir, name)).convert("RGBA")).save(
            os.path.join(out_dir, name))
    return n


def _git_commit():
    """HEAD of the repo, or None when the source is a git archive with no .git."""
    try:
        out = subprocess.run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
                             capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def build_report(params, params_sha256, sky, clouds, n, counts, out_dirs, wall_clock_s):
    """grade-report.json payload (architecture §2.3), written via common.emit_report."""
    c = params["clouds"]
    return {
        "tool": "nodes/grade/grade.py",
        "params": params,
        "params_sha256": params_sha256,
        "sky": {"path": str(sky), "sha256": sha256_file(sky)},
        "clouds": None if not c["enabled"] else {
            "wide": {"path": str(clouds["wide"]), "sha256": sha256_file(clouds["wide"])},
            "tall": {"path": str(clouds["tall"]), "sha256": sha256_file(clouds["tall"])}},
        "drift": {"period_frames": c["period_frames"], "amplitude_px": c["amplitude_px"],
                  "direction": c["direction"],
                  "offset_first_px": offset(0, c["period_frames"], c["amplitude_px"],
                                            c["direction"]),
                  "offset_last_px": offset(n - 1, c["period_frames"], c["amplitude_px"],
                                           c["direction"])},
        "frames": {f: {"in": n, "out": counts[f]} for f in ("wide", "tall")},
        "out_dirs": {f: str(d) for f, d in out_dirs.items()},
        "frame_names": "frame_%03d.png",
        "git_commit": _git_commit(),
        "wall_clock_s": wall_clock_s,
    }


def _synth_rgba(w, h, seed):
    img = Image.new("RGBA", (w, h))
    px = img.load()
    r = min(w, h) // 2 - 4
    for y in range(h):
        for x in range(w):
            dx, dy = x - w // 2, y - h // 2
            a = min(255, (3 * x + 2 * y + seed) % 300) if dx * dx + dy * dy < r * r else 0
            px[x, y] = ((7 * x + seed) % 256, (5 * y + 3 * seed) % 256, (x * y + seed) % 256, a)
    return img


def _synth_sky(w, h):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (60 + 120 * y // h, 90 + 100 * y // h, 140 + 80 * y // h)
    return img


def _hero_grade():
    """The hero's `grade()` extracted live from scripts/hero/grade.py; its sheet tail never runs."""
    src = (Path(__file__).resolve().parents[2] / "scripts/hero/grade.py").read_text()
    fn = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == "grade")
    ns = {"Image": Image, "ImageChops": ImageChops, "ImageFilter": ImageFilter,
          "HAZE": HAZE, "GLOW": GLOW, "LIFT": LIFT, "sky_path": sky_path}
    exec(compile(ast.get_source_segment(src, fn), "scripts/hero/grade.py", "exec"), ns)
    return ns["grade"]


def selftest():
    global sky_path
    hero_src = Path(__file__).resolve().parents[2] / "scripts/hero/grade.py"
    assert hero_src.is_file(), f"hero original missing: {hero_src}"
    with tempfile.TemporaryDirectory(prefix="grade-selftest-") as td:
        td = Path(td)
        sky = td / "sky.png"
        _synth_sky(480, 270).save(sky)
        sky_path = str(sky)
        cases = {"wide": (400, 300, 1), "tall": (300, 400, 2)}
        for name, (w, h, seed) in cases.items():
            _synth_rgba(w, h, seed).save(td / f"raw-{name}.png")

        direct = {n: [grade(Image.open(td / f"raw-{n}.png").convert("RGBA")) for _ in range(2)]
                  for n in cases}
        hero = _hero_grade()
        hero_out = {n: hero(Image.open(td / f"raw-{n}.png").convert("RGBA")) for n in cases}

        digests = {}
        for name, (w, h, _) in cases.items():
            a, b = direct[name]
            assert a.size == b.size == (w, h), f"{name}: size {a.size}"
            assert a.mode == b.mode == "RGB" and "A" not in a.getbands(), f"{name}: alpha survived"
            assert a.tobytes() == b.tobytes(), f"{name}: two runs differ"
            assert a.tobytes() == hero_out[name].tobytes(), f"{name}: differs from hero grade"
            digests[name] = hashlib.sha256(a.tobytes()).hexdigest()

        cli_digests = {}
        for i in (1, 2):
            out = {n: td / f"out-{n}-{i}.png" for n in cases}
            subprocess.run(
                [sys.executable, str(Path(__file__).resolve()),
                 "--in-wide", str(td / "raw-wide.png"), "--in-tall", str(td / "raw-tall.png"),
                 "--sky", str(sky),
                 "--out-wide", str(out["wide"]), "--out-tall", str(out["tall"])],
                check=True)
            cli_digests[i] = {n: hashlib.sha256(p.read_bytes()).hexdigest() for n, p in out.items()}
            for n in cases:
                with Image.open(out[n]) as im:
                    assert im.mode == "RGB", f"{n} cli run {i}: mode {im.mode}"
                    assert im.tobytes() == direct[n][0].tobytes(), \
                        f"{n} cli run {i}: pixels differ from direct grade"
        assert cli_digests[1] == cli_digests[2], "CLI output files differ across runs"

        assert N_FRAMES == 243, f"turn must hold 243 files, got {N_FRAMES}"
        n, fw, fh = 7, 64, 48  # small frames; loop logic identical at 4K
        for framing in ("wide", "tall"):
            fdir, gdir = td / f"frames-{framing}", td / f"graded-{framing}"
            fdir.mkdir()
            for i in range(n):
                Image.new("RGBA", (fw, fh),
                          ((17 * i + 3) % 256, (41 * i + 5) % 256, (7 * i + 11) % 256, 200)
                          ).save(fdir / f"frame_{i:03d}.png")
            shutil.copyfile(fdir / "frame_000.png", fdir / f"frame_{n - 1:03d}.png")
            assert grade_frames(str(fdir), str(sky), str(gdir), n) == n
            outs = sorted(p.name for p in gdir.iterdir())
            assert outs == [f"frame_{i:03d}.png" for i in range(n)], f"{framing}: {outs}"
            with Image.open(gdir / "frame_000.png") as im:
                assert im.mode == "RGB", f"{framing}: mode {im.mode}"
                ref = grade(Image.open(fdir / "frame_000.png").convert("RGBA"))
                assert im.tobytes() == ref.tobytes(), f"{framing}: frame 0 not pixel-identical"
            a = (gdir / "frame_000.png").read_bytes()
            assert (gdir / f"frame_{n - 1:03d}.png").read_bytes() == a, \
                f"{framing}: first==last not carried through"
            gdir2 = td / f"graded2-{framing}"
            grade_frames(str(fdir), str(sky), str(gdir2), n)
            assert all((gdir / o).read_bytes() == (gdir2 / o).read_bytes() for o in outs), \
                f"{framing}: rerun differs"
            print(f"  frames-{framing} {n} in/{n} out  frame 0 pixel-identical  "
                  f"first==last ok  rerun byte-identical")

        # M4: params file, validation, drift, cloud compositing, report
        real_params = Path(__file__).resolve().parent / "grade-params.json"
        params, params_sha = load_params(real_params, N_FRAMES)
        assert params_sha == hashlib.sha256(real_params.read_bytes()).hexdigest()
        assert (params["haze"], params["glow"], params["lift"]) == (0.09, 0.2, 0.04)
        assert params["clouds"] == {"enabled": True, "period_frames": 242,
                                    "amplitude_px": 48, "direction": "right"}
        assert offset(0, 242, 48, "right") == offset(242, 242, 48, "right") == 0
        assert offset(1, 242, 48, "right") == -offset(1, 242, 48, "left") != 0
        print(f"  params {real_params.name} sha256 {params_sha}  offset(0)==offset(242)==0  "
              f"left == -right")

        def expect_error(fn, needle):
            try:
                fn()
            except ValueError as e:
                assert needle in str(e), f"error {e!r} lacks {needle!r}"
            else:
                raise AssertionError(f"no error mentioning {needle!r}")

        def params_in(payload, name):
            f = td / name
            f.write_text(json.dumps(payload))
            return f

        base = {"haze": 0.09, "glow": 0.2, "lift": 0.04,
                "clouds": {"enabled": False, "period_frames": 6, "amplitude_px": 20,
                           "direction": "right"}}
        expect_error(lambda: load_params(params_in({**base, "wat": 1}, "p-top.json"), n),
                     "unknown key")
        expect_error(lambda: load_params(params_in(
            {**base, "clouds": {**base["clouds"], "zoom": 1}}, "p-cloud.json"), n),
            "unknown key")
        expect_error(lambda: load_params(params_in(
            {**base, "clouds": {**base["clouds"], "period_frames": 5}}, "p-period.json"), n),
            "does not divide")
        expect_error(lambda: load_params(params_in(
            {**base, "clouds": {**base["clouds"], "direction": "up"}}, "p-dir.json"), n),
            "direction")
        expect_error(lambda: load_params(params_in({**base, "haze": "lots"}, "p-type.json"), n),
                     "haze must be a number")
        print("  params validation: unknown keys, period, direction, type all fail loud")

        # clouds on: per-frame sky, drift periodicity, first==last, determinism
        layer = Image.new("RGBA", (fw + 192, fh))
        lp = layer.load()
        for x in range(fw + 192):
            for y in range(fh):
                lp[x, y] = ((13 * x + y) % 256, (7 * x + 3 * y) % 256, (5 * x) % 256,
                            255 if (x + y) % 5 else 80)
        layer_path = td / "cloud-layer.png"
        layer.save(layer_path)
        clouds_on = {**base, "clouds": {"enabled": True, "period_frames": 6,
                                        "amplitude_px": 20, "direction": "right"}}
        for framing in ("wide", "tall"):
            fdir, cdir = td / f"frames-{framing}", td / f"clouded-{framing}"
            assert grade_frames(str(fdir), str(sky), str(cdir), n,
                                clouds_on, str(layer_path)) == n
            c0 = (cdir / "frame_000.png").read_bytes()
            assert (cdir / f"frame_{n - 1:03d}.png").read_bytes() == c0, \
                f"{framing}: clouds broke first==last"
            assert c0 != (td / f"graded-{framing}" / "frame_000.png").read_bytes(), \
                f"{framing}: clouds did not change the look"
            cdir2 = td / f"clouded2-{framing}"
            grade_frames(str(fdir), str(sky), str(cdir2), n, clouds_on, str(layer_path))
            assert all((cdir / o).read_bytes() == (cdir2 / o).read_bytes()
                       for o in sorted(p.name for p in cdir.iterdir())), \
                f"{framing}: cloud rerun differs"
            print(f"  clouds-{framing} {n} in/{n} out  first==last ok  rerun byte-identical  "
                  f"offset(1)={offset(1, 6, 20, 'right')}px")
        narrow_path = td / "narrow-layer.png"
        Image.new("RGBA", (fw + 10, fh), (0, 0, 0, 255)).save(narrow_path)
        expect_error(lambda: grade_frames(str(td / "frames-wide"), str(sky), str(td / "x"),
                                          n, clouds_on, str(narrow_path)), "wider margin")
        expect_error(lambda: grade_frames(str(td / "frames-wide"), str(sky), str(td / "x"),
                                          n, clouds_on, None), "no cloud layer")
        expect_error(lambda: grade_frames(str(td / "frames-wide"), str(sky), str(td / "x"),
                                          n, base, str(layer_path)), "clouds.enabled is false")

        # F2: 16:9 plate + tall frame + (W+192)xH layer: the marker must land by the
        # offset math after the plate is resized to the frame, not by a whole-sky resize.
        tw, th = 60, 120
        f2_layer = Image.new("RGBA", (tw + 192, th))
        f2_layer.putpixel((120, 10), (255, 0, 0, 255))
        f2_off = offset(1, 6, 30, "right")
        assert f2_off == round(30 * math.sin(2 * math.pi / 6)) == 26
        f2 = _build_frame_sky(Image.new("RGB", (160, 90)).resize((tw, th), Image.LANCZOS),
                              f2_layer, (tw, th), f2_off)
        mx = 120 - ((tw + 192 - tw) // 2 - f2_off)
        assert f2.getpixel((mx, 10)) == (255, 0, 0), f"marker at {mx}"
        assert f2.getpixel((round(120 * tw / (tw + 192)), 10)) != (255, 0, 0), \
            "marker landed where a whole-sky resize would put it"
        print(f"  F2 placement 16:9 plate -> {tw}x{th} frame, (W+192)xH layer: marker "
              f"layer x120 -> frame x{mx} (offset {f2_off}px)")

        payload = build_report(params, params_sha, sky,
                               {"wide": layer_path, "tall": layer_path}, N_FRAMES,
                               {"wide": n, "tall": n},
                               {"wide": td / "g-wide", "tall": td / "g-tall"}, 1.25)
        rep = td / "grade-report.json"
        emit_report(rep, payload)
        loaded = json.loads(rep.read_text())
        assert loaded["tool"] == "nodes/grade/grade.py"
        assert loaded["params"] == params
        assert loaded["params_sha256"] == hashlib.sha256(real_params.read_bytes()).hexdigest()
        assert loaded["sky"]["sha256"] == hashlib.sha256(sky.read_bytes()).hexdigest()
        assert loaded["clouds"]["wide"]["sha256"] == \
            hashlib.sha256(layer_path.read_bytes()).hexdigest()
        assert loaded["drift"] == {"period_frames": 242, "amplitude_px": 48,
                                   "direction": "right", "offset_first_px": 0,
                                   "offset_last_px": 0}
        assert loaded["frames"] == {"wide": {"in": 243, "out": n},
                                    "tall": {"in": 243, "out": n}}
        assert loaded["out_dirs"] == {"wide": str(td / "g-wide"), "tall": str(td / "g-tall")}
        assert loaded["frame_names"] == "frame_%03d.png"
        assert loaded["wall_clock_s"] == 1.25
        assert loaded["git_commit"] is None or len(loaded["git_commit"]) == 40
        assert build_report(base, params_sha, sky, {"wide": None, "tall": None}, N_FRAMES,
                            {"wide": n, "tall": n},
                            {"wide": td / "g-wide", "tall": td / "g-tall"}, 0.0)["clouds"] is None
        print(f"  report schema ok  params_sha256 {loaded['params_sha256']}  "
              f"git_commit {loaded['git_commit']}")

        # frames-mode CLI end-to-end: params/clouds required, per-frame sky, report
        cli_frames = {}
        for framing in ("wide", "tall"):
            fdir = td / f"cli-frames-{framing}"
            fdir.mkdir()
            for i in range(N_FRAMES):
                Image.new("RGBA", (fw, fh),
                          ((i * 7 + 3) % 256, (i * 5 + 11) % 256, (i * 3 + 29) % 256, 180)
                          ).save(fdir / f"frame_{i:03d}.png")
            shutil.copyfile(fdir / "frame_000.png", fdir / f"frame_{N_FRAMES - 1:03d}.png")
            cli_frames[framing] = fdir
        cli_params = params_in({**base, "clouds": {"enabled": True, "period_frames": 242,
                                                   "amplitude_px": 20, "direction": "right"}},
                               "cli-params.json")
        cli_argv = [sys.executable, str(Path(__file__).resolve()),
                    "--frames-wide", str(cli_frames["wide"]),
                    "--frames-tall", str(cli_frames["tall"]), "--sky", str(sky)]
        bad = subprocess.run(cli_argv + ["--graded-wide", str(td / "x"),
                                         "--graded-tall", str(td / "y")],
                             capture_output=True, text=True)
        assert bad.returncode != 0 and "--params" in bad.stderr, bad.stderr
        bad = subprocess.run(cli_argv + ["--params", str(cli_params),
                                         "--graded-wide", str(td / "x"),
                                         "--graded-tall", str(td / "y"),
                                         "--out-report", str(td / "cli-bad.json")],
                             capture_output=True, text=True)
        assert bad.returncode != 0 and "clouds-wide" in bad.stderr, bad.stderr
        cw, ct, cli_report = td / "cli-graded-wide", td / "cli-graded-tall", td / "cli-report.json"
        subprocess.run(cli_argv + ["--clouds-wide", str(layer_path),
                                   "--clouds-tall", str(layer_path),
                                   "--params", str(cli_params),
                                   "--graded-wide", str(cw), "--graded-tall", str(ct),
                                   "--out-report", str(cli_report)], check=True)
        r = json.loads(cli_report.read_text())
        assert r["params_sha256"] == hashlib.sha256(cli_params.read_bytes()).hexdigest()
        assert r["clouds"]["wide"]["sha256"] == hashlib.sha256(layer_path.read_bytes()).hexdigest()
        assert r["frames"] == {"wide": {"in": 243, "out": 243},
                               "tall": {"in": 243, "out": 243}}
        assert r["drift"]["offset_first_px"] == r["drift"]["offset_last_px"] == 0
        for d in (cw, ct):
            names = sorted(p.name for p in d.iterdir())
            assert names == [f"frame_{i:03d}.png" for i in range(N_FRAMES)], names[:3]
        assert (cw / "frame_000.png").read_bytes() == \
            (cw / f"frame_{N_FRAMES - 1:03d}.png").read_bytes(), "CLI clouds broke first==last"
        print(f"  frames CLI 243x2 clouded: params required, --clouds-* required with clouds on, "
              f"report digest ok  frames 243/243  first==last ok")

        for name, (w, h, _) in cases.items():
            print(f"  {name:4} {w}x{h}  pixels sha256 {digests[name]}  "
                  f"hero-identical  cli png sha256 {cli_digests[1][name]}")
        print("self-test ok: sizes match, RGB opaque (alpha consumed), 2 runs byte-identical, "
              "pixel-identical to scripts/hero/grade.py, frozen CLI exercised twice; "
              "params validated, per-frame clouds drift-safe, report digest ok")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Grade rendered island stills over the sky plate "
                    "(verbatim Pillow port of scripts/hero/grade.py).")
    p.add_argument("--in-wide")
    p.add_argument("--in-tall")
    p.add_argument("--sky", help="opaque RGB sky plate (C5)")
    p.add_argument("--out-wide")
    p.add_argument("--out-tall")
    p.add_argument("--frames-wide", help="M2 frames-wide/ dir in")
    p.add_argument("--frames-tall", help="M2 frames-tall/ dir in")
    p.add_argument("--clouds-wide", help="cloud layer for the wide framing (RGBA, (W+192)xH)")
    p.add_argument("--clouds-tall", help="cloud layer for the tall framing (RGBA, (W+192)xH)")
    p.add_argument("--params", help="grade-params.json: the canonical look (frames mode)")
    p.add_argument("--graded-wide", help="graded-wide/ dir out")
    p.add_argument("--graded-tall", help="graded-tall/ dir out")
    p.add_argument("--out-report", help="grade-report.json out (frames mode)")
    p.add_argument("--self-test", action="store_true",
                    help="synthetic RGBA pair: sizes, alpha, determinism, hero parity")
    a = p.parse_args(argv)
    if a.self_test:
        return selftest()
    if a.frames_wide is not None or a.frames_tall is not None:
        missing = [f"--{n}" for n in ("frames-wide", "frames-tall", "graded-wide",
                                      "graded-tall", "sky", "params", "out-report")
                   if getattr(a, n.replace("-", "_")) is None]
        if missing:
            p.error("missing required arguments: " + ", ".join(missing))
        try:
            params, params_sha = load_params(a.params, N_FRAMES)
        except ValueError as e:
            p.error(str(e))
        clouds = {"wide": a.clouds_wide, "tall": a.clouds_tall}
        if params["clouds"]["enabled"]:
            missing = [f"--clouds-{k}" for k, v in clouds.items() if v is None]
            if missing:
                p.error("clouds.enabled is true; missing required arguments: "
                        + ", ".join(missing))
        else:
            given = [f"--clouds-{k}" for k, v in clouds.items() if v is not None]
            if given:
                p.error("clouds.enabled is false; drop " + ", ".join(given)
                        + " (the look must not change silently)")
        t0 = time.monotonic()
        counts = {}
        try:
            for framing in ("wide", "tall"):
                counts[framing] = grade_frames(
                    getattr(a, f"frames_{framing}"), a.sky, getattr(a, f"graded_{framing}"),
                    N_FRAMES, params, clouds[framing])
        except ValueError as e:  # e.g. a cloud layer too narrow for the amplitude
            p.error(str(e))
        emit_report(a.out_report, build_report(
            params, params_sha, a.sky, clouds, N_FRAMES, counts,
            {"wide": a.graded_wide, "tall": a.graded_tall}, time.monotonic() - t0))
        return 0
    missing = [f"--{n}" for n in ("in-wide", "in-tall", "sky", "out-wide", "out-tall")
                if getattr(a, n.replace("-", "_")) is None]
    if missing:
        p.error("missing required arguments: " + ", ".join(missing))
    run(a.in_wide, a.in_tall, a.sky, a.out_wide, a.out_tall)
    return 0


if __name__ == "__main__":
    sys.exit(main())
