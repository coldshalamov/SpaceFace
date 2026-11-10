"""Volatiles Tanker — Work-family hazardous fuel hauler. Four striped tanks in a cage.

Plan read at the chase camera: a long ladder. A graphite cab forward behind a blast shield, then four
fat hazard-yellow tanks slung in a truss cage (longerons along both edges, a frame at every tank
joint), a manifold pipe down the spine with a red warning lamp at every frame, and a heavy drive
block aft. Black diagonal hazard stripes on every tank say "keep clear" from any zoom.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'volatiles_tanker'
COLORS = {
    'paint': '#9a7418',    # hazard yellow tanks (authored dark: big surfaces lift ~2.5x)
    'paint2': '#26282c',   # graphite cab, frames and drive block
    'stripe': '#121316',   # hazard black
    'hazard': '#9a7418',
    'glow_cyan.rust': '#ffd23a',   # work-fleet yellow lifted to light, on the graphite only
}

TANKS = (7.6, 2.6, -2.4, -7.4)   # tank centres (x)
FRAMES = (10.1, 5.1, 0.1, -4.9, -9.9)
TR = 2.45                          # tank radius
CY, CZ = 2.8, 2.72                 # cage half-width / half-height (longeron positions)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Tanks: round pressure vessels, black end rings, diagonal black hazard stripes on top.
    for i, x0 in enumerate(TANKS):
        name = f'Tank{i}'
        F.loft(s, name, [
            dict(x=x0 - 2.3, w=0.9, ht=0.9, hb=0.9, n=2.0),
            dict(x=x0 - 2.12, w=1.9, ht=1.9, hb=1.9, n=2.0),
            dict(x=x0 - 1.75, w=TR - 0.06, ht=TR - 0.06, hb=TR - 0.06, n=2.0),
            dict(x=x0 - 1.3, w=TR, ht=TR, hb=TR, n=2.0),
            dict(x=x0 + 1.3, w=TR, ht=TR, hb=TR, n=2.0),
            dict(x=x0 + 1.75, w=TR - 0.06, ht=TR - 0.06, hb=TR - 0.06, n=2.0),
            dict(x=x0 + 2.12, w=1.9, ht=1.9, hb=1.9, n=2.0),
            dict(x=x0 + 2.3, w=0.9, ht=0.9, hb=0.9, n=2.0),
        ], material='paint', count=40)
        for dx in (-1.1, 0.0, 1.1):
            F.band(s, name, (x0 + dx, 0, 0), (0.707, 0.707, 0), 0.42, 'stripe', facing=(0, 0, 1), min_facing=0.15)
        for dx in (-1.55, 1.55):
            F.band(s, name, (x0 + dx, 0, 0), (1, 0, 0), 0.3, 'paint2', inset=0.02, depth=0.04)

    # --- Truss cage: a frame at every tank joint, four longerons, diagonal side braces.
    for j, x in enumerate(FRAMES):
        F.box(s, f'FrameTop{j}', (x, 0.0, CZ), (0.5, CY * 2 + 0.3, 0.36), material='paint2', bevel=0.03)
        F.box(s, f'FrameBot{j}', (x, 0.0, -CZ), (0.5, CY * 2 + 0.3, 0.36), material='paint2', bevel=0.03)
        F.box(s, f'FramePost{j}', (x, CY, 0.0), (0.5, 0.36, CZ * 2 + 0.3), material='paint2', bevel=0.03,
              mirror=True)
        # saddle pads where the frame grips the tank ends
        F.box(s, f'Saddle{j}', (x, 0.0, TR - 0.2 + 0.1), (0.62, 1.3, 0.5), material='gunmetal', bevel=0.03)
    for zz in (CZ, -CZ):
        F.box(s, f'Longeron{zz:+.0f}', (0.1, CY, zz), (20.5, 0.3, 0.3), material='gunmetal', bevel=0.02, mirror=True)
    for j in range(len(FRAMES) - 1):
        xa, xb = FRAMES[j], FRAMES[j + 1]
        F.cylinder(s, f'Brace{j}', (xa - 0.25, CY, -CZ + 0.1), (xb + 0.25, CY, CZ - 0.1), 0.1, material='gunmetal',
                   segments=8, bevel=0.0, mirror=True)
    # hazard edge on the cage: diagonal yellow/black blocks on the top longerons' outer caps
    for j, x in enumerate(FRAMES):
        F.band(s, f'FrameTop{j}', (x, CY, CZ), (0, 1, 0), 0.3, 'stripe', facing=(0, 0, 1), min_facing=0.5)
        F.band(s, f'FrameTop{j}', (x, -CY, CZ), (0, 1, 0), 0.3, 'stripe', facing=(0, 0, 1), min_facing=0.5)

    # --- Spine manifold: one pipe over the frames, a valve riser from each tank, red lamps.
    MZ = CZ + 0.35
    F.cylinder(s, 'Manifold', (-10.4, 0.0, MZ), (10.6, 0.0, MZ), 0.2, material='bare', segments=16,
               cap_material='gunmetal')
    for i, x0 in enumerate(TANKS):
        F.cylinder(s, f'Riser{i}', (x0 + 0.9, 0.0, TR - 0.1), (x0 + 0.9, 0.0, MZ), 0.14, material='bare', segments=12)
        F.cylinder(s, f'Valve{i}', (x0 + 0.9, 0.0, MZ + 0.12), (x0 + 0.9, 0.0, MZ + 0.32), 0.38, material='stripe',
                   segments=20)
        F.cylinder(s, f'Hatch{i}', (x0 - 0.8, 0.9, TR - 0.3), (x0 - 0.8, 0.9, TR + 0.12), 0.46, material='paint2',
                   segments=18)
    for j, x in enumerate(FRAMES):
        F.light(s, f'WarnLamp{j}', (x, 0.0, MZ + 0.16), 'glow_red', size=0.46)
        F.box(s, f'LampFoot{j}', (x, 0.0, CZ + 0.17), (0.5, 0.6, 0.1), material='gunmetal', bevel=0.01)

    # --- Blast shield between cab and cargo: graphite wall, wider than the cage, black/yellow top.
    F.plate(s, 'Shield', [(11.2, 3.05), (10.45, 3.05), (10.45, -3.05), (11.2, -3.05)], z0=-3.0, thickness=6.05,
            material='paint2', chamfer=0.12)
    for k, y in enumerate((-2.4, -1.2, 0.0, 1.2, 2.4)):
        F.band(s, 'Shield', (10.8, y, 0), (0, 1, 0), 0.6, 'hazard' if k % 2 == 0 else 'stripe', facing=(0, 0, 1),
               min_facing=0.6)
    F.light(s, 'ShieldLampP', (10.8, 2.7, 3.12), 'glow_red', size=0.3)
    F.light(s, 'ShieldLampS', (10.8, -2.7, 3.12), 'glow_red', size=0.3)

    # --- Cab: compact graphite, yellow nose band, wraparound glass.
    F.loft(s, 'Cab', [
        dict(x=11.0, w=2.0, ht=2.2, hb=1.8, zc=0.2, n=3.2),
        dict(x=13.8, w=2.1, ht=2.3, hb=1.85, zc=0.2, n=3.2),
        dict(x=15.8, w=1.9, ht=1.8, hb=1.7, zc=0.1, n=2.9),
        dict(x=17.0, w=1.3, ht=1.0, hb=1.2, zc=0.0, n=2.6),
        dict(x=17.6, w=0.55, ht=0.35, hb=0.5, zc=-0.05, n=2.2),
    ], material='paint2', back_material='dark', count=56)
    F.band(s, 'Cab', (16.4, 0, 0), (1, 0, 0), 1.1, 'paint', inset=0.02, depth=0.02)
    F.band(s, 'Cab', (15.6, 0, 1.2), (1, 0, 0), 1.3, 'glass', facing=(0.55, 0, 0.83), min_facing=0.55)
    F.windows(s, 'CabWin', 12.0, 14.4, 2.08, 0.9, 3, size=(0.5, 0.32), mirror=True)
    F.panel(s, 'Cab', (12.6, 0.0), (1.8, 2.4), 'paint2', inset=0.05, depth=0.05)
    # Identity trim, lit: a thin yellow ring round the graphite cab just behind the blast shield (never on
    # the yellow tanks: same colour vanishes) (LOOK.md: lamps are light).
    F.band(s, 'Cab', (11.5, 0, 0.2), (1, 0, 0), 0.16, 'glow_cyan.rust', inset=0.01, depth=-0.02)

    # --- Drive block aft: heavy, yellow/black striped collar, twin drives, radiator comb on top.
    F.loft(s, 'DriveBlock', [
        dict(x=-16.4, w=2.2, ht=2.1, hb=2.1, zc=0.0, n=3.0),
        dict(x=-15.8, w=2.6, ht=2.5, hb=2.5, zc=0.0, n=3.4),
        dict(x=-11.0, w=2.6, ht=2.5, hb=2.5, zc=0.0, n=3.4),
        dict(x=-10.3, w=2.3, ht=2.2, hb=2.2, zc=0.0, n=3.0),
    ], material='paint2', back_material='dark', count=48)
    for k, x in enumerate((-15.3, -14.55, -13.8)):
        F.band(s, 'DriveBlock', (x, 0, 0), (1, 0, 0), 0.38, 'paint')
    F.panel(s, 'DriveBlock', (-12.1, 0.0), (2.2, 3.2), 'dark', inset=0.05, depth=-0.08)
    # ...and its twin round the graphite drive block's forward end
    F.band(s, 'DriveBlock', (-10.6, 0, 0), (1, 0, 0), 0.16, 'glow_cyan.rust', inset=0.01, depth=-0.02)
    for y in (1.3, -1.3):
        F.nozzle(s, f'Nozzle{y}', (-17.5, y, 0.0), 1.0, 1.2, material='gunmetal', bell=1.15)
    s.hook('HOOK_DRIVE_CORE', (-17.4, 0.0, 0.0))
    F.fins(s, 'Radiator', -12.95, -11.25, 0.0, 2.3, 0.4, 7, thickness=0.1, depth=2.4, material='gunmetal')

    s.detail = 1
    F.rcs(s, 'RCSFwd', (14.4, 2.12, 0.0), size=0.4, mirror=True)
    F.rcs(s, 'RCSAft', (-13.2, 2.62, 0.0), size=0.4, mirror=True)
    F.vent(s, 'CabVent', (12.6, 1.35, 2.3), (1.2, 0.36, 0.12), mirror=True, slats=4)
    F.antenna(s, 'Mast', (14.0, -0.6, 2.45), 1.2, tip='glow_red')
    for i, x0 in enumerate(TANKS):
        F.box(s, f'Gauge{i}', (x0 - 0.8, 0.9, TR + 0.2), (0.3, 0.3, 0.12), material='glow_amber', bevel=0.0)
    s.detail = 0

    F.light(s, 'NavPort', (-9.9, CY + 0.3, CZ), 'glow_red', size=0.24)
    F.light(s, 'NavStarboard', (-9.9, -CY - 0.3, CZ), 'glow_green', size=0.24)
    F.light(s, 'NavPortFwd', (10.1, CY + 0.3, CZ), 'glow_red', size=0.2)
    F.light(s, 'NavStarboardFwd', (10.1, -CY - 0.3, CZ), 'glow_green', size=0.2)
    F.light(s, 'Beacon', (13.4, 0.0, 2.6), 'glow_amber', size=0.3)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
