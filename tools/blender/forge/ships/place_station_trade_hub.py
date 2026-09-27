"""Helios Trade Hub — the market harbour every pilot starts at. Forge rebuild.

Idea: "the market wheel, a harbour of lights". Plan read from the chase camera: a broad ivory
market ring (segmented hall roofs, a teal inlay band, charcoal fender ribs) held on three enclosed
spoke corridors round a stepped concourse drum crowned by the harbour-master's dome. At +X the ring
is broken by the harbour mouth: two breakwater heads (red port, green starboard) joined high up by
an open lattice gate bridge, and under it the lit approach pier runs from the concourse out to the
docking collar (the dock approach socket). The courtyard between drum and ring is the harbour
floor: a charcoal apron carrying teal-ringed berth pads with parked Helios freighters and shuttles,
container yards and gantry cranes, all under a glow of hundreds of warm windows.
Three values: ivory ring halls, drum and ships; market teal carried in bands, pads and freight;
charcoal apron, deck, fenders and machinery.
Overlay contract: the faction overlays (free / mts / scn) hang round and above this body at the
same origin, so the upper deck plane (ring roofs, spoke roofs, drum crown) sits at z ~28, the ring
wall reaches r ~56 at z 19-28 (the SCN cladding band wraps it) and nothing tall stands where the
MTS crowns and SCN bastions go (the 45-degree diagonals and the ring mouth beyond r 50).
Sockets (dock approach, camera focus, structure core) are copied from the live file on export.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_trade_hub'
COLORS = {
    'paint': '#a69d8a',           # Helios ivory (brightest allowed)
    'paint2': '#1a4f4b',          # Helios market teal (#23706a), authored dark: the key light lifts it
    'stripe': '#23706a',
    'hazard': '#a8861c',
    'paint.graphite': '#23282e',  # charcoal
    'paint.primer': '#4a4f4a',    # weathered freight grey
    'paint.hall': '#8e8674',      # hall roofs: ivory a step down so the wide ring does not glare in plan
    'dark': '#15181c',
}

CX = 3.0                      # hub centre (structure core socket x)
APRON_R0, APRON_R1 = 16.0, 41.0
APRON_Z0, APRON_Z1 = 7.6, 9.6
RING_R0, RING_R1 = 37.0, 54.0
RING_Z0, RING_Z1 = 19.0, 27.0
ROOF_Z1 = 28.2                # upper deck plane: overlays sit here
MOUTH = 15.0                  # half-angle of the harbour mouth (deg)
SPOKES = (90.0, 180.0, 270.0)
DOCK_Z = 13.4
BERTH_Z = APRON_Z1 + 3.1      # parked ship centre height


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (CX + r * math.cos(a), r * math.sin(a), z)


# --- local helpers --------------------------------------------------------------------------------

def cluster(s, name, items, material, bevel=0.0):
    """Many small boxes in one mesh (windows, lights, freight): items = (center, size, rot_z)."""
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
    """Box truss between two points: four chords plus zig-zag webs on all four faces."""
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


def ring_body(s, name, r0, r1, z0, z1, a0, a1, segs, top='paint', outer='paint', inner='paint', bottom='paint.graphite',
              cap='paint.graphite', bevel=0.12):
    """Thick annular sector about the hub centre with its own finish per face (top/outer/inner/bottom)."""
    bm = bmesh.new()
    full = abs(a1 - a0) >= 359.9
    n = segs if full else segs + 1
    rows = []
    for i in range(n):
        a = math.radians(a0 + (a1 - a0) * i / segs)
        c, sn = math.cos(a), math.sin(a)
        rows.append([bm.verts.new((CX + r * c, r * sn, z)) for r, z in ((r0, z0), (r1, z0), (r1, z1), (r0, z1))])
    mats = list(dict.fromkeys([top, outer, inner, bottom, cap]))
    kind = {0: bottom, 1: outer, 2: top, 3: inner}
    m = n if full else n - 1
    for i in range(m):
        a, b = rows[i], rows[(i + 1) % n]
        for j in range(4):
            k = (j + 1) % 4
            f = bm.faces.new((a[j], b[j], b[k], a[k]))
            f.material_index = mats.index(kind[j])
    if not full:
        f = bm.faces.new(list(reversed(rows[0])))
        f.material_index = mats.index(cap)
        f = bm.faces.new(rows[-1])
        f.material_index = mats.index(cap)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots(mats), bevel=bevel, smooth_angle=30.0))


def sector_plate(s, name, r0, r1, a0, a1, z0, th, material='paint', steps=6, chamfer=0.25, bevel=0.06,
                 side_material=None):
    pts = [polar(r1, a0 + (a1 - a0) * i / steps)[:2] for i in range(steps + 1)]
    pts += [polar(r0, a1 - (a1 - a0) * i / steps)[:2] for i in range(steps + 1)]
    return F.plate(s, name, pts, z0=z0, thickness=th, material=material, chamfer=chamfer, bevel=bevel,
                   side_material=side_material)


def radial_windows(r, z, count, size, a0=0.0, a1=360.0, skip=None, depth=0.16):
    """Window boxes tangent to a vertical cylinder of radius r about the hub centre."""
    out = []
    for i in range(count):
        a = a0 + (a1 - a0) * (i + 0.5) / count
        if skip and skip(a % 360):
            continue
        x, y, _ = polar(r + 0.04, a)
        out.append(((x, y, z), (depth, size[0], size[1]), math.radians(a)))
    return out


def is_plaza(k):
    return k % 4 == 1


def in_mouth(a):
    a = (a + 180.0) % 360.0 - 180.0
    return abs(a) < MOUTH + 1.0


def near_spoke(a, half=6.0):
    return any(abs(((a - sp) + 180) % 360 - 180) < half for sp in SPOKES)


class Placed:
    """Build a sub-assembly at the origin (nose +X), then move every part it made to pos/heading."""

    def __init__(self, s, pos, heading_deg):
        self.s, self.pos, self.h = s, Vector(pos), math.radians(heading_deg)

    def __enter__(self):
        self.n0 = len(self.s.objects)
        return self

    def __exit__(self, *exc):
        m = Matrix.Translation(self.pos) @ Matrix.Rotation(self.h, 4, 'Z')
        for obj in self.s.objects[self.n0:]:
            obj.data.transform(m)
            obj.data.update()
        return False


# --- the Helios traffic: parked freighters and shuttles --------------------------------------------

def freighter(s, n, cargo=('paint2', 'paint', 'paint2'), lit=False):
    """16 m Helios box freighter: ivory hull, teal bands, glass brow, container spine, pod drives."""
    F.loft(s, n, [
        dict(x=-8.0, w=1.8, ht=1.6, hb=1.5, n=2.6),
        dict(x=-7.3, w=2.3, ht=2.0, hb=1.9, n=2.8),
        dict(x=4.6, w=2.3, ht=2.0, hb=1.9, n=2.8),
        dict(x=6.9, w=1.8, ht=1.6, hb=1.5, zc=0.1, n=2.5),
        dict(x=8.3, w=0.8, ht=0.7, hb=0.7, zc=0.1, n=2.2),
    ], material='paint', belly='paint.graphite', back_material='dark', count=24, bevel=0.0)
    F.band(s, n, (-6.2, 0, 0), (1, 0, 0), 0.7, 'paint2', inset=0.04, depth=0.06)
    F.band(s, n, (5.4, 0, 0), (1, 0, 0), 0.5, 'paint2', inset=0.04, depth=0.06)
    F.band(s, n, (7.3, 0, 0.1), (1, 0, 0), 1.1, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    for k, fin in enumerate(cargo):
        x = -4.6 + k * 3.1
        F.box(s, f'{n}Box{k}', (x, 0, 2.95), (2.8, 3.4, 1.9), material=fin, bevel=0.05)
    F.box(s, f'{n}Spine', (-1.5, 0, 2.05), (10.0, 1.2, 0.5), material='paint.graphite', bevel=0.0)
    for y in (-2.9, 2.9):
        F.cylinder(s, f'{n}Pod{y:+.0f}', (-7.6, y, -0.2), (-2.2, y, -0.2), 0.95, 0.85, material='paint', segments=12,
                   bevel=0.0)
        F.band(s, f'{n}Pod{y:+.0f}', (-3.4, y, 0), (1, 0, 0), 0.5, 'paint2')
        F.box(s, f'{n}Pylon{y:+.0f}', (-4.9, y * 0.72, -0.2), (2.6, 1.6, 0.5), material='paint.graphite', bevel=0.0)
        F.nozzle(s, f'{n}Drive{y:+.0f}', (-8.1, y, -0.2), 0.75, 0.7, material='gunmetal',
                 glow='glow_drive' if lit else 'dark', segments=12)
    s.detail = 1
    win = []
    for side in (1, -1):
        for i in range(7):
            win.append(((-5.6 + i * 1.5, side * 2.31, 0.5), (0.6, 0.1, 0.35), 0.0))
    cluster(s, f'{n}Win', win, 'glow_warm')
    F.light(s, f'{n}NavP', (3.0, 2.35, 0.9), 'glow_red', size=0.3)
    F.light(s, f'{n}NavS', (3.0, -2.35, 0.9), 'glow_green', size=0.3)
    F.light(s, f'{n}Beacon', (-7.0, 0, 2.1), 'glow_amber', size=0.3)
    s.detail = 0


def shuttle(s, n, stripe='paint2'):
    """9 m Helios shuttle: rounded ivory body, teal stripe, glass canopy, twin drives."""
    F.loft(s, n, [
        dict(x=-4.4, w=1.1, ht=1.0, hb=0.9, n=2.4),
        dict(x=-3.6, w=1.55, ht=1.3, hb=1.1, n=2.6),
        dict(x=2.2, w=1.55, ht=1.3, hb=1.1, n=2.6),
        dict(x=3.8, w=1.0, ht=0.9, hb=0.8, zc=-0.05, n=2.3),
        dict(x=4.6, w=0.4, ht=0.35, hb=0.35, zc=-0.1, n=2.1),
    ], material='paint', belly='paint.graphite', back_material='dark', count=24, bevel=0.0)
    F.band(s, n, (3.1, 0, 0), (1, 0, 0), 1.0, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    F.band(s, n, (-1.2, 0, 0), (1, 0, 0), 0.6, stripe, inset=0.03, depth=0.05)
    F.plate(s, f'{n}Wing', [(-3.8, 1.4), (-1.0, 1.4), (-2.2, 2.9), (-3.9, 2.9)], z0=-0.35, thickness=0.3,
            material='paint', chamfer=0.08, bevel=0.03, mirror=True)
    for y in (-0.7, 0.7):
        F.nozzle(s, f'{n}Drive{y:+.1f}', (-4.7, y, 0.0), 0.45, 0.5, material='gunmetal', glow='dark', segments=10)
    s.detail = 1
    win = [((-2.8 + i * 0.9, side * 1.56, 0.35), (0.45, 0.1, 0.3), 0.0) for i in range(5) for side in (1, -1)]
    cluster(s, f'{n}Win', win, 'glow_warm')
    F.light(s, f'{n}NavP', (-3.0, 2.9, -0.2), 'glow_red', size=0.22)
    F.light(s, f'{n}NavS', (-3.0, -2.9, -0.2), 'glow_green', size=0.22)
    s.detail = 0


def cradle(s, n, length, belly):
    """Two saddles under a parked hull, down to the apron (local, before placement)."""
    for x in (-length * 0.28, length * 0.28):
        F.box(s, f'{n}Saddle{x:+.0f}', (x, 0, -belly - 0.6 - 0.05), (1.4, 2.8, 1.3), material='paint.graphite',
              bevel=0.05)


# --- build ------------------------------------------------------------------------------------

def build_drum(s):
    # keel below the apron, the concourse drum, the upper hub and the harbour-master's crown
    F.cylinder(s, 'Keel', (CX, 0, -4.2), (CX, 0, APRON_Z0), 10.5, 13.5, material='paint.graphite', segments=48,
               bevel=0.0)
    F.band(s, 'Keel', (CX, 0, 1.2), (0, 0, 1), 1.0, 'paint2', inset=0.06, depth=0.18)
    F.cylinder(s, 'KeelFoot', (CX, 0, -4.2), (CX, 0, -5.4), 7.5, 5.8, material='gunmetal', segments=32,
               cap_material='dark', bevel=0.0)
    F.cylinder(s, 'Concourse', (CX, 0, APRON_Z0), (CX, 0, 20.0), 17.0, material='paint', segments=64, bevel=0.0)
    F.band(s, 'Concourse', (CX, 0, 13.6), (0, 0, 1), 3.6, 'paint.graphite', inset=0.08, depth=-0.2)
    F.band(s, 'Concourse', (CX, 0, 17.9), (0, 0, 1), 0.9, 'paint2', inset=0.06, depth=0.18)
    F.band(s, 'Concourse', (CX, 0, 10.4), (0, 0, 1), 0.6, 'paint2', inset=0.05, depth=0.12)
    # shoulder deck round the upper hub (the visible collar in plan)
    F.cylinder(s, 'Shoulder', (CX, 0, 20.0), (CX, 0, 20.7), 17.6, 17.2, material='paint.graphite', segments=64,
               bevel=0.0)
    F.cylinder(s, 'Upper', (CX, 0, 20.7), (CX, 0, 27.4), 13.2, 12.4, material='paint', segments=64, bevel=0.0)
    F.band(s, 'Upper', (CX, 0, 24.6), (0, 0, 1), 1.0, 'paint2', inset=0.05, depth=0.14)
    F.cylinder(s, 'Crown', (CX, 0, 27.4), (CX, 0, ROOF_Z1), 13.6, 13.0, material='paint.graphite', segments=64,
               bevel=0.0)
    F.ring(s, 'CrownInlay', (CX, 0, ROOF_Z1), 10.4, 0.35, axis=(0, 0, 1), material='paint2', segments=64, sides=6)
    # harbour-master's dome: a glazed control drum under an ivory cap, mast and dish
    F.cylinder(s, 'Tower', (CX, 0, ROOF_Z1), (CX, 0, 31.2), 6.2, 5.8, material='paint', segments=40, bevel=0.0)
    F.band(s, 'Tower', (CX, 0, 30.0), (0, 0, 1), 1.3, 'glass', inset=0.04, depth=-0.08)
    F.cylinder(s, 'TowerRoof', (CX, 0, 31.2), (CX, 0, 31.8), 6.6, 6.2, material='paint.graphite', segments=40,
               bevel=0.0)
    # the lighthouse: the harbour's landmark, a tapered ivory spire with a lit lantern
    F.cylinder(s, 'Spire', (CX, 0, 31.8), (CX, 0, 40.2), 3.3, 2.5, material='paint', segments=28, bevel=0.0)
    for zb in (34.0, 37.4):
        F.band(s, 'Spire', (CX, 0, zb), (0, 0, 1), 0.8, 'paint2', inset=0.04, depth=0.12)
    F.cylinder(s, 'Gallery', (CX, 0, 40.2), (CX, 0, 40.8), 3.9, 3.9, material='paint.graphite', segments=28,
               bevel=0.0)
    F.ring(s, 'GalleryRail', (CX, 0, 41.5), 3.7, 0.08, axis=(0, 0, 1), material='gunmetal', segments=28, sides=4)
    F.cylinder(s, 'Lantern', (CX, 0, 40.8), (CX, 0, 43.0), 2.3, material='glow_warm', segments=16, bevel=0.0)
    lmull = [((CX + 2.35 * math.cos(math.radians(45 * k)), 2.35 * math.sin(math.radians(45 * k)), 41.9),
              (0.28, 0.28, 2.2), 0.0) for k in range(8)]
    cluster(s, 'LanternMullion', lmull, 'paint.graphite')
    F.cylinder(s, 'LanternCap', (CX, 0, 43.0), (CX, 0, 44.6), 2.9, 0.5, material='paint', segments=24, bevel=0.0)
    F.cylinder(s, 'Mast', (CX, 0, 44.6), (CX, 0, 48.6), 0.3, 0.16, material='gunmetal', segments=8, bevel=0.0)
    F.ring(s, 'MastRing', (CX, 0, 46.4), 0.8, 0.1, axis=(0, 0, 1), material='gunmetal', segments=12, sides=4)
    F.cylinder(s, 'DishMast', (CX - 8.5, 5.5, ROOF_Z1), (CX - 8.5, 5.5, 31.0), 0.4, material='gunmetal', segments=10,
               bevel=0.0)
    F.dish(s, 'Dish', (CX - 8.5, 5.5, 31.0), 2.6, 0.8, axis=(-0.5, 0.4, 1.0), material='gunmetal', face='paint')
    F.sensor_dome(s, 'SensorA', (CX + 8.5, -6.0, ROOF_Z1), 1.4)
    F.sensor_dome(s, 'SensorB', (CX - 3.0, -10.0, ROOF_Z1), 1.0)
    # the drum stands on the apron: buttresses between the apron and the concourse
    for k in range(12):
        a = 15 + 30 * k
        p0 = polar(16.8, a, APRON_Z1)
        F.box(s, f'Buttress{k}', polar(17.4, a, APRON_Z1 + 1.1), (1.6, 1.6, 2.2), material='paint.graphite',
              rot_z=math.radians(a), bevel=0.0, taper=0.8)
        del p0


def build_drum_details(s):
    win = []
    for z in (11.3, 16.1, 19.0):
        win += radial_windows(17.0, z, 60, (1.1, 0.5), skip=lambda a: near_spoke(a, 5.0))
    cluster(s, 'DrumWin', win, 'glow_warm')
    # the lit concourse: tall glazing all round the recessed gallery band
    gallery = radial_windows(16.82, 13.6, 56, (1.35, 2.6), depth=0.2)
    cluster(s, 'Gallery', gallery, 'glow_warm')
    mull = radial_windows(16.9, 13.6, 56, (0.35, 3.4), a0=360.0 / 112, a1=360.0 + 360.0 / 112, depth=0.3)
    cluster(s, 'GalleryMullion', mull, 'paint.graphite')
    up = []
    for z in (22.4, 26.2):
        up += radial_windows(12.85 if z < 24 else 12.5, z, 48, (0.7, 0.5), skip=lambda a: near_spoke(a, 7.0))
    cluster(s, 'UpperWin', up, 'glow_warm')
    tower = radial_windows(6.1, 29.0, 24, (0.8, 0.5))
    cluster(s, 'TowerWin', tower, 'glow_warm')
    # a cyan market halo round the crown and cyan tech on the tower
    F.ring(s, 'Halo', (CX, 0, ROOF_Z1 + 0.1), 12.9, 0.16, axis=(0, 0, 1), material='glow_cyan', segments=64, sides=6)
    F.light(s, 'MastTip', (CX, 0, 48.7), 'glow_red', size=0.5)
    F.beacon(s, 'TowerBeacon', (CX + 4.6, 2.4, 31.8), 'glow_amber', size=0.7)
    for k in range(4):
        x, y, _ = polar(5.9, 45 + 90 * k)
        F.light(s, f'TowerCyan{k}', (x, y, 31.9), 'glow_cyan', size=0.35)
    F.antenna(s, 'CrownMastA', polar(10.5, 135, ROOF_Z1), 4.0)
    F.antenna(s, 'CrownMastB', polar(10.5, 315, ROOF_Z1), 3.2, tip='glow_green')
    for k in range(2):
        F.vent(s, f'CrownVent{k}', polar(9.5, 22.5 + 180 * k, ROOF_Z1 + 0.05), (2.4, 1.6, 0.3), slats=5)
    # crown roof: recessed service panels between the spokes and a ring of warm deck lights
    cpan = []
    for k in range(12):
        a = 15 + 30 * k
        if near_spoke(a, 10.0):
            continue
        x, y, _ = polar(9.8, a)
        cpan.append(((x, y, ROOF_Z1 + 0.03), (3.6, 2.2, 0.08), math.radians(a)))
    cluster(s, 'CrownPanels', cpan, 'dark')
    dl = []
    for k in range(24):
        x, y, _ = polar(7.4, 7.5 + 15 * k)
        dl.append(((x, y, ROOF_Z1 + 0.05), (0.4, 0.4, 0.1), 0.0))
    cluster(s, 'CrownDeckLights', dl, 'glow_warm')
    lower = radial_windows(12.2, 3.6, 40, (0.7, 0.45))
    cluster(s, 'KeelWin', lower, 'glow_warm')
    F.light(s, 'KeelBeacon', (CX, 0, -5.6), 'glow_amber', size=0.8)


def build_apron(s):
    # the harbour floor: a charcoal apron annulus with an underframe
    ring_body(s, 'Apron', APRON_R0, APRON_R1, APRON_Z0, APRON_Z1, 0, 360, 96, top='paint.graphite',
              outer='paint.graphite', inner='paint.graphite', bottom='gunmetal', bevel=0.0)
    F.ring(s, 'ApronEdge', (CX, 0, APRON_Z1), APRON_R1 - 0.2, 0.22, axis=(0, 0, 1), material='hazard', segments=96,
           sides=6)
    ribs = []
    for k in range(16):
        a = 11.25 + 22.5 * k
        ribs.append((polar(APRON_R0 - 1.0, a, APRON_Z0 - 0.5), polar(APRON_R1 - 0.6, a, APRON_Z0 - 0.5)))
    beams(s, 'ApronRibs', ribs, 0.9, 'gunmetal')
    F.ring(s, 'ApronHoop', (CX, 0, APRON_Z0 - 0.6), 30.0, 0.45, axis=(0, 0, 1), material='gunmetal', segments=64,
           sides=6)


def pad(s, n, center, heading, size):
    """Berth pad: dark recessed plate with a teal border and green corner lights (world coords)."""
    x, y, z = center
    L, W = size
    rz = math.radians(heading)
    F.box(s, f'{n}Border', (x, y, z + 0.06), (L + 1.2, W + 1.2, 0.12), material='paint2', rot_z=rz, bevel=0.0)
    F.box(s, f'{n}Floor', (x, y, z + 0.1), (L, W, 0.14), material='dark', rot_z=rz, bevel=0.0)
    s.detail = 1
    lights = []
    c, sn = math.cos(rz), math.sin(rz)
    for dx in (-L / 2 - 0.3, L / 2 + 0.3):
        for dy in (-W / 2 - 0.3, W / 2 + 0.3):
            lights.append(((x + dx * c - dy * sn, y + dx * sn + dy * c, z + 0.2), (0.35, 0.35, 0.16), rz))
    cluster(s, f'{n}Lights', lights, 'glow_green')
    s.detail = 0


def build_berths(s):
    """Courtyard berths on the diagonals and along the pier; every hull on saddles and a gangway."""
    berths = [  # (angle, radius, kind)
        (45.0, 28.0, 'F'), (135.0, 28.0, 'F'), (225.0, 28.0, 'S'), (315.0, 28.0, 'F'),
        (112.0, 29.5, 'S'), (248.0, 29.5, 'S'),
    ]
    cargos = [('paint2', 'paint', 'paint2'), ('paint', 'paint2', 'paint.primer'), None,
              ('paint.primer', 'paint2', 'paint2')]
    for k, (a, r, kind) in enumerate(berths):
        pos = polar(r, a, BERTH_Z)
        heading = a + 90.0
        L = 17.0 if kind == 'F' else 10.0
        pad(s, f'Pad{k}', polar(r, a, APRON_Z1), heading, (L, 6.8 if kind == 'F' else 5.0))
        with Placed(s, pos, heading):
            if kind == 'F':
                freighter(s, f'Ship{k}', cargo=cargos[k] or ('paint2', 'paint', 'paint2'))
                cradle(s, f'Ship{k}', 16.0, 1.9)
            else:
                shuttle(s, f'Ship{k}', stripe='paint2')
                cradle(s, f'Ship{k}', 9.0, 1.1)
        # gangway from the ship's inboard flank to the concourse
        half = 2.3 if kind == 'F' else 1.55
        F.box(s, f'Gang{k}', polar((17.0 + r - half) / 2, a, BERTH_Z - 0.2), (r - half - 17.0 + 0.6, 1.8, 1.6),
              material='paint.graphite', rot_z=math.radians(a), bevel=0.0)
        F.band(s, f'Gang{k}', polar((17.0 + r - half) / 2, a, 0), (math.cos(math.radians(a)), math.sin(math.radians(a)), 0),
               0.5, 'paint2')
    # two freighters moored either side of the approach pier
    for k, y in enumerate((8.6, -8.6)):
        pos = (33.0, y, BERTH_Z)
        pad(s, f'PierPad{k}', (33.0, y, APRON_Z1), 0.0, (17.0, 6.8))
        with Placed(s, pos, 0.0):
            freighter(s, f'PierShip{k}', cargo=(('paint', 'paint2', 'paint') if k == 0 else ('paint2', 'paint.primer', 'paint2')))
            cradle(s, f'PierShip{k}', 16.0, 1.9)
        sy = 1 if y > 0 else -1
        F.box(s, f'PierGang{k}', (33.0, sy * 4.45, BERTH_Z - 0.2), (1.8, 2.9, 1.6), material='paint.graphite', bevel=0.0)


def container_stack(s, name, center, heading, cols, rows, levels, pattern):
    """Tangential container stack on the apron. pattern(i, j, l) -> finish or None."""
    x0, y0, z0 = center
    rz = math.radians(heading)
    c, sn = math.cos(rz), math.sin(rz)
    L, W, H = 6.0, 2.5, 2.5
    by_fin, frames = {}, []
    for i in range(cols):
        for j in range(rows):
            for lv in range(levels):
                fin = pattern(i, j, lv)
                if not fin:
                    continue
                lx = (i - (cols - 1) / 2) * (L + 0.3)
                ly = (j - (rows - 1) / 2) * (W + 0.2)
                p = (x0 + lx * c - ly * sn, y0 + lx * sn + ly * c, z0 + H / 2 + lv * (H + 0.05))
                by_fin.setdefault(fin, []).append((p, (L - 0.3, W, H - 0.1), rz))
                for e in (-1, 1):
                    q = (p[0] + e * (L / 2 - 0.12) * c, p[1] + e * (L / 2 - 0.12) * sn, p[2])
                    frames.append((q, (0.26, W + 0.08, H), rz))
    for fin, items in by_fin.items():
        cluster(s, f'{name}_{fin.replace(".", "_")}', items, fin)
    cluster(s, f'{name}_Frames', frames, 'paint.graphite')


def gantry(s, name, a, r0, r1, z_top, trolley_t=0.5, load=None):
    """Radial gantry crane over a container yard: two portal legs, a girder, trolley and hook."""
    tang = Vector((-math.sin(math.radians(a)), math.cos(math.radians(a)), 0))
    for r in (r0, r1):
        base = Vector(polar(r, a, APRON_Z1))
        for e in (-1, 1):
            p = base + tang * e * 4.2
            beam(s, f'{name}Leg{r:.0f}{e:+d}', tuple(p), tuple(base + tang * e * 1.2 + Vector((0, 0, z_top - APRON_Z1))),
                 0.8, material='paint.graphite')
            F.box(s, f'{name}Foot{r:.0f}{e:+d}', tuple(p + Vector((0, 0, 0.4))), (1.6, 1.6, 0.8),
                  material='gunmetal', bevel=0.0)
        F.box(s, f'{name}Head{r:.0f}', tuple(base + Vector((0, 0, z_top - APRON_Z1))), (1.8, 3.6, 1.4),
              material='paint.graphite', rot_z=math.radians(a), bevel=0.05)
    F.sweep(s, f'{name}Girder', [polar(r0 - 1.0, a, z_top + 0.9), polar(r1 + 1.0, a, z_top + 0.9)], 1.6, 1.6,
            material='paint', bevel=0.05)
    F.band(s, f'{name}Girder', polar(r0 - 0.2, a, 0), (math.cos(math.radians(a)), math.sin(math.radians(a)), 0), 0.8,
           'hazard')
    F.band(s, f'{name}Girder', polar(r1 + 0.2, a, 0), (math.cos(math.radians(a)), math.sin(math.radians(a)), 0), 0.8,
           'hazard')
    rt = r0 + (r1 - r0) * trolley_t
    F.box(s, f'{name}Trolley', polar(rt, a, z_top + 2.0), (2.4, 2.6, 1.0), material='paint2',
          rot_z=math.radians(a), bevel=0.05)
    F.box(s, f'{name}Cab', tuple(Vector(polar(rt, a, z_top - 0.2)) + tang * 1.9),
          (1.6, 1.4, 1.2), material='paint', rot_z=math.radians(a), bevel=0.05)
    zl = z_top - 4.5 if load else z_top - 2.0
    F.cylinder(s, f'{name}Line', polar(rt, a, z_top + 0.1), polar(rt, a, zl + 0.6), 0.1, material='gunmetal',
               segments=6, bevel=0.0)
    F.box(s, f'{name}Spreader', polar(rt, a, zl + 0.4), (1.2, 6.0, 0.4), material='hazard', rot_z=math.radians(a),
          bevel=0.0)
    if load:
        F.box(s, f'{name}Load', polar(rt, a, zl - 1.0), (2.4, 5.6, 2.4), material=load, rot_z=math.radians(a),
              bevel=0.04)
    s.detail = 1
    F.light(s, f'{name}Beacon', tuple(Vector(polar(r1 + 0.6, a, z_top + 1.9))), 'glow_amber', size=0.45)
    F.light(s, f'{name}Beacon2', tuple(Vector(polar(r0 - 0.6, a, z_top + 1.9))), 'glow_amber', size=0.45)
    s.detail = 0


def build_yards(s):
    yards = [(72.0, 'A'), (160.0, 'B'), (200.0, 'C'), (288.0, 'D'), (26.0, 'E'), (334.0, 'F')]
    pats = {
        'A': lambda i, j, l: ('paint2', 'paint', 'paint.primer')[(i + j + l) % 3] if l < (2 if i != 1 else 3) else None,
        'B': lambda i, j, l: ('paint2', 'paint2', 'paint')[(i * 2 + j + l) % 3] if l < 2 - (i == 0 and j == 1) else None,
        'C': lambda i, j, l: ('paint', 'paint2', 'paint.graphite')[(i + 2 * j + l) % 3] if l < 1 + (i + j) % 2 + 1 else None,
        'D': lambda i, j, l: ('paint.primer', 'paint2', 'paint')[(i + j * 2 + l) % 3] if l < 2 else None,
        'E': lambda i, j, l: ('paint2', 'paint')[(i + j + l) % 2] if l < 2 - (i == 1 and j == 0) else None,
        'F': lambda i, j, l: ('paint', 'paint2')[(i + l) % 2] if l < 1 + (j == 0) else None,
    }
    for a, key in yards:
        r = 29.0 if key not in 'EF' else 31.0
        heading = a + 90.0
        cols, rows = (2, 3) if key not in 'EF' else (2, 2)
        container_stack(s, f'Yard{key}', polar(r, a, APRON_Z1), heading, cols, rows, 3, pats[key])
    gantry(s, 'CraneA', 72.0, 22.0, 36.0, 17.2, 0.35, load='paint2')
    gantry(s, 'CraneC', 200.0, 22.0, 36.0, 17.2, 0.7, load=None)
    gantry(s, 'CraneD', 288.0, 22.0, 36.0, 17.2, 0.55, load='paint')


def build_ring(s):
    a0, a1 = MOUTH, 360.0 - MOUTH
    ring_body(s, 'Ring', RING_R0, RING_R1, RING_Z0, RING_Z1, a0, a1, 96, top='paint.graphite', outer='paint',
              inner='paint', bottom='paint.graphite', cap='paint.graphite', bevel=0.0)
    F.band(s, 'Ring', (CX, 0, 21.3), (0, 0, 1), 1.1, 'paint2', inset=0.06, depth=0.18)
    # market hall roofs: ivory sectors with charcoal gaps between them (the ring's rhythm in plan)
    n = 22
    span = (a1 - a0) / n
    for k in range(n):
        b0 = a0 + k * span + 1.0
        b1 = a0 + (k + 1) * span - 1.0
        if is_plaza(k):
            # market plaza: an open teal-floored square with ivory kiosks (built in the details pass)
            sector_plate(s, f'Plaza{k}', RING_R0 + 1.6, RING_R1 - 4.2, b0, b1, RING_Z1, 0.35,
                         material='paint2', steps=3, chamfer=0.08, bevel=0.0)
            continue
        sector_plate(s, f'Hall{k}', RING_R0 + 1.2, RING_R1 - 3.6, b0, b1, RING_Z1, ROOF_Z1 - RING_Z1,
                     material='paint.hall', steps=3, chamfer=0.3, bevel=0.05)
        am = math.radians((b0 + b1) / 2)
        F.band(s, f'Hall{k}', polar(45.0, (b0 + b1) / 2, 0), (-math.sin(am), math.cos(am), 0), 1.1, 'glass',
               facing=(0, 0, 1), min_facing=0.6, inset=0.04, depth=-0.06)
    # teal inlay walk round the outer edge, amber-edged
    ring_body(s, 'TealWalk', RING_R1 - 3.0, RING_R1 - 1.2, RING_Z1, RING_Z1 + 0.2, a0 + 0.6, a1 - 0.6, 96,
              top='paint2', outer='paint2', inner='paint2', bottom='paint2', cap='paint2', bevel=0.0)
    # fender ribs on the outer wall (the SCN cladding band closes on them)
    fend = []
    for k in range(30):
        a = a0 + 3.0 + k * (a1 - a0 - 6.0) / 29
        x, y, _ = polar(RING_R1 + 0.7, a)
        fend.append(((x, y, (RING_Z0 + RING_Z1) / 2 + 0.3), (1.6, 1.8, RING_Z1 - RING_Z0 + 0.4), math.radians(a)))
    cluster(s, 'Fenders', fend, 'paint.graphite')
    # ring supports: 16 columns to the apron with knee braces (the old hub's supported bays)
    cols, braces = [], []
    for k in range(16):
        a = 11.25 + 22.5 * k
        if in_mouth(a):
            continue
        p0 = polar(39.0, a, APRON_Z1)
        p1 = polar(39.0, a, RING_Z0)
        cols.append((p0, p1))
        braces.append((polar(39.0, a, RING_Z0 - 4.0), polar(46.0, a, RING_Z0)))
        braces.append((polar(39.0, a, APRON_Z1 + 1.5), polar(32.0, a, APRON_Z1)))
    beams(s, 'Columns', cols, 1.5, 'paint.graphite')
    beams(s, 'Braces', braces, 0.7, 'gunmetal')
    # breakwater heads at the mouth: ivory towers from the apron to the deck plane, hazard banded
    for side, lamp in ((1, 'glow_red'), (-1, 'glow_green')):
        a = side * (MOUTH + 3.4)
        c = polar((RING_R0 + RING_R1) / 2 + 1.0, a)
        F.box(s, f'Head{side:+d}', (c[0], c[1], (APRON_Z1 + ROOF_Z1) / 2 - 1.0), (RING_R1 - RING_R0 + 1.5, 7.2,
              ROOF_Z1 - APRON_Z1 - 1.8), material='paint', rot_z=math.radians(a), bevel=0.15)
        F.band(s, f'Head{side:+d}', (0, 0, 16.0), (0, 0, 1), 1.6, 'hazard', inset=0.06, depth=0.15)
        F.band(s, f'Head{side:+d}', (0, 0, 12.2), (0, 0, 1), 0.8, 'paint2', inset=0.05, depth=0.12)
        F.box(s, f'HeadCap{side:+d}', (c[0], c[1], ROOF_Z1 - 0.4), (RING_R1 - RING_R0 + 0.5, 6.4, 1.0),
              material='paint.graphite', rot_z=math.radians(a), bevel=0.1)
        tip = polar(RING_R1 + 0.2, a)
        F.cylinder(s, f'HeadLampPost{side:+d}', (tip[0], tip[1], ROOF_Z1), (tip[0], tip[1], ROOF_Z1 + 1.2), 0.5,
                   material='gunmetal', segments=10, bevel=0.0)
        F.light(s, f'HeadLamp{side:+d}', (tip[0], tip[1], ROOF_Z1 + 1.4), lamp, size=1.1)
        F.light(s, f'HeadLampLow{side:+d}', polar(RING_R1 + 1.0, a, 12.0), lamp, size=0.9)
    # the gate bridge: an open lattice span across the mouth at the deck plane
    for dz, rr in ((0.0, RING_R0 + 3.0), (0.0, RING_R1 - 3.0)):
        pts = [polar(rr, -(MOUTH + 1.5) + 2 * (MOUTH + 1.5) * i / 6, 25.8) for i in range(7)]
        for i in range(6):
            truss(s, f'Gate{rr:.0f}_{i}', pts[i], pts[i + 1], 2.6, 2.6, 2, material='gunmetal', chord=0.5, web=0.28)
    gate_ties = []
    for i in range(7):
        a = -(MOUTH + 1.5) + 2 * (MOUTH + 1.5) * i / 6
        gate_ties.append((polar(RING_R0 + 3.0, a, 27.1), polar(RING_R1 - 3.0, a, 27.1)))
    beams(s, 'GateTies', gate_ties, 0.6, 'gunmetal')
    sector_plate(s, 'GateWalk', RING_R0 + 7.0, RING_R0 + 10.0, -(MOUTH + 1.5), MOUTH + 1.5, 27.0, 0.4,
                 material='paint2', steps=8, chamfer=0.08, bevel=0.0)


def build_ring_details(s):
    a0, a1 = MOUTH, 360.0 - MOUTH
    skip_heads = lambda a: in_mouth(a) or abs(((a + 180) % 360) - 180) < MOUTH + 7.5  # noqa: E731
    out = []
    for z in (19.9, 23.2, 25.3):
        out += radial_windows(RING_R1, z, 150, (1.35, 0.5), skip=skip_heads)
    # the teal band row stays dark on z 21.3, the 22.7 row is a thin strip
    cluster(s, 'RingWinOut', out, 'glow_warm')
    inn = []
    for z in (21.2, 24.6):
        inn += radial_windows(RING_R0, z, 110, (1.3, 0.55), skip=lambda a: in_mouth(a) or near_spoke(a, 5.0),
                              depth=0.16)
    for i, it in enumerate(inn):
        c, sz, rz = it
        inn[i] = ((c[0] - 0.08 * math.cos(rz), c[1] - 0.08 * math.sin(rz), c[2]), sz, rz)
    cluster(s, 'RingWinIn', inn, 'glow_warm')
    # skylights on the market hall roofs, and amber rim lights along the outer deck edge
    sky = []
    n = 22
    span = (a1 - a0) / n
    kiosks, klights = [], []
    for k in range(n):
        if is_plaza(k):
            for j in range(3):
                aa = a0 + (k + 0.28 + 0.22 * j) * span
                for r in (RING_R0 + 4.0, RING_R0 + 9.0):
                    x, y, _ = polar(r, aa)
                    kiosks.append(((x, y, RING_Z1 + 0.35 + 0.7), (1.6, 1.6, 1.4), math.radians(aa)))
                    klights.append(((x, y, RING_Z1 + 1.8), (1.2, 1.2, 0.14), math.radians(aa)))
            for j in range(4):
                aa = a0 + (k + 0.2 + 0.2 * j) * span
                x, y, _ = polar(RING_R0 + 6.5, aa)
                klights.append(((x, y, RING_Z1 + 0.4), (0.5, 0.5, 0.12), 0.0))
            continue
        for j in range(2):
            aa = a0 + (k + 0.33 + 0.34 * j) * span
            for r in (RING_R0 + 3.6, RING_R0 + 7.0, RING_R0 + 10.2):
                x, y, _ = polar(r, aa)
                sky.append(((x, y, ROOF_Z1 + 0.02), (2.2, 1.4, 0.12), math.radians(aa)))
    cluster(s, 'Skylights', sky, 'glow_warm')
    cluster(s, 'Kiosks', kiosks, 'paint', bevel=0.05)
    cluster(s, 'KioskLights', klights, 'glow_warm')
    rim = []
    for k in range(90):
        a = a0 + 1.0 + k * (a1 - a0 - 2.0) / 89
        x, y, _ = polar(RING_R1 - 0.35, a)
        rim.append(((x, y, RING_Z1 + 0.2), (0.3, 0.5, 0.25), math.radians(a)))
    cluster(s, 'RimLights', rim, 'glow_amber')
    # roof plant between halls: vents and little antenna masts
    for k in range(0, 22, 4):
        aa = a0 + (k + 1.0) * span
        F.vent(s, f'HallVent{k}', polar(RING_R1 - 5.9, aa - span * 0.5, RING_Z1 + 0.12), (1.8, 2.2, 0.3), slats=4)
    for k, aa in enumerate((64.0, 118.0, 244.0, 298.0)):
        F.antenna(s, f'RingMast{k}', polar(RING_R0 + 1.6, aa, ROOF_Z1), 3.0,
                  tip='glow_red' if aa < 180 else 'glow_green')
    # work lamps on the inner edge lighting the harbour floor
    for k in range(4):
        a = 45 + 90 * k + 22.0
        x, y, _ = polar(RING_R0 - 0.3, a)
        dx, dy = -(x - CX), -y
        ln = math.hypot(dx, dy)
        F.work_lamp(s, f'RingLamp{k}', (x, y, RING_Z0 - 0.8), aim=(dx / ln * 0.6, dy / ln * 0.6, 0.5), size=1.0)
    hw = []
    for side in (1, -1):
        a = side * (MOUTH + 3.4)
        rad = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0))
        tang = Vector((-rad.y, rad.x, 0))
        c = Vector(polar((RING_R0 + RING_R1) / 2 + 1.0, a))
        for z in (12.6, 18.4, 20.6, 22.8, 25.0):
            for i in range(9):
                u = -7.6 + i * 1.9
                p = c + rad * u - tang * side * 3.63
                hw.append(((p.x, p.y, z), (1.2, 0.12, 0.55), math.radians(a)))
            p = c + rad * 9.28
            for j in range(3):
                q = p + tang * (j - 1) * 2.0
                hw.append(((q.x, q.y, z), (0.12, 1.2, 0.55), math.radians(a)))
    cluster(s, 'HeadWin', hw, 'glow_warm')
    gate = []
    for i in range(12):
        a = -(MOUTH + 1.0) + 2 * (MOUTH + 1.0) * (i + 0.5) / 12
        for r in (RING_R0 + 3.0, RING_R1 - 3.0):
            x, y, _ = polar(r, a)
            gate.append(((x, y, 27.2), (0.35, 0.35, 0.2), 0.0))
    cluster(s, 'GateLights', gate, 'glow_amber')


def build_spokes(s):
    for a in SPOKES:
        r0, r1 = 12.0, RING_R0 + 1.0
        c = polar((r0 + r1) / 2, a, 24.8)
        F.box(s, f'Spoke{a:.0f}', c, (r1 - r0, 8.4, 6.2), material='paint', rot_z=math.radians(a), bevel=0.15)
        F.band(s, f'Spoke{a:.0f}', polar(22.0, a, 0), (math.cos(math.radians(a)), math.sin(math.radians(a)), 0), 1.2,
               'paint2', inset=0.05, depth=0.14)
        F.band(s, f'Spoke{a:.0f}', polar(31.0, a, 0), (math.cos(math.radians(a)), math.sin(math.radians(a)), 0), 1.2,
               'paint2', inset=0.05, depth=0.14)
        F.box(s, f'SpokeRoof{a:.0f}', polar((r0 + r1) / 2 + 1.0, a, 28.05), (r1 - r0 - 4.0, 6.6, 0.3),
              material='paint.graphite', rot_z=math.radians(a), bevel=0.05)
        # glazed arcade ridge down the spoke roof, ribbed
        F.box(s, f'SpokeArcade{a:.0f}', polar((r0 + r1) / 2 + 1.5, a, 28.5), (r1 - r0 - 7.0, 2.4, 0.7),
              material='glass', rot_z=math.radians(a), bevel=0.2)
        ribs = [(polar(r0 + 5.0 + i * 1.8, a, 28.55), (0.3, 2.7, 0.85), math.radians(a))
                for i in range(int((r1 - r0 - 7.0) / 1.8))]
        cluster(s, f'SpokeRibs{a:.0f}', ribs, 'paint.graphite')
        truss(s, f'SpokeTruss{a:.0f}', polar(17.0, a, 20.0), polar(RING_R0 + 0.5, a, 20.0), 5.0, 2.2, 5,
              material='gunmetal', chord=0.5, web=0.28)


def build_spoke_details(s):
    win = []
    for a in SPOKES:
        rad = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0))
        tang = Vector((-rad.y, rad.x, 0))
        for side in (1, -1):
            for z in (23.6, 26.0):
                for i in range(12):
                    r = 18.5 + i * 1.5
                    if abs(r - 22.0) < 1.0 or abs(r - 31.0) < 1.0:
                        continue
                    p = Vector(polar(r, a, z)) + tang * side * 4.23
                    win.append((tuple(p), (0.8, 0.1, 0.55), math.radians(a)))
        for side in (1, -1):
            for i in range(9):
                p = Vector(polar(18.4 + i * 1.8, a, 28.22)) + tang * side * 2.2
                win.append((tuple(p), (1.1, 0.6, 0.1), math.radians(a)))
    cluster(s, 'SpokeWin', win, 'glow_warm')


def build_pier(s):
    """The approach pier: a pressurised tube from the concourse out through the mouth to the collar."""
    x0, x1 = CX + 16.0, 57.5
    F.cylinder(s, 'PierTube', (x0, 0, DOCK_Z), (x1, 0, DOCK_Z), 2.3, material='paint', segments=24, bevel=0.0)
    for x in (27.0, 38.0, 47.0, 53.5):
        F.band(s, 'PierTube', (x, 0, 0), (1, 0, 0), 0.9, 'paint2', inset=0.05, depth=0.14)
    F.box(s, 'PierDeck', ((x0 + APRON_R1 + CX) / 2, 0, APRON_Z1 + 0.6), (APRON_R1 + CX - x0, 6.4, 1.2),
          material='paint.graphite', bevel=0.08)
    for x in (24.0, 32.0, 40.0):
        F.box(s, f'PierPost{x:.0f}', (x, 0, (APRON_Z1 + DOCK_Z) / 2), (1.4, 2.6, DOCK_Z - APRON_Z1), material='gunmetal',
              bevel=0.0)
    truss(s, 'PierTruss', (APRON_R1 + CX - 2.0, 0, DOCK_Z - 3.8), (x1 + 0.5, 0, DOCK_Z - 3.8), 3.4, 2.2, 6,
          material='gunmetal')
    for x in (47.0, 53.5):
        beam(s, f'PierHanger{x:.0f}', (x, 0, DOCK_Z - 2.6), (x, 0, DOCK_Z - 3.8), 0.7, material='gunmetal')
    F.box(s, 'PierRoot', (CX + 17.2, 0, DOCK_Z), (2.6, 7.0, 6.0), material='paint.graphite', bevel=0.2)
    # docking collar and port at the end (faces +X)
    F.cylinder(s, 'Collar', (x1, 0, DOCK_Z), (x1 + 3.0, 0, DOCK_Z), 3.6, 3.3, material='paint2', segments=40, bevel=0.12)
    F.band(s, 'Collar', (x1 + 1.3, 0, 0), (1, 0, 0), 0.6, 'hazard')
    F.cylinder(s, 'Port', (x1 + 2.9, 0, DOCK_Z), (x1 + 3.5, 0, DOCK_Z), 2.5, material='gunmetal', segments=32,
               cap_material='dark', bevel=0.04)
    F.ring(s, 'PortRing', (x1 + 3.2, 0, DOCK_Z), 2.8, 0.25, axis=(1, 0, 0), material='hazard', segments=32, sides=6)
    # lead-in outriggers: cross arms either side of the pier carrying the approach lights
    arms = []
    for x in (44.0, 48.5, 53.0, 57.5):
        arms.append(((x, -6.5, DOCK_Z - 3.8), (x, 6.5, DOCK_Z - 3.8)))
    beams(s, 'LeadArms', arms, 0.6, 'paint.graphite')


def build_pier_details(s):
    x0, x1 = CX + 16.0, 57.5
    win = []
    for side in (1, -1):
        for i in range(30):
            x = x0 + 1.2 + i * 1.25
            if x > x1 - 0.6 or any(abs(x - b) < 0.8 for b in (27.0, 38.0, 47.0, 53.5)):
                continue
            win.append(((x, side * 2.26, DOCK_Z + 0.6), (0.6, 0.12, 0.45), 0.0))
    cluster(s, 'PierWin', win, 'glow_warm')
    run = [((x0 + 2.0 + i * 2.0, 0, DOCK_Z + 2.32), (0.4, 0.4, 0.12), 0.0) for i in range(int((x1 - x0 - 2) / 2.0))]
    cluster(s, 'PierRunway', run, 'glow_green')
    lead = []
    for k, x in enumerate((44.0, 48.5, 53.0, 57.5)):
        for y in (-6.5, 6.5):
            lead.append(((x, y, DOCK_Z - 3.3), (0.7, 0.7, 0.5), 0.0))
    cluster(s, 'LeadLights', lead, 'glow_amber')
    F.light(s, 'LeadPort', (57.5, 6.9, DOCK_Z - 3.3), 'glow_red', size=0.8)
    F.light(s, 'LeadStbd', (57.5, -6.9, DOCK_Z - 3.3), 'glow_green', size=0.8)
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        F.light(s, f'PortLight{k}', (x1 + 3.4, 3.0 * math.cos(a), DOCK_Z + 3.0 * math.sin(a)),
                'glow_green' if k % 2 else 'glow_amber', size=0.4)
    F.beacon(s, 'DockBeacon', (x1 + 1.6, 0, DOCK_Z + 3.55), 'glow_amber', size=0.9)
    # apron lane lights guiding from the pier root round the harbour floor
    lane = []
    for k in range(48):
        a = 3.75 + 7.5 * k
        x, y, _ = polar(APRON_R0 + 1.6, a)
        lane.append(((x, y, APRON_Z1 + 0.08), (0.45, 0.25, 0.12), math.radians(a)))
    cluster(s, 'LaneLights', lane, 'glow_cyan')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_drum(s)
    build_apron(s)
    build_ring(s)
    build_spokes(s)
    build_pier(s)
    build_berths(s)
    build_yards(s)
    s.detail = 1
    build_drum_details(s)
    build_ring_details(s)
    build_spoke_details(s)
    build_pier_details(s)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
