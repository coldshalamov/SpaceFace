"""Survey Pin — Work fleet surveyor. A sensor mast ship.

Plan read at the chase camera: a pin — a long survey boom banded orange and ivory like a surveyor's
rod runs far ahead of a slim hull and ends in a tilted dish; a big ivory radome sits on the back, a
pair of flat phased-array panels cross the hull like a plumb-bob's arms, and an antenna farm bristles
aft. Service orange, instrument ivory, dark machinery, cyan sensor lenses.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'survey_pin'
COLORS = {
    'paint': '#7a381a',    # service orange (Helios key light lifts values ~2.5x: author dark)
    'paint2': '#7f7a70',   # instrument ivory
    'stripe': '#2a2c30',
    'hazard': '#c8901e',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Slim hull ------------------------------------------------------------------------------------
    F.loft(s, 'Hull', [
        dict(x=-9.5, w=1.15, ht=0.9, hb=0.85, zc=0.0, n=2.6),
        dict(x=-8.7, w=1.5, ht=1.2, hb=1.05, zc=0.0, n=2.8),
        dict(x=-1.0, w=1.7, ht=1.3, hb=1.15, zc=0.0, n=2.8),
        dict(x=2.5, w=1.45, ht=1.1, hb=1.0, zc=0.0, n=2.6),
        dict(x=4.3, w=0.9, ht=0.72, hb=0.7, zc=0.05, n=2.4),
        dict(x=5.0, w=0.42, ht=0.36, hb=0.36, zc=0.1, n=2.2),
    ], material='paint', belly='stripe', back_material='dark', count=56)
    # ivory instrument saddle down the spine, dark access plate aft
    F.band(s, 'Hull', (0, 0, 0), (0, 1, 0), 1.3, 'paint2', facing=(0, 0, 1), min_facing=0.55, inset=0.03, depth=0.03)
    F.band(s, 'Hull', (-7.9, 0, 0), (1, 0, 0), 0.45, 'paint2', inset=0.02, depth=0.02)
    # Identity trim, lit: a thin cyan ring round the hull just aft of the canopy, and one ahead of the
    # dome plinth, so the slim hull reads as lit bars from the chase tilt (LOOK.md: lamps are light).
    for x in (0.8, -5.3):
        F.band(s, 'Hull', (x, 0, 0), (1, 0, 0), 0.16, 'glow_cyan', inset=0.01, depth=-0.02)
    F.canopy(s, 'Canopy', x0=1.2, x1=3.7, w=0.72, h=0.5, z=0.92, peak=0.45, n=2.4)
    F.windows(s, 'HullWin', -1.6, 0.4, 1.66, 0.35, 3, size=(0.55, 0.3), mirror=True)
    # instrument bays: dark recessed strips along the shoulders ahead of the arrays
    for side in (1, -1):
        F.panel(s, 'Hull', (0.2, 1.05 * side), (3.0, 0.42), 'dark', inset=0.03, depth=-0.05)

    # --- Survey boom: a banded rod far ahead of the nose ------------------------------------------
    F.loft(s, 'Boom', [
        dict(x=3.8, w=0.46, ht=0.42, hb=0.42, zc=0.2, n=3.0),
        dict(x=5.0, w=0.4, ht=0.36, hb=0.36, zc=0.2, n=3.0),
        dict(x=9.8, w=0.3, ht=0.28, hb=0.28, zc=0.2, n=3.0),
        dict(x=10.1, w=0.26, ht=0.24, hb=0.24, zc=0.2, n=2.6),
    ], material='paint2', count=24)
    for i, x in enumerate((5.6, 7.0, 8.4)):
        F.band(s, 'Boom', (x, 0, 0.2), (1, 0, 0), 0.7, 'paint', inset=0.01, depth=0.01)
    F.cylinder(s, 'BoomCollar', (3.9, 0, 0.2), (4.6, 0, 0.2), 0.6, 0.56, material='stripe', segments=28)
    # Identity trim, lit: a thin cyan ring (the ship's own lens colour; yellow washed out on the orange) round the dark boom collar where the rod leaves the hull
    F.band(s, 'BoomCollar', (4.25, 0, 0.2), (1, 0, 0), 0.16, 'glow_cyan', inset=0.01, depth=-0.02)
    # bracing struts from the hull shoulders to the boom
    F.cylinder(s, 'BoomStrut', (2.2, 1.2, 0.2), (6.3, 0.22, 0.2), 0.09, material='gunmetal', segments=12,
               mirror=True)
    # head: sensor pod and a dish tilted up at the sky
    F.cylinder(s, 'HeadPod', (9.7, 0, 0.2), (10.9, 0, 0.2), 0.42, 0.34, material='paint', segments=28,
               cap_material='stripe')
    F.cylinder(s, 'DishNeck', (10.3, 0, 0.5), (10.3, 0, 0.95), 0.12, material='gunmetal', segments=12)
    F.cylinder(s, 'Dish', (10.15, 0, 0.9), (10.55, 0, 1.3), 0.25, 1.4, material='paint2', segments=44,
               cap_material='gunmetal')
    F.cylinder(s, 'DishHub', (10.5, 0, 1.25), (10.62, 0, 1.37), 0.36, material='paint', segments=20)
    F.cylinder(s, 'DishFeed', (10.6, 0, 1.35), (11.1, 0, 1.85), 0.05, material='gunmetal', segments=8)
    F.light(s, 'DishFeedLens', (11.13, 0, 1.88), 'glow_cyan', size=0.16)
    F.light(s, 'HeadLens', (10.95, 0, 0.2), 'glow_cyan', size=0.26)

    # --- Big radome on the back -------------------------------------------------------------------
    F.cylinder(s, 'DomePlinth', (-3.4, 0, 0.9), (-3.4, 0, 1.55), 1.55, 1.45, material='gunmetal', segments=40)
    # ...and a lit yellow ring round the gunmetal plinth under the radome, the ship's centre read
    F.band(s, 'DomePlinth', (-3.4, 0, 1.2), (0, 0, 1), 0.16, 'glow_cyan', inset=0.01, depth=-0.02)
    F.sensor_dome(s, 'Dome', (-3.4, 0.0, 1.5), 1.9, material='paint2', lens=None)
    F.band(s, 'Dome', (-3.4, 0, 0), (1, 0, 0), 0.4, 'paint', inset=0.02, depth=0.02)
    F.light(s, 'DomeLens', (-2.2, 0.0, 2.55), 'glow_cyan', size=0.3)

    # --- Phased-array panels crossing the hull ---------------------------------------------------------
    arr = [(-4.8, 1.3), (-1.3, 1.3), (-1.8, 4.0), (-4.3, 4.0)]
    F.plate(s, 'Array', arr, z0=0.05, thickness=0.18, material='paint2', chamfer=0.08, mirror=True)
    for i, (cx, cy) in enumerate(((-3.8, 2.35), (-2.6, 2.35), (-3.55, 3.4), (-2.55, 3.4))):
        F.panel(s, 'Array', (cx, cy), (0.95, 0.85), 'dark', inset=0.04, depth=-0.04, mirror=True)
    F.box(s, 'ArrayRoot', (-3.05, 1.55, 0.14), (3.2, 0.6, 0.42), material='gunmetal', bevel=0.03, mirror=True)
    # ...and a lit line along each gunmetal array root, the plumb-bob's crossbar (LOOK.md: lamps are light)
    F.band(s, 'ArrayRoot', (-3.05, 1.55, 0.14), (0, 1, 0), 0.1, 'glow_cyan', facing=(0, 0, 1), min_facing=0.5,
           mirror=True, inset=0.004, depth=-0.01)
    F.box(s, 'ArrayTipRail', (-3.05, 4.0, 0.14), (2.6, 0.14, 0.3), material='paint', bevel=0.02, mirror=True)

    # --- Drive ---------------------------------------------------------------------------------------
    F.nozzle(s, 'Nozzle', (-10.35, 0.0, 0.0), 0.8, 1.2, material='gunmetal', bell=1.2)
    F.nozzle(s, 'Vernier', (-9.9, 1.05, 0.0), 0.32, 0.6, material='gunmetal', mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-10.3, 0.0, 0.0))

    # --- Antenna farm aft, lens row, details --------------------------------------------------------
    s.detail = 1
    farm = (((-6.2, 0.55), 2.2, 'glow_red'), ((-6.9, -0.5), 1.6, 'glow_cyan'), ((-7.5, 0.4), 1.2, None),
            ((-5.7, -0.7), 1.4, 'glow_cyan'), ((-8.1, -0.2), 0.9, None), ((-6.6, 0.0), 2.8, 'glow_red'))
    for i, ((x, y), h, tip) in enumerate(farm):
        F.antenna(s, f'Farm{i}', (x, y, 1.36), h, tip=tip)
    # yagi cross-arms on the tall mast: reads as an antenna even from straight above
    for i, (z, L) in enumerate(((1.36 + 1.7, 1.7), (1.36 + 2.2, 1.3), (1.36 + 2.6, 0.9))):
        F.box(s, f'Yagi{i}', (-6.6, 0.0, z), (0.07, L, 0.07), material='gunmetal', bevel=0.0)
        F.light(s, f'YagiTip{i}', (-6.6, L / 2, z), 'glow_cyan', size=0.08, mirror=True)
    F.cylinder(s, 'FarmDishPost', (-7.9, 0.75, 1.1), (-7.9, 0.75, 1.75), 0.06, material='gunmetal', segments=8)
    F.cylinder(s, 'FarmDish', (-7.95, 0.75, 1.7), (-7.75, 0.75, 1.9), 0.08, 0.5, material='paint2', segments=24)
    F.box(s, 'FarmDeck', (-6.8, 0.0, 1.3), (3.2, 1.6, 0.14), material='gunmetal', bevel=0.02)
    F.rcs(s, 'RCS', (-8.3, 1.45, 0.3), size=0.34, mirror=True)
    F.vent(s, 'Vent', (0.2, 0.0, 1.32), (1.0, 0.9, 0.1), slats=5)
    s.detail = 0

    F.light(s, 'NavPort', (-3.05, 4.1, 0.15), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (-3.05, -4.1, 0.15), 'glow_green', size=0.2)
    F.light(s, 'Beacon', (-8.9, 0.0, 1.2), 'glow_amber', size=0.22)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
