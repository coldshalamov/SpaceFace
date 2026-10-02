"""Rescue Lifter — Work/rescue fleet recovery ship. A lit cab pulling an open lifting cradle.

Plan read at the chase camera: a fork. A rounded ivory cab body forward wearing rescue-orange bands
and a red/amber light bar, then two long rails aft that frame an open cradle, bridged by a winch
gantry, with clamp jaws reaching in from both rails and a drive at the end of each rail. Beacons at
every corner so the ship reads by its lights alone.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'rescue_lifter'
COLORS = {
    'paint': '#b8b2a0',    # rescue ivory-white
    'paint2': '#c4542a',   # rescue orange
    'stripe': '#c4542a',
    'hazard': '#c8901e',
    'paint.graphite': '#26282c',
    'glow_cyan.rust': '#ffd23a',   # work-fleet yellow lifted to light (identity trim)
}

RY = 2.85     # rail centre line (port); starboard mirrored
RZ = 0.1


def work_lamp(s, name, base, direction, r, mirror=False):
    """Flood can on a yoke — gunmetal barrel, dark bezel, bright lens (same kit idiom as the yard tug)."""
    bx, by, bz = base
    dx, dy, dz = direction
    L = r * 1.5
    tip = (bx + dx * L, by + dy * L, bz + dz * L)
    F.box(s, name + 'Yoke', (bx, by, bz - r * 0.35), (r * 1.4, r * 1.6, r * 0.5), material='gunmetal', bevel=0.02,
          mirror=mirror)
    F.cylinder(s, name + 'Can', base, tip, r * 0.9, r, material='gunmetal', segments=18, mirror=mirror)
    l0 = (tip[0] - dx * 0.02, tip[1] - dy * 0.02, tip[2] - dz * 0.02)
    l1 = (tip[0] + dx * 0.04, tip[1] + dy * 0.04, tip[2] + dz * 0.04)
    F.cylinder(s, name + 'Bezel', l0, l1, r * 1.08, material='dark', segments=18, bevel=0.0, mirror=mirror)
    l2 = (tip[0] + dx * 0.07, tip[1] + dy * 0.07, tip[2] + dz * 0.07)
    F.cylinder(s, name + 'Lens', l0, l2, r * 0.86, material='glow_warm', segments=18, bevel=0.0, mirror=mirror)


def beacon(s, name, pos, finish, r=0.26, mirror=False):
    """Rotating-beacon dome: a dark plinth with a tall glowing lens."""
    x, y, z = pos
    F.cylinder(s, name + 'Base', (x, y, z - 0.1), (x, y, z + 0.08), r * 1.25, material='gunmetal', segments=18,
               mirror=mirror)
    F.cylinder(s, name, (x, y, z + 0.08), (x, y, z + 0.08 + r * 1.3), r, r * 0.8, material=finish, segments=18,
               bevel=0.0, mirror=mirror)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Cab body: rounded, tall, forward. Orange nose and a double orange band.
    F.loft(s, 'Body', [
        dict(x=-3.0, w=1.7, ht=1.6, hb=1.4, zc=0.2, n=3.0),
        dict(x=-2.4, w=2.2, ht=2.0, hb=1.7, zc=0.2, n=3.3),
        dict(x=6.5, w=2.3, ht=2.15, hb=1.75, zc=0.2, n=3.3),
        dict(x=10.5, w=2.15, ht=1.95, hb=1.65, zc=0.15, n=3.0),
        dict(x=12.8, w=1.7, ht=1.35, hb=1.4, zc=0.05, n=2.7),
        dict(x=14.1, w=1.05, ht=0.7, hb=0.95, zc=0.0, n=2.4),
        dict(x=14.6, w=0.4, ht=0.25, hb=0.4, zc=-0.05, n=2.2),
    ], material='paint', belly='paint.graphite', back_material='dark', count=64)
    F.band(s, 'Body', (12.2, 0, 0), (1, 0, 0), 2.2, 'paint2', inset=0.02, depth=0.02)
    F.band(s, 'Body', (13.2, 0, 0.9), (1, 0, 0), 2.2, 'glass', facing=(0.55, 0, 0.83), min_facing=0.6)
    F.band(s, 'Body', (7.6, 0, 0), (1, 0, 0), 0.7, 'paint2', inset=0.02, depth=0.03)
    F.band(s, 'Body', (6.6, 0, 0), (1, 0, 0), 0.3, 'paint2', inset=0.02, depth=0.03)
    F.band(s, 'Body', (-1.6, 0, 0), (1, 0, 0), 0.5, 'paint2', inset=0.02, depth=0.03)
    F.panel(s, 'Body', (4.6, 0.0), (2.6, 2.8), 'paint', inset=0.05, depth=0.04)
    # Roof rescue hatch: a big graphite collar ring with an orange lid (the top-down 'rescue' mark).
    F.cylinder(s, 'RoofHatch', (4.6, 0.0, 2.2), (4.6, 0.0, 2.5), 0.95, material='paint.graphite', segments=36)
    F.cylinder(s, 'RoofHatchLid', (4.6, 0.0, 2.5), (4.6, 0.0, 2.62), 0.72, material='paint2', segments=36)
    F.box(s, 'RoofHatchBar', (4.6, 0.0, 2.66), (1.3, 0.22, 0.1), material='gunmetal', bevel=0.02)
    # Graphite equipment deck aft on the roof.
    F.plate(s, 'EquipDeck', [(1.9, 1.15), (-2.3, 1.15), (-2.3, -1.15), (1.9, -1.15)], z0=1.95, thickness=0.55,
            material='paint.graphite', chamfer=0.1)
    F.windows(s, 'CabWin', 8.4, 10.4, 2.24, 0.75, 3, size=(0.5, 0.36), mirror=True)
    # Side airlock (rescue hatch): a raised orange door frame on each flank.
    F.box(s, 'Airlock', (4.4, 2.26, 0.15), (1.5, 0.16, 2.0), material='paint2', bevel=0.05, mirror=True)
    F.box(s, 'AirlockDoor', (4.4, 2.34, 0.15), (1.0, 0.06, 1.5), material='gunmetal', bevel=0.02, mirror=True)
    F.box(s, 'AirlockWin', (4.4, 2.38, 0.55), (0.46, 0.04, 0.34), material='glow_warm', bevel=0.0, mirror=True)

    # --- Shoulders: wedge plates carrying the loads from the body out to the rails.
    F.plate(s, 'Shoulder', [(3.6, 1.6), (0.6, RY + 0.35), (-2.4, RY + 0.35), (-2.4, 1.6)], z0=-0.4, thickness=0.95,
            material='paint2', chamfer=0.22, mirror=True)
    # --- Cradle rails: boxy booms aft, a drive at the end of each.
    F.loft(s, 'Rail', [
        dict(x=-13.4, w=0.72, ht=0.82, hb=0.8, zc=RZ, n=4.0, y=RY),
        dict(x=-1.0, w=0.72, ht=0.82, hb=0.8, zc=RZ, n=4.0, y=RY),
        dict(x=0.8, w=0.6, ht=0.7, hb=0.7, zc=RZ, n=3.6, y=RY),
        dict(x=1.4, w=0.3, ht=0.4, hb=0.4, zc=RZ, n=3.0, y=RY),
    ], material='paint', belly='paint.graphite', count=40, mirror=True)
    # rescue chevrons: orange diagonal bars cut into the rail tops
    for i, x in enumerate((-4.2, -7.6, -11.0)):
        F.band(s, 'Rail', (x, RY, 0), (0.8, 0.6, 0), 0.7, 'paint2', facing=(0, 0, 1), min_facing=0.5, mirror=True,
               inset=0.02, depth=0.02)
    F.band(s, 'Rail', (-12.8, RY, 0), (1, 0, 0), 0.4, 'hazard', mirror=True)
    # Identity trim, lit: a thin yellow line down each rail top the length of the cradle, so the open
    # fork reads by its light at the chase camera (LOOK.md: lamps are light).
    F.band(s, 'Rail', (-7.0, RY, RZ), (0, 1, 0), 0.1, 'glow_cyan.rust', facing=(0, 0, 1), min_facing=0.6,
           mirror=True, inset=0.004, depth=-0.01, region=(('x', -12.4, -1.4),))
    # drive nacelles at the rail ends
    F.cylinder(s, 'DriveHousing', (-14.6, RY, RZ), (-12.2, RY, RZ), 0.95, 0.9, material='paint', segments=36,
               mirror=True, cap_material='dark')
    F.cylinder(s, 'DriveRing', (-13.4, RY, RZ), (-13.0, RY, RZ), 1.0, material='paint2', segments=36, mirror=True,
               cap=False)
    F.nozzle(s, 'Nozzle', (-15.4, RY, RZ), 0.72, 0.85, material='gunmetal', mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-15.3, 0.0, RZ))
    F.nozzle(s, 'BodyNozzle', (-3.6, 0.0, 0.3), 0.6, 0.7, material='gunmetal')

    # --- Winch gantry: a graphite bridge over the cradle, winch drum on top, hook block below.
    GX = -6.6
    F.plate(s, 'Gantry', [(GX + 0.8, RY + 0.55), (GX - 0.8, RY + 0.55), (GX - 0.8, -RY - 0.55),
                          (GX + 0.8, -RY - 0.55)], z0=1.05, thickness=0.5, material='paint.graphite', chamfer=0.12)
    F.box(s, 'GantryLeg', (GX, RY, 0.95), (1.3, 0.9, 0.5), material='paint.graphite', bevel=0.04, mirror=True)
    F.band(s, 'Gantry', (GX, 0, 0), (0, 1, 0), 1.2, 'hazard', facing=(0, 0, 1))
    F.cylinder(s, 'WinchDrum', (GX, 0.95, 2.05), (GX, -0.95, 2.05), 0.5, material='dark', segments=28)
    for i in range(5):
        y = -0.7 + i * 0.35
        F.cylinder(s, f'WinchWrap{i}', (GX, y - 0.12, 2.05), (GX, y + 0.12, 2.05), 0.58, material='gunmetal',
                   segments=24, bevel=0.0)
    F.plate(s, 'WinchCheek', [(GX - 0.7, 0.95), (GX + 0.7, 0.95), (GX + 0.45, 1.15), (GX - 0.45, 1.15)], z0=1.5,
            thickness=1.1, material='paint2', chamfer=0.04, mirror=True)
    F.cylinder(s, 'WinchHub', (GX, 1.15, 2.05), (GX, 1.3, 2.05), 0.25, material='gunmetal', mirror=True)
    F.cylinder(s, 'Cable', (GX, 0.0, 1.1), (GX, 0.0, -0.6), 0.07, material='gunmetal', segments=10)
    F.box(s, 'HookBlock', (GX, 0.0, -0.8), (0.7, 0.5, 0.5), material='hazard', bevel=0.05)

    # --- Clamp jaws: arms reaching in from both rails, orange pads, fore and aft of the gantry.
    for i, x in enumerate((-3.9, -10.1)):
        F.plate(s, f'Jaw{i}', [(x + 0.62, RY - 0.3), (x + 0.45, 0.95), (x - 0.45, 0.95), (x - 0.62, RY - 0.3)],
                z0=0.05, thickness=0.72, material='paint2', chamfer=0.1, mirror=True)
        F.band(s, f'Jaw{i}', (x, 1.35, 0), (0, 1, 0), 0.3, 'hazard', facing=(0, 0, 1), min_facing=0.5, mirror=True)
        F.box(s, f'JawPad{i}', (x, 0.88, 0.35), (1.0, 0.26, 0.95), material='dark', bevel=0.06, mirror=True)
        F.box(s, f'JawHinge{i}', (x, RY - 0.45, 0.62), (1.4, 0.5, 0.5), material='gunmetal', bevel=0.05, mirror=True)
        F.cylinder(s, f'JawRam{i}', (x + 0.3, RY - 0.5, 0.86), (x + 0.3, 1.25, 0.86), 0.1, material='bare',
                   segments=10, mirror=True)
        F.cylinder(s, f'JawRamB{i}', (x - 0.3, RY - 0.5, 0.86), (x - 0.3, 1.25, 0.86), 0.1, material='bare',
                   segments=10, mirror=True)

    # --- Light bar on the cab roof: alternating red and amber blocks on a graphite bar.
    F.box(s, 'LightBar', (10.0, 0.0, 2.3), (0.8, 3.2, 0.3), material='paint.graphite', bevel=0.04)
    for i, y in enumerate((-1.3, -0.65, 0.0, 0.65, 1.3)):
        F.box(s, f'Lamp{i}', (10.0, y, 2.52), (0.62, 0.5, 0.2), material='glow_red' if i % 2 == 0 else 'glow_amber',
              bevel=0.0)
    beacon(s, 'BeaconAft', (-0.75, 0.0, 2.6), 'glow_amber', r=0.3)
    beacon(s, 'RailBeacon', (-12.4, RY, RZ + 0.92), 'glow_red', r=0.24, mirror=True)
    beacon(s, 'ShoulderBeacon', (1.4, RY - 0.2, 0.62), 'glow_amber', r=0.2, mirror=True)

    s.detail = 1
    work_lamp(s, 'CradleFlood', (GX + 1.25, RY - 0.1, 1.45), (0.35, -0.3, 0.89), 0.36, mirror=True)
    work_lamp(s, 'NoseFlood', (12.3, 1.2, 1.55), (0.6, 0.0, 0.8), 0.2, mirror=True)
    F.vent(s, 'RoofVent', (0.2, 0.62, 2.5), (2.4, 0.46, 0.1), mirror=True, slats=7)
    F.vent(s, 'RailVent', (-1.6, RY, RZ + 0.8), (1.4, 0.8, 0.1), mirror=True, slats=5)
    F.rcs(s, 'RCSFwd', (11.0, 2.08, 0.0), size=0.36, mirror=True)
    F.rcs(s, 'RCSAft', (-12.0, RY + 0.72, RZ), size=0.36, mirror=True)
    F.antenna(s, 'Mast', (1.5, 0.0, 2.5), 1.4, tip=None)
    F.sensor_dome(s, 'Dome', (-1.65, 0.0, 2.5), 0.4)
    s.detail = 0

    F.light(s, 'NavPort', (-13.6, RY + 1.0, RZ), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (-13.6, -RY - 1.0, RZ), 'glow_green', size=0.2)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
