"""Verge-Layers faction station kit — row 512. The nacre lattice: two thin measured rings
trussed round the shell with tick marks, grey-lavender witness panels — the Layers measured
this station and left the instrument on it."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_verge_v01'
COLORS = {
    'paint': '#6e6a72',            # measured grey
    'paint2': '#38353e',
    'stripe': '#b0a8b8',           # verge nacre grey-lavender
    'ceramic': '#948e9c',          # witness panel pearl
    'gunmetal': '#413e46',
    'dark': '#141318',
    'glow_cyan.verge': '#c8c0d0',  # instrument pearl light
    'glow_amber.verge': '#d0c060', # the one verdict lamp
}

LATTICE = (0.0, 90.0)
WITNESS = (30.0, 120.0, 210.0, 300.0)


def signature(s):
    """Survey masts inside the ring: instrument columns with dishes and graduated ticks."""
    for i, a in enumerate((45.0, 135.0, 225.0, 315.0)):
        base = K.polar(24.0, a, 8.0)
        tip = K.polar(23.0, a, 32.0)
        F.cylinder(s, f'VergeMast{i}', base, tip, 0.8, 0.4, material='ceramic',
                   segments=10, bevel=0.02)
        F.dish(s, f'VergeDish{i}', (tip[0], tip[1], tip[2] - 1.0), 3.0, 0.8,
               axis=(0.3 * math.cos(math.radians(a)), 0.3 * math.sin(math.radians(a)), 1.0),
               material='paint', face='paint2', feed='glow_cyan.verge', segments=16)
        for k in range(4):
            F.ring(s, f'VergeTick{i}{k}', (base[0], base[1], 12.0 + k * 4.5), 1.3, 0.25,
                   axis=(0, 0, 1), material='stripe', segments=10, sides=5)
        s.detail = 1
        F.light(s, f'VergeMastLamp{i}', tip, 'glow_cyan.verge', size=0.4)
        s.detail = 0


def dress(s):
    K.interior(s, 'stripe', 'glow_cyan.verge')
    # measured band: grey plate with the nacre datum line
    K.ring_wall(s, 'MeasureBand', K.SHELL_R + 0.8, 11.0, 23.0, 2.2, 'paint', segs=56)
    K.ring_wall(s, 'DatumLine', K.SHELL_R + 1.05, 16.5, 17.3, 2.5, 'stripe', segs=56)
    # the lattice: two thin truss rings inclined through the poles — the instrument left on
    for i, a in enumerate(LATTICE):
        pts = K.vertical_arc_path(K.SHELL_R + 2.4, a, -2.0, 38.0, n=20)
        F.sweep(s, f'Lattice{i}', pts, 0.7, 0.7, material='ceramic', bevel=0.03)
        pts_b = K.vertical_arc_path(K.SHELL_R + 2.4, a + 180.0, -2.0, 38.0, n=20)
        F.sweep(s, f'Lattice{i}b', pts_b, 0.7, 0.7, material='ceramic', bevel=0.03)
    # tick marks round the datum — the measured graduation a stranger reads as instruments
    s.detail = 1
    ticks = [K.tangent_box(i * 10.0, K.SHELL_R + 1.4, 14.0, 0.4, 0.7,
                           2.6 if i % 6 == 0 else 1.4) for i in range(36)]
    F.boxes(s, 'DatumTick', ticks, 'stripe', bevel=0.0)
    s.detail = 0
    # witness panels: pearl lozenges floated off the band — evidence plates
    for i, a in enumerate(WITNESS):
        x, y, _ = K.polar(K.SHELL_R + 2.4, a)
        F.box(s, f'Witness{i}', (x, y, 17.0), (0.6, 6.4, 9.0), material='ceramic',
              rot_z=math.radians(a), bevel=0.2)
        s.detail = 1
        # one capitalised directive mark — a single glyph, never more
        F.box(s, f'Witness{i}Mark', K.polar(K.SHELL_R + 2.8, a, 17.0), (0.25, 3.0, 0.9),
              material='paint2', rot_z=math.radians(a), bevel=0.0)
        s.detail = 0
    # the survey crown: a plumb ring and the single verdict lamp
    F.ring(s, 'PlumbRing', (0.0, 0.0, 37.5), 8.0, 0.7, axis=(0, 0, 1), material='stripe',
           segments=28, sides=6)
    F.cylinder(s, 'PlumbRod', (0.0, 0.0, 33.0), (0.0, 0.0, 41.0), 0.5, 0.3,
               material='gunmetal', segments=8)
    F.light(s, 'Verdict', (0.0, 0.0, 41.6), 'glow_amber.verge', size=0.8)
    # pale instrument lamps — sparse, measured
    s.detail = 1
    K.lamp_ring(s, 'Instrument', 'glow_cyan.verge', r=K.SHELL_R + 1.7, z=25.4, count=10,
                size=0.4)
    s.detail = 0
    signature(s)


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
