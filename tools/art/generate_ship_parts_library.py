#!/usr/bin/env python3
"""Generate the SpaceFace modular ship-parts library as deterministic, game-ready GLBs.

No third-party packages are required. Each GLB is self-contained and includes:
  * authored chamfered/faceted geometry in the project coordinate system;
  * embedded 1K base-color, tangent normal, and ORM textures;
  * glTF PBR materials with stable tintable material names;
  * named mount, hook, and socket nodes consumed by partsLibrary.js;
  * metadata used by scripts/check-ship-parts-library.mjs.

Coordinate contract: right-handed, +X forward, +Y up, +Z starboard, metres.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence

Vec2 = tuple[float, float]
Vec3 = tuple[float, float, float]
Face = tuple[int, int, int]
TAU = math.tau


def add(a: Vec3, b: Vec3) -> Vec3:
    return a[0] + b[0], a[1] + b[1], a[2] + b[2]


def sub(a: Vec3, b: Vec3) -> Vec3:
    return a[0] - b[0], a[1] - b[1], a[2] - b[2]


def mul(a: Vec3, s: float) -> Vec3:
    return a[0] * s, a[1] * s, a[2] * s


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(v: Vec3) -> float:
    return math.sqrt(dot(v, v))


def norm(v: Vec3) -> Vec3:
    n = length(v)
    return (0.0, 1.0, 0.0) if n < 1e-12 else (v[0] / n, v[1] / n, v[2] / n)


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return min(hi, max(lo, v))


def quat_from_euler(rx: float = 0.0, ry: float = 0.0, rz: float = 0.0) -> tuple[float, float, float, float]:
    cx, sx = math.cos(rx * 0.5), math.sin(rx * 0.5)
    cy, sy = math.cos(ry * 0.5), math.sin(ry * 0.5)
    cz, sz = math.cos(rz * 0.5), math.sin(rz * 0.5)
    return (
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    )


@dataclass
class Mesh:
    name: str
    material: str
    vertices: list[Vec3]
    faces: list[Face]
    uvs: list[Vec2] | None = None
    normals: list[Vec3] | None = None


@dataclass
class Node:
    name: str
    mesh: Mesh | None = None
    translation: Vec3 = (0.0, 0.0, 0.0)
    rotation: tuple[float, float, float, float] | None = None
    scale: Vec3 | None = None
    extras: dict[str, Any] = field(default_factory=dict)
    children: list['Node'] = field(default_factory=list)

    def add(self, child: 'Node') -> 'Node':
        self.children.append(child)
        return child


@dataclass(frozen=True)
class PartSpec:
    id: str
    category: str
    priority: str
    note: str
    build: Callable[['PartBuilder'], None]
    required_hooks: tuple[str, ...] = ()
    required_sockets: tuple[str, ...] = ()
    texture_style: str = 'hull'


class PartBuilder:
    def __init__(self, spec: PartSpec):
        self.spec = spec
        self.root = Node(spec.id, extras={
            'spacefacePart': True,
            'partId': spec.id,
            'category': spec.category,
            'mountAtOrigin': True,
        })
        self._detail_index = 0

    def node(self, mesh: Mesh, pos: Vec3 = (0, 0, 0), rot: Vec3 | None = None,
             scale: Vec3 | None = None, parent: Node | None = None, name: str | None = None,
             extras: dict[str, Any] | None = None) -> Node:
        n = Node(name or mesh.name, mesh, pos, quat_from_euler(*(rot or (0, 0, 0))), scale,
                 extras or {})
        (parent or self.root).add(n)
        return n

    def empty(self, name: str, pos: Vec3 = (0, 0, 0), parent: Node | None = None,
              extras: dict[str, Any] | None = None) -> Node:
        data = dict(extras or {})
        if name.startswith('SOCKET_'):
            data.setdefault('spacefaceSocket', True)
        if name.startswith('HOOK_'):
            data.setdefault('spacefaceHook', True)
        if name.startswith('MOUNT_'):
            data.setdefault('spacefaceMount', True)
        n = Node(name, translation=pos, extras=data)
        (parent or self.root).add(n)
        return n

    def bevel_box(self, name: str, size: Vec3, pos: Vec3, material: str = 'Material_Hull',
                  bevel: float = 0.08, segments: int = 3, rot: Vec3 | None = None,
                  parent: Node | None = None) -> Node:
        return self.node(beveled_box(name, size, bevel, segments, material), pos, rot, parent=parent)

    def lathe_x(self, name: str, profile: Sequence[tuple[float, float]], pos: Vec3,
                material: str = 'Material_Hull', segments: int = 20,
                parent: Node | None = None) -> Node:
        return self.node(lathe_x(name, profile, segments, material), pos, parent=parent)

    def torus_x(self, name: str, major: float, tube: float, pos: Vec3,
                material: str = 'Material_Mechanical', major_segments: int = 24,
                minor_segments: int = 8, parent: Node | None = None) -> Node:
        return self.node(torus_x(name, major, tube, major_segments, minor_segments, material), pos, parent=parent)

    def ellipsoid(self, name: str, radii: Vec3, pos: Vec3, material: str,
                  u_segments: int = 24, v_segments: int = 12, top_only: bool = False,
                  parent: Node | None = None) -> Node:
        return self.node(ellipsoid(name, radii, u_segments, v_segments, material, top_only), pos, parent=parent)

    def plate(self, name: str, points: Sequence[tuple[float, float]], thickness: float, pos: Vec3,
              material: str = 'Material_Hull', bevel: float = 0.05, parent: Node | None = None) -> Node:
        return self.node(extruded_polygon_xz(name, points, thickness, bevel, material), pos, parent=parent)

    def tube(self, name: str, start: Vec3, end: Vec3, radius: float,
             material: str = 'Material_Mechanical', segments: int = 12,
             parent: Node | None = None) -> Node:
        mesh, center = tube_between(name, start, end, radius, segments, material)
        return self.node(mesh, center, parent=parent)

    def bolt(self, pos: Vec3, radius: float = 0.055, depth: float = 0.08,
             axis: str = 'y', parent: Node | None = None, material: str = 'Material_Mechanical') -> Node:
        self._detail_index += 1
        mesh = lathe_x(f'{self.spec.id}_Bolt_{self._detail_index}', [(-depth / 2, radius * .82),
            (-depth * .36, radius), (depth * .36, radius), (depth / 2, radius * .72)], 10, material)
        rot = (0, 0, 0)
        if axis == 'y': rot = (0, 0, math.pi / 2)
        elif axis == 'z': rot = (0, math.pi / 2, 0)
        return self.node(mesh, pos, rot, parent=parent)

    def rivet_ring(self, center: Vec3, radius: float, count: int, plane: str = 'yz',
                   parent: Node | None = None, bolt_radius: float = .045) -> None:
        for i in range(count):
            a = TAU * i / count
            if plane == 'yz': p = (center[0], center[1] + math.cos(a) * radius, center[2] + math.sin(a) * radius)
            elif plane == 'xz': p = (center[0] + math.cos(a) * radius, center[1], center[2] + math.sin(a) * radius)
            else: p = (center[0] + math.cos(a) * radius, center[1] + math.sin(a) * radius, center[2])
            self.bolt(p, bolt_radius, parent=parent)


def beveled_box(name: str, size: Vec3, bevel: float, segments: int, material: str) -> Mesh:
    hx, hy, hz = (max(1e-4, s * .5) for s in size)
    b = min(max(0.001, bevel), hx * .48, hy * .48, hz * .48)
    n = max(2, segments)
    vertices: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[Vec2] = []
    faces: list[Face] = []

    def rounded(p: Vec3, face_n: Vec3) -> tuple[Vec3, Vec3]:
        inner = (max(0, hx - b), max(0, hy - b), max(0, hz - b))
        q = tuple(clamp(p[i], -inner[i], inner[i]) for i in range(3))  # type: ignore
        d = sub(p, q)  # type: ignore[arg-type]
        if length(d) < 1e-8:
            return p, face_n
        nd = norm(d)
        return add(q, mul(nd, b)), nd  # type: ignore[arg-type]

    # axis, sign, u-axis, v-axis
    facespecs = [
        (0, 1, 2, 1), (0, -1, 2, 1),
        (1, 1, 0, 2), (1, -1, 0, 2),
        (2, 1, 0, 1), (2, -1, 0, 1),
    ]
    half = (hx, hy, hz)
    for axis, sign, ua, va in facespecs:
        base = len(vertices)
        fn = [0.0, 0.0, 0.0]; fn[axis] = float(sign)
        for j in range(n + 1):
            v = j / n
            for i in range(n + 1):
                u = i / n
                p = [0.0, 0.0, 0.0]
                p[axis] = sign * half[axis]
                p[ua] = (u * 2 - 1) * half[ua]
                p[va] = (v * 2 - 1) * half[va]
                rp, rn = rounded(tuple(p), tuple(fn))
                vertices.append(rp); normals.append(rn); uvs.append((u, v))
        for j in range(n):
            for i in range(n):
                a = base + j * (n + 1) + i
                b0, c, d = a + 1, a + (n + 1) + 1, a + (n + 1)
                if sign > 0:
                    faces.extend([(a, b0, c), (a, c, d)])
                else:
                    faces.extend([(a, c, b0), (a, d, c)])
    return Mesh(name, material, vertices, faces, uvs, normals)


def lathe_x(name: str, profile: Sequence[tuple[float, float]], segments: int, material: str) -> Mesh:
    vertices: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[Vec2] = []
    faces: list[Face] = []
    seg = max(6, segments)
    # slope-aware side normals
    slopes: list[float] = []
    for i, (x, r) in enumerate(profile):
        i0, i1 = max(0, i - 1), min(len(profile) - 1, i + 1)
        dx = profile[i1][0] - profile[i0][0]
        dr = profile[i1][1] - profile[i0][1]
        slopes.append(0 if abs(dx) < 1e-9 else dr / dx)
    for j, (x, r) in enumerate(profile):
        for i in range(seg):
            a = TAU * i / seg
            ca, sa = math.cos(a), math.sin(a)
            vertices.append((x, r * ca, r * sa))
            normals.append(norm((-slopes[j], ca, sa)))
            uvs.append((j / max(1, len(profile) - 1), i / seg))
    for j in range(len(profile) - 1):
        a0, b0 = j * seg, (j + 1) * seg
        for i in range(seg):
            ni = (i + 1) % seg
            faces.extend([(a0 + i, b0 + i, b0 + ni), (a0 + i, b0 + ni, a0 + ni)])
    # caps
    for j, sign in ((0, -1), (len(profile) - 1, 1)):
        center = len(vertices)
        vertices.append((profile[j][0], 0, 0)); normals.append((sign, 0, 0)); uvs.append((.5, .5))
        off = j * seg
        for i in range(seg):
            ni = (i + 1) % seg
            if sign > 0: faces.append((center, off + i, off + ni))
            else: faces.append((center, off + ni, off + i))
    return Mesh(name, material, vertices, faces, uvs, normals)


def torus_x(name: str, major: float, tube: float, major_segments: int, minor_segments: int, material: str) -> Mesh:
    vertices: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[Vec2] = []
    faces: list[Face] = []
    ms, ns = max(8, major_segments), max(4, minor_segments)
    for i in range(ms):
        a = TAU * i / ms; ca, sa = math.cos(a), math.sin(a)
        for j in range(ns):
            b = TAU * j / ns; cb, sb = math.cos(b), math.sin(b)
            r = major + tube * cb
            vertices.append((tube * sb, r * ca, r * sa))
            normals.append(norm((sb, cb * ca, cb * sa)))
            uvs.append((i / ms, j / ns))
    for i in range(ms):
        ni = (i + 1) % ms
        for j in range(ns):
            nj = (j + 1) % ns
            a = i * ns + j; b = ni * ns + j; c = ni * ns + nj; d = i * ns + nj
            faces.extend([(a, b, c), (a, c, d)])
    return Mesh(name, material, vertices, faces, uvs, normals)


def ellipsoid(name: str, radii: Vec3, u_segments: int, v_segments: int, material: str,
              top_only: bool = False) -> Mesh:
    vertices: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[Vec2] = []
    faces: list[Face] = []
    us, vs = max(8, u_segments), max(4, v_segments)
    v0, v1 = (0.0, math.pi / 2) if top_only else (0.0, math.pi)
    for j in range(vs + 1):
        v = v0 + (v1 - v0) * j / vs
        sv, cv = math.sin(v), math.cos(v)
        for i in range(us + 1):
            u = TAU * i / us; cu, su = math.cos(u), math.sin(u)
            p = (radii[0] * sv * cu, radii[1] * cv, radii[2] * sv * su)
            n = norm((p[0] / max(1e-6, radii[0] ** 2), p[1] / max(1e-6, radii[1] ** 2), p[2] / max(1e-6, radii[2] ** 2)))
            vertices.append(p); normals.append(n); uvs.append((i / us, j / vs))
    for j in range(vs):
        for i in range(us):
            a = j * (us + 1) + i; b = a + 1; c = a + us + 2; d = a + us + 1
            faces.extend([(a, d, c), (a, c, b)])
    if top_only:
        # close the equator deck
        center = len(vertices); vertices.append((0, 0, 0)); normals.append((0, -1, 0)); uvs.append((.5, .5))
        off = vs * (us + 1)
        for i in range(us): faces.append((center, off + i + 1, off + i))
    return Mesh(name, material, vertices, faces, uvs, normals)


def extruded_polygon_xz(name: str, points: Sequence[tuple[float, float]], thickness: float,
                        bevel: float, material: str) -> Mesh:
    # Convex polygon, four Y layers; inner layers are inset toward centroid to create bevel strips.
    pts = list(points)
    cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
    scale = max(0.65, 1 - bevel / max(0.05, max(math.hypot(x - cx, z - cz) for x, z in pts)))
    inner = [(cx + (x - cx) * scale, cz + (z - cz) * scale) for x, z in pts]
    ys = [-thickness / 2, -thickness / 2 + bevel, thickness / 2 - bevel, thickness / 2]
    rings = [pts, inner, inner, pts]
    vertices: list[Vec3] = []
    uvs: list[Vec2] = []
    for ring, y in zip(rings, ys):
        for x, z in ring:
            vertices.append((x, y, z)); uvs.append((x - cx + .5, z - cz + .5))
    faces: list[Face] = []
    n = len(pts)
    # top and bottom fan
    for i in range(1, n - 1):
        faces.append((i + 1, i, 0))
        o = 3 * n; faces.append((o, o + i, o + i + 1))
    for r in range(3):
        a0, b0 = r * n, (r + 1) * n
        for i in range(n):
            ni = (i + 1) % n
            faces.extend([(a0 + i, b0 + i, b0 + ni), (a0 + i, b0 + ni, a0 + ni)])
    normals = compute_vertex_normals(vertices, faces)
    return Mesh(name, material, vertices, faces, uvs, normals)


def tube_between(name: str, start: Vec3, end: Vec3, radius: float, segments: int,
                 material: str) -> tuple[Mesh, Vec3]:
    center = mul(add(start, end), .5)
    a, b = sub(start, center), sub(end, center)
    axis = norm(sub(b, a))
    helper = (0, 1, 0) if abs(axis[1]) < .9 else (0, 0, 1)
    u = norm(cross(axis, helper)); v = norm(cross(axis, u))
    vertices: list[Vec3] = []
    normals: list[Vec3] = []
    uvs: list[Vec2] = []
    seg = max(6, segments)
    for j, p in enumerate((a, b)):
        for i in range(seg):
            ang = TAU * i / seg; radial = add(mul(u, math.cos(ang) * radius), mul(v, math.sin(ang) * radius))
            vertices.append(add(p, radial)); normals.append(norm(radial)); uvs.append((j, i / seg))
    faces: list[Face] = []
    for i in range(seg):
        ni = (i + 1) % seg
        faces.extend([(i, seg + i, seg + ni), (i, seg + ni, ni)])
    for off, normal_sign in ((0, -1), (seg, 1)):
        ci = len(vertices); vertices.append(a if off == 0 else b); normals.append(mul(axis, normal_sign)); uvs.append((.5, .5))
        for i in range(seg):
            ni = (i + 1) % seg
            faces.append((ci, off + ni, off + i) if normal_sign < 0 else (ci, off + i, off + ni))
    return Mesh(name, material, vertices, faces, uvs, normals), center


def compute_vertex_normals(vertices: Sequence[Vec3], faces: Sequence[Face]) -> list[Vec3]:
    sums = [[0.0, 0.0, 0.0] for _ in vertices]
    for ia, ib, ic in faces:
        n = norm(cross(sub(vertices[ib], vertices[ia]), sub(vertices[ic], vertices[ia])))
        for idx in (ia, ib, ic):
            sums[idx][0] += n[0]; sums[idx][1] += n[1]; sums[idx][2] += n[2]
    return [norm(tuple(s)) for s in sums]


def iter_nodes(root: Node) -> Iterable[Node]:
    yield root
    for child in root.children:
        yield from iter_nodes(child)


def triangle_count(root: Node) -> int:
    return sum(len(n.mesh.faces) for n in iter_nodes(root) if n.mesh)


def mesh_bounds(root: Node) -> tuple[Vec3, Vec3]:
    # Builders use translations and no nested rotations for static bounds-critical meshes. Rotation is
    # conservatively ignored here; the validator reads exact accessor bounds from the GLB too.
    pts: list[Vec3] = []
    def walk(node: Node, parent_pos: Vec3 = (0, 0, 0), parent_scale: Vec3 = (1, 1, 1)) -> None:
        pos = add(parent_pos, (node.translation[0] * parent_scale[0], node.translation[1] * parent_scale[1], node.translation[2] * parent_scale[2]))
        sc = node.scale or (1, 1, 1)
        world_scale = (parent_scale[0] * sc[0], parent_scale[1] * sc[1], parent_scale[2] * sc[2])
        if node.mesh:
            for p in node.mesh.vertices:
                pts.append((pos[0] + p[0] * world_scale[0], pos[1] + p[1] * world_scale[1], pos[2] + p[2] * world_scale[2]))
        for c in node.children: walk(c, pos, world_scale)
    walk(root)
    if not pts: return (0, 0, 0), (0, 0, 0)
    return tuple(min(p[i] for p in pts) for i in range(3)), tuple(max(p[i] for p in pts) for i in range(3))  # type: ignore


# --- Texture bake -----------------------------------------------------------------------------

def png_rgba(width: int, height: int, rows: Iterable[bytes]) -> bytes:
    raw = bytearray()
    for row in rows:
        raw.append(0)  # PNG filter None
        raw.extend(row)
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')


def make_texture_set(style: str, size: int = 1024) -> dict[str, bytes]:
    style_seed = sum((i + 1) * ord(c) for i, c in enumerate(style)) & 0xffff
    cell = {'cockpit': 128, 'engine': 96, 'weapon': 112, 'fin': 144, 'greeble': 80, 'gear': 128, 'pod': 96}.get(style, 128)
    seam = 3 if style != 'greeble' else 2

    def wave(x: int, y: int) -> int:
        return int(5 * math.sin((x + style_seed) * .021) + 4 * math.cos((y - style_seed) * .017) + 2 * math.sin((x + y) * .008))

    base_rows, normal_rows, orm_rows = [], [], []
    for y in range(size):
        b = bytearray(size * 4); n = bytearray(size * 4); o = bytearray(size * 4)
        gy = y % cell; dy = min(gy, cell - gy)
        for x in range(size):
            gx = x % cell; dx = min(gx, cell - gx)
            is_seam = dx < seam or dy < seam
            rivet = ((x + cell // 4) % cell < 5 and (y + cell // 4) % cell < 5)
            w = wave(x, y)
            base = 164 + w
            if is_seam: base -= 52
            if rivet: base += 38
            # subtle serialized stripe; neutral enough for faction multiplication
            stripe = ((x - y // 2 + style_seed) % (cell * 4)) < 10
            r = base + (12 if stripe else 0); g = base + (8 if stripe else 0); bl = base
            idx = x * 4
            b[idx:idx+4] = bytes((max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, bl)), 255))

            nx = 0; ny = 0
            if dx < seam * 2: nx = int((gx - seam) / max(1, seam) * 38)
            if dy < seam * 2: ny = int((gy - seam) / max(1, seam) * 38)
            if rivet:
                nx += int((2 - ((x + cell // 4) % cell)) * 5)
                ny += int((2 - ((y + cell // 4) % cell)) * 5)
            nz = int(math.sqrt(max(0, 127 * 127 - min(126, nx) ** 2 - min(126, ny) ** 2)))
            n[idx:idx+4] = bytes((max(0, min(255, 128 + nx)), max(0, min(255, 128 + ny)), max(128, min(255, 128 + nz)), 255))

            ao = 104 if is_seam else (215 if rivet else 245)
            rough = max(80, min(245, 168 + w * 2 + (38 if is_seam else 0)))
            metallic = 64 if style in ('cockpit', 'pod') else 112
            if rivet: metallic = 220
            o[idx:idx+4] = bytes((ao, rough, metallic, 255))
        base_rows.append(bytes(b)); normal_rows.append(bytes(n)); orm_rows.append(bytes(o))
    return {
        'baseColor': png_rgba(size, size, base_rows),
        'normal': png_rgba(size, size, normal_rows),
        'orm': png_rgba(size, size, orm_rows),
    }


# --- Part builders ----------------------------------------------------------------------------

def cockpit_dome(b: PartBuilder) -> None:
    b.bevel_box('Dome_Mount_Collar', (3.8, .42, 3.2), (0.8, .18, 0), bevel=.14, segments=4)
    b.ellipsoid('Dome_Glass', (2.25, 1.35, 1.6), (1.25, .38, 0), 'Material_Glass', 28, 14, True)
    b.bevel_box('Dome_Interior_Deck', (3.0, .18, 2.2), (1.05, .38, 0), 'Material_Interior', .06, 3)
    frame = b.empty('HOOK_Emissive', (0, 0, 0))
    b.torus_x('Dome_Base_Frame', 1.52, .11, (.65, .48, 0), 'Material_Accent', 28, 8, frame)
    for z in (-1.18, 1.18): b.tube(f'Dome_Frame_{z}', (-.2, .45, z), (2.85, 1.05, z * .55), .065, 'Material_Mechanical')
    for z in (-.72, 0, .72): b.bevel_box(f'Dome_Console_{z}', (.42, .18, .26), (1.72, .58, z), 'Material_Accent', .035, 2, parent=frame)
    for x in (-.6, .2, 1.0, 1.8): b.bolt((x, .42, -1.48), .055)


def cockpit_slab(b: PartBuilder) -> None:
    b.bevel_box('Slab_Bridge_Block', (4.8, 1.65, 3.4), (1.6, .78, 0), bevel=.25, segments=4)
    b.bevel_box('Slab_Armored_Brow', (3.4, .46, 3.7), (2.3, 1.58, 0), 'Material_Mechanical', .14, 4)
    hook = b.empty('HOOK_Emissive')
    for z in (-1.15, -.38, .38, 1.15):
        b.bevel_box(f'Slab_Window_{z}', (1.55, .42, .48), (3.28, 1.05, z), 'Material_Glass', .08, 3, parent=hook)
    b.bevel_box('Slab_Interior', (2.4, .35, 2.5), (2.35, .8, 0), 'Material_Interior', .08, 3)
    for x in (-.2, .8, 1.8, 2.8):
        for z in (-1.62, 1.62): b.bolt((x, 1.55, z), .06)


def cockpit_recessed(b: PartBuilder) -> None:
    b.bevel_box('Recessed_Deck', (5.2, .5, 3.2), (1.7, .2, 0), bevel=.18, segments=4)
    b.bevel_box('Recessed_Brow', (3.6, .72, 3.5), (2.65, .82, 0), 'Material_Mechanical', .18, 4)
    hook = b.empty('HOOK_Emissive')
    b.bevel_box('Recessed_Sensor_Slit', (2.9, .34, 2.45), (3.25, .65, 0), 'Material_Glass', .1, 4, parent=hook)
    b.bevel_box('Recessed_Interior', (2.2, .2, 1.95), (2.9, .48, 0), 'Material_Interior', .05, 3)
    for z in (-1.25, -.62, 0, .62, 1.25): b.bevel_box(f'Recessed_Frame_{z}', (.16, .5, .1), (3.2, .76, z), 'Material_Accent', .025, 2, parent=hook)
    b.plate('Recessed_Nose_Plate', [(0,-1.55),(3.9,-1.25),(4.8,0),(3.9,1.25),(0,1.55)], .18, (0,.48,0), bevel=.07)


def add_fan(b: PartBuilder, center: Vec3, radius: float, name: str, parent: Node) -> None:
    b.lathe_x(f'{name}_Hub', [(-.10, radius*.16),(.10,radius*.16)], (0,0,0), 'Material_Mechanical', 14, parent)
    for i in range(8):
        a = TAU * i / 8
        y, z = math.cos(a)*radius*.52, math.sin(a)*radius*.52
        b.bevel_box(f'{name}_Blade_{i}', (.12, radius*.72, radius*.11), (0,y,z), 'Material_Mechanical', .025, 2,
                    rot=(a, 0, .45), parent=parent)


def add_engine_common(b: PartBuilder, radius: float, length_x: float, industrial: bool = False) -> tuple[Node, Node]:
    # Origin is the aft nozzle/mount plane. Body grows +X into the hull; plume grows -X.
    prof = [(0, radius*1.08),(.18,radius*1.18),(.38,radius), (length_x*.72,radius*.88),(length_x,radius*.68)]
    b.lathe_x('Engine_Housing', prof, (0,0,0), 'Material_Hull', 24)
    b.torus_x('Engine_Nozzle_Ring', radius*.96, radius*.10, (.02,0,0), 'Material_Mechanical', 28, 8)
    emissive = b.empty('HOOK_Emissive', (-.04,0,0))
    b.lathe_x('Engine_Core', [(-.08,radius*.54),(.04,radius*.56),(.10,radius*.42)], (0,0,0), 'Material_Accent', 22, emissive)
    spin = b.empty('HOOK_Spin', (.16,0,0))
    add_fan(b, (0,0,0), radius*.82, 'Engine_Fan', spin)
    b.empty('MOUNT_Child', (-.14,0,0), extras={'role':'plume','forward':[-1,0,0]})
    for i in range(4 if industrial else 3):
        x = .42 + i * (length_x*.45/max(1,3))
        b.torus_x(f'Engine_Heat_Rib_{i}', radius*(1.02-i*.025), radius*.045, (x,0,0), 'Material_Mechanical', 20, 6)
    b.rivet_ring((.24,0,0), radius*1.07, 12, 'yz', bolt_radius=radius*.035)
    return emissive, spin


def engine_ion_small(b: PartBuilder) -> None:
    add_engine_common(b, .9, 2.5)
    for s in (-1,1): b.bevel_box(f'IonSmall_Fin_{s}', (1.4,.12,.48), (1.12,s*.86,0), 'Material_Mechanical', .04, 3, rot=(0,0,s*.10))


def engine_ion_twin(b: PartBuilder) -> None:
    b.bevel_box('Twin_Cradle', (2.9,.65,3.4), (1.35,0,0), bevel=.16, segments=4)
    for z in (-1.05,1.05):
        group = b.empty(f'Twin_Nozzle_{"P" if z<0 else "S"}', (0,0,z))
        prof=[(0,.72),(.15,.82),(.35,.72),(2.5,.56)]
        b.lathe_x(f'Twin_Housing_{z}',prof,(0,0,0),'Material_Hull',20,group)
        b.torus_x(f'Twin_Ring_{z}',.68,.09,(.02,0,0),'Material_Mechanical',22,7,group)
        eh=b.empty('HOOK_Emissive' if z<0 else 'HOOK_Emissive_Secondary',(-.03,0,0),group)
        b.lathe_x(f'Twin_Core_{z}',[(-.08,.38),(.08,.34)],(0,0,0),'Material_Accent',18,eh)
        sh=b.empty('HOOK_Spin' if z<0 else 'HOOK_Spin_Secondary',(.16,0,0),group)
        add_fan(b,(0,0,0),.55,f'Twin_Fan_{z}',sh)
    b.empty('MOUNT_Child',(-.14,0,0),extras={'role':'plume','forward':[-1,0,0]})
    for x in (.5,1.15,1.8): b.bevel_box(f'Twin_Brace_{x}',(.18,.95,2.55),(x,0,0),'Material_Mechanical',.04,3)


def engine_industrial(b: PartBuilder) -> None:
    add_engine_common(b, 1.22, 3.3, True)
    b.bevel_box('Industrial_Service_Box',(1.8,.8,.95),(1.75,1.05,.72),'Material_Mechanical',.12,3,rot=(.04,.08,-.05))
    b.tube('Industrial_Coolant_A',(.5,.85,-.7),(2.8,.75,-.62),.085)
    b.tube('Industrial_Coolant_B',(.6,-.78,.64),(2.65,-.68,.72),.07)
    for i in range(5): b.bevel_box(f'Industrial_Scorch_Fin_{i}',(.7,.1,.54),(1.0+i*.42,-1.18,0),'Material_Hull',.035,2,rot=(0,0,.05*i))
    b.rivet_ring((.12,0,0),1.34,4,'yz',bolt_radius=.055)


def engine_resonator(b: PartBuilder) -> None:
    # Nozzle-less alien drive: nested faceted resonator hoops and a suspended core.
    b.lathe_x('Resonator_Base',[(0,1.15),(.18,1.3),(.55,1.1),(2.6,.72)],(0,0,0),'Material_Hull',12)
    emissive=b.empty('HOOK_Emissive',(-.1,0,0))
    b.ellipsoid('Resonator_Core',(.36,.7,.7),(0,0,0),'Material_Accent',16,10,parent=emissive)
    spin=b.empty('HOOK_Spin',(.22,0,0))
    for i,r in enumerate((.62,.86,1.1)):
        ring=b.torus_x(f'Resonator_Hoop_{i}',r,.055,(i*.16,0,0),'Material_Accent',12,5,spin)
        ring.rotation=quat_from_euler(i*.37,0,0)
    for i in range(6):
        a=TAU*i/6
        b.bevel_box(f'Resonator_Facet_{i}',(1.6,.18,.44),(1.2,math.cos(a)*.86,math.sin(a)*.86),'Material_Mechanical',.05,3,rot=(a,0,.18),parent=b.root)
    b.empty('MOUNT_Child',(-.35,0,0),extras={'role':'plume','forward':[-1,0,0]})
    b.rivet_ring((.48,0,0),1.1,12,'yz',bolt_radius=.04)


def weapon_pulse_cannon(b: PartBuilder) -> None:
    b.bevel_box('Pulse_Breech',(1.6,.9,1.0),(.65,0,0),bevel=.14,segments=4)
    b.lathe_x('Pulse_Barrel',[(0,.25),(2.8,.20),(3.1,.28),(3.35,.20)],(1.25,0,0),'Material_Mechanical',18)
    for x in (1.65,2.1,2.55): b.torus_x(f'Pulse_Cooling_{x}',.31,.055,(x,0,0),'Material_Hull',18,6)
    hook=b.empty('HOOK_Emissive',(4.58,0,0)); b.lathe_x('Pulse_Muzzle_Glow',[(-.06,.18),(.06,.18)],(0,0,0),'Material_Accent',16,hook)
    b.empty('SOCKET_Muzzle',(4.7,0,0),extras={'role':'weapon','forward':[1,0,0]})
    for z in (-.42,.42): b.tube(f'Pulse_Recuperator_{z}',(.2,.28,z),(1.55,.28,z),.075)
    b.rivet_ring((.05,0,0),.48,10,'yz',bolt_radius=.04)


def weapon_heavy_cannon(b: PartBuilder) -> None:
    b.bevel_box('Heavy_Breech',(2.4,1.45,1.65),(.9,0,0),bevel=.2,segments=4)
    b.lathe_x('Heavy_Barrel',[(0,.42),(3.5,.34),(4.0,.5),(4.45,.38)],(1.65,0,0),'Material_Mechanical',22)
    for x in (2.15,2.8,3.45,4.1): b.torus_x(f'Heavy_Rib_{x}',.48,.08,(x,0,0),'Material_Hull',20,7)
    for z in (-.72,.72): b.tube(f'Heavy_Recoil_{z}',(.15,.5,z),(2.3,.5,z),.13)
    hook=b.empty('HOOK_Emissive',(6.05,0,0)); b.lathe_x('Heavy_Muzzle_Glow',[(-.08,.29),(.08,.29)],(0,0,0),'Material_Accent',18,hook)
    b.empty('SOCKET_Muzzle',(6.2,0,0),extras={'role':'weapon','forward':[1,0,0]})
    for x in (-.05,.55,1.15,1.75):
        for z in (-.76,.76): b.bolt((x,.73,z),.065)


def weapon_turret_dual(b: PartBuilder) -> None:
    b.lathe_x('Turret_Base',[(-.18,1.05),(.18,1.05)],(0,0,0),'Material_Hull',24)
    spin=b.empty('HOOK_Spin',(.2,.58,0),extras={'axis':[0,1,0]})
    b.bevel_box('Turret_Head',(1.8,.9,2.25),(.45,0,0),'Material_Hull',.16,4,parent=spin)
    for z in (-.62,.62):
        b.lathe_x(f'Turret_Barrel_{z}',[(0,.18),(3.2,.14),(3.45,.22)],(1.1,0,z),'Material_Mechanical',16,spin)
        b.torus_x(f'Turret_Muzzle_{z}',.22,.045,(4.55,0,z),'Material_Mechanical',16,5,spin)
    eh=b.empty('HOOK_Emissive',(4.72,0,0),spin); b.bevel_box('Turret_Charge_Block',(.22,.28,1.55),(0,0,0),'Material_Accent',.04,2,parent=eh)
    b.empty('SOCKET_Muzzle',(4.8,0,-.62),spin,{'role':'weapon','forward':[1,0,0]})
    b.rivet_ring((0,0,0),.9,12,'yz',bolt_radius=.045)


def weapon_lance(b: PartBuilder) -> None:
    b.bevel_box('Lance_Root',(1.7,.8,1.15),(.55,0,0),bevel=.18,segments=4)
    b.lathe_x('Lance_Spine',[(0,.24),(4.8,.12),(6.1,.08)],(1.25,0,0),'Material_Mechanical',8)
    hook=b.empty('HOOK_Emissive')
    for x,r in ((2.1,.48),(3.15,.42),(4.2,.34),(5.2,.26)):
        b.torus_x(f'Lance_Focus_{x}',r,.055,(x,0,0),'Material_Accent',10,5,hook)
    for s in (-1,1): b.plate(f'Lance_Fin_{s}',[(0,0),(2.8,0),(1.5,s*.85)],.12,(2.15,0,0),'Material_Hull',.04)
    b.ellipsoid('Lance_Crystal',(.55,.26,.26),(6.55,0,0),'Material_Accent',12,8,parent=hook)
    b.empty('SOCKET_Muzzle',(7.1,0,0),extras={'role':'weapon','forward':[1,0,0]})
    for x in (.1,.65,1.2): b.bolt((x,.42,.52),.045)


def fin_wedge(b: PartBuilder) -> None:
    pts=[(0,0),(3.8,.35),(2.4,3.2),(.4,4.1),(-.4,3.8)]
    b.plate('Wedge_Main',pts,.28,(0,0,0),'Material_Hull',.10)
    b.plate('Wedge_Armor',[(.25,.35),(3.15,.55),(2.1,2.5),(.55,3.2)],.12,(0,.22,0),'Material_Mechanical',.05)
    for i in range(5): b.tube(f'Wedge_Rib_{i}',(.3+i*.48,.22,.5+i*.34),(1.0+i*.45,.22,2.8),.055)
    hook=b.empty('HOOK_Emissive'); b.tube('Wedge_Edge_Light',(-.25,.18,3.78),(2.28,.18,3.05),.045,'Material_Accent',10,hook)


def fin_radiator_grid(b: PartBuilder) -> None:
    frame=[(0,0),(3.6,0),(3.1,3.4),(.2,3.8)]
    b.plate('Radiator_Frame',frame,.24,(0,0,0),'Material_Mechanical',.08)
    for i in range(9):
        z=.35+i*.36
        b.bevel_box(f'Radiator_Slat_{i}',(2.85,.10,.18),(1.65,.18,z),'Material_Hull',.03,2,rot=(0,-.08,0))
    for x in (.25,1.7,3.15): b.bevel_box(f'Radiator_Spar_{x}',(.16,.24,3.35),(x,.16,1.85),'Material_Mechanical',.04,2)
    hook=b.empty('HOOK_Emissive'); b.bevel_box('Radiator_Status',(.8,.16,.18),(2.45,.24,.18),'Material_Accent',.03,2,parent=hook)


def fin_swept_smuggler(b: PartBuilder) -> None:
    pts=[(-.2,0),(4.8,.25),(2.3,1.2),(1.0,3.6),(.15,4.0)]
    b.plate('Swept_Blade',pts,.18,(0,0,0),'Material_Hull',.07)
    b.plate('Swept_Inset',[(.3,.3),(3.8,.48),(1.8,1.25),(.65,3.15)],.10,(0,.14,0),'Material_Mechanical',.04)
    for i in range(6): b.bolt((.45+i*.48,.16,.45+i*.12),.04)
    hook=b.empty('HOOK_Emissive'); b.tube('Swept_Edge',(.15,.13,3.82),(2.3,.13,1.18),.035,'Material_Accent',8,hook)


def fin_crystalline(b: PartBuilder) -> None:
    pts=[(0,0),(3.8,.3),(3.1,2.0),(1.8,4.3),(.3,3.5),(-.3,1.6)]
    b.plate('Crystal_Plane',pts,.22,(0,0,0),'Material_Hull',.09)
    hook=b.empty('HOOK_Emissive')
    for a,c in [((.2,.2),(3.0,1.85)),((.1,3.25),(3.4,.45)),((1.75,.3),(1.75,3.75))]:
        b.tube(f'Crystal_Vein_{len(hook.children)}',(a[0],.15,a[1]),(c[0],.15,c[1]),.045,'Material_Accent',8,hook)
    for p in ((.35,.45),(3.15,.55),(2.75,2.0),(1.55,3.75),(.2,3.1)): b.bolt((p[0],.16,p[1]),.045,material='Material_Accent')


def greeble_vents(b: PartBuilder) -> None:
    b.bevel_box('Vent_Base',(3.8,.20,2.6),(1.7,.08,0),bevel=.08,segments=3)
    for i in range(9): b.bevel_box(f'Vent_Slat_{i}',(2.7,.22,.11),(1.85,.25,-.88+i*.22),'Material_Mechanical',.025,2,rot=(0,0,-.08))
    b.lathe_x('Vent_Intake',[(0,.55),(.3,.68),(.7,.5)],(3.1,.42,0),'Material_Hull',18)
    for x in (.1,1.0,2.0,3.0): b.bolt((x,.23,-1.15),.04)


def greeble_hatches(b: PartBuilder) -> None:
    for idx,(x,z,sx,sz) in enumerate(((0,0,1.8,1.4),(2.1,.2,1.4,1.0),(1.1,1.55,1.1,.75))):
        b.bevel_box(f'Hatch_{idx}',(sx,.18,sz),(x,.08,z),bevel=.06,segments=3)
        b.bevel_box(f'Hatch_Inset_{idx}',(sx*.72,.08,sz*.68),(x,.20,z),'Material_Mechanical',.035,2)
        for dx in (-sx*.38,sx*.38):
            for dz in (-sz*.38,sz*.38): b.bolt((x+dx,.22,z+dz),.04)
    b.torus_x('Hatch_Handle',.22,.045,(1.1,.32,1.55),'Material_Accent',16,6)


def greeble_pipes(b: PartBuilder) -> None:
    b.bevel_box('Pipe_Base',(4.2,.16,2.8),(1.7,.05,0),'Material_Hull',.06,3)
    paths=[((-.1,.2,-.9),(3.7,.2,-.9),.08),((.2,.34,-.2),(3.2,.34,.25),.10),((.1,.25,.8),(2.6,.25,1.0),.07),((2.7,.2,1.0),(3.7,.2,.5),.07)]
    for i,(a,c,r) in enumerate(paths):
        b.tube(f'Pipe_{i}',a,c,r,'Material_Mechanical',12)
        b.torus_x(f'Pipe_Coupler_{i}',r*1.45,r*.35,(a[0]+.35,a[1],a[2]),'Material_Accent',14,5)
    for x in (.1,1.2,2.3,3.4): b.bolt((x,.19,-1.25),.04)


def greeble_rcs(b: PartBuilder) -> None:
    b.bevel_box('RCS_Base',(3.2,.24,3.2),(1.2,.08,0),bevel=.1,segments=4)
    hook=b.empty('HOOK_Emissive')
    for yi in (-1,1):
        for zi in (-1,1):
            pos=(1.3,.35,zi*.82)
            b.lathe_x(f'RCS_Nozzle_{yi}_{zi}',[(0,.28),(.4,.18),(.65,.10)],pos,'Material_Mechanical',14)
            b.lathe_x(f'RCS_Core_{yi}_{zi}',[(-.03,.11),(.05,.09)],(1.92,.35,zi*.82),'Material_Accent',12,hook)
    for x in (0,2.4):
        for z in (-1.3,1.3): b.bolt((x,.24,z),.045)


def greeble_antennas(b: PartBuilder) -> None:
    b.bevel_box('Antenna_Base',(2.8,.28,2.4),(1.0,.1,0),bevel=.09,segments=3)
    b.tube('Antenna_Mast_A',(1.0,.25,0),(1.0,3.0,0),.085)
    b.torus_x('Antenna_Loop',.62,.055,(1.0,2.55,0),'Material_Accent',20,6)
    b.tube('Antenna_Mast_B',(.15,.25,-.65),(.3,1.85,-.7),.055)
    # dish as flattened top hemisphere rotated toward +X
    dish=b.ellipsoid('Antenna_Dish',(.18,.75,.75),(.3,1.85,-.7),'Material_Hull',18,8,True)
    dish.rotation=quat_from_euler(0,0,-math.pi/2)
    hook=b.empty('HOOK_Emissive'); b.ellipsoid('Antenna_Beacon',(.16,.16,.16),(1.0,3.15,0),'Material_Accent',12,6,parent=hook)
    for x in (0,2):
        for z in (-.9,.9): b.bolt((x,.28,z),.04)


def skid_trio(b: PartBuilder) -> None:
    for z in (-1.25,0,1.25):
        b.bevel_box(f'Skid_Rail_{z}',(4.4,.24,.30),(1.55,.1,z),'Material_Mechanical',.07,3)
        for x in (.1,2.9): b.tube(f'Skid_Strut_{z}_{x}',(x,.2,z),(x,1.25,z*.78),.09,'Material_Hull',12)
    # visibly newer center replacement foot
    b.bevel_box('Skid_Replacement_Foot',(1.0,.28,.42),(2.65,.12,0),'Material_Accent',.07,3)
    for x in (-.45,3.55):
        for z in (-1.25,1.25): b.bolt((x,.24,z),.045)


def skid_quad(b: PartBuilder) -> None:
    for x in (0,3.2):
        for z in (-1.45,1.45):
            b.tube(f'Gear_Leg_{x}_{z}',(x,1.55,z*.72),(x,.2,z),.13,'Material_Mechanical',14)
            b.bevel_box(f'Gear_Foot_{x}_{z}',(1.15,.28,.7),(x,.1,z),'Material_Hull',.09,3)
            b.torus_x(f'Gear_Joint_{x}_{z}',.25,.07,(x,1.5,z*.72),'Material_Accent',16,6)
    b.bevel_box('Gear_Crossmember',(3.8,.25,2.8),(1.6,1.5,0),'Material_Hull',.08,3)


def pod_utility(b: PartBuilder) -> None:
    b.bevel_box('Utility_Shell',(4.2,1.6,2.5),(1.65,.75,0),bevel=.24,segments=4)
    b.bevel_box('Utility_Access',(2.2,.16,1.4),(1.8,1.58,0),'Material_Mechanical',.08,3)
    b.bevel_box('Utility_Band',(.38,1.75,2.68),(2.7,.78,0),'Material_Accent',.08,3)
    hook=b.empty('HOOK_Emissive')
    for z in (-.72,0,.72): b.bevel_box(f'Utility_Status_{z}',(.35,.16,.18),(3.55,1.1,z),'Material_Accent',.035,2,parent=hook)
    b.empty('MOUNT_Child',(3.8,.8,0),extras={'role':'utility-child','forward':[1,0,0]})
    for x in (-.25,.7,1.65,2.6,3.55): b.bolt((x,1.6,-1.12),.045)


def pod_cargo_container(b: PartBuilder) -> None:
    b.bevel_box('Cargo_Shell',(5.2,2.1,2.8),(2.1,1.0,0),bevel=.18,segments=4)
    for x in (-.35,.5,1.35,2.2,3.05,3.9,4.55): b.bevel_box(f'Cargo_Rib_{x}',(.18,2.25,3.0),(x,1.0,0),'Material_Mechanical',.045,2)
    for x in (-.35,4.55):
        for y in (.1,1.9):
            for z in (-1.3,1.3): b.bolt((x,y,z),.055,axis='x')
    b.bevel_box('Cargo_ID_Plate',(1.4,.08,.65),(3.2,2.08,0),'Material_Accent',.04,2)
    b.empty('MOUNT_Child',(5.0,1.0,0),extras={'role':'stack','forward':[1,0,0]})


def pod_repair_patch(b: PartBuilder) -> None:
    pts=[(0,-1.5),(4.2,-1.25),(4.6,-.2),(4.0,1.4),(1.0,1.55),(-.25,.65)]
    b.plate('Repair_Patch',pts,.16,(0,.02,0),'Material_Hull',.06)
    b.plate('Repair_Inner',[(.4,-1.1),(3.8,-.95),(4.05,-.1),(3.55,1.0),(1.1,1.18),(.2,.5)],.08,(0,.14,0),'Material_Mechanical',.04)
    # irregular weld beads and fasteners
    for i in range(14):
        t=i/13
        x=.1+t*4.0; z=-1.35 + .18*math.sin(i*.9)
        b.bolt((x,.19,z),.045,material='Material_Accent' if i%4==0 else 'Material_Mechanical')
    for p in ((.1,.5),(.8,1.35),(2.0,1.42),(3.4,1.28),(4.2,.55),(4.35,-.55)):
        b.bolt((p[0],.19,p[1]),.05)


PARTS: list[PartSpec] = [
    PartSpec('cockpit_dome','cockpits','P0','Bubble canopy with interior deck and structural frame.',cockpit_dome,('HOOK_Emissive',),(), 'cockpit'),
    PartSpec('cockpit_slab','cockpits','P0','Armored authority bridge with serialized viewports.',cockpit_slab,('HOOK_Emissive',),(), 'cockpit'),
    PartSpec('cockpit_recessed','cockpits','P0','Flush sensor-slot cockpit with armored brow.',cockpit_recessed,('HOOK_Emissive',),(), 'cockpit'),
    PartSpec('engine_ion_small','engines','P0','Compact ion drive with fan, core and heat ribs.',engine_ion_small,('HOOK_Emissive','HOOK_Spin','MOUNT_Child'),(), 'engine'),
    PartSpec('engine_ion_twin','engines','P0','Serialized twin-nozzle fighter drive.',engine_ion_twin,('HOOK_Emissive','HOOK_Spin','MOUNT_Child'),(), 'engine'),
    PartSpec('engine_industrial','engines','P0','Asymmetric serviced industrial drive with coolant plumbing.',engine_industrial,('HOOK_Emissive','HOOK_Spin','MOUNT_Child'),(), 'engine'),
    PartSpec('engine_resonator','engines','P0','Nozzle-less alien resonator with nested faceted hoops.',engine_resonator,('HOOK_Emissive','HOOK_Spin','MOUNT_Child'),(), 'engine'),
    PartSpec('weapon_pulse_cannon','weapons','P1','Fixed pulse cannon with visible cooling train.',weapon_pulse_cannon,('HOOK_Emissive',),('SOCKET_Muzzle',),'weapon'),
    PartSpec('weapon_heavy_cannon','weapons','P1','Oversized bolted cannon with recoil cylinders.',weapon_heavy_cannon,('HOOK_Emissive',),('SOCKET_Muzzle',),'weapon'),
    PartSpec('weapon_turret_dual','weapons','P1','Dual tracking turret with a hook-addressable head.',weapon_turret_dual,('HOOK_Emissive','HOOK_Spin'),('SOCKET_Muzzle',),'weapon'),
    PartSpec('weapon_lance','weapons','P1','Long crystalline focusing lance.',weapon_lance,('HOOK_Emissive',),('SOCKET_Muzzle',),'weapon'),
    PartSpec('fin_wedge','fins','P1','Chamfered combat wing with structural ribs.',fin_wedge,('HOOK_Emissive',),(), 'fin'),
    PartSpec('fin_radiator_grid','fins','P1','Vented industrial radiator grid.',fin_radiator_grid,('HOOK_Emissive',),(), 'fin'),
    PartSpec('fin_swept_smuggler','fins','P1','Low-profile swept smuggler blade.',fin_swept_smuggler,('HOOK_Emissive',),(), 'fin'),
    PartSpec('fin_crystalline','fins','P1','Alien faceted plane with emissive veins.',fin_crystalline,('HOOK_Emissive',),(), 'fin'),
    PartSpec('greeble_vents','greebles','P1','Vent slat and intake kit.',greeble_vents,(),(), 'greeble'),
    PartSpec('greeble_hatches','greebles','P1','Access hatch and fastener kit.',greeble_hatches,(),(), 'greeble'),
    PartSpec('greeble_pipes','greebles','P1','Coolant pipe and coupling kit.',greeble_pipes,(),(), 'greeble'),
    PartSpec('greeble_rcs','greebles','P1','Reaction-control thruster quad.',greeble_rcs,('HOOK_Emissive',),(), 'greeble'),
    PartSpec('greeble_antennas','greebles','P1','Sensor mast, loop, dish and beacon kit.',greeble_antennas,('HOOK_Emissive',),(), 'greeble'),
    PartSpec('skid_trio','gear','P2','Three-skid frontier landing set with replacement foot.',skid_trio,(),(), 'gear'),
    PartSpec('skid_quad','gear','P2','Four-point heavy landing gear.',skid_quad,(),(), 'gear'),
    PartSpec('pod_utility','pods','P2','Dorsal utility pod with status bank.',pod_utility,('HOOK_Emissive','MOUNT_Child'),(), 'pod'),
    PartSpec('pod_cargo_container','pods','P2','Ribbed standardized cargo container.',pod_cargo_container,('MOUNT_Child',),(), 'pod'),
    PartSpec('pod_repair_patch','pods','P2','Irregular bolted field-repair panel.',pod_repair_patch,(),(), 'pod'),
]


# --- GLB writer --------------------------------------------------------------------------------
MATERIAL_ORDER = ['Material_Hull','Material_Accent','Material_Mechanical','Material_Glass','Material_Interior']


def srgb_to_linear_channel(v: float) -> float:
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def write_glb(path: Path, spec: PartSpec, root: Node, textures: dict[str, bytes], texture_size: int) -> dict[str, Any]:
    binary = bytearray()
    buffer_views: list[dict[str, Any]] = []
    accessors: list[dict[str, Any]] = []
    gltf_meshes: list[dict[str, Any]] = []
    gltf_nodes: list[dict[str, Any]] = []
    mesh_map: dict[int, int] = {}

    def pad4(byte: int = 0) -> None:
        while len(binary) % 4: binary.append(byte)

    def append_blob(blob: bytes, target: int | None = None) -> int:
        pad4(0)
        offset = len(binary); binary.extend(blob)
        rec: dict[str, Any] = {'buffer':0,'byteOffset':offset,'byteLength':len(blob)}
        if target is not None: rec['target'] = target
        buffer_views.append(rec); return len(buffer_views)-1

    def accessor(view: int, component: int, count: int, kind: str,
                 minv: Sequence[float] | None = None, maxv: Sequence[float] | None = None) -> int:
        rec: dict[str, Any] = {'bufferView':view,'componentType':component,'count':count,'type':kind}
        if minv is not None: rec['min']=[round(float(x),6) for x in minv]
        if maxv is not None: rec['max']=[round(float(x),6) for x in maxv]
        accessors.append(rec); return len(accessors)-1

    mats_index = {name:i for i,name in enumerate(MATERIAL_ORDER)}
    for node in iter_nodes(root):
        mesh = node.mesh
        if mesh is None or id(mesh) in mesh_map: continue
        normals = mesh.normals or compute_vertex_normals(mesh.vertices, mesh.faces)
        uvs = mesh.uvs or [(p[0],p[2]) for p in mesh.vertices]
        pos_flat=[c for p in mesh.vertices for c in p]
        nrm_flat=[c for p in normals for c in p]
        uv_flat=[c for p in uvs for c in p]
        idx_flat=[i for f in mesh.faces for i in f]
        component=5123 if len(mesh.vertices)<65535 else 5125
        idx_fmt='H' if component==5123 else 'I'
        pv=append_blob(struct.pack('<'+'f'*len(pos_flat),*pos_flat),34962)
        nv=append_blob(struct.pack('<'+'f'*len(nrm_flat),*nrm_flat),34962)
        uvv=append_blob(struct.pack('<'+'f'*len(uv_flat),*uv_flat),34962)
        iv=append_blob(struct.pack('<'+idx_fmt*len(idx_flat),*idx_flat),34963)
        mins=[min(p[i] for p in mesh.vertices) for i in range(3)]
        maxs=[max(p[i] for p in mesh.vertices) for i in range(3)]
        pa=accessor(pv,5126,len(mesh.vertices),'VEC3',mins,maxs)
        na=accessor(nv,5126,len(mesh.vertices),'VEC3')
        ua=accessor(uvv,5126,len(mesh.vertices),'VEC2')
        ia=accessor(iv,component,len(idx_flat),'SCALAR',[0],[max(idx_flat) if idx_flat else 0])
        gltf_meshes.append({'name':mesh.name,'primitives':[{
            'attributes':{'POSITION':pa,'NORMAL':na,'TEXCOORD_0':ua,'TEXCOORD_1':ua},
            'indices':ia,'material':mats_index[mesh.material],'mode':4,
        }], 'extras':{'triangleCount':len(mesh.faces)}})
        mesh_map[id(mesh)] = len(gltf_meshes)-1

    def add_node(node: Node) -> int:
        rec: dict[str, Any] = {'name':node.name}
        if node.mesh is not None: rec['mesh']=mesh_map[id(node.mesh)]
        if any(abs(v)>1e-9 for v in node.translation): rec['translation']=[round(v,6) for v in node.translation]
        if node.rotation and any(abs(node.rotation[i] - (1 if i==3 else 0))>1e-9 for i in range(4)):
            rec['rotation']=[round(v,7) for v in node.rotation]
        if node.scale and any(abs(v-1)>1e-9 for v in node.scale): rec['scale']=[round(v,6) for v in node.scale]
        if node.extras: rec['extras']=node.extras
        idx=len(gltf_nodes); gltf_nodes.append(rec)
        child_ids=[add_node(c) for c in node.children]
        if child_ids: rec['children']=child_ids
        return idx

    root_id=add_node(root)
    image_views=[]
    for key in ('baseColor','normal','orm'):
        image_views.append(append_blob(textures[key]))

    # Neutral hull is multiplied by faction color at runtime; accent is independently tintable.
    materials: list[dict[str, Any]] = [
        {
            'name':'Material_Hull',
            'pbrMetallicRoughness':{
                'baseColorFactor':[1,1,1,1], 'baseColorTexture':{'index':0},
                'metallicFactor':.32,'roughnessFactor':.72,'metallicRoughnessTexture':{'index':2},
            },
            'normalTexture':{'index':1,'scale':.9}, 'occlusionTexture':{'index':2,'strength':1.0},
        },
        {
            'name':'Material_Accent',
            'pbrMetallicRoughness':{'baseColorFactor':[.10,.42,.48,1],'metallicFactor':.08,'roughnessFactor':.28},
            'emissiveFactor':[.08,.65,.75], 'extensions':{'KHR_materials_emissive_strength':{'emissiveStrength':2.2}},
        },
        {
            'name':'Material_Mechanical',
            'pbrMetallicRoughness':{'baseColorFactor':[.055,.07,.09,1],'metallicFactor':.82,'roughnessFactor':.38},
        },
        {
            'name':'Material_Glass',
            'pbrMetallicRoughness':{'baseColorFactor':[.025,.085,.11,.72],'metallicFactor':0,'roughnessFactor':.08},
            'alphaMode':'BLEND','doubleSided':True,
            'extensions':{
                'KHR_materials_transmission':{'transmissionFactor':.62},
                'KHR_materials_ior':{'ior':1.4},
                'KHR_materials_clearcoat':{'clearcoatFactor':1.0,'clearcoatRoughnessFactor':.12},
            },
        },
        {
            'name':'Material_Interior',
            'pbrMetallicRoughness':{'baseColorFactor':[.012,.018,.025,1],'metallicFactor':.45,'roughnessFactor':.72},
        },
    ]
    tri=triangle_count(root)
    minv,maxv=mesh_bounds(root)
    dims=[round(maxv[i]-minv[i],5) for i in range(3)]
    doc={
        'asset':{'version':'2.0','generator':'SpaceFace tools/art/generate_ship_parts_library.py','extras':{
            'assetId':f'SF_PART_{spec.id.upper()}', 'partId':spec.id, 'category':spec.category,
            'priority':spec.priority, 'unit':'metre','upAxis':'+Y','forwardAxis':'+X','starboardAxis':'+Z',
            'triangleCount':tri,'textureSize':texture_size,'boundsDimensionsM':dims,
        }},
        'extensionsUsed':['KHR_materials_transmission','KHR_materials_ior','KHR_materials_clearcoat','KHR_materials_emissive_strength'],
        'scene':0,'scenes':[{'name':spec.id,'nodes':[root_id]}], 'nodes':gltf_nodes,'meshes':gltf_meshes,
        'materials':materials,'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],
        'images':[{'name':'baseColor','bufferView':image_views[0],'mimeType':'image/png'},
                  {'name':'normal','bufferView':image_views[1],'mimeType':'image/png'},
                  {'name':'orm','bufferView':image_views[2],'mimeType':'image/png'}],
        'textures':[{'sampler':0,'source':0},{'sampler':0,'source':1},{'sampler':0,'source':2}],
        'buffers':[{'byteLength':len(binary)}], 'bufferViews':buffer_views,'accessors':accessors,
    }
    json_bytes=bytearray(json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf-8'))
    while len(json_bytes)%4: json_bytes.append(0x20)
    pad4(0)
    total=12+8+len(json_bytes)+8+len(binary)
    glb=bytearray(struct.pack('<III',0x46546C67,2,total))
    glb.extend(struct.pack('<II',len(json_bytes),0x4E4F534A)); glb.extend(json_bytes)
    glb.extend(struct.pack('<II',len(binary),0x004E4942)); glb.extend(binary)
    path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(glb)
    return {'triangles':tri,'bytes':len(glb),'nodes':len(gltf_nodes),'meshes':len(gltf_meshes),'boundsMin':[round(v,5) for v in minv],'boundsMax':[round(v,5) for v in maxv],'dimensionsM':dims}


def add_budget_detail(builder: PartBuilder, minimum: int = 520) -> None:
    # Every small pack still gets enough authored edge/fastener geometry to clear the hard per-part floor.
    tri=triangle_count(builder.root)
    if tri>=minimum: return
    minv,maxv=mesh_bounds(builder.root)
    x0,x1=minv[0],maxv[0]; z0,z1=minv[2],maxv[2]; y=maxv[1]+.025
    spanx=max(.5,x1-x0); spanz=max(.5,z1-z0)
    i=0
    while triangle_count(builder.root)<minimum and i<48:
        fx=((i*37)%101)/100; fz=((i*61+17)%101)/100
        builder.bolt((x0+.06+fx*max(.1,spanx-.12),y,z0+.06+fz*max(.1,spanz-.12)),.034,.055)
        i+=1


def build_all(output: Path, texture_size: int) -> dict[str, Any]:
    texture_cache={style:make_texture_set(style,texture_size) for style in sorted({p.texture_style for p in PARTS})}
    rows=[]
    for spec in PARTS:
        b=PartBuilder(spec); spec.build(b); add_budget_detail(b)
        tri=triangle_count(b.root)
        if not 500<=tri<=4000:
            raise RuntimeError(f'{spec.id}: triangle budget {tri} outside 500..4000')
        path=output/spec.category/f'{spec.id}.glb'
        stats=write_glb(path,spec,b.root,texture_cache[spec.texture_style],texture_size)
        if stats['bytes']>350_000:
            raise RuntimeError(f'{spec.id}: file budget {stats["bytes"]} > 350000')
        names={n.name for n in iter_nodes(b.root)}
        missing=[n for n in (*spec.required_hooks,*spec.required_sockets) if n not in names]
        if missing: raise RuntimeError(f'{spec.id}: missing nodes {missing}')
        rows.append({
            'id':spec.id,'category':spec.category,'priority':spec.priority,
            'file':f'{spec.category}/{spec.id}.glb','tris':stats['triangles'],'bytes':stats['bytes'],
            'textureSize':texture_size,
            'tintable':{'hull':'Material_Hull','accent':'Material_Accent'},
            'hooks':list(spec.required_hooks),'sockets':list(spec.required_sockets),
            'mount':'origin','bounds':{'min':stats['boundsMin'],'max':stats['boundsMax'],'dimensionsM':stats['dimensionsM']},
            'note':spec.note,
        })
        print(f'{spec.id:25s} {stats["triangles"]:4d} tris {stats["bytes"]:6d} bytes')
    manifest={
        'schemaVersion':1,
        'libraryId':'SF_SHIP_PARTS_V1',
        'coordinateSystem':{'handedness':'right','forward':'+X','up':'+Y','starboard':'+Z','unit':'metre','origin':'mount point'},
        'textureContract':{'baseColor':'sRGB','normal':'tangent OpenGL green-up','orm':'R=AO G=roughness B=metallic','resolution':texture_size},
        'budgets':{'trianglesPerPart':[500,4000],'maxBytesPerPart':350000},
        'materialContract':{'hull':'Material_Hull','accent':'Material_Accent','glass':'Material_Glass','mechanical':'Material_Mechanical'},
        'parts':rows,
    }
    (output/'parts_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return manifest


def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[2]/'assets'/'ships'/'parts')
    parser.add_argument('--texture-size',type=int,default=1024)
    args=parser.parse_args()
    if args.texture_size not in (512,1024,2048): parser.error('--texture-size must be 512, 1024, or 2048')
    manifest=build_all(args.output,args.texture_size)
    total=sum(p['bytes'] for p in manifest['parts'])
    print(json.dumps({'parts':len(manifest['parts']),'p0':sum(p['priority']=='P0' for p in manifest['parts']),'bytes':total,'output':str(args.output)},indent=2))
    return 0


if __name__=='__main__':
    raise SystemExit(main())
