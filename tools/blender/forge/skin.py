"""Forge skin — close-zoom hardware seated on the real skin of the part it rides.

Hand-typed heights float or clip the moment a hull's loft changes. These helpers drop a ray onto the
built (pre-bevel) mesh of the part a fixture sits on and read back the point and the surface normal,
so fasteners, coamings, cable runs and hatches follow the actual form. Everything returns plain
point lists for `forge.beams` / `forge.boxes` / `forge.sweep`, so a whole class of fixture lands as
one mesh in an existing finish: no new draw call, no texture.

Call `bpy.context.view_layer.update()` once after the part is built and before sampling it.
"""
from __future__ import annotations

import bpy
from mathutils import Vector


def hit(part, x, y, z=40.0):
    """(point, normal) where a ray dropped at plan (x, y) first meets part `part`; None on a miss."""
    obj = bpy.data.objects.get(part)
    if obj is None:
        raise KeyError(f'skin: no part {part}')
    ok, loc, nrm, _ = obj.ray_cast(Vector((x, y, z)), Vector((0.0, 0.0, -1.0)))
    return (loc, nrm) if ok else None


def studs(part, pts, nz=0.55, lift=0.05, sink=0.03):
    """Fastener rods standing on `part` at plan points, along the skin normal. Faces that tilt away
    from dorsal (normal.z <= nz) are skipped so nothing sprouts from a steep flank."""
    out = []
    for x, y in pts:
        h = hit(part, x, y)
        if h and h[1].z > nz:
            out.append((tuple(h[0] - h[1] * sink), tuple(h[0] + h[1] * lift)))
    return out


def run(part, pts, lift):
    """A pipe/cable path hugging `part`: plan points lifted `lift` above the skin (misses dropped)."""
    zs = [hit(part, x, y) for x, y in pts]
    return [(x, y, h[0].z + lift) for (x, y), h in zip(pts, zs) if h]


def segments(path):
    """Consecutive point pairs of a path, ready for `forge.beams`."""
    return [(path[i], path[i + 1]) for i in range(len(path) - 1)]


def hatch(part, cx, cy, sx, sy, lift=0.0):
    """Access hatch on `part`: (coaming segments hugging the skin, handle segment)."""
    c = [(cx - sx / 2, cy - sy / 2), (cx + sx / 2, cy - sy / 2), (cx + sx / 2, cy + sy / 2),
         (cx - sx / 2, cy + sy / 2)]
    loop = run(part, [c[0], ((c[0][0] + c[1][0]) / 2, c[0][1]), c[1], c[2], ((c[2][0] + c[3][0]) / 2, c[2][1]),
                      c[3], c[0]], lift)
    grip = run(part, [(cx, cy - sy * 0.22), (cx, cy + sy * 0.22)], 0.045 + lift)
    return segments(loop), (tuple(grip) if len(grip) == 2 else None)
