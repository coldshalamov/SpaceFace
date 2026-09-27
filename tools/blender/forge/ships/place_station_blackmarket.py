"""Black-Market Warren — contraband station in a hollowed asteroid cluster. Forge rebuild.

"Shanty town on quarried rocks." Seven faceted dark rocks hang in a stack astride the flight plane,
each quarried flat on top into a terrace where mismatched shanty modules, stacked containers and neon
signs crowd together. The big central rock is hollowed: an octagonal steel mouth on its +X face opens
on the flight plane, fed by two dock clamp arms reaching out to SOCKET_Dock_Approach. Pressurised
tubes and trusses join every rock to its neighbour, and sagging power cables are strung between them,
so nothing floats. Grime is designed, not noise: patched plates, mismatched paint, lit windows, neon.
"""
import math
import os
import random
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_blackmarket'
COLORS = {
    'paint': '#2b2723',        # rock: dark umber stone
    'paint2': '#1a1816',       # rock shadow facets / charcoal steel
    'stripe': '#1d4643',       # faded teal shanty paint
    'hazard': '#7a5a16',
    'dark': '#121315',
    'paint.rust': '#4a2818',   # rust-red shanty modules
    'paint.olive': '#34351f',  # olive drab modules
    'paint.ivory': '#6b6558',  # stolen Helios panels (patches)
}

# rocks: name, centre (x, y, z), radius, y squash, flat-top height (terrace), seed
ROCKS = [
    ('Core', (0.0, 0.0, 0.0), 22.0, 0.72, 15.0, 1),
    ('Crown', (-15.0, 0.0, 33.0), 14.0, 0.85, 42.0, 2),
    ('Stern', (-47.0, 0.0, 3.0), 15.5, 0.8, 13.0, 3),
    ('Keel', (-6.0, 0.0, -48.0), 19.0, 0.75, -34.0, 4),
    ('Beak', (25.0, 0.0, 26.0), 9.5, 0.9, 32.0, 5),
    ('SternLow', (-48.0, 0.0, -30.0), 11.0, 0.85, -22.0, 6),
    ('Chin', (22.0, 0.0, -30.0), 10.0, 0.9, -23.0, 7),
]
SHANTY = ['paint.rust', 'stripe', 'paint.olive', 'paint2', 'paint.ivory']


def boxes(s, name, items, material, bevel=0.0):
    """Local helper: many boxes in one part. items: (center, size[, rot_z])."""
    bm = bmesh.new()
    for it in items:
        c, sz = it[0], it[1]
        rz = it[2] if len(it) > 2 else 0.0
        m = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((sz[0], sz[1], sz[2], 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def beams(s, name, segs, r, material='gunmetal', sides=6):
    """Local helper: many thin members (braces, cables) in one part."""
    bm = bmesh.new()
    for a, b in segs:
        a, b = Vector(a), Vector(b)
        ax = b - a
        if ax.length < 1e-4:
            continue
        rot = Vector((0, 0, 1)).rotation_difference(ax.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation(a) @ rot
        v0 = [bm.verts.new(m @ Vector((r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides), 0)))
              for i in range(sides)]
        v1 = [bm.verts.new(m @ Vector((r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides),
                                       ax.length))) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((v0[i], v0[j], v1[j], v1[i]))
        bm.faces.new(list(reversed(v0)))
        bm.faces.new(v1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=50.0))


def rock_radius(d, seed):
    """Low-frequency lobes: a designed lump, not noise. d = unit direction."""
    k = seed * 1.7
    return 1.0 + 0.13 * math.sin(2.1 * d.x + k) * math.cos(1.7 * d.z - k) + 0.09 * math.sin(3.3 * d.y + 2.0 * d.z + k) \
        + 0.06 * math.cos(4.1 * d.x - 3.0 * d.z + 0.5 * k)


def rock(s, name, c, r, sq, flat, seed):
    """Faceted asteroid: icosphere, lobed, squashed in y, quarried flat at `flat` (a terrace plane:
    a top terrace when above the centre, an underside quarry when below)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    cx, cy, cz = c
    top = flat > cz
    for v in bm.verts:
        d = v.co.normalized()
        rr = r * rock_radius(d, seed)
        p = Vector((cx + d.x * rr, cy + d.y * rr * sq, cz + d.z * rr))
        if top and p.z > flat:
            p.z = flat
        if not top and p.z < flat:
            p.z = flat
        v.co = p
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.05)
    bm.normal_update()
    # quarried terrace faces are cut stone (lighter) with a dark shadow ring; facets alternate tone
    mats = ['paint', 'paint2']
    for i, f in enumerate(bm.faces):
        n = f.normal
        f.material_index = 1 if (n.z < -0.35 or (i * 7 + seed) % 5 == 0) else 0
    obj = s.add(F._new_object(name, bm, s.slots(mats), bevel=0.0, smooth_angle=12.0))
    return obj


def terrace_extent(c, r, sq, flat, seed):
    """Approximate half-extents (x, y) of the flat terrace cut."""
    dz = abs(flat - c[2]) / (r * 0.98)
    k = math.sqrt(max(0.0, 1 - dz * dz))
    return r * k * 0.82, r * k * 0.82 * sq


def shanty(s, rng, tag, c, r, sq, flat, top=True, density=1.0):
    """Mismatched modules crowded onto a terrace: stacks of boxes, windows, roof neon, containers."""
    ex, ey = terrace_extent(c, r, sq, flat, 0)
    sgn = 1 if top else -1
    mods = {k: [] for k in SHANTY}
    win, neon_r, neon_a, neon_c, conts = [], [], [], [], []
    x = c[0] - ex + 2.0
    placed = 0
    while x < c[0] + ex - 2.0:
        w = rng.uniform(3.0, 6.0)
        y = -ey + 2.0
        while y < ey - 2.0:
            d = rng.uniform(3.0, 5.5)
            cx, cy = x + w / 2, y + d / 2
            # stay inside an ellipse of the terrace
            if ((cx - c[0]) / ex) ** 2 + (cy / ey) ** 2 < 0.8 and rng.random() < 0.85 * density:
                floors = rng.choice((1, 1, 2, 2, 3))
                z = flat
                yaw = rng.uniform(-0.12, 0.12)

                def R(px, py, pz, cx=cx, cy=cy, yaw=yaw):
                    dx, dy = px - cx, py - cy
                    return (cx + dx * math.cos(yaw) - dy * math.sin(yaw), cy + dx * math.sin(yaw) + dy * math.cos(yaw), pz)
                for fl in range(floors):
                    h = rng.uniform(2.2, 3.2)
                    fin = SHANTY[(placed + fl * 2) % len(SHANTY)]
                    sw, sd = w * rng.uniform(0.75, 0.95), d * rng.uniform(0.75, 0.95)
                    # modules sink 1.2 m into the rock at the base so they sit, never float
                    base = z - (1.2 if fl == 0 else 0.0) * sgn
                    zc = base + sgn * (h + (1.2 if fl == 0 else 0.0)) / 2
                    hh = h + (1.2 if fl == 0 else 0.0)
                    mods[fin].append(((cx, cy, zc), (sw, sd, hh), yaw))
                    # windows on the two long faces and the ends
                    zw = z + sgn * h * 0.55
                    for k in range(max(1, int(sw / 1.4))):
                        xx = cx - sw / 2 + (k + 0.5) * sw / max(1, int(sw / 1.4))
                        if rng.random() < 0.7:
                            for sy_ in (1, -1):
                                win.append((R(xx, cy + sy_ * (sd / 2 + 0.02), zw), (0.7, 0.14, 0.5), yaw))
                    if rng.random() < 0.5:
                        win.append((R(cx + sw / 2 + 0.02, cy, zw), (0.14, 0.8, 0.5), yaw))
                    z = z + sgn * h
                    w, d = sw, sd
                # roof: neon strip, or a vent, or a small container
                roll = rng.random()
                zr = z + sgn * 0.1
                if roll < 0.18:
                    neon_r.append((R(cx, cy + d / 2 - 0.2, zr), (w * 0.8, 0.22, 0.2), yaw))
                elif roll < 0.32:
                    neon_a.append((R(cx + w / 2 - 0.2, cy, zr), (0.22, d * 0.8, 0.2), yaw))
                elif roll < 0.42:
                    neon_c.append(((cx, cy, zr), (w * 0.5, 0.22, 0.2), yaw + 0.8))
                elif roll < 0.7:
                    conts.append((cx, cy, z + sgn * 0.8, yaw))
                placed += 1
            y += d + rng.uniform(0.3, 1.2)
        x += w + rng.uniform(0.3, 1.2)
    for fin, items in mods.items():
        if items:
            boxes(s, f'{tag}_Mod_{fin}', items, fin, bevel=0.08)
    boxes(s, f'{tag}_Win', win, 'glow_warm')
    if neon_r:
        boxes(s, f'{tag}_NeonR', neon_r, 'glow_red')
    if neon_a:
        boxes(s, f'{tag}_NeonA', neon_a, 'glow_amber')
    if neon_c:
        boxes(s, f'{tag}_NeonC', neon_c, 'glow_cyan')
    for k, (cx, cy, cz, yaw) in enumerate(conts[:10]):
        fin = SHANTY[(k + 1) % 4]
        F.box(s, f'{tag}_Crate{k}', (cx, cy, cz), (3.0, 1.3, 1.3), material=fin, rot_z=yaw, bevel=0.04)
        F.box(s, f'{tag}_CrateRib{k}', (cx, cy, cz), (0.12, 1.4, 1.4), material='gunmetal', rot_z=yaw, bevel=0.0)


def tube(s, name, a, b, r=1.6, lit=True):
    """Pressurised connector tube between rocks with collar rings and a lit window strip."""
    a, b = Vector(a), Vector(b)
    F.cylinder(s, name, tuple(a), tuple(b), r, material='paint.ivory', segments=16, cap=False)
    ax = b - a
    L = ax.length
    t = ax.normalized()
    for k in range(1, int(L / 6.0)):
        p = a + ax * (k / int(L / 6.0))
        F.cylinder(s, f'{name}_Collar{k}', tuple(p - t * 0.35), tuple(p + t * 0.35), r + 0.3, material='paint2',
                   segments=16)
    up = Vector((0, 0, 1)) if abs(t.z) < 0.8 else Vector((0, 1, 0))
    side = t.cross(up).normalized()
    top = side.cross(t).normalized()
    wins = []
    if lit:
        n = int(L / 2.2)
        for k in range(n):
            p = a + ax * ((k + 0.5) / n) + top * (r - 0.05)
            wins.append((tuple(p), (0.4, 0.4, 0.4)))
    return wins


def sign(s, name, pos, w, h, finish, yaw=0.0, glyph=True):
    """Neon billboard on a post: dark frame, lit border bars and abstract glyph bars (no text)."""
    x, y, z = pos
    c, sn = math.cos(yaw), math.sin(yaw)
    F.cylinder(s, name + '_Post', (x, y, z - 3.5), (x, y, z - h / 2), 0.2, material='gunmetal', segments=8)
    F.box(s, name + '_Board', (x, y, z), (w, 0.35, h), material='dark', rot_z=yaw, bevel=0.03)
    bars = [((x + (w / 2 - 0.1) * c * e, y + (w / 2 - 0.1) * sn * e, z), (0.18, 0.45, h - 0.2), yaw) for e in (-1, 1)]
    bars += [((x, y, z + e * (h / 2 - 0.1)), (w - 0.2, 0.45, 0.18), yaw) for e in (-1, 1)]
    boxes(s, name + '_Frame', bars, finish)
    if glyph:
        g = []
        n = max(2, int(w / 1.1))
        for k in range(n):
            dx = -w / 2 + 0.6 + (w - 1.2) * (k + 0.5) / n
            hh = h * (0.35 if k % 3 == 1 else 0.6)
            g.append(((x + dx * c, y + dx * sn, z - (h * 0.6 - hh) / 2 + 0.05), (0.2, 0.45, hh), yaw))
        boxes(s, name + '_Glyph', g, 'glow_warm' if finish != 'glow_warm' else 'glow_amber')


def sag(a, b, drop, n=10):
    a, b = Vector(a), Vector(b)
    pts = []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        p.z -= drop * 4 * t * (1 - t)
        pts.append(tuple(p))
    return list(zip(pts, pts[1:]))


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    rng = random.Random(1987)
    for name, c, r, sq, flat, seed in ROCKS:
        rock(s, name, c, r, sq, flat, seed)
    for name, c, r, sq, flat, seed in ROCKS:
        shanty(s, rng, name, c, r, sq, flat, top=flat > c[2], density=1.0 if flat > c[2] else 0.6)

    # --- hollowed core: octagonal steel mouth on the +X face at the flight plane ------------------
    F.cylinder(s, 'MouthCavity', (14.0, 0, 0), (21.5, 0, 0), 8.2, material='dark', segments=8,
               cap_material='dark')
    F.ring(s, 'MouthFrame', (21.8, 0, 0), 8.6, 1.3, axis=(1, 0, 0), material='gunmetal', segments=8, sides=6)
    F.ring(s, 'MouthHazard', (22.8, 0, 0), 8.6, 0.5, axis=(1, 0, 0), material='hazard', segments=8, sides=6)
    boxes(s, 'MouthLights', [((22.9, 8.6 * math.cos(a), 8.6 * math.sin(a)), (0.3, 0.9, 0.9))
                             for a in [math.pi / 8 + k * math.pi / 4 for k in range(8)]], 'glow_amber')
    boxes(s, 'MouthInterior', [((18.0, y, z), (0.2, 1.6, 0.8)) for y in (-4.0, 0.0, 4.0) for z in (-3.0, 3.0)],
          'glow_warm')
    # dock clamp arms: two gantries reaching to the dock approach, jaws in hazard paint
    for sy in (1, -1):
        F.box(s, f'ClampArm{sy}', (31.0, sy * 6.0, -4.5), (20.0, 1.8, 2.2), material='paint2', bevel=0.12)
        F.box(s, f'ClampRail{sy}', (31.0, sy * 6.0, -3.2), (19.0, 0.6, 0.4), material='gunmetal', bevel=0.0)
        F.box(s, f'ClampJaw{sy}', (41.2, sy * 5.0, -4.5), (2.6, 3.6, 3.2), material='hazard', bevel=0.1,
              rot_z=-sy * 0.3)
        F.box(s, f'ClampRoot{sy}', (21.8, sy * 6.0, -6.0), (3.4, 3.4, 5.0), material='gunmetal', bevel=0.12)
        boxes(s, f'ClampLights{sy}', [((24.0 + k * 3.2, sy * 6.95, -4.2), (0.4, 0.2, 0.4)) for k in range(6)],
              'glow_green' if sy < 0 else 'glow_red')
        F.light(s, f'JawLamp{sy}', (42.6, sy * 5.8, -2.8), 'glow_amber', size=0.6)
    for k in range(5):
        x = 24.0 + k * 3.8
        F.box(s, f'ClampTie{k}', (x, 0.0, -5.2), (0.5, 12.0, 0.5), material='gunmetal', bevel=0.0)

    # --- connections: tubes, braces, cables between every rock --------------------------------------
    win = []
    win += tube(s, 'TubeCoreCrown', (-7.0, 0, 16.0), (-12.0, 0, 21.5))
    win += tube(s, 'TubeCoreStern', (-19.0, 2.0, 4.0), (-33.0, 2.0, 4.0))
    win += tube(s, 'TubeCoreKeel', (-2.0, -1.0, -18.0), (-4.0, -1.0, -32.0), r=2.2)
    win += tube(s, 'TubeCoreBeak', (14.0, 1.0, 13.0), (19.5, 1.0, 20.0))
    win += tube(s, 'TubeSternLow', (-47.5, 0, -11.0), (-48.0, 0, -20.0))
    win += tube(s, 'TubeCoreChin', (13.0, -1.0, -14.0), (18.0, -1.0, -22.0))
    win += tube(s, 'TubeKeelLow', (-26.0, 0.0, -42.0), (-38.0, 0.0, -34.0), r=1.4)
    win += tube(s, 'TubeCrownStern', (-26.0, -3.0, 32.0), (-40.0, -3.0, 16.0), r=1.3)
    boxes(s, 'TubeWindows', win, 'glow_warm')
    braces = []
    braces += [((-3.0, 8.0, 12.0), (-10.0, 7.0, 24.0)), ((-3.0, -8.0, 12.0), (-10.0, -7.0, 24.0))]
    braces += [((-18.0, 8.0, -6.0), (-36.0, 7.0, -6.0)), ((-18.0, -8.0, 10.0), (-36.0, -7.0, 12.0))]
    braces += [((8.0, 7.0, -18.0), (4.0, 7.0, -33.0)), ((-10.0, -7.0, -18.0), (-12.0, -7.0, -32.0))]
    braces += [((16.0, -4.0, 11.0), (21.0, -4.0, 20.0)), ((14.0, 5.0, -12.0), (19.0, 5.0, -24.0))]
    braces += [((-40.0, 5.0, -10.0), (-44.0, 5.0, -21.0))]
    beams(s, 'Braces', braces, 0.55, material='paint2', sides=6)
    cables = []
    for a, b, drop in (((-10.0, 9.0, 40.0), (-44.0, 9.0, 14.0), 4.0), ((-5.0, -9.0, 40.0), (20.0, -6.0, 30.0), 3.0),
                       ((10.0, 12.0, 14.0), (26.0, 6.0, 30.0), 2.5), ((-40.0, -10.0, 12.0), (-10.0, -12.0, 14.0), 5.0),
                       ((15.0, 11.0, -12.0), (24.0, 8.0, -24.0), 2.0), ((-44.0, -9.0, -24.0), (-18.0, -10.0, -40.0), 4.0)):
        cables += sag(a, b, drop)
    beams(s, 'Cables', cables, 0.12, material='dark', sides=5)
    # cable anchor posts where cables meet rock
    for p in ((-10.0, 9.0, 40.0), (-44.0, 9.0, 14.0), (-5.0, -9.0, 40.0), (20.0, -6.0, 30.0), (26.0, 6.0, 30.0),
              (10.0, 12.0, 14.0), (-40.0, -10.0, 12.0), (-10.0, -12.0, 14.0)):
        F.box(s, f'Anchor{p}', (p[0], p[1], p[2] + 0.2), (0.8, 0.8, 1.6), material='gunmetal', bevel=0.04)

    # --- neon signs: the warren's advertising, facing the flight lanes ----------------------------
    sign(s, 'SignBeak', (25.0, 0.0, 37.5), 8.0, 3.0, 'glow_red', yaw=0.0)
    sign(s, 'SignCrown', (-15.0, 3.5, 48.0), 7.0, 2.6, 'glow_cyan', yaw=0.2)
    sign(s, 'SignStern', (-47.0, -3.0, 19.0), 6.0, 2.4, 'glow_amber', yaw=-0.25)
    sign(s, 'SignCore', (6.0, -6.0, 21.0), 5.0, 2.0, 'glow_cyan', yaw=math.pi / 2 - 0.3)

    # --- patched plates on the rock faces: stolen ivory hull panels bolted over breaches ----------
    patches = []
    for (x, y, z, rz) in ((10.0, 15.0, 2.0, 0.2), (-14.0, 14.5, -6.0, -0.3), (-40.0, 12.0, 0.0, 0.1),
                          (-6.0, 13.5, 30.0, 0.0), (8.0, -15.0, -4.0, 0.25), (-44.0, -12.0, -2.0, -0.2)):
        patches.append(((x, y, z), (5.0, 1.2, 3.4), rz))
    boxes(s, 'Patches', patches, 'paint.ivory', bevel=0.1)
    boxes(s, 'PatchBolts', [((p[0][0] + dx, p[0][1] * 1.04, p[0][2] + dz), (0.3, 0.4, 0.3), p[2])
                            for p in patches for dx in (-2.1, 2.1) for dz in (-1.4, 1.4)], 'gunmetal')

    # --- lights: nav, beacons, work lamps over the terraces ----------------------------------------
    F.light(s, 'NavPort', (-47.0, 12.5, 3.0), 'glow_red', size=0.7)
    F.light(s, 'NavStarboard', (-47.0, -12.5, 3.0), 'glow_green', size=0.7)
    F.beacon(s, 'Beacon', (-18.0, -4.0, 42.0), size=0.8)
    F.beacon(s, 'BeaconStern', (-52.0, 5.0, 13.0), finish='glow_red', size=0.6)
    s.detail = 1
    for p in ((2.0, 10.0, 15.0), (-20.0, -8.0, 42.0), (-40.0, 9.0, 13.0)):
        F.work_lamp(s, f'Lamp{p}', p, aim=(0.3, -0.3, 0.9), size=0.8)
    for p in ((-8.0, 6.0, 15.0), (-16.0, -6.0, 42.0), (28.0, 3.0, 32.0)):
        F.antenna(s, f'Whip{p}', p, 5.0)
    F.dish(s, 'StolenDish', (-50.0, -4.0, 14.5), 2.6, 0.9, axis=(0.3, -0.4, 0.86))
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
