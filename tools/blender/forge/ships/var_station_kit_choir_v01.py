"""Ascendant Choir faction station kit — row 512. Bronze, bell and ribbon: a belfry crown
hanging three foundry bells over the band, ribbon arcs spiralling the shell, votive lamps —
the station reads as a consecrated thing, rung and wrapped."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_choir_v01'
COLORS = {
    'paint': '#5e4a34',            # consecrated bronze-umber
    'paint2': '#33291f',
    'stripe': '#a83f95',           # choir pink #E85FD0, authored dark
    'bare': '#8a6a34',             # foundry bronze
    'gunmetal': '#4a4036',
    'dark': '#161210',
    'glow_amber.choir': '#e85fd0', # votive pink
    'glow_warm': '#ffc27a',
}

RIBBONS = (20.0, 140.0, 260.0)


def dress(s):
    # consecrated band: bronze-umber plate with a pink votive rail
    K.ring_wall(s, 'HallowBand', K.SHELL_R + 0.8, 10.0, 24.0, 2.4, 'paint', segs=56)
    K.ring_wall(s, 'HallowRail', K.SHELL_R + 1.0, 24.0, 25.2, 2.5, 'stripe', segs=56)
    # ribbon arcs: thin consecration ribbons spiralling down off the crown over the shell
    for i, a in enumerate(RIBBONS):
        pts = []
        for k in range(16):
            t = k / 15.0
            aa = a + 90.0 * t            # quarter-turn drift down the shell
            r = K.SHELL_R + 1.6 + 2.0 * math.sin(math.pi * t)
            z = 40.0 - 46.0 * t
            pts.append(K.polar(r, aa, z))
        F.sweep(s, f'Ribbon{i}', pts, 0.5, 0.9, material='stripe', bevel=0.02)
    # the belfry crown: an arch frame over the top plate with three rung bells
    for e in (-1, 1):
        F.truss(s, f'BelfryLeg{e:+d}', (e * 10.0, 0.0, 34.0), (e * 6.0, 0.0, 44.0), 1.6, 4,
                material='gunmetal', chord=0.24, web=0.14)
    F.box(s, 'BelfryBeam', (0.0, 0.0, 44.2), (14.0, 2.6, 2.0), material='paint2', bevel=0.08)
    F.band(s, 'BelfryBeam', (0.0, 0.0, 44.2), (0, 1, 0), 1.2, 'stripe')
    for i, x in enumerate((-4.4, 0.0, 4.4)):
        F.cylinder(s, f'Hanger{i}', (x, 0.0, 44.0), (x, 0.0, 41.6), 0.3, 0.3,
                   material='dark', segments=8)
        K.bell(s, f'Bell{i}', (x, 0.0, 41.0), 1.7 + 0.3 * (1 if i == 1 else 0), 2.6,
               material='bare', cap='dark')
    # votive lamps — small pink candles under the band rail and on the belfry
    s.detail = 1
    K.lamp_ring(s, 'Votive', 'glow_amber.choir', r=K.SHELL_R + 1.9, z=26.6, count=18, size=0.4)
    for e in (-1, 1):
        F.light(s, f'BelfryLamp{e:+d}', (e * 7.0, 0.0, 45.4), 'glow_amber.choir', size=0.55)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
