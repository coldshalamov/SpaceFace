"""Leviathan — tier-5 player flagship. "Cathedral carrier with a hangar."

Plan read at the chase camera: a long, elegant black-blue hull with a broad flight deck on the bow
(recessed runway lined with landing lights running into a lit hangar maw), a stepped dorsal city of
ivory and black-blue tiers rising to a buttressed cathedral tower, broad swept wings carrying turret
rows and ivory wingtip nacelles, and six drives set in a crescent across the stern.
Three values: black-blue hull, ivory superstructure/leading edges, dark machinery; gold bands.
Scale is carried by density: hundreds of lit windows, landing lights, missile cells, PD mounts.
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'leviathan'
COLORS = {
    'paint': '#10161f',    # black-blue hull (brief #1c2430, deepened so the lit ivory city carries)
    'paint2': '#6a6557',   # ivory (brief #a8a08c, authored darker: the key light lifts ~2.5x)
    'stripe': '#7e622b',   # gold (brief #a8843a, same calibration)
    'hazard': '#7e622b',
    'dark': '#13161b',
    'glow_cyan.gold': '#ffd35a',  # gold, lit: the wing leading-edge lines
}

HULL = [
    dict(x=-28.0, w=6.0, ht=2.8, hb=2.4, zc=0.0, n=2.6),
    dict(x=-24.0, w=7.0, ht=3.3, hb=2.8, zc=0.0, n=2.6),
    dict(x=-5.0, w=7.2, ht=3.4, hb=2.9, zc=0.0, n=2.6),
    dict(x=10.0, w=6.3, ht=3.1, hb=2.7, zc=0.0, n=2.5),
    dict(x=20.0, w=4.9, ht=2.5, hb=2.2, zc=0.0, n=2.4),
    dict(x=27.0, w=2.7, ht=1.6, hb=1.4, zc=0.0, n=2.2),
    dict(x=30.2, w=0.7, ht=0.6, hb=0.5, zc=0.0, n=2.0),
]


def hull_at(x):
    for a, b in zip(HULL, HULL[1:]):
        if a['x'] <= x <= b['x']:
            t = (x - a['x']) / (b['x'] - a['x'])
            return {k: a[k] + (b[k] - a[k]) * t for k in ('w', 'ht', 'hb', 'zc', 'n')}
    return dict(HULL[0] if x < HULL[0]['x'] else HULL[-1])


def hull_y(x, z):
    h = hull_at(x)
    hh = h['ht'] if z >= h['zc'] else h['hb']
    r = min(abs(z - h['zc']) / hh, 0.999)
    return h['w'] * (1 - r ** h['n']) ** (1 / h['n'])


def yz_plate(s, name, outline, x0, thickness, material='paint', mirror=False, bevel=0.02):
    """Local helper: a slab whose outline is drawn in the YZ (cross-section) plane, extruded along X.
    The kit's plate() only extrudes plan outlines; buttress ribs need a side-profile slab."""
    def build(poly):
        bm = bmesh.new()
        a = [bm.verts.new((x0, y, z)) for (y, z) in poly]
        b = [bm.verts.new((x0 + thickness, y, z)) for (y, z) in poly]
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm
    obj = s.add(F._new_object(name, build(outline), s.slots([material]), bevel=bevel, smooth_angle=30.0))
    if mirror:
        s.add(F._new_object(name + '_M', build([(-y, z) for (y, z) in outline]), s.slots([material]), bevel=bevel,
                            smooth_angle=30.0))
    return obj


def turret(s, name, x, y, z, sc=1.0, barrels=2, yaw=0.0, housing='paint2'):
    """Local helper: a flagship turret — barbette + gold ring, faceted ivory house, mantlet, barrels."""
    c, sn = math.cos(yaw), math.sin(yaw)

    def P(dx, dy, dz=0.0):
        return (x + (dx * c - dy * sn) * sc, y + (dx * sn + dy * c) * sc, z + dz * sc)

    parts = []
    parts.append(F.cylinder(s, name + '_Barbette', (x, y, z - 0.5 * sc), (x, y, z + 0.3 * sc), 1.2 * sc,
                            material='gunmetal', segments=24, cap_material='dark', bevel=0.0))
    parts.append(F.cylinder(s, name + '_Ring', (x, y, z + 0.06 * sc), (x, y, z + 0.22 * sc), 1.3 * sc,
                            material='stripe', segments=24, bevel=0.0))
    house = [(1.35, 0.55), (0.8, 1.15), (-1.2, 1.15), (-1.5, 0.8), (-1.5, -0.8), (-1.2, -1.15), (0.8, -1.15),
             (1.35, -0.55)]
    parts.append(F.plate(s, name + '_House', [P(dx, dy)[:2] for dx, dy in house], z0=z + 0.2 * sc,
                         thickness=0.9 * sc, material=housing, chamfer=0.24 * sc, bevel=0.03))
    F.band(s, name + '_House', P(-1.0, 0, 0), (c, sn, 0), 0.2 * sc, 'stripe', facing=(0, 0, 1))
    zb = 0.62
    parts.append(F.box(s, name + '_Mantlet', P(1.35, 0, zb), (0.45 * sc, (0.42 * barrels + 0.35) * sc, 0.55 * sc),
                       material='gunmetal', rot_z=yaw, bevel=0.0))
    offs = [(i - (barrels - 1) / 2) * 0.42 for i in range(barrels)]
    L = 4.0
    for i, dy in enumerate(offs):
        parts.append(F.cylinder(s, f'{name}_Sleeve{i}', P(1.5, dy, zb), P(2.4, dy, zb), 0.17 * sc, 0.14 * sc,
                                material='gunmetal', segments=10, bevel=0.0))
        parts.append(F.cylinder(s, f'{name}_Barrel{i}', P(2.3, dy, zb), P(1.5 + L, dy, zb), 0.1 * sc, 0.085 * sc,
                                material='gunmetal', segments=8, bevel=0.0))
        parts.append(F.cylinder(s, f'{name}_Muzzle{i}', P(1.3 + L, dy, zb), P(1.62 + L, dy, zb), 0.13 * sc,
                                material='dark', segments=8, bevel=0.0))
    parts.append(F.box(s, name + '_Sight', P(-0.7, 0, 1.18), (0.3 * sc, 2.5 * sc, 0.24 * sc), material='gunmetal',
                       rot_z=yaw, bevel=0.0))
    for e in (-1, 1):
        parts.append(F.box(s, f'{name}_Lens{e}', P(-0.7, e * 1.27, 1.18), (0.2 * sc, 0.06 * sc, 0.14 * sc),
                           material='glow_cyan', rot_z=yaw, bevel=0.0))
    return parts


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- main hull -------------------------------------------------------------------------------
    F.loft(s, 'Hull', HULL, material='paint', belly='paint', count=64, bevel=0.06)
    F.band(s, 'Hull', (26.0, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.03, depth=0.05)
    F.band(s, 'Hull', (25.2, 0, 0), (1, 0, 0), 0.2, 'paint2', inset=0.02, depth=0.03)
    for side in (1, -1):
        F.band(s, 'Hull', (0, 0, -0.6), (0, 0, 1), 0.4, 'dark', facing=(0, side, 0), min_facing=0.7,
               inset=0.02, depth=0.06)

    # --- flight deck on the bow: recessed runway, landing lights, hangar maw ---------------------
    deck = [(29.6, 0.9), (28.6, 3.4), (26.0, 5.2), (20.0, 6.3), (8.0, 6.9), (6.0, 6.2), (6.0, -6.2), (8.0, -6.9),
            (20.0, -6.3), (26.0, -5.2), (28.6, -3.4), (29.6, -0.9)]
    F.plate(s, 'FlightDeck', deck, z0=1.1, thickness=2.0, material='paint', chamfer=0.45, chamfer_bottom=0.3,
            side_material='paint', bevel=0.06)
    F.panel(s, 'FlightDeck', (17.8, 0.0), (19.2, 3.6), 'dark', inset=0.05, depth=-0.07)
    F.band(s, 'FlightDeck', (0, 5.1, 0), (0, 1, 0), 0.3, 'paint2', facing=(0, 0, 1), min_facing=0.2)
    F.band(s, 'FlightDeck', (0, -5.1, 0), (0, 1, 0), 0.3, 'paint2', facing=(0, 0, 1), min_facing=0.2)
    F.band(s, 'FlightDeck', (0, 5.55, 0), (0, 1, 0), 0.12, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.band(s, 'FlightDeck', (0, -5.55, 0), (0, 1, 0), 0.12, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    for i in range(21):
        x = 27.0 - i * 0.92
        for side in (1, -1):
            F.box(s, f'EdgeLight{i}{side}', (x, side * 1.62, 3.06), (0.22, 0.14, 0.06), material='glow_cyan',
                  bevel=0.0)
        if i % 2 == 0:
            F.box(s, f'CenterLight{i}', (x, 0.0, 3.06), (0.5, 0.12, 0.06), material='glow_amber', bevel=0.0)
    F.box(s, 'Threshold', (27.35, 0.0, 3.06), (0.16, 3.2, 0.06), material='glow_warm', bevel=0.0)
    # hangar maw at the foot of the superstructure: a dark bay with a lit floor and ceiling
    F.box(s, 'MawLintel', (8.4, 0.0, 4.62), (0.8, 5.6, 0.42), material='paint2', bevel=0.03)
    F.box(s, 'MawJamb', (8.4, 2.55, 3.8), (0.8, 0.5, 1.64), material='paint2', bevel=0.03, mirror=True)
    F.box(s, 'Maw', (8.1, 0.0, 3.75), (0.6, 4.6, 1.3), material='dark', bevel=0.0)
    F.box(s, 'MawFloor', (8.55, 0.0, 3.12), (0.6, 4.5, 0.05), material='glow_warm', bevel=0.0)
    F.box(s, 'MawCeiling', (8.55, 0.0, 4.39), (0.4, 4.5, 0.05), material='glow_warm', bevel=0.0)
    # parked strike craft on the deck margins: tiny arrowheads that make the carrier read huge
    for side in (1, -1):
        for k, x in enumerate((22.6, 19.4, 16.2, 13.0)):
            y = side * 4.45
            F.plate(s, f'Parked{side}{k}', [(x + 1.0, y), (x - 0.8, y + 0.75), (x - 0.55, y), (x - 0.8, y - 0.75)],
                    z0=3.13, thickness=0.16, material='paint2', chamfer=0.04, bevel=0.0)
            F.box(s, f'ParkedCanopy{side}{k}', (x + 0.15, y, 3.31), (0.5, 0.18, 0.08), material='glass', bevel=0.0)
            F.box(s, f'ParkedPad{side}{k}', (x, y, 3.11), (2.3, 1.9, 0.04), material='gunmetal', bevel=0.0)
    # deck-edge catapult rails either side of the runway
    for side in (1, -1):
        F.box(s, f'Catapult{side}', (18.0, side * 3.6, 3.06), (15.0, 0.22, 0.08), material='gunmetal', bevel=0.0)

    # --- dorsal city: stepped tiers rising to the cathedral tower ------------------------------
    F.plate(s, 'Tier1', [(8.0, 3.6), (6.8, 4.7), (-24.8, 4.7), (-26.4, 3.4), (-26.4, -3.4), (-24.8, -4.7),
                         (6.8, -4.7), (8.0, -3.6)], z0=2.8, thickness=1.8, material='paint', chamfer=0.35,
            side_material='paint', bevel=0.05)
    F.band(s, 'Tier1', (0, 4.35, 0), (0, 1, 0), 0.14, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.band(s, 'Tier1', (0, -4.35, 0), (0, 1, 0), 0.14, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.plate(s, 'Tier2', [(4.0, 2.4), (2.8, 3.3), (-22.4, 3.3), (-23.4, 2.4), (-23.4, -2.4), (-22.4, -3.3),
                         (2.8, -3.3), (4.0, -2.4)], z0=4.45, thickness=1.6, material='paint2', chamfer=0.3,
            side_material='paint2', bevel=0.05)
    F.band(s, 'Tier2', (-6.0, 0, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1))
    F.band(s, 'Tier2', (-17.8, 0, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1))
    F.plate(s, 'Tier3', [(-0.6, 1.7), (-1.6, 2.4), (-19.8, 2.4), (-20.6, 1.7), (-20.6, -1.7), (-19.8, -2.4),
                         (-1.6, -2.4), (-0.6, -1.7)], z0=5.9, thickness=1.35, material='paint', chamfer=0.25,
            side_material='paint', bevel=0.05)
    # cathedral tower: ivory nave with a black-blue crown
    F.plate(s, 'Tower', [(-8.6, 1.1), (-9.4, 1.75), (-16.2, 1.75), (-16.8, 1.1), (-16.8, -1.1), (-16.2, -1.75),
                         (-9.4, -1.75), (-8.6, -1.1)], z0=7.1, thickness=3.3, material='paint2', chamfer=0.3,
            side_material='paint2', bevel=0.05)
    F.band(s, 'Tower', (-12.7, 0, 0), (1, 0, 0), 0.26, 'stripe', facing=(0, 0, 1))
    F.plate(s, 'Crown', [(-9.8, 0.8), (-10.4, 1.3), (-15.2, 1.3), (-15.6, 0.8), (-15.6, -0.8), (-15.2, -1.3),
                         (-10.4, -1.3), (-9.8, -0.8)], z0=10.25, thickness=1.0, material='paint', chamfer=0.2,
            side_material='paint', bevel=0.04)
    # flying buttresses: side-profile ribs from the tower shoulders down to the tier-2 edge
    for i, xb in enumerate((-9.9, -12.0, -14.1, -16.2)):
        yz_plate(s, f'Buttress{i}', [(1.6, 7.3), (2.95, 5.95), (2.95, 6.25), (1.6, 10.0)], xb - 0.2, 0.4,
                 material='paint2', mirror=True)
    for i, xb in enumerate((-2.8, -5.4, -19.2)):
        yz_plate(s, f'Rib{i}', [(2.2, 6.9), (4.45, 4.5), (4.45, 4.75), (2.2, 7.2)], xb - 0.18, 0.36,
                 material='paint', mirror=True)

    # --- windows: the city lights --------------------------------------------------------------
    F.windows(s, 'T1Side', 6.4, -24.6, 4.72, 3.25, 42, size=(0.34, 0.2), mirror=True)
    F.windows(s, 'T1Roof', 5.2, -23.8, 3.95, 4.62, 32, size=(0.34, 0.18), normal='z', mirror=True)
    F.windows(s, 'T2Side', 2.6, -22.2, 3.32, 4.85, 32, size=(0.32, 0.2), mirror=True)
    F.windows(s, 'T2Roof', 1.8, -21.4, 2.72, 6.07, 24, size=(0.3, 0.16), normal='z', mirror=True)
    F.windows(s, 'T3Side', -1.8, -19.6, 2.42, 6.25, 22, size=(0.3, 0.2), mirror=True)
    F.windows(s, 'TowerSideA', -9.6, -16.0, 1.77, 7.5, 8, size=(0.3, 0.22), mirror=True)
    F.windows(s, 'TowerSideB', -9.6, -16.0, 1.77, 8.15, 8, size=(0.3, 0.22), mirror=True)
    # aft-facing galleries: what the chase camera looks straight at
    for name, x, ys, zs in (('TowerAft', -16.84, 1.0, (7.5, 7.95, 8.4)), ('T3Aft', -20.64, 1.4, (6.28,)),
                            ('T2Aft', -23.44, 2.1, (4.78, 5.04)), ('T1Aft', -26.44, 3.1, (3.32,))):
        n = int(ys * 2 / 0.55) + 1
        for zi, z in enumerate(zs):
            for k in range(n):
                y = -ys + k * (2 * ys / max(n - 1, 1))
                F.box(s, f'{name}{zi}_{k}', (x, y, z), (0.06, 0.3, 0.17), material='glow_warm', bevel=0.0)
    F.windows(s, 'BridgeGlaze', -10.35, -10.35, 0.0, 11.26, 1, size=(0.34, 1.6), normal='z')
    # bow flank portholes ahead of the wings
    for i in range(16):
        x = 25.0 - i * 0.95
        for zw in (0.3, 0.85):
            yw = hull_y(x, zw)
            dw = (hull_at(x + 0.2)['w'] - hull_at(x - 0.2)['w']) / 0.4
            F.box(s, f'BowWin{i}_{zw}', (x, yw, zw), (0.32, 0.06, 0.2), material='glow_warm', bevel=0.0,
                  rot_z=math.atan(dw), mirror=True)

    # --- broad swept wings with turret rows and ivory nacelles ---------------------------------
    wing = [(12.0, 5.6), (-4.0, 14.2), (-8.6, 15.2), (-20.4, 15.2), (-23.6, 10.8), (-24.6, 5.8)]
    F.plate(s, 'Wing', wing, z0=-1.1, thickness=1.9, material='paint', chamfer=0.6, chamfer_bottom=0.35,
            side_material='paint2', mirror=True, bevel=0.06)
    ln = (8.6 / 18.1, 16.0 / 18.1, 0)
    F.band(s, 'Wing', (12.0 - ln[0] * 0.9, 5.6 - ln[1] * 0.9, 0), ln, 0.7, 'paint2', facing=(0, 0, 1), mirror=True)
    F.band(s, 'Wing', (12.0 - ln[0] * 1.55, 5.6 - ln[1] * 1.55, 0), ln, 0.14, 'stripe', facing=(0, 0, 1),
           mirror=True)
    # Identity trim, lit: one thin gold line along each wing's leading edge, between the ivory
    # band and the gold stripe -- the flagship's span read by its light (LOOK.md: lamps are light).
    F.band(s, 'Wing', (12.0 - ln[0] * 1.36, 5.6 - ln[1] * 1.36, 0), ln, 0.1, 'glow_cyan.gold', facing=(0, 0, 1),
           inset=0.01, depth=-0.02, mirror=True)
    F.panel(s, 'Wing', (-21.4, 8.2), (1.6, 3.0), 'dark', inset=0.04, depth=-0.05, mirror=True)
    for side in (1, -1):
        F.loft(s, f'Nacelle{side}', [
            dict(x=-22.8, w=0.7, ht=0.7, hb=0.7, zc=0.0, n=2.2, y=side * 15.3),
            dict(x=-21.8, w=1.05, ht=1.05, hb=1.0, zc=0.0, n=2.3, y=side * 15.3),
            dict(x=-8.0, w=1.05, ht=1.05, hb=1.0, zc=0.0, n=2.3, y=side * 15.3),
            dict(x=-4.6, w=0.55, ht=0.55, hb=0.5, zc=0.0, n=2.1, y=side * 15.3),
            dict(x=-3.4, w=0.1, ht=0.1, hb=0.1, zc=0.0, n=2.0, y=side * 15.3),
        ], material='paint2', back_material='dark', count=32, bevel=0.03)
        F.band(s, f'Nacelle{side}', (-9.5, 0, 0), (1, 0, 0), 0.4, 'stripe')
        F.band(s, f'Nacelle{side}', (-19.8, 0, 0), (1, 0, 0), 0.3, 'stripe')
        F.band(s, f'Nacelle{side}', (-14.6, 0, 0), (1, 0, 0), 2.4, 'paint', inset=0.02, depth=-0.03)
        F.nozzle(s, f'NacelleDrive{side}', (-23.5, side * 15.3, 0.0), 0.62, 1.0, material='gunmetal', bell=1.1,
                 segments=24)
        F.windows(s, f'NacelleWin{side}', -5.8, -21.0, side * 15.3, 1.03, 14, size=(0.32, 0.16), normal='z')
    # gun gallery: a raised strip parallel to the leading edge carrying the turret row
    d = (-0.881, 0.473)

    def gallery(t, off):
        return (12.0 + t * d[0] - off * 0.473, 5.6 + t * d[1] - off * 0.881)
    strip = [gallery(7.6, 1.2), gallery(19.6, 1.2), gallery(19.6, 3.5), gallery(7.6, 3.5)]
    F.plate(s, 'Gallery', strip[::-1], z0=0.45, thickness=0.55, material='paint', chamfer=0.18, mirror=True,
            bevel=0.03, side_material='paint2')
    F.band(s, 'Gallery', gallery(13.6, 3.2) + (0,), (0.473, 0.881, 0), 0.12, 'stripe', facing=(0, 0, 1),
           mirror=True)
    wing_turrets = [gallery(t, 2.3) for t in (9.6, 13.5, 17.4)]
    for side in (1, -1):
        sd = 'P' if side > 0 else 'S'
        for i, (tx, ty) in enumerate(wing_turrets):
            turret(s, f'W{i}{sd}', tx, side * ty, 1.0, 0.62, barrels=2)
        # broadside turret aft on the wing, trained outboard
        parts = turret(s, f'WB{sd}', -12.4, side * 10.4, 0.8, 0.66, barrels=2, yaw=side * math.pi / 2)
        if side > 0:
            s.hook_part('HOOK_SECONDARY_TURRET', *parts)
    # secondary launch bays in the wing roots: dark recessed hatches with amber edge lights
    F.panel(s, 'Wing', (-8.6, 8.1), (4.6, 1.9), 'dark', inset=0.06, depth=-0.07, mirror=True)
    for side in (1, -1):
        for k in range(6):
            F.box(s, f'BayLight{side}{k}', (-10.7 + k * 0.84, side * 9.2, 0.82), (0.2, 0.1, 0.05),
                  material='glow_amber', bevel=0.0)
        # heavy triple turrets on the tier-1 shoulders, ahead of the city
        turret(s, f'M{sd}', 3.6, side * 6.4, 2.4, 0.85, barrels=3)
    # turret decks under the heavy turrets
    F.plate(s, 'MainMount', [(6.2, 5.0), (5.4, 7.6), (1.6, 7.6), (1.0, 5.0)], z0=1.0, thickness=1.4,
            material='paint', chamfer=0.2, mirror=True, bevel=0.04)

    # --- six drives in a crescent across the stern ----------------------------------------------
    arc = [(-29.6 + 0.035 * y * y, y) for y in (10.4, 8.0, 5.0, 2.0, -2.0, -5.0, -8.0, -10.4)]
    eng = [(-21.0, 10.6)] + arc + [(-21.0, -10.6)]
    F.plate(s, 'EngineBlock', eng, z0=-2.0, thickness=3.6, material='paint', chamfer=0.55, chamfer_bottom=0.3,
            side_material='paint2', bevel=0.06)
    F.band(s, 'EngineBlock', (-24.0, 0, 0), (1, 0, 0), 0.4, 'stripe', facing=(0, 0, 1), inset=0.03, depth=0.04)
    drives = [(1.85, 1.45), (5.4, 1.35), (8.8, 1.15)]
    for i, (y, r) in enumerate(drives):
        xr = -29.9 + 0.035 * y * y
        F.cylinder(s, f'Drum{i}', (xr + 0.1, y, 0.35), (xr + 6.0, y, 0.35), r + 0.18, r + 0.1, material='gunmetal',
                   segments=36, cap_material='dark', bevel=0.02, mirror=True)
        F.cylinder(s, f'DrumRing{i}', (xr + 1.4, y, 0.35), (xr + 1.9, y, 0.35), r + 0.28, material='stripe',
                   segments=36, bevel=0.0, mirror=True)
        F.nozzle(s, f'Drive{i}', (xr - 1.1, y, 0.35), r, 1.4, material='gunmetal', bell=1.12, segments=36,
                 mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-31.0, 0.0, 0.35))

    # --- damage parts: spire sensor on the crown, port wing armour ------------------------------
    spire = F.cylinder(s, 'Spire', (-12.8, 0.0, 11.1), (-12.8, 0.0, 14.4), 0.22, 0.05, material='paint2',
                       segments=12, bevel=0.0)
    yard = F.box(s, 'SpireYard', (-12.8, 0.0, 12.3), (0.2, 3.0, 0.14), material='gunmetal', bevel=0.0)
    dome = F.cylinder(s, 'SpireDome', (-13.9, 0.0, 11.2), (-13.9, 0.0, 11.7), 0.55, 0.35, material='paint2',
                      segments=16, bevel=0.0)
    tip = F.light(s, 'SpireTip', (-12.8, 0.0, 14.45), 'glow_red', size=0.16)
    s.hook_part('HOOK_SENSOR_SPIRE', spire, yard, dome, tip)
    armor = F.plate(s, 'WingArmorP', [(-15.0, 8.6), (-15.6, 12.4), (-20.0, 12.4), (-21.2, 8.6)], z0=0.72,
                    thickness=0.3, material='paint', chamfer=0.1, bevel=0.03)
    s.hook_part('HOOK_ARMOR_PORT', armor)
    F.plate(s, 'WingArmorS', [(-15.0, -8.6), (-21.2, -8.6), (-20.0, -12.4), (-15.6, -12.4)], z0=0.72,
            thickness=0.3, material='paint', chamfer=0.1, bevel=0.03)

    # --- detail ----------------------------------------------------------------------------------
    s.detail = 1
    # missile cells on the tier-1 roof aft of the city
    for i in range(2):
        for j in range(5):
            x, y = -24.1 - i * 0.9, (j - 2) * 1.1
            F.box(s, f'VLS{i}{j}', (x, y, 4.62), (0.75, 0.9, 0.08), material='dark', bevel=0.0)
            F.box(s, f'VLSLid{i}{j}', (x, y, 4.67), (0.6, 0.72, 0.05), material='gunmetal', bevel=0.0)
    for side in (1, -1):
        for x in (1.0, -6.0, -13.0, -20.0):
            F.cylinder(s, f'PD{x}{side}', (x, side * 3.9, 4.5), (x, side * 3.9, 5.05), 0.34, 0.28, material='paint2',
                       segments=12, bevel=0.0, cap_material='dark')
            for dy in (-0.09, 0.09):
                F.cylinder(s, f'PDG{x}{side}{dy}', (x + 0.15, side * 3.9 + dy, 4.95), (x + 0.95, side * 4.1 + dy, 4.95),
                           0.045, material='gunmetal', segments=6, bevel=0.0)
        F.rcs(s, f'RCSBow{side}', (22.5, side * 5.95, 1.6), size=0.5)
    F.vent(s, 'EngVent', (-25.2, 7.4, 1.62), (2.2, 1.2, 0.12), mirror=True, axis='y')
    F.vent(s, 'TierVent', (-21.6, 2.9, 4.6), (1.4, 0.9, 0.12), mirror=True)
    # corner pinnacles on the tower shoulders
    for px in (-9.7, -16.0):
        for side in (1, -1):
            F.box(s, f'Pinnacle{px}{side}', (px, side * 1.4, 10.75), (0.32, 0.32, 1.0), material='paint2', bevel=0.0,
                  taper=0.35)
            F.light(s, f'PinnacleTip{px}{side}', (px, side * 1.4, 11.3), 'glow_amber', size=0.1)
    s.detail = 0

    # --- lights ----------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-21.2, 16.36, 0.0), 'glow_red', size=0.4)
    F.light(s, 'NavStarboard', (-21.2, -16.36, 0.0), 'glow_green', size=0.4)
    F.light(s, 'NavBowP', (29.0, 1.4, 2.4), 'glow_red', size=0.22)
    F.light(s, 'NavBowS', (29.0, -1.4, 2.4), 'glow_green', size=0.22)
    F.light(s, 'Beacon', (-11.4, 0.0, 11.32), 'glow_amber', size=0.26)
    F.light(s, 'BeaconAft', (-26.8, 0.0, 1.65), 'glow_amber', size=0.3)
    for side in (1, -1):
        F.light(s, f'WingEdge{side}', (-3.9, side * 14.4, 0.2), 'glow_warm', size=0.22)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
