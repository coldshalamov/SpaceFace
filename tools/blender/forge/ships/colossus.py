"""Colossus — tier-4 player battlecruiser. "Hammerhead battlecruiser with spinal cannon."

Plan read at the chase camera: a wide armoured hammer head across the bow (the T), a long neck of
hull carrying a raised spinal accelerator casing ringed with crimson coils, scalloped gun blisters
down both flanks, and a broad engine block aft with four big drive drums. The spinal cannon's bore
glows in the middle of the hammer's leading edge. Heavy triple turrets ride the hammer wings.
Three values: steel hull, graphite armour decks, dark machinery; crimson bands.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'colossus'
COLORS = {
    'paint': '#1e232b',    # dark steel (brief #2e3136, cooled and deepened: the warm key light lifts it ~2.5x)
    'paint2': '#131519',   # graphite armour decks
    'stripe': '#4c0f13',   # crimson (brief #7a1f1f, authored darker: the key light lifts ~2.5x)
    'hazard': '#4c0f13',
    'dark': '#141518',
    'glow_cyan.crimson': '#ff2040',  # crimson, lit: the hammer's spanwise line
}

NECK = [
    dict(x=-22.0, w=5.0, ht=2.6, hb=2.3, zc=0.2, n=3.0),
    dict(x=-10.0, w=5.4, ht=2.9, hb=2.5, zc=0.2, n=3.0),
    dict(x=6.0, w=5.0, ht=2.8, hb=2.4, zc=0.2, n=3.0),
    dict(x=14.0, w=4.3, ht=2.5, hb=2.2, zc=0.2, n=3.0),
    dict(x=18.0, w=3.8, ht=2.2, hb=2.0, zc=0.2, n=3.0),
]


def neck_at(x):
    for a, b in zip(NECK, NECK[1:]):
        if a['x'] <= x <= b['x']:
            t = (x - a['x']) / (b['x'] - a['x'])
            return {k: a[k] + (b[k] - a[k]) * t for k in ('w', 'ht', 'hb', 'zc', 'n')}
    return dict(NECK[0] if x < NECK[0]['x'] else NECK[-1])


def neck_y(x, z):
    h = neck_at(x)
    hh = h['ht'] if z >= h['zc'] else h['hb']
    r = min(abs(z - h['zc']) / hh, 0.999)
    return h['w'] * (1 - r ** h['n']) ** (1 / h['n'])


def turret(s, name, x, y, z, sc=1.0, barrels=3, yaw=0.0, housing='paint2', rangefinder=True):
    """Local helper: a heavy turret — barbette + crimson ring, faceted armoured house, mantlet,
    barrels with blast sleeves and muzzle brakes, rangefinder bar across the rear roof."""
    c, sn = math.cos(yaw), math.sin(yaw)

    def P(dx, dy, dz=0.0):
        return (x + (dx * c - dy * sn) * sc, y + (dx * sn + dy * c) * sc, z + dz * sc)

    parts = []
    parts.append(F.cylinder(s, name + '_Barbette', (x, y, z - 0.5 * sc), (x, y, z + 0.3 * sc), 1.2 * sc,
                            material='gunmetal', segments=28, cap_material='dark', bevel=0.0))
    parts.append(F.cylinder(s, name + '_Ring', (x, y, z + 0.06 * sc), (x, y, z + 0.22 * sc), 1.3 * sc,
                            material='stripe', segments=28, bevel=0.0))
    house = [(1.35, 0.55), (0.8, 1.15), (-1.2, 1.15), (-1.5, 0.8), (-1.5, -0.8), (-1.2, -1.15), (0.8, -1.15),
             (1.35, -0.55)]
    outline = [P(dx, dy)[:2] for dx, dy in house]
    parts.append(F.plate(s, name + '_House', outline, z0=z + 0.2 * sc, thickness=0.9 * sc, material=housing,
                         chamfer=0.24 * sc, bevel=0.03))
    F.band(s, name + '_House', P(-1.0, 0, 0), (c, sn, 0), 0.18 * sc, 'stripe', facing=(0, 0, 1))
    zb = 0.62
    parts.append(F.box(s, name + '_Mantlet', P(1.35, 0, zb), (0.45 * sc, (0.42 * barrels + 0.35) * sc, 0.55 * sc),
                       material='gunmetal', rot_z=yaw, bevel=0.0))
    offs = [(i - (barrels - 1) / 2) * 0.42 for i in range(barrels)]
    L = 4.3 if barrels == 3 else 3.6
    for i, dy in enumerate(offs):
        parts.append(F.cylinder(s, f'{name}_Sleeve{i}', P(1.5, dy, zb), P(2.4, dy, zb), 0.17 * sc, 0.14 * sc,
                                material='gunmetal', segments=12, bevel=0.0))
        parts.append(F.cylinder(s, f'{name}_Barrel{i}', P(2.3, dy, zb), P(1.5 + L, dy, zb), 0.1 * sc, 0.085 * sc,
                                material='gunmetal', segments=10, bevel=0.0))
        parts.append(F.cylinder(s, f'{name}_Muzzle{i}', P(1.3 + L, dy, zb), P(1.62 + L, dy, zb), 0.13 * sc,
                                material='dark', segments=10, bevel=0.0))
    if rangefinder:
        parts.append(F.box(s, name + '_Rangefinder', P(-0.75, 0, 1.2), (0.3 * sc, 2.9 * sc, 0.26 * sc),
                           material='gunmetal', rot_z=yaw, bevel=0.0))
        for e in (-1, 1):
            parts.append(F.box(s, f'{name}_RFLens{e}', P(-0.75, e * 1.47, 1.2), (0.22 * sc, 0.06 * sc, 0.16 * sc),
                               material='glow_red', rot_z=yaw, bevel=0.0))
    parts.append(F.box(s, name + '_Hatch', P(-0.1, 0.5, 1.12), (0.55 * sc, 0.42 * sc, 0.08 * sc),
                       material='gunmetal', rot_z=yaw, bevel=0.0))
    return parts


def octagon(cx, cy, r, stretch=1.0):
    return [(cx + r * stretch * math.cos(math.pi / 8 + i * math.pi / 4), cy + r * math.sin(math.pi / 8 + i * math.pi / 4))
            for i in range(8)]


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- neck hull -------------------------------------------------------------------------------
    F.loft(s, 'Neck', NECK, material='paint', belly='paint2', count=64, bevel=0.06)
    for x in (-4.0, 10.0):
        F.band(s, 'Neck', (x, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.03, depth=0.05)
    for side in (1, -1):
        F.band(s, 'Neck', (0, 0, -0.4), (0, 0, 1), 0.45, 'dark', facing=(0, side, 0), min_facing=0.7,
               inset=0.02, depth=0.06)
    # graphite deck along the neck: gallery windows along its edges
    F.plate(s, 'NeckDeck', [(15.0, 3.2), (13.0, 4.4), (-11.0, 4.6), (-12.5, 3.6), (-12.5, -3.6), (-11.0, -4.6),
                            (13.0, -4.4), (15.0, -3.2)], z0=2.25, thickness=0.75, material='paint2', chamfer=0.3,
            side_material='paint', bevel=0.05)

    # --- hammer head -----------------------------------------------------------------------------
    # anvil planform: the leading edge dips back between the snout and forward-raked horn tips
    head = [(24.2, 3.4), (21.9, 8.2), (23.4, 11.4), (22.8, 12.4), (15.4, 12.4), (14.2, 10.6), (12.6, 5.2),
            (12.6, -5.2), (14.2, -10.6), (15.4, -12.4), (22.8, -12.4), (23.4, -11.4), (21.9, -8.2), (24.2, -3.4)]
    F.plate(s, 'Head', head, z0=-1.5, thickness=3.2, material='paint', chamfer=0.9, chamfer_bottom=0.5,
            side_material='paint2', bevel=0.08)
    # crimson bands spanwise across the head and a chevron on each wing
    F.band(s, 'Head', (16.2, 0, 0), (1, 0, 0), 0.7, 'stripe', facing=(0, 0, 1), inset=0.03, depth=0.04)
    F.band(s, 'Head', (17.1, 0, 0), (1, 0, 0), 0.2, 'stripe', facing=(0, 0, 1))
    # Identity trim, lit: one thin crimson line spanning the whole hammer head just aft of the
    # crimson band -- the T read by its light (LOOK.md: lamps are light).
    F.band(s, 'Head', (15.55, 0, 0), (1, 0, 0), 0.12, 'glow_cyan.crimson', facing=(0, 0, 1), inset=0.01, depth=-0.02)
    # raised armour plates on the wing tops, dark service wells inboard
    F.panel(s, 'Head', (19.0, 10.2), (3.4, 1.4), 'paint2', inset=0.06, depth=0.07)
    F.panel(s, 'Head', (19.0, -10.2), (3.4, 1.4), 'paint2', inset=0.06, depth=0.07)
    F.panel(s, 'Head', (20.3, 4.3), (2.6, 1.3), 'dark', inset=0.04, depth=-0.05)
    F.panel(s, 'Head', (20.3, -4.3), (2.6, 1.3), 'dark', inset=0.04, depth=-0.05)
    # hammer end-caps: armoured bulkheads at each tip
    for side in (1, -1):
        F.plate(s, f'EndCap{side}', [(24.0, side * 11.2), (23.3, side * 12.8), (14.9, side * 12.8),
                                     (15.3, side * 11.2)][::side], z0=-1.9, thickness=4.3, material='paint2',
                chamfer=0.35, top_material='stripe', bevel=0.05)
        F.band(s, f'EndCap{side}', (0, 0, 0.7), (0, 0, 1), 0.45, 'stripe', facing=(0, side, 0), min_facing=0.6,
               inset=0.02, depth=0.04)
        F.windows(s, f'CapWin{side}', 22.6, 15.8, side * 12.81, -0.45, 11, size=(0.34, 0.2))
        F.windows(s, f'CapWinB{side}', 22.6, 15.8, side * 12.81, -1.05, 11, size=(0.34, 0.2))
    # snout: the armoured cannon housing that bulges out of the head's leading edge
    F.loft(s, 'Snout', [
        dict(x=11.0, w=3.0, ht=3.0, hb=2.4, zc=0.5, n=2.6),
        dict(x=20.0, w=3.4, ht=3.2, hb=2.6, zc=0.5, n=2.6),
        dict(x=24.0, w=3.3, ht=3.0, hb=2.5, zc=0.5, n=2.6),
        dict(x=25.2, w=2.9, ht=2.7, hb=2.3, zc=0.5, n=2.4),
    ], material='paint', belly='paint2', front_material='dark', count=56, bevel=0.06)
    F.band(s, 'Snout', (24.4, 0, 0), (1, 0, 0), 0.45, 'stripe', inset=0.03, depth=0.05)
    # the spinal cannon muzzle: stepped collars, a dark bore and a hot core deep inside
    F.cylinder(s, 'MuzzleCollar', (24.9, 0.0, 0.5), (26.2, 0.0, 0.5), 2.35, 2.2, material='gunmetal', segments=48,
               cap_material='dark', bevel=0.02)
    F.cylinder(s, 'MuzzleLip', (26.1, 0.0, 0.5), (26.5, 0.0, 0.5), 2.0, 1.9, material='paint2', segments=48,
               cap_material='dark', bevel=0.01)
    F.cylinder(s, 'MuzzleBore', (25.6, 0.0, 0.5), (26.55, 0.0, 0.5), 1.35, material='dark', segments=40,
               cap_material='dark', bevel=0.0)
    F.cylinder(s, 'MuzzleCore', (26.5, 0.0, 0.5), (26.58, 0.0, 0.5), 0.85, material='glow_red', segments=32,
               bevel=0.0)
    for i in range(8):
        a = math.pi / 8 + i * math.pi / 4
        F.box(s, f'MuzzleVane{i}', (25.6, 2.3 * math.cos(a), 0.5 + 2.3 * math.sin(a)), (1.4, 0.35, 0.35),
              material='paint2', bevel=0.0)

    # --- spinal accelerator casing with crimson coil rings -------------------------------------
    F.loft(s, 'Spinal', [
        dict(x=-7.5, w=1.2, ht=1.0, hb=1.0, zc=2.9, n=3.0),
        dict(x=-6.5, w=1.9, ht=1.45, hb=1.2, zc=2.9, n=3.2),
        dict(x=21.0, w=1.9, ht=1.45, hb=1.2, zc=2.9, n=3.2),
        dict(x=23.2, w=1.4, ht=1.0, hb=1.0, zc=2.9, n=3.0),
    ], material='paint2', front_material='dark', back_material='dark', count=48, bevel=0.05)
    for i in range(8):
        F.band(s, 'Spinal', (-4.6 + i * 3.3, 0, 0), (1, 0, 0), 0.42, 'stripe', inset=0.02, depth=0.09)
    # capacitor banks: glowing slots along the casing roof between coils
    for i in range(7):
        F.box(s, f'CoilGlow{i}', (-2.95 + i * 3.3, 0.0, 4.34), (1.7, 0.36, 0.06), material='glow_red', bevel=0.0)

    # --- gun blisters down the flanks, triple turrets on the hammer wings ----------------------
    blisters = [(8.0, 5.6), (1.5, 5.9), (-5.0, 6.0)]
    for i, (bx, by) in enumerate(blisters):
        F.plate(s, f'Blister{i}', octagon(bx, by, 1.85, 1.2), z0=-0.9, thickness=2.9, material='paint',
                chamfer=0.45, chamfer_bottom=0.3, side_material='paint', bevel=0.05, mirror=True)
        F.band(s, f'Blister{i}', (bx, by + 1.2, 0), (0, 1, 0), 0.3, 'stripe', facing=(0, 0, 1), min_facing=0.2,
               mirror=True)
    for side in (1, -1):
        sd = 'P' if side > 0 else 'S'
        for i, (bx, by) in enumerate(blisters):
            parts = turret(s, f'B{i}{sd}', bx, side * by, 2.0, 0.66, barrels=2, rangefinder=False)
            if side > 0 and i == 2:
                s.hook_part('HOOK_SECONDARY_TURRET', *parts)
        turret(s, f'H{sd}', 18.2, side * 7.6, 1.7, 1.05, barrels=3)

    # --- engine block and four drive drums -------------------------------------------------------
    eng = [(-11.0, 5.0), (-13.5, 8.2), (-24.2, 8.2), (-25.2, 7.2), (-25.2, -7.2), (-24.2, -8.2), (-13.5, -8.2),
           (-11.0, -5.0)]
    F.plate(s, 'EngineBlock', eng, z0=-1.9, thickness=3.3, material='paint', chamfer=0.6, chamfer_bottom=0.3,
            side_material='paint2', bevel=0.07)
    F.band(s, 'EngineBlock', (-14.3, 0, 0), (1, 0, 0), 0.5, 'stripe', facing=(0, 0, 1), inset=0.03, depth=0.04)
    for i, y in enumerate((2.1, 5.7)):
        F.cylinder(s, f'DriveDrum{i}', (-25.6, y, 0.25), (-17.0, y, 0.25), 1.75, 1.65, material='gunmetal',
                   segments=32, cap_material='dark', bevel=0.02, mirror=True)
        F.cylinder(s, f'DriveCoil{i}', (-23.2, y, 0.25), (-22.6, y, 0.25), 1.86, material='stripe', segments=32,
                   bevel=0.0, mirror=True)
        F.cylinder(s, f'DriveCoilB{i}', (-20.4, y, 0.25), (-19.9, y, 0.25), 1.8, material='paint2', segments=32,
                   bevel=0.0, mirror=True)
        F.nozzle(s, f'Drive{i}', (-26.9, y, 0.25), 1.55, 1.5, material='gunmetal', bell=1.12, segments=32,
                 mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-26.8, 0.0, 0.25))
    # heat-sink combs between the drums
    s.detail = 1
    for side in (1, -1):
        F.fins(s, f'Sink{side}', -24.5, -18.0, side * 3.9, 1.3, 0.9, 9, thickness=0.12, depth=0.9)
    F.fins(s, 'SinkC', -24.5, -18.0, 0.0, 1.3, 0.9, 9, thickness=0.12, depth=1.6)
    s.detail = 0

    # --- bridge tower: stepped command block over the engine block ------------------------------
    F.plate(s, 'Bridge1', [(-9.4, 1.7), (-10.4, 3.0), (-17.2, 3.0), (-17.2, -3.0), (-10.4, -3.0), (-9.4, -1.7)],
            z0=1.1, thickness=2.6, material='paint', chamfer=0.35, side_material='paint', bevel=0.05)
    F.band(s, 'Bridge1', (-13.4, 0, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1))
    F.plate(s, 'Bridge2', [(-10.6, 1.3), (-11.4, 2.2), (-16.4, 2.2), (-16.4, -2.2), (-11.4, -2.2), (-10.6, -1.3)],
            z0=3.5, thickness=1.8, material='paint2', chamfer=0.25, side_material='paint2', bevel=0.05)
    F.plate(s, 'Bridge3', [(-11.6, 1.0), (-12.0, 3.2), (-13.2, 3.2), (-13.6, 1.2), (-15.8, 1.2), (-15.8, -1.2),
                           (-13.6, -1.2), (-13.2, -3.2), (-12.0, -3.2), (-11.6, -1.0)],
            z0=5.2, thickness=0.9, material='paint', chamfer=0.18, side_material='paint', bevel=0.04)
    F.band(s, 'Bridge3', (-12.6, 0, 0), (1, 0, 0), 0.22, 'stripe', facing=(0, 0, 1))
    F.box(s, 'MastHouse', (-14.6, 0.0, 6.4), (1.8, 1.4, 0.9), material='paint2', bevel=0.04, taper=0.85)

    # --- windows ---------------------------------------------------------------------------------
    F.windows(s, 'BridgeGlaze', -11.85, -11.85, 0.0, 6.12, 1, size=(0.3, 1.8), normal='z')
    F.windows(s, 'BridgeWing', -12.6, -12.6, 2.6, 6.12, 1, size=(0.6, 0.9), normal='z', mirror=True)
    F.windows(s, 'Bridge1Roof', -10.8, -16.8, 2.55, 3.72, 8, size=(0.36, 0.2), normal='z', mirror=True)
    F.windows(s, 'Bridge1Side', -10.6, -17.0, 3.02, 2.0, 10, size=(0.3, 0.2), mirror=True)
    F.windows(s, 'Bridge1SideB', -10.6, -17.0, 3.02, 2.45, 10, size=(0.3, 0.2), mirror=True)
    F.windows(s, 'Bridge2Side', -11.4, -16.2, 2.22, 4.05, 7, size=(0.3, 0.2), mirror=True)
    F.windows(s, 'DeckGallery', 12.2, -10.2, 4.12, 3.02, 26, size=(0.32, 0.18), normal='z', mirror=True)
    F.windows(s, 'HeadGallery', 22.0, 15.2, 5.2, 1.72, 8, size=(0.32, 0.2), normal='z', mirror=True)
    F.windows(s, 'EngineGallery', -12.6, -23.8, 7.1, 1.43, 12, size=(0.32, 0.2), normal='z', mirror=True)
    # flank portholes between the blisters, on the neck skin
    for i in range(24):
        x = 12.8 - i * 0.95
        if any(abs(x - bx) < 2.4 for bx, _ in blisters):
            continue
        for zw in (0.4, 1.0):
            yw = neck_y(x, zw)
            F.box(s, f'FlankWin{i}_{zw}', (x, yw, zw), (0.32, 0.06, 0.2), material='glow_warm', bevel=0.0,
                  mirror=True)
    # leading-edge windows across the hammer face
    for side in (1, -1):
        for i in range(7):
            y = side * (3.9 + i * 0.65)
            F.box(s, f'FaceWin{side}{i}', (24.2 - (abs(y) - 3.4) * 0.479 + 0.01, y, -0.22), (0.06, 0.34, 0.18),
                  material='glow_warm', bevel=0.0, rot_z=side * 0.447)

    # --- damage parts: sensor mast, port head armour --------------------------------------------
    mast = F.cylinder(s, 'Mast', (-14.6, 0.0, 6.7), (-14.6, 0.0, 9.3), 0.15, 0.08, material='gunmetal',
                      segments=10, bevel=0.0)
    yard = F.box(s, 'MastYard', (-14.6, 0.0, 8.3), (0.18, 3.0, 0.12), material='gunmetal', bevel=0.0)
    dome = F.cylinder(s, 'MastDome', (-14.6, 0.0, 9.2), (-14.6, 0.0, 9.65), 0.45, 0.3, material='paint2',
                      segments=16, bevel=0.0)
    tip = F.light(s, 'MastTip', (-14.6, 0.0, 9.7), 'glow_red', size=0.15)
    radar = F.box(s, 'Radar', (-14.0, 0.0, 7.2), (0.25, 2.1, 0.5), material='gunmetal', bevel=0.0)
    s.hook_part('HOOK_SENSOR_MAST', mast, yard, dome, tip, radar)
    armor = F.plate(s, 'HeadArmorP', [(22.2, 6.0), (21.3, 9.2), (15.8, 9.2), (14.6, 6.0)], z0=1.45, thickness=0.3,
                    material='paint2', chamfer=0.1, bevel=0.03)
    s.hook_part('HOOK_ARMOR_PORT', armor)
    F.plate(s, 'HeadArmorS', [(22.2, -6.0), (14.6, -6.0), (15.8, -9.2), (21.3, -9.2)], z0=1.45, thickness=0.3,
            material='paint2', chamfer=0.1, bevel=0.03)

    # --- detail ----------------------------------------------------------------------------------
    s.detail = 1
    for side in (1, -1):
        for x in (11.5, 4.8, -1.8, -8.4):
            F.cylinder(s, f'PD{x}{side}', (x, side * 3.7, 2.7), (x, side * 3.7, 3.35), 0.4, 0.33,
                       material='paint2', segments=14, bevel=0.0, cap_material='dark')
            for dy in (-0.1, 0.1):
                F.cylinder(s, f'PDG{x}{side}{dy}', (x + 0.2, side * 3.7 + dy, 3.2), (x + 1.1, side * (3.7 + 0.3) + dy, 3.2),
                           0.05, material='gunmetal', segments=8, bevel=0.0)
    # missile cells in the hammer wings, inboard of the heavy turrets
    for side in (1, -1):
        for i in range(4):
            for j in range(2):
                x, y = 21.4 - i * 0.95, side * (3.9 + j * 0.9)
                F.box(s, f'HeadVLS{side}{i}{j}', (x, y, 1.7), (0.8, 0.75, 0.1), material='dark', bevel=0.0)
                F.box(s, f'HeadVLSLid{side}{i}{j}', (x, y, 1.76), (0.62, 0.58, 0.06), material='gunmetal', bevel=0.0)
    F.vent(s, 'EngVent', (-21.5, 7.2, 1.42), (2.4, 1.0, 0.12), mirror=True)
    F.vent(s, 'NeckVent', (-9.3, 2.6, 3.0), (1.4, 0.8, 0.12), mirror=True)
    F.rcs(s, 'RCSHead', (19.0, 12.85, 0.4), size=0.6, mirror=True)
    F.rcs(s, 'RCSAft', (-22.5, 8.2, 0.2), size=0.6, mirror=True)
    F.antenna(s, 'Whip', (-15.6, 1.0, 6.1), 1.6, tip=None, mirror=True)
    s.detail = 0

    # --- lights ----------------------------------------------------------------------------------
    F.light(s, 'NavPort', (21.5, 12.4, 2.45), 'glow_red', size=0.36)
    F.light(s, 'NavStarboard', (21.5, -12.4, 2.45), 'glow_green', size=0.36)
    F.light(s, 'NavAftP', (-24.3, 8.25, 1.0), 'glow_red', size=0.24)
    F.light(s, 'NavAftS', (-24.3, -8.25, 1.0), 'glow_green', size=0.24)
    F.light(s, 'Beacon', (-15.8, 0.0, 6.2), 'glow_amber', size=0.24)
    F.light(s, 'BeaconAft', (-24.6, 0.0, 1.45), 'glow_amber', size=0.3)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
