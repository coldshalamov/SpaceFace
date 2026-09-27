"""SCN claim overlay for the Helios trade hub — the Concord picket. Forge rebuild of the
pre-Forge blockout var_station_trade_hub_scn_overlay_v01.glb (same file, same asset id).

Idea: "navy picket armour around the harbour". The Solar Concord Navy does not decorate the
market wheel — it fortifies it: an armoured cladding band wrapped round the ring wall with a
Concord-blue top rail, four bastion keeps straddling the wall on the diagonals (feet down onto
the mooring arms), six comm/sensor masts on the ring roofs, and a twin docking-boom picket
cantilevered off the freight terminal at -X ending in a lit clearance gate.
Three values: pale authority blue-grey coat, navy secondary, charcoal machinery. Identity
colour: Concord blue #3A78FF, authored dark and carried in cut bands and the rail. Lights: blue
running lights on bastion corners, mast tips, gate clearance lamps, sparse warm windows.
The overlay hangs on the hub's frame (hub_overlay_kit): ring wall r 54, roofs at z ~28.2,
mouth at +X kept open (the band's facets skip the mouth arc).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import hub_overlay_kit as K  # noqa: E402

SHIP_ID = 'var_station_trade_hub_scn_overlay_v01'
COLORS = {
    'paint': '#66727f',            # authority blue-grey coat (SCN hull #C8D8F0, authored dark)
    'paint2': '#262f3d',           # concord navy secondary
    'paint.graphite': '#23282e',
    'stripe': '#1e4396',           # concord blue #3A78FF, authored dark — carried in bands/rail
    'hazard': '#a8861c',
    'dark': '#15181c',
    'glow_cyan.scn': '#6f9dff',    # concord blue running light
    'glow_warm': '#ffc27a',
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
}

DIAGONALS = (45.0, 135.0, 225.0, 315.0)
MASTS = (38.0, 100.0, 142.0, 218.0, 260.0, 322.0)


def build_cladding(s):
    """Armour cladding wrapped round the ring's outer wall (r 54 + fenders to ~55.5), mouth open."""
    K.ring_wall(s, 'Cladding', 56.6, K.RING_Z0 + 0.5, 30.2, 2.4, 'paint', segs=64, bevel=0.0,
                skip=lambda a: K.in_mouth(a, 4.0))
    # Concord-blue top rail and a navy base rail: the claim reads as a blue line round the wall
    K.ring_wall(s, 'CladdingRail', 56.9, 29.8, 30.6, 0.9, 'stripe', segs=64, bevel=0.0,
                skip=lambda a: K.in_mouth(a, 4.0))
    K.ring_wall(s, 'CladdingBase', 56.9, K.RING_Z0 + 0.4, K.RING_Z0 + 1.4, 0.9, 'paint2', segs=64,
                bevel=0.0, skip=lambda a: K.in_mouth(a, 4.0))
    # thickened keeps under each bastion so the towers visibly stand on the band
    for i, a in enumerate(DIAGONALS):
        K.ring_wall(s, f'CladdingKeep{i}', 59.2, 16.0, 32.4, 3.8, 'paint2', segs=64,
                    skip=lambda aa, a=a: not K.near(aa, a, 7.5), bevel=0.05)


def build_bastion(s, k, a):
    """One armoured keep straddling the ring wall on a diagonal, feet onto the mooring arm."""
    # footing plate over the mooring deck (arm top ~z 15.9, deck top ~16.4)
    F.box(s, f'Bastion{k}Foot', K.polar(58.0, a, 17.9), (18.0, 19.0, 3.4), material='paint2',
          rot_z=math.radians(a), bevel=0.15)
    # short legs tie the footing down onto the mooring truss work (top ~15.9)
    for e in (-1, 1):
        F.box(s, f'Bastion{k}Leg{e:+d}', K.polar(60.5, a + e * 5.0, 16.5), (3.0, 2.6, 1.6),
              material='dark', rot_z=math.radians(a + e * 5.0), bevel=0.0)
    # the keep: pale coat block over the wall crest
    F.box(s, f'Bastion{k}', K.polar(57.5, a, 25.4), (16.0, 15.0, 12.6), material='paint',
          rot_z=math.radians(a), bevel=0.25)
    F.band(s, f'Bastion{k}', K.polar(57.5, a, 28.7), (0, 0, 1), 1.0, 'stripe', inset=0.05, depth=0.1)
    # sloped-look outer armour: a navy plate layered proud on the seaward face
    F.box(s, f'Bastion{k}Face', K.polar(64.4, a, 25.8), (1.6, 11.0, 9.0), material='paint2',
          rot_z=math.radians(a), bevel=0.12)
    # parapet deck, watch posts, fittings
    F.box(s, f'Bastion{k}Deck', K.polar(57.5, a, 32.3), (14.0, 13.0, 1.6), material='paint.graphite',
          rot_z=math.radians(a), bevel=0.1)
    for e in (-1, 1):
        F.box(s, f'Bastion{k}Post{e:+d}', K.polar(62.0, a + e * 9.0, 33.6), (1.4, 1.4, 2.0),
              material='paint', rot_z=math.radians(a + e * 9.0), bevel=0.0)
        F.light(s, f'Bastion{k}Lamp{e:+d}', K.polar(62.2, a + e * 9.5, 34.7), 'glow_cyan.scn', size=0.5)
    F.sensor_dome(s, f'Bastion{k}Dome', K.polar(51.0, a - 7.0, 33.4), 1.5, material='gunmetal',
                  lens='glow_cyan.scn')
    F.box(s, f'Bastion{k}Vent', K.polar(53.0, a + 6.0, 33.4), (3.6, 2.0, 0.5), material='gunmetal',
          rot_z=math.radians(a + 6.0), bevel=0.0)


def build_mast(s, k, a):
    """Comm mast on a ring roof: foot block, lattice mast, top yard, blue tip."""
    base = K.polar(41.0, a)
    F.box(s, f'Mast{k}Base', (base[0], base[1], 28.5), (3.0, 3.0, 1.7), material='paint2',
          rot_z=math.radians(a), bevel=0.08)
    F.truss(s, f'Mast{k}', (base[0], base[1], 29.0), (base[0], base[1], 49.5), 1.7, 6,
            material='gunmetal', chord=0.28, web=0.16)
    F.box(s, f'Mast{k}Yard', (base[0], base[1], 48.4), (0.5, 5.0, 0.5), material='gunmetal',
          rot_z=math.radians(a + 90.0), bevel=0.0)
    F.light(s, f'Mast{k}YardL', (base[0] - 2.4 * math.sin(math.radians(a)),
                                base[1] + 2.4 * math.cos(math.radians(a)), 48.4),
            'glow_cyan.scn', size=0.35)
    F.antenna(s, f'Mast{k}Whip', (base[0], base[1], 49.5), 3.6, tip='glow_cyan.scn')
    F.light(s, f'Mast{k}Strobe', (base[0], base[1], 40.0), 'glow_warm', size=0.3)


def build_booms(s):
    """Twin docking booms cantilevered off the freight terminal at -X, joined by a lit gate."""
    for e in (-1, 1):
        y = e * 22.0
        # hinge collar on the terminal roof
        F.box(s, f'BoomHinge{e:+d}', (-52.0, y, 27.6), (5.0, 4.4, 3.2), material='paint2',
              bevel=0.15)
        F.band(s, f'BoomHinge{e:+d}', (-52.0, y, 28.4), (0, 0, 1), 0.8, 'stripe')
        # the boom: lattice chord out to x -88, sagging slightly upward at the tip
        F.truss(s, f'Boom{e:+d}', (-52.0, y, 28.6), (-88.0, y + e * 2.0, 30.0), 2.1, 10,
                material='gunmetal', chord=0.34, web=0.2)
        # back-stay from mid-boom down onto the terminal face
        F.beams(s, f'BoomStay{e:+d}',
                [((-68.0, y + e * 1.0, 29.3), (K.TERM_X0 - 0.3, e * 26.0, 19.0))], 1.0,
                material='paint.graphite')
        # clearance post hanging from the boom tip
        F.box(s, f'GatePost{e:+d}', (-88.0, y + e * 2.0, 27.2), (1.6, 1.6, 6.4),
              material='paint2', bevel=0.08)
        F.light(s, f'GateTip{e:+d}', (-88.0, y + e * 2.0, 23.9),
                'glow_red' if e > 0 else 'glow_green', size=0.5)
    # the gate: a lintel joining the two boom tips, blue-banded, clearance lamps under it
    F.box(s, 'GateLintel', (-88.0, 0.0, 30.8), (1.8, 49.0, 1.6), material='paint', bevel=0.1)
    F.band(s, 'GateLintel', (-88.0, 0.0, 30.8), (1, 0, 0), 1.0, 'stripe')
    for y in (-14.0, 0.0, 14.0):
        F.light(s, f'GateLamp{y:+.0f}', (-88.0, y, 29.8), 'glow_warm', size=0.45)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_cladding(s)
    for k, a in enumerate(DIAGONALS):
        build_bastion(s, k, a)
    for k, a in enumerate(MASTS):
        build_mast(s, k, a)
    build_booms(s)
    s.detail = 1
    # small armour patches on the cladding and a few warm watch windows in the keeps
    patches = []
    for i in range(12):
        a = 28.0 + i * 28.0
        if K.in_mouth(a, 6.0):
            continue
        patches.append(K.tangent_box(a, 56.9, 24.0 + (i % 3) * 1.6, 1.0, 4.6, 2.2))
    F.boxes(s, 'CladdingPatch', patches, 'paint2', bevel=0.03)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
