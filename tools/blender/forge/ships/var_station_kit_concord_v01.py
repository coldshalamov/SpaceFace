"""Concord (SCN) faction station kit — row 512. White enamel and beacon dressing over the
canonical station shell: a pale armoured band with the Concord-blue rail, four watch keeps
on the cardinals, and the blue beacon crown — the picket that claims the harbour."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_concord_v01'
COLORS = {
    'paint': '#7e8c9c',            # pale authority coat, authored dark
    'paint2': '#26303e',           # concord navy secondary
    'stripe': '#1e4396',           # concord blue #3A78FF, authored dark
    'gunmetal': '#424a54',
    'dark': '#151a20',
    'glow_cyan.scn': '#6f9dff',
    'glow_warm': '#ffc27a',
}

CARDINALS = (0.0, 90.0, 180.0, 270.0)


def dress(s):
    # pale enamel band round the shell with a navy cut and the blue top rail
    K.ring_wall(s, 'ClaimBand', K.SHELL_R + 1.0, 8.0, 26.0, 2.6, 'paint', segs=56)
    K.ring_wall(s, 'ClaimBandNavy', K.SHELL_R + 1.2, 14.0, 15.4, 2.8, 'paint2', segs=56)
    K.ring_wall(s, 'ClaimRail', K.SHELL_R + 1.3, 26.0, 26.9, 2.9, 'stripe', segs=56)
    K.ring_wall(s, 'ClaimBase', K.SHELL_R + 1.3, 8.0, 9.0, 2.9, 'paint2', segs=56)
    # watch keeps on the cardinals — feet on the band, casemate crest, blue corner lamps
    for i, a in enumerate(CARDINALS):
        x, y, _ = K.polar(K.SHELL_R + 0.5, a)
        F.box(s, f'Keep{i}', (x, y, 26.5), (10.0, 12.0, 10.0), material='paint',
              rot_z=math.radians(a), bevel=0.3)
        F.band(s, f'Keep{i}', (x, y, 29.5), (0, 0, 1), 1.0, 'stripe', inset=0.06, depth=0.12)
        F.box(s, f'Keep{i}Deck', (x, y, 32.0), (8.0, 10.0, 1.4), material='paint2',
              rot_z=math.radians(a), bevel=0.08)
        F.sensor_dome(s, f'Keep{i}Dome', K.polar(K.SHELL_R - 3.0, a + 14.0, 33.6), 1.6,
                      material='gunmetal', lens='glow_cyan.scn')
        s.detail = 1
        for e in (-1, 1):
            F.light(s, f'Keep{i}Lamp{e:+d}', K.polar(K.SHELL_R + 5.6, a + e * 10.0, 33.2),
                    'glow_cyan.scn', size=0.5)
        s.detail = 0
    # the beacon crown: a mast off the top plate carrying the Concord claim light
    F.box(s, 'CrownBase', (0.0, 0.0, 36.5), (14.0, 14.0, 3.0), material='paint', bevel=0.2)
    F.band(s, 'CrownBase', (0.0, 0.0, 38.0), (0, 0, 1), 1.2, 'stripe')
    F.truss(s, 'CrownMast', (0.0, 0.0, 38.0), (0.0, 0.0, 46.0), 2.2, 5,
            material='gunmetal', chord=0.3, web=0.18)
    F.box(s, 'CrownHead', (0.0, 0.0, 46.4), (4.2, 4.2, 2.4), material='paint2', bevel=0.15)
    for i in range(4):
        a = 45.0 + i * 90.0
        F.light(s, f'CrownBeacon{i}', K.polar(2.2, a, 46.4), 'glow_cyan.scn', size=0.9)
    F.antenna(s, 'CrownWhip', (0.0, 0.0, 47.6), 3.2, tip='glow_cyan.scn')
    # blue running lights on the band between keeps
    s.detail = 1
    K.lamp_ring(s, 'BandLamp', 'glow_cyan.scn', r=K.SHELL_R + 2.4, z=27.6, count=12, size=0.45,
                skip=lambda a: any(K.near(a, c, 12.0) for c in CARDINALS))
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
