#!/usr/bin/env python3
"""cut-island -- trim a Reconstruction to the Site boundary and cut an island.

    python3 nodes/cut-island/cut_island.py \\
        --reconstruction DIR --boundary FILE --out-island DIR --out-report FILE
    python3 nodes/cut-island/cut_island.py --self-test        # no bpy needed

C1: `--out-island DIR` gets island.obj + island.mtl + textures/, MTL-relative
paths.  The captured top is never rewritten: every source `v`/`vt`/`vn` line is
emitted in place, unchanged, so top-vertex positions and UVs are bit-identical
to the Reconstruction mesh by construction, and only faces whose XY centroid
falls outside the C6 polygon are dropped.  The Reconstruction is opened
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
import json
import math
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
SIDE_RINGS = 72
UNDER_RINGS = 30
TEX_M = 4.0          # real-world metres one generated-geometry texture tile spans

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
    return polygon


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


# --- OBJ read (text, read-only) ----------------------------------------------

class Mesh:
    __slots__ = ("verts", "faces", "face_mats", "raw_f", "raw_v", "raw_vt", "raw_vn",
                 "v_to_vt", "v_to_vn", "mtllib")

    def __init__(self):
        self.verts: list[tuple[float, float, float]] = []
        self.faces: list[list[int]] = []
        self.face_mats: list[str] = []
        self.raw_f: list[str] = []
        self.raw_v: list[str] = []
        self.raw_vt: list[str] = []
        self.raw_vn: list[str] = []
        self.v_to_vt: dict[int, int] = {}
        self.v_to_vn: dict[int, int] = {}
        self.mtllib: str | None = None


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
                m.raw_vt.append(line.rstrip("\r\n"))
                n_vt += 1
            elif line.startswith("vn "):
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


def top_faces_up(mesh: Mesh, kept: list[int]) -> bool:
    """Area-weighted sign of the kept faces' upward normal."""
    nz = 0.0
    for fi in kept:
        face = mesh.faces[fi]
        for k in range(len(face)):
            x1, y1 = mesh.verts[face[k]][0], mesh.verts[face[k]][1]
            x2, y2 = mesh.verts[face[(k + 1) % len(face)]][0], mesh.verts[face[(k + 1) % len(face)]][1]
            nz += x1 * y2 - x2 * y1
    return nz > 0.0


def boundary_loops(mesh: Mesh, kept: list[int]) -> list[list[int]]:
    counts: dict[tuple[int, int], int] = defaultdict(int)
    for fi in kept:
        face = mesh.faces[fi]
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
        self._n_v = len(mesh.raw_v)
        self._n_vt = len(mesh.raw_vt)
        self._n_vn = len(mesh.raw_vn)

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
    rings: list[list[tuple[str, int]]] = [[("s", v) for v in loop]]   # ring 0: the real top edge
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


def write_obj(path: Path, mesh: Mesh, kept: list[int], gen: Generated) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("# cut-island: source v/vt/vn lines verbatim (C1 bit-identical top);\n")
        f.write("# only faces outside the C6 polygon dropped; walls/underside generated.\n")
        f.write("mtllib island.mtl\n")
        for line in mesh.raw_v:
            f.write(line + "\n")
        for line in mesh.raw_vt:
            f.write(line + "\n")
        for line in mesh.raw_vn:
            f.write(line + "\n")
        cur = None
        for fi in kept:
            mat = mesh.face_mats[fi]
            if mat != cur:
                f.write(f"usemtl {mat}\n")
                cur = mat
            f.write(mesh.raw_f[fi] + "\n")
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
    up = top_faces_up(mesh, kept)
    loops = boundary_loops(mesh, kept)
    if not loops:
        die("cut-island: trimmed mesh has no boundary edge loop; cannot stitch an island")
    loops.sort(key=lambda l: abs(loop_area(l, mesh)), reverse=True)
    main = loops[0]
    print(f"cut-island: {len(mesh.faces)} faces -> kept {len(kept)}, dropped {dropped}; "
          f"{len(loops)} boundary loop(s), main {len(main)} verts "
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

    write_obj(out_island / "island.obj", mesh, kept, gen)
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
    }
    emit_report(out_report, report)
    print(f"cut-island: wrote {len(mesh.raw_v)} source verts + {len(gen.pos)} generated verts, "
          f"{len(kept)} kept + {len(gen.faces)} generated faces; {len(copied)} textures; "
          f"report {out_report}", flush=True)
    return report


# --- self-test (no bpy) ------------------------------------------------------

def self_test() -> None:
    square = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    assert point_in_polygon(5, 5, square)
    assert not point_in_polygon(-1, 5, square)
    assert not point_in_polygon(5, 11, square)
    assert not point_in_polygon(11, 5, square)          # ray-cast must not leak past an edge

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
        print(f"self-test ok: polygon math; 72/128 synthetic faces kept; "
              f"{gen_f} output faces, closed ({len(edges)} edges x2); top verts byte-identical")


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
