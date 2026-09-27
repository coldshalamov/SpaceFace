"""The Candle Fleet — Helios Prime memorial to the lost Pit convoy. Forge landmark.

Idea: "twenty-four flames, one dark plinth". Plan read from the chase camera: a great civic ring
of ivory paving, 180 m across, carrying twenty-four slender memorial pylons. Each pylon stands on a
stone plinth with a bronze family plaque and holds a lantern-caged votive bowl with a warm flame at
its crown, so from above the landmark is a circle of warm lights. At the ring's +X point the 25th
plinth is larger, charcoal and unlit: its cradle holds the recovered hull fragment and the orange
flight recorder, and a bronze course line runs from it to the dark still point at the centre (the
convoy's final course). Family shrines with small votives, ribbon masts and caretaker lamps line
the walk; the caretaker's tender is moored to a pier at the -Y side beside the keeper's lodge.
Three values: Helios ivory stone, warm grey stone, charcoal; the flames are the colour.
Sockets: SOCKET_Structure_Core at the still point, SOCKET_Camera_Focus just above it.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_landmark_candle_fleet'
COLORS = {
    'paint': '#a69d8a',            # Helios ivory stone (brightest allowed)
    'paint2': '#5a554b',           # warm grey stone: plinth pads, lower courses
    'stripe': '#6a4a22',           # memorial bronze: plaques, inlays, collars
    'hazard': '#8a4a18',           # flight-recorder orange, authored dark
    'paint.graphite': '#23272c',   # charcoal
    'paint.scorch': '#1e1c1b',     # the recovered hull: burnt, unlit
    'dark': '#131518',
    'dark.pool': '#07080a',         # the still point's matte black pool
    'glass': '#06090c',            # the still pool: black mirror
    'glow_warm': '#ffb86a',        # flame body
    'glow_amber': '#ff9a2a',       # flame root and votive rings
}

R = 88.0                    # candle circle
WALK_R0, WALK_R1 = 83.0, 93.0
WALK_Z0, WALK_Z1 = -1.2, 0.8
N = 25                      # 24 candles + the dark plinth at index 0 (+X)
STEP = 360.0 / N
PYLON_TOP = 27.0
BOWL_Z = PYLON_TOP
TENDER_A = 266.4            # midway between two candles on the -Y side
CROWN_K = 1.3               # votive crown scale: the flames are the landmark's plan read


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (r * math.cos(a), r * math.sin(a), z)


# --- local helpers (station set: cluster / beams / truss / annulus, plus a lathe) ----------------

def cluster(s, name, items, material, bevel=0.0):
    """Many small boxes in one mesh: items = (center, size, rot_z)."""
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


def beams(s, name, segs, w, material='gunmetal', h=None):
    """Many straight square struts in one mesh: segs = [(p0, p1)]."""
    h = w if h is None else h
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
        r0 = [bm.verts.new(q0 + sd * x * w / 2 + nn * y * h / 2) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        r1 = [bm.verts.new(q1 + sd * x * w / 2 + nn * y * h / 2) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        bm.faces.new(list(reversed(r0)))
        bm.faces.new(r1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=30.0))


def truss_segs(p0, p1, width, depth, bays):
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
    return chords, webs


def annulus(s, name, r0, r1, z0, th, segs, material='paint', side='paint.graphite', a0=0.0, a1=360.0, bevel=0.1,
            c=(0.0, 0.0)):
    bm = bmesh.new()
    full = abs(a1 - a0) >= 359.9
    n = segs if full else segs + 1
    cx, cy = c
    rings = []
    for z in (z0, z0 + th):
        inner, outer = [], []
        for i in range(n):
            a = math.radians(a0 + (a1 - a0) * i / segs)
            inner.append(bm.verts.new((cx + r0 * math.cos(a), cy + r0 * math.sin(a), z)))
            outer.append(bm.verts.new((cx + r1 * math.cos(a), cy + r1 * math.sin(a), z)))
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
    mats = list(dict.fromkeys([material, side]))
    for f in bm.faces:
        f.material_index = 0 if f.normal.z > 0.5 else mats.index(side)
    return s.add(F._new_object(name, bm, s.slots(mats), bevel=bevel, smooth_angle=30.0))


def lathe(s, name, c, prof, material, segs=24, bevel=0.0, smooth=40.0, phase=0.0):
    """Vertical solid of revolution about (cx, cy): prof = [(z, r) or (z, r, finish)] bottom to top.
    The finish on a profile row paints the faces between that row and the next. r == 0 makes a pole."""
    cx, cy = c
    bm = bmesh.new()
    finishes = [material] + [p[2] for p in prof if len(p) > 2]
    finishes = list(dict.fromkeys(finishes))
    rows = []
    for p in prof:
        z, r = p[0], p[1]
        if r < 1e-4:
            rows.append([bm.verts.new((cx, cy, z))])
        else:
            rows.append([bm.verts.new((cx + r * math.cos(phase + 2 * math.pi * i / segs),
                                       cy + r * math.sin(phase + 2 * math.pi * i / segs), z)) for i in range(segs)])
    for k in range(len(rows) - 1):
        a, b = rows[k], rows[k + 1]
        fin = prof[k][2] if len(prof[k]) > 2 else material
        mi = finishes.index(fin)
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                f = bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                f = bm.faces.new((a[i], a[j], b[0]))
            else:
                f = bm.faces.new((a[i], a[j], b[j], b[i]))
            f.material_index = mi
    if len(rows[0]) > 1:
        f = bm.faces.new(list(reversed(rows[0])))
        f.material_index = finishes.index(prof[0][2] if len(prof[0]) > 2 else material)
    if len(rows[-1]) > 1:
        f = bm.faces.new(rows[-1])
        f.material_index = finishes.index(prof[-2][2] if len(prof[-2]) > 2 else material)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots(finishes), bevel=bevel, smooth_angle=smooth))


def bpy_obj(name):
    import bpy
    return bpy.data.objects[name]


def octagon(r, c=(0.0, 0.0), rot=0.0):
    cx, cy = c
    return [(cx + r * math.cos(rot + math.pi / 8 + k * math.pi / 4), cy + r * math.sin(rot + math.pi / 8 + k * math.pi / 4))
            for k in range(8)]


# --- the civic ring ---------------------------------------------------------------------------

def build_ring(s):
    # ivory paving on a charcoal body, a bronze memorial inlay down the middle
    annulus(s, 'Walk', WALK_R0, WALK_R1, WALK_Z0, WALK_Z1 - WALK_Z0, 125, material='paint', side='paint.graphite',
            bevel=0.15)
    annulus(s, 'Inlay', R - 0.35, R + 0.35, WALK_Z1, 0.06, 125, material='stripe', side='stripe', bevel=0.0)
    annulus(s, 'CourseIn', WALK_R0 + 1.2, WALK_R0 + 1.6, WALK_Z1, 0.05, 125, material='paint2', side='paint2', bevel=0.0)
    annulus(s, 'CourseOut', WALK_R1 - 1.6, WALK_R1 - 1.2, WALK_Z1, 0.05, 125, material='paint2', side='paint2',
            bevel=0.0)
    # low charcoal kerbs (balustrade plinths) on both edges
    annulus(s, 'KerbIn', WALK_R0, WALK_R0 + 0.7, WALK_Z1, 0.9, 125, material='paint.graphite', side='paint.graphite',
            bevel=0.0)
    annulus(s, 'KerbOut', WALK_R1 - 0.7, WALK_R1, WALK_Z1, 0.9, 125, material='paint.graphite', side='paint.graphite',
            bevel=0.0)
    # the keel: a charcoal girder ring under the paving, braced down to the pylon finials
    annulus(s, 'Keel', R - 2.2, R + 2.2, WALK_Z0 - 3.6, 3.6, 100, material='paint.graphite', side='paint.graphite',
            bevel=0.1)
    chords, webs = [], []
    for i in range(N):
        a0, a1 = STEP * i, STEP * (i + 1)
        c, w = truss_segs(polar(R, a0 + 2.6, -9.5), polar(R, a1 - 2.6, -9.5), 3.2, 2.4, 4)
        chords += c
        webs += w
    beams(s, 'UnderChord', chords, 0.42, material='gunmetal')
    beams(s, 'UnderWeb', webs, 0.24, material='gunmetal')


def build_candle(s, i):
    a = STEP * i
    x, y, _ = polar(R, a)
    rz = math.radians(a)
    out = Vector((math.cos(rz), math.sin(rz), 0))
    tan = Vector((-math.sin(rz), math.cos(rz), 0))
    # stone pad and plinth: grey stone step, ivory die, charcoal cornice
    lathe(s, f'Pad{i}', (x, y), [(WALK_Z1 - 0.8, 7.2), (WALK_Z1 + 0.55, 7.6), (WALK_Z1 + 0.9, 7.2)], 'paint2', segs=8,
          phase=rz + math.pi / 8, smooth=20.0)
    lathe(s, f'Plinth{i}', (x, y), [
        (WALK_Z1 + 0.9, 3.4, 'paint2'), (WALK_Z1 + 1.9, 3.4, 'paint2'), (WALK_Z1 + 1.9, 2.9), (WALK_Z1 + 6.4, 2.6),
        (WALK_Z1 + 6.4, 3.1, 'paint.graphite'), (WALK_Z1 + 7.3, 3.1, 'paint.graphite'), (WALK_Z1 + 7.3, 2.0),
    ], 'paint', segs=8, phase=rz + math.pi / 8, smooth=20.0)
    # pylon: a slender ivory shaft with charcoal courses and a bronze collar under the bowl
    z0 = WALK_Z1 + 7.3
    prof = [(z0, 1.55)]
    for k, zb in enumerate((z0 + 3.6, z0 + 8.2, z0 + 12.8)):
        rr = 1.55 - (zb - z0) * 0.022
        prof += [(zb, rr, 'paint.graphite'), (zb + 0.55, rr)]
    prof += [(PYLON_TOP - 2.2, 1.05, 'stripe'), (PYLON_TOP - 1.4, 1.05, 'stripe'), (PYLON_TOP - 1.4, 1.25),
             (PYLON_TOP - 0.9, 1.25)]
    lathe(s, f'Pylon{i}', (x, y), prof, 'paint', segs=14, smooth=40.0)
    # votive bowl: charcoal cup, amber votive ring round the lip (crown scaled by CROWN_K)
    K = CROWN_K
    T = PYLON_TOP
    lathe(s, f'Bowl{i}', (x, y), [
        (T - 0.9, 1.0), (T - 0.2 * K, 1.8 * K), (T + 0.9 * K, 2.7 * K), (T + 1.3 * K, 2.9 * K),
        (T + 1.3 * K, 2.3 * K, 'dark'), (T + 0.7 * K, 1.9 * K),
    ], 'paint.graphite', segs=16, smooth=50.0)
    F.ring(s, f'Votive{i}', (x, y, T + 1.35 * K), 2.75 * K, 0.24, axis=(0, 0, 1), material='glow_amber', segments=20,
           sides=4)
    # the flame: amber root, warm body, a teardrop tip
    fz = T + 0.6 * K
    lathe(s, f'Flame{i}', (x, y), [
        (fz, 0.01, 'glow_amber'), (fz + 0.5 * K, 1.9 * K, 'glow_amber'), (fz + 1.6 * K, 2.35 * K), (fz + 3.1 * K, 2.2 * K),
        (fz + 4.7 * K, 1.5 * K), (fz + 6.1 * K, 0.75 * K), (fz + 7.4 * K, 0.0),
    ], 'glow_warm', segs=16, smooth=80.0)
    # lantern cage: six bronze ribs from the lip curving in to a crown ring, a finial on top
    ribs = []
    for k in range(6):
        ang = rz + math.pi / 6 * (2 * k + 1)
        d = Vector((math.cos(ang), math.sin(ang), 0))
        p0 = Vector((x, y, T + 1.2 * K)) + d * 2.95 * K
        p1 = Vector((x, y, T + 5.2 * K)) + d * 2.75 * K
        p2 = Vector((x, y, T + 8.6 * K)) + d * 0.7 * K
        ribs += [(p0, p1), (p1, p2)]
    beams(s, f'Cage{i}', ribs, 0.26, material='stripe')
    F.ring(s, f'CageCrown{i}', (x, y, T + 8.6 * K), 0.7 * K, 0.16, axis=(0, 0, 1), material='stripe', segments=10,
           sides=4)
    lathe(s, f'Finial{i}', (x, y), [
        (T + 8.5 * K, 0.35), (T + 9.4 * K, 0.2), (T + 10.4 * K, 0.0),
    ], 'stripe', segs=8)
    # underside: the pylon's counterweight finial through the keel to the under-truss
    lathe(s, f'Root{i}', (x, y), [
        (WALK_Z0 - 3.6, 2.2), (WALK_Z0 - 6.5, 1.5), (-11.0, 1.1), (-13.5, 0.4), (-14.5, 0.0),
    ], 'paint.graphite', segs=10)
    # eight family votives on the pad's corners: a small warm halo at every candle's foot
    vot = []
    for k in range(8):
        ang = rz + math.pi / 8 + k * math.pi / 4
        vot.append(((x + 6.1 * math.cos(ang), y + 6.1 * math.sin(ang), WALK_Z1 + 1.15), (0.5, 0.5, 0.45), ang))
    cluster(s, f'PadVotives{i}', vot, 'glow_warm')
    # bronze family plaque on the outward face of the die, a second on the inward face
    for side, nm in ((1, 'O'), (-1, 'I')):
        p = Vector((x, y, 0)) + out * side * 2.86
        F.box(s, f'Plaque{nm}{i}', (p.x, p.y, WALK_Z1 + 4.1), (0.16, 2.2, 1.6), material='stripe', rot_z=rz, bevel=0.0)


def build_candle_details(s):
    """Family shrines, votives, ribbon masts, path lamps: the density that gives the ring its scale."""
    shrines, votives, plaques, masts, ribbons, lamps, lamp_posts = [], [], [], [], [], [], []
    for i in range(N):
        for f in (0.33, 0.67):
            a = STEP * (i + f)
            if (i == 0 and f < 0.5) or (i == N - 1 and f > 0.5):
                continue  # the dark plinth's neighbours stay unlit
            rz = math.radians(a)
            for rr, sgn in ((WALK_R0 + 2.6, 1), (WALK_R1 - 2.6, -1)):
                x, y, _ = polar(rr, a + sgn * 0.9)
                shrines.append(((x, y, WALK_Z1 + 0.55), (1.3, 1.9, 1.1), rz))
                plaques.append(((x, y, WALK_Z1 + 1.14), (0.9, 1.3, 0.08), rz))
                for dv in (-0.55, 0.0, 0.55):
                    vx, vy, _ = polar(rr - sgn * 0.35, a + sgn * 0.9 + math.degrees(dv / rr))
                    votives.append(((vx, vy, WALK_Z1 + 1.25), (0.28, 0.28, 0.3), rz))
        # ribbon mast on the outer kerb in the middle of each bay, white ribbons streaming outward
        am = STEP * (i + 0.5)
        if i in (0, N - 1) or abs(am - TENDER_A) < 4:
            pass
        else:
            mx, my, _ = polar(WALK_R1 - 0.35, am)
            masts.append(((mx, my, WALK_Z1), (mx, my, WALK_Z1 + 13.0)))
            rzm = math.radians(am)
            out = Vector((math.cos(rzm), math.sin(rzm), 0))
            for k, (zz, ln) in enumerate(((12.4, 7.0), (11.2, 5.4), (10.0, 4.0))):
                c = Vector((mx, my, WALK_Z1 + zz)) + out * (ln / 2 + 0.2)
                ribbons.append(((c.x, c.y, c.z - k * 0.4), (ln, 0.9, 0.06), rzm))
        # path lamps: small warm lamps on the inner kerb, four per bay
        for f in (0.2, 0.4, 0.6, 0.8):
            a = STEP * (i + f)
            if (i == 0 and f < 0.5) or (i == N - 1 and f > 0.5):
                continue
            lx, ly, _ = polar(WALK_R0 + 0.35, a)
            lamps.append(((lx, ly, WALK_Z1 + 1.35), (0.45, 0.45, 0.35), math.radians(a)))
    cluster(s, 'Shrines', shrines, 'paint')
    cluster(s, 'ShrinePlaques', plaques, 'stripe')
    cluster(s, 'Votives', votives, 'glow_warm')
    cluster(s, 'PathLamps', lamps, 'glow_warm')
    beams(s, 'RibbonMasts', masts, 0.32, material='paint.graphite')
    cluster(s, 'Ribbons', ribbons, 'paint')
    tips = [((p1[0], p1[1], p1[2] + 0.15), (0.4, 0.4, 0.3), 0.0) for _, p1 in masts]
    cluster(s, 'MastTips', tips, 'stripe')


def build_dark_plinth(s):
    """Index 0 (+X): the 25th plinth — larger, charcoal, unlit, holding the recovered hull."""
    x, y = R, 0.0
    F.plate(s, 'DarkPad', octagon(9.5, (x, y), 0.0), z0=WALK_Z1, thickness=1.1, material='paint.graphite',
            chamfer=0.4, bevel=0.1)
    # ivory outline so the dark block still reads as a plinth from above
    ring_pts = octagon(9.8, (x, y), 0.0)
    edges = [((*ring_pts[k], WALK_Z1 + 0.5), (*ring_pts[(k + 1) % 8], WALK_Z1 + 0.5)) for k in range(8)]
    beams(s, 'DarkPadEdge', edges, 0.5, material='paint', h=1.0)
    lathe(s, 'DarkDie', (x, y), [
        (WALK_Z1 + 1.1, 6.6, 'paint.graphite'), (WALK_Z1 + 2.4, 6.6), (WALK_Z1 + 2.4, 5.8), (WALK_Z1 + 8.2, 5.4),
        (WALK_Z1 + 8.2, 6.2, 'paint.graphite'), (WALK_Z1 + 9.3, 6.2), (WALK_Z1 + 9.3, 4.6),
    ], 'dark', segs=8, phase=math.pi / 8, smooth=20.0)
    ztop = WALK_Z1 + 9.3
    # cradle: four charcoal claws rising from the die round the fragment
    claws = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = Vector((x + sx * 3.4, y + sy * 3.4, ztop))
            p1 = Vector((x + sx * 4.4, y + sy * 5.0, ztop + 5.5))
            p2 = Vector((x + sx * 3.6, y + sy * 4.2, ztop + 8.5))
            claws += [(p0, p1), (p1, p2)]
    beams(s, 'Cradle', claws, 0.9, material='paint.graphite')
    # the recovered hull fragment: the bow section of a convoy hauler, torn off aft, burnt, its
    # windows dark. It rides nose-up in the cradle, nose outward along the convoy's last course.
    zc = ztop + 6.2
    F.loft(s, 'Fragment', [
        dict(x=x - 6.6, w=3.9, ht=3.7, hb=3.1, zc=zc, n=2.9),
        dict(x=x - 3.5, w=4.1, ht=3.9, hb=3.2, zc=zc, n=3.0),
        dict(x=x + 1.0, w=3.8, ht=3.6, hb=3.0, zc=zc + 0.1, n=2.9),
        dict(x=x + 4.6, w=3.0, ht=2.9, hb=2.4, zc=zc + 0.1, n=2.6),
        dict(x=x + 7.2, w=1.7, ht=1.8, hb=1.4, zc=zc, n=2.3),
        dict(x=x + 8.6, w=0.5, ht=0.6, hb=0.5, zc=zc - 0.1, n=2.0),
    ], material='paint.scorch', back_material='dark', count=32, bevel=0.05)
    frag_pivot = Vector((x, y, zc))
    # the convoy's livery survives as one faded orange band; a charcoal frame course; dark bridge glass
    F.band(s, 'Fragment', (x - 1.4, 0, 0), (1, 0, 0), 1.5, 'hazard', inset=0.05, depth=0.06)
    F.band(s, 'Fragment', (x + 2.6, 0, 0), (1, 0, 0), 0.5, 'paint.graphite', inset=0.05, depth=0.1)
    F.band(s, 'Fragment', (x + 5.9, 0, zc), (1, 0, 0), 1.5, 'glass', facing=(0.5, 0, 0.85), min_facing=0.3)
    # the torn aft edge: jagged skin plates bent back from the break, frames and stringers exposed
    torn = []
    jag = []
    for k in range(11):
        ang = 2 * math.pi * k / 11 + 0.2
        ry, rz_ = 3.9 * math.cos(ang), (3.7 if math.sin(ang) > 0 else 3.1) * math.sin(ang)
        ln = (1.2, 2.8, 0.7, 2.1, 3.3, 1.0, 2.4, 0.9, 3.0, 1.6, 2.2)[k]
        jag.append(((x - 6.6 - ln / 2, y + ry * 0.97, zc + rz_ * 0.97), (ln, 1.9, 0.14), ang))
    bm = bmesh.new()
    for c, sz, ang in jag:
        g = bmesh.ops.create_cube(bm, size=1.0)
        vs = g['verts']
        for v in vs:
            v.co.x *= sz[0]
            v.co.y *= sz[1]
            v.co.z *= sz[2]
        bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(ang + math.pi / 2, 3, 'X'))
        bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(0.25 * math.sin(3 * ang), 3, 'Z'))
        bmesh.ops.translate(bm, verts=vs, vec=c)
    torn.append(s.add(F._new_object('TornPlates', bm, s.slots(['paint.scorch']), bevel=0.0, smooth_angle=30.0)))
    frames = []
    for k in range(6):
        ang = math.radians(15 + k * 60)
        py = y + 3.3 * math.cos(ang)
        pz = zc + 3.0 * math.sin(ang)
        frames.append(((x - 5.0, py, pz), (x - 9.2 + (k % 3) * 0.8, py * 1.04, pz + 0.3 * (k % 2))))
    torn.append(beams(s, 'TornStringers', frames, 0.3, material='paint.graphite'))
    torn.append(F.ring(s, 'TornFrame', (x - 5.6, y, zc), 3.4, 0.3, axis=(1, 0, 0), material='paint.graphite',
                       segments=20, sides=4))
    # held aloft: nose raised and slightly yawed, torn end toward the still point
    tilt = (Matrix.Translation(frag_pivot) @ Matrix.Rotation(math.radians(10), 4, 'Z') @
            Matrix.Rotation(math.radians(-24), 4, 'Y') @ Matrix.Translation(-frag_pivot))
    for o in [bpy_obj('Fragment')] + torn:
        o.data.transform(tilt)
    # the flight recorder in a glass case on the plinth's inward face (towards the still point)
    F.box(s, 'RecorderCase', (x - 7.2, y, WALK_Z1 + 3.4), (1.6, 2.4, 2.6), material='glass', bevel=0.02)
    F.box(s, 'Recorder', (x - 7.2, y, WALK_Z1 + 3.2), (1.0, 1.5, 1.2), material='hazard', bevel=0.05)
    F.box(s, 'RecorderStand', (x - 7.2, y, WALK_Z1 + 1.6), (2.0, 2.8, 1.0), material='paint.graphite', bevel=0.05)
    # bronze plaques round the die: the convoy's roll
    for k in range(8):
        ang = math.pi / 4 * k
        if k == 4:
            continue
        p = Vector((x, y, 0)) + Vector((math.cos(ang), math.sin(ang), 0)) * 5.62
        F.box(s, f'Roll{k}', (p.x, p.y, WALK_Z1 + 5.4), (0.16, 3.0, 3.2), material='stripe', rot_z=ang, bevel=0.0)
    lathe(s, 'DarkRoot', (x, y), [
        (WALK_Z0 - 3.6, 3.6), (WALK_Z0 - 7.0, 2.6), (-12.5, 1.6), (-16.0, 0.6), (-17.0, 0.0),
    ], 'paint.graphite', segs=12)


def build_still_point(s):
    """The dark still point at the centre: a matte black pool in a charcoal lens with bronze ripple
    rings, an ivory rim, three tension spokes to the ring and the bronze course line to the dark plinth."""
    lathe(s, 'Lens', (0, 0), [
        (-8.5, 0.0), (-7.6, 5.5), (-4.6, 12.0), (-1.4, 15.2), (0.2, 15.6, 'paint.graphite'), (0.7, 15.6),
        (0.7, 13.6, 'dark.pool'), (0.3, 13.2),
    ], 'paint.graphite', segs=56, smooth=35.0)
    F.ring(s, 'Rim', (0, 0, 0.72), 14.6, 0.42, axis=(0, 0, 1), material='paint', segments=72, sides=6)
    F.ring(s, 'RimInner', (0, 0, 0.5), 13.4, 0.14, axis=(0, 0, 1), material='stripe', segments=72, sides=4)
    for k, rr in enumerate((3.2, 6.6, 10.0)):
        annulus(s, f'Ripple{k}', rr - 0.14, rr + 0.14, 0.3, 0.05, 48, material='stripe', side='stripe', bevel=0.0)
    lathe(s, 'StillCore', (0, 0), [(0.3, 1.1), (0.7, 1.1), (0.9, 0.7), (1.0, 0.0)], 'paint.graphite', segs=16)
    # 24 small bronze studs round the rim (one per flame) and a gap facing the dark plinth
    studs = []
    for i in range(1, N):
        a = STEP * i
        px, py, _ = polar(14.6, a)
        studs.append(((px, py, 1.2), (0.8, 0.8, 0.4), math.radians(a)))
    cluster(s, 'RimStuds', studs, 'stripe')
    # tension spokes (charcoal) at 120-degree steps; the +X one carries the course line
    spokes = []
    for a in (0.0, 120.0, 240.0):
        spokes.append((polar(15.2, a, -0.4), polar(WALK_R0 + 0.4, a, -0.4)))
    beams(s, 'Spokes', spokes, 1.1, material='paint.graphite', h=1.4)
    under = []
    for a in (0.0, 120.0, 240.0):
        under.append((polar(12.0, a, -6.0), polar(WALK_R0 - 1.0, a, -2.6)))
    beams(s, 'SpokeStays', under, 0.5, material='gunmetal')
    beams(s, 'CourseLine', [((15.3, 0, 0.33), (WALK_R0 + 0.4, 0, 0.33))], 0.45, material='stripe', h=0.12)
    # spoke feet on the kerb
    for a in (0.0, 120.0, 240.0):
        px, py, _ = polar(WALK_R0 - 0.2, a)
        F.box(s, f'SpokeFoot{int(a)}', (px, py, WALK_Z0 + 0.4), (2.2, 3.2, 2.6), material='paint.graphite',
              rot_z=math.radians(a), bevel=0.06)


def build_tender(s):
    """The caretaker's pier, lodge and moored tender on the -Y side."""
    a = TENDER_A
    rz = math.radians(a)
    out = Vector((math.cos(rz), math.sin(rz), 0))
    base = Vector(polar(WALK_R1, a))
    # pier: a charcoal gangway out from the kerb to a mooring head
    p_end = base + out * 12.0
    beams(s, 'Pier', [((base - out * 0.5).to_tuple(), p_end.to_tuple())], 3.4, material='paint.graphite', h=1.4)
    beams(s, 'PierDeck', [((base + Vector((0, 0, 0.75))).to_tuple(), (p_end + Vector((0, 0, 0.75))).to_tuple())],
          2.4, material='paint2', h=0.14)
    F.cylinder(s, 'MooringHead', tuple(p_end + Vector((0, 0, -2.5))), tuple(p_end + Vector((0, 0, 1.6))), 2.2,
               material='paint2', segments=16, bevel=0.05)
    F.beacon(s, 'MooringBeacon', tuple(p_end + Vector((0, 0, 1.6))), 'glow_amber', size=0.8)
    # the tender: a small Helios work boat moored along the pier head, nose +X
    ty = p_end.y - 5.2
    tx = p_end.x
    tz = -0.2
    F.loft(s, 'Tender', [
        dict(x=tx - 9.0, w=2.2, ht=1.8, hb=1.6, zc=tz, n=2.6, y=ty),
        dict(x=tx - 8.2, w=2.9, ht=2.4, hb=2.1, zc=tz, n=2.8, y=ty),
        dict(x=tx + 2.5, w=3.0, ht=2.5, hb=2.1, zc=tz, n=2.8, y=ty),
        dict(x=tx + 6.4, w=2.2, ht=1.9, hb=1.7, zc=tz - 0.1, n=2.5, y=ty),
        dict(x=tx + 8.6, w=0.9, ht=0.9, hb=0.9, zc=tz - 0.2, n=2.2, y=ty),
    ], material='paint', belly='paint.graphite', back_material='dark', count=32, bevel=0.04)
    F.band(s, 'Tender', (tx - 3.0, ty, 0), (1, 0, 0), 1.0, 'stripe', inset=0.04, depth=0.06)
    F.band(s, 'Tender', (tx + 0.5, ty, 0), (1, 0, 0), 0.4, 'paint.graphite', inset=0.04, depth=0.06)
    F.band(s, 'Tender', (tx + 7.2, ty, tz), (1, 0, 0), 1.2, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    for dy in (-1.3, 1.3):
        F.nozzle(s, f'TenderDrive{dy:+.1f}', (tx - 9.6, ty + dy, tz), 0.85, 0.9, material='gunmetal',
                 glow='glow_amber')
    F.box(s, 'TenderClamp', (tx - 1.0, (ty + 3.0 + p_end.y - 2.0) / 2, 0.3), (1.6, abs(p_end.y - 2.0 - ty - 3.0) + 0.6,
          1.0), material='paint.graphite', bevel=0.04)
    F.box(s, 'TenderCargo', (tx - 4.8, ty, tz + 2.6), (4.2, 3.0, 1.0), material='paint2', bevel=0.05)
    F.light(s, 'TenderNavP', (tx + 4.0, ty + 3.05, tz), 'glow_red', size=0.4)
    F.light(s, 'TenderNavS', (tx + 4.0, ty - 3.05, tz), 'glow_green', size=0.4)
    F.work_lamp(s, 'TenderLamp', (tx - 1.5, ty, tz + 2.7), aim=(0.3, 0.6, 1.0), size=0.7)
    # keeper's lodge on the walk beside the pier root
    lodge = base - out * 5.0 + Vector(polar(1.0, a + 90)) * 6.5
    F.box(s, 'Lodge', (lodge.x, lodge.y, WALK_Z1 + 2.0), (6.0, 7.4, 4.0), material='paint', rot_z=rz, bevel=0.2)
    F.box(s, 'LodgeRoof', (lodge.x, lodge.y, WALK_Z1 + 4.3), (6.6, 8.0, 0.6), material='paint.graphite', rot_z=rz,
          bevel=0.1)
    F.antenna(s, 'LodgeMast', (lodge.x, lodge.y, WALK_Z1 + 4.6), 4.0, tip='glow_red')
    wins = []
    for k in range(4):
        p = lodge + Vector(polar(1.0, a + 90)) * (-2.4 + k * 1.6) + out * 3.05
        wins.append(((p.x, p.y, WALK_Z1 + 2.4), (0.14, 0.9, 1.1), rz))
        p = lodge + Vector(polar(1.0, a + 90)) * (-2.4 + k * 1.6) - out * 3.05
        wins.append(((p.x, p.y, WALK_Z1 + 2.4), (0.14, 0.9, 1.1), rz))
    cluster(s, 'LodgeWin', wins, 'glow_warm')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Camera_Focus', (0.0, 0.0, 12.0))
    build_ring(s)
    for i in range(1, N):
        build_candle(s, i)
    build_dark_plinth(s)
    build_still_point(s)
    build_tender(s)
    s.detail = 1
    build_candle_details(s)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
