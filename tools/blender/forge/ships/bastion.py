"""Bastion — tier-3 player corvette. "Slab-sided warship with twin turrets."

Plan read at the chase camera: a long armoured arrowhead built from stacked chamfered slabs — a dark
lower hull, heavy side armour belts, a slate deck with a sloped glacis, a raised citadel — carrying
two twin-barrel turrets forward (the second superfiring), a stepped bridge tower amidships, a missile
hatch grid aft and a heavy three-nozzle drive block. Warning-red bands mark the bow chevron, belts
and turret cheeks. Three values: slate, dark gunmetal hull, near-black machinery; red identity.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'bastion'
COLORS = {
    'paint': '#232b36',    # military slate (brief #39434f, authored darker: the key light lifts ~2.5x)
    'paint2': '#111418',   # dark hull slate
    'stripe': '#7a241c',   # warning red (brief #8a2a22)
    'hazard': '#7a241c',
    'dark': '#16191d',
}


def mirror_full(half):
    """Port-half outline (bow to stern, CCW from above) -> full closed outline mirrored to starboard."""
    return half + [(x, -y) for (x, y) in reversed(half) if abs(y) > 1e-6]


def turret(s, name, x, z, r=0.95, barrel=2.3):
    """Local helper: low round base ring, angular armoured gun house, twin barrels with muzzle brakes."""
    F.cylinder(s, name + 'Ring', (x, 0.0, z - 0.05), (x, 0.0, z + 0.2), r, material='gunmetal', segments=40,
               cap_material='dark')
    F.cylinder(s, name + 'Race', (x, 0.0, z + 0.2), (x, 0.0, z + 0.26), r * 0.86, material='dark', segments=40)
    house = [(x + 1.05, 0.55), (x + 0.45, 0.8), (x - 0.95, 0.8), (x - 1.15, 0.5), (x - 1.15, -0.5),
             (x - 0.95, -0.8), (x + 0.45, -0.8), (x + 1.05, -0.55)]
    F.plate(s, name + 'House', house, z0=z + 0.24, thickness=0.62, material='paint', chamfer=0.22,
            side_material='paint')
    F.band(s, name + 'House', (x - 0.3, 0.0, 0), (1, 0, 0), 0.22, 'stripe', inset=0.01, depth=0.015)
    F.box(s, name + 'Sight', (x - 0.45, 0.42, z + 0.95), (0.42, 0.24, 0.18), material='gunmetal', bevel=0.02)
    F.box(s, name + 'Mantlet', (x + 1.05, 0.0, z + 0.5), (0.3, 0.8, 0.4), material='gunmetal', bevel=0.03)
    for y in (0.22, -0.22):
        F.cylinder(s, f'{name}Barrel{y}', (x + 1.1, y, z + 0.52), (x + 1.1 + barrel, y, z + 0.52), 0.085,
                   material='gunmetal', segments=14)
        F.cylinder(s, f'{name}Sleeve{y}', (x + 1.1, y, z + 0.52), (x + 1.8, y, z + 0.52), 0.13, 0.11,
                   material='gunmetal', segments=14)
        F.cylinder(s, f'{name}Brake{y}', (x + 0.95 + barrel, y, z + 0.52), (x + 1.2 + barrel, y, z + 0.52), 0.12,
                   material='dark', segments=14)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- lower hull: dark slab with a sloped keel ------------------------------------------------
    lower = mirror_full([(10.2, 0.0), (6.0, 1.95), (-2.0, 3.0), (-8.8, 3.1), (-9.9, 2.5), (-9.9, 0.0)])
    F.plate(s, 'LowerHull', lower, z0=-1.1, thickness=1.15, material='paint2', chamfer=0.25, chamfer_bottom=0.55)
    # --- deck: slate armour with a sloped glacis, inset from the lower hull ----------------------
    deck = mirror_full([(9.6, 0.0), (5.6, 1.75), (-2.0, 2.7), (-8.0, 2.75), (-9.4, 1.9), (-9.4, 0.0)])
    F.plate(s, 'Deck', deck, z0=-0.05, thickness=0.85, material='paint', chamfer=0.45, side_material='paint')
    # bow chevron: two red bands meeting in a V on the glacis
    F.band(s, 'Deck', (7.4, 0.55, 0), (0.42, 0.91, 0), 0.34, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    F.band(s, 'Deck', (7.4, -0.55, 0), (0.42, -0.91, 0), 0.34, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    for y in (1.6, -1.6):
        F.panel(s, 'Deck', (-7.6, y), (1.6, 1.4), 'paint', inset=0.05, depth=0.05)
    F.band(s, 'Deck', (8.2, 0, 0), (1, 0, 0), 0.32, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    F.panel(s, 'Deck', (3.2, 0.0), (0.9, 1.6), 'dark', inset=0.04, depth=-0.04)
    for y in (1.3, -1.3):
        F.panel(s, 'Deck', (6.3, y * 0.75), (0.8, 0.5), 'paint', inset=0.04, depth=0.05)

    # --- heavy armour belts along the flanks: three raised slabs per side, dark gaps -------------
    belts = []
    for i, (xa, xb) in enumerate(((1.4, -2.2), (-2.5, -5.6), (-5.9, -8.9))):
        belt = F.plate(s, f'Belt{i}', [(xa, 2.62), (xa - 0.3, 3.35), (xb + 0.2, 3.4), (xb, 2.62)], z0=-0.55,
                       thickness=0.95, material='paint', chamfer=0.22, chamfer_bottom=0.25, mirror=True)
        belts.append(belt)
        F.band(s, f'Belt{i}', ((xa + xb) / 2, 3.0, 0), (1, 0, 0), 0.28, 'stripe', inset=0.01, depth=0.015,
               mirror=True)
    s.hook_part('HOOK_ARMOR_PORT', belts[1])

    # --- citadel: raised armoured superstructure --------------------------------------------------
    cit = mirror_full([(2.6, 0.0), (1.6, 1.25), (-6.4, 1.55), (-7.4, 1.1), (-7.4, 0.0)])
    F.plate(s, 'Citadel', cit, z0=0.7, thickness=0.75, material='paint', chamfer=0.3, side_material='paint2')
    # missile hatch grid aft of the bridge: 2 x 4 recessed dark cells
    for i in range(4):
        for y in (0.5, -0.5):
            F.panel(s, 'Citadel', (-5.0 - i * 0.55, y), (0.44, 0.7), 'dark', inset=0.03, depth=-0.05)

    # --- bridge tower: stepped block, lit window band facing forward ------------------------------
    F.plate(s, 'Bridge1', [(-1.2, 0.0), (-1.6, 1.0), (-4.2, 1.1), (-4.4, 0.0), (-4.2, -1.1), (-1.6, -1.0)],
            z0=1.4, thickness=0.8, material='paint', chamfer=0.2, side_material='paint2')
    F.plate(s, 'Bridge2', [(-2.05, 0.7), (-3.8, 0.75), (-3.9, 0.0), (-3.8, -0.75), (-2.05, -0.7)],
            z0=2.15, thickness=0.6, material='paint', chamfer=0.16, side_material='paint2')
    # lit bridge glazing wrapped round the forward faces of the upper block
    F.band(s, 'Bridge2', (-2.3, 0, 2.42), (0, 0, 1), 0.2, 'glow_warm', facing=(1, 0, 0), min_facing=0.7)
    F.windows(s, 'TowerWin', -3.9, -1.9, 1.03, 1.85, 4, size=(0.3, 0.14), finish='glow_warm', mirror=True)

    # sensor mast on the bridge roof (sensor damage part)
    mast = F.cylinder(s, 'Mast', (-3.2, 0.0, 2.7), (-3.2, 0.0, 3.9), 0.07, 0.04, material='gunmetal', segments=10)
    yard = F.box(s, 'MastYard', (-3.2, 0.0, 3.45), (0.12, 1.3, 0.08), material='gunmetal', bevel=0.0)
    radar = F.box(s, 'MastRadar', (-3.2, 0.0, 3.2), (0.18, 0.9, 0.34), material='dark', bevel=0.02)
    beacon = F.light(s, 'Beacon', (-3.2, 0.0, 3.93), 'glow_amber', size=0.14)
    s.hook_part('HOOK_SENSOR_MAST', mast, yard, radar, beacon)

    # --- turrets: A on the deck, B superfiring from the citadel ----------------------------------
    turret(s, 'TurretA', 5.0, 0.8, r=0.95, barrel=2.4)
    turret(s, 'TurretB', 1.4, 1.45, r=0.95, barrel=2.3)
    F.cylinder(s, 'TurretBBarbette', (1.4, 0.0, 0.7), (1.4, 0.0, 1.46), 1.0, material='paint2', segments=40)

    # --- broadside casemates: one gun each side ----------------------------------------------------
    F.box(s, 'Casemate', (-0.4, 3.35, 0.05), (1.3, 0.7, 0.7), material='paint2', bevel=0.05, mirror=True, taper=0.85)
    F.cylinder(s, 'CasemateGun', (-0.4, 3.6, 0.1), (-0.4, 4.3, 0.1), 0.1, material='gunmetal', segments=12,
               mirror=True, cap_material='dark')

    # --- drive block: three torch nozzles in an armoured frame -------------------------------------
    F.box(s, 'DriveBlock', (-9.6, 0.0, -0.1), (1.2, 4.2, 1.5), material='gunmetal', bevel=0.05)
    for y, r in ((1.35, 0.72), (-1.35, 0.72), (0.0, 0.55)):
        F.nozzle(s, f'Nozzle{y}', (-10.9, y, -0.1 if y else 0.25), r, 0.95, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-10.8, 0.0, -0.1))

    # --- detail --------------------------------------------------------------------------------------
    s.detail = 1
    F.vent(s, 'DeckVent', (-8.3, 0.0, 0.84), (0.9, 1.4, 0.1), slats=6, axis='y')
    for y in (1.9, -1.9):
        F.sensor_dome(s, f'PDDome{y}', (-4.6, y, 0.8), 0.3, lens='glow_red')
    F.rcs(s, 'RCSFwd', (5.2, 1.85, 0.0), size=0.34, mirror=True)
    F.rcs(s, 'RCSAft', (-8.8, 3.1, 0.55), size=0.34, mirror=True)
    F.antenna(s, 'Whip', (-6.8, 0.8, 1.45), 1.0, tip='glow_red')
    F.box(s, 'BowSensor', (9.2, 0.0, 0.25), (0.8, 0.5, 0.2), material='dark', bevel=0.02)
    s.detail = 0

    # --- lights --------------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-8.4, 3.42, 0.3), 'glow_red', size=0.18)
    F.light(s, 'NavStarboard', (-8.4, -3.42, 0.3), 'glow_green', size=0.18)
    F.light(s, 'BowLight', (9.75, 0.0, 0.6), 'glow_amber', size=0.12)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
