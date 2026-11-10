"""Forge stencil — hand-cut hero lettering laid onto a hull (the Hitch's DIE LAUGHING).

A hero marking is not an inventory label and not a raised plaque: it is lacquer sprayed through a
cut stencil. This module builds that as real, tiny geometry (no textures, no extra draw call — it
shares the hull's existing finish) with the tells a hand-cut stencil has:

  * bridges — every counter (A, D, G, H, U, E ...) is held by an unpainted gap, so the letters are
    islands, never a clean font outline;
  * chipped edges — a few corners are knocked off and a few edges carry small bites where paint
    never took;
  * overspray — a handful of specks drift just outside the cut edges.

Everything is seeded: the same marking is byte-identical on every build. Letters are conformal —
each vertex is ray-cast down onto the surface part, so the marking follows a curved or stepped
plate instead of floating over it.

Orientation (Blender hull axes: +X nose, +Y port, +Z dorsal): with `angle=0` the text reads toward
the nose with the tops of the letters toward port. `angle` turns the whole marking about its centre
(radians, counter-clockwise from above). Lines are listed top to bottom in the marking's own frame.
The game's chase camera puts screen-right at the hull's tail at the spawn heading, so a hull whose
marking should read upright on first sight takes `angle=math.pi`.
"""
from __future__ import annotations

import math
import random

import bmesh
import bpy
from mathutils import Vector

import forge as F

# Glyphs are drawn in height units (cap height = 1.0): (advance width, [polygon, ...]). Each polygon
# is one painted island. Vertical strokes are 0.14 wide, horizontal strokes 0.15, bridges 0.05-0.06.
GLYPHS = {
    'I': (0.14, [[(0, 0), (0.14, 0), (0.14, 1), (0, 1)]]),
    'L': (0.44, [[(0, 0), (0.44, 0), (0.44, 0.15), (0.14, 0.15), (0.14, 1), (0, 1)]]),
    'E': (0.44, [
        [(0, 0), (0.44, 0), (0.44, 0.15), (0.14, 0.15), (0.14, 0.37), (0, 0.37)],
        [(0, 0.42), (0.38, 0.42), (0.38, 0.57), (0.14, 0.57), (0.14, 0.85), (0.44, 0.85), (0.44, 1), (0, 1)],
    ]),
    'U': (0.50, [
        [(0, 0.07), (0.07, 0), (0.22, 0), (0.22, 0.15), (0.14, 0.15), (0.14, 1), (0, 1)],
        [(0.50, 0.07), (0.50, 1), (0.36, 1), (0.36, 0.15), (0.28, 0.15), (0.28, 0), (0.43, 0)],
    ]),
    'A': (0.52, [
        [(0, 0.58), (0.14, 0.58), (0.14, 0.85), (0.38, 0.85), (0.38, 0.58), (0.52, 0.58), (0.52, 0.90),
         (0.42, 1), (0.10, 1), (0, 0.90)],
        [(0, 0), (0.14, 0), (0.14, 0.40), (0.38, 0.40), (0.38, 0), (0.52, 0), (0.52, 0.53), (0, 0.53)],
    ]),
    'G': (0.50, [
        [(0, 0.10), (0.10, 0), (0.50, 0), (0.50, 0.15), (0.14, 0.15), (0.14, 0.85), (0.50, 0.85),
         (0.50, 1), (0.10, 1), (0, 0.90)],
        [(0.36, 0.20), (0.50, 0.20), (0.50, 0.52), (0.26, 0.52), (0.26, 0.40), (0.36, 0.40)],
    ]),
    'H': (0.52, [
        [(0, 0), (0.14, 0), (0.14, 0.42), (0.23, 0.42), (0.23, 0.57), (0.14, 0.57), (0.14, 1), (0, 1)],
        [(0.29, 0.42), (0.38, 0.42), (0.38, 0), (0.52, 0), (0.52, 1), (0.38, 1), (0.38, 0.57), (0.29, 0.57)],
    ]),
    'N': (0.52, [[(0, 0), (0.14, 0), (0.14, 0.62), (0.38, 0), (0.52, 0), (0.52, 1), (0.38, 1), (0.38, 0.38),
                  (0.14, 1), (0, 1)]]),
    'D': (0.52, [
        [(0, 0), (0.34, 0), (0.34, 0.15), (0.14, 0.15), (0.14, 0.85), (0.34, 0.85), (0.34, 1), (0, 1)],
        [(0.40, 0), (0.46, 0), (0.52, 0.10), (0.52, 0.90), (0.46, 1), (0.40, 1), (0.40, 0.85), (0.38, 0.85),
         (0.38, 0.15), (0.40, 0.15)],
    ]),
}


def _ccw(poly):
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))
    return poly if area > 0 else list(reversed(poly))


def _wear(poly, rng, chip=0.22, bite=0.12):
    """Knock a few corners off and bite a few edges. Metres; poly is CCW."""
    out = []
    n = len(poly)
    for i, p in enumerate(poly):
        prev, nxt = Vector(poly[i - 1]), Vector(poly[(i + 1) % n])
        cur = Vector(p)
        a, b = prev - cur, nxt - cur
        convex = (cur.x - prev.x) * (nxt.y - cur.y) - (cur.y - prev.y) * (nxt.x - cur.x) > 0
        if convex and a.length > 0.07 and b.length > 0.07 and rng.random() < chip:
            c = rng.uniform(0.018, 0.04)
            out.append(tuple(cur + a.normalized() * c))
            out.append(tuple(cur + b.normalized() * c))
        else:
            out.append(p)
        # bite the edge that leaves this vertex
        e = Vector(poly[(i + 1) % n]) - cur
        if e.length > 0.13 and rng.random() < bite:
            t = rng.uniform(0.3, 0.7)
            w = rng.uniform(0.028, 0.055)
            d = rng.uniform(0.016, 0.032)
            along = e.normalized()
            inward = Vector((-along.y, along.x))
            s0 = cur + e * t - along * (w / 2)
            s1 = cur + e * t + along * (w / 2)
            out.append(tuple(s0))
            out.append(tuple(s0 + inward * d))
            out.append(tuple(s1 + inward * d * 0.5))
            out.append(tuple(s1))
    return out


def _slab(bm, poly, zs, thickness):
    """Prism over `poly` (CCW, plan metres): top face + side walls, no bottom (it sits on the hull)."""
    bot = [bm.verts.new((x, y, z)) for (x, y), z in zip(poly, zs)]
    top = [bm.verts.new((x, y, z + thickness)) for (x, y), z in zip(poly, zs)]
    faces = [bm.faces.new(top)]
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    return faces


def _line_layout(text, height, tracking):
    """[(char, x_offset_units)] and the line's total width in height units."""
    placed, x = [], 0.0
    for ch in text:
        adv, _ = GLYPHS[ch]
        placed.append((ch, x))
        x += adv + tracking
    return placed, x - tracking


def stamp(ship, name, lines, center, surface, finish='paint2.ivory', thickness=0.022, seed=None,
          line_gap=0.22, z_default=None, specks=10, chip=0.16, bite=0.09, angle=0.0):
    """Lay a hand-cut stencil on `surface` (a part name) around plan point `center`.

    lines: top-to-bottom list of (text, cap_height_m, tracking_units). Each line is centred on
    `center`'s x. Returns the new marking object (one mesh, one material slot).
    """
    rng = random.Random(seed if seed is not None else f'{ship.id}:{name}')
    surf = bpy.data.objects[surface]
    cx, cy = center
    total_h = sum(h for _t, h, _k in lines) + line_gap * (len(lines) - 1)
    top = cy + total_h / 2.0

    def surface_z(x, y):
        hit, loc, _n, _i = surf.ray_cast(Vector((x, y, 50.0)), Vector((0, 0, -1)))
        if hit:
            return loc.z
        if z_default is None:
            raise RuntimeError(f'stencil {name}: no surface under ({x:.2f}, {y:.2f}) on {surface}')
        return z_default

    islands = []  # plan polygons, metres, CCW
    y_cursor = top
    for text, height, tracking in lines:
        placed, width_u = _line_layout(text, height, tracking)
        x0 = cx - width_u * height / 2.0
        base_y = y_cursor - height
        for ch, off in placed:
            for poly in GLYPHS[ch][1]:
                pts = [(x0 + (off + u) * height, base_y + v * height) for (u, v) in _ccw(poly)]
                islands.append(_ccw(_wear(pts, rng, chip=chip, bite=bite)))
        y_cursor = base_y - line_gap

    if angle:
        ca, sa = math.cos(angle), math.sin(angle)
        islands = [[(cx + (x - cx) * ca - (y - cy) * sa, cy + (x - cx) * sa + (y - cy) * ca) for (x, y) in poly]
                   for poly in islands]

    bm = bmesh.new()
    top_faces = []
    for poly in islands:
        top_faces += _slab(bm, poly, [surface_z(x, y) for (x, y) in poly], thickness)
    # Overspray: small flat flecks drifting just outside the cut edges.
    for _ in range(specks):
        poly = rng.choice(islands)
        i = rng.randrange(len(poly))
        a, b = Vector(poly[i]), Vector(poly[(i + 1) % len(poly)])
        edge = b - a
        if edge.length < 1e-6:
            continue
        along = edge.normalized()
        outward = Vector((along.y, -along.x))
        c = a + edge * rng.uniform(0.2, 0.8) + outward * rng.uniform(0.045, 0.13)
        r = rng.uniform(0.011, 0.027)
        ang = rng.uniform(0, math.tau)
        tri = [(c.x + r * math.cos(ang + k * 2.0944), c.y + r * math.sin(ang + k * 2.0944)) for k in range(3)]
        top_faces += _slab(bm, _ccw(tri), [surface_z(x, y) for (x, y) in tri], thickness * 0.45)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=top_faces, quad_method='BEAUTY', ngon_method='EAR_CLIP')
    # bevel=0: a 2 cm lacquer film must not be rounded off by the hull's 3 cm Forge bevel.
    obj = ship.add(F._new_object(name, bm, ship.slots([finish]), bevel=0.0, smooth_angle=30.0))
    return obj
