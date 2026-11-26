"""Free Frontier faction station kit — row 512. The patch-quilt claim: mismatched welded
patch plates in homestead browns and salvage tones riveted round the band, lash trusses,
warm porch lamps and a cyan edge — a station that was built, not issued."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_frontier_v01'
COLORS = {
    'paint': '#6a5a44',            # homestead brown
    'paint2': '#4a4438',
    'paint.patch': '#7a6a52',      # salvage tan
    'paint.rust': '#5e4a38',       # weathered rust-brown
    'stripe': '#2a8a9c',           # frontier cyan #4ECBE0, authored dark
    'gunmetal': '#46403a',
    'dark': '#17140f',
    'glow_cyan.free': '#4ecbe0',
    'glow_warm': '#ffc27a',
}


def signature(s):
    """Frontier towers inside the ring: boxy homestead stacks with roof tanks and porch lamps."""
    towers, roofs, tanks, lamps = [], [], [], []
    for a in (60.0, 180.0, 300.0):
        rz = math.radians(a)
        x, y, _ = K.polar(24.0, a)
        towers.append(((x, y, 13.0), (7.0, 8.0, 18.0), rz))
        roofs.append(((x, y, 22.5), (8.0, 9.0, 1.0), rz))
        tanks.append(K.polar(24.0, a, 25.5))
        lamps.append(K.polar(28.4, a, 18.0))
    F.boxes(s, 'FrontierTowers', towers, 'paint.patch', bevel=0.1)
    F.boxes(s, 'FrontierRoofs', roofs, 'paint.rust', bevel=0.05)
    for i, p in enumerate(tanks):
        F.cylinder(s, f'FrontierTank{i}', (p[0], p[1], p[2] - 2.5), (p[0], p[1], p[2] + 2.5),
                   2.0, 1.8, material='paint', segments=12, bevel=0.06)
        F.band(s, f'FrontierTank{i}', (p[0], p[1], p[2]), (0, 0, 1), 0.8, 'stripe')
    s.detail = 1
    for i, p in enumerate(lamps):
        F.light(s, f'FrontierTowerLamp{i}', p, 'glow_warm', size=0.45)
    s.detail = 0


def dress(s):
    K.interior(s, 'stripe', 'glow_warm')
    # welded claim band in bare structure, then the quilt over it
    K.ring_wall(s, 'QuiltBand', K.SHELL_R + 0.7, 9.0, 25.0, 2.0, 'paint2', segs=56)
    K.ring_wall(s, 'QuiltRail', K.SHELL_R + 1.0, 25.0, 26.0, 2.4, 'stripe', segs=56)
    # the patch-quilt: deterministic mismatched plates — every panel a different salvage lot
    s.detail = 1
    K.patch_row(s, 'Quilt', 4.0, 30, 12.0, K.SHELL_R + 1.1, 11.0, 22.0,
                ['paint', 'paint.patch', 'paint.rust', 'paint2'], seed=3)
    s.detail = 0
    # lash trusses — leaning braces holding the lean-to roofline over the band
    for i, a in enumerate((20.0, 110.0, 200.0, 290.0)):
        p0 = K.polar(K.SHELL_R + 0.5, a, 26.0)
        p1 = K.polar(K.SHELL_R + 6.0, a + 14.0, 34.0)
        F.truss(s, f'Lash{i}', p0, p1, 1.2, 5, material='gunmetal', chord=0.2, web=0.12)
        F.box(s, f'Lash{i}Roof', K.polar(K.SHELL_R + 5.2, a + 8.0, 34.6), (1.0, 9.0, 5.0),
              material='paint.patch', rot_z=math.radians(a + 8.0), bevel=0.06)
    # homestead crown: a strapped tank + porch lamps — the barn roof of the station
    F.cylinder(s, 'CrownTank', (0.0, 0.0, 35.0), (0.0, 0.0, 41.0), 4.5, 4.0, material='paint',
               segments=20, bevel=0.1)
    F.band(s, 'CrownTank', (0.0, 0.0, 38.5), (0, 0, 1), 0.9, 'stripe')
    for i in range(4):
        a = 45.0 + i * 90.0
        F.beams(s, f'TankStrap{i}', [(K.polar(4.6, a, 35.0), K.polar(4.2, a, 41.0))], 0.4,
                material='dark')
    # warm porch lamps + sparse cyan claim lights — the lights say someone lives here
    s.detail = 1
    K.lamp_ring(s, 'Porch', 'glow_warm', r=K.SHELL_R + 1.6, z=7.0, count=18, size=0.45)
    for i, a in enumerate((0.0, 90.0, 180.0, 270.0)):
        F.light(s, f'ClaimLamp{i}', K.polar(K.SHELL_R + 2.0, a, 27.4), 'glow_cyan.free',
                size=0.5)
    s.detail = 0
    signature(s)


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
