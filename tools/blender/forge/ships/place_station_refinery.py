"""Refinery Process Crown — Helios industrial refinery station. Forge rebuild.

Idea: "process crown over furnace stacks". Plan read from the chase camera: a charcoal furnace drum
at the centre crowned with glowing stacks, ringed by an ochre process deck carrying eight ivory
fractionation columns (the crown), braced to the core by spoke trusses and pipe racks. Four arms
leave the crown: the docking arm with a parked ore tanker (+X, the dock approach socket), the
sphere tank farm (-X), the heat exchanger with its radiator wing (+Y, the emissive socket) and
the crew hab with its control bridge and dish (-Y).
Three values: ivory columns and habs, furnace ochre deck and bands, charcoal core and machinery.
Scale is carried by density: sight ports, deck rim lights, gallery windows, pipe racks, trusses.
Sockets (dock approach, emissive, structure core) are copied from the live file on export.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_refinery'
COLORS = {
    'paint': '#a69d8a',           # Helios ivory (brightest allowed)
    'paint2': '#5c3b12',          # furnace ochre #8a5a1c, authored darker (key light lifts it)
    'stripe': '#8a5a1c',
    'hazard': '#b0841f',
    'paint.graphite': '#23282e',  # charcoal
    'dark': '#16191d',
}

R_CROWN = 27.0          # fractionation column circle
DECK_R0, DECK_R1 = 23.5, 30.5
DECK_Z0, DECK_Z1 = 1.8, 3.4
CORE_R = 11.0
TOWERS = [  # (angle deg, radius, height above deck)
    (22.5, 3.3, 24.0), (67.5, 2.8, 17.0), (112.5, 3.3, 26.0), (157.5, 2.8, 19.0),
    (202.5, 3.3, 24.0), (247.5, 2.8, 17.0), (292.5, 3.3, 26.0), (337.5, 2.8, 19.0),
]


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (r * math.cos(a), r * math.sin(a), z)


# --- local helpers --------------------------------------------------------------------------------

def cluster(s, name, items, material, bevel=0.0):
    """Many small boxes in one mesh (windows, rim lights, grating): items = (center, size, rot_z)."""
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


def truss(s, name, p0, p1, width, depth, bays, material='gunmetal', chord=0.45, web=0.25):
    """Box truss between two points: four chords plus zig-zag webs on all four faces."""
    a, b = Vector(p0), Vector(p1)
    t = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
    side = t.cross(up).normalized()
    nrm = side.cross(t).normalized()
    corners = [side * sx * width / 2 + nrm * sz * depth / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm = bmesh.new()

    def strut(q0, q1, w):
        d = (q1 - q0)
        if d.length < 1e-4:
            return
        tt = d.normalized()
        u = Vector((0, 0, 1)) if abs(tt.z) < 0.9 else Vector((0, 1, 0))
        sd = tt.cross(u).normalized()
        nn = sd.cross(tt).normalized()
        ring = []
        for q in (q0, q1):
            ring.append([bm.verts.new(q + sd * x * w / 2 + nn * y * w / 2) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        r0, r1 = ring
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        bm.faces.new(list(reversed(r0)))
        bm.faces.new(r1)
    for c in corners:
        strut(a + c, b + c, chord)
    for i in range(bays):
        q0 = a + (b - a) * (i / bays)
        q1 = a + (b - a) * ((i + 1) / bays)
        for f in range(4):
            c0, c1 = corners[f], corners[(f + 1) % 4]
            if i % 2 == 0:
                strut(q0 + c0, q1 + c1, web)
            else:
                strut(q0 + c1, q1 + c0, web)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=30.0))


def sphere(s, name, c, r, material='paint', count=24, rows=10):
    cx, cy, cz = c
    secs = []
    for i in range(rows + 1):
        th = math.pi * i / rows
        w = max(r * math.sin(th), 0.02)
        secs.append(dict(x=cx - r * math.cos(th), w=w, ht=w, hb=w, zc=cz, n=2.0, y=cy))
    return F.loft(s, name, secs, material=material, count=count, bevel=0.0, smooth_angle=60.0)


def annulus(s, name, r0, r1, z0, th, segs, material='paint2', side='paint.graphite', a0=0.0, a1=360.0, bevel=0.12):
    bm = bmesh.new()
    full = abs(a1 - a0) >= 359.9
    n = segs if full else segs + 1
    rings = []
    for z in (z0, z0 + th):
        inner, outer = [], []
        for i in range(n):
            a = math.radians(a0 + (a1 - a0) * i / segs)
            inner.append(bm.verts.new((r0 * math.cos(a), r0 * math.sin(a), z)))
            outer.append(bm.verts.new((r1 * math.cos(a), r1 * math.sin(a), z)))
        rings.append((inner, outer))
    (bi, bo), (ti, to) = rings
    m = n if full else n - 1
    for i in range(m):
        j = (i + 1) % n
        bm.faces.new((ti[i], to[i], to[j], ti[j]))
        bm.faces.new((bi[j], bo[j], bo[i], bi[i]))
        bm.faces.new((bo[i], bo[j], to[j], to[i]))
        bm.faces.new((bi[j], bi[i], ti[i], ti[j]))
    if not full:
        bm.faces.new((bi[0], bo[0], to[0], ti[0]))
        bm.faces.new((ti[-1], to[-1], bo[-1], bi[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [material, side]
    for f in bm.faces:
        f.material_index = 0 if f.normal.z > 0.5 else 1
    return s.add(F._new_object(name, bm, s.slots(mats), bevel=bevel, smooth_angle=30.0))


def radial_windows(c, r, z, count, size, a0=0.0, a1=360.0, skip=None):
    """Window boxes tangent to a vertical cylinder of radius r (list for cluster())."""
    cx, cy = c
    out = []
    for i in range(count):
        a = math.radians(a0 + (a1 - a0) * (i + 0.5) / count)
        if skip and skip(math.degrees(a) % 360):
            continue
        out.append(((cx + (r + 0.04) * math.cos(a), cy + (r + 0.04) * math.sin(a), z), (0.16, size[0], size[1]), a))
    return out


# --- build ------------------------------------------------------------------------------------

def build_core(s):
    # furnace drum: charcoal, ochre shoulder band, hazard skirt, ring of glowing sight ports
    F.cylinder(s, 'Drum', (0, 0, -14.0), (0, 0, 10.0), CORE_R, material='paint.graphite', segments=48, bevel=0.0)
    F.band(s, 'Drum', (0, 0, 6.6), (0, 0, 1), 1.4, 'paint2', inset=0.08, depth=0.25)
    F.band(s, 'Drum', (0, 0, -11.2), (0, 0, 1), 1.2, 'hazard', inset=0.06, depth=0.2)
    F.band(s, 'Drum', (0, 0, -3.0), (0, 0, 1), 4.2, 'dark', inset=0.1, depth=-0.15)
    # upper cap and shoulder collar
    F.cylinder(s, 'Cap', (0, 0, 10.0), (0, 0, 13.0), CORE_R + 1.4, CORE_R + 0.9, material='paint2', segments=48,
               bevel=0.0)
    F.cylinder(s, 'CapDeck', (0, 0, 13.0), (0, 0, 13.6), CORE_R - 0.6, material='gunmetal', segments=48, bevel=0.0)
    # hopper cone and slag tap below
    F.cylinder(s, 'Hopper', (0, 0, -14.0), (0, 0, -20.5), CORE_R - 0.4, 4.2, material='gunmetal', segments=40,
               bevel=0.2)
    F.cylinder(s, 'SlagTap', (0, 0, -20.5), (0, 0, -23.5), 2.6, 2.0, material='paint.graphite', segments=24,
               cap_material='glow_amber', bevel=0.1)
    # stacks: four ivory furnace stacks + a tall charcoal central chimney, all with hot throats
    for k in range(4):
        x, y, _ = polar(6.4, 45 + 90 * k)
        F.cylinder(s, f'Stack{k}', (x, y, 13.4), (x, y, 28.5), 2.1, 1.75, material='paint', segments=24, bevel=0.0)
        F.band(s, f'Stack{k}', (x, y, 26.2), (0, 0, 1), 1.0, 'hazard')
        F.band(s, f'Stack{k}', (x, y, 17.0), (0, 0, 1), 0.7, 'paint2', inset=0.05, depth=0.1)
        F.cylinder(s, f'StackLip{k}', (x, y, 28.3), (x, y, 29.3), 2.15, 2.25, material='gunmetal', segments=24,
                   cap_material='dark', bevel=0.0)
        F.cylinder(s, f'StackHot{k}', (x, y, 29.2), (x, y, 29.45), 1.2, material='glow_amber', segments=20,
                   bevel=0.0)
        F.cylinder(s, f'StackBoot{k}', (x, y, 13.4), (x, y, 15.2), 2.8, 2.2, material='paint.graphite', segments=24,
                   bevel=0.0)
    F.cylinder(s, 'Chimney', (0, 0, 13.4), (0, 0, 32.0), 3.0, 2.5, material='paint.graphite', segments=32, bevel=0.15)
    F.band(s, 'Chimney', (0, 0, 29.5), (0, 0, 1), 1.2, 'hazard')
    F.band(s, 'Chimney', (0, 0, 22.0), (0, 0, 1), 0.8, 'paint2', inset=0.05, depth=0.12)
    F.cylinder(s, 'ChimneyLip', (0, 0, 31.8), (0, 0, 32.8), 2.75, 2.9, material='gunmetal', segments=32,
               cap_material='dark', bevel=0.05)
    F.cylinder(s, 'ChimneyHot', (0, 0, 32.7), (0, 0, 32.95), 1.7, material='glow_amber', segments=24, bevel=0.0)
    # stack bracing ring at mid height ties the five stacks together
    F.ring(s, 'StackBrace', (0, 0, 21.0), 6.4, 0.3, axis=(0, 0, 1), material='gunmetal', segments=40, sides=6)
    for k in range(4):
        x, y, _ = polar(6.4, 45 + 90 * k)
        beam(s, f'StackTie{k}', (x * 0.45, y * 0.45, 21.0), (x * 0.72, y * 0.72, 21.0), 0.4)


def build_core_details(s):
    ports = radial_windows((0, 0), CORE_R + 0.12, -3.0, 20, (1.3, 3.0))
    cluster(s, 'SightPorts', ports, 'glow_amber')
    frames = [((c[0], c[1], c[2] + 1.8), (0.4, 1.9, 0.35), rz) for c, _, rz in ports]
    cluster(s, 'SightHoods', frames, 'gunmetal')
    gallery = radial_windows((0, 0), CORE_R + 0.05, 8.6, 44, (0.9, 0.55))
    cluster(s, 'GalleryWin', gallery, 'glow_warm')
    # work lamps on the cap rim aimed up at the stacks
    for k in range(4):
        x, y, _ = polar(CORE_R + 0.2, 90 * k)
        F.work_lamp(s, f'CapLamp{k}', (x, y, 13.9), aim=(-x * 0.05, -y * 0.05, 1.0), size=0.9)
    for k in range(4):
        x, y, _ = polar(3.0, 90 * k + 45)
        F.light(s, f'ChimneyBeacon{k}', (x * 0.93, y * 0.93, 32.9), 'glow_red', size=0.45)


def build_crown(s):
    annulus(s, 'Deck', DECK_R0, DECK_R1, DECK_Z0, DECK_Z1 - DECK_Z0, 72, material='paint.graphite', side='paint.graphite')
    # the crown band: an ochre inlay ring through the column feet, and a thin ochre edge inlay
    annulus(s, 'CrownBand', R_CROWN - 1.3, R_CROWN + 1.3, DECK_Z1, 0.12, 72, material='paint2', side='paint2', bevel=0.0)
    annulus(s, 'EdgeBand', DECK_R1 - 1.1, DECK_R1 - 0.5, DECK_Z1, 0.08, 72, material='paint2', side='paint2', bevel=0.0)
    F.ring(s, 'DeckRimOuter', (0, 0, DECK_Z1), DECK_R1 - 0.15, 0.22, axis=(0, 0, 1), material='hazard', segments=72,
           sides=6)
    F.ring(s, 'DeckRimInner', (0, 0, DECK_Z1), DECK_R0 + 0.15, 0.22, axis=(0, 0, 1), material='hazard', segments=72,
           sides=6)
    # the process main: a fat ochre header pipe ring under the deck, and a thin upper crown hoop
    F.ring(s, 'Header', (0, 0, -0.4), R_CROWN, 1.25, axis=(0, 0, 1), material='paint.graphite', segments=64,
           sides=8)
    F.ring(s, 'CrownHoop', (0, 0, 15.0), R_CROWN, 0.45, axis=(0, 0, 1), material='paint2', segments=80, sides=6)
    # deck underframe: radial ribs from header to deck
    for k in range(16):
        a = 11.25 + 22.5 * k
        beam(s, f'DeckRib{k}', polar(DECK_R0 + 0.4, a, DECK_Z0 - 0.4), polar(DECK_R1 - 0.4, a, DECK_Z0 - 0.4),
             0.7, 0.9, material='gunmetal')
    # four spoke trusses core -> deck, with pipe racks riding on them
    for k, a in enumerate((0, 90, 180, 270)):
        truss(s, f'Spoke{k}', polar(CORE_R - 0.5, a, 1.2), polar(DECK_R0 + 0.8, a, 1.2), 3.2, 2.4, 6)
        for off, r in ((-0.9, 0.55), (0.9, 0.55), (0.0, 0.8)):
            p0 = Vector(polar(CORE_R + 0.9, a, 3.2)) + Vector(polar(off, a + 90))
            p1 = Vector(polar(DECK_R1 - 0.6, a, 3.2)) + Vector(polar(off, a + 90))
            F.cylinder(s, f'SpokePipe{k}{off:+.1f}', tuple(p0), tuple(p1), r, material='paint2' if off == 0 else 'gunmetal',
                       segments=12, bevel=0.0)
    # columns
    for i, (a, r, h) in enumerate(TOWERS):
        x, y, _ = polar(R_CROWN, a)
        top = DECK_Z1 + h
        F.cylinder(s, f'Sump{i}', (x, y, DECK_Z0), (x, y, -4.5), r + 0.5, r * 0.45, material='paint.graphite',
                   segments=24, bevel=0.0)
        F.cylinder(s, f'Drain{i}', (x, y, -4.5), (x, y, -6.0), 0.6, material='gunmetal', segments=10, bevel=0.0)
        F.cylinder(s, f'Col{i}', (x, y, DECK_Z1), (x, y, top), r, material='paint', segments=24, bevel=0.0)
        for j, zb in enumerate(range(int(DECK_Z1 + 4.5), int(top - 1.5), 5)):
            F.band(s, f'Col{i}', (x, y, zb), (0, 0, 1), 0.55, 'paint2' if j % 2 == 0 else 'paint.graphite',
                   inset=0.05, depth=0.14)
        F.band(s, f'Col{i}', (x, y, top - 1.1), (0, 0, 1), 0.9, 'hazard')
        # domed head, vapour offtake to the core and a red beacon
        F.loft(s, f'Head{i}', [
            dict(x=x - r, w=0.02, ht=0.02, hb=0.02, zc=top, y=y, n=2.0),
            dict(x=x - r * 0.8, w=r * 0.6, ht=r * 0.28, hb=0.02, zc=top, y=y, n=2.0),
            dict(x=x, w=r, ht=r * 0.45, hb=0.02, zc=top, y=y, n=2.0),
            dict(x=x + r * 0.8, w=r * 0.6, ht=r * 0.28, hb=0.02, zc=top, y=y, n=2.0),
            dict(x=x + r, w=0.02, ht=0.02, hb=0.02, zc=top, y=y, n=2.0),
        ], material='paint', count=16, bevel=0.0, smooth_angle=70.0)
        # vapour line: out of the head, over the shoulder and straight down a downcomer to the deck
        tang = Vector((-math.sin(math.radians(a)), math.cos(math.radians(a)), 0))
        p_top = Vector((x, y, top + r * 0.35))
        p_over = Vector((x, y, top + r * 0.35)) + tang * (r + 1.0)
        p_down = Vector((x, y, DECK_Z1)) + tang * (r + 1.0)
        F.cylinder(s, f'Vapour{i}a', tuple(p_top), tuple(p_over), 0.5, material='gunmetal', segments=10, bevel=0.0)
        F.cylinder(s, f'Vapour{i}b', tuple(p_over + Vector((0, 0, 0.5))), tuple(p_down), 0.5, material='gunmetal',
                   segments=10, bevel=0.0)
        F.cylinder(s, f'Feed{i}', polar(DECK_R0 + 0.3, a + 4, DECK_Z1 + 0.6), polar(CORE_R + 1.2, a + 4, DECK_Z1 + 0.6),
                   0.45, material='gunmetal', segments=10, bevel=0.0)
        F.cylinder(s, f'Feed{i}b', polar(DECK_R0 + 0.3, a - 4, DECK_Z1 + 0.6), polar(CORE_R + 1.2, a - 4, DECK_Z1 + 0.6),
                   0.45, material='gunmetal', segments=10, bevel=0.0)
        if i % 2 == 0:
            F.beacon(s, f'ColBeacon{i}', (x, y, top + r * 0.45 - 0.05), 'glow_amber', size=0.8)
        else:
            F.light(s, f'ColBeacon{i}', (x, y, top + r * 0.45 + 0.1), 'glow_red', size=0.6)
        # riser pipe up the outboard flank and a hoop clamp
        out = Vector((x, y, 0)).normalized()
        rx, ry = x + out.x * (r + 0.55), y + out.y * (r + 0.55)
        F.cylinder(s, f'Riser{i}', (rx, ry, DECK_Z1), (rx, ry, top - 1.8), 0.32, material='gunmetal', segments=8,
                   bevel=0.0)
        hx, hy, _ = polar(R_CROWN, a)
        F.cylinder(s, f'HoopClamp{i}', (hx, hy, 14.3), (hx, hy, 15.7), r + 0.35, material='gunmetal', segments=24,
                   bevel=0.0)


def build_deck_plant(s):
    """Pump skids and horizontal drums on the deck between the columns (the top view's texture)."""
    for k in range(4):
        a = 45 + 90 * k
        x, y, _ = polar(R_CROWN, a)
        tang = Vector((-math.sin(math.radians(a)), math.cos(math.radians(a)), 0))
        rad = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)), 0))
        c = Vector((x, y, DECK_Z1 + 1.9))
        F.cylinder(s, f'Drum{k}', tuple(c - tang * 3.0 + rad * 0.6), tuple(c + tang * 3.0 + rad * 0.6), 1.5,
                   material='paint', segments=20, bevel=0.0, cap_material='paint2')
        F.band(s, f'Drum{k}', tuple(c), tuple(tang), 0.5, 'paint2')
        for e in (-1.8, 1.8):
            q = c + tang * e + rad * 0.6
            F.box(s, f'DrumSaddle{k}{e:+.0f}', (q.x, q.y, DECK_Z1 + 0.35), (1.0, 2.4, 0.7), material='gunmetal',
                  rot_z=math.radians(a), bevel=0.0)
        q = c - rad * 2.1
        F.box(s, f'Pump{k}', (q.x, q.y, DECK_Z1 + 0.8), (1.6, 3.6, 1.6), material='paint.graphite',
              rot_z=math.radians(a), bevel=0.0)
        F.cylinder(s, f'PumpMotor{k}', (q.x, q.y, DECK_Z1 + 1.6), (q.x, q.y, DECK_Z1 + 2.6), 0.6, material='paint2',
                   segments=12, bevel=0.0)
    for k in range(4):
        a = 90 * k + 11.0
        for sgn in (1, -1):
            aa = 90 * k + sgn * 11.0
            x, y, _ = polar(R_CROWN - 0.4, aa)
            F.box(s, f'Valve{k}{sgn}', (x, y, DECK_Z1 + 0.6), (1.4, 1.4, 1.2), material='gunmetal',
                  rot_z=math.radians(aa), bevel=0.0)


def build_crown_details(s):
    rim = []
    for k in range(72):
        a = 5 * k + 2.5
        x, y, _ = polar(DECK_R1 + 0.05, a)
        rim.append(((x, y, DECK_Z1 - 0.6), (0.18, 0.5, 0.3), math.radians(a)))
    cluster(s, 'RimLights', rim, 'glow_amber')
    # sight glasses and service platforms on each column
    plats, glasses = [], []
    for i, (a, r, h) in enumerate(TOWERS):
        x, y, _ = polar(R_CROWN, a)
        for zz in (DECK_Z1 + 6.5, DECK_Z1 + 12.5):
            glasses += radial_windows((x, y), r + 0.08, zz, 6, (0.5, 0.9), a0=a - 60, a1=a + 60)
        # little crew platform on the inboard side with lit windows
        inx, iny, _ = polar(R_CROWN - r - 1.1, a)
        F.box(s, f'Cab{i}', (inx, iny, DECK_Z1 + 1.5), (2.4, 2.4, 2.8), material='paint', rot_z=math.radians(a),
              bevel=0.0)
        plats += radial_windows((0, 0), R_CROWN - r - 2.3, DECK_Z1 + 1.9, 2, (0.8, 0.5), a0=a - 3.5, a1=a + 3.5)
    cluster(s, 'SightGlass', glasses, 'glow_amber')
    cluster(s, 'CabWin', plats, 'glow_warm')
    # deck grating plates between columns (dark recessed panels read as work floor)
    grates = []
    for k in range(8):
        a = 45 * k
        x, y, _ = polar((DECK_R0 + DECK_R1) / 2, a)
        grates.append(((x, y, DECK_Z1 + 0.02), (3.6, 4.6, 0.08), math.radians(a)))
    cluster(s, 'Grates', grates, 'dark')


def build_dock(s):
    # pressurised arm from the deck to the docking collar (+X), window rows both sides
    F.cylinder(s, 'ArmTube', (DECK_R1 - 1.0, 0, 1.6), (44.0, 0, 1.6), 2.3, material='paint', segments=24, bevel=0.0)
    for x in (33.0, 37.5, 42.0):
        F.band(s, 'ArmTube', (x, 0, 0), (1, 0, 0), 0.8, 'paint2', inset=0.05, depth=0.12)
    truss(s, 'ArmTruss', (DECK_R1 - 3.0, 0, -2.2), (45.5, 0, -2.2), 3.6, 2.2, 8, material='gunmetal')
    F.box(s, 'ArmRoot', (DECK_R1 - 0.2, 0, 1.2), (4.6, 7.0, 5.4), material='paint.graphite', bevel=0.25)
    F.band(s, 'ArmRoot', (DECK_R1 - 0.2, 0, 2.6), (0, 0, 1), 0.5, 'hazard')
    # docking collar
    F.cylinder(s, 'Collar', (44.0, 0, 1.6), (47.2, 0, 1.6), 3.6, 3.3, material='paint2', segments=40, bevel=0.15)
    F.band(s, 'Collar', (45.2, 0, 0), (1, 0, 0), 0.6, 'hazard')
    F.cylinder(s, 'Port', (47.1, 0, 1.6), (47.7, 0, 1.6), 2.5, material='gunmetal', segments=32, cap_material='dark',
               bevel=0.05)
    F.ring(s, 'PortRing', (47.4, 0, 1.6), 2.75, 0.25, axis=(1, 0, 0), material='hazard', segments=32, sides=6)
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        F.light(s, f'PortLight{k}', (47.55, 3.0 * math.cos(a), 1.6 + 3.0 * math.sin(a)),
                'glow_green' if k % 2 else 'glow_amber', size=0.4)
    F.beacon(s, 'DockBeacon', (45.6, 0, 1.6 + 3.55), 'glow_amber', size=0.9)
    # the parked ore tanker on the starboard side of the arm, held by a gangway
    ty, tz = -8.6, 1.2
    F.loft(s, 'Tanker', [
        dict(x=29.0, w=2.2, ht=1.9, hb=1.7, zc=tz, n=2.6, y=ty),
        dict(x=30.0, w=2.8, ht=2.4, hb=2.1, zc=tz, n=2.8, y=ty),
        dict(x=40.5, w=2.8, ht=2.4, hb=2.1, zc=tz, n=2.8, y=ty),
        dict(x=43.0, w=2.2, ht=1.9, hb=1.7, zc=tz - 0.1, n=2.5, y=ty),
        dict(x=44.8, w=1.2, ht=1.0, hb=1.0, zc=tz - 0.2, n=2.2, y=ty),
    ], material='paint', belly='paint.graphite', back_material='dark', count=32, bevel=0.0)
    for x in (32.4, 35.4, 38.4):
        F.band(s, 'Tanker', (x, ty, 0), (1, 0, 0), 1.6, 'paint2', inset=0.05, depth=0.08)
    F.band(s, 'Tanker', (44.0, ty, tz), (1, 0, 0), 1.2, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    for dy in (-1.1, 1.1):
        F.nozzle(s, f'TankerDrive{dy:+.1f}', (28.3, ty + dy, tz), 0.8, 0.9, material='gunmetal')
    F.box(s, 'Gangway', (37.0, (ty + 2.8 - 2.3) / 2 - 0.1, 1.6), (2.2, abs(ty) - 2.3 - 2.6, 1.6),
          material='paint.graphite', bevel=0.08)
    # a small crew shuttle on the port side
    sy = 6.4
    F.loft(s, 'Shuttle', [
        dict(x=33.0, w=1.0, ht=0.9, hb=0.8, zc=1.6, n=2.4, y=sy),
        dict(x=34.0, w=1.5, ht=1.2, hb=1.0, zc=1.6, n=2.6, y=sy),
        dict(x=38.0, w=1.5, ht=1.2, hb=1.0, zc=1.6, n=2.6, y=sy),
        dict(x=39.8, w=0.6, ht=0.5, hb=0.5, zc=1.5, n=2.2, y=sy),
    ], material='paint', belly='paint.graphite', back_material='dark', count=32, bevel=0.06)
    F.band(s, 'Shuttle', (38.9, sy, 1.6), (1, 0, 0), 0.9, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    F.band(s, 'Shuttle', (35.6, sy, 0), (1, 0, 0), 0.5, 'paint2')
    F.box(s, 'ShuttleClamp', (36.0, (sy - 1.5 + 2.3) / 2, 1.6), (1.2, sy - 1.5 - 2.3 + 0.4, 0.9),
          material='paint.graphite', bevel=0.05)


def build_dock_details(s):
    tube = []
    for side in (1, -1):
        for i in range(14):
            x = DECK_R1 + 1.0 + i * 0.95
            if any(abs(x - b) < 0.6 for b in (33.0, 37.5, 42.0)):
                continue
            tube.append(((x, side * 2.26, 2.1), (0.55, 0.12, 0.42), 0.0))
    cluster(s, 'ArmWin', tube, 'glow_warm')
    lights = []
    for i in range(7):
        x = DECK_R1 + 1.4 + i * 2.2
        lights.append(((x, 0, 3.92), (0.35, 0.35, 0.12), 0.0))
    cluster(s, 'ArmRunway', lights, 'glow_green')
    tanker = []
    for side in (1, -1):
        for i in range(9):
            tanker.append(((31.0 + i * 1.15, -8.6 + side * 2.78, 1.9), (0.5, 0.1, 0.35), 0.0))
    cluster(s, 'TankerWin', tanker, 'glow_warm')
    F.light(s, 'TankerNavP', (41.5, -8.6 + 2.85, 1.2), 'glow_red', size=0.35)
    F.light(s, 'TankerNavS', (41.5, -8.6 - 2.85, 1.2), 'glow_green', size=0.35)


def build_tanks(s):
    # sphere farm on a truss deck aft (-X): six ivory spheres with ochre equators
    truss(s, 'FarmSpoke', (-DECK_R1 + 2.5, 0, -1.4), (-50.5, 0, -1.4), 3.0, 2.4, 10)
    for y in (-10.5, 10.5):
        beam(s, f'FarmRail{y:+.0f}', (-31.0, y, -6.6), (-50.5, y, -6.6), 1.4, 1.2, material='paint.graphite')
    for x in (-31.5, -40.5, -50.0):
        beam(s, f'FarmCross{x:+.0f}', (x, -12.0, -6.6), (x, 12.0, -6.6), 1.2, 1.0, material='paint.graphite')
    F.box(s, 'FarmRoot', (-DECK_R1 + 0.3, 0, 0.6), (4.4, 7.4, 5.2), material='paint.graphite', bevel=0.25)
    for i, x in enumerate((-36.0, -45.4)):
        for j, y in enumerate((-10.5, 0.0, 10.5)):
            name = f'Tank{i}{j}'
            sphere(s, name, (x, y, -1.4), 4.7, material='paint', count=24, rows=10)
            F.band(s, name, (x, y, -1.4), (0, 0, 1), 1.0, 'paint2', inset=0.05, depth=0.12)
            F.cylinder(s, f'{name}Saddle', (x, y, -6.6), (x, y, -5.2), 2.8, 2.2, material='gunmetal', segments=16,
                       bevel=0.0)
            F.cylinder(s, f'{name}Valve', (x, y, 3.1), (x, y, 4.0), 1.1, material='paint.graphite', segments=14,
                       cap_material='paint2', bevel=0.0)
    # manifold pipes running from the farm to the crown header
    for y in (-5.25, 5.25):
        F.cylinder(s, f'Manifold{y:+.0f}', (-51.0, y, 2.6), (-DECK_R1 + 1.0, y, 2.6), 0.7, material='paint2',
                   segments=14, bevel=0.0)
        for x in (-36.0, -45.4):
            F.cylinder(s, f'Branch{x:+.0f}{y:+.0f}', (x, y, 2.6), (x, y * 2.0, 2.6), 0.4, material='gunmetal',
                       segments=10, bevel=0.0)
            F.cylinder(s, f'BranchUp{x:+.0f}{y:+.0f}', (x, y, 2.6), (x, 0, 3.6), 0.4, material='gunmetal',
                       segments=10, bevel=0.0)
    for x in (-33.0, -40.6, -48.8):
        beam(s, f'PipeSaddle{x:+.0f}', (x, -6.2, 1.6), (x, 6.2, 1.6), 0.6, 1.2, material='paint.graphite')
        for y in (-5.25, 5.25):
            beam(s, f'PipePost{x:+.0f}{y:+.0f}', (x, y, 1.6), (x, y, -6.2), 0.5, material='gunmetal')
    F.light(s, 'FarmEndL', (-51.2, 5.25, 3.5), 'glow_amber', size=0.5)
    F.light(s, 'FarmEndR', (-51.2, -5.25, 3.5), 'glow_amber', size=0.5)


def build_exchanger(s):
    # heat exchanger block (+Y, the emissive socket) with glowing louvres and a radiator wing
    F.box(s, 'HX', (0, 34.0, 0.4), (13.0, 8.0, 8.4), material='paint.graphite', bevel=0.3)
    F.band(s, 'HX', (0, 34.0, 3.2), (0, 0, 1), 0.5, 'paint2', inset=0.04, depth=0.1)
    for k, x in enumerate((-4.0, 0.0, 4.0)):
        F.box(s, f'HXWell{k}', (x, 34.0, 4.55), (3.2, 6.0, 0.3), material='glow_amber', bevel=0.0)
        for j in range(6):
            F.box(s, f'HXSlat{k}{j}', (x, 31.5 + j * 1.0, 4.8), (3.4, 0.35, 0.25), material='gunmetal', bevel=0.0,
                  rot=(0.5, 0, 0))
    truss(s, 'HXSpoke', (0, DECK_R1 - 2.0, 1.2), (0, 30.0, 1.2), 3.2, 2.4, 2)
    # radiator wing: two long dark panels in an ochre frame, fin lines across the top
    F.plate(s, 'RadFrame', [(15.5, 38.0), (15.5, 46.5), (-15.5, 46.5), (-15.5, 38.0)], z0=-0.2, thickness=0.9,
            material='paint2', chamfer=0.15, bevel=0.08)
    for k, (x0, x1) in enumerate(((-14.8, -0.5), (0.5, 14.8))):
        F.box(s, f'RadPanel{k}', ((x0 + x1) / 2, 42.25, 0.72), (x1 - x0, 7.6, 0.22), material='dark', bevel=0.0)
    fins = []
    for i in range(24):
        x = -14.3 + i * (28.6 / 23)
        if abs(x) < 0.8:
            continue
        fins.append(((x, 42.25, 0.95), (0.18, 7.4, 0.3), 0.0))
    cluster(s, 'RadFins', fins, 'gunmetal')
    beam(s, 'RadStrut', (0, 37.8, 0.3), (0, 46.6, 0.3), 1.0, 1.4, material='paint.graphite')
    for x in (-7.5, 7.5):
        beam(s, f'RadRib{x:+.0f}', (x, 38.2, 1.0), (x, 46.3, 1.0), 0.5, 0.5, material='paint2')
    F.light(s, 'NavPort', (15.6, 46.6, 0.8), 'glow_red', size=0.8)
    F.light(s, 'NavPort2', (-15.6, 46.6, 0.8), 'glow_red', size=0.8)


def build_hab(s):
    # crew hab (-Y): an ivory block with a glazed control bridge looking at the dock, and a dish
    F.plate(s, 'Hab', [(11.0, -31.5), (11.0, -39.5), (9.0, -41.5), (-9.0, -41.5), (-11.0, -39.5), (-11.0, -31.5)],
            z0=-3.6, thickness=9.2, material='paint', chamfer=0.5, bevel=0.2)
    F.band(s, 'Hab', (0, 0, 1.0), (0, 0, 1), 0.6, 'paint2', inset=0.05, depth=0.1)
    F.band(s, 'Hab', (0, 0, -2.2), (0, 0, 1), 0.45, 'paint.graphite', inset=0.05, depth=0.1)
    F.plate(s, 'Bridge', [(8.5, -32.8), (8.5, -38.2), (-4.0, -38.2), (-4.0, -32.8)], z0=5.4, thickness=3.0,
            material='paint2', chamfer=0.35, bevel=0.12)
    F.band(s, 'Bridge', (8.0, -35.5, 0), (1, 0, 0), 1.2, 'glass', facing=(1, 0, 0.3), min_facing=0.3)
    F.box(s, 'HabNeck', (0, -30.8, 0.9), (6.0, 2.4, 4.4), material='paint.graphite', bevel=0.15)
    truss(s, 'HabSpoke', (0, -DECK_R1 + 2.0, 1.2), (0, -31.8, 1.2), 3.2, 2.4, 2)
    F.cylinder(s, 'DishMast', (-7.0, -37.0, 5.4), (-7.0, -37.0, 9.0), 0.45, material='gunmetal', segments=10,
               bevel=0.0)
    F.dish(s, 'Dish', (-7.0, -37.0, 9.0), 3.4, 1.1, axis=(0.35, -0.5, 1.0), material='gunmetal', face='paint')
    F.light(s, 'NavStarboard', (0, -41.6, 1.0), 'glow_green', size=0.8)
    F.beacon(s, 'HabBeacon', (4.5, -35.5, 8.4), 'glow_amber', size=0.7)
    for k, x in enumerate((-9.0, 9.0)):
        F.light(s, f'HabCorner{k}', (x, -41.6, 5.3), 'glow_green', size=0.5)


def build_hab_details(s):
    wins = []
    for z in (-1.0, 0.1 + 1.2, 3.4):
        for i in range(16):
            x = -9.8 + i * (19.6 / 15)
            wins.append(((x, -41.55, z), (0.6, 0.12, 0.45), 0.0))
        for i in range(6):
            y = -32.5 - i * 1.4
            for sx in (-1, 1):
                wins.append(((sx * 11.03, y, z), (0.12, 0.6, 0.45), 0.0))
    # roof skylights
    for i in range(10):
        for j in range(3):
            x = -9.0 + i * 1.3
            if x > -4.6:
                continue
            wins.append(((x, -33.2 - j * 2.4, 5.62), (0.55, 1.2, 0.1), 0.0))
    cluster(s, 'HabWin', wins, 'glow_warm')
    brw = [((1.0 + i * 1.2, -38.25, 6.7), (0.7, 0.12, 0.6), 0.0) for i in range(6)]
    brw += [((1.0 + i * 1.2, -32.75, 6.7), (0.7, 0.12, 0.6), 0.0) for i in range(6)]
    cluster(s, 'BridgeWin', brw, 'glow_warm')
    F.antenna(s, 'HabMast', (-1.5, -38.0, 5.6), 4.5)
    F.panel(s, 'Hab', (-7.0, -33.6), (6.0, 2.6), 'dark', inset=0.06, depth=-0.08)
    for k, x in enumerate((-9.2, -6.8)):
        F.container(s, f'HabStore{k}', (x, -39.6, 6.3), (2.0, 2.4, 1.4), finish='paint2', ribs=2)
    F.vent(s, 'HabVent', (-2.5, -33.2, 5.65), (2.6, 1.6, 0.3), slats=5)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_core(s)
    build_crown(s)
    build_dock(s)
    build_tanks(s)
    build_exchanger(s)
    build_hab(s)
    build_deck_plant(s)
    s.detail = 1
    build_core_details(s)
    build_crown_details(s)
    build_dock_details(s)
    build_hab_details(s)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
