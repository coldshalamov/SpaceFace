"""Ore Barge — Helios-registered ore carrier. A long, low open hopper barge with a bridge tower aft.

Work-fleet build on a Helios hull: ivory deck, ochre lower hull, hazard-yellow coamings between
four open hoppers heaped with dark ore, a gantry over the deck, a small bridge tower and a big
four-bell drive block. Plan read at the chase camera: a long ivory plank with four dark wells.
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'ore_barge'
COLORS = {
    'paint': '#bfb6a3',        # Helios ivory deck and superstructure
    'paint2': '#9a6526',       # ochre lower hull (deepened: a 40 m ochre flank lifts a lot)
    'stripe': '#b87a28',       # ore-trade ochre bands
    'hazard': '#d9a21e',       # hazard yellow coamings
    'dark.ore': '#241c14',     # ore heap bed, near-black umber
    'ceramic': '#1c1510',
    'ceramic.ore': '#231a12',  # ore lumps
    'ceramic.ore2': '#3a2614',  # rusty lumps
}

HOPPERS = (12.0, 5.0, -2.0, -9.0)   # hopper centres (x); each 6.0 m long, 5.6 m wide
HOPPER_LEN, HOPPER_W = 6.0, 5.6
DECK = 1.4                           # deck height
FLOOR = -0.1                         # hopper floor (approx.)


def ore_lump(s, name, center, radius, seed, finish='ceramic', squash=0.7):
    """Local helper: a chunky faceted rock (icosphere with fixed pseudo-random displacement)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for i, v in enumerate(bm.verts):
        k = 0.72 + 0.5 * (0.5 + 0.5 * math.sin(seed * 12.9898 + i * 78.233))
        v.co.x *= radius * k * 1.15
        v.co.y *= radius * k
        v.co.z *= radius * k * squash
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=F.Matrix.Rotation(seed * 1.7, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return s.add(F._new_object(name, bm, s.slots([finish]), bevel=0.0, smooth_angle=20.0))


def ore_load(s, name, cx, fill, seed0):
    """A heap of ore in one hopper: dark mound plus lumps; fill = peak height above the floor."""
    half = HOPPER_LEN / 2 - 0.35
    secs = [(cx - half, 1.2, fill * 0.3), (cx - half * 0.6, 2.45, fill * 0.85), (cx, 2.5, fill),
            (cx + half * 0.6, 2.45, fill * 0.85), (cx + half, 1.2, fill * 0.3)]
    F.loft(s, name + 'Heap', [dict(x=x, w=w, ht=h, hb=0.05, zc=FLOOR, n=2.2) for (x, w, h) in secs],
           material='dark.ore', count=32, bevel=0.0, smooth_angle=25.0)
    s.detail = 1
    k = 0
    for x in (-2.2, -1.1, 0.0, 1.1, 2.2):
        for y in (-1.65, -0.55, 0.55, 1.65):
            n = seed0 + k
            jx = 0.3 * math.sin(n * 2.3)
            jy = 0.2 * math.cos(n * 1.7)
            hx = max(0.0, 1.0 - ((x + jx) / 2.9) ** 2)
            hy = max(0.0, 1.0 - ((y + jy) / 2.5) ** 2) ** 0.5
            z = FLOOR + fill * hx * hy + 0.05
            r = 0.5 + 0.2 * (0.5 + 0.5 * math.sin(n * 5.1))
            ore_lump(s, f'{name}Ore{k}', (cx + x + jx, y + jy, z), r, seed=n,
                     finish='ceramic.ore2' if n % 3 == 0 else 'ceramic.ore')
            k += 1
    s.detail = 0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Hull: a long low box-section barge with a rounded, raked bow.
    F.loft(s, 'Hull', [
        dict(x=-18.6, w=3.3, ht=1.2, hb=1.5, zc=0.0, n=4.0),
        dict(x=-17.6, w=3.8, ht=DECK, hb=1.7, zc=0.0, n=4.6),
        dict(x=14.8, w=3.8, ht=DECK, hb=1.7, zc=0.0, n=4.6),
        dict(x=17.6, w=3.5, ht=DECK, hb=1.4, zc=0.0, n=4.0),
        dict(x=19.3, w=2.9, ht=1.25, hb=1.0, zc=0.12, n=3.4),
        dict(x=20.0, w=2.2, ht=0.95, hb=0.6, zc=0.25, n=3.0),
    ], material='paint', belly='paint2', front_material='gunmetal', back_material='dark', count=40)
    # Ochre flank band and a hazard sheer stripe along both sides.
    F.band(s, 'Hull', (0, 0, -0.55), (0, 0, 1), 0.9, 'stripe')
    F.band(s, 'Hull', (0, 0, 0.62), (0, 0, 1), 0.26, 'hazard')
    # Ochre walkway stripes down both side decks.
    for y in (3.35, -3.35):
        F.band(s, 'Hull', (0, y, 0), (0, 1, 0), 0.5, 'stripe', facing=(0, 0, 1), min_facing=0.6, inset=0.02,
               depth=0.02)
    # The four open hoppers, sunk into the deck.
    for i, x in enumerate(HOPPERS):
        F.panel(s, 'Hull', (x, 0.0), (HOPPER_LEN, HOPPER_W), 'dark', inset=0.22, depth=-1.5)
    # Hazard coamings across the deck between the hoppers.
    for x in (15.55, 8.5, 1.5, -5.5, -12.5):
        F.band(s, 'Hull', (x, 0, 0), (1, 0, 0), 0.55, 'hazard', facing=(0, 0, 1), min_facing=0.6, inset=0.02,
               depth=0.04)

    for i, (x, fill) in enumerate(zip(HOPPERS, (1.0, 1.15, 1.55, 0.55))):
        ore_load(s, f'H{i}', x, fill, seed0=i * 17 + 3)

    # Forecastle: a raised bow deck with a windlass and bow floods.
    F.plate(s, 'Forecastle', [(15.9, 3.15), (18.6, 2.55), (19.5, 1.7), (19.5, -1.7), (18.6, -2.55), (15.9, -3.15)],
            z0=1.15, thickness=0.85, material='paint', chamfer=0.18, side_material='paint2')
    F.band(s, 'Forecastle', (19.0, 0, 0), (1, 0, 0), 0.35, 'hazard', facing=(0, 0, 1), min_facing=0.6)
    F.panel(s, 'Forecastle', (17.0, 0.0), (1.2, 3.2), 'dark', inset=0.04, depth=-0.05)
    F.cylinder(s, 'Windlass', (18.1, -1.3, 2.25), (18.1, 1.3, 2.25), 0.34, material='gunmetal', segments=20,
               cap_material='dark')
    F.box(s, 'WindlassFoot', (18.1, 0.0, 1.98), (0.8, 2.2, 0.2), material='gunmetal', bevel=0.02)

    # Bow push-fender.
    F.box(s, 'BowFender', (20.05, 0.0, 0.25), (0.7, 4.0, 1.2), material='gunmetal', bevel=0.08)
    F.band(s, 'BowFender', (20.05, 0.0, 0.25), (0, 0, 1), 0.3, 'hazard', inset=0.01, depth=0.01)

    # Side rub strakes (dark) the length of the hull.
    F.box(s, 'Strake', (-1.5, 3.83, 0.1), (32.0, 0.26, 0.32), material='gunmetal', bevel=0.04, mirror=True)

    # Gantry crane straddling the deck.
    F.box(s, 'GantryLeg', (1.5, 3.2, 2.5), (0.55, 0.55, 2.3), material='paint', bevel=0.05, mirror=True)
    F.box(s, 'GantryBeam', (1.5, 0.0, 3.8), (0.7, 7.2, 0.5), material='paint', bevel=0.06)
    F.band(s, 'GantryBeam', (1.5, 0.0, 0), (0, 1, 0), 1.2, 'hazard', facing=(0, 0, 1), min_facing=0.6)
    F.box(s, 'GantryTrolley', (1.5, 1.6, 3.5), (1.0, 1.1, 0.6), material='gunmetal', bevel=0.04)
    F.box(s, 'GantryFoot', (1.5, 3.2, 1.42), (1.0, 0.9, 0.2), material='gunmetal', bevel=0.03, mirror=True)

    # Bridge tower aft: a narrow base and a wider lit bridge on top.
    F.loft(s, 'TowerBase', [
        dict(x=-16.2, w=1.35, ht=1.3, hb=1.3, zc=2.3, n=4.0),
        dict(x=-15.8, w=1.7, ht=1.3, hb=1.3, zc=2.3, n=4.2),
        dict(x=-13.6, w=1.7, ht=1.3, hb=1.3, zc=2.3, n=4.2),
        dict(x=-13.2, w=1.35, ht=1.3, hb=1.3, zc=2.3, n=4.0),
    ], material='paint', count=40)
    F.loft(s, 'Bridge', [
        dict(x=-16.7, w=2.2, ht=0.75, hb=0.6, zc=4.1, n=3.4),
        dict(x=-16.3, w=2.7, ht=0.85, hb=0.65, zc=4.1, n=3.6),
        dict(x=-13.4, w=2.7, ht=0.85, hb=0.65, zc=4.1, n=3.6),
        dict(x=-12.6, w=2.2, ht=0.65, hb=0.55, zc=4.05, n=3.0),
    ], material='paint', belly='paint2', front_material='glass', count=40)
    F.band(s, 'Bridge', (-13.05, 0, 0), (1, 0, 0), 0.8, 'glass', min_facing=0.3, facing=(1, 0, 0.3), inset=0.02,
           depth=-0.02)
    F.band(s, 'Bridge', (-15.2, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.02, depth=0.02)
    F.windows(s, 'BridgeWin', -16.1, -13.8, 2.72, 4.1, 4, size=(0.4, 0.26), mirror=True)
    F.windows(s, 'TowerWin', -15.6, -13.8, 1.72, 2.6, 2, size=(0.4, 0.3), mirror=True)

    # Drive block: wider than the hull, four bells in a square.
    F.loft(s, 'Drive', [
        dict(x=-22.0, w=4.1, ht=1.9, hb=1.9, zc=0.0, n=4.2),
        dict(x=-21.4, w=4.55, ht=2.2, hb=2.2, zc=0.0, n=4.6),
        dict(x=-18.6, w=4.55, ht=2.2, hb=2.2, zc=0.0, n=4.6),
        dict(x=-17.8, w=3.5, ht=1.6, hb=1.8, zc=0.0, n=4.0),
    ], material='paint', belly='paint2', back_material='dark', count=40)
    F.band(s, 'Drive', (-19.2, 0, 0), (1, 0, 0), 0.6, 'stripe', inset=0.02, depth=0.03)
    F.band(s, 'Drive', (-21.2, 0, 0), (1, 0, 0), 0.3, 'hazard', inset=0.02, depth=0.02)
    F.panel(s, 'Drive', (-20.2, 0.0), (1.4, 2.0), 'dark', inset=0.05, depth=-0.06)
    for y in (-1.95, 1.95):
        for z in (-1.0, 1.0):
            F.nozzle(s, f'Nozzle{int(y * 10)}_{int(z * 10)}', (-22.75, y, z), 0.92, 1.1, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-22.6, 0.0, 0.0))

    s.detail = 1
    F.fins(s, 'Radiator', -21.0, -18.9, 2.75, 2.1, 0.45, 5, thickness=0.08, depth=1.3, mirror=True)
    F.cylinder(s, 'PipeRun', (-12.0, 2.98, 1.43), (15.0, 2.98, 1.43), 0.12, material='bare', segments=12,
               mirror=True)
    for x in (-10.0, -2.0, 5.0, 12.0):
        F.box(s, f'PipeClamp{int(x * 10)}', (x, 2.98, 1.34), (0.2, 0.4, 0.26), material='gunmetal', bevel=0.01,
              mirror=True)
    F.rcs(s, 'RCSBow', (17.0, 3.6, 0.2), mirror=True)
    F.rcs(s, 'RCSAft', (-20.0, 4.57, 0.0), mirror=True)
    F.antenna(s, 'Mast', (-15.3, 0.0, 4.9), 1.6, tip=None)
    F.sensor_dome(s, 'Dome', (-14.0, 0.0, 4.92), 0.35)
    F.box(s, 'LampBar', (-12.8, 0.0, 4.82), (0.25, 2.4, 0.18), material='gunmetal', bevel=0.01)
    s.detail = 0
    F.light(s, 'Flood', (-12.66, 0.8, 4.84), 'glow_warm', size=0.2, mirror=True)
    F.light(s, 'Beacon', (-15.3, 0.0, 6.55), 'glow_amber', size=0.22)
    F.light(s, 'BowLamp', (20.42, 1.4, 0.35), 'glow_warm', size=0.22, mirror=True)
    F.light(s, 'FoscleFlood', (19.52, 1.0, 1.62), 'glow_warm', size=0.24, mirror=True)
    F.light(s, 'NavPort', (-19.8, 4.6, 1.0), 'glow_red', size=0.3)
    F.light(s, 'NavStarboard', (-19.8, -4.6, 1.0), 'glow_green', size=0.3)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
