"""Warden — tier-4 player gunship. "A flying gun battery": navy armour, gold trim, a turret spine.

Plan read at the chase camera: a long armoured hull with a pointed ram bow, stepped sponson gun decks
either side (narrow forward deck, wider aft deck), four heavy triple turrets down the centreline
(two forward, the second superfiring; two aft, facing aft), a stepped bridge tower aft of centre,
eight twin secondary turrets on the sponsons, and a five-nozzle drive bank. Scale comes from detail
density: rows of lit portholes, VLS hatches, point-defence mounts and rangefinder bars.
Three values: navy hull, slate armour decks/turret houses, dark machinery; gold trim bands.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'warden'
COLORS = {
    'paint': '#223247',    # navy hull
    'paint2': '#282f3a',   # steel armour: turret houses, bridge tier, belt plates
    'stripe': '#7e622b',   # gold trim (brief #b08a3c, authored darker: the key light lifts ~2.5x)
    'hazard': '#7e622b',
    'dark': '#16191e',
}

# Hull sections (also used by helpers that sit parts on the hull skin).
HULL = [
    dict(x=-19.0, w=3.3, ht=1.9, hb=1.6, zc=0.1, n=3.2),
    dict(x=-18.2, w=3.9, ht=2.3, hb=2.0, zc=0.1, n=3.4),
    dict(x=-8.0, w=4.3, ht=2.45, hb=2.1, zc=0.1, n=3.4),
    dict(x=5.0, w=4.1, ht=2.4, hb=2.0, zc=0.1, n=3.3),
    dict(x=12.0, w=3.3, ht=2.25, hb=1.8, zc=0.1, n=3.0),
    dict(x=16.5, w=2.1, ht=1.7, hb=1.35, zc=0.05, n=2.8),
    dict(x=19.3, w=0.9, ht=1.0, hb=0.7, zc=0.0, n=2.5),
    dict(x=20.5, w=0.25, ht=0.4, hb=0.3, zc=0.0, n=2.2),
]


def hull_at(x):
    """Linear section interpolation (what loft() builds between rings)."""
    for a, b in zip(HULL, HULL[1:]):
        if a['x'] <= x <= b['x']:
            t = (x - a['x']) / (b['x'] - a['x'])
            return {k: a[k] + (b[k] - a[k]) * t for k in ('w', 'ht', 'hb', 'zc', 'n')}
    return dict(HULL[0] if x < HULL[0]['x'] else HULL[-1])


def hull_y(x, z):
    """Half-width of the hull skin at (x, z)."""
    h = hull_at(x)
    hh = h['ht'] if z >= h['zc'] else h['hb']
    r = min(abs(z - h['zc']) / hh, 0.999)
    return h['w'] * (1 - r ** h['n']) ** (1 / h['n'])


def turret(s, name, x, y, z, sc=1.0, barrels=3, yaw=0.0, housing='paint2', rangefinder=True):
    """Local helper: a naval turret — barbette + gold ring, faceted armoured house, mantlet, barrels
    with blast sleeves and muzzle brakes, rangefinder bar across the rear roof. yaw=pi faces aft."""
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
    # gold trim across the rear roof
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
                               material='glow_cyan', rot_z=yaw, bevel=0.0))
    parts.append(F.box(s, name + '_Hatch', P(-0.1, 0.5, 1.12), (0.55 * sc, 0.42 * sc, 0.08 * sc),
                       material='gunmetal', rot_z=yaw, bevel=0.0))
    return parts


def pd_mount(s, name, x, y, z, yaw=0.0):
    """Point-defence mount: squat drum with a twin gatling pointed outboard."""
    F.cylinder(s, name + '_Drum', (x, y, z - 0.15), (x, y, z + 0.35), 0.38, 0.32, material='gunmetal',
               segments=14, bevel=0.0, cap_material='dark')
    c, sn = math.cos(yaw), math.sin(yaw)
    for dy in (-0.1, 0.1):
        F.cylinder(s, f'{name}_Gun{dy}', (x + 0.2 * c - dy * sn, y + 0.2 * sn + dy * c, z + 0.25),
                   (x + 1.1 * c - dy * sn, y + 1.1 * sn + dy * c, z + 0.25), 0.05, material='dark',
                   segments=8, bevel=0.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- main hull: armoured box-section with a ram bow -------------------------------------------
    F.loft(s, 'Hull', HULL, material='paint', belly='paint2', back_material='dark', count=64, bevel=0.06)
    # gold bow band and stern band, slate hull courses
    F.band(s, 'Hull', (15.2, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.03, depth=0.04)
    F.band(s, 'Hull', (-17.6, 0, 0), (1, 0, 0), 0.6, 'stripe', inset=0.03, depth=0.04)
    F.band(s, 'Hull', (-17.0, 0, 0), (1, 0, 0), 0.25, 'paint2', inset=0.02, depth=0.03)
    # boot-top: a dark rub strake along the waterline of the hull flank
    for side in (1, -1):
        F.band(s, 'Hull', (0, 0, -0.35), (0, 0, 1), 0.35, 'dark', facing=(0, side, 0), min_facing=0.7,
               inset=0.02, depth=0.05)

    # --- armour deck on the spine ----------------------------------------------------------------
    deck = [(13.6, 1.1), (11.5, 2.5), (-16.2, 2.95), (-18.6, 2.3), (-18.6, -2.3), (-16.2, -2.95), (11.5, -2.5),
            (13.6, -1.1)]
    F.plate(s, 'Deck', deck, z0=1.95, thickness=0.6, material='paint', chamfer=0.25, side_material='paint',
            bevel=0.05)
    # raised steel armour plates between the turret barbettes
    F.panel(s, 'Deck', (8.2, 0.0), (0.9, 3.6), 'paint2', inset=0.04, depth=0.04)
    F.panel(s, 'Deck', (-14.0, 0.0), (0.8, 4.2), 'paint2', inset=0.04, depth=0.04)
    F.panel(s, 'Deck', (-17.6, 0.0), (1.2, 3.4), 'dark', inset=0.04, depth=-0.03)
    F.band(s, 'Deck', (0, 2.55, 0), (0, 1, 0), 0.16, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.band(s, 'Deck', (0, -2.55, 0), (0, 1, 0), 0.16, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    # forecastle: raised armour wedge over the bow in front of turret one
    F.plate(s, 'Forecastle', [(18.6, 0.35), (14.0, 1.6), (12.6, 1.5), (12.6, -1.5), (14.0, -1.6), (18.6, -0.35)],
            z0=1.1, thickness=1.05, material='paint2', chamfer=0.35, side_material='paint', bevel=0.05)
    F.band(s, 'Forecastle', (16.3, 0, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1))

    # --- sponson gun decks: narrow forward deck, wider aft deck ----------------------------------
    sponson = [(9.5, 3.4), (7.2, 5.1), (-3.2, 5.1), (-4.6, 6.0), (-15.4, 6.0), (-16.9, 5.2), (-16.9, 3.4)]
    F.plate(s, 'Sponson', sponson, z0=-0.55, thickness=1.75, material='paint', chamfer=0.4, chamfer_bottom=0.25,
            side_material='paint', mirror=True, bevel=0.06)
    F.band(s, 'Sponson', (0, 4.75, 0), (0, 1, 0), 0.2, 'stripe', facing=(0, 0, 1), min_facing=0.2, mirror=True)
    F.band(s, 'Sponson', (-3.9, 0, 0), (1, -0.9, 0), 0.3, 'stripe', facing=(0, 0, 1), mirror=True)
    # armour belts: raised slate plates on the sponson tops between the turrets
    F.panel(s, 'Sponson', (2.2, 4.3), (2.0, 1.2), 'paint2', inset=0.05, depth=0.05, mirror=True)
    F.panel(s, 'Sponson', (-9.4, 4.7), (1.9, 1.9), 'paint2', inset=0.05, depth=0.05, mirror=True)

    # --- main battery: four triple turrets on the spine ------------------------------------------
    zdeck = 2.55
    turret(s, 'T1', 10.4, 0.0, zdeck, 1.1)
    # T2 superfires over T1 from a raised barbette
    F.plate(s, 'T2Tower', [(7.9, 1.2), (6.9, 1.7), (4.4, 1.7), (4.1, 1.2), (4.1, -1.2), (4.4, -1.7), (6.9, -1.7),
                           (7.9, -1.2)], z0=2.4, thickness=1.2, material='paint', chamfer=0.25, bevel=0.04)
    turret(s, 'T2', 6.0, 0.0, zdeck + 1.1, 1.1)
    # aft pair faces aft; T3 superfires over T4
    F.plate(s, 'T3Tower', [(-9.8, 1.2), (-10.2, 1.7), (-12.8, 1.7), (-13.6, 1.2), (-13.6, -1.2), (-12.8, -1.7),
                           (-10.2, -1.7), (-9.8, -1.2)], z0=2.4, thickness=1.2, material='paint', chamfer=0.25,
            bevel=0.04)
    turret(s, 'T3', -11.8, 0.0, zdeck + 1.1, 1.1, yaw=math.pi)
    turret(s, 'T4', -15.6, 0.0, zdeck, 0.9, yaw=math.pi, rangefinder=False)

    # --- secondary battery: twin turrets on the sponsons -----------------------------------------
    sponson_top = 1.2
    for side in (1, -1):
        sd = 'P' if side > 0 else 'S'
        turret(s, f'S1{sd}', 5.3, side * 4.25, sponson_top, 0.52, barrels=2, rangefinder=False)
        turret(s, f'S2{sd}', 0.2, side * 4.3, sponson_top, 0.52, barrels=2, rangefinder=False)
        turret(s, f'S3{sd}', -6.8, side * 4.95, sponson_top, 0.58, barrels=2, rangefinder=False)
        sec = turret(s, f'S4{sd}', -12.0, side * 4.95, sponson_top, 0.58, barrels=2, rangefinder=False)
        if side > 0:
            s.hook_part('HOOK_SECONDARY_TURRET', *sec)

    # --- bridge tower: stepped, aft of centre ----------------------------------------------------
    F.plate(s, 'Bridge1', [(-0.6, 1.4), (-1.6, 2.3), (-8.4, 2.3), (-8.4, -2.3), (-1.6, -2.3), (-0.6, -1.4)],
            z0=2.3, thickness=1.6, material='paint', chamfer=0.3, side_material='paint', bevel=0.05)
    F.band(s, 'Bridge1', (-4.5, 0, 0), (1, 0, 0), 0.22, 'stripe', facing=(0, 0, 1))
    F.plate(s, 'Bridge2', [(-1.7, 1.1), (-2.5, 1.8), (-7.8, 1.8), (-7.8, -1.8), (-2.5, -1.8), (-1.7, -1.1)],
            z0=3.75, thickness=1.35, material='paint2', chamfer=0.25, side_material='paint2', bevel=0.05)
    F.plate(s, 'Bridge3', [(-2.7, 0.9), (-3.2, 2.7), (-4.4, 2.7), (-4.9, 1.2), (-7.3, 1.2), (-7.3, -1.2),
                           (-4.9, -1.2), (-4.4, -2.7), (-3.2, -2.7), (-2.7, -0.9)],
            z0=4.95, thickness=0.85, material='paint', chamfer=0.18, side_material='paint', bevel=0.04)
    F.band(s, 'Bridge3', (-3.8, 0, 0), (1, 0, 0), 0.2, 'stripe', facing=(0, 0, 1))
    F.box(s, 'MastHouse', (-5.9, 0.0, 6.1), (2.0, 1.4, 0.9), material='paint2', bevel=0.04, taper=0.85)

    # lit windows: bridge glazing on each tier's forward shoulders and roof, portholes on the flanks
    F.windows(s, 'BridgeGlaze', -3.05, -3.05, 0.0, 5.62, 1, size=(0.3, 1.6), normal='z')
    F.windows(s, 'BridgeWing', -3.8, -3.8, 2.1, 5.62, 1, size=(0.6, 0.9), normal='z', mirror=True)
    F.windows(s, 'Bridge1Roof', -2.2, -7.9, 1.55, 3.92, 7, size=(0.36, 0.2), normal='z', mirror=True)
    F.windows(s, 'Bridge2Roof', -2.9, -7.4, 1.18, 5.12, 5, size=(0.34, 0.18), normal='z', mirror=True)
    F.windows(s, 'Bridge1Side', -1.8, -8.2, 2.32, 2.75, 9, size=(0.3, 0.2), mirror=True)
    F.windows(s, 'Bridge2Side', -2.7, -7.6, 1.82, 4.1, 7, size=(0.3, 0.2), mirror=True)
    # sponson portholes (two decks of them on the outer wall)
    for i, (x0, x1, yy, n) in enumerate(((7.0, -3.0, 5.12, 12), (-4.8, -15.2, 6.02, 13))):
        F.windows(s, f'SponWinA{i}', x0, x1, yy, -0.1, n, size=(0.3, 0.18), mirror=True)
        F.windows(s, f'SponWinB{i}', x0, x1, yy, 0.25, n, size=(0.3, 0.18), mirror=True)
    # forward hull flank portholes (ahead of the sponsons), set on the skin
    for i in range(9):
        x = 16.0 - i * 0.75
        for zw in (0.55, 1.05):
            yw = hull_y(x, zw)
            dw = (hull_at(x + 0.2)['w'] - hull_at(x - 0.2)['w']) / 0.4
            F.box(s, f'BowWin{i}_{zw}', (x, yw, zw), (0.3, 0.06, 0.18), material='glow_warm', bevel=0.0,
                  rot_z=math.atan(dw), mirror=True)

    # --- drives: three main bells + a pod drive in each sponson ---------------------------------
    F.box(s, 'DriveBlock', (-18.9, 0.0, 0.15), (1.2, 6.2, 3.2), material='gunmetal', bevel=0.05)
    F.nozzle(s, 'MainDrive', (-20.2, 0.0, 0.25), 1.2, 1.5, material='gunmetal', bell=1.15, segments=40)
    F.nozzle(s, 'SideDrive', (-20.0, 2.05, 0.25), 0.8, 1.3, material='gunmetal', bell=1.12, segments=32,
             mirror=True)
    F.nozzle(s, 'SponsonDrive', (-17.7, 4.7, 0.3), 0.55, 1.0, material='gunmetal', bell=1.12, mirror=True)
    F.box(s, 'SponsonDriveHouse', (-16.9, 4.7, 0.3), (0.8, 1.6, 1.3), material='gunmetal', bevel=0.03,
          mirror=True)
    F.cylinder(s, 'DriveRing', (-19.35, 0.0, 0.25), (-19.1, 0.0, 0.25), 1.5, material='stripe', segments=40,
               cap=False, bevel=0.0)
    s.hook('HOOK_DRIVE_CORE', (-20.1, 0.0, 0.25))

    # --- damage parts: sensor mast on the bridge, a port armour belt plate ----------------------
    mast = F.cylinder(s, 'Mast', (-5.9, 0.0, 6.4), (-5.9, 0.0, 8.6), 0.14, 0.08, material='gunmetal',
                      segments=10, bevel=0.0)
    yard = F.box(s, 'MastYard', (-5.9, 0.0, 7.7), (0.18, 2.6, 0.12), material='gunmetal', bevel=0.0)
    dome = F.cylinder(s, 'MastDome', (-5.9, 0.0, 8.5), (-5.9, 0.0, 8.95), 0.42, 0.3, material='paint2',
                      segments=16, bevel=0.0)
    tip = F.light(s, 'MastTip', (-5.9, 0.0, 9.0), 'glow_red', size=0.14)
    radar = F.box(s, 'Radar', (-5.4, 0.0, 6.75), (0.25, 1.9, 0.5), material='gunmetal', bevel=0.0)
    s.hook_part('HOOK_SENSOR_MAST', mast, yard, dome, tip, radar)
    belt = F.plate(s, 'ArmorBelt', [(-3.8, 5.25), (-4.9, 6.12), (-15.2, 6.12), (-15.2, 5.3)], z0=-0.2,
                   thickness=0.95, material='paint2', chamfer=0.12, bevel=0.03)
    s.hook_part('HOOK_ARMOR_PORT', belt)
    F.plate(s, 'ArmorBeltS', [(-3.8, -5.25), (-15.2, -5.3), (-15.2, -6.12), (-4.9, -6.12)], z0=-0.2,
            thickness=0.95, material='paint2', chamfer=0.12, bevel=0.03)

    # --- detail: VLS field, point defence, vents, rcs --------------------------------------------
    s.detail = 1
    for i in range(4):
        for j in range(2):
            x = 3.2 - i * 0.85
            y = (j - 0.5) * 1.5
            F.box(s, f'VLS{i}{j}', (x, y, 2.58), (0.7, 1.2, 0.08), material='dark', bevel=0.0)
            F.box(s, f'VLSLid{i}{j}', (x, y, 2.63), (0.56, 1.02, 0.06), material='gunmetal', bevel=0.0)
    for side in (1, -1):
        for x in (12.2, 8.3, -1.2, -9.6, -13.8):
            pd_mount(s, f'PD{x}{side}', x, side * 2.35 if x > 0 else side * 2.55, 2.6, yaw=side * 1.2)
        pd_mount(s, f'PDSp{side}', 8.2, side * 3.95, 1.25, yaw=side * 0.9)
        pd_mount(s, f'PDSa{side}', -3.1, side * 4.55, 1.25, yaw=side * 1.3)
    F.vent(s, 'DeckVent', (-9.3, 1.9, 2.56), (1.2, 0.6, 0.12), mirror=True)
    F.vent(s, 'SternVent', (-17.4, 1.3, 2.56), (1.0, 0.7, 0.12), mirror=True)
    F.vent(s, 'SponsonVent', (-14.9, 4.7, 1.22), (1.4, 1.2, 0.12), mirror=True, axis='y')
    # funnel-style heat stacks behind the bridge
    for side in (1, -1):
        F.box(s, f'HeatStack{side}', (-8.9, side * 1.0, 3.1), (0.9, 0.7, 1.6), material='gunmetal', bevel=0.02,
              taper=0.85)
        F.box(s, f'HeatStackCap{side}', (-8.9, side * 1.0, 3.92), (0.75, 0.55, 0.06), material='dark', bevel=0.0)
    F.rcs(s, 'RCSFwd', (8.2, 5.0, 0.5), size=0.5, mirror=True)
    F.rcs(s, 'RCSAft', (-16.0, 6.0, 0.5), size=0.5, mirror=True)
    F.rcs(s, 'RCSBow', (17.5, 1.75, 0.2), size=0.4, mirror=True)
    F.antenna(s, 'WhipA', (-7.2, 1.0, 5.8), 1.4, tip=None, mirror=True)
    s.detail = 0

    # --- lights ----------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-15.3, 6.1, 0.9), 'glow_red', size=0.3)
    F.light(s, 'NavStarboard', (-15.3, -6.1, 0.9), 'glow_green', size=0.3)
    F.light(s, 'NavBowP', (18.5, 0.45, 1.7), 'glow_red', size=0.18)
    F.light(s, 'NavBowS', (18.5, -0.45, 1.7), 'glow_green', size=0.18)
    F.light(s, 'Beacon', (-18.3, 0.0, 2.62), 'glow_amber', size=0.28)
    F.light(s, 'BeaconBridge', (-7.1, 0.0, 5.85), 'glow_amber', size=0.2)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
