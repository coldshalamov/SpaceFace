"""place_landmark_vault_maw — QUEUE F7-31 anomaly-violet maw ring (C6).

A dark iris-ring structure half buried in a debris bank: a vertical ring whose
segmented shutter-jaw hangs ajar, violet light leaking through the crescent gap.
Ominous, quiet, enormous — the read from above is a dark eye, half-open.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_vault_maw'
COLORS = {
    'paint': '#262a33',        # near-black anomaly alloy
    'paint2': '#171a21',
    'dark': '#0c0e13',
    'glow_cyan.maw': '#a06bff',  # violet leak
    'glow_red.maw': '#7a3aff',
}
R_IN, R_OUT = 30.0, 41.0
HX = 7.0
OPEN = math.radians(96)      # open gap of the shutter jaw


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    # debris bank the ring sits in — a low rocky saddle at the ring's foot
    K.rock_base(s, F, 'DebrisBank', (0, 6.0, -30.0), 24.0, seed=31)
    # outer ring band in the Y-Z plane: the vault housing
    K.xz_annular_sector(s, F, 'RingBand', R_IN, R_OUT, 0, 2 * math.pi, -HX, HX, 'paint', steps=36, bevel=0.2)
    # darker inner face liner
    K.xz_annular_sector(s, F, 'RingLiner', R_IN - 0.6, R_IN + 0.15, 0, 2 * math.pi, -HX + 1.2, HX - 1.2, 'paint2', steps=36, bevel=0.08)
    # eight housing bulges around the rim with service caps
    bulges = []
    for i in range(8):
        a = 2 * math.pi * i / 8
        rm = (R_IN + R_OUT) / 2
        bulges.append(((0, rm * math.cos(a), rm * math.sin(a)),
                       (HX * 2 + 3.0, 6.0, 7.5), (a, 0, 0)))
    K.boxes(s, F, 'Bulges', bulges, 'paint2', bevel=0.3)
    # shutter jaw: leaves covering the aperture except the OPEN crescent
    n_leaf = 7
    a_leaf = (2 * math.pi - OPEN) / n_leaf
    a0 = -math.pi / 2 - (2 * math.pi - OPEN) / 2  # gap centred at bottom of ring
    for i in range(n_leaf):
        b0 = a0 + i * a_leaf
        b1 = b0 + a_leaf
        K.xz_annular_sector(s, F, f'Leaf{i}', 0.5, R_IN - 1.0, b0 + 0.012, b1 - 0.012,
                            -1.4, 1.4, 'dark', steps=6, bevel=0.05)
        # hinge knuckle at the rim + iris servo teeth on each leaf tip
        for x in (-1.4, 1.4):
            pass
    # violet light leaking through the open crescent: emissive sector just inside the jaw
    K.xz_annular_sector(s, F, 'Leak', 2.0, R_IN - 2.5,
                        a0 - 0.02, a0 + OPEN + 0.04, -0.5, 0.5,
                        'glow_cyan.maw', steps=18, bevel=0.0)
    # rim apertures: two thin glow lines tracing the ring's inner edge
    for sx in (1, -1):
        F.ring(s, f'EdgeRim{sx}', (sx * (HX - 1.0), 0, 0), R_IN - 0.4, 0.22, axis=(1, 0, 0),
               material='glow_cyan.maw', segments=96, sides=4)
    # warning strobes on three bulges + hazard fins near the jaw hinge
    s.detail = 1
    for i in (1, 4, 6):
        a = 2 * math.pi * i / 8
        rm = (R_IN + R_OUT) / 2
        F.light(s, f'Strobe{i}', (HX + 2.6, rm * math.cos(a), rm * math.sin(a)),
                'glow_red.maw', size=0.8)
    fins = []
    for k in range(9):
        a = a0 + OPEN * k / 8
        fins.append(((0, (R_IN - 0.6) * math.cos(a), (R_IN - 0.6) * math.sin(a)),
                     (HX * 2 + 1.0, 0.5, 1.8), (a, 0, 0)))
    K.boxes(s, F, 'JawTeeth', fins, 'hazard')
    s.detail = 0
    K.landmark_sockets(s, focus_z=0.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
