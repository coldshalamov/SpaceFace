"""Helios Cradle — civilian miner. An ivory tug cradling an ochre ore bin in two arms, drill at the nose.

Helios civil design language: rounded, practical, lit cabin, one occupation colour (miner ochre)
carried in bands. Plan read at the chase camera: a drill point, a round cabin, then a wide waist
where two ivory arms hug the open ore bin, and a drive block with twin bells.
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'helios_cradle'
COLORS = {
    'paint': '#bfb6a3',        # Helios ivory
    'paint2': '#98652a',       # miner ochre, deeper for the big bin mass
    'stripe': '#b87a28',
    'hazard': '#d99a2a',
    'dark.ore': '#241c14',     # ore heap bed, near-black umber
    'ceramic': '#1c1510',
    'ceramic.ore': '#231a12',  # ore lumps
    'ceramic.ore2': '#3a2614',  # rusty lumps
}


def ore_lump(s, name, center, radius, seed, finish='ceramic', squash=0.7):
    """Local helper: a chunky faceted rock (icosphere with fixed pseudo-random displacement)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for i, v in enumerate(bm.verts):
        k = 0.72 + 0.5 * (0.5 + 0.5 * math.sin(seed * 12.9898 + i * 78.233))
        v.co.x *= radius * k * 1.15
        v.co.y *= radius * k
        v.co.z *= radius * k * squash
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                     matrix=F.Matrix.Rotation(seed * 1.7, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return s.add(F._new_object(name, bm, s.slots([finish]), bevel=0.0, smooth_angle=20.0))


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Tug body: drive block aft, a low keel neck under the bin, round cabin forward.
    F.loft(s, 'Body', [
        dict(x=-10.0, w=1.9, ht=1.3, hb=1.4, zc=-0.7, n=3.2),
        dict(x=-9.4, w=2.35, ht=1.7, hb=1.7, zc=-0.7, n=3.4),
        dict(x=-6.2, w=2.45, ht=1.8, hb=1.8, zc=-0.7, n=3.2),
        dict(x=-4.6, w=1.6, ht=1.2, hb=1.9, zc=-1.5, n=3.0),
        dict(x=2.8, w=1.6, ht=1.2, hb=1.9, zc=-1.5, n=3.0),
        dict(x=4.2, w=2.25, ht=2.0, hb=1.8, zc=-0.3, n=2.6),
        dict(x=7.0, w=2.25, ht=2.0, hb=1.7, zc=-0.3, n=2.5),
        dict(x=8.8, w=1.7, ht=1.45, hb=1.2, zc=-0.35, n=2.3),
        dict(x=9.7, w=1.1, ht=0.9, hb=0.8, zc=-0.4, n=2.2),
    ], material='paint', belly='paint2', back_material='dark', front_material='dark', count=56)
    F.band(s, 'Body', (4.8, 0, 0), (1, 0, 0), 0.6, 'stripe', inset=0.02, depth=0.02)
    F.band(s, 'Body', (-7.9, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.02, depth=0.02)
    # Lit cabin trim: a thin ring of lit miner amber on the ivory just aft of the cabin's ochre band
    # (stock glow_amber is the ochre lifted to light, so no extra material).
    F.band(s, 'Body', (4.35, 0, 0), (1, 0, 0), 0.14, 'glow_amber', inset=0.01, depth=-0.02)
    F.panel(s, 'Body', (-7.6, 0.0), (2.6, 2.4), 'dark', inset=0.05, depth=-0.06)

    # The ore bin: a squarish ochre tub, open on top, heaped with ore.
    F.loft(s, 'Bin', [
        dict(x=-5.3, w=2.7, ht=2.0, hb=1.8, zc=0.9, n=4.0),
        dict(x=-4.9, w=3.1, ht=2.4, hb=2.1, zc=0.9, n=4.6),
        dict(x=2.9, w=3.1, ht=2.4, hb=2.1, zc=0.9, n=4.6),
        dict(x=3.3, w=2.7, ht=2.0, hb=1.8, zc=0.9, n=4.0),
    ], material='paint2', count=56, bevel=0.04)
    F.panel(s, 'Bin', (-1.0, 0.0), (6.6, 4.4), 'dark', inset=0.22, depth=-1.2)
    for i, x in enumerate((-4.3, -1.0, 2.3)):
        F.band(s, 'Bin', (x, 0, 0), (1, 0, 0), 0.3, 'gunmetal', inset=0.02, depth=0.05)
    F.band(s, 'Bin', (0, 0, 0.2), (0, 0, 1), 0.5, 'stripe', inset=0.02, depth=0.03)

    # Ore heap inside the well: a dark mound with chunky lumps on it.
    heap = [(-4.25, 1.0, 0.25), (-3.5, 2.1, 0.75), (-1.0, 2.15, 1.0), (1.5, 2.1, 0.75), (2.25, 1.0, 0.25)]
    F.loft(s, 'OreHeap', [dict(x=x, w=w, ht=h, hb=0.05, zc=2.1, n=2.2) for (x, w, h) in heap],
           material='dark.ore', count=32, bevel=0.0, smooth_angle=25.0)
    s.detail = 1
    k = 0
    for i, x in enumerate((-3.5, -2.5, -1.5, -0.5, 0.5, 1.5)):
        for j, y in enumerate((-1.45, -0.5, 0.45, 1.4)):
            jx = 0.25 * math.sin(k * 2.3)
            jy = 0.2 * math.cos(k * 1.7)
            hx = max(0.0, 1.0 - ((x + jx + 1.0) / 3.4) ** 2)
            hy = max(0.0, 1.0 - ((y + jy) / 2.1) ** 2) ** 0.5
            z = 2.1 + 1.0 * hx * hy + 0.05
            r = 0.46 + 0.16 * (0.5 + 0.5 * math.sin(k * 5.1))
            ore_lump(s, f'Ore{k}', (x + jx, y + jy, z), r, seed=k + 1,
                     finish='ceramic.ore2' if k % 3 == 0 else 'ceramic.ore')
            k += 1
    s.detail = 0

    # Cradle arms: rounded ivory sponsons from the cabin shoulders round the bin into the drive block.
    F.loft(s, 'Arm', [
        dict(x=-7.3, y=1.9, w=0.5, ht=0.55, hb=0.5, zc=0.1, n=2.2),
        dict(x=-6.3, y=3.1, w=0.78, ht=0.95, hb=0.8, zc=0.6, n=3.0),
        dict(x=-5.2, y=3.85, w=0.82, ht=1.05, hb=0.9, zc=0.75, n=3.4),
        dict(x=2.9, y=3.85, w=0.82, ht=1.05, hb=0.9, zc=0.75, n=3.4),
        dict(x=4.0, y=3.1, w=0.78, ht=0.95, hb=0.8, zc=0.6, n=3.0),
        dict(x=4.9, y=1.9, w=0.5, ht=0.55, hb=0.5, zc=0.1, n=2.2),
    ], material='paint', belly='paint2', count=40, mirror=True)
    F.band(s, 'Arm', (-1.0, 3.85, 0), (1, 0, 0), 1.6, 'stripe', inset=0.02, depth=0.02, mirror=True)
    F.band(s, 'Arm', (0, 4.05, 0), (0, 1, 0), 0.3, 'gunmetal', facing=(0, 0, 1), min_facing=0.7, inset=0.02,
           depth=-0.03, mirror=True)
    # Lit arm trim: a thin lit amber line down the top of each cradle arm, inboard of the gunmetal
    # rail, broken where it would cross the arm's ochre band (lit ochre on ochre vanishes).
    for lo, hi in ((-5.2, -1.95), (-0.05, 2.9)):
        F.band(s, 'Arm', (0, 3.62, 0), (0, 1, 0), 0.14, 'glow_amber', facing=(0, 0, 1), min_facing=0.7,
               inset=0.01, depth=-0.02, mirror=True, region=(('x', lo, hi),))
    # Clamps: an ivory post off each arm up the bin wall, a gunmetal claw over the rim, a ram.
    for i, x in enumerate((-3.2, 1.2)):
        F.box(s, f'ClampPost{i}', (x, 3.28, 2.4), (1.0, 0.45, 2.2), material='paint', bevel=0.06, mirror=True)
        F.box(s, f'ClampClaw{i}', (x, 2.95, 3.45), (1.15, 1.0, 0.34), material='gunmetal', bevel=0.05,
              mirror=True)
        F.box(s, f'ClampHinge{i}', (x, 3.5, 1.6), (1.1, 0.5, 0.3), material='dark', bevel=0.02, mirror=True)
    s.detail = 1
    for i, x in enumerate((-3.2, 1.2)):
        F.cylinder(s, f'Ram{i}', (x - 1.4, 3.9, 1.5), (x - 0.5, 3.45, 2.9), 0.12, material='bare', segments=12,
                   mirror=True)
    s.detail = 0

    # Cabin glass and lit windows
    F.band(s, 'Body', (8.1, 0, 0), (1, 0, 0), 1.5, 'glass', facing=(0.35, 0, 0.9), min_facing=0.3,
           inset=0.03, depth=-0.02)
    F.panel(s, 'Body', (6.0, 0.0), (1.5, 1.7), 'paint', inset=0.04, depth=0.035)
    F.windows(s, 'CabinWin', 4.6, 7.2, 2.24, -0.2, 4, size=(0.45, 0.25), mirror=True)
    F.windows(s, 'CabinWinHi', 5.0, 7.0, 2.13, 0.62, 3, size=(0.5, 0.3), mirror=True)

    # Drill head at the nose: ochre collar, gunmetal cone with dark flute rings.
    F.cylinder(s, 'DrillCollar', (9.4, 0.0, -0.4), (10.4, 0.0, -0.4), 1.12, 1.0, material='stripe', segments=32)
    F.cylinder(s, 'DrillCone', (10.3, 0.0, -0.4), (13.0, 0.0, -0.4), 0.9, 0.06, material='gunmetal', segments=32)
    for x in (10.85, 11.5, 12.1):
        F.band(s, 'DrillCone', (x, 0, 0), (1, 0, 0), 0.14, 'dark')

    # Drive: twin bells in the aft block.
    F.nozzle(s, 'Nozzle', (-10.8, 1.2, -0.7), 0.92, 1.0, material='gunmetal', mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-10.6, 0.0, -0.7))

    s.detail = 1
    F.vent(s, 'Vent', (-7.6, 0.7, 1.08), (1.8, 0.6, 0.12), mirror=True)
    F.rcs(s, 'RCS', (6.0, 2.3, 0.6), mirror=True)
    F.antenna(s, 'Mast', (4.6, 0.7, 1.65), 1.2, tip='glow_red')
    F.sensor_dome(s, 'Dome', (4.9, -0.6, 1.62), 0.32)
    # Work floods on the arm noses and an orange work lamp either side of the drill.
    F.box(s, 'FloodHousing', (3.55, 3.7, 1.55), (0.6, 0.8, 0.45), material='gunmetal', mirror=True, rot_z=-0.6)
    s.detail = 0
    F.light(s, 'Flood', (3.85, 3.92, 1.58), 'glow_warm', size=0.36, mirror=True)
    F.light(s, 'WorkLamp', (9.9, 0.7, 0.55), 'glow_amber', size=0.3, mirror=True)
    F.light(s, 'NavPort', (-1.0, 4.58, 1.25), 'glow_red', size=0.3)
    F.light(s, 'NavStarboard', (-1.0, -4.58, 1.25), 'glow_green', size=0.3)
    F.light(s, 'Beacon', (-8.9, 0.0, 1.05), 'glow_amber', size=0.2)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
