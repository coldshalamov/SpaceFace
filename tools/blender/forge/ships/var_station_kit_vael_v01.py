"""Vael faction station kit — row 512. Nacre and script-etch: pearlescent panel tiles set
round the shell like scales, thin etched glyph strips between them, soft teal lamp pairs —
the lien-holder's contract nailed to the station skin."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_vael_v01'
COLORS = {
    'paint': '#6a7a72',            # nacre grey-green panel
    'paint2': '#33383a',
    'stripe': '#1e8a72',           # vael teal #2FCFA0, authored dark
    'ceramic': '#9fc8be',          # pearl inset tile
    'gunmetal': '#3e4644',
    'dark': '#14181a',
    'glow_cyan.vael': '#2fcfa0',
    'glow_warm': '#ffc27a',
}

TILES = 14


def dress(s):
    # contract band: dark script-ground carrying the pearl tiles
    K.ring_wall(s, 'ContractBand', K.SHELL_R + 0.8, 10.0, 24.0, 2.2, 'paint2', segs=56)
    K.ring_wall(s, 'ContractRail', K.SHELL_R + 1.0, 24.0, 25.2, 2.5, 'stripe', segs=56)
    # nacre tiles — overlapping pearl scales round the band, the lien document's seal-work
    for i in range(TILES):
        a = 13.0 + i * (360.0 / TILES)
        z = 13.0 + (i % 3) * 3.4
        F.box(s, f'Nacre{i}', K.polar(K.SHELL_R + 1.1, a, z), (0.9, 9.5, 5.6),
              material='paint', rot_z=math.radians(a), bevel=0.12)
        s.detail = 1
        # etched glyph strip on the tile face — the Vael contract clause
        F.box(s, f'Etch{i}', K.polar(K.SHELL_R + 1.6, a, z + 0.6), (0.3, 6.8, 0.7),
              material='stripe', rot_z=math.radians(a + 4.0), bevel=0.02)
        F.box(s, f'Etch{i}b', K.polar(K.SHELL_R + 1.6, a, z - 0.8), (0.3, 5.2, 0.7),
              material='ceramic', rot_z=math.radians(a - 3.0), bevel=0.02)
        s.detail = 0
    # the lien seal: a pearl lozenge on the crown, teal-lit
    F.cylinder(s, 'SealStem', (0.0, 0.0, 34.0), (0.0, 0.0, 39.0), 2.2, 1.6,
               material='gunmetal', segments=16, bevel=0.05)
    F.sphere(s, 'Seal', (0.0, 0.0, 40.5), 4.2, material='ceramic', segments=20)
    F.band(s, 'Seal', (0.0, 0.0, 41.4), (0, 0, 1), 1.0, 'stripe', inset=0.1, depth=0.08)
    s.detail = 1
    for i in range(6):
        a = i * 60.0
        F.light(s, f'SealLamp{i}', K.polar(4.4, a, 40.5), 'glow_cyan.vael', size=0.45)
    # teal lamp pairs under the rail
    for i in range(9):
        a = i * 40.0
        for e in (-1, 1):
            F.light(s, f'PairLamp{i}{e:+d}', K.polar(K.SHELL_R + 1.8, a + e * 3.0, 26.4),
                    'glow_cyan.vael', size=0.4)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
