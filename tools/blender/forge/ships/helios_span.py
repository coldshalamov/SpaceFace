"""Helios Span — civilian hauler. An ivory cab and drive joined by a spine carrying six boxes.

Helios civil design language: rounded, practical, lit cabin, one occupation colour (freight
blue-grey) carried in bands. Plan read at the chase camera: a long truck — round cab, two rows of
three ribbed containers held in ivory clamp frames either side of a lit spine, a three-bell drive.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'helios_span'
COLORS = {
    'paint': '#bfb6a3',        # Helios ivory
    'paint2': '#4f6f86',       # freight blue-grey
    'paint2.box': '#283d4e',   # freight boxes, a shade deeper than the band colour
    'paint2.b': '#333d45',     # a slate box
    'paint2.teal': '#16504f',  # one Helios teal box
    'stripe': '#4f6f86',
    'hazard': '#d99a2a',
}

ROWS = (-4.7, 0.0, 4.7)        # container row centres (x)
FRAMES = (-7.05, -2.35, 2.35, 7.05)
BOX = (4.2, 3.1, 2.7)
ROW_Y = 2.15


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Cab: rounded ivory cabin forward with wraparound glass.
    F.loft(s, 'Cab', [
        dict(x=7.8, w=1.3, ht=1.2, hb=1.3, zc=0.0, n=3.0),
        dict(x=8.6, w=2.2, ht=1.9, hb=1.7, zc=0.1, n=2.8),
        dict(x=11.5, w=2.3, ht=2.0, hb=1.7, zc=0.1, n=2.6),
        dict(x=13.2, w=1.9, ht=1.5, hb=1.3, zc=0.0, n=2.3),
        dict(x=14.2, w=1.1, ht=0.8, hb=0.8, zc=-0.1, n=2.1),
        dict(x=14.6, w=0.35, ht=0.28, hb=0.28, zc=-0.1, n=2.0),
    ], material='paint', belly='paint2', back_material='dark', count=56)
    F.band(s, 'Cab', (12.9, 0, 0), (1, 0, 0), 1.3, 'glass', facing=(0.4, 0, 0.9), min_facing=0.3, inset=0.03,
           depth=-0.02)
    F.band(s, 'Cab', (9.4, 0, 0), (1, 0, 0), 0.6, 'stripe', inset=0.02, depth=0.02)
    F.panel(s, 'Cab', (10.6, 0.0), (1.6, 1.8), 'paint', inset=0.04, depth=0.035)
    F.windows(s, 'CabWin', 9.9, 12.4, 2.3, 0.1, 4, size=(0.45, 0.26), mirror=True)
    F.windows(s, 'CabWinHi', 10.0, 12.2, 2.14, 0.95, 3, size=(0.5, 0.3), mirror=True)

    # Spine: the working beam between the rows, lit along its top.
    F.loft(s, 'Spine', [
        dict(x=-8.6, w=0.75, ht=0.9, hb=1.0, zc=-0.2, n=3.5),
        dict(x=8.4, w=0.75, ht=0.9, hb=1.0, zc=-0.2, n=3.5),
    ], material='paint', count=32)
    F.band(s, 'Spine', (0, 0, 0), (0, 1, 0), 0.4, 'stripe', facing=(0, 0, 1), min_facing=0.7, inset=0.02,
           depth=-0.02)

    # Drive block aft: squarish ivory block, three bells.
    F.loft(s, 'Drive', [
        dict(x=-14.0, w=2.6, ht=1.6, hb=1.6, zc=-0.1, n=4.0),
        dict(x=-13.4, w=3.0, ht=1.9, hb=1.9, zc=-0.1, n=4.2),
        dict(x=-9.6, w=3.0, ht=1.9, hb=1.9, zc=-0.1, n=4.2),
        dict(x=-8.4, w=1.6, ht=1.2, hb=1.3, zc=-0.1, n=3.0),
    ], material='paint', belly='paint2', back_material='dark', count=56)
    F.band(s, 'Drive', (-9.9, 0, 0), (1, 0, 0), 0.55, 'stripe', inset=0.02, depth=0.02)
    F.band(s, 'Drive', (-13.0, 0, 0), (1, 0, 0), 0.35, 'stripe', inset=0.02, depth=0.02)
    F.panel(s, 'Drive', (-11.5, 0.0), (2.4, 1.2), 'dark', inset=0.05, depth=-0.06)
    for y in (-1.6, 0.0, 1.6):
        F.nozzle(s, f'Nozzle{int(y * 10)}', (-14.6, y, -0.1), 0.72, 0.9, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-14.5, 0.0, -0.1))

    # Two rows of three ribbed containers.
    finishes = [('paint2.box', 'paint2.b'), ('paint2.teal', 'paint2.box'), ('paint2.b', 'paint2.box')]
    for i, x in enumerate(ROWS):
        for j, y in enumerate((ROW_Y, -ROW_Y)):
            F.container(s, f'Box{i}{j}', (x, y, 0.15), BOX, finish=finishes[i][j], ribs=4)

    # Clamp frames: gunmetal keel beam under the rows, ivory clamp arms over the top that meet in a
    # dark lock block on the spine, posts at the ends.
    edge = ROW_Y + BOX[1] / 2
    for k, x in enumerate(FRAMES):
        F.box(s, f'FrameKeel{k}', (x, 0.0, -1.42), (0.45, 2 * edge + 0.5, 0.4), material='gunmetal', bevel=0.03)
        F.box(s, f'FrameBar{k}', (x, (edge + 0.55) / 2, 1.6), (0.42, edge - 0.55 + 0.2, 0.24), material='paint',
              bevel=0.04, mirror=True)
        F.box(s, f'FrameLock{k}', (x, 0.0, 1.5), (0.62, 1.3, 0.5), material='gunmetal', bevel=0.05)
        F.band(s, f'FrameLock{k}', (x, 0.0, 0), (0, 1, 0), 0.5, 'hazard', facing=(0, 0, 1), min_facing=0.7)
        F.box(s, f'FramePost{k}', (x, edge + 0.12, 0.1), (0.46, 0.36, 3.3), material='gunmetal', bevel=0.03,
              mirror=True)
        F.box(s, f'FrameCap{k}', (x, edge + 0.14, 1.6), (0.56, 0.44, 0.34), material='paint', bevel=0.04,
              mirror=True)
    # Couplings where the spine leaves the cab and enters the drive.
    for name, (x0, x1) in (('CoupleFwd', (7.1, 7.7)), ('CoupleAft', (-7.9, -7.3))):
        F.cylinder(s, name, (x0, 0.0, -0.2), (x1, 0.0, -0.2), 0.95, material='gunmetal', segments=32)
        F.band(s, name, ((x0 + x1) / 2, 0, 0), (1, 0, 0), 0.2, 'dark', inset=0.01, depth=-0.03)

    # Radiator wings off the drive block: the plan-view tail of the hauler.
    F.plate(s, 'RadWing', [(-9.6, 2.8), (-10.9, 4.6), (-13.3, 4.6), (-13.6, 2.8)], z0=0.2, thickness=0.22,
            material='paint', chamfer=0.1, mirror=True, side_material='paint2')
    F.panel(s, 'RadWing', (-11.8, 3.65), (1.9, 1.3), 'dark', inset=0.04, depth=-0.05, mirror=True)

    s.detail = 1
    F.fins(s, 'Radiator', -12.8, -10.0, 1.6, 1.72, 0.45, 6, thickness=0.08, depth=0.7, mirror=True)
    F.fins(s, 'WingFins', -12.6, -11.0, 3.65, 0.38, 0.2, 5, thickness=0.06, depth=1.2, mirror=True)
    F.rcs(s, 'RCS', (12.0, 2.2, 0.6), mirror=True)
    F.rcs(s, 'RCSAft', (-12.0, 2.98, -0.6), mirror=True)
    F.antenna(s, 'Mast', (9.2, 0.6, 2.0), 1.1, tip='glow_red')
    F.sensor_dome(s, 'Dome', (11.6, 0.0, 2.08), 0.32)
    for i in range(7):
        F.light(s, f'SpineLamp{i}', (-7.5 + i * 2.5, 0.0, 0.72), 'glow_warm', size=0.14)
    s.detail = 0
    F.light(s, 'NavPort', (-12.1, 4.62, 0.31), 'glow_red', size=0.28)
    F.light(s, 'NavStarboard', (-12.1, -4.62, 0.31), 'glow_green', size=0.28)
    F.light(s, 'Beacon', (-10.6, 0.0, 1.82), 'glow_amber', size=0.22)
    F.light(s, 'HeadLamp', (14.0, 0.75, -0.35), 'glow_warm', size=0.22, mirror=True)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
