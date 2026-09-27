"""The Skerris Throne — the Reach raiders' fortress in Skerris Deep. Forge landmark.

Idea: "a colossal throne welded from prizes". Nobody designed it: survivors kept welding. Plan read
from the chase camera: an irregular curtain wall of captured hulls laid end to end (Helios ivory
couriers, work-fleet orange haulers, teal freighters, navy patrol hulls, Ashline rust), stacked two
high in places and fused at bastion drums that carry raider gun turrets. The wall closes on a
patchwork deck of welded plates. In the middle the Throne itself: a colossal chair of hulls —
a seat of two freighters, arm-rests of patrol hulls, a high back of standing hulls — facing +X,
where the wall ends in the skull prow: a plated cranium with glowing sodium eye pits, a jaw of
captured nose cones and two swept-back hull horns. Trophy racks hang on the walls, crude welded
bridges cross the yard, and two docking spars hold moored raider darts.
Ashline language: angular, dark rust and black, exposed machinery, sodium-orange light; the captured
paints are the trophies.
Sockets: SOCKET_Structure_Core at the throne seat, SOCKET_Camera_Focus above it.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_landmark_skerris_throne'
COLORS = {
    'paint': '#2c180f',            # Ashline rust (the raiders' own plate), authored dark
    'paint2': '#161516',           # raider black
    'stripe': '#8a4212',           # sodium-orange livery, authored dark
    'hazard': '#8a6a16',
    'paint.graphite': '#262a2e',   # welds, frames, machinery
    'paint.helios': '#766f61',     # captured Helios ivory
    'paint.work': '#55250d',       # captured work-fleet orange
    'paint.teal': '#143634',       # captured freight teal
    'paint.navy': '#1d2536',       # captured patrol navy
    'paint.bone': '#6a6254',
    'dark.deck': '#0e0e0f',        # the yard deck       # the skull's bleached plate
    'dark': '#121314',
    'glow_amber': '#ff8a1e',       # sodium light
    'glow_warm': '#ffae5a',
}

SEED = [0.37, 0.81, 0.12, 0.64, 0.95, 0.28, 0.53, 0.07, 0.72, 0.41, 0.88, 0.19, 0.66, 0.33, 0.99, 0.02, 0.58,
        0.25, 0.77, 0.46]


def rnd(i):
    return SEED[i % len(SEED)]


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
    """Vertical solid of revolution about (cx, cy): prof = [(z, r) or (z, r, finish)] bottom to top."""
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


def place(objs, pos, yaw=0.0, pitch=0.0, roll=0.0):
    """Move parts built at the origin (nose +X) into the fortress: roll, then pitch (nose up > 0),
    then yaw, then translate. Mesh data is transformed; objects stay at identity."""
    m = (Matrix.Translation(Vector(pos)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-pitch, 4, 'Y') @
         Matrix.Rotation(roll, 4, 'X'))
    for o in objs:
        o.data.transform(m)
    return m


# Captured-hull makes: (paint, belly, cross-section squareness n, livery band finish, nose style)
MAKES = {
    'helios': ('paint.helios', 'paint.graphite', 2.4, 'stripe', 'round'),
    'work': ('paint.work', 'paint2', 3.6, 'hazard', 'blunt'),
    'teal': ('paint.teal', 'paint2', 4.2, 'paint.helios', 'blunt'),
    'navy': ('paint.navy', 'paint2', 2.9, 'paint.helios', 'point'),
    'ash': ('paint', 'paint2', 1.7, 'stripe', 'point'),
}


def hull(s, name, make, L, W, H, pos, yaw=0.0, pitch=0.0, roll=0.0, nose=True, tail=True, windows=None,
         lights=None, bands=2, fin=False, bridge=False, drives=0, straps=False):
    """A captured hull section, built along +X at the origin then placed. nose/tail False = a welded cut
    end (blunt, dark cap). Returns (object, matrix). windows/lights: lists that collect world boxes."""
    paint, belly, n, livery, style = MAKES[make]
    x0, x1 = -L / 2, L / 2
    secs = []
    if tail:
        secs += [dict(x=x0, w=W * 0.62, ht=H * 0.6, hb=H * 0.55, n=n), dict(x=x0 + L * 0.06, w=W * 0.92, ht=H * 0.92,
                                                                          hb=H * 0.85, n=n)]
    else:
        secs += [dict(x=x0, w=W * 0.97, ht=H * 0.97, hb=H * 0.9, n=n)]
    secs += [dict(x=x0 + L * 0.25, w=W, ht=H, hb=H * 0.9, n=n), dict(x=x0 + L * 0.66, w=W, ht=H, hb=H * 0.9, n=n)]
    if nose:
        if style == 'point':
            secs += [dict(x=x0 + L * 0.86, w=W * 0.6, ht=H * 0.7, hb=H * 0.6, n=max(n - 0.4, 1.6)),
                     dict(x=x1, w=W * 0.08, ht=H * 0.12, hb=H * 0.1, n=2.0)]
        elif style == 'round':
            secs += [dict(x=x0 + L * 0.86, w=W * 0.8, ht=H * 0.82, hb=H * 0.75, n=n),
                     dict(x=x0 + L * 0.96, w=W * 0.45, ht=H * 0.48, hb=H * 0.42, n=n),
                     dict(x=x1, w=W * 0.12, ht=H * 0.14, hb=H * 0.12, n=2.0)]
        else:
            secs += [dict(x=x0 + L * 0.9, w=W * 0.94, ht=H * 0.9, hb=H * 0.84, n=n),
                     dict(x=x1, w=W * 0.7, ht=H * 0.66, hb=H * 0.6, n=n)]
    else:
        secs += [dict(x=x1, w=W * 0.97, ht=H * 0.97, hb=H * 0.9, n=n)]
    obj = F.loft(s, name, secs, material=paint, belly=belly, back_material='dark' if not tail else 'paint.graphite',
                 front_material='dark' if not nose else None, count=24, bevel=0.0)
    for k in range(bands):
        bx = x0 + L * (0.3 + 0.28 * k)
        F.band(s, name, (bx, 0, 0), (1, 0, 0), max(L * 0.035, 0.8), livery if k == 0 else 'paint.graphite',
               inset=0.05, depth=0.12)
    parts = [obj]
    if fin:
        # the prize's dorsal fin, still standing
        parts.append(F.box(s, name + 'Fin', (x0 + L * 0.3, 0, H * 0.9 + H * 0.45), (L * 0.2, 0.6, H * 1.0),
                           material='paint2', bevel=0.05, taper=0.45))
    if bridge:
        # its old bridge block, glass dark: nobody flies it any more
        bx = x0 + L * (0.72 if nose else 0.6)
        parts.append(F.box(s, name + 'Bridge', (bx, 0, H * 0.92 + 1.1), (L * 0.14, W * 1.1, 2.4),
                           material=paint, bevel=0.1, taper=0.85))
        parts.append(F.box(s, name + 'BridgeGlass', (bx + L * 0.07 + 0.05, 0, H * 0.92 + 1.4), (0.2, W * 0.9, 0.9),
                           material='glass', bevel=0.0))
    if drives and tail:
        for k in range(drives):
            dy = (k - (drives - 1) / 2) * W * 0.9
            parts.append(F.nozzle(s, f'{name}Drive{k}', (x0 - 0.1, dy, 0.0), min(W, H) * 0.42, min(W, H) * 0.5,
                                  material='gunmetal', glow='paint.graphite'))
    if straps:
        # crude weld straps where the hull was cut and fused to its neighbours
        for f in (-0.44, 0.44):
            parts.append(F.box(s, f'{name}Strap{f:+.1f}', (L * f, 0, (H - H * 0.9) / 2), (1.6, W * 2.12, H * 1.98),
                               material='paint.graphite', bevel=0.12))
    m = place(parts, pos, yaw, pitch, roll)
    if lights is not None and straps:
        for f in (-0.3, 0.0, 0.3):
            p = m @ Vector((L * f, 0, H * 0.99))
            lights.append(((p.x, p.y, p.z + 0.15), (0.7, 0.7, 0.4), yaw))
    if windows is not None:
        rows = max(int(L / 3.2), 2)
        for side in (1, -1):
            for i in range(rows):
                if (i + len(name)) % 4 == 3:
                    continue
                lx = x0 + L * 0.15 + (L * 0.6) * (i + 0.5) / rows
                p = m @ Vector((lx, side * (W * 0.99 + 0.05), H * 0.25))
                windows.append(((p.x, p.y, p.z), (1.1, 0.14, 0.7), yaw))
    if lights is not None and nose:
        p = m @ Vector((x1 - L * 0.12, 0, H * 0.75))
        lights.append(((p.x, p.y, p.z), (0.8, 0.8, 0.5), yaw))
    return obj, m


def turret(s, name, pos, yaw, sc=1.0):
    """Raider gun turret: rust drum, angular black house, twin barrels, a sodium sight."""
    x, y, z = pos
    lathe(s, name + 'Ring', (x, y), [(z, 2.6 * sc), (z + 1.4 * sc, 2.4 * sc, 'stripe'), (z + 1.8 * sc, 2.4 * sc)],
          'paint.graphite', segs=12)
    hs = F.box(s, name + 'House', (0, 0, 0), (4.4 * sc, 3.6 * sc, 2.0 * sc), material='paint2', bevel=0.08,
               taper=0.78)
    bars = []
    for dy in (-0.8, 0.8):
        bars.append(F.cylinder(s, f'{name}Barrel{dy:+.0f}', (1.6 * sc, dy * sc, 0.2 * sc), (7.2 * sc, dy * sc, 0.2 * sc),
                               0.34 * sc, material='gunmetal', segments=8, bevel=0.0))
    sight = F.box(s, name + 'Sight', (1.8 * sc, 0, 1.05 * sc), (0.6 * sc, 1.2 * sc, 0.3 * sc), material='glow_amber',
                  bevel=0.0)
    place([hs, sight] + bars, (x, y, z + 2.8 * sc), yaw)


# --- the fortress ------------------------------------------------------------------------------

# Curtain-wall nodes (bastion drums), CCW from the skull's port jaw. (x, y, drum radius, drum top z)
NODES = [
    (70.0, 30.0, 7.0, 20.0), (44.0, 60.0, 6.0, 17.0), (4.0, 70.0, 7.5, 22.0), (-38.0, 62.0, 6.0, 16.0),
    (-70.0, 34.0, 7.0, 21.0), (-80.0, -6.0, 6.5, 18.0), (-64.0, -44.0, 7.0, 20.0), (-24.0, -68.0, 6.0, 17.0),
    (18.0, -66.0, 7.5, 22.0), (50.0, -52.0, 6.0, 16.0), (72.0, -28.0, 7.0, 20.0),
]
WALLS = [  # (node a, node b, make lower, make upper or None, height scale)
    (0, 1, 'teal', 'ash', 1.0), (1, 2, 'helios', None, 1.1), (2, 3, 'work', 'navy', 1.0), (3, 4, 'navy', None, 1.2),
    (4, 5, 'ash', 'work', 1.0), (5, 6, 'teal', 'helios', 1.0), (6, 7, 'work', None, 1.2), (7, 8, 'navy', 'ash', 1.0),
    (8, 9, 'helios', 'teal', 0.9), (9, 10, 'ash', None, 1.2),
]
DECK_Z = -4.0


def build_deck(s):
    """Patchwork yard: the deck the wall stands on, welded from plates of every captured paint."""
    outline = [(n[0] * 0.97, n[1] * 0.97) for n in NODES] + [(92.0, 0.0)]
    outline = [outline[-1]] + outline[:-1]
    F.plate(s, 'Deck', outline, z0=DECK_Z - 5.0, thickness=5.0, material='paint2', top_material='dark.deck',
            chamfer=1.2, chamfer_bottom=3.0, bevel=0.2)
    patches = []
    fins = ['paint.graphite', 'paint', 'paint2', 'paint.graphite', 'paint', 'paint.navy', 'paint2', 'paint.graphite',
            'paint', 'paint.teal', 'paint2', 'paint.graphite']
    k = 0
    for gx in range(-62, 70, 13):
        for gy in range(-52, 56, 13):
            if (gx / 80.0) ** 2 + (gy / 64.0) ** 2 > 0.78:
                continue
            k += 1
            w = 7.0 + 5.0 * rnd(k)
            h = 6.0 + 5.0 * rnd(k + 3)
            patches.append((fins[k % len(fins)], (gx + 3.0 * rnd(k + 5), gy + 3.0 * rnd(k + 7), DECK_Z + 0.12),
                            (w, h, 0.3), 0.35 * (rnd(k + 9) - 0.5)))
    for fin in dict.fromkeys(p[0] for p in patches):
        cluster(s, f'Patch_{fin}', [(c, sz, r) for f, c, sz, r in patches if f == fin], fin)
    # weld seams: dark raised lines across the yard
    seams = []
    for gx in range(-60, 72, 26):
        seams.append(((gx, -50, DECK_Z + 0.2), (gx + 6, 52, DECK_Z + 0.2)))
    beams(s, 'DeckSeams', seams, 0.6, material='paint.graphite', h=0.4)


def build_walls(s, windows, lights):
    for i, (a, b, lower, upper, hs) in enumerate(WALLS):
        ax, ay, ar, _ = NODES[a]
        bx, by, br, _ = NODES[b]
        d = Vector((bx - ax, by - ay, 0))
        L = d.length + 2.0
        yaw = math.atan2(d.y, d.x)
        mid = ((ax + bx) / 2, (ay + by) / 2)
        W = 5.2 + 1.6 * rnd(i)
        H = (5.0 + 1.4 * rnd(i + 4)) * hs
        z = DECK_Z + H * 0.9
        hull(s, f'Wall{i}', lower, L, W, H, (mid[0], mid[1], z), yaw=yaw, nose=False, tail=False, windows=windows,
             lights=lights, bands=2, fin=(i % 3 == 1 and upper is None), straps=True)
        if upper:
            L2 = L * (0.55 + 0.25 * rnd(i + 2))
            off = (rnd(i + 6) - 0.5) * (L - L2) * 0.8
            c = Vector((mid[0], mid[1], 0)) + d.normalized() * off
            hull(s, f'WallTop{i}', upper, L2, W * 0.72, H * 0.72, (c.x, c.y, z + H * 0.95 + H * 0.5),
                 yaw=yaw + (math.pi if rnd(i + 8) > 0.5 else 0.0), pitch=math.radians(4 * (rnd(i + 1) - 0.5)),
                 nose=rnd(i + 3) > 0.4, tail=rnd(i + 3) > 0.4, windows=windows, lights=lights, bands=1,
                 bridge=True, drives=2 if rnd(i + 5) > 0.3 else 3)
            # weld saddles between the two courses
            for f in (-0.3, 0.3):
                p = c + d.normalized() * (L2 * f)
                F.box(s, f'Saddle{i}{f:+.1f}', (p.x, p.y, z + H * 0.95), (3.0, W * 1.2, 1.4), material='paint.graphite',
                      rot_z=yaw, bevel=0.05)


def build_bastions(s, lights):
    for i, (x, y, r, top) in enumerate(NODES):
        # a reactor drum stood on end: rust body, black collar, sodium slit ring
        lathe(s, f'Bastion{i}', (x, y), [
            (DECK_Z - 8.0, r * 0.7), (DECK_Z - 4.0, r, 'paint2'), (DECK_Z, r), (top - 5.0, r, 'paint.graphite'),
            (top - 3.6, r * 1.08, 'glow_amber'), (top - 3.0, r * 1.08, 'paint2'), (top - 1.4, r * 1.08), (top, r * 0.92),
        ], 'paint', segs=10, phase=0.3 * i, smooth=25.0)
        turret(s, f'Turret{i}', (x, y, top), math.atan2(y, x) + 0.4 * (rnd(i) - 0.5), sc=1.0 + 0.3 * rnd(i + 1))
        # spikes: welded blade fins round the drum (Ashline)
        blades = []
        for k in range(5):
            a = 2 * math.pi * (k + rnd(i + k)) / 5
            p = Vector((x + (r + 0.8) * math.cos(a), y + (r + 0.8) * math.sin(a), top - 1.0))
            blades.append((p, p + Vector((math.cos(a) * 3.2, math.sin(a) * 3.2, 3.6))))
        beams(s, f'Blades{i}', blades, 0.7, material='paint2', h=0.3)
        lights.append(((x + r * 0.9 * math.cos(1.1 * i), y + r * 0.9 * math.sin(1.1 * i), top + 0.4), (0.8, 0.8, 0.6),
                       0.0))


THRONE_K = 1.3                       # the throne is built at hull scale, then enlarged to dominate the yard
THRONE_PIVOT = Vector((-8.0, 0.0, DECK_Z))


def throne_pt(p):
    return THRONE_PIVOT + (Vector(p) - THRONE_PIVOT) * THRONE_K


def build_throne(s, windows, lights):
    """The Throne: a seat of two freighters, patrol-hull arm-rests, a high back of standing hulls,
    built at hull scale and then enlarged about its foot so it towers over the wall."""
    n_obj, n_win, n_lit = len(s.objects), len(windows), len(lights)
    build_throne_parts(s, windows, lights)
    m = Matrix.Translation(THRONE_PIVOT) @ Matrix.Scale(THRONE_K, 4) @ Matrix.Translation(-THRONE_PIVOT)
    for o in s.objects[n_obj:]:
        o.data.transform(m)
    for lst, n in ((windows, n_win), (lights, n_lit)):
        for i in range(n, len(lst)):
            c, sz, rz = lst[i]
            lst[i] = (tuple(throne_pt(c)), tuple(v * 1.15 for v in sz), rz)


def build_bridges(s):
    """Welded bridges from the throne out to the wall bastions."""
    for k, (ni, z, start) in enumerate(((2, 10.0, (-8.0, 12.0)), (7, 9.0, (-8.0, -12.0)), (4, 8.0, (-30.0, 24.5)))):
        nx, ny, nr, top = NODES[ni]
        p0 = throne_pt((start[0], start[1], DECK_Z + z))
        p1 = Vector((nx, ny, top - 6.0))
        p1 = p1 - (p1 - p0).normalized() * nr
        beams(s, f'Bridge{k}', [(p0, p1)], 3.4, material='paint', h=1.6)
        rails = []
        for sgn in (-1, 1):
            side = (p1 - p0).cross(Vector((0, 0, 1))).normalized() * sgn * 1.8
            rails.append((p0 + side + Vector((0, 0, 1.4)), p1 + side + Vector((0, 0, 1.4))))
        beams(s, f'BridgeRail{k}', rails, 0.3, material='paint.graphite')


def build_yard(s, windows, lights):
    """Barracks hulls lying in the yard, and the lamp-lit avenue from the skull's gate to the throne."""
    for k, (make, x, y, yaw, L) in enumerate((('helios', 36.0, 38.0, -0.45, 30.0), ('work', 36.0, -38.0, 0.5, 28.0),
                                              ('navy', -56.0, -18.0, 1.25, 26.0), ('teal', -8.0, 46.0, 0.08, 24.0))):
        hull(s, f'Barracks{k}', make, L, 4.4, 3.8, (x, y, DECK_Z + 3.4), yaw=yaw, nose=k % 2 == 0, tail=True,
             windows=windows, lights=lights, bands=2, bridge=True, drives=2)
    lamps, posts = [], []
    for i in range(9):
        x = 22.0 + i * 5.2
        for sgn in (1, -1):
            posts.append(((x, sgn * 7.0, DECK_Z), (x, sgn * 7.0, DECK_Z + 3.2)))
            lamps.append(((x, sgn * 7.0, DECK_Z + 3.5), (0.9, 0.9, 0.6), 0.0))
    beams(s, 'AvenuePosts', posts, 0.5, material='paint.graphite')
    lights += lamps
    F.plate(s, 'Avenue', [(66.0, -5.0), (66.0, 5.0), (20.0, 5.0), (20.0, -5.0)], z0=DECK_Z, thickness=0.3,
            material='paint.graphite', bevel=0.0)


def build_throne_parts(s, windows, lights):
    # seat: two big freighter hulls side by side along X (the seat faces +X)
    hull(s, 'SeatP', 'teal', 42.0, 7.5, 6.5, (-6.0, 8.2, DECK_Z + 6.0), nose=True, tail=False, windows=windows,
         lights=lights)
    hull(s, 'SeatS', 'work', 40.0, 7.5, 6.5, (-7.0, -8.2, DECK_Z + 6.0), nose=True, tail=False, windows=windows,
         lights=lights)
    F.plate(s, 'SeatPlate', [(12.0, -15.0), (12.0, 15.0), (-24.0, 15.0), (-24.0, -15.0)], z0=DECK_Z + 11.0,
            thickness=1.6, material='paint2', chamfer=0.4, bevel=0.1)
    F.panel(s, 'SeatPlate', (-6.0, 0.0), (26.0, 20.0), 'paint', inset=0.4, depth=-0.3)
    # arm-rests: patrol hulls on pylons, noses +X, raised above the seat
    for sgn, make in ((1, 'navy'), (-1, 'ash')):
        hull(s, f'Arm{sgn:+d}', make, 36.0, 4.6, 4.2, (-4.0, sgn * 19.0, DECK_Z + 18.0), pitch=math.radians(3), nose=True,
             tail=False, windows=windows, lights=lights)
        for x in (-16.0, 2.0):
            beams(s, f'ArmPylon{sgn:+d}{x:+.0f}', [((x, sgn * 19.0, DECK_Z), (x, sgn * 19.0, DECK_Z + 15.0))], 3.2,
                  material='paint.graphite', h=2.4)
    # the high back: five standing hulls of different makes, tallest in the middle, leaning back
    back = [('helios', 0.0, 58.0, 8.0), ('navy', 10.5, 46.0, 6.4), ('work', -10.5, 48.0, 6.4), ('ash', 19.0, 34.0, 5.0),
            ('teal', -19.0, 36.0, 5.0)]
    for k, (make, y, L, W) in enumerate(back):
        obj, m = hull(s, f'Back{k}', make, L, W, W * 0.8, (-27.0 - 0.1 * abs(y), y, DECK_Z + L / 2 - 1.0),
                      pitch=math.radians(90), roll=math.pi, nose=True, tail=False, bands=3)
        # sodium windows up the face of each standing hull (facing +X)
        rows = int(L / 4.0)
        for i in range(rows):
            if (i + k) % 3 == 2:
                continue
            p = m @ Vector((-L / 2 + L * 0.12 + L * 0.7 * (i + 0.5) / rows, 0, W * 0.8 * 0.98))
            for dy in (-W * 0.3, W * 0.3):
                windows.append(((p.x + 0.2, p.y + dy, p.z), (0.14, 1.0, 1.3), 0.0))
    # the headrest: a long Ashline hull laid across the top of the back
    hull(s, 'Headrest', 'ash', 54.0, 4.2, 4.0, (-26.0, 0.0, DECK_Z + 44.0), yaw=math.pi / 2, nose=True, tail=True,
         windows=windows, lights=lights, bands=2, drives=2)
    for y in (-14.0, 14.0):
        beams(s, f'HeadrestPost{y:+.0f}', [((-26.0, y, DECK_Z + 26.0), (-26.0, y, DECK_Z + 41.0))], 2.4,
              material='paint.graphite')
    # the back's weld frame: three horizontal girders binding the standing hulls
    for zz in (12.0, 26.0, 38.0):
        beams(s, f'BackTie{int(zz)}', [((-20.0, -23.0, zz), (-20.0, 23.0, zz))], 1.6, material='paint.graphite', h=2.4)
        stubs = [((-20.0, y, zz), (-27.0, y, zz)) for y in (-19.0, -10.5, 0.0, 10.5, 19.0)]
        beams(s, f'BackTieStub{int(zz)}', stubs, 1.2, material='paint.graphite')
    # a crown of blades on the tallest hull, and the throne's sodium eye
    blades = []
    for k in range(7):
        a = math.radians(-60 + 20 * k)
        base = Vector((-27.5, 3.0 * math.sin(a), DECK_Z + 57.0))
        blades.append((base, base + Vector((-1.5, 9.0 * math.sin(a), 8.0 * math.cos(a) + 2.0))))
    beams(s, 'ThroneCrown', blades, 1.0, material='paint2', h=0.5)
    F.beacon(s, 'ThroneBeacon', (-27.0, 0.0, DECK_Z + 60.0), 'glow_amber', size=2.2)


def ccw(poly):
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))
    return poly if area > 0 else list(reversed(poly))


def build_skull(s, lights):
    """The skull prow at +X: a plated cranium, and a face mask tilted up at the sky so the chase camera
    and the top view both meet its stare — sodium fire in dark eye hollows, a nasal pit, cheekbones, a
    jaw of captured nose cones. Two captured interceptor hulls sweep back from its temples as horns."""
    cx, cz = 74.0, DECK_Z + 12.0
    F.loft(s, 'Cranium', [
        dict(x=cx - 22.0, w=11.0, ht=10.0, hb=8.0, zc=cz, n=2.2),
        dict(x=cx - 14.0, w=16.5, ht=18.0, hb=10.0, zc=cz, n=2.1),
        dict(x=cx - 4.0, w=18.0, ht=21.0, hb=10.5, zc=cz, n=2.0),
        dict(x=cx + 4.0, w=17.0, ht=17.0, hb=10.5, zc=cz, n=2.1),
        dict(x=cx + 9.0, w=14.0, ht=9.0, hb=10.0, zc=cz, n=2.3),
    ], material='paint.bone', belly='paint2', back_material='paint2', front_material='paint2', count=28, bevel=0.0)
    # plating courses across the dome: the skull grows a course after every raid
    for k, x in enumerate((cx - 18.0, cx - 13.0, cx - 8.5, cx - 4.0, cx + 0.5)):
        F.band(s, 'Cranium', (x, 0, 0), (1, 0, 0), 0.8 + 0.3 * (k % 2), 'paint.graphite' if k % 2 else 'paint',
               inset=0.1, depth=0.35)
    F.band(s, 'Cranium', (0, 0, 0), (0, 1, 0), 1.6, 'paint2', facing=(0, 0, 1), inset=0.1, depth=0.4)
    for sgn in (1, -1):
        F.band(s, 'Cranium', (0, sgn * 11.0, 0), (0, 1, 0), 1.0, 'paint.graphite', inset=0.08, depth=0.3)
    # the face mask: built flat (u from jaw to brow along +X, v across), then tilted up 45 degrees
    parts = []
    face = [(0, -8), (6, -12.5), (13, -15.5), (22, -15.5), (27, -12), (27, 12), (22, 15.5), (13, 15.5), (6, 12.5),
            (0, 8)]
    parts.append(F.plate(s, 'Face', ccw(face), z0=0.0, thickness=3.2, material='paint.bone', chamfer=0.6, bevel=0.1))
    # brow ridge: a heavy black plate over both eyes, notched in the middle
    for sgn in (1, -1):
        brow = [(21.5, sgn * 1.2), (24.5, sgn * 1.8), (26.2, sgn * 14.5), (22.0, sgn * 14.8), (19.5, sgn * 12.0)]
        parts.append(F.plate(s, f'Brow{sgn:+d}', ccw(brow), z0=2.8, thickness=2.6, material='paint2', chamfer=0.5,
                             bevel=0.08))
        # eye hollow: a dark angular socket, sodium fire at its heart
        eye = [(12.5, sgn * 3.0), (14.5, sgn * 2.2), (20.5, sgn * 3.4), (21.0, sgn * 11.5), (17.5, sgn * 12.4),
               (13.5, sgn * 9.5)]
        parts.append(F.plate(s, f'Socket{sgn:+d}', ccw(eye), z0=2.9, thickness=0.5, material='dark', bevel=0.0))
        core = [(15.2, sgn * 5.0), (18.6, sgn * 5.2), (19.0, sgn * 9.2), (16.2, sgn * 9.6)]
        parts.append(F.plate(s, f'Eye{sgn:+d}', ccw(core), z0=3.25, thickness=0.2, material='glow_amber', bevel=0.0))
        spark = [(16.4, sgn * 6.4), (17.8, sgn * 6.5), (17.9, sgn * 8.0), (16.6, sgn * 8.2)]
        parts.append(F.plate(s, f'EyeCore{sgn:+d}', ccw(spark), z0=3.4, thickness=0.15, material='glow_warm',
                             bevel=0.0))
        # cheekbone plates
        cheek = [(5.0, sgn * 9.0), (9.5, sgn * 8.0), (12.0, sgn * 14.0), (7.0, sgn * 13.5)]
        parts.append(F.plate(s, f'Cheek{sgn:+d}', ccw(cheek), z0=2.9, thickness=1.6, material='paint2', chamfer=0.4,
                             bevel=0.06))
    nasal = [(8.0, 0.0), (12.8, -2.8), (13.6, 0.0), (12.8, 2.8)]
    parts.append(F.plate(s, 'Nasal', ccw(nasal), z0=2.9, thickness=0.5, material='dark', bevel=0.0))
    # the mouth: a dark gap along the jaw edge, teeth of captured nose cones in every paint
    parts.append(F.plate(s, 'Mouth', ccw([(0.4, -9.0), (4.0, -10.5), (4.0, 10.5), (0.4, 9.0)]), z0=2.9, thickness=0.4,
                         material='dark', bevel=0.0))
    paints = ['paint.helios', 'paint.navy', 'paint.work', 'paint.bone', 'paint.teal', 'paint.helios', 'paint.work',
              'paint.navy', 'paint.bone']
    for k in range(9):
        v = -9.6 + 2.4 * k
        u = 2.2 + 0.012 * v * v
        ln = 5.0 + 2.0 * rnd(k)
        parts.append(F.cylinder(s, f'Tooth{k}', (u, v, 3.1), (u - ln * 0.8, v * 1.02, 3.1 - ln * 0.35), 1.0, 0.1,
                                material=paints[k], segments=8, bevel=0.0))
    jaw_pos = (cx + 23.0, 0.0, cz - 7.0)
    place(parts, jaw_pos, yaw=math.pi, pitch=math.radians(45))
    # under-jaw: a black block joining the mask to the deck, and the cranium's neck plates
    F.box(s, 'Jaw', (cx + 14.0, 0.0, cz - 9.2), (20.0, 26.0, 5.0), material='paint2', bevel=0.2, taper=0.85)
    # horns: two captured interceptor hulls swept back and up from the temples
    for sgn, make in ((1, 'ash'), (-1, 'navy')):
        hull(s, f'Horn{sgn:+d}', make, 32.0, 2.6, 2.4, (cx - 14.0, sgn * 22.0, cz + 18.0),
             yaw=math.pi + sgn * math.radians(-30), pitch=math.radians(24), nose=True, tail=False, bands=2)
        F.box(s, f'HornRoot{sgn:+d}', (cx - 2.0, sgn * 14.0, cz + 12.0), (8.0, 5.0, 5.0), material='paint2',
              rot_z=sgn * math.radians(-20), bevel=0.2)
    for sgn in (1, -1):
        F.box(s, f'Neck{sgn:+d}', (cx - 10.0, sgn * 18.0, DECK_Z + 4.0), (12.0, 8.0, 9.0), material='paint.graphite',
              rot_z=sgn * math.radians(25), bevel=0.2)
    lights.append(((cx + 23.5, 0.0, cz - 7.5), (0.9, 0.9, 0.6), 0.0))


def build_spars(s, lights):
    """Two docking spars with moored raider darts: -X (aft) and +Y."""
    for k, (root, tip, yaw) in enumerate((((-84.0, -6.0), (-116.0, -6.0), math.pi), ((4.0, 76.0), (4.0, 106.0), math.pi / 2))):
        p0 = Vector((root[0], root[1], DECK_Z + 4.0))
        p1 = Vector((tip[0], tip[1], DECK_Z + 4.0))
        c, w = truss_segs(p0, p1, 3.0, 3.0, 8)
        beams(s, f'SparChord{k}', c, 0.55, material='paint.graphite')
        beams(s, f'SparWeb{k}', w, 0.3, material='paint')
        F.beacon(s, f'SparBeacon{k}', (p1.x, p1.y, p1.z + 1.6), 'glow_amber', size=1.2)
        d = (p1 - p0).normalized()
        side = d.cross(Vector((0, 0, 1))).normalized()
        for j, (f, sgn) in enumerate(((0.45, 1), (0.8, -1))):
            q = p0 + (p1 - p0) * f + side * sgn * 8.0
            dart(s, f'Dart{k}{j}', (q.x, q.y, q.z), math.atan2(d.y, d.x))
            arm0 = p0 + (p1 - p0) * f + side * sgn * 1.5
            beams(s, f'DartClamp{k}{j}', [(arm0, q - side * sgn * 2.8)], 1.0, material='paint.graphite')


def dart(s, name, pos, yaw):
    """A moored raider dart: angular rust arrowhead, black blades, sodium drive."""
    body = F.loft(s, name, [
        dict(x=-7.0, w=1.6, ht=1.1, hb=0.9, n=1.7), dict(x=-5.0, w=2.2, ht=1.4, hb=1.1, n=1.7),
        dict(x=2.0, w=1.6, ht=1.2, hb=0.9, n=1.7), dict(x=7.5, w=0.2, ht=0.25, hb=0.2, n=1.6),
    ], material='paint', belly='paint2', back_material='dark', count=16, bevel=0.0)
    wing = F.plate(s, name + 'Wing', [(-6.5, 0.0), (1.5, 0.0), (-2.0, 5.4), (-6.8, 5.8)], z0=-0.2, thickness=0.4,
                   material='paint2', mirror=True, bevel=0.03)
    wing_m = s.objects[-1]
    stripe = F.box(s, name + 'Stripe', (-1.0, 0.0, 1.25), (5.0, 0.6, 0.15), material='stripe', bevel=0.0)
    drive = F.nozzle(s, name + 'Drive', (-7.3, 0.0, 0.0), 0.8, 0.8, material='gunmetal', glow='glow_amber')
    place([body, wing, wing_m, stripe, drive], pos, yaw)


def build_details(s, windows, lights):
    # trophy racks on the inner faces of three walls: frames holding captured parts in their paints
    for k, wi in enumerate((1, 4, 8)):
        a, b = WALLS[wi][0], WALLS[wi][1]
        ax, ay, _, _ = NODES[a]
        bx, by, _, _ = NODES[b]
        d = Vector((bx - ax, by - ay, 0))
        mid = Vector(((ax + bx) / 2, (ay + by) / 2, 0))
        inward = Vector((0, 0, 1)).cross(d).normalized()
        if inward.dot(-mid) < 0:
            inward = -inward
        base = mid + inward * 7.5
        yaw = math.atan2(d.y, d.x)
        frame = []
        for f in (-0.35, -0.12, 0.12, 0.35):
            p = base + d.normalized() * d.length * f
            frame.append(((p.x, p.y, DECK_Z), (p.x, p.y, DECK_Z + 14.0)))
        p0 = base - d.normalized() * d.length * 0.38
        p1 = base + d.normalized() * d.length * 0.38
        for zz in (6.0, 12.5):
            frame.append(((p0.x, p0.y, DECK_Z + zz), (p1.x, p1.y, DECK_Z + zz)))
        beams(s, f'Rack{k}', frame, 0.6, material='paint.graphite')
        paints = ['paint.helios', 'paint.work', 'paint.teal', 'paint.navy', 'paint.bone']
        for j in range(6):
            f = -0.3 + 0.12 * j
            p = base + d.normalized() * d.length * f
            fin = paints[(j + k) % len(paints)]
            if j % 3 == 0:
                F.nozzle(s, f'TrophyNoz{k}{j}', (p.x, p.y, DECK_Z + 9.3), 1.3, 1.6, material=fin, glow='paint.graphite')
            elif j % 3 == 1:
                F.box(s, f'TrophyFin{k}{j}', (p.x, p.y, DECK_Z + 9.3), (0.4, 4.0, 3.0), material=fin, rot_z=yaw,
                      bevel=0.1, taper=0.6)
            else:
                F.box(s, f'TrophyPlate{k}{j}', (p.x, p.y, DECK_Z + 9.3), (0.5, 3.4, 4.6), material=fin, rot_z=yaw,
                      bevel=0.1)
            lights.append(((p.x, p.y, DECK_Z + 13.3), (0.5, 0.5, 0.4), yaw))
    # floodlights on the bastions aimed into the yard
    for i, (x, y, r, top) in enumerate(NODES):
        if i % 2:
            continue
        aim = Vector((-x, -y, 60.0)).normalized()
        F.work_lamp(s, f'Flood{i}', (x * 0.9, y * 0.9, top - 2.0), aim=tuple(aim), size=1.4, lens='glow_amber')
    # exposed machinery in the yard: generator drums, pipe runs
    for k, (x, y) in enumerate(((10.0, 40.0), (12.0, -44.0), (-50.0, 20.0), (-40.0, -40.0))):
        F.cylinder(s, f'Gen{k}', (x - 5.0, y, DECK_Z + 2.4), (x + 5.0, y, DECK_Z + 2.4), 2.4, material='gunmetal',
                   segments=14, cap_material='paint2', bevel=0.0)
        F.box(s, f'GenSkid{k}', (x, y, DECK_Z + 0.4), (11.0, 5.2, 0.8), material='paint2', bevel=0.05)
        lights.append(((x + 5.2, y, DECK_Z + 2.4), (0.3, 0.9, 0.9), 0.0))
    pipes = [((10.0, 40.0, DECK_Z + 1.2), (0.0, 16.0, DECK_Z + 1.2)), ((12.0, -44.0, DECK_Z + 1.2), (0.0, -16.0, DECK_Z + 1.2)),
             ((-50.0, 20.0, DECK_Z + 1.2), (-24.0, 12.0, DECK_Z + 1.2)), ((-40.0, -40.0, DECK_Z + 1.2), (-24.0, -14.0, DECK_Z + 1.2))]
    beams(s, 'YardPipes', pipes, 1.0, material='gunmetal')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 6.0))
    s.socket('SOCKET_Camera_Focus', (4.0, 0.0, 22.0))
    windows, lights = [], []
    build_deck(s)
    build_walls(s, windows, lights)
    build_bastions(s, lights)
    build_throne(s, windows, lights)
    build_bridges(s)
    build_yard(s, windows, lights)
    build_skull(s, lights)
    build_spars(s, lights)
    s.detail = 1
    build_details(s, windows, lights)
    cluster(s, 'SodiumWin', windows, 'glow_amber')
    cluster(s, 'SodiumLights', lights, 'glow_amber')
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
