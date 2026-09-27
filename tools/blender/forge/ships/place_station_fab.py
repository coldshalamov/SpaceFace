"""Orbital Fabrication Yard — Helios shipbuilding drydock. Forge rebuild.

Idea: "open drydock with a half-built hull". Plan read from the chase camera: a long U of blue-grey
lattice walls open to the aft (-X), closed at the fore end (+X) by the lit workshop block and its
glazed control tower (the dock approach socket and docking collar are on the workshop's nose).
Inside the U a Helios freighter is half built: the bow is plated ivory with primer patches, the
midships and stern are bare ribs, stringers and a keel, with the drive bells already hung. Three
safety-orange bridge cranes straddle the dock on the wall rails, one lowering a hull plate; service
arms reach in from the walls with cyan welding sparks (the emissive socket is one of them).
Three values: yard blue-grey frame, ivory plating and workshop trim, charcoal machinery; safety
orange carried by the cranes and bands; warm windows everywhere people work.
Sockets (dock approach, emissive, structure core) are copied from the live file on export.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_fab'
COLORS = {
    'paint': '#a69d8a',           # Helios ivory (brightest allowed): new plating, workshop trim
    'paint2': '#2c3b4c',          # yard blue-grey #34465a, authored a touch darker
    'stripe': '#7c3614',          # safety orange, authored dark
    'hazard': '#8a3c14',          # safety orange bands
    'paint.graphite': '#23282e',  # charcoal
    'paint.primer': '#4f5448',    # primer-grey hull panels (unfinished plating)
    'dark': '#15181c',
}

WALL_Y = 18.0            # lattice wall centre lines (port +)
WALL_X0, WALL_X1 = -58.0, 19.0
Z_BOT, Z_TOP = -9.0, 15.0
CRANES = (-40.0, -22.0, -5.0)
# the ship under construction: bow +X (toward the workshop), stern -X (the open end)
HULL_W, HULL_HT, HULL_HB, HULL_N = 8.4, 5.8, 5.2, 2.6
BOW_X, PLATED_X, STERN_X = 14.5, -14.0, -43.0


def hull_sec(x):
    """Section (w, ht, hb, zc) of the new ship at x: constant midbody, rounded bow taper."""
    if x > -4.0:
        t = min((x + 4.0) / (BOW_X + 4.0), 1.0)
        k = 1.0 - t ** 2.2
        return (max(HULL_W * k, 0.35), max(HULL_HT * (0.4 + 0.6 * k), 0.35), max(HULL_HB * (0.25 + 0.75 * k), 0.35),
                -0.6 * t)
    return HULL_W, HULL_HT, HULL_HB, 0.0


# --- local helpers --------------------------------------------------------------------------------

def cluster(s, name, items, material, bevel=0.0):
    """Many small boxes in one mesh (windows, sparks, lights): items = (center, size, rot_z)."""
    bm = bmesh.new()
    for c, sz, rz in items:
        geom = bmesh.ops.create_cube(bm, size=1.0)
        vs = geom['verts']
        for v in vs:
            v.co.x *= sz[0]
            v.co.y *= sz[1]
            v.co.z *= sz[2]
        if rz:
            bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(rz, 3, 'Z'))
        bmesh.ops.translate(bm, verts=vs, vec=c)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def beam(s, name, p0, p1, w, h=None, material='gunmetal', bevel=0.0):
    return F.sweep(s, name, [p0, p1], w, h if h is not None else w, material=material, bevel=bevel)


def beams(s, name, segs, w, material='gunmetal'):
    """Many straight square struts in one mesh: segs = [(p0, p1)]."""
    bm = bmesh.new()
    for q0, q1 in segs:
        q0, q1 = Vector(q0), Vector(q1)
        d = q1 - q0
        if d.length < 1e-4:
            continue
        tt = d.normalized()
        u = Vector((0, 0, 1)) if abs(tt.z) < 0.9 else Vector((0, 1, 0))
        sd = tt.cross(u).normalized()
        nn = sd.cross(tt).normalized()
        r0 = [bm.verts.new(q0 + sd * x * w / 2 + nn * y * w / 2) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        r1 = [bm.verts.new(q1 + sd * x * w / 2 + nn * y * w / 2) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        bm.faces.new(list(reversed(r0)))
        bm.faces.new(r1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=30.0))


def truss(s, name, p0, p1, width, depth, bays, material='gunmetal', chord=0.45, web=0.25):
    a, b = Vector(p0), Vector(p1)
    t = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
    side = t.cross(up).normalized()
    nrm = side.cross(t).normalized()
    corners = [side * sx * width / 2 + nrm * sz * depth / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    chords = [(a + c, b + c) for c in corners]
    webs = []
    for i in range(bays):
        q0 = a + (b - a) * (i / bays)
        q1 = a + (b - a) * ((i + 1) / bays)
        for f in range(4):
            c0, c1 = corners[f], corners[(f + 1) % 4]
            webs.append((q0 + c0, q1 + c1) if i % 2 == 0 else (q0 + c1, q1 + c0))
    beams(s, name, chords, chord, material)
    return beams(s, name + 'Web', webs, web, material)


def ring_sweep(s, name, pts, hw, hh, material='paint2'):
    """Rectangular beam swept along a closed loop in a YZ plane (hull ribs); the beam's width
    runs along X so it never twists."""
    bm = bmesh.new()
    n = len(pts)
    sv = Vector((1, 0, 0))
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        t = (Vector(pts[(i + 1) % n]) - Vector(pts[(i - 1) % n])).normalized()
        nrm = sv.cross(t).normalized()
        rings.append([bm.verts.new(p + sv * a * hw + nrm * b * hh) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=40.0))


def section_pts(x, count=28, inset=0.0):
    w, ht, hb, zc = hull_sec(x)
    return [(x, y, z) for (y, z) in F.superellipse_ring(w - inset, ht - inset, hb - inset, zc, HULL_N, count)]


def skin_patch(s, name, x0, x1, t0, t1, material='paint', thick=0.3, steps_x=4, steps_t=8):
    """A curved plate of hull skin between x0..x1 and section angles t0..t1 (radians, 0 = port,
    pi/2 = dorsal): outer and inner surfaces closed into a solid panel."""
    bm = bmesh.new()

    def pt(x, t, off):
        w, ht, hb, zc = hull_sec(x)
        c, sn = math.cos(t), math.sin(t)
        h = ht if sn >= 0 else hb
        y = (w + off) * math.copysign(abs(c) ** (2.0 / HULL_N), c)
        z = zc + (h + off) * math.copysign(abs(sn) ** (2.0 / HULL_N), sn)
        return Vector((x, y, z))
    grids = []
    for off in (thick * 0.5, -thick * 0.5):
        g = []
        for i in range(steps_x + 1):
            x = x0 + (x1 - x0) * i / steps_x
            g.append([bm.verts.new(pt(x, t0 + (t1 - t0) * j / steps_t, off)) for j in range(steps_t + 1)])
        grids.append(g)
    o, n_ = grids
    for i in range(steps_x):
        for j in range(steps_t):
            bm.faces.new((o[i][j], o[i + 1][j], o[i + 1][j + 1], o[i][j + 1]))
            bm.faces.new((n_[i][j + 1], n_[i + 1][j + 1], n_[i + 1][j], n_[i][j]))
    for i in range(steps_x):
        bm.faces.new((o[i][0], n_[i][0], n_[i + 1][0], o[i + 1][0]))
        bm.faces.new((o[i + 1][-1], n_[i + 1][-1], n_[i][-1], o[i][-1]))
    for j in range(steps_t):
        bm.faces.new((o[0][j + 1], n_[0][j + 1], n_[0][j], o[0][j]))
        bm.faces.new((o[-1][j], n_[-1][j], n_[-1][j + 1], o[-1][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=40.0))


# --- build ------------------------------------------------------------------------------------

def build_walls(s):
    for side in (1, -1):
        y = side * WALL_Y
        nm = 'P' if side > 0 else 'S'
        F.box(s, f'TopChord{nm}', ((WALL_X0 + WALL_X1) / 2, y, Z_TOP), (WALL_X1 - WALL_X0, 2.4, 2.0),
              material='paint2', bevel=0.12)
        F.box(s, f'BotChord{nm}', ((WALL_X0 + WALL_X1) / 2, y, Z_BOT), (WALL_X1 - WALL_X0, 2.4, 2.0),
              material='paint2', bevel=0.12)
        F.box(s, f'CraneRail{nm}', ((WALL_X0 + WALL_X1) / 2, y, Z_TOP + 1.25), (WALL_X1 - WALL_X0, 1.0, 0.5),
              material='gunmetal', bevel=0.0)
        F.band(s, f'TopChord{nm}', (WALL_X0 + 1.2, y, 0), (1, 0, 0), 2.0, 'hazard')
        F.band(s, f'BotChord{nm}', (WALL_X0 + 1.2, y, 0), (1, 0, 0), 2.0, 'hazard')
        posts, diag = [], []
        n = 9
        for i in range(n + 1):
            x = WALL_X0 + 1.0 + (WALL_X1 - WALL_X0 - 2.0) * i / n
            posts.append(((x, y, Z_BOT + 1.0), (x, y, Z_TOP - 1.0)))
            if i < n:
                x2 = WALL_X0 + 1.0 + (WALL_X1 - WALL_X0 - 2.0) * (i + 1) / n
                zm = (Z_BOT + Z_TOP) / 2
                diag.append(((x, y, Z_BOT + 1.0), ((x + x2) / 2, y, zm)))
                diag.append((((x + x2) / 2, y, zm), (x2, y, Z_BOT + 1.0)))
                diag.append(((x, y, Z_TOP - 1.0), ((x + x2) / 2, y, zm)))
                diag.append((((x + x2) / 2, y, zm), (x2, y, Z_TOP - 1.0)))
        beams(s, f'Posts{nm}', posts, 1.5, 'paint2')
        beams(s, f'Diag{nm}', diag, 0.7, 'gunmetal')
        # outboard service walkway with lit windows (the yard crews' corridor)
        F.box(s, f'Corridor{nm}', (-18.0, side * (WALL_Y + 2.6), 2.0), (60.0, 2.6, 3.0), material='paint',
              bevel=0.15)
        F.band(s, f'Corridor{nm}', (-18.0, 0, 3.2), (0, 0, 1), 0.4, 'paint2', inset=0.04, depth=0.08)
        for x in (-44.0, -30.0, -16.0, -2.0, 11.0):
            F.box(s, f'CorrPost{nm}{x:+.0f}', (x, side * (WALL_Y + 1.5), 2.0), (1.2, 1.4, 2.0), material='paint2',
                  bevel=0.0)
        # material racks: stacked plate stock and containers outboard, fore end
        for k, x in enumerate((-2.0, 5.0, 12.0)):
            for j in range(2):
                F.container(s, f'Stock{nm}{k}{j}', (x, side * (WALL_Y + 5.6), -5.0 + j * 2.6), (6.0, 2.6, 2.4),
                            finish='paint.primer' if (k + j) % 2 else 'paint2', ribs=3)
        beam(s, f'RackFloor{nm}', (-6.0, side * (WALL_Y + 5.6), -6.5), (16.0, side * (WALL_Y + 5.6), -6.5), 3.2, 0.5,
             material='paint.graphite')
        for x in (-5.0, 15.0):
            beam(s, f'RackArm{nm}{x:+.0f}', (x, side * (WALL_Y + 1.0), -6.5), (x, side * (WALL_Y + 7.2), -6.5), 0.8,
                 material='gunmetal')
    # the aft (open) end is marked by two hazard-banded portal posts with lights
    for side in (1, -1):
        F.box(s, f'Portal{side}', (WALL_X0 - 0.6, side * WALL_Y, (Z_BOT + Z_TOP) / 2), (2.2, 3.0, Z_TOP - Z_BOT + 2.0),
              material='paint.graphite', bevel=0.12)
        for zb in (Z_BOT + 3.0, Z_TOP - 3.0, (Z_BOT + Z_TOP) / 2):
            F.band(s, f'Portal{side}', (0, 0, zb), (0, 0, 1), 1.2, 'hazard')
    # keel cradle: cross trusses under the ship between the walls, with keel blocks
    for x in (-38.0, -24.0, -10.0, 4.0):
        truss(s, f'Cradle{x:+.0f}', (x, -WALL_Y + 1.2, Z_BOT), (x, WALL_Y - 1.2, Z_BOT), 2.0, 2.0, 8,
              material='paint.graphite', chord=0.5, web=0.3)
        _, _, hb, zc = hull_sec(x)
        F.box(s, f'KeelBlock{x:+.0f}', (x, 0, (Z_BOT + 1.0 + zc - hb) / 2), (3.0, 3.0, (zc - hb) - Z_BOT - 0.8),
              material='paint2', bevel=0.1, taper=0.8)


def build_workshop(s):
    # the fore end: a workshop block closing the U, with the control tower looking down the dock
    F.plate(s, 'Shop', [(34.0, 21.5), (19.0, 21.5), (19.0, -21.5), (34.0, -21.5), (36.0, -18.0), (36.0, 18.0)],
            z0=-9.5, thickness=16.0, material='paint2', chamfer=0.6, bevel=0.2)
    F.band(s, 'Shop', (0, 0, 3.0), (0, 0, 1), 0.6, 'paint', inset=0.05, depth=0.1)
    F.band(s, 'Shop', (0, 0, -6.0), (0, 0, 1), 0.6, 'hazard', inset=0.05, depth=0.1)
    F.band(s, 'Shop', (0, 13.0, 0), (0, 1, 0), 1.4, 'paint.graphite', facing=(0, 0, 1))
    F.band(s, 'Shop', (0, -13.0, 0), (0, 1, 0), 1.4, 'paint.graphite', facing=(0, 0, 1))
    # hangar mouth facing the dock: a dark bay lit inside
    F.box(s, 'Bay', (18.9, 0, -1.0), (0.6, 18.0, 10.0), material='dark', bevel=0.0)
    F.box(s, 'BayFloor', (18.7, 0, -5.9), (0.8, 17.6, 0.3), material='glow_warm', bevel=0.0)
    F.box(s, 'BayCeil', (18.7, 0, 3.9), (0.8, 17.6, 0.3), material='glow_warm', bevel=0.0)
    for side in (1, -1):
        F.box(s, f'BayJamb{side}', (18.6, side * 9.6, -1.0), (1.0, 1.2, 10.6), material='hazard', bevel=0.05)
    # control tower
    F.plate(s, 'Tower', [(31.0, 7.0), (23.0, 7.0), (21.5, 5.5), (21.5, -5.5), (23.0, -7.0), (31.0, -7.0)],
            z0=6.5, thickness=8.5, material='paint', chamfer=0.4, bevel=0.15)
    F.band(s, 'Tower', (0, 0, 12.2), (0, 0, 1), 1.6, 'glass', facing=(-1, 0, 0.2), min_facing=0.4)
    F.band(s, 'Tower', (0, 0, 9.2), (0, 0, 1), 0.5, 'paint2', inset=0.04, depth=0.1)
    F.plate(s, 'TowerRoof', [(30.0, 6.0), (23.5, 6.0), (22.5, 5.0), (22.5, -5.0), (23.5, -6.0), (30.0, -6.0)],
            z0=15.0, thickness=0.8, material='paint2', chamfer=0.2, bevel=0.05)
    F.cylinder(s, 'DishMast', (28.0, 3.5, 15.8), (28.0, 3.5, 18.0), 0.35, material='gunmetal', segments=10, bevel=0.0)
    F.dish(s, 'Dish', (28.0, 3.5, 18.0), 2.2, 0.7, axis=(0.4, 0.4, 1.0), material='gunmetal', face='paint')
    # player docking arm on the nose (+X): tube, collar, port
    truss(s, 'DockTruss', (34.0, 0, -4.0), (44.0, 0, -4.0), 3.0, 2.2, 4)
    F.cylinder(s, 'ArmTube', (35.0, 0, 0.5), (41.0, 0, 0.5), 2.0, material='paint', segments=24, bevel=0.0)
    F.cylinder(s, 'Collar', (41.0, 0, 0.5), (43.6, 0, 0.5), 3.0, 2.8, material='paint2', segments=32, bevel=0.1)
    F.band(s, 'Collar', (42.0, 0, 0), (1, 0, 0), 0.6, 'hazard')
    F.cylinder(s, 'Port', (43.5, 0, 0.5), (44.1, 0, 0.5), 2.2, material='gunmetal', segments=24, cap_material='dark',
               bevel=0.0)
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        F.light(s, f'PortLight{k}', (44.0, 2.6 * math.cos(a), 0.5 + 2.6 * math.sin(a)),
                'glow_green' if k % 2 else 'glow_amber', size=0.36)
    # a yard tug parked on the nose, starboard
    ty = -9.5
    F.box(s, 'Tug', (40.0, ty, 0.0), (7.0, 3.6, 2.6), material='stripe', bevel=0.15)
    F.box(s, 'TugCab', (42.6, ty, 1.8), (2.0, 2.6, 1.4), material='paint', bevel=0.08)
    F.band(s, 'TugCab', (43.4, ty, 0), (1, 0, 0), 0.5, 'glass')
    F.box(s, 'TugPusher', (43.9, ty, -0.2), (0.8, 3.8, 1.8), material='paint.graphite', bevel=0.05)
    F.nozzle(s, 'TugDrive', (36.2, ty, 0.0), 1.0, 0.9, material='gunmetal')
    F.box(s, 'TugClamp', (37.5, -6.2, 0.0), (1.6, 3.4, 1.2), material='paint.graphite', bevel=0.05)
    F.box(s, 'TugPad', (37.5, -4.0, -2.0), (4.0, 1.4, 5.0), material='paint.graphite', bevel=0.05)


def build_shop_roof(s):
    for k, (x, y) in enumerate(((22.0, 13.0), (22.0, -13.0), (32.0, 13.0), (32.0, -13.0))):
        F.vent(s, f'ShopVent{k}', (x, y, 6.55), (3.2, 4.2, 0.4), slats=6)
    for k, y in enumerate((16.8, -16.8)):
        F.box(s, f'JibPost{k}', (20.2, y, 8.5), (1.2, 1.2, 4.0), material='paint.graphite', bevel=0.0)
        beam(s, f'Jib{k}', (20.2, y, 10.4), (13.0, y * 0.72, 10.4), 0.8, material='stripe')
        F.cylinder(s, f'JibLine{k}', (13.4, y * 0.72, 10.0), (13.4, y * 0.72, 7.0), 0.1, material='gunmetal',
                   segments=6, bevel=0.0)
        F.box(s, f'JibHook{k}', (13.4, y * 0.72, 6.8), (0.8, 0.8, 0.5), material='hazard', bevel=0.0)
    F.panel(s, 'Shop', (27.0, 0.0), (6.0, 12.0), 'dark', inset=0.08, depth=-0.1)
    # two roof pads for yard shuttles, one occupied
    for k, y in enumerate((-11.4, 11.4)):
        F.box(s, f'Pad{k}', (27.0, y, 6.62), (5.6, 5.6, 0.2), material='paint.graphite', bevel=0.0)
        F.box(s, f'PadRing{k}', (27.0, y, 6.74), (4.4, 4.4, 0.06), material='hazard', bevel=0.0)
        F.box(s, f'PadCore{k}', (27.0, y, 6.78), (3.8, 3.8, 0.06), material='paint.graphite', bevel=0.0)
        for cx in (-2.6, 2.6):
            for cy in (-2.6, 2.6):
                F.light(s, f'PadLight{k}{cx:+.0f}{cy:+.0f}', (27.0 + cx, y + cy, 6.8), 'glow_green', size=0.3)
    F.loft(s, 'Shuttle', [
        dict(x=25.0, w=0.8, ht=0.7, hb=0.6, zc=7.8, n=2.4, y=-11.4),
        dict(x=25.8, w=1.2, ht=0.9, hb=0.8, zc=7.8, n=2.6, y=-11.4),
        dict(x=28.4, w=1.2, ht=0.9, hb=0.8, zc=7.8, n=2.6, y=-11.4),
        dict(x=29.6, w=0.5, ht=0.4, hb=0.4, zc=7.7, n=2.2, y=-11.4),
    ], material='paint', belly='paint.graphite', back_material='dark', count=24, bevel=0.0)
    F.band(s, 'Shuttle', (29.0, -11.4, 7.8), (1, 0, 0), 0.7, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    F.band(s, 'Shuttle', (26.8, -11.4, 0), (1, 0, 0), 0.4, 'stripe')
    for e in (-0.8, 0.8):
        F.box(s, f'ShuttleSkid{e:+.0f}', (27.2, -11.4 + e, 6.95), (2.4, 0.2, 0.3), material='gunmetal', bevel=0.0)
    F.panel(s, 'Shop', (34.5, 0.0), (2.0, 30.0), 'paint', inset=0.06, depth=0.08)


def build_workshop_details(s):
    win = []
    for z in (-5.0, -2.6, -0.2, 2.2, 4.8):
        for i in range(18):
            y = -19.8 + i * (39.6 / 17)
            if abs(y) < 3.0:
                continue
            win.append(((36.05, y * 0.83, z), (0.12, 0.8, 0.5), 0.0))
        for i in range(8):
            x = 20.2 + i * 1.8
            win.append(((x, 21.55, z), (0.8, 0.12, 0.5), 0.0))
            win.append(((x, -21.55, z), (0.8, 0.12, 0.5), 0.0))
        for i in range(2):
            for side in (1, -1):
                win.append(((18.95, side * (11.2 + i * 1.6 + 2.2), z), (0.12, 0.8, 0.5), 0.0))
    # roof skylights on the shop
    for i in range(6):
        for j in range(4):
            y = -19.0 + j * 2.4 if j < 2 else 14.2 + (j - 2) * 2.4
            win.append(((21.0 + i * 2.2, y, 6.55), (1.2, 1.4, 0.1), 0.0))
    for side in (1, -1):
        for i in range(4):
            win.append(((24.0 + i * 1.8, side * 7.02, 9.8), (0.9, 0.12, 0.6), 0.0))
    cluster(s, 'ShopWin', win, 'glow_warm')
    tube = []
    for side in (1, -1):
        for i in range(5):
            tube.append(((35.8 + i * 1.1, side * 1.95, 0.9), (0.55, 0.12, 0.4), 0.0))
    cluster(s, 'TubeWin', tube, 'glow_warm')
    F.beacon(s, 'TowerBeacon', (24.5, -3.5, 15.8), 'glow_amber', size=0.7)
    F.antenna(s, 'TowerMast', (29.5, -4.5, 15.8), 3.5)
    F.beacon(s, 'DockBeacon', (42.3, 0, 3.4), 'glow_amber', size=0.7)
    F.light(s, 'NavPortFwd', (35.0, 21.6, 6.0), 'glow_red', size=0.7)
    F.light(s, 'NavStbdFwd', (35.0, -21.6, 6.0), 'glow_green', size=0.7)
    F.light(s, 'NavPortAft', (WALL_X0 - 1.8, WALL_Y, Z_TOP + 0.5), 'glow_red', size=0.8)
    F.light(s, 'NavStbdAft', (WALL_X0 - 1.8, -WALL_Y, Z_TOP + 0.5), 'glow_green', size=0.8)
    F.light(s, 'TugNavP', (41.0, -9.5 + 1.85, 0.6), 'glow_red', size=0.28)
    F.light(s, 'TugNavS', (41.0, -9.5 - 1.85, 0.6), 'glow_green', size=0.28)


def build_ship(s):
    # plated bow: a real hull loft from the plating line to the bow, ivory with a primer belt
    secs = []
    for x in (PLATED_X, -4.0, 0.0, 3.5, 6.5, 9.0, 11.0, 12.6, 13.8, BOW_X):
        w, ht, hb, zc = hull_sec(x)
        secs.append(dict(x=x, w=w, ht=ht, hb=hb, zc=zc, n=HULL_N))
    F.loft(s, 'Bow', secs, material='paint', belly='paint.primer', back_material='dark', count=40, bevel=0.0)
    F.band(s, 'Bow', (-10.5, 0, 0), (1, 0, 0), 1.8, 'paint.primer', inset=0.04, depth=0.06)
    F.band(s, 'Bow', (-1.0, 0, 0), (1, 0, 0), 0.8, 'stripe', inset=0.04, depth=0.06)
    F.band(s, 'Bow', (12.2, 0, 0), (1, 0, 0), 1.8, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    for (px, py, sx, sy) in ((-8.0, 2.6, 5.0, 3.0), (-1.0, -3.0, 4.0, 2.6), (4.5, 1.8, 3.0, 2.4), (-12.0, -2.2, 2.4, 3.4)):
        F.panel(s, 'Bow', (px, py), (sx, sy), 'paint.primer', inset=0.04, depth=0.04)
    # deckhouse on the plated bow: finished, glazed and lived in
    F.plate(s, 'Deckhouse', [(1.0, 3.6), (-11.5, 3.6), (-12.5, 2.6), (-12.5, -2.6), (-11.5, -3.6), (1.0, -3.6),
                             (2.6, -2.2), (2.6, 2.2)], z0=HULL_HT - 0.6, thickness=2.9, material='paint', chamfer=0.3,
            bevel=0.08)
    F.band(s, 'Deckhouse', (2.0, 0, 0), (1, 0, 0), 1.2, 'glass', facing=(1, 0, 0.3), min_facing=0.3)
    F.band(s, 'Deckhouse', (-5.0, 0, 0), (1, 0, 0), 0.6, 'stripe', inset=0.03, depth=0.05)
    # ribs, stringers and keel of the unplated midships and stern
    rib_x = [PLATED_X - 3.0 * (i + 1) for i in range(9)]
    for i, x in enumerate(rib_x):
        ring_sweep(s, f'Rib{i}', section_pts(x, 28, inset=0.25), 0.35, 0.35, material='paint2')
    for j, t in enumerate((0.0, 0.55, 1.1, math.pi / 2, math.pi - 1.1, math.pi - 0.55, math.pi, -0.6, -math.pi + 0.6)):
        c, sn = math.cos(t), math.sin(t)
        h = HULL_HT if sn >= 0 else HULL_HB
        y = (HULL_W - 0.25) * math.copysign(abs(c) ** (2.0 / HULL_N), c)
        z = (h - 0.25) * math.copysign(abs(sn) ** (2.0 / HULL_N), sn)
        beam(s, f'Stringer{j}', (STERN_X, y, z), (PLATED_X + 0.3, y, z), 0.35, material='gunmetal')
    beam(s, 'Keel', (STERN_X - 2.0, 0, -HULL_HB + 0.1), (PLATED_X + 0.5, 0, -HULL_HB + 0.1), 1.2, 1.0,
         material='paint.graphite')
    # partial skin already hung on the ribs: primer on the lower flanks, one ivory run on top
    skin_patch(s, 'SkinLowP', -26.0, PLATED_X, 3.4, 4.3, material='paint.primer')
    skin_patch(s, 'SkinLowS', -32.0, PLATED_X, -1.25, -0.25, material='paint.primer')
    skin_patch(s, 'SkinTop', -20.0, PLATED_X, 1.25, 1.95, material='paint')
    skin_patch(s, 'SkinBelly', -38.0, PLATED_X, 4.35, 5.05, material='paint.primer')
    # internal deck and machinery visible through the ribs
    F.box(s, 'Deck', ((STERN_X + PLATED_X) / 2, 0, -0.6), (PLATED_X - STERN_X, 2 * HULL_W - 1.6, 0.35),
          material='paint.graphite', bevel=0.0)
    for k, x in enumerate((-36.0, -27.0)):
        F.cylinder(s, f'Reactor{k}', (x - 3.0, 0, 1.6), (x + 3.0, 0, 1.6), 2.2, material='gunmetal', segments=20,
                   bevel=0.0, cap_material='paint2')
        F.band(s, f'Reactor{k}', (x, 0, 0), (1, 0, 0), 0.8, 'stripe')
    F.box(s, 'CargoFrame', (-20.0, 0, 1.2), (6.0, 8.0, 3.2), material='paint.primer', bevel=0.05)
    # thrust frame and the drive bells already hung at the stern
    F.box(s, 'ThrustFrame', (STERN_X - 0.8, 0, 0), (1.6, 2 * HULL_W - 0.6, 2 * HULL_HB - 1.0), material='paint.graphite',
          bevel=0.1)
    for y, z in ((-3.4, 0.0), (3.4, 0.0), (0.0, 0.2)):
        F.nozzle(s, f'Bell{y:+.0f}', (STERN_X - 1.8, y, z), 2.1 if y == 0 else 1.7, 2.2, material='gunmetal',
                 glow='dark')


def build_cranes(s):
    for c, x in enumerate(CRANES):
        F.box(s, f'Crane{c}', (x, 0, Z_TOP + 3.3), (2.6, 2 * WALL_Y + 3.4, 2.4), material='stripe', bevel=0.12)
        F.band(s, f'Crane{c}', (x, 0, 0), (0, 1, 0), 3.0, 'paint.graphite', facing=(0, 0, 1))
        for side in (1, -1):
            F.box(s, f'CraneEnd{c}{side}', (x, side * WALL_Y, Z_TOP + 2.2), (4.6, 3.0, 2.0), material='paint.graphite',
                  bevel=0.08)
        ty = (5.0, -4.0, 2.5)[c]
        F.box(s, f'CraneTrolley{c}', (x, ty, Z_TOP + 5.0), (3.6, 3.4, 1.6), material='paint.graphite', bevel=0.08)
        F.box(s, f'CraneCab{c}', (x + 2.4, ty, Z_TOP + 2.4), (1.2, 2.0, 1.4), material='paint', bevel=0.05)
    # crane 0 is lowering a curved plate onto the ribs; crane 1 holds an engine part above the stern
    x0, ty0 = CRANES[0], 5.0
    plate = skin_patch(s, 'HangingPlate', x0 - 3.0, x0 + 3.0, 0.5, 1.2, material='paint.primer')
    for obj in (plate,):
        for v in obj.data.vertices:
            v.co.z += 5.5
    for dy in (-1.0, 1.0):
        F.cylinder(s, f'Hoist0{dy:+.0f}', (x0 + dy, ty0, Z_TOP + 4.2), (x0 + dy * 1.6, ty0 - 0.3, 11.2), 0.12,
                   material='gunmetal', segments=6, bevel=0.0)
    x1, ty1 = CRANES[1], -4.0
    F.cylinder(s, 'Hoist1', (x1, ty1, Z_TOP + 4.2), (x1, ty1, 10.2), 0.14, material='gunmetal', segments=6, bevel=0.0)
    F.box(s, 'Spreader1', (x1, ty1, 9.8), (3.0, 3.0, 0.6), material='paint.graphite', bevel=0.0)
    F.box(s, 'Module1', (x1, ty1, 8.2), (4.0, 3.4, 2.6), material='paint', bevel=0.08)
    F.band(s, 'Module1', (x1, ty1, 0), (1, 0, 0), 0.6, 'stripe')
    x2, ty2 = CRANES[2], 2.5
    F.cylinder(s, 'Hoist2', (x2, ty2, Z_TOP + 4.2), (x2, ty2, HULL_HT + 1.5), 0.14, material='gunmetal', segments=6,
               bevel=0.0)
    F.box(s, 'Hook2', (x2, ty2, HULL_HT + 1.2), (1.4, 1.4, 0.8), material='hazard', bevel=0.0)


def build_arms(s):
    """Service arms from the walls to the hull; the welding heads throw cyan sparks."""
    arms = [(-34.0, 1, 3.0), (-18.0, 1, -1.0), (0.0, 1, 0.0), (-40.0, -1, 0.5), (-26.0, -1, 3.5), (-8.0, -1, -1.5)]
    heads = []
    for k, (x, side, z) in enumerate(arms):
        w, ht, hb, zc = hull_sec(x)
        base = Vector((x, side * (WALL_Y - 1.2), z + 2.0))
        tip = Vector((x, side * (w + 1.4), z))
        elbow = base + (tip - base) * 0.5 + Vector((0, 0, 2.2))
        F.box(s, f'ArmBase{k}', tuple(base), (2.4, 1.2, 2.4), material='paint.graphite', bevel=0.05)
        beam(s, f'ArmA{k}', tuple(base), tuple(elbow), 0.9, material='paint2')
        beam(s, f'ArmB{k}', tuple(elbow), tuple(tip), 0.7, material='paint2')
        F.box(s, f'ArmJoint{k}', tuple(elbow), (1.2, 1.2, 1.2), material='paint.graphite', bevel=0.0)
        F.box(s, f'ArmHead{k}', tuple(tip), (1.4, 1.2, 1.0), material='gunmetal', bevel=0.0)
        heads.append((tip, side))
    return heads


def build_sparks(s, heads):
    sparks = []
    for tip, side in heads:
        for j, (dx, dz) in enumerate(((0.0, 0.0), (0.5, 0.4), (-0.4, 0.5), (0.3, -0.5), (-0.6, -0.2))):
            sz = 0.8 if j == 0 else 0.35
            sparks.append(((tip.x + dx, tip.y - side * 0.95, tip.z + dz), (sz, sz, sz), 0.0))
    # rib-joint welds along the unplated midships
    for i, x in enumerate((-17.0, -23.0, -29.0, -35.0)):
        for (y, z) in ((HULL_W * 0.55 * (1 if i % 2 else -1), HULL_HT - 0.4),):
            sparks.append(((x, y, z + 0.3), (0.4, 0.4, 0.4), 0.0))
    cluster(s, 'Sparks', sparks, 'glow_cyan')
    # work lamps on the wall tops aimed into the dock
    for x in (-50.0, -31.0, -13.0, 6.0):
        for side in (1, -1):
            F.work_lamp(s, f'WallLamp{x:+.0f}{side}', (x, side * (WALL_Y - 1.0), Z_TOP + 1.3),
                        aim=(0.0, -side * 0.7, 0.7), size=1.1)
    # rail lights along the wall tops
    rail = []
    for i in range(24):
        x = WALL_X0 + 1.5 + i * (WALL_X1 - WALL_X0 - 3.0) / 23
        for side in (1, -1):
            rail.append(((x, side * (WALL_Y + 1.25), Z_TOP), (0.5, 0.12, 0.3), 0.0))
    cluster(s, 'RailLights', rail, 'glow_amber')
    # corridor windows (outboard walkway) and wall cabins
    win = []
    for side in (1, -1):
        for i in range(40):
            x = -47.0 + i * 1.5
            if any(abs(x - p) < 0.9 for p in (-44.0, -30.0, -16.0, -2.0, 11.0)):
                continue
            win.append(((x, side * (WALL_Y + 3.93), 2.3), (0.7, 0.12, 0.6), 0.0))
        for i in range(20):
            x = -46.0 + i * 3.0
            win.append(((x, side * (WALL_Y + 2.6), 3.53), (1.2, 1.0, 0.1), 0.0))
    cluster(s, 'CorrWin', win, 'glow_warm')
    for c, x in enumerate(CRANES):
        F.beacon(s, f'CraneBeacon{c}', (x, 0.0, Z_TOP + 4.5), 'glow_amber', size=0.6)
    # portholes and a few lit bays on the plated bow (the crew already living aboard)
    bw = []
    for side in (1, -1):
        for i in range(12):
            x = -12.8 + i * 1.6
            w, ht, hb, zc = hull_sec(x)
            for z in (0.4, 1.8):
                wy = w * (1 - (abs(z - zc) / ht) ** HULL_N) ** (1 / HULL_N)
                bw.append(((x, side * (wy - 0.02), z), (0.7, 0.14, 0.45), 0.0))
        for i in range(6):
            bw.append(((-11.0 + i * 2.0, side * 3.62, HULL_HT + 0.6), (0.9, 0.12, 0.5), 0.0))
    cluster(s, 'BowWin', bw, 'glow_warm')
    F.beacon(s, 'HullBeacon', (-6.0, 0, HULL_HT + 2.3), 'glow_amber', size=0.6)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_walls(s)
    build_workshop(s)
    build_ship(s)
    build_cranes(s)
    heads = build_arms(s)
    build_shop_roof(s)
    s.detail = 1
    build_workshop_details(s)
    build_sparks(s, heads)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
