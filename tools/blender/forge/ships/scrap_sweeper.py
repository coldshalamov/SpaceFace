"""Scrap Sweeper — Work-family scrap collector. A wide net mouth feeding a full scrap bin.

Plan read at the chase camera: a broad U. Two hazard-tipped sweeper arms reach forward and frame a
cable net, a brush roller spans the throat, an open rust-orange bin behind it is heaped with scrap
(the only ship in the fleet that shows its cargo from above), and a high olive cab block aft looks
out over the bin, twin drives behind it.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'scrap_sweeper'
COLORS = {
    'paint': '#7a3a20',    # rust-orange (authored dark: the key light lifts it ~2.5x)
    'paint2': '#363b20',   # olive
    'stripe': '#26282c',   # graphite (chevron partner of the hazard yellow)
    'hazard': '#c89a1e',
    'bare.scrap': '#6f6a62',   # the scrap heap: dull mixed metal
    'paint.scrap': '#3f5a6a',  # a stray blue hull plate in the heap
    'glow_cyan.rust': '#ffd23a',   # work-fleet yellow lifted to light (identity trim)
}

# The sweeper arms flare: inner edge 1.95 m off the centre line at the throat, 2.35 m at the tips.


def arm_in(x):
    return 1.95 + (x - 2.3) / 7.3 * 0.4


def work_lamp(s, name, base, direction, r, mirror=False):
    """Flood can on a yoke — gunmetal barrel, dark bezel, bright lens (fleet work-lamp idiom)."""
    bx, by, bz = base
    dx, dy, dz = direction
    L = r * 1.5
    tip = (bx + dx * L, by + dy * L, bz + dz * L)
    F.box(s, name + 'Yoke', (bx, by, bz - r * 0.35), (r * 1.4, r * 1.6, r * 0.5), material='gunmetal', bevel=0.02,
          mirror=mirror)
    F.cylinder(s, name + 'Can', base, tip, r * 0.9, r, material='gunmetal', segments=18, mirror=mirror)
    l0 = (tip[0] - dx * 0.02, tip[1] - dy * 0.02, tip[2] - dz * 0.02)
    l2 = (tip[0] + dx * 0.07, tip[1] + dy * 0.07, tip[2] + dz * 0.07)
    F.cylinder(s, name + 'Bezel', l0, (tip[0] + dx * 0.04, tip[1] + dy * 0.04, tip[2] + dz * 0.04), r * 1.08,
               material='dark', segments=18, bevel=0.0, mirror=mirror)
    F.cylinder(s, name + 'Lens', l0, l2, r * 0.86, material='glow_warm', segments=18, bevel=0.0, mirror=mirror)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Scrap bin: an open-top hopper. Floor, four walls, a hazard rim; scrap heaped inside.
    BX0, BX1, BW, BZ0, BZ1 = -3.6, 2.4, 2.05, -1.0, 1.35
    F.box(s, 'BinFloor', ((BX0 + BX1) / 2, 0.0, BZ0 + 0.15), (BX1 - BX0, BW * 2, 0.3), material='paint2', bevel=0.04)
    F.plate(s, 'BinWall', [(BX1, BW - 0.3), (BX1, BW), (BX0, BW), (BX0, BW - 0.3)], z0=BZ0, thickness=BZ1 - BZ0,
            material='paint', chamfer=0.05, mirror=True)
    F.box(s, 'BinFront', (BX1 - 0.15, 0.0, (BZ0 + BZ1) / 2 - 0.25), (0.3, BW * 2, BZ1 - BZ0 - 0.5), material='paint',
          bevel=0.04)
    F.box(s, 'BinBack', (BX0 + 0.15, 0.0, (BZ0 + BZ1) / 2), (0.3, BW * 2, BZ1 - BZ0), material='paint', bevel=0.04)
    F.box(s, 'BinWell', ((BX0 + BX1) / 2, 0.0, -0.05), (BX1 - BX0 - 0.5, BW * 2 - 0.5, 0.5), material='dark',
          bevel=0.0)
    # outboard ribs and a hazard band round the bin
    for i, x in enumerate((-2.4, -0.6, 1.2)):
        F.box(s, f'BinRib{i}', (x, BW + 0.08, 0.15), (0.3, 0.2, 2.2), material='paint2', bevel=0.03, mirror=True)
    F.band(s, 'BinWall', (0, BW, 1.05), (0, 0, 1), 0.3, 'hazard', mirror=True)
    # the heap: plates, beams and a drum, in fixed poses
    heap = [
        ((-2.6, 0.9, 0.0), (1.6, 0.9, 0.5), 0.4, 'bare.scrap'),
        ((-1.2, -0.8, 0.15), (1.9, 1.1, 0.45), -0.6, 'bare.scrap'),
        ((0.4, 0.6, 0.05), (1.4, 1.3, 0.55), 0.9, 'paint.scrap'),
        ((1.4, -0.9, -0.1), (1.0, 0.8, 0.5), 0.2, 'bare.scrap'),
        ((-0.3, 0.0, 0.55), (2.4, 0.3, 0.3), 0.25, 'gunmetal'),
        ((-2.2, -0.6, 0.35), (1.1, 0.7, 0.4), 1.2, 'paint2'),
        ((1.1, 0.4, 0.5), (0.9, 0.6, 0.35), -0.3, 'dark'),
        ((-1.6, 0.4, 0.62), (1.2, 0.2, 0.2), -1.0, 'gunmetal'),
        ((-2.9, -1.1, 0.2), (1.0, 0.9, 0.6), 0.5, 'paint'),
        ((0.9, -0.2, 0.25), (1.3, 1.0, 0.45), -1.1, 'bare.scrap'),
        ((1.7, 1.1, 0.2), (0.8, 0.7, 0.5), 0.7, 'paint2'),
        ((-0.6, 1.2, 0.3), (1.1, 0.8, 0.5), -0.2, 'bare.scrap'),
        ((-2.9, 0.1, 0.5), (0.7, 1.5, 0.25), 0.1, 'gunmetal'),
        ((0.3, -1.3, 0.3), (0.9, 0.6, 0.45), 1.4, 'paint.scrap'),
    ]
    for i, (c, sz, rz, fin) in enumerate(heap):
        F.box(s, f'Scrap{i}', c, sz, material=fin, bevel=0.04, rot_z=rz)
    F.cylinder(s, 'ScrapDrum', (-0.6, -1.2, 0.35), (-0.1, -0.35, 0.55), 0.42, material='paint', segments=20,
               cap_material='dark')

    # --- Throat: crossbeam carrying the brush roller, the arms bolted to its ends.
    F.plate(s, 'Throat', [(3.6, 2.85), (2.3, 2.85), (2.3, -2.85), (3.6, -2.85)], z0=-0.9, thickness=0.75,
            material='paint2', chamfer=0.12)
    F.cylinder(s, 'Roller', (3.45, 1.95, 0.2), (3.45, -1.95, 0.2), 0.55, material='dark', segments=28)
    for i in range(6):
        y = -1.62 + i * 0.65
        F.cylinder(s, f'Brush{i}', (3.45, y - 0.15, 0.2), (3.45, y + 0.15, 0.2), 0.68, material='paint2', segments=24,
                   bevel=0.0, cap=False)
    F.box(s, 'RollerCheek', (3.45, 2.05, 0.1), (1.2, 0.24, 1.3), material='gunmetal', bevel=0.03, mirror=True)

    # --- Sweeper arms: flat rust booms flaring forward into a funnel mouth, hazard-chevron tips.
    arm = [(9.6, arm_in(9.6)), (9.95, arm_in(9.6) + 0.45), (9.6, arm_in(9.6) + 0.86), (2.3, arm_in(2.3) + 0.86),
           (2.3, arm_in(2.3))]
    F.plate(s, 'Arm', arm, z0=-0.55, thickness=0.95, material='paint', chamfer=0.14, chamfer_bottom=0.06,
            mirror=True)
    for i, x in enumerate((9.15, 8.45, 7.75)):
        F.band(s, 'Arm', (x, arm_in(x) + 0.4, 0), (0.72, 0.69, 0), 0.34, 'hazard' if i % 2 == 0 else 'stripe',
               facing=(0, 0, 1), min_facing=0.5, mirror=True)
    F.band(s, 'Arm', (5.0, 0, 0), (1, 0, 0), 2.4, 'paint2', facing=(0, 0, 1), min_facing=0.5, inset=0.03,
           depth=-0.03, mirror=True)
    # Identity trim, lit: a thin yellow line 0.25 m inside each arm's outer edge, stopping short of the
    # chevron tips, so the U reads as two lit booms at the chase camera (LOOK.md: lamps are light).
    F.band(s, 'Arm', (6.0, arm_in(6.0) + 0.61, 0), (-0.4, 7.3, 0), 0.1, 'glow_cyan.rust', facing=(0, 0, 1),
           min_facing=0.5, mirror=True, inset=0.004, depth=-0.01, region=(('x', 2.6, 7.35),))
    # arm guide rail: a raised gunmetal lip along each inner edge
    ang = math.atan2(0.4, 7.3)
    F.box(s, 'ArmLip', (6.0, arm_in(6.0) + 0.02, 0.05), (7.2, 0.16, 1.15), material='gunmetal', bevel=0.02,
          rot_z=ang, mirror=True)
    # --- The net: longitudinal and cross cables slung low in the mouth.
    NZ = -0.35
    for i, y in enumerate((-1.6, -0.8, 0.0, 0.8, 1.6)):
        F.cylinder(s, f'NetLong{i}', (3.9, y, NZ), (9.4, y * 1.2, NZ + 0.1), 0.05, material='gunmetal', segments=8,
                   bevel=0.0)
    for i, x in enumerate((4.8, 6.4, 8.0, 9.35)):
        F.cylinder(s, f'NetCross{i}', (x, arm_in(x), NZ + 0.05), (x, -arm_in(x), NZ + 0.05), 0.06, material='bare',
                   segments=8, bevel=0.0)

    # --- Cab block aft: olive, tall, windows forward over the bin; drive block behind.
    F.loft(s, 'CabBlock', [
        dict(x=-9.2, w=1.5, ht=1.3, hb=1.1, zc=0.3, n=3.4),
        dict(x=-8.6, w=1.85, ht=1.7, hb=1.3, zc=0.3, n=3.8),
        dict(x=-4.6, w=1.9, ht=1.9, hb=1.3, zc=0.35, n=3.8),
        dict(x=-3.7, w=1.8, ht=1.7, hb=1.25, zc=0.35, n=3.4),
        dict(x=-3.3, w=1.5, ht=1.2, hb=1.1, zc=0.35, n=3.0),
    ], material='paint2', belly='stripe', back_material='dark', count=48)
    F.band(s, 'CabBlock', (-4.1, 0, 1.7), (1, 0, 0), 0.8, 'glass', facing=(0.6, 0, 0.8), min_facing=0.45)
    F.band(s, 'CabBlock', (-7.9, 0, 0), (1, 0, 0), 0.5, 'hazard', inset=0.02, depth=0.02)
    F.panel(s, 'CabBlock', (-6.3, 0.0), (2.4, 2.4), 'paint', inset=0.05, depth=0.05)
    F.windows(s, 'CabWin', -6.4, -4.4, 1.9, 1.0, 3, size=(0.46, 0.32), mirror=True)
    F.box(s, 'DriveBlock', (-8.4, 0.0, -0.5), (2.4, 3.8, 1.3), material='paint', bevel=0.08)
    for y in (1.1, -1.1):
        F.nozzle(s, f'Nozzle{y}', (-10.2, y, -0.5), 0.58, 0.75, material='gunmetal')
        F.cylinder(s, f'NozzleCollar{y}', (-9.8, y, -0.5), (-9.5, y, -0.5), 0.72, material='paint2', segments=32)
    s.hook('HOOK_DRIVE_CORE', (-10.1, 0.0, -0.5))

    s.detail = 1
    work_lamp(s, 'ArmFlood', (9.2, arm_in(9.2) + 0.55, 0.55), (0.72, 0.0, 0.7), 0.24, mirror=True)
    work_lamp(s, 'CabFlood', (-4.8, 1.1, 2.25), (0.7, 0.0, 0.72), 0.2, mirror=True)
    F.rcs(s, 'RCSFwd', (3.0, arm_in(3.0) + 0.99, -0.2), size=0.34, mirror=True)
    F.rcs(s, 'RCSAft', (-8.4, 1.95, -0.4), size=0.34, mirror=True)
    F.antenna(s, 'Mast', (-7.0, -0.9, 2.15), 1.1, tip='glow_red')
    for i, x in enumerate((-2.2, 0.4)):
        F.cylinder(s, f'BinHinge{i}', (x, BW + 0.18, 1.2), (x + 0.9, BW + 0.18, 1.2), 0.12, material='gunmetal',
                   segments=10, mirror=True)
    s.detail = 0

    F.light(s, 'NavPort', (9.7, arm_in(9.6) + 0.84, 0.1), 'glow_red', size=0.18)
    F.light(s, 'NavStarboard', (9.7, -arm_in(9.6) - 0.84, 0.1), 'glow_green', size=0.18)
    F.light(s, 'ArmBeacon', (9.55, arm_in(9.55) + 0.25, 0.45), 'glow_amber', size=0.2, mirror=True)
    F.light(s, 'Beacon', (-5.8, 0.0, 2.32), 'glow_amber', size=0.24)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
