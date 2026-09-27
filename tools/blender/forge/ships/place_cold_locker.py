"""Cold locker — the tall vacuum-insulated storage rack at the Helios bays.
Forge rebuild of place_cold_locker.glb (same file, same asset id).

Idea: "a filing cabinet for frozen cargo". A tall lattice tower of locked cryo drawers —
drawer faces with handle bars and frost-pale seals — standing in a diagonal lattice frame,
footed by a bond ring where the bay's tie-downs catch it. A service run of status lamps.
Three values: pale insulated cabinet skin, charcoal lattice, dark drawer recesses. Identity
colour: cold cyan seals and status lights. Lights: a vertical run of small cyan status
lamps, one amber service lamp at the head.
Live bounds (Blender): x [-3.1, 3.1], y [-3.1, 3.1], z [-0.8, 20.1].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_cold_locker'
COLORS = {
    'paint': '#7e8078',       # cold pale cabinet coat
    'paint2': '#33383e',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#0e1216',
    'ceramic': '#9aa6a8',     # frost seals
    'hazard': '#9a7a1e',
    'glow_cyan': '#6ee7e0',
    'glow_amber': '#ffb345',
}

DRAWERS = 9   # drawer tiers up the tower
DZ = 2.0      # tier pitch


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    top = 0.8 + DRAWERS * DZ

    # corner posts and the diagonal lattice frame
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Post{sx}{sy}', (sx * 2.3, sy * 2.3, top / 2 + 0.4), (0.55, 0.55, top + 1.2),
                  material='gunmetal', bevel=0.04)
    # X-brace lattice across both broad faces, one cross per tier
    for i in range(DRAWERS):
        z0, z1 = 0.8 + i * DZ, 0.8 + (i + 1) * DZ
        F.beams(s, f'XBrN{i}', [((-2.3, -2.3, z0), (2.3, -2.3, z1)),
                                ((2.3, -2.3, z0), (-2.3, -2.3, z1))], 0.14, material='gunmetal')
        F.beams(s, f'XBrS{i}', [((-2.3, 2.3, z0), (2.3, 2.3, z1)),
                                ((2.3, 2.3, z0), (-2.3, 2.3, z1))], 0.14, material='gunmetal')

    # the drawers: proud faces with handle bars and frost seals, alternating side bias
    for i in range(DRAWERS):
        z = 0.8 + i * DZ + DZ / 2
        e = 1 if i % 2 == 0 else -1
        F.box(s, f'Drawer{i}', (e * 0.25, -2.05, z), (4.0, 0.5, 1.5), material='paint',
              bevel=0.05)
        F.box(s, f'DrawerSeal{i}', (e * 0.25, -2.24, z), (3.7, 0.12, 1.1), material='ceramic',
              bevel=0.02)
        F.box(s, f'DrawerHandle{i}', (e * 0.25, -2.42, z + 0.45), (1.4, 0.12, 0.22),
              material='gunmetal', bevel=0.02)
        # lock tab
        F.box(s, f'DrawerLock{i}', (e * 1.8, -2.3, z), (0.35, 0.16, 0.5), material='hazard',
              bevel=0.02)
        # per-tier status lamp
        F.light(s, f'Status{i}', (e * -1.7, -2.3, z + 0.5), 'glow_cyan', size=0.1)

    # inner body behind the drawer faces
    F.box(s, 'Carcass', (0, 0.4, top / 2 + 0.4), (4.2, 3.8, top), material='dark', bevel=0.05)

    # head cabinet and bond ring foot
    F.box(s, 'Head', (0, 0.2, top + 1.0), (4.8, 4.6, 1.4), material='paint2', bevel=0.15)
    F.band(s, 'Head', (0, 0.2, top + 1.2), (0, 0, 1), 0.5, 'stripe', depth=0.06)
    F.light(s, 'HeadLamp', (0, -2.0, top + 1.1), 'glow_amber', size=0.3)
    F.cylinder(s, 'HeadVent', (0, 0.2, top + 1.7), (0, 0.2, top + 2.3), 0.5, material='gunmetal',
               segments=10, bevel=0.04)
    F.ring(s, 'BondRing', (0, 0, 0.2), 3.0, 0.4, axis=(0, 0, 1), material='paint2',
           segments=16, sides=8)
    for i in range(4):
        a = math.radians(45 + i * 90)
        F.box(s, f'BondTab{i}', (2.9 * math.cos(a), 2.9 * math.sin(a), 0.35),
              (0.5, 0.5, 0.7), material='hazard', bevel=0.04, rot_z=a)
    F.box(s, 'Base', (0, 0, -0.1), (4.6, 4.6, 1.2), material='paint2', bevel=0.08)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
