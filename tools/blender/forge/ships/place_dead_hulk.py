"""Dead hulk — the big derelict landmark that doubles as the Quiessence stand-in hull.
Forge rebuild of place_dead_hulk.glb (same file, same asset id, sockets copied from live).

Idea: "a gutted long-haul freighter, ribs bared to the dark". The hull lies along +X: a blunt
bow forward, a long plated belly, and the starboard-dorsal quarter blown open for a third of
its length — skin peeled back in hinged plates over a dark inner hull, the frame rings bare.
Stern is a cold engine block with dead nozzles. One dim amber beacon still burns on the
dorsal stub; every other lamp is out.
Three values: faded bone-slate hull skin, charcoal machinery/frames, near-black interior and
nozzle throats. Identity colour: none alive — one dying amber light.
Live bounds (Blender): x [-27.4, 27.3], y [-6.4, 6.4], z [-5.5, 6.4]. Wound x [-4, 7.3]
opens on the upper-starboard arc (the -Y/+Z quadrant).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_dead_hulk'
COLORS = {
    # deadmetal hull skins: very low albedo + high roughness so the wreck reads dead-dark under
    # the sector key instead of washing pale.
    'deadmetal': '#0e0d0b',      # faded dead hull, near-charcoal
    'deadmetal.deep': '#101318', # charcoal secondary plating
    'stripe': '#1c160a',      # dead ochre company band, near-black in shadow
    'gunmetal': '#23282e',
    'dark': '#0e1114',        # interior and nozzle throats
    'bare': '#3a342c',        # burnt bare metal at the wound rim
    'ceramic': '#8a8274',     # pale insulation showing in the wound edges
    'hazard': '#7a6420',
    'glow_amber': '#c88f2a',  # the one dying beacon
}

WOUND_X0, WOUND_X1 = -4.5, 7.5
HULL_R = 5.55


def _hull_section(s, name, x0, x1, r0, r1=None, seg=14):
    F.cylinder(s, name, (x0, 0, 0), (x1, 0, 0), r0, r1, material='deadmetal', segments=seg,
               cap=False, bevel=0.0, uv_scale=3.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- fore hull: intact skin from the bow to the wound lip -------------------
    _hull_section(s, 'HullFore', WOUND_X0, -21.0, HULL_R)
    F.cylinder(s, 'Bow', (-27.2, 0, 0), (-21.0, 0, 0), 3.6, HULL_R, material='deadmetal',
               segments=14, bevel=0.06, uv_scale=3.0)
    F.cylinder(s, 'BowCap', (-27.6, 0, 0), (-27.2, 0, 0), 3.0, material='deadmetal.deep',
               segments=10, bevel=0.0)
    # bow beacon stub mast, snapped short
    F.cylinder(s, 'BowMast', (-23.5, 0, 4.6), (-22.8, 0, 7.4), 0.32, 0.14, material='gunmetal',
               segments=8)
    # company band at the bow and ahead of the wound
    F.ring(s, 'BowBand', (-20.4, 0, 0), HULL_R + 0.10, 0.55, axis=(1, 0, 0), material='stripe',
           segments=14, sides=6)
    F.ring(s, 'ForeRim', (WOUND_X0 - 0.4, 0, 0), HULL_R + 0.10, 0.7, axis=(1, 0, 0),
           material='bare', segments=14, sides=6)

    # --- aft hull: skin from the wound lip to the stern -------------------------
    _hull_section(s, 'HullAft', WOUND_X1, 22.0, HULL_R, 4.9)
    F.ring(s, 'AftRim', (WOUND_X1 + 0.4, 0, 0), HULL_R + 0.10, 0.7, axis=(1, 0, 0),
           material='bare', segments=14, sides=6)
    F.ring(s, 'AftBand', (16.0, 0, 0), HULL_R - 0.25, 0.5, axis=(1, 0, 0), material='stripe',
           segments=14, sides=6)

    # stern engine block and dead nozzles
    F.box(s, 'EngineBlock', (24.6, 0, 0), (6.4, 9.2, 9.0), material='deadmetal.deep', bevel=0.3)
    F.band(s, 'EngineBlock', (25.4, 0, 0), (1, 0, 0), 1.6, 'bare', inset=0.06, depth=0.12)
    for iy, iz in ((-1.9, 1.9), (1.9, 1.9), (-1.9, -1.9), (1.9, -1.9), (0.0, 0.0)):
        F.cylinder(s, f'Nozzle{iy}{iz}', (27.6, iy, iz), (25.6, iy, iz), 1.45, 1.15,
                   material='gunmetal', segments=10, bevel=0.05)
        F.cylinder(s, f'NozzleDark{iy}{iz}', (28.0, iy, iz), (27.4, iy, iz), 1.05,
                   material='dark', segments=10, bevel=0.0)
    F.box(s, 'KeelSkeg', (20.0, 0, -5.1), (14.0, 1.2, 1.8), material='deadmetal.deep', bevel=0.1)
    # snapped dorsal fin stub
    F.box(s, 'FinStub', (13.0, 0, 5.7), (5.0, 0.9, 3.0), material='deadmetal.deep', bevel=0.15,
          rot=(0, math.radians(-24), 0))

    # --- the wound: dark inner hull, bare frames, peeled plates -----------------
    # inner hull visible in the hole — smaller radius, near-black
    F.cylinder(s, 'InnerCore', (WOUND_X0 - 0.5, 0, 0), (WOUND_X1 + 0.5, 0, 0), 4.35,
               material='dark', segments=12, cap=True, bevel=0.0, uv_scale=2.0)
    # belly shell under the wound so the hull still reads as a tube
    F.box(s, 'WoundBelly', (1.5, 0, -4.1), (12.4, 8.6, 2.6), material='deadmetal', bevel=0.2)
    F.box(s, 'WoundBellyRimA', (WOUND_X0 + 0.3, 0, -3.4), (0.8, 8.2, 1.4), material='bare',
          bevel=0.05)
    F.box(s, 'WoundBellyRimB', (WOUND_X1 - 0.3, 0, -3.4), (0.8, 8.2, 1.4), material='bare',
          bevel=0.05)
    # frame rings standing bare across the gap
    for i, x in enumerate((-3.6, -0.6, 2.4, 5.4, 7.1)):
        F.ring(s, f'Frame{i}', (x, 0, 0), 5.15, 0.42, axis=(1, 0, 0), material='gunmetal',
               segments=12, sides=6)
    # insulation collars just inside each wound lip
    for x in (WOUND_X0 - 0.2, WOUND_X1 + 0.2):
        F.ring(s, f'Insul{x}', (x, 0, 0), 4.9, 0.55, axis=(1, 0, 0), material='ceramic',
               segments=12, sides=6)
    # dead tanks and a service trunk visible in the dark interior
    F.cylinder(s, 'InnerTank', (-2.5, -1.2, -0.6), (4.5, -1.2, -0.6), 1.35, material='deadmetal.deep',
               segments=10, bevel=0.0)
    F.cylinder(s, 'InnerPipe', (-4.0, 1.6, -1.4), (7.0, 1.6, -1.4), 0.4, material='gunmetal',
               segments=8)
    # peeled plates still hinged on the wound rims — opened like a tin lid
    F.box(s, 'TearTop', (1.4, -0.6, 6.9), (11.6, 3.4, 0.32), material='deadmetal', bevel=0.04,
          rot=(math.radians(38), 0, 0))
    F.box(s, 'TearTopB', (0.2, -1.4, 7.6), (7.4, 2.6, 0.28), material='bare', bevel=0.03,
          rot=(math.radians(58), 0, math.radians(-8)))
    F.box(s, 'TearStbd', (1.8, -6.7, 1.8), (10.6, 0.3, 4.4), material='deadmetal', bevel=0.04,
          rot=(0, math.radians(30), 0))
    F.box(s, 'TearStbdB', (5.4, -7.1, 0.4), (5.2, 0.26, 3.2), material='bare', bevel=0.03,
          rot=(0, math.radians(46), math.radians(6)))
    # torn shard teeth along the rim
    s.detail = 1
    shards = []
    for i in range(7):
        x = WOUND_X0 + 0.7 + i * 1.7
        shards.append(((x, -4.9 + 0.25 * (i % 2), 3.6 + 0.4 * ((i * 2) % 3)), (0.3, 0.9, 0.16), 0.0))
    for i in range(6):
        x = WOUND_X0 + 1.4 + i * 1.9
        shards.append(((x, -2.2 - 0.3 * (i % 2), 5.6), (0.26, 1.1, 0.15), 0.0))
    F.boxes(s, 'RimTeeth', shards, 'bare')
    s.detail = 0

    # --- surface detail on the intact skin --------------------------------------
    # hull plate seams fore and aft
    for i, x in enumerate((-17.5, -12.5, -8.0)):
        F.ring(s, f'ForeSeam{i}', (x, 0, 0), HULL_R + 0.04, 0.18, axis=(1, 0, 0),
               material='deadmetal.deep', segments=14, sides=4)
    for i, x in enumerate((10.5, 14.5, 19.0)):
        F.ring(s, f'AftSeam{i}', (x, 0, 0), HULL_R + 0.02, 0.18, axis=(1, 0, 0),
               material='deadmetal.deep', segments=14, sides=4)
    # dead window rows on the port flank — glass, unlit
    s.detail = 1
    dead = []
    for i in range(12):
        x = -18.5 + i * 1.15
        dead.append(((x, 4.15, 2.6), (0.55, 0.24, 0.5), 0.0))
    F.boxes(s, 'DeadWindowsP', dead, 'dark')
    dead2 = [((x, -4.15, 2.9), (0.5, 0.24, 0.45), 0.0) for x in (-19.0, -17.8, -16.6)]
    F.boxes(s, 'DeadWindowsS', dead2, 'dark')
    s.detail = 0
    # keel stringer and ventral hatch
    F.box(s, 'Keel', (-14.0, 0, -5.5), (22.0, 0.7, 0.6), material='deadmetal.deep', bevel=0.05)
    F.box(s, 'VentralHatch', (-11.0, 0, -5.35), (3.4, 2.6, 0.5), material='gunmetal', bevel=0.05)
    # folded comms whip off the fore hull
    F.cylinder(s, 'WhipA', (-9.5, 4.9, -0.5), (-6.0, 7.6, -1.2), 0.09, material='gunmetal',
               segments=6, bevel=0.0)
    F.cylinder(s, 'WhipB', (-9.5, 4.9, -0.5), (-7.4, 6.9, 1.9), 0.08, material='gunmetal',
               segments=6, bevel=0.0)

    # --- the one dying light -----------------------------------------------------
    F.light(s, 'DyingBeacon', (13.0, 0.0, 7.4), 'glow_amber', size=0.5)
    F.box(s, 'BeaconBase', (13.0, 0.0, 7.1), (0.9, 0.9, 0.5), material='gunmetal', bevel=0.05)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
