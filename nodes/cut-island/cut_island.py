#!/usr/bin/env python3
"""cut-island -- trim a Reconstruction to the Site boundary and cut an island.

    python3 nodes/cut-island/cut_island.py \\
        --reconstruction DIR --boundary FILE --out-island DIR --out-report FILE
    python3 nodes/cut-island/cut_island.py --self-test        # no bpy needed

C1: `--out-island DIR` gets island.obj + island.mtl + textures/, MTL-relative
paths.  The captured top is never rewritten: every source `v`/`vt`/`vn` line is
emitted in place, unchanged, so top-vertex positions and UVs are bit-identical
to the Reconstruction mesh by construction, and only faces whose XY centroid
falls outside the C6 polygon are dropped.  The kept faces are then clipped to
the polygon (Sutherland-Hodgman): a face that crosses the boundary contributes
one convex n-gon whose new vertices sit on the polygon edge, so no rim vertex
of the stitched island lies outside the cut.  The Reconstruction is opened
read-only.

C2: `--out-report FILE` gets {reconstruction, boundary_sha256, input_hashes,
kept_faces, dropped_faces} via common.emit_report.

C6: boundary is {"polygon": [[x, y], ...]} -- a closed ring in the mesh's own
ODM-local frame (clean-splat's contract, nodes/clean-splat/clean_splat.py).

Below the cut, the hero's own side/strata rings and rocky underside
(scripts/hero/hero.py:84-112) are generated around the real boundary edge loop,
scaled to the loop's size: hero's R = 3 m becomes the loop's mean radius, so
strata thickness, underside depth and noise frequencies keep the hero's
proportions.  The synthetic dome and outline (hero.py:60-83) are gone -- the
real top replaces them.  Generated faces use hero-named materials built from
the hero's texture sets (`strata` <- cliff_side, `basalt` <- lichen_rock,
hero.py:293-343), copied into textures/.

No bpy anywhere: OBJ text surgery is what makes the top bit-identical, and it
lets the Node run under plain python3 in the Blender image.  The hero's
mathutils.noise fractal is ported to a seeded Perlin fbm -- same shape, not
the same bits.
"""

from __future__ import annotations

import argparse
import ast
import json
import math
import random
import shutil
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import die, emit_report, sha256_file  # noqa: E402

OBJ_NAME = "odm_textured_model_geo.obj"

# --- hero art constants (scripts/hero/hero.py:16-47, verbatim) ---------------
HERO_R = 3.0
LAYERS = [
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
    BOUNDS.append((_z, _z + _t))
    _z += _t
STRATA = _z          # 1.09 hero metres (hero.py:47)
UNDER = 2.7
LUMPS = 0.34
SEED = 11            # hero.py K["seed"], hero.py:31 (under-boulder placement RNG)
UNDER_BOULDERS = 20  # hero.py K["under_boulders"], the bulbous underside (hero.py:479-490)
SIDE_RINGS = 72
UNDER_RINGS = 30
TEX_M = 4.0          # real-world metres one generated-geometry texture tile spans
CLIP_EPS = 1e-9      # rim-clip slack: float noise on a vertex that sits on the boundary

HERO_TEX = {         # material -> (asset dir, file) in the hero's tex() layout
    "strata": ("cliff_side", "cliff_side_Diffuse_2k.jpg"),
    "basalt": ("lichen_rock", "lichen_rock_Diffuse_2k.jpg"),
}
ASSET_ROOTS = (Path("/opt/showcase/assets"), Path.home() / "hero3d" / "assets")


# --- pure polygon math (C6; clean_splat.py:156-157's contract) ---------------

def point_in_polygon(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    """Standard ray-casting test; polygon is a list of (x, y) in the mesh's own local frame."""
    inside = False
    x1, y1 = polygon[-1]
    for x2, y2 in polygon:
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1):
            inside = not inside
        x1, y1 = x2, y2
    return inside


def load_boundary(path: Path) -> list[tuple[float, float]]:
    data = json.loads(Path(path).read_text())
    polygon = [(float(x), float(y)) for x, y in data["polygon"]]
    if len(polygon) >= 2 and polygon[0] == polygon[-1]:
        polygon = polygon[:-1]        # C6 rings may repeat their first point
    if len(polygon) < 3:
        die(f"cut-island: boundary {path} needs >= 3 distinct points, got {len(polygon)}")
    if not polygon_is_convex(polygon):
        die(f"cut-island: boundary {path} is not convex; the rim clip is one "
            f"Sutherland-Hodgman pass, which needs a convex ring -- upgrade to ear clipping "
            f"or Greiner-Hormann for a concave Site")
    return polygon


def polygon_orientation(polygon: list[tuple[float, float]]) -> int:
    """+1 for a counter-clockwise ring, -1 for clockwise (shoelace sign)."""
    area = 0.0
    for i in range(len(polygon)):
        x1, y1 = polygon[i - 1]
        x2, y2 = polygon[i]
        area += x1 * y2 - x2 * y1
    return 1 if area >= 0.0 else -1


def polygon_is_convex(polygon: list[tuple[float, float]]) -> bool:
    """True when every turn has the same sign (collinear points allowed).

    ADR-5's ceiling: clipping is one Sutherland-Hodgman pass, so a concave
    boundary has to be rejected here rather than clipped wrongly.  Upgrade
    path: ear clipping for a simple ring, Greiner-Hormann for general ones.
    """
    sign = 0
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i - 1]
        x2, y2 = polygon[i]
        x3, y3 = polygon[(i + 1) % n]
        cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2)
        if cross == 0.0:
            continue
        turn = 1 if cross > 0 else -1
        if sign == 0:
            sign = turn
        elif turn != sign:
            return False
    return sign != 0


def inside_convex(x: float, y: float, polygon: list[tuple[float, float]],
                  orient: int | None = None) -> bool:
    """Half-plane test against every edge; the boundary itself counts as inside."""
    orient = polygon_orientation(polygon) if orient is None else orient
    return all(_inside(x, y, polygon[i - 1][0], polygon[i - 1][1],
                       polygon[i][0], polygon[i][1], orient) for i in range(len(polygon)))


def _inside(x: float, y: float, x1: float, y1: float, x2: float, y2: float,
            orient: int, eps: float = CLIP_EPS) -> bool:
    return orient * ((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) >= -eps


# --- seeded Perlin fbm (the shape of mathutils.noise.fractal, no bpy) --------

def _perm(seed: int = 11) -> list[int]:
    p = list(range(256))
    state = seed
    for i in range(255, 0, -1):
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        j = state % (i + 1)
        p[i], p[j] = p[j], p[i]
    return p + p


_PERM = _perm()


def _fade(t: float) -> float:
    return t * t * t * (t * (t * 6 - 15) + 10)


def _grad(h: int, x: float, y: float, z: float) -> float:
    h &= 15
    u = x if h < 8 else y
    v = y if h < 4 else (x if h in (12, 14) else z)
    return (u if not h & 1 else -u) + (v if not h & 2 else -v)


def noise3(p: tuple[float, float, float]) -> float:
    """Classic Perlin, roughly [-1, 1]."""
    x, y, z = p
    xi, yi, zi = int(math.floor(x)) & 255, int(math.floor(y)) & 255, int(math.floor(z)) & 255
    xf, yf, zf = x - math.floor(x), y - math.floor(y), z - math.floor(z)
    u, v, w = _fade(xf), _fade(yf), _fade(zf)
    perm = _PERM
    a = perm[xi] + yi
    aa = perm[a] + zi
    ab = perm[a + 1] + zi
    b = perm[xi + 1] + yi
    ba = perm[b] + zi
    bb = perm[b + 1] + zi
    def mix(t, i, j):
        return i + t * (j - i)
    return mix(w, mix(v, mix(u, _grad(perm[aa], xf, yf, zf), _grad(perm[ba], xf - 1, yf, zf)),
                       mix(u, _grad(perm[ab], xf, yf - 1, zf), _grad(perm[bb], xf - 1, yf - 1, zf))),
               mix(v, mix(u, _grad(perm[aa + 1], xf, yf, zf - 1), _grad(perm[ba + 1], xf - 1, yf, zf - 1)),
                       mix(u, _grad(perm[ab + 1], xf, yf - 1, zf - 1), _grad(perm[bb + 1], xf - 1, yf - 1, zf - 1))))


def fbm(p: tuple[float, float, float], octaves: int = 4) -> float:
    total = 0.0
    amp = 1.0
    freq = 1.0
    norm = 0.0
    for _ in range(octaves):
        total += amp * noise3((p[0] * freq, p[1] * freq, p[2] * freq))
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def layer_at(depth: float):
    for (a, b), layer in zip(BOUNDS, LAYERS):
        if depth <= b:
            return layer, (depth - a) / (b - a)
    return LAYERS[-1], 1.0


# --- under-boulders (hero.py:479-490; ADR-4) ---------------------------------

def boulder_specs(rng: random.Random, rim: list[tuple[float, float]], z_ref: float,
                  scale: float) -> list[tuple[float, float, float, float]]:
    """Hero's underside boulders, placed against the real rim: (x, y, z, radius).

    `rim` is [(angle, radius), ...] in scene units; hero's `K["R"] * outline(ang)`
    becomes the loop's actual radius at that angle, and hero metres scale by
    `scale` (= the loop's mean radius / HERO_R).  Every centre sits below the
    cut (`z < z_ref - STRATA * scale`, hero.py:487).
    """
    specs = []
    for _ in range(UNDER_BOULDERS):
        t = rng.uniform(0.08, 0.75)
        ang = rng.uniform(0.0, 6.28)
        i, best = 0, 1e18
        for j, (a, _r) in enumerate(rim):
            d = abs(math.atan2(math.sin(a - ang), math.cos(a - ang)))
            if d < best:
                best, i = d, j
        rad = rim[i][1] * 0.82 * (1.0 - t) ** 0.55
        r = rng.uniform(0.32, 0.62) * (1.1 - 0.5 * t) * scale
        z = z_ref - (STRATA + t * UNDER) * scale
        specs.append((math.cos(ang) * rad, math.sin(ang) * rad, z, r))
    return specs


def boulder_geometry(r: float, rng: random.Random):
    """A lumpy low-poly sphere at the origin: ([(x, y, z, u, v)], [(a, b, c)])."""
    rings, segs = 4, 7
    off = (rng.uniform(0.0, 9.0), rng.uniform(0.0, 9.0), rng.uniform(0.0, 9.0))
    verts = []
    for j in range(rings + 1):
        th = math.pi * j / rings
        if j in (0, rings):
            dirs = [(0.0, 0.0, 1.0 if j == 0 else -1.0)]
        else:
            dirs = [(math.sin(th) * math.cos(2.0 * math.pi * i / segs),
                     math.sin(th) * math.sin(2.0 * math.pi * i / segs),
                     math.cos(th)) for i in range(segs)]
        for dx, dy, dz in dirs:
            lump = 1.0 + 0.28 * fbm((dx * 1.7 + off[0], dy * 1.7 + off[1], dz * 1.7 + off[2]))
            verts.append((dx * r * lump, dy * r * lump, dz * r * lump,
                          0.5 + math.atan2(dy, dx) / (2.0 * math.pi), 0.5 - 0.5 * dz))
    faces = []
    for i in range(segs):
        faces.append((0, 1 + i, 1 + (i + 1) % segs))
    for j in range(rings - 2):
        base = 1 + j * segs
        for i in range(segs):
            a, b = base + i, base + (i + 1) % segs
            c, d = base + segs + (i + 1) % segs, base + segs + i
            faces.append((a, d, c))
            faces.append((a, c, b))
    last = 1 + (rings - 2) * segs
    for i in range(segs):
        faces.append((last + i, len(verts) - 1, last + (i + 1) % segs))
    return verts, faces


def add_under_boulders(gen: "Generated", specs, rng: random.Random) -> None:
    """Add each blob to the generated pool (closed and disjoint from the shell)."""
    for x, y, z, r in specs:
        verts, tris = boulder_geometry(r, rng)
        base = len(gen.pos)
        for vx, vy, vz, u, v in verts:
            gen.add((x + vx, y + vy, z + vz), (u, v))
        for a, b, c in tris:
            gen.face("basalt", [("g", base + a), ("g", base + b), ("g", base + c)])


# --- OBJ read (text, read-only) ----------------------------------------------

class Mesh:
    __slots__ = ("verts", "faces", "face_mats", "raw_f", "raw_v", "raw_vt", "raw_vn",
                 "vt", "vn", "v_to_vt", "v_to_vn", "mtllib", "clip")

    def __init__(self):
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[list[int]] = []
        self.face_mats: list[str] = []
        self.raw_f: list[str] = []
        self.raw_v: list[str] = []
        self.raw_vt: list[str] = []
        self.raw_vn: list[str] = []
        self.vt: list[tuple[float, float]] = []
        self.vn: list[tuple[float, float, float]] = []
        self.v_to_vt: dict[int, int] = {}
        self.v_to_vn: dict[int, int] = {}
        self.mtllib: str | None = None
        self.clip = ClipPool()


def parse_obj(path: Path) -> Mesh:
    m = Mesh()
    cur = "default"
    n_v = n_vt = n_vn = 0
    with Path(path).open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.startswith("v "):
                p = line.split()
                m.verts.append((float(p[1]), float(p[2]), float(p[3])))
                m.raw_v.append(line.rstrip("\r\n"))
                n_v += 1
            elif line.startswith("vt "):
                p = line.split()
                m.vt.append((float(p[1]), float(p[2]) if len(p) > 2 else 0.0))
                m.raw_vt.append(line.rstrip("\r\n"))
                n_vt += 1
            elif line.startswith("vn "):
                p = line.split()
                m.vn.append((float(p[1]), float(p[2]), float(p[3])))
                m.raw_vn.append(line.rstrip("\r\n"))
                n_vn += 1
            elif line.startswith("f "):
                face = []
                for c in line.split()[1:]:
                    parts = c.split("/")
                    vi = int(parts[0])
                    face.append(vi - 1 if vi > 0 else n_v + vi)
                    if len(parts) > 1 and parts[1]:
                        vti = int(parts[1])
                        m.v_to_vt.setdefault(face[-1], vti - 1 if vti > 0 else n_vt + vti)
                    if len(parts) > 2 and parts[2]:
                        vni = int(parts[2])
                        m.v_to_vn.setdefault(face[-1], vni - 1 if vni > 0 else n_vn + vni)
                if face:
                    m.faces.append(face)
                    m.face_mats.append(cur)
                    m.raw_f.append(line.rstrip("\r\n"))
            elif line.startswith("usemtl "):
                cur = line.split(None, 1)[1].strip()
            elif line.startswith("mtllib "):
                m.mtllib = line.split(None, 1)[1].strip()
    return m


def pick_obj(reconstruction: Path) -> Path:
    fixed = reconstruction / OBJ_NAME
    if fixed.is_file():
        return fixed
    objs = sorted(reconstruction.glob("*.obj"))
    if len(objs) == 1:
        return objs[0]
    die(f"cut-island: no {OBJ_NAME} (or exactly one *.obj) under {reconstruction}")


# --- rim clip: Sutherland-Hodgman against the convex C6 polygon (ADR-5) ------

class ClipPool:
    """Rim-crossing vertices: one v/vt/vn block right after the source blocks.

    Positions live in the extended `mesh.verts`; this holds the interpolated
    vt/vn and the dedup index.  The key is the undirected source edge plus the
    crossing parameter measured from its lower-index end, rounded: both faces
    on that edge compute the same key from opposite directions, which is what
    keeps the cut edge-manifold.
    """

    __slots__ = ("uv", "nrm", "index")

    def __init__(self):
        self.uv: list[tuple[float, float]] = []
        self.nrm: list[tuple[float, float, float]] = []
        self.index: dict[tuple[int, int, float], int] = {}

    def add(self, mesh: Mesh, a: int, b: int, t: float) -> int:
        lo, hi = (a, b) if a < b else (b, a)
        tt = t if a < b else 1.0 - t
        key = (lo, hi, round(tt, 6))
        got = self.index.get(key)
        if got is not None:
            return got
        if (lo not in mesh.v_to_vt or lo not in mesh.v_to_vn
                or hi not in mesh.v_to_vt or hi not in mesh.v_to_vn):
            die(f"cut-island: the boundary cuts edge {lo + 1}-{hi + 1}, which has no "
                f"vt/vn corner; cannot stitch")
        pos = _lerp3(mesh.verts[lo], mesh.verts[hi], tt)
        uv = _lerp2(mesh.vt[mesh.v_to_vt[lo]], mesh.vt[mesh.v_to_vt[hi]], tt)
        nrm = _norm(_lerp3(mesh.vn[mesh.v_to_vn[lo]], mesh.vn[mesh.v_to_vn[hi]], tt))
        ref = len(mesh.verts)
        mesh.verts.append(pos)
        self.uv.append(uv)
        self.nrm.append(nrm)
        self.index[key] = ref
        return ref

    def add_point(self, mesh: Mesh, x: float, y: float, z: float,
                  uv: tuple[float, float], nrm: tuple[float, float, float]) -> int:
        """A polygon corner inside the face: its own vertex, nothing to share."""
        ref = len(mesh.verts)
        mesh.verts.append((x, y, z))
        self.uv.append(uv)
        self.nrm.append(_norm(nrm))
        return ref


def _lerp2(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def _lerp3(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t)


def _norm(v):
    length = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) or 1.0
    return (v[0] / length, v[1] / length, v[2] / length)


def _edge_param(mesh: Mesh, face: list[int], x: float, y: float, z: float):
    """The source edge of `face` a clipped vertex lies on: (u, v, t) or None."""
    best = None
    for k in range(len(face)):
        u, v = face[k], face[(k + 1) % len(face)]
        ux, uy, uz = mesh.verts[u]
        vx, vy, vz = mesh.verts[v]
        dx, dy, dz = vx - ux, vy - uy, vz - uz
        length2 = dx * dx + dy * dy + dz * dz
        if length2 == 0.0:
            continue
        t = ((x - ux) * dx + (y - uy) * dy + (z - uz) * dz) / length2
        if t < -CLIP_EPS or t > 1.0 + CLIP_EPS:
            continue
        px, py, pz = ux + dx * t, uy + dy * t, uz + dz * t
        d2 = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2
        if d2 <= (CLIP_EPS * max(1.0, math.sqrt(length2))) ** 2 and (best is None or d2 < best[0]):
            best = (d2, u, v, min(max(t, 0.0), 1.0))
    return best


def _record(mesh: Mesh, v: int) -> tuple:
    uv = mesh.vt[mesh.v_to_vt[v]] if v in mesh.v_to_vt else (0.0, 0.0)
    nrm = mesh.vn[mesh.v_to_vn[v]] if v in mesh.v_to_vn else (0.0, 0.0, 1.0)
    return (v, *mesh.verts[v], *uv, *nrm)


def _crossing(a: tuple, b: tuple, x1: float, y1: float, x2: float, y2: float) -> tuple:
    """Where segment a->b meets the polygon edge line (x1, y1)-(x2, y2)."""
    ax, ay, az = a[1], a[2], a[3]
    den = (b[1] - ax) * (y2 - y1) - (b[2] - ay) * (x2 - x1)
    t = (((x1 - ax) * (y2 - y1) - (y1 - ay) * (x2 - x1)) / den) if den != 0.0 else 0.0
    out = [None]
    for k in (1, 2, 3, 4, 5, 6, 7, 8):
        out.append(a[k] + (b[k] - a[k]) * t)
    return tuple(out)


def clip_face(mesh: Mesh, face: list[int], polygon: list[tuple[float, float]],
              pool: ClipPool) -> list[int]:
    """Clip one face to the convex polygon; returns its refs, [] when fully outside.

    A ref below `len(mesh.raw_v)` is a source vertex; a higher ref is a clip
    vertex in the pool.  New vertices are canonicalised back onto the source
    edge they lie on, so adjacent faces share one vertex along the cut.
    """
    orient = polygon_orientation(polygon)
    cur = [_record(mesh, v) for v in face]
    for i in range(len(polygon)):
        if not cur:
            return []
        x1, y1 = polygon[i - 1]
        x2, y2 = polygon[i]
        inp, cur = cur, []
        prev = inp[-1]
        prev_in = _inside(prev[1], prev[2], x1, y1, x2, y2, orient)
        for vert in inp:
            cur_in = _inside(vert[1], vert[2], x1, y1, x2, y2, orient)
            if cur_in != prev_in:
                cur.append(_crossing(prev, vert, x1, y1, x2, y2))
            if cur_in:
                cur.append(vert)
            prev, prev_in = vert, cur_in
    refs: list[int] = []
    for r in cur:
        if r[0] is not None:
            refs.append(r[0])
            continue
        hit = _edge_param(mesh, face, r[1], r[2], r[3])
        if hit is not None:
            refs.append(pool.add(mesh, hit[1], hit[2], hit[3]))
        else:                                  # a polygon corner inside the face
            refs.append(pool.add_point(mesh, r[1], r[2], r[3], (r[4], r[5]), (r[6], r[7], r[8])))
    out: list[int] = []
    for ref in refs:                           # a corner landing on a later clip edge
        if not out or out[-1] != ref:          # reappears as its own crossing; collapse it
            out.append(ref)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def clip_kept(mesh: Mesh, polygon: list[tuple[float, float]],
              kept: list[int]) -> list[tuple[int, list[int] | None]]:
    """Clip the centroid-filtered candidates to the polygon (ADR-5).

    Returns one (source face index, refs) per output face: refs is None when
    every vertex is inside and the raw f line can be written verbatim, else the
    clipped convex n-gon's refs.
    """
    orient = polygon_orientation(polygon)
    pieces: list[tuple[int, list[int] | None]] = []
    for fi in kept:
        face = mesh.faces[fi]
        if all(inside_convex(mesh.verts[v][0], mesh.verts[v][1], polygon, orient) for v in face):
            pieces.append((fi, None))
            continue
        refs = clip_face(mesh, face, polygon, mesh.clip)
        if len(refs) >= 3:
            pieces.append((fi, refs))
    return pieces


# --- trim + boundary loop ----------------------------------------------------

def trim(mesh: Mesh, polygon: list[tuple[float, float]]) -> list[int]:
    kept = []
    for fi, face in enumerate(mesh.faces):
        n = len(face)
        cx = sum(mesh.verts[i][0] for i in face) / n
        cy = sum(mesh.verts[i][1] for i in face) / n
        if point_in_polygon(cx, cy, polygon):
            kept.append(fi)
    return kept


def top_faces_up(mesh: Mesh, faces: list[list[int]]) -> bool:
    """Area-weighted sign of the kept faces' upward normal."""
    nz = 0.0
    for face in faces:
        for k in range(len(face)):
            x1, y1 = mesh.verts[face[k]][0], mesh.verts[face[k]][1]
            x2, y2 = mesh.verts[face[(k + 1) % len(face)]][0], mesh.verts[face[(k + 1) % len(face)]][1]
            nz += x1 * y2 - x2 * y1
    return nz > 0.0


def boundary_loops(mesh: Mesh, faces: list[list[int]]) -> list[list[int]]:
    counts: dict[tuple[int, int], int] = defaultdict(int)
    for face in faces:
        for k in range(len(face)):
            a, b = face[k], face[(k + 1) % len(face)]
            if a != b:
                counts[(a, b) if a < b else (b, a)] = counts.get((a, b) if a < b else (b, a), 0) + 1
    adj: dict[int, list[int]] = defaultdict(list)
    for (a, b), c in counts.items():
        if c == 1:
            adj[a].append(b)
            adj[b].append(a)
    used: set[tuple[int, int]] = set()
    loops, fragments = [], 0
    for a in sorted(adj):
        for b in adj[a]:
            if (a, b) in used:
                continue
            loop = [a, b]
            used.add((a, b))
            used.add((b, a))
            cur = b
            while cur != a:
                nxt = [v for v in adj[cur] if (cur, v) not in used]
                if not nxt:
                    break
                v = nxt[0]
                used.add((cur, v))
                used.add((v, cur))
                loop.append(v)
                cur = v
            if loop[-1] == a:
                loops.append(loop[:-1])
            else:
                fragments += 1
    if fragments:
        print(f"cut-island: warning: {fragments} non-closing boundary walks (non-manifold cut?)",
              file=sys.stderr)
    return loops


def loop_area(loop: list[int], mesh: Mesh) -> float:
    area = 0.0
    for k in range(len(loop)):
        x1, y1 = mesh.verts[loop[k]][0], mesh.verts[loop[k]][1]
        x2, y2 = mesh.verts[loop[(k + 1) % len(loop)]][0], mesh.verts[loop[(k + 1) % len(loop)]][1]
        area += x1 * y2 - x2 * y1
    return area / 2.0


# --- generated below-cut geometry (hero.py:84-151, scaled to the real loop) --

class Generated:
    """New vertices + faces for the cut sides and underside, with smooth normals."""

    def __init__(self, mesh: Mesh):
        self.mesh = mesh
        self.pos: list[tuple[float, float, float]] = []
        self.uv: list[tuple[float, float]] = []
        self.acc: list[list[float]] = []
        self.nrm: list[tuple[float, float, float]] = []
        self.faces: list[tuple[str, list[tuple[int, int, int]]]] = []
        self._n_v = len(mesh.raw_v) + len(mesh.clip.uv)      # generated block starts after the clip block
        self._n_vt = len(mesh.raw_vt) + len(mesh.clip.uv)
        self._n_vn = len(mesh.raw_vn) + len(mesh.clip.nrm)

    def add(self, p, uv) -> int:
        self.pos.append(p)
        self.uv.append(uv)
        self.acc.append([0.0, 0.0, 0.0])
        return len(self.pos) - 1

    def _corner(self, kind: str, idx: int):
        if kind == "s":
            if idx not in self.mesh.v_to_vt or idx not in self.mesh.v_to_vn:
                die(f"cut-island: boundary vertex {idx + 1} has no vt/vn corner; cannot stitch")
            return ((idx + 1, self.mesh.v_to_vt[idx] + 1, self.mesh.v_to_vn[idx] + 1),
                    self.mesh.verts[idx])
        if kind == "c":
            n_src = len(self.mesh.raw_v)
            return ((n_src + idx + 1, len(self.mesh.raw_vt) + idx + 1,
                     len(self.mesh.raw_vn) + idx + 1), self.mesh.verts[n_src + idx])
        return ((self._n_v + idx + 1, self._n_vt + idx + 1, self._n_vn + idx + 1), self.pos[idx])

    def face(self, material: str, corners: list[tuple[str, int]]) -> None:
        obj, pts = [], []
        for kind, idx in corners:
            c, p = self._corner(kind, idx)
            obj.append(c)
            pts.append(p)
        self.faces.append((material, obj))
        nx = ny = nz = 0.0                       # Newell
        for k in range(len(pts)):
            x1, y1, z1 = pts[k]
            x2, y2, z2 = pts[(k + 1) % len(pts)]
            nx += (y1 - y2) * (z1 + z2)
            ny += (z1 - z2) * (x1 + x2)
            nz += (x1 - x2) * (y1 + y2)
        for (kind, idx), _ in zip(corners, pts):
            if kind == "g":
                a = self.acc[idx]
                a[0] += nx
                a[1] += ny
                a[2] += nz

    def finish(self) -> "Generated":
        for a in self.acc:
            length = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) or 1.0
            self.nrm.append((a[0] / length, a[1] / length, a[2] / length))
        return self


def generate_island(mesh: Mesh, loop: list[int], up: bool) -> Generated:
    """Port of hero.py:84-151 around the real boundary loop.

    Faces wind outward when the loop runs CCW seen from above and the kept top
    faces up (or the mirror of both); the orientation is fixed from the kept
    faces' own winding before the rings are built.
    """
    pts = [mesh.verts[i] for i in loop]
    area = 0.0
    for k in range(len(pts)):
        x1, y1 = pts[k][0], pts[k][1]
        x2, y2 = pts[(k + 1) % len(pts)][0], pts[(k + 1) % len(pts)][1]
        area += x1 * y2 - x2 * y1
    if (area > 0.0) != up:
        loop = list(reversed(loop))
        pts = [mesh.verts[i] for i in loop]

    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    z_top = [p[2] for p in pts]
    z_ref = sum(z_top) / n
    rho = [max(math.hypot(p[0] - cx, p[1] - cy), 1e-9) for p in pts]
    scale = (sum(rho) / n) / HERO_R           # hero's R = the loop's mean radius
    unit = [((p[0] - cx) / rho[k], (p[1] - cy) / rho[k]) for k, p in enumerate(pts)]
    ang = [math.atan2(p[1] - cy, p[0] - cx) for p in pts]
    cum = [0.0] * n
    for k in range(1, n):
        cum[k] = cum[k - 1] + math.dist(pts[k][:2], pts[k - 1][:2])
    perimeter = cum[-1] + math.dist(pts[0][:2], pts[-1][:2])

    gen = Generated(mesh)
    n_src = len(mesh.raw_v)
    corner = (lambda v: ("s", v) if v < n_src else ("c", v - n_src))
    rings: list[list[tuple[str, int]]] = [[corner(v) for v in loop]]   # ring 0: the real top edge
    for k in range(1, SIDE_RINGS + 1):
        tt = k / SIDE_RINGS
        depth = tt * STRATA
        ring = []
        for i in range(n):
            c, s_ = math.cos(ang[i]), math.sin(ang[i])
            d = depth + 0.03 * fbm((c * 1.5, s_ * 1.5, 7.0))
            (_, _, prot, _), f = layer_at(d)
            crumble = -0.035 * (1 - min(f, 1 - f) * 2) ** 6
            broken = 0.04 * fbm((c * 4, s_ * 4, d * 3)) + 0.02 * fbm((c * 11, s_ * 11, d * 9))
            r = rho[i] / scale * (1 - 0.03 * tt) + prot + crumble + broken
            ring.append(("g", gen.add(
                (cx + unit[i][0] * r * scale, cy + unit[i][1] * r * scale, z_top[i] - depth * scale),
                (cum[i] / TEX_M, depth * scale / TEX_M))))
        rings.append(ring)

    for k in range(1, UNDER_RINGS):
        tt = k / UNDER_RINGS
        zh = (-STRATA - tt * UNDER) * 0.7
        ring = []
        for i in range(n):
            vx, vy = unit[i][0] * 1.6, unit[i][1] * 1.6
            lump = (1 + LUMPS * noise3((vx * 0.9, vy * 0.9, zh * 0.9))
                    + 0.10 * fbm((vx * 2.4, vy * 2.4, zh * 2.4)))
            r = rho[i] / scale * (1 - tt) ** 0.55 * lump
            x = cx + (unit[i][0] * r + 0.25 * tt) * scale
            y = cy + (unit[i][1] * r - 0.15 * tt) * scale
            z = (z_top[i] - STRATA * scale) * (1 - tt) + (z_ref - (STRATA + tt * UNDER) * scale) * tt
            ring.append(("g", gen.add(
                (x, y, z),
                (ang[i] / (2 * math.pi) * perimeter / TEX_M, (STRATA + tt * UNDER) * scale / TEX_M))))
        rings.append(ring)

    for j in range(len(rings) - 1):
        material = "strata" if j < SIDE_RINGS else "basalt"
        a, b = rings[j], rings[j + 1]
        for i in range(n):
            k = (i + 1) % n
            gen.face(material, [a[i], b[i], b[k], a[k]])
    last = rings[-1]
    tip = gen.add((cx + 0.3 * scale, cy - 0.2 * scale,
                   z_ref - (STRATA + UNDER + 0.25) * scale),
                  (0.0, (STRATA + UNDER + 0.25) * scale / TEX_M))
    for i in range(n):
        gen.face("basalt", [last[i], ("g", tip), last[(i + 1) % n]])
    rng = random.Random(SEED)
    add_under_boulders(gen, boulder_specs(rng, [(ang[i], rho[i]) for i in range(n)], z_ref, scale), rng)
    return gen.finish()


# --- island dir (C1) ---------------------------------------------------------

def parse_mtl(path: Path | None):
    order, blocks = [], {}
    if path is None or not Path(path).is_file():
        return order, blocks
    cur = None
    for line in Path(path).read_text().splitlines():
        if line.startswith("newmtl "):
            cur = line.split(None, 1)[1].strip()
            order.append(cur)
            blocks[cur] = [line]
        elif cur is not None:
            blocks[cur].append(line)
    return order, blocks


def mtl_texture(block: list[str]) -> str | None:
    for line in block:
        if line.strip().startswith("map_Kd "):
            return Path(line.split(None, 1)[1].strip()).name
    return None


def find_asset(rel: str, asset_roots) -> Path | None:
    for base in asset_roots:
        p = Path(base) / rel
        if p.is_file():
            return p
    return None


def copy_texture(src: Path, tex_dir: Path, copied: set[str]) -> None:
    if src.name in copied:
        return
    shutil.copyfile(src, tex_dir / src.name)
    copied.add(src.name)


def write_obj(path: Path, mesh: Mesh, pieces: list[tuple[int, list[int] | None]],
              gen: Generated) -> None:
    n_src = len(mesh.raw_v)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("# cut-island: source v/vt/vn lines verbatim (C1 bit-identical top);\n")
        f.write("# kept faces clipped to the C6 polygon; walls/underside generated.\n")
        f.write("mtllib island.mtl\n")
        for line in mesh.raw_v:
            f.write(line + "\n")
        for line in mesh.raw_vt:
            f.write(line + "\n")
        for line in mesh.raw_vn:
            f.write(line + "\n")
        f.write("# --- clipped rim geometry (M1) ---\n")
        for p in mesh.verts[n_src:]:
            f.write("v %.6f %.6f %.6f\n" % p)
        for uv in mesh.clip.uv:
            f.write("vt %.6f %.6f\n" % uv)
        for nrm in mesh.clip.nrm:
            f.write("vn %.6f %.6f %.6f\n" % nrm)
        cur = None
        for fi, refs in pieces:
            mat = mesh.face_mats[fi]
            if mat != cur:
                f.write(f"usemtl {mat}\n")
                cur = mat
            if refs is None:
                f.write(mesh.raw_f[fi] + "\n")
                continue
            corners = []
            for r in refs:
                if r < n_src:
                    corners.append((r + 1, mesh.v_to_vt[r] + 1, mesh.v_to_vn[r] + 1))
                else:
                    c = r - n_src
                    corners.append((r + 1, len(mesh.raw_vt) + c + 1, len(mesh.raw_vn) + c + 1))
            f.write("f " + " ".join(f"{a}/{b}/{c}" for a, b, c in corners) + "\n")
        f.write("# --- generated below-cut geometry ---\n")
        for p in gen.pos:
            f.write("v %.6f %.6f %.6f\n" % p)
        for uv in gen.uv:
            f.write("vt %.6f %.6f\n" % uv)
        for nrm in gen.nrm:
            f.write("vn %.6f %.6f %.6f\n" % nrm)
        cur = None
        for mat, corners in gen.faces:
            if mat != cur:
                f.write(f"usemtl {mat}\n")
                cur = mat
            f.write("f " + " ".join(f"{a}/{b}/{c}" for a, b, c in corners) + "\n")


# --- run ---------------------------------------------------------------------

def run(reconstruction: Path, boundary_path: Path, out_island: Path, out_report: Path,
        asset_roots=ASSET_ROOTS) -> dict:
    reconstruction = Path(reconstruction)
    boundary_path = Path(boundary_path)
    polygon = load_boundary(boundary_path)

    obj_path = pick_obj(reconstruction)
    mesh = parse_obj(obj_path)
    kept = trim(mesh, polygon)
    dropped = len(mesh.faces) - len(kept)
    if not kept:
        die(f"cut-island: boundary keeps no face of {obj_path} -- wrong frame or polygon?")
    pieces = clip_kept(mesh, polygon, kept)
    clipped = sum(1 for _, refs in pieces if refs is not None)
    faces = [refs if refs is not None else mesh.faces[fi] for fi, refs in pieces]
    up = top_faces_up(mesh, faces)
    loops = boundary_loops(mesh, faces)
    if not loops:
        die("cut-island: trimmed mesh has no boundary edge loop; cannot stitch an island")
    loops.sort(key=lambda l: abs(loop_area(l, mesh)), reverse=True)
    main = loops[0]
    print(f"cut-island: {len(mesh.faces)} faces -> kept {len(kept)}, dropped {dropped}, "
          f"clipped {clipped}; {len(loops)} boundary loop(s), main {len(main)} verts "
          f"({sum(abs(loop_area(l, mesh)) for l in loops[1:]):.0f} m2 in the rest)", flush=True)

    gen = generate_island(mesh, main, up)

    out_island = Path(out_island)
    tex_dir = out_island / "textures"
    tex_dir.mkdir(parents=True, exist_ok=True)

    src_order, src_blocks = parse_mtl((reconstruction / mesh.mtllib) if mesh.mtllib else None)
    used = {mesh.face_mats[fi] for fi in kept}
    copied: set[str] = set()
    for name in src_order:
        if name not in used:
            continue
        tex = mtl_texture(src_blocks[name])
        if tex:
            src = reconstruction / tex
            if not src.is_file():
                die(f"cut-island: material {name} points at missing texture {src}")
            copy_texture(src, tex_dir, copied)
    for name, (asset_dir, asset_file) in HERO_TEX.items():
        src = find_asset(f"{asset_dir}/{asset_file}", asset_roots)
        if src:
            copy_texture(src, tex_dir, copied)
        else:
            print(f"cut-island: note: hero texture {asset_dir}/{asset_file} not found locally; "
                  f"the render container resolves it from its baked assets", file=sys.stderr)

    write_obj(out_island / "island.obj", mesh, pieces, gen)
    out_lines = ["# cut-island materials"]
    for name in src_order:
        if name not in used:
            continue
        for line in src_blocks[name]:
            if line.strip().startswith("map_Kd "):
                out_lines.append(f"map_Kd textures/{Path(line.split(None, 1)[1].strip()).name}")
            else:
                out_lines.append(line)
        out_lines.append("")
    for name in ("strata", "basalt"):
        out_lines += [f"newmtl {name}",
                      "Ka 1.000000 1.000000 1.000000",
                      "Kd 1.000000 1.000000 1.000000",
                      "Ks 0.000000 0.000000 0.000000",
                      "Tr 0.000000",
                      "illum 1",
                      "Ns 1.000000",
                      f"map_Kd textures/{HERO_TEX[name][1]}",
                      ""]
    (out_island / "island.mtl").write_text("\n".join(out_lines), encoding="utf-8")

    input_hashes = {str(p.relative_to(reconstruction)): sha256_file(p)
                    for p in sorted(reconstruction.rglob("*")) if p.is_file()}
    report = {
        "reconstruction": str(reconstruction),
        "boundary_sha256": sha256_file(boundary_path),
        "input_hashes": input_hashes,
        "kept_faces": len(kept),
        "dropped_faces": dropped,
        "clipped_faces": clipped,
    }
    emit_report(out_report, report)
    print(f"cut-island: wrote {len(mesh.raw_v)} source verts + {len(mesh.clip.uv)} clip verts + "
          f"{len(gen.pos)} generated verts, {len(kept)} kept + {len(gen.faces)} generated faces "
          f"({UNDER_BOULDERS} underside boulders); {len(copied)} textures; report {out_report}",
          flush=True)
    return report


# --- self-test (no bpy) ------------------------------------------------------

def hero_constants() -> dict:
    """K/LAYERS/BOUNDS from scripts/hero/hero.py:16-47, by AST source segment.

    hero.py imports bpy at the top, so only the constants section is exec'd
    (the pattern in nodes/grade/grade.py:91-98): the values this Node copied
    from the hero must stay equal to the hero's.
    """
    hero = Path(__file__).resolve().parents[2] / "scripts/hero/hero.py"
    src = hero.read_text(encoding="utf-8")
    ns: dict = {}
    for node in ast.parse(src).body:
        seg = ast.get_source_segment(src, node)
        if seg is None:
            continue
        assign = isinstance(node, ast.Assign) and (
            any(isinstance(t, ast.Name) and t.id in ("K", "LAYERS", "BOUNDS", "_z")
                for t in node.targets)
            or any(isinstance(t, ast.Subscript) and getattr(t.value, "id", "") == "K"
                   for t in node.targets))
        if assign or (isinstance(node, ast.For) and "BOUNDS.append" in seg):
            exec(compile(seg, str(hero), "exec"), ns)
    return ns


def self_test() -> None:
    square = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    assert point_in_polygon(5, 5, square)
    assert not point_in_polygon(-1, 5, square)
    assert not point_in_polygon(5, 11, square)
    assert not point_in_polygon(11, 5, square)          # ray-cast must not leak past an edge

    # ADR-5's guard: convex rings pass, a concave one is named as out of scope
    assert polygon_is_convex(square)
    assert polygon_is_convex(square[::-1])              # either winding
    assert not polygon_is_convex([(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (2.0, 2.0), (0.0, 4.0)])

    # hero-constants parity (ast-parsed from scripts/hero/hero.py, no bpy)
    hero = hero_constants()
    hk = hero["K"]
    assert hk["R"] == HERO_R, (hk["R"], HERO_R)
    assert hk["strata"] == STRATA, (hk["strata"], STRATA)
    assert hk["under"] == UNDER, (hk["under"], UNDER)
    assert hk["lumps"] == LUMPS, (hk["lumps"], LUMPS)
    assert hk["under_boulders"] == UNDER_BOULDERS, (hk["under_boulders"], UNDER_BOULDERS)
    assert hk["seed"] == SEED, (hk["seed"], SEED)
    assert hero["LAYERS"] == LAYERS, "LAYERS drifted from scripts/hero/hero.py"
    assert hero["BOUNDS"] == BOUNDS, "BOUNDS drifted from scripts/hero/hero.py"
    print(f"self-test: hero constants parity ok (K/LAYERS/BOUNDS from hero.py:16-47; "
          f"strata {STRATA}, under {UNDER}, lumps {LUMPS}, under_boulders {UNDER_BOULDERS})")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        recon = root / "reconstruction"
        recon.mkdir()
        n = 8
        lines = ["mtllib syn.mtl"]
        for j in range(n + 1):
            for i in range(n + 1):
                lines.append(f"v {float(i):.6f} {float(j):.6f} 0.000000")
        for j in range(n + 1):
            for i in range(n + 1):
                lines.append(f"vt {i / n:.6f} {j / n:.6f}")
                lines.append("vn 0.000000 0.000000 1.000000")

        def vid(i, j):
            return j * (n + 1) + i + 1

        lines.append("usemtl material0000")
        for j in range(n):
            for i in range(n):
                a, b, c, d = vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)
                lines.append(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}")
                lines.append(f"f {a}/{a}/{a} {c}/{c}/{c} {d}/{d}/{d}")
        (recon / OBJ_NAME).write_text("\n".join(lines) + "\n")
        (recon / "syn.mtl").write_text(
            "newmtl material0000\nKa 1 1 1\nKd 1 1 1\nillum 1\nmap_Kd fake_map_Kd.png\n")
        (recon / "fake_map_Kd.png").write_bytes(b"not really a png")

        boundary = root / "boundary.json"
        boundary.write_text(json.dumps({"polygon": [[1, 1], [7, 1], [7, 7], [1, 7]]}))
        report = run(recon, boundary, root / "island", root / "report.json",
                     asset_roots=(root / "no-assets",))

        # 6x6 kept cells x 2 triangles; the 128-triangle grid's rim falls outside
        assert report["kept_faces"] == 72, report
        assert report["dropped_faces"] == 56, report
        assert report["clipped_faces"] == 0, report      # faces on the boundary lines are inside
        assert report["boundary_sha256"] == sha256_file(boundary)
        assert set(report["input_hashes"]) == {
            str(p.relative_to(recon)) for p in sorted(recon.rglob("*")) if p.is_file()}

        out = root / "island"
        assert (out / "island.mtl").is_file() and (out / "textures" / "fake_map_Kd.png").is_file()
        assert "map_Kd textures/fake_map_Kd.png" in (out / "island.mtl").read_text()

        src_v = [l for l in (recon / OBJ_NAME).read_text().splitlines() if l.startswith("v ")]
        out_lines = (out / "island.obj").read_text().splitlines()
        out_v = [l for l in out_lines if l.startswith("v ")]
        assert out_v[:len(src_v)] == src_v, "top vertex lines are not byte-identical"
        m_gen = out_lines.index("# --- generated below-cut geometry ---")
        assert sum(1 for l in out_lines[:m_gen] if l.startswith("v ")) == len(src_v), \
            "aligned boundary wrote unexpected clip verts"
        gen_f = sum(1 for l in out_lines if l.startswith("f "))
        assert gen_f > 72, f"no generated faces ({gen_f} total)"

        # the stitched island must close: every edge is used by exactly two faces
        edges: dict[tuple[int, int], int] = defaultdict(int)
        for line in out_lines:
            if line.startswith("f "):
                idx = [int(c.split("/")[0]) for c in line.split()[1:]]
                for k in range(len(idx)):
                    a, b = idx[k], idx[(k + 1) % len(idx)]
                    edges[(a, b) if a < b else (b, a)] += 1
        bad = [e for e, c in edges.items() if c != 2]
        assert not bad, f"{len(bad)} edges are not shared by exactly 2 faces: {bad[:5]}"

        # the boulders land: generated faces form the shell plus one blob each
        gstart = out_lines.index("# --- generated below-cut geometry ---")
        gstart = sum(1 for l in out_lines[:gstart] if l.startswith("v "))
        parent = list(range(len(out_v)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        for line in out_lines:
            if line.startswith("f "):
                idx = [int(c.split("/")[0]) - 1 for c in line.split()[1:]]
                if all(i >= gstart for i in idx):
                    for b in idx[1:]:
                        ra, rb = find(idx[0]), find(b)
                        if ra != rb:
                            parent[rb] = ra
        comps = {find(i) for i in range(gstart, len(out_v))}
        assert len(comps) == 1 + UNDER_BOULDERS, f"shell + boulders: {len(comps)} components"

        # crossing faces: one convex n-gon, every output vertex inside the polygon;
        # the rim (main boundary loop) has no vertex outside either
        poly2 = [(1.5, 1.5), (6.5, 1.5), (6.5, 6.5), (1.5, 6.5)]
        m2 = parse_obj(recon / OBJ_NAME)
        pieces2 = clip_kept(m2, poly2, trim(m2, poly2))
        clipped2 = sum(1 for _, refs in pieces2 if refs is not None)
        assert clipped2 > 0, "boundary through the grid clipped nothing"
        orient2 = polygon_orientation(poly2)
        for fi, refs in pieces2:
            for r in (refs if refs is not None else m2.faces[fi]):
                x, y = m2.verts[r][0], m2.verts[r][1]
                assert inside_convex(x, y, poly2, orient2), f"ref {r} outside: {x}, {y}"
        faces2 = [refs if refs is not None else m2.faces[fi] for fi, refs in pieces2]
        loops2 = boundary_loops(m2, faces2)
        main2 = max(loops2, key=lambda l: abs(loop_area(l, m2)))
        for v in main2:
            x, y = m2.verts[v][0], m2.verts[v][1]
            assert inside_convex(x, y, poly2, orient2), f"rim vertex {v} outside: {x}, {y}"

        # two faces sharing an edge dedupe to one clip vertex on that edge
        pm = Mesh()
        pm.verts = [(-6.0, 0.0, 0.5), (0.0, 0.0, 0.0), (0.0, 2.0, 1.0), (0.0, -2.0, 1.0)]
        pm.faces = [[0, 1, 2], [1, 0, 3]]
        pm.face_mats = ["m", "m"]
        pm.raw_v = ["v"] * 4
        pm.raw_vt = ["vt"] * 4
        pm.raw_vn = ["vn"] * 4
        pm.vt = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (1.0, 1.0)]
        pm.vn = [(0.0, 0.0, 1.0)] * 4
        pm.v_to_vt = {i: i for i in range(4)}
        pm.v_to_vn = {i: i for i in range(4)}
        poly3 = [(-5.0, -5.0), (5.0, -5.0), (5.0, 5.0), (-5.0, 5.0)]
        f1 = clip_face(pm, pm.faces[0], poly3, pm.clip)
        f2 = clip_face(pm, pm.faces[1], poly3, pm.clip)
        shared = {r for r in f1 if r >= len(pm.raw_v)} & {r for r in f2 if r >= len(pm.raw_v)}
        assert len(shared) == 1, (f1, f2, pm.clip.index)
        v = shared.pop()
        assert abs(pm.verts[v][0] + 5.0) < 1e-9 and abs(pm.verts[v][1]) < 1e-9, pm.verts[v]
        assert len(pm.clip.index) == 3, pm.clip.index

        # concave boundary dies loudly, naming the upgrade path
        import contextlib
        import io
        concave = root / "concave.json"
        concave.write_text(json.dumps({"polygon": [[0, 0], [4, 0], [4, 4], [2, 2], [0, 4]]}))
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            try:
                load_boundary(concave)
                raise AssertionError("concave boundary was accepted")
            except SystemExit:
                pass
        assert "Greiner" in err.getvalue(), err.getvalue()

        # crossing boundary end to end: clip verts written and referenced, report counts
        boundary2 = root / "boundary2.json"
        boundary2.write_text(json.dumps({"polygon": [list(p) for p in poly2]}))
        report3 = run(recon, boundary2, root / "island3", root / "report3.json",
                      asset_roots=(root / "no-assets",))
        assert report3["clipped_faces"] == clipped2 > 0, report3
        lines3 = (root / "island3" / "island.obj").read_text().splitlines()
        m_gen = lines3.index("# --- generated below-cut geometry ---")
        n_clip3 = sum(1 for l in lines3[:m_gen] if l.startswith("v ")) - len(src_v)
        assert n_clip3 > 0, "clipped faces did not produce clip verts"
        used_clip = 0
        for l in lines3:
            if l.startswith("f "):
                for c in l.split()[1:]:
                    i = int(c.split("/")[0])
                    if len(src_v) < i <= len(src_v) + n_clip3:
                        used_clip += 1
        assert used_clip > 0, "no clipped face references a clip vertex"

        # boulders: count, determinism, every centre below the cut
        rim = [(2.0 * math.pi * i / 16.0, 30.0 + i) for i in range(16)]
        b1 = boulder_specs(random.Random(SEED), rim, 1.0, 10.0)
        b2 = boulder_specs(random.Random(SEED), rim, 1.0, 10.0)
        assert len(b1) == UNDER_BOULDERS == 20, len(b1)
        assert b1 == b2, "boulder placement differs across two seeded runs"
        cut = 1.0 - STRATA * 10.0
        assert all(z < cut for _x, _y, z, _r in b1), "a boulder centre is not under the cut"

        # rerun determinism: clip and boulders byte-identical
        run(recon, boundary, root / "island-again", root / "report-again.json",
            asset_roots=(root / "no-assets",))
        assert (out / "island.obj").read_bytes() == \
            (root / "island-again" / "island.obj").read_bytes(), "rerun differs"

        print(f"self-test: clip ok ({clipped2} crossing faces -> convex n-gons, every vertex "
              f"inside; 2 shared-edge faces -> 1 clip vertex; {n_clip3} clip verts referenced)")
        print(f"self-test: under_boulders ok ({UNDER_BOULDERS} deterministic blobs, "
              f"1 shell + {UNDER_BOULDERS} components; all centres below z_ref - STRATA*scale)")
        print(f"self-test ok: polygon math + convexity guard; 72/128 synthetic faces kept; "
              f"{gen_f} output faces, closed ({len(edges)} edges x2); top verts byte-identical; "
              f"rerun byte-identical")


# --- CLI ---------------------------------------------------------------------

def main(argv: list[str]) -> None:
    args = argv[argv.index("--") + 1:] if "--" in argv else argv[1:]
    if args == ["--self-test"]:
        self_test()
        return

    p = argparse.ArgumentParser(description="cut a Reconstruction into a Showcase island",
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--reconstruction", required=True, type=Path,
                   help="ODM Reconstruction directory (opened read-only)")
    p.add_argument("--boundary", required=True, type=Path, help="C6 boundary JSON")
    p.add_argument("--out-island", required=True, type=Path, help="C1 island directory")
    p.add_argument("--out-report", required=True, type=Path, help="C2 cut-report.json")
    a = p.parse_args(args)
    run(a.reconstruction, a.boundary, a.out_island, a.out_report)


if __name__ == "__main__":
    main(sys.argv)
