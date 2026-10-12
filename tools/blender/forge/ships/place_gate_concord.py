"""place_gate_concord — BP-8c Concord ring gate (C6). Austere official blue.

The Concord gate is an instrument of inspection: a rectangular outer frame
clamping a clean circular transit ring, official blue livery bands, two
inspection towers with lit gallery windows, and nav chevrons over the aperture.
Ships transit along X through SOCKET_Gate_Aperture.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_gate_concord'
COLORS = {
    'paint': '#5c6470',        # austere Concord grey-blue steel
    'paint2': '#30363f',
    'stripe.official': '#2a5f9e',
    'dark': '#12151a',
    'glow_cyan.official': '#7fb8ff',
    'glow_warm.post': '#ffd9a0',
}
R_IN, R_OUT = 30.0, 36.5
HX = 5.0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    # transit ring: one clean band, thin official-blue strip on each face
    K.xz_annular_sector(s, F, 'Ring', R_IN, R_OUT, 0, 2 * math.pi, -HX, HX, 'paint', bevel=0.15)
    for sx in (1, -1):
        K.xz_annular_sector(s, F, f'BlueStrip{sx}', R_OUT - 0.9, R_OUT - 0.1, 0, 2 * math.pi,
                            sx * (HX - 0.15) - 0.02, sx * HX + 0.02, 'stripe.official',
                            steps=48, bevel=0.0)
        K.xz_annular_sector(s, F, f'InnerLiner{sx}', R_IN - 0.35, R_IN + 0.05, 0, 2 * math.pi,
                            sx * (HX - 1.0), sx * HX, 'paint2', steps=48, bevel=0.0)
    # rectangular outer frame: four clamp beams + corner blocks
    ext = R_OUT + 9.0
    for name, c, sz in (('Top', (0, 0, ext), (HX * 2 + 4, 2 * ext + 10, 8)),
                        ('Bottom', (0, 0, -ext), (HX * 2 + 4, 2 * ext + 10, 8)),
                        ('Port', (0, ext, 0), (HX * 2 + 4, 8, 2 * ext - 6)),
                        ('Starboard', (0, -ext, 0), (HX * 2 + 4, 8, 2 * ext - 6))):
        F.box(s, f'Frame{name}', c, sz, material='paint2', bevel=0.4)
    for sx in (1, -1):
        for sy in (1, -1):
            F.box(s, f'Corner{sx}{sy}', (0, sy * ext, sx * ext), (HX * 2 + 5, 11, 11),
                  material='paint', bevel=0.5)
    # struts clamping ring to frame at the four cardinals
    for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
        cy, cz = (R_OUT + 4.0) * math.cos(a), (R_OUT + 4.0) * math.sin(a)
        L = ext - R_OUT
        F.box(s, f'Strut{a:.1f}', (0, cy, cz),
              (HX * 2 + 2, L + 8.0, 5.0) if abs(a - math.pi / 2) % math.pi < 0.1 else
              (HX * 2 + 2, 5.0, L + 8.0), material='paint2',
              rot=(0, 0, 0), bevel=0.3)
    # inspection towers at port/starboard corners, lit galleries
    for sy in (1, -1):
        yo = sy * ext
        F.box(s, f'Tower{sy}', (0, yo, ext - 6), (HX * 2 + 6, 10.0, 16.0), material='paint',
              bevel=0.5)
        win = []
        for k in range(4):
            for x in (-HX - 3.05, HX + 3.05):
                win.append(((x, yo + sy * 5.05, ext - 10 + k * 3.0), (0.15, 0.0, 1.4), (0, 0, 0)))
                win[-1] = ((x, yo + sy * 5.05, ext - 10 + k * 3.0), (1.4, 0.15, 1.2), (0, 0, 0))
        K.boxes(s, F, f'TowerWin{sy}', win, 'glow_warm.post')
        F.light(s, f'TowerLamp{sy}', (HX + 3.4, yo, ext - 1.0), 'glow_cyan.official', size=0.8)
    # aperture rims + official nav chevrons marking transit direction
    for sx in (1, -1):
        F.ring(s, f'Aperture{sx}', (sx * (HX - 0.6), 0, 0), R_IN - 0.4, 0.2, axis=(1, 0, 0),
               material='glow_cyan.official', segments=96, sides=4)
    chev = []
    for k in range(6):
        a = 2 * math.pi * k / 6 + math.pi / 6
        rm = R_IN + 3.0
        chev.append(((HX + 0.6, rm * math.cos(a), rm * math.sin(a)),
                     (0.3, 3.2, 1.2), (a + 0.5, 0, 0)))
    K.boxes(s, F, 'Chevrons', chev, 'glow_cyan.official')
    # seal plaques on the frame + beacon tips on the towers
    s.detail = 1
    K.boxes(s, F, 'Seals', [((HX + 2.05, 0, ext), (0.2, 8.0, 5.0), (0, 0, 0)),
                            ((-HX - 2.05, 0, ext), (0.2, 8.0, 5.0), (0, 0, 0)),
                            ((HX + 2.05, 0, -ext), (0.2, 8.0, 5.0), (0, 0, 0)),
                            ((-HX - 2.05, 0, -ext), (0.2, 8.0, 5.0), (0, 0, 0))],
            'stripe.official')
    for sx in (1, -1):
        F.beacon(s, f'Beacon{sx}', (0, sx * ext, ext + 0.5), finish='glow_cyan.official', size=0.6)
    s.detail = 0
    K.gate_sockets(s, ring_radius=R_OUT + 8.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
