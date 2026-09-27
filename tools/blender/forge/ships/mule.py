"""Mule — tier-1 player freighter. A pack mule with saddlebags.

Plan read at the chase camera: a narrow olive spine with a blunt cab out front, and two big ribbed
cargo saddle-pods slung either side of it on straps that run over the spine. Cream lids, hazard
corners, a rear-facing gun over the one big drive. Blunt, square and dependable.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'mule'
COLORS = {
    'paint': '#3e4429',    # olive drab (#5b6340 as seen under the key light)
    'paint2': '#958b6f',   # cream
    'stripe': '#958b6f',
    'hazard': '#b88a22',
    'dark': '#131416',
}

PY = 2.25          # saddle-pod centre line
POD_X0, POD_X1 = -5.0, 3.5
POD_W, POD_H = 1.95, 2.0
RIBS = (-3.1, -0.75, 1.6)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Spine and blunt cab ------------------------------------------------------------------
    F.loft(s, 'Spine', [
        dict(x=-7.0, w=0.8, ht=0.8, hb=0.8, zc=0.1, n=3.0),
        dict(x=-6.3, w=1.0, ht=1.0, hb=0.95, zc=0.1, n=3.2),
        dict(x=3.2, w=1.0, ht=1.0, hb=0.95, zc=0.1, n=3.2),
        dict(x=3.9, w=0.95, ht=0.95, hb=0.9, zc=0.15, n=3.2),
    ], material='paint', back_material='dark', count=48)
    F.band(s, 'Spine', (0, 0, 0), (0, 1, 0), 0.34, 'stripe', facing=(0, 0, 1), min_facing=0.6)
    F.loft(s, 'Cab', [
        dict(x=3.4, w=1.0, ht=1.0, hb=0.9, zc=0.3, n=3.0),
        dict(x=5.0, w=1.45, ht=1.3, hb=1.0, zc=0.35, n=3.2),
        dict(x=6.8, w=1.4, ht=1.15, hb=0.95, zc=0.3, n=3.2),
        dict(x=7.5, w=1.15, ht=0.85, hb=0.75, zc=0.25, n=2.8),
        dict(x=7.8, w=0.8, ht=0.5, hb=0.5, zc=0.2, n=2.4),
    ], material='paint', belly='gunmetal', count=64)
    F.band(s, 'Cab', (4.4, 0, 0), (1, 0, 0), 0.5, 'paint2', inset=0.02, depth=0.02)
    F.panel(s, 'Cab', (5.6, 0.0), (1.0, 1.6), 'paint2', inset=0.04, depth=0.03)
    F.canopy(s, 'Canopy', x0=5.9, x1=7.35, w=1.05, h=0.38, z=1.12, peak=0.3, n=2.8)
    F.windows(s, 'CabWin', 4.9, 6.7, 1.44, 0.95, 3, size=(0.36, 0.2), mirror=True)
    F.box(s, 'Bumper', (7.8, 0.0, -0.05), (0.4, 1.9, 0.5), material='gunmetal', bevel=0.05)
    F.band(s, 'Bumper', (7.8, 0.35, 0), (0, 1, 0), 0.3, 'hazard')
    F.band(s, 'Bumper', (7.8, -0.35, 0), (0, 1, 0), 0.3, 'hazard')

    # --- Saddle pods --------------------------------------------------------------------------
    cx = (POD_X0 + POD_X1) / 2
    F.box(s, 'Pod', (cx, PY, 0.0), (POD_X1 - POD_X0, POD_W, POD_H), material='paint', bevel=0.12, mirror=True)
    # Cream lids in the bays between ribs.
    bays = [(POD_X0 + 0.15, RIBS[0] - 0.15), (RIBS[0] + 0.15, RIBS[1] - 0.15), (RIBS[1] + 0.15, RIBS[2] - 0.15),
            (RIBS[2] + 0.15, POD_X1 - 0.15)]
    for (a, b) in bays[1:3]:
        F.panel(s, 'Pod', ((a + b) / 2, PY), (b - a - 0.2, 1.45), 'paint2', inset=0.05, depth=0.04, mirror=True)
    for (a, b) in (bays[0], bays[3]):
        F.panel(s, 'Pod', ((a + b) / 2, PY - 0.25), (b - a - 0.3, 0.9), 'paint2', inset=0.05, depth=0.04, mirror=True)
    # Ribs and end frames: the container read.
    for i, x in enumerate(RIBS):
        F.box(s, f'Rib{i}', (x, PY, 0.0), (0.16, POD_W + 0.08, POD_H + 0.06), material='gunmetal', bevel=0.02,
              mirror=True)
    for e, x in (('Aft', POD_X0 + 0.06), ('Fwd', POD_X1 - 0.06)):
        F.box(s, f'EndFrame{e}', (x, PY, 0.0), (0.2, POD_W + 0.1, POD_H + 0.1), material='dark', bevel=0.02,
              mirror=True)
    # Hazard corner caps on the four outboard corners, with dark chevrons cut across them.
    for tag, x0, sx in (('Fwd', POD_X1, -1), ('Aft', POD_X0, 1)):
        yo = PY + POD_W / 2 + 0.03
        L = [(x0, yo), (x0 + sx * 1.1, yo), (x0 + sx * 1.1, yo - 0.34), (x0 + sx * 0.34, yo - 0.34),
             (x0 + sx * 0.34, yo - 0.95), (x0, yo - 0.95)]
        if sx < 0:
            L = list(reversed(L))
        F.plate(s, f'Haz{tag}', L, z0=POD_H / 2 - 0.02, thickness=0.1, material='hazard', chamfer=0.02, mirror=True)
        F.band(s, f'Haz{tag}', (x0 + sx * 0.55, yo - 0.3, 0), (-sx * 0.707, 0.707, 0), 0.14, 'dark',
               facing=(0, 0, 1), mirror=True)

    # Saddle straps over the spine and yokes underneath: the pods hang on the spine.
    for i, x in enumerate(RIBS):
        F.box(s, f'Strap{i}', (x, 0.0, 1.12), (0.34, 2 * PY, 0.2), material='gunmetal', bevel=0.03)
        F.box(s, f'Buckle{i}', (x, 0.0, 1.24), (0.5, 0.5, 0.12), material='paint2', bevel=0.02)
        F.box(s, f'Yoke{i}', (x, 0.0, -0.2), (0.5, 2 * PY - 0.6, 0.8), material='gunmetal', bevel=0.04)

    # --- Drives -------------------------------------------------------------------------------
    F.cylinder(s, 'DriveCollar', (-7.3, 0.0, 0.1), (-6.2, 0.0, 0.1), 0.95, material='gunmetal', segments=40,
               cap_material='dark')
    F.nozzle(s, 'MainNozzle', (-8.1, 0.0, 0.1), 0.85, 0.9, material='gunmetal', segments=40)
    s.hook('HOOK_DRIVE_CORE', (-8.2, 0.0, 0.1))
    F.nozzle(s, 'PodNozzle', (-5.65, PY, -0.35), 0.42, 0.7, material='gunmetal', mirror=True)

    # --- Rear-facing gun over the drive ----------------------------------------------------------
    F.cylinder(s, 'TurretRing', (-5.6, 0.0, 1.0), (-5.6, 0.0, 1.32), 0.55, material='gunmetal', segments=32)
    F.box(s, 'TurretHead', (-5.8, 0.0, 1.5), (1.0, 0.8, 0.42), material='paint', bevel=0.06, taper=0.85)
    for y in (0.2, -0.2):
        F.cylinder(s, f'RearGun{y}', (-6.2, y, 1.5), (-7.9, y, 1.5), 0.08, material='gunmetal', cap_material='dark')

    s.detail = 1
    F.vent(s, 'SpineVent', (-4.2, 0.0, 1.1), (1.3, 0.6, 0.1), axis='y')
    F.rcs(s, 'RCS', (2.8, PY + POD_W / 2 + 0.1, 0.55), size=0.32, mirror=True)
    F.rcs(s, 'RCSAft', (-4.3, PY + POD_W / 2 + 0.1, 0.55), size=0.32, mirror=True)
    F.antenna(s, 'Mast', (5.0, -0.7, 1.6), 1.0, tip='glow_red')
    F.sensor_dome(s, 'Dome', (4.3, 0.6, 1.3), 0.26)
    F.light(s, 'Headlamp', (7.95, 0.62, 0.25), 'glow_warm', size=0.16, mirror=True)
    s.detail = 0
    F.light(s, 'NavPort', (-4.7, PY + POD_W / 2 + 0.06, 0.75), 'glow_red', size=0.15)
    F.light(s, 'NavStarboard', (-4.7, -PY - POD_W / 2 - 0.06, 0.75), 'glow_green', size=0.15)
    F.light(s, 'Beacon', (6.0, 0.0, 1.62), 'glow_amber', size=0.14)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
