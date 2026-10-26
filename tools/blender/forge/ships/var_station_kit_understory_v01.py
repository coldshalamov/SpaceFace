"""The Understory faction station kit — row 512. The Overgrowth claim: moss mats clumped on
the shell band, vine runs sweeping the gaps, spore pods and warm bio-lamps — the station is
a garden bed, and a stranger reads what grew over it."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_understory_v01'
COLORS = {
    'paint': '#4a5a28',            # moss olive
    'paint2': '#2e3a1c',           # deep growth
    'paint.soil': '#3a3226',       # root mat soil
    'stripe': '#8fa82e',           # understory green — the living claim
    'stone': '#4e5232',            # lichen stone
    'gunmetal': '#3e4034',
    'dark': '#141a10',
    'glow_warm.grow': '#d8e86a',   # bio-lamp yellow-green
    'glow_amber.spore': '#c8e85a', # spore pod lamp
}

VINES = (15.0, 100.0, 185.0, 270.0)


def dress(s):
    # root mat band: soil-dark plate the growth sits on
    K.ring_wall(s, 'RootMat', K.SHELL_R + 0.7, 9.0, 25.0, 2.4, 'paint.soil', segs=56)
    # moss mats — irregular clumped plates over the mat, thick mid-band, ragged edges
    s.detail = 1
    K.patch_row(s, 'Moss', 2.0, 34, 10.6, K.SHELL_R + 1.2, 10.5, 23.0,
                ['paint', 'paint2', 'stone'], seed=5)
    s.detail = 0
    # vine runs: living sweeps spiralling from the crown down across the band
    for i, a in enumerate(VINES):
        pts = []
        for k in range(14):
            t = k / 13.0
            aa = a + 120.0 * t
            r = K.SHELL_R + 1.9 + 1.2 * math.sin(6.0 * t + i)
            z = 38.0 - 42.0 * t
            pts.append(K.polar(r, aa, z))
        F.sweep(s, f'Vine{i}', pts, 0.55, 0.55, material='paint2', bevel=0.02)
        # leaf clusters on the vine
        s.detail = 1
        for k in (3, 7, 11):
            F.sphere(s, f'Vine{i}Leaf{k}', pts[k], 1.1, material='stripe', segments=10)
        s.detail = 0
    # spore pods — the garden's fruit, clustered at the crown and mid-band
    for i, a in enumerate((40.0, 160.0, 280.0)):
        p = K.polar(K.SHELL_R + 1.6, a, 21.0 + (i % 2) * 3.0)
        F.sphere(s, f'Pod{i}', p, 1.6 + 0.3 * (i % 2), material='paint', segments=14)
        s.detail = 1
        F.light(s, f'Pod{i}Lamp', (p[0], p[1], p[2] + 1.4), 'glow_amber.spore', size=0.4)
        s.detail = 0
    # the growth crown: a moss cap with sprouting fronds — not machinery, cultivation
    F.sphere(s, 'CrownMoss', (0.0, 0.0, 36.0), 7.5, material='paint', segments=18)
    for i in range(7):
        a = i * 51.4
        base = K.polar(4.0, a, 40.0)
        tip = K.polar(5.0 + (i % 3), a + 8.0, 44.0 + (i % 3) * 1.5)
        F.cylinder(s, f'Frond{i}', base, tip, 0.35, 0.12, material='stripe', segments=8,
                   bevel=0.02)
    s.detail = 1
    K.lamp_ring(s, 'BioLamp', 'glow_warm.grow', r=K.SHELL_R + 1.8, z=7.0, count=12, size=0.45)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
