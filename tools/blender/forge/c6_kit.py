"""C6 landmarks/gates kit — shared helpers for the QUEUE + BP-08 place commissions.

Radial annular-sector and radial-box helpers mirroring the local helpers in
place_gate_jump_ring.py, kept out of the per-asset scripts so each body stays small.
"""
import math

import bmesh
from mathutils import Matrix


def annular_sector(s, F, name, r0, r1, a0, a1, z0, z1, material='paint', steps=None,
                   bevel=0.0, side_material=None):
    """Annular sector in the X-Y plan plane: radial r0..r1, angle a0..a1, height z0..z1."""
    steps = steps or max(2, int(abs(a1 - a0) / math.radians(3.0)))
    bm = bmesh.new()
    rings = []
    prof = ((r0, z0), (r1, z0), (r1, z1), (r0, z1))
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        c, sn = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * c, r * sn, z)) for (r, z) in prof])
    for i in range(steps):
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [material] + ([side_material] if side_material else [])
    return s.add(F._new_object(name, bm, s.slots(mats), bevel=bevel, smooth_angle=30.0))


def xz_annular_sector(s, F, name, r0, r1, a0, a1, x0, x1, material='paint', steps=None,
                      bevel=0.0):
    """Ring-band sector standing in the Y-Z plane (the jump-ring orientation):
    axial X thickness, ring polar angle a0..a1, radial r0..r1."""
    steps = steps or max(2, int(abs(a1 - a0) / math.radians(3.0)))
    bm = bmesh.new()
    rings = []
    prof = ((x0, r0), (x1, r0), (x1, r1), (x0, r1))
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * i / steps
        c, sn = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, r * c, r * sn)) for (x, r) in prof])
    for i in range(steps):
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def boxes(s, F, name, items, material, bevel=0.0):
    """Many boxes in one part. items: (center, size[, (rx, ry, rz)])."""
    bm = bmesh.new()
    for it in items:
        c, sz = it[0], it[1]
        r = it[2] if len(it) > 2 else (0.0, 0.0, 0.0)
        rot = Matrix.Rotation(r[2], 4, 'Z') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[0], 4, 'X')
        m = Matrix.Translation(c) @ rot @ Matrix.Diagonal((sz[0], sz[1], sz[2], 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def radial_ring_items(n, r, size, z=0.0, tilt=0.0, phase=0.0, jitter=None):
    """[(center, size, rot)] for n boxes on a plan-plane circle, each facing tangent."""
    out = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        out.append(((r * math.cos(a), r * math.sin(a), z), size,
                    (tilt * math.cos(a), tilt * math.sin(a), a)))
    return out


def yz_ring_items(n, r, size, x=0.0, tilt=0.0, phase=0.0):
    """[(center, size, rot)] for n boxes on a Y-Z-plane ring (gate orientation)."""
    out = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        out.append(((x, r * math.cos(a), r * math.sin(a)), size,
                    (a + math.pi / 2 + tilt, 0.0, 0.0)))
    return out


def crystal_shard(s, F, name, base, height, half_w, material, lean=(0.0, 0.0), sides=6):
    """A faceted crystal spike: tapered prism, n-sided, leaning `lean` (dx, dy)."""
    bm = bmesh.new()
    bx, by, bz = base
    z1 = bz + height
    verts = []
    for ring_i, (zc, r) in enumerate(((bz, half_w), (bz + height * 0.55, half_w * 0.62))):
        ring = []
        for i in range(sides):
            a = 2 * math.pi * i / sides + 0.3
            t = ring_i
            ring.append(bm.verts.new((bx + r * math.cos(a) + lean[0] * t,
                                      by + r * math.sin(a) + lean[1] * t, zc)))
        verts.append(ring)
    tip = bm.verts.new((bx + lean[0], by + lean[1], z1))
    for i in range(sides):
        j = (i + 1) % sides
        bm.faces.new((verts[0][i], verts[0][j], verts[1][j], verts[1][i]))
        bm.faces.new((verts[1][i], verts[1][j], tip))
    bm.faces.new(list(reversed(verts[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.02, smooth_angle=25.0))


def rib_arch(s, F, name, span, rise, chord, thickness, material, x=0.0, z0=0.0, n=7, bevel=0.05):
    """An arch rib: n box chords spanning `span` metres in Y, rising `rise` in Z. Facing +X."""
    bm = bmesh.new()
    for i in range(n):
        t0 = i / n
        t1 = (i + 1) / n
        y0 = -span / 2 + span * t0
        y1 = -span / 2 + span * t1
        z_a = z0 + rise * math.sin(math.pi * t0)
        z_b = z0 + rise * math.sin(math.pi * t1)
        cy, cz = (y0 + y1) / 2, (z_a + z_b) / 2
        length = math.hypot(y1 - y0, z_b - z_a)
        ang = math.atan2(z_b - z_a, y1 - y0)
        rot = Matrix.Rotation(ang, 4, 'X')
        m = (Matrix.Translation((x, cy, cz)) @ rot
             @ Matrix.Diagonal((thickness, length * 1.06, chord, 1.0)))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def rock_base(s, F, name, center, r, material='stone', lumps=9, seed=1):
    """Lumpy asteroid plinth: a cluster of flattened irregular spheres approximated by
    sized-rotated boxes, enough mass to ground a landmark."""
    import random
    rng = random.Random(seed)
    bm = bmesh.new()
    for i in range(lumps):
        a = 2 * math.pi * i / lumps
        rr = r * (0.35 + 0.5 * rng.random())
        c = (center[0] + rr * math.cos(a), center[1] + rr * math.sin(a),
             center[2] + r * 0.14 * (rng.random() - 0.5))
        sz = (r * (0.5 + 0.5 * rng.random()), r * (0.45 + 0.45 * rng.random()),
              r * (0.28 + 0.3 * rng.random()))
        rot = (rng.random() * 0.6, rng.random() * 0.6, rng.random() * math.pi)
        m = (Matrix.Translation(c)
             @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y')
             @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*sz, 1.0)))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=r * 0.06, smooth_angle=20.0))


def landmark_sockets(s, focus_z=0.0, aperture=False):
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0, 0, 0))
    s.socket('SOCKET_Camera_Focus', (0, 0, focus_z))


def gate_sockets(s, ring_radius=34.0):
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus', 'SOCKET_Gate_Aperture',
                      'SOCKET_Emissive']
    s.socket('SOCKET_Structure_Core', (0, 0, 0))
    s.socket('SOCKET_Camera_Focus', (0, 0, ring_radius + 10.0))
    s.socket('SOCKET_Gate_Aperture', (0, 0, 0))
    s.socket('SOCKET_Emissive', (0, ring_radius * 0.75, 0))
