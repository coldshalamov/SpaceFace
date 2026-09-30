"""The Resonant Cathedral — Vesta Forge's converted foundry, held by the Choir. Forge landmark.

Idea: "foundry hall under a singing arch". Plan read from the chase camera: a long rust-and-charcoal
furnace hall (sawtooth roof, buttressed walls, four furnace stacks on its -X flank, a casting yard
with a bridge crane on its +X flank). At each end of the hall a heavy drum carries a tall dark spire
ribbed in ash-grey and banded with magenta light, each ringed at its foot by a stand of organ pipes.
Between the spires, leaning out over the hall toward +X, springs the resonance arch: a ribbed lune
of four rails and organ-pipe ribs, threaded with magenta tuning rings, with a resonator bell hung
from its crown. The old foundry's hazard notices are still bolted to the drums beneath the arch.
Three values: ash-grey concrete and pipes, foundry rust, charcoal; magenta is the Choir's light,
amber the furnace's.
Sockets: SOCKET_Structure_Core at the hall's centre, SOCKET_Camera_Focus above it under the arch.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_landmark_resonant_cathedral'
MAG = 'glow_cyan.magenta'
COLORS = {
    'paint': '#6f695e',            # ash-grey concrete / pipe metal (the light value)
    'paint2': '#2c150b',           # foundry rust, authored dark (the key light lifts it)
    'stripe': '#4a1240',           # Choir magenta paint (banners, bands), authored dark
    'hazard': '#9a7418',           # old foundry notice yellow
    'paint.graphite': '#222428',   # charcoal
    'paint.spire': '#241f2a',      # violet-charcoal spire skin
    'dark': '#131417',
    'glass': '#0b0e12',
    MAG: '#ff3ad0',
    'glow_amber': '#ff8a24',       # furnace embers
    'glow_warm': '#ffb46a',
}

HX0, HX1 = -22.0, 22.0          # furnace hall plan
HY0, HY1 = -64.0, 64.0
HZ0, HZ1 = -6.0, 14.0           # wall base / eaves
SPIRE_Y = 76.0
SPIRE_Z0, SPIRE_Z1 = 22.0, 106.0
ARCH_Z0 = 40.0                  # arch springs from the spires here
ARCH_LEAN = math.radians(27.0)  # the arch leans out over the hall toward +X


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (r * math.cos(a), r * math.sin(a), z)


# --- local helpers ------------------------------------------------------------------------------

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


def lathe(s, name, c, prof, material, segs=24, bevel=0.0, smooth=40.0, phase=0.0):
    """Vertical solid of revolution about (cx, cy): prof = [(z, r) or (z, r, finish)] bottom to top.
    The finish on a profile row paints the faces between that row and the next. r == 0 makes a pole."""
    cx, cy = c
    bm = bmesh.new()
    finishes = list(dict.fromkeys([material] + [p[2] for p in prof if len(p) > 2]))
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
        mi = finishes.index(prof[k][2] if len(prof[k]) > 2 else material)
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


def path_sweep(s, name, pts, w, h, material, side=(1.0, 0.0, 0.0), closed=False):
    """Rectangular beam along a polyline with a fixed side axis (no twist on steep arches)."""
    bm = bmesh.new()
    sv = Vector(side).normalized()
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        if closed:
            t = (Vector(pts[(i + 1) % n]) - Vector(pts[(i - 1) % n])).normalized()
        else:
            t = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        sd = (sv - t * sv.dot(t)).normalized()
        nrm = t.cross(sd).normalized()
        rings.append([bm.verts.new(p + sd * a * w / 2 + nrm * b * h / 2) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    m = n if closed else n - 1
    for i in range(m):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((a[j], a[k], b[k], b[j]))
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=35.0))


def yz_prism(s, name, outline, x0, x1, material, end_material=None, bevel=0.05):
    """A slab whose outline is drawn in the YZ plane, extruded along X from x0 to x1."""
    bm = bmesh.new()
    a = [bm.verts.new((x0, y, z)) for (y, z) in outline]
    b = [bm.verts.new((x1, y, z)) for (y, z) in outline]
    fa = bm.faces.new(a)
    fb = bm.faces.new(list(reversed(b)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = list(dict.fromkeys([material] + ([end_material] if end_material else [])))
    if end_material:
        fa.material_index = 1
        fb.material_index = 1
    return s.add(F._new_object(name, bm, s.slots(mats), bevel=bevel, smooth_angle=30.0))


def spire_r(z):
    """Spire radius at height z: a slow concave taper from the drum shoulder to the needle."""
    t = min(max((z - SPIRE_Z0) / (SPIRE_Z1 - SPIRE_Z0), 0.0), 1.0)
    return 0.9 + 7.4 * (1.0 - t) ** 1.35


def arch_point(sign_y, theta, y0, h, x_off=0.0):
    """Point on the leaning arch: theta 0 at the -Y spire, pi at the +Y spire."""
    y = -y0 * math.cos(theta)
    up = h * math.sin(theta)
    return Vector((x_off * math.cos(ARCH_LEAN) + up * math.sin(ARCH_LEAN), y,
                   ARCH_Z0 + up * math.cos(ARCH_LEAN) - x_off * math.sin(ARCH_LEAN)))


# --- the foundry hall --------------------------------------------------------------------------

def build_hall(s):
    F.plate(s, 'Basement', [(HX1 - 2, HY0 + 2), (HX1 - 2, HY1 - 2), (HX0 + 2, HY1 - 2), (HX0 + 2, HY0 + 2)],
            z0=-15.0, thickness=9.2, material='paint.graphite', chamfer=0.6, chamfer_bottom=1.5, bevel=0.2)
    F.plate(s, 'Hall', [(HX1, HY0), (HX1, HY1), (HX0, HY1), (HX0, HY0)], z0=HZ0, thickness=HZ1 - HZ0,
            material='paint2', top_material='paint.graphite', bevel=0.25)
    F.band(s, 'Hall', (0, 0, 9.5), (0, 0, 1), 0.9, 'paint.graphite', inset=0.08, depth=0.3)
    F.band(s, 'Hall', (0, 0, -3.2), (0, 0, 1), 1.4, 'paint.graphite', inset=0.08, depth=0.3)
    F.band(s, 'Hall', (0, 0, 12.4), (0, 0, 1), 0.45, MAG)   # the Choir's halo along the eaves
    # sawtooth north-light roof: twelve teeth, rust slopes, lit glazing on the steep faces
    bay = (HY1 - HY0) / 12
    for k in range(12):
        y0 = HY0 + bay * k
        yz_prism(s, f'Tooth{k}', [(y0, HZ1), (y0 + bay, HZ1), (y0 + bay, HZ1 + 6.0), (y0 + bay - 0.6, HZ1 + 6.0)],
                 HX0 + 0.8, HX1 - 0.8, 'paint2', end_material='paint.graphite', bevel=0.08)
    glaze, lit = [], []
    for k in range(12):
        yg = HY0 + bay * (k + 1) + 0.08
        for j in range(12):
            xg = HX0 + 2.6 + j * (HX1 - HX0 - 5.2) / 11
            for zz in (HZ1 + 1.9, HZ1 + 4.2):
                pane = ((xg, yg, zz), (2.6, 0.14, 1.7), 0.0)
                (lit if (j * 7 + k * 3 + int(zz)) % 5 == 0 else glaze).append(pane)
    cluster(s, 'Glazing', glaze, 'glass')
    cluster(s, 'GlazingLit', lit, 'glow_warm')
    mull = []
    for k in range(12):
        yg = HY0 + bay * (k + 1) + 0.12
        mull.append(((0, yg, HZ1 + 3.05), (HX1 - HX0 - 2.0, 0.2, 0.3), 0.0))
    cluster(s, 'GlazingTransoms', mull, 'paint.graphite')
    # charcoal ridge caps: the sawtooth reads as dark lines across the hall from above
    caps = [((0, HY0 + bay * (k + 1) - 0.35, HZ1 + 6.15), (HX1 - HX0 - 1.2, 1.1, 0.5), 0.0) for k in range(12)]
    cluster(s, 'RidgeCaps', caps, 'paint.graphite')
    # buttresses along both long walls
    for side in (1, -1):
        items = []
        for k in range(13):
            y = HY0 + bay * k
            items.append(((side * (HX1 + 0.9), y, 4.0), (1.8, 1.6, 20.0), 0.0))
            items.append(((side * (HX1 + 1.6), y, -2.0), (1.6, 1.8, 8.0), 0.0))
        cluster(s, f'Buttress{side:+d}', items, 'paint.graphite', bevel=0.08)
    # gutters / rails on the wall heads
    for side in (1, -1):
        beams(s, f'WallRail{side:+d}', [((side * (HX1 - 0.3), HY0, HZ1 + 0.4), (side * (HX1 - 0.3), HY1, HZ1 + 0.4))],
              1.0, material='paint.graphite', h=0.8)
    # end walls: rust gables with a great round (rose) opening lit magenta, facing each spire
    for side in (1, -1):
        y = side * (HY1 + 0.05)
        F.cylinder(s, f'Rose{side:+d}', (0, y - side * 0.4, 4.0), (0, y + side * 0.3, 4.0), 7.5, material='paint.graphite',
                   segments=32, bevel=0.0)
        F.cylinder(s, f'RoseGlass{side:+d}', (0, y + side * 0.2, 4.0), (0, y + side * 0.45, 4.0), 6.2, material=MAG,
                   segments=32, bevel=0.0)


def build_hall_details(s):
    wins = []
    bay = (HY1 - HY0) / 12
    for side in (1, -1):
        for k in range(12):
            for j in range(3):
                y = HY0 + bay * k + bay * (j + 1) / 4
                for z in (-1.0, 3.2, 7.2):
                    wins.append(((side * (HX1 + 0.06), y, z), (0.14, 1.1, 1.8), 0.0))
    cluster(s, 'HallWin', wins, 'glow_warm')
    # roof vents on the slopes, work lamps on the wall heads, magenta banners on the long walls
    for k in range(0, 12, 2):
        y = HY0 + bay * k + bay * 0.45
        F.vent(s, f'RoofVent{k}', (-9.0, y, HZ1 + 3.4), (5.0, 3.0, 0.8), slats=5)
    lamps = []
    for side in (1, -1):
        for k in range(0, 13, 3):
            y = HY0 + bay * k
            lamps.append(((side * (HX1 + 0.9), y, 14.4), (0.9, 0.9, 0.5), 0.0))
    cluster(s, 'WallLamps', lamps, 'glow_amber')
    banners = []
    for side in (1, -1):
        for k in (1, 4, 7, 10):
            y = HY0 + bay * (k + 0.5)
            banners.append(((side * (HX1 + 0.18), y, 2.5), (0.12, 2.6, 12.0), 0.0))
    cluster(s, 'Banners', banners, 'stripe')


def build_stacks(s):
    """Four furnace stacks on the -X flank, flue ducts into the hall, embers still glowing."""
    for k, y in enumerate((-45.0, -15.0, 15.0, 45.0)):
        x = -31.0
        top = 56.0 if k in (1, 2) else 48.0
        lathe(s, f'Stack{k}', (x, y), [
            (-12.0, 3.0), (-9.0, 5.2, 'paint.graphite'), (HZ1 + 2.0, 5.0), (HZ1 + 3.0, 4.6, 'paint2'),
            (top - 16, 4.1, 'paint2'), (top - 15, 4.1), (top - 4.0, 3.7, 'hazard'), (top - 2.6, 3.7),
            (top - 0.8, 3.7, 'paint.graphite'), (top, 4.2, 'paint.graphite'), (top, 3.1, 'dark'), (top - 1.4, 2.8),
        ], 'paint.graphite', segs=24, smooth=40.0)
        lathe(s, f'Ember{k}', (x, y), [(top - 1.2, 2.9), (top - 1.0, 2.9)], 'glow_amber', segs=16)
        # flue duct into the hall wall and two brace frames
        F.box(s, f'Flue{k}', ((x + HX0) / 2, y, 2.0), (abs(HX0 - x) + 1.0, 5.2, 6.0), material='paint.graphite',
              bevel=0.15)
        F.band(s, f'Flue{k}', ((x + HX0) / 2, y, 0), (1, 0, 0), 0.8, 'paint2', inset=0.05, depth=0.12)
        for zb in (22.0, 36.0):
            beams(s, f'StackBrace{k}{int(zb)}', [((x + 4.0, y, zb), (HX0 - 0.2, y, zb - 6.0))], 0.8,
                  material='paint.graphite')
            F.ring(s, f'StackCollar{k}{int(zb)}', (x, y, zb), 4.9 - (zb - 16) * 0.012, 0.35, axis=(0, 0, 1),
                   material='paint.graphite', segments=24, sides=4)
        F.light(s, f'StackBeacon{k}', (x + 3.9, y, top + 0.2), 'glow_red', size=0.7)
    # high gantry: a catwalk truss linking the four stacks at the old charging level, a lamp at each stack
    c, w = truss_segs((-26.2, -50.0, 30.0), (-26.2, 50.0, 30.0), 2.2, 2.0, 20)
    beams(s, 'GantryChords', c, 0.4, material='paint.graphite')
    beams(s, 'GantryWebs', w, 0.22, material='paint2')
    cat = [((-24.9, y, 31.2), (0.5, 0.5, 0.4), 0.0) for y in (-50.0, -30.0, 0.0, 30.0, 50.0)]
    cluster(s, 'GantryLamps', cat, 'glow_amber')
    for y in (-50.0, 50.0):
        beams(s, f'GantryHanger{y:+.0f}', [((-26.2, y, 29.0), (HX0 - 0.5, y * 0.98, HZ1 + 0.4))], 0.7,
              material='paint.graphite')
    # a slag conveyor gallery along the flank, joining the stack feet
    beams(s, 'SlagGallery', [((-31.0, -52.0, -6.0), (-31.0, 52.0, -6.0))], 3.4, material='paint2', h=2.8)
    gal = [((-31.0 + 1.75, y, -5.6), (0.12, 1.0, 0.7), 0.0) for y in range(-50, 51, 3)]
    cluster(s, 'GalleryWin', gal, 'glow_amber')


def build_yard(s):
    """Casting annex and the open yard on the +X flank, under a bridge crane."""
    F.plate(s, 'Annex', [(38.0, -44.0), (38.0, -6.0), (HX1, -6.0), (HX1, -44.0)], z0=-8.0, thickness=14.0,
            material='paint2', top_material='paint.graphite', chamfer=0.4, bevel=0.2)
    F.band(s, 'Annex', (0, 0, 2.0), (0, 0, 1), 0.7, 'paint.graphite', inset=0.06, depth=0.2)
    F.panel(s, 'Annex', (30.0, -25.0), (12.0, 30.0), 'paint.graphite', inset=0.3, depth=-0.3)
    for k in range(4):
        F.vent(s, f'AnnexVent{k}', (30.0, -38.0 + k * 8.0, 6.05), (6.0, 3.6, 0.6), slats=6)
    aw = [((38.06, -42.0 + i * 1.9, z), (0.14, 1.0, 1.3), 0.0) for i in range(19) for z in (-4.0, -0.6)
          if (i + int(z)) % 5]
    aw += [((24.0 + i * 1.9, -44.06, z), (1.0, 0.14, 1.3), 0.0) for i in range(7) for z in (-4.0, -0.6)]
    cluster(s, 'AnnexWin', aw, 'glow_warm')
    # open casting floor
    F.plate(s, 'Yard', [(42.0, -2.0), (42.0, 44.0), (HX1, 44.0), (HX1, -2.0)], z0=-9.0, thickness=3.0,
            material='paint.graphite', chamfer=0.3, bevel=0.15)
    grid = []
    for i in range(4):
        for j in range(8):
            grid.append(((25.5 + i * 4.7, 1.8 + j * 5.3, -5.95), (4.0, 4.6, 0.1), 0.0))
    cluster(s, 'YardGrates', grid, 'dark')
    # crane runway: two rails on legs, a hazard-yellow bridge, trolley and ladle
    legs = []
    for x in (HX1 + 1.5, 41.0):
        beams(s, f'Runway{x:.0f}', [((x, -2.0, 12.0), (x, 44.0, 12.0))], 1.6, material='paint.graphite', h=1.8)
        for y in (-1.0, 14.0, 29.0, 43.0):
            legs.append(((x, y, -6.0), (x, y, 11.2)))
    beams(s, 'RunwayLegs', legs, 1.2, material='paint.graphite')
    c, w = truss_segs((HX1 + 0.5, 22.0, 14.2), (42.0, 22.0, 14.2), 2.6, 2.4, 6)
    beams(s, 'BridgeChords', c, 0.5, material='hazard')
    beams(s, 'BridgeWebs', w, 0.28, material='hazard')
    F.box(s, 'Trolley', (33.0, 22.0, 16.2), (3.4, 3.8, 1.8), material='paint.graphite', bevel=0.1)
    F.cylinder(s, 'Cable', (33.0, 22.0, 15.2), (33.0, 22.0, 3.2), 0.18, material='gunmetal', segments=6, bevel=0.0)
    lathe(s, 'Ladle', (33.0, 22.0), [
        (-4.2, 2.2), (-3.4, 3.2), (2.6, 3.6, 'paint.graphite'), (3.2, 3.7), (3.2, 3.2, 'glow_amber'), (2.8, 3.2),
    ], 'paint2', segs=20)
    F.beacon(s, 'CraneBeacon', (33.0, 20.0, 17.1), 'glow_amber', size=0.7)
    ingots = []
    for i in range(3):
        for j in range(4):
            ingots.append(((27.0 + i * 3.2, 34.0 + j * 2.2, -5.2), (2.6, 1.6, 1.4), 0.0))
    cluster(s, 'Ingots', ingots, 'paint')


def build_pier(s):
    """A pilgrim pier off the casting annex (+X) with a Choir barge moored along it."""
    c, w = truss_segs((37.5, -26.0, -3.0), (70.0, -26.0, -3.0), 3.2, 2.6, 10)
    beams(s, 'PierChords', c, 0.5, material='paint.graphite')
    beams(s, 'PierWebs', w, 0.28, material='paint2')
    beams(s, 'PierDeck', [((37.5, -26.0, -1.4), (70.0, -26.0, -1.4))], 2.6, material='paint', h=0.3)
    F.cylinder(s, 'PierHead', (70.0, -26.0, -6.0), (70.0, -26.0, 0.6), 3.0, material='paint.graphite', segments=16,
               bevel=0.05)
    F.beacon(s, 'PierBeacon', (70.0, -26.0, 0.6), MAG, size=1.0)
    lamps = [((40.0 + i * 3.6, -26.0 + sg * 1.4, -1.0), (0.4, 0.4, 0.4), 0.0) for i in range(9) for sg in (1, -1)]
    cluster(s, 'PierLamps', lamps, 'glow_warm')
    # the barge: a long dark hull with a magenta keel band and a lit pilgrim deck
    by, bz = -35.0, -2.0
    F.loft(s, 'Barge', [
        dict(x=40.0, w=2.6, ht=2.2, hb=2.0, zc=bz, n=2.6, y=by),
        dict(x=41.5, w=3.6, ht=3.0, hb=2.6, zc=bz, n=2.8, y=by),
        dict(x=62.0, w=3.6, ht=3.0, hb=2.6, zc=bz, n=2.8, y=by),
        dict(x=67.0, w=2.4, ht=2.3, hb=2.0, zc=bz - 0.2, n=2.4, y=by),
        dict(x=69.5, w=0.8, ht=0.9, hb=0.8, zc=bz - 0.3, n=2.0, y=by),
    ], material='paint.spire', belly='paint.graphite', back_material='dark', count=28, bevel=0.04)
    for x in (47.0, 55.0):
        F.band(s, 'Barge', (x, by, 0), (1, 0, 0), 0.7, MAG)
    F.band(s, 'Barge', (66.5, by, bz), (1, 0, 0), 1.4, 'glass', facing=(0.6, 0, 0.8), min_facing=0.35)
    F.box(s, 'BargeDeck', (51.0, by, bz + 3.4), (14.0, 5.0, 1.4), material='paint', bevel=0.1)
    wins = [((45.0 + i * 1.4, by + sg * 3.62, bz + 0.6), (0.7, 0.12, 0.5), 0.0) for i in range(14) for sg in (1, -1)]
    wins += [((44.5 + i * 1.6, by + sg * 2.52, bz + 3.5), (0.9, 0.12, 0.6), 0.0) for i in range(9) for sg in (1, -1)]
    cluster(s, 'BargeWin', wins, 'glow_warm')
    for dy in (-1.4, 1.4):
        F.nozzle(s, f'BargeDrive{dy:+.0f}', (39.4, by + dy, bz), 1.0, 1.1, material='gunmetal', glow=MAG)
    F.box(s, 'BargeGangway', (54.0, (by + 3.6 - 26.0 - 1.3) / 2, -1.6), (2.0, abs(-26.0 - 1.3 - by - 3.6) + 0.6, 1.2),
          material='paint.graphite', bevel=0.05)
    F.light(s, 'BargeNavP', (63.0, by + 3.7, bz), 'glow_red', size=0.5)
    F.light(s, 'BargeNavS', (63.0, by - 3.7, bz), 'glow_green', size=0.5)


def build_spire(s, side):
    y = side * SPIRE_Y
    tag = 'N' if side > 0 else 'S'
    # the drum: heavy charcoal base where the spire meets the hall end
    lathe(s, f'Drum{tag}', (0, y), [
        (-18.0, 6.0), (-15.0, 13.0, 'paint.graphite'), (-12.0, 14.0), (12.0, 14.0, 'paint2'), (14.0, 14.0),
        (18.0, 12.4, 'paint.graphite'), (18.0, 11.0), (SPIRE_Z0, 10.2),
    ], 'paint.graphite', segs=40, smooth=35.0)
    F.band(s, f'Drum{tag}', (0, y, 4.0), (0, 0, 1), 0.8, MAG)
    # the spire: violet-charcoal, magenta bands at the old shift rhythm (closer as it rises)
    prof = [(SPIRE_Z0, spire_r(SPIRE_Z0))]
    z = SPIRE_Z0 + 12.0
    gap = 12.0
    while z < SPIRE_Z1 - 6:
        prof += [(z, spire_r(z), MAG), (z + 1.3, spire_r(z + 1.3))]
        gap *= 0.84
        z += 1.3 + gap
    prof += [(SPIRE_Z1, spire_r(SPIRE_Z1), MAG), (SPIRE_Z1 + 2.5, 0.7, MAG), (SPIRE_Z1 + 14.0, 0.0)]
    lathe(s, f'Spire{tag}', (0, y), prof, 'paint.spire', segs=16, smooth=30.0)
    # eight ash-grey ribs up the spire
    segs = []
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        pts = []
        for zz in [SPIRE_Z0 - 1.0 + i * (SPIRE_Z1 - 8 - SPIRE_Z0) / 10 for i in range(11)]:
            r = spire_r(zz) + 0.45
            pts.append(Vector((r * math.cos(a), y + r * math.sin(a), zz)))
        segs += list(zip(pts[:-1], pts[1:]))
    beams(s, f'SpireRibs{tag}', segs, 0.9, material='paint')
    # tuning rings: magenta hoops standing off the spire on four spokes
    for j, zr in enumerate((50.0, 72.0, 90.0)):
        rr = spire_r(zr) + 3.4
        F.ring(s, f'Tune{tag}{j}', (0, y, zr), rr, 0.45, axis=(0, 0, 1), material=MAG, segments=40, sides=6)
        sp = []
        for k in range(4):
            a = math.radians(45 + 90 * k)
            sp.append(((spire_r(zr) * math.cos(a), y + spire_r(zr) * math.sin(a), zr),
                       ((rr - 0.3) * math.cos(a), y + (rr - 0.3) * math.sin(a), zr)))
        beams(s, f'TuneSpokes{tag}{j}', sp, 0.35, material='paint.graphite')
    # arch foot collar
    F.ring(s, f'ArchCollar{tag}', (0, y, ARCH_Z0), spire_r(ARCH_Z0) + 0.6, 1.0, axis=(0, 0, 1),
           material='paint.graphite', segments=32, sides=6)
    # organ pipes round the drum shoulder: ash-grey, dark mouths, magenta-lit lips
    for k in range(14):
        a = 360.0 / 14 * k + 12.0
        px, py, _ = polar(12.2, a)
        h = 10.0 + 20.0 * (0.5 + 0.5 * math.cos(math.radians(a - (90 if side < 0 else 270)) * 1.0)) ** 1.4
        z0 = 18.0
        lathe(s, f'Pipe{tag}{k}', (px, y + py), [
            (z0, 1.35), (z0 + 3.0, 1.35, 'dark'), (z0 + 3.8, 1.35, MAG), (z0 + 4.2, 1.35), (z0 + h, 1.25),
            (z0 + h, 0.95, 'dark'), (z0 + h - 1.2, 0.9),
        ], 'paint', segs=10, smooth=40.0)


def build_arch(s):
    """The resonance arch: a lune of two arcs (outer and inner), each a pair of rails, joined by
    organ-pipe ribs; five magenta tuning rings; a resonator bell hung from the crown."""
    y0 = SPIRE_Y - spire_r(ARCH_Z0) - 0.2
    n = 56
    outer_h, inner_h = 50.0, 34.0
    thetas = [math.pi * i / n for i in range(n + 1)]
    for x_off in (-3.6, 3.6):
        path_sweep(s, f'ArchOuter{x_off:+.0f}', [arch_point(0, t, y0, outer_h, x_off) for t in thetas], 1.6, 2.2,
                   'paint.graphite', side=(math.cos(ARCH_LEAN), 0, -math.sin(ARCH_LEAN)))
        path_sweep(s, f'ArchInner{x_off:+.0f}', [arch_point(0, t, y0, inner_h, x_off) for t in thetas], 1.3, 1.8,
                   'paint.graphite', side=(math.cos(ARCH_LEAN), 0, -math.sin(ARCH_LEAN)))
    # magenta light channel on the outer arc's back: the arch's line from every angle
    path_sweep(s, 'ArchLight', [arch_point(0, t, y0, outer_h + 1.25, 0.0) for t in thetas], 1.4, 0.4, MAG,
               side=(math.cos(ARCH_LEAN), 0, -math.sin(ARCH_LEAN)))
    path_sweep(s, 'ArchSpine', [arch_point(0, t, y0, outer_h + 0.6, 0.0) for t in thetas], 5.0, 0.9, 'paint',
               side=(math.cos(ARCH_LEAN), 0, -math.sin(ARCH_LEAN)))
    # organ-pipe ribs: every other step a tall rib between the arcs, cross ties on both faces
    ribs, ties = [], []
    for i in range(1, n):
        t = thetas[i]
        for x_off in (-3.6, 3.6):
            ribs.append((arch_point(0, t, y0, inner_h, x_off), arch_point(0, t, y0, outer_h, x_off)))
        if i % 2 == 0:
            ties.append((arch_point(0, t, y0, outer_h, -3.6), arch_point(0, t, y0, outer_h, 3.6)))
            ties.append((arch_point(0, t, y0, inner_h, -3.6), arch_point(0, t, y0, inner_h, 3.6)))
    beams(s, 'ArchRibs', ribs, 0.7, material='paint')
    beams(s, 'ArchTies', ties, 0.5, material='paint.graphite')
    # tuning rings round the lune
    for j, t in enumerate((0.2, 0.35, 0.5, 0.65, 0.8)):
        th = math.pi * t
        mid_h = (outer_h + inner_h) / 2
        c = arch_point(0, th, y0, mid_h, 0.0)
        tang = (arch_point(0, th + 0.01, y0, mid_h, 0.0) - arch_point(0, th - 0.01, y0, mid_h, 0.0)).normalized()
        rr = (outer_h - inner_h) / 2 * (0.35 + 0.65 * math.sin(th)) + 3.2
        F.ring(s, f'ArchTune{j}', tuple(c), rr, 0.55, axis=tuple(tang), material=MAG, segments=36, sides=6)
    # resonator bell hung from the crown on two cables
    crown = arch_point(0, math.pi / 2, y0, inner_h, 0.0)
    bz = crown.z - 12.0
    for dy in (-1.6, 1.6):
        beams(s, f'BellCable{dy:+.0f}', [((crown.x, dy * 2.2, crown.z - 0.8), (crown.x, dy, bz + 5.0))], 0.25,
              material='gunmetal')
    lathe(s, 'Bell', (crown.x, 0.0), [
        (bz - 0.4, 5.2, 'paint.graphite'), (bz, 5.6, MAG), (bz + 0.5, 5.4), (bz + 2.5, 3.8), (bz + 4.8, 3.0),
        (bz + 5.6, 1.6), (bz + 6.0, 0.0),
    ], 'paint', segs=28, smooth=45.0)
    lathe(s, 'BellMouth', (crown.x, 0.0), [(bz - 0.35, 4.6), (bz + 3.0, 2.0), (bz + 3.2, 0.0)], 'dark', segs=28)
    # the old foundry's notices bolted to the drums, facing the hall
    for side in (1, -1):
        y = side * (SPIRE_Y - 14.05)
        for k, x in enumerate((-6.0, 6.0)):
            F.box(s, f'Notice{side:+d}{k}', (x, y, 8.0), (4.2, 0.2, 3.0), material='hazard', bevel=0.02)
            F.box(s, f'NoticeFace{side:+d}{k}', (x, y - side * 0.12, 8.0), (3.4, 0.1, 2.2), material='dark', bevel=0.0)


def build_spire_details(s):
    for side in (1, -1):
        y = side * SPIRE_Y
        tag = 'N' if side > 0 else 'S'
        wins = []
        for z in (-8.0, -3.0, 2.0, 7.0):
            for k in range(28):
                a = 360.0 / 28 * (k + 0.5)
                px, py, _ = polar(14.05, a)
                if side * py < -8.0:
                    continue  # the hall end covers the inboard face
                wins.append(((px, y + py, z), (0.12, 1.2, 1.6), math.radians(a)))
        cluster(s, f'DrumWin{tag}', wins, 'glow_warm')
        lamps = []
        for k in range(8):
            a = 360.0 / 8 * k
            px, py, _ = polar(12.8, a)
            lamps.append(((px, y + py, 18.4), (0.7, 0.7, 0.5), math.radians(a)))
        cluster(s, f'DrumLamps{tag}', lamps, MAG)
        F.light(s, f'SpireTip{tag}', (0, y, SPIRE_Z1 + 14.2), 'glow_red', size=0.9)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (4.0, 0.0, 4.0))
    s.socket('SOCKET_Camera_Focus', (6.0, 0.0, 26.0))
    build_hall(s)
    build_stacks(s)
    build_yard(s)
    build_pier(s)
    build_spire(s, 1)
    build_spire(s, -1)
    build_arch(s)
    s.detail = 1
    build_hall_details(s)
    build_spire_details(s)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
