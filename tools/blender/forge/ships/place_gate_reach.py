"""place_gate_reach — BP-8c Crimson Reach ring gate (C6). Booby-trapped, red, sparking.

A raider toll gate welded from looted hull plate: a lumpy mismatched ring with
plated reinforcements, clamped-on mine pods, exposed sparking cables arcing
between them, and red warning strobes. Nothing about it is official.
Ships transit along X through SOCKET_Gate_Aperture.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_gate_reach'
COLORS = {
    'paint': '#4a3b33',        # raider rust
    'paint2': '#241d1a',
    'deadmetal.reach': '#2c2521',
    'hazard.reach': '#8a3420',
    'dark': '#100d0b',
    'glow_red.reach': '#ff4020',
    'glow_warm.spark': '#ffcc88',
}
R_IN, R_OUT = 30.0, 36.0
HX = 5.0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    # lumpy welded ring: 9 mismatched segment arcs of varying thickness/depth
    n_seg = 9
    gaps = [0.10, 0.16, 0.08, 0.14, 0.09, 0.12, 0.10, 0.15, 0.09]
    for i in range(n_seg):
        a0 = 2 * math.pi * i / n_seg + gaps[i] / 2
        a1 = 2 * math.pi * (i + 1) / n_seg - gaps[i] / 2
        bump = 1.6 if i % 3 == 0 else (0.8 if i % 3 == 1 else 0.0)
        K.xz_annular_sector(s, F, f'Seg{i}', R_IN - bump * 0.4, R_OUT + bump,
                            a0, a1, -HX - bump * 0.5, HX + bump * 0.5,
                            'paint' if i % 4 else 'deadmetal.reach',
                            steps=8, bevel=0.18)
        # mismatched armor plating welded on two faces of each segment
        if i % 2 == 0:
            am = (a0 + a1) / 2
            K.xz_annular_sector(s, F, f'Plate{i}', R_OUT + bump, R_OUT + bump + 1.1,
                                a0 + 0.05, a1 - 0.05, -HX * 0.6, HX * 0.6,
                                'paint2', steps=6, bevel=0.08)
    # aperture rims: thin red glow lines
    for sx in (1, -1):
        F.ring(s, f'Aperture{sx}', (sx * (HX - 0.6), 0, 0), R_IN - 0.4, 0.2, axis=(1, 0, 0),
               material='glow_red.reach', segments=80, sides=4)
    # booby-trap mine pods clamped on at four bearings + chain connectors
    pods = []
    for i, a in enumerate((0.35, 1.95, 3.5, 5.15)):
        rm = R_OUT + 3.4
        cy, cz = rm * math.cos(a), rm * math.sin(a)
        F.box(s, f'Mine{i}', (0, cy, cz), (HX * 2 + 4.0, 5.0, 6.0), material='deadmetal.reach',
              rot=(a, 0, 0), bevel=0.4)
        F.box(s, f'MineCap{i}', (0, cy * 1.04, cz * 1.04), (HX * 2 + 4.4, 3.2, 3.4),
              material='hazard.reach', rot=(a, 0, 0), bevel=0.3)
        # clamp collars chaining the pod to the ring
        for d in (-1, 1):
            ca = a + d * 0.09
            F.cylinder(s, f'Chain{i}{d}', (0, (rm - 3.0) * math.cos(ca), (rm - 3.0) * math.sin(ca)),
                       (0, cy, cz), 0.4, material='gunmetal', segments=8)
        pods.append((a, cy, cz))
    # exposed sparking cables arcing between adjacent pods — sagging catenary chords
    cables = []
    for j in range(4):
        a0, cy0, cz0 = pods[j]
        a1, cy1, cz1 = pods[(j + 1) % 4]
        for k in range(7):
            t = (k + 0.5) / 7
            sag = math.sin(math.pi * t) * 4.5
            x = sag
            y = cy0 + (cy1 - cy0) * t - sag * math.cos((a0 + a1) / 2)
            z = cz0 + (cz1 - cz0) * t - sag * math.sin((a0 + a1) / 2)
            cables.append(((x, y, z), (0.35, 0.35, 0.9), (a0 + (a1 - a0) * t, 0, 0)))
    K.boxes(s, F, 'Cables', cables, 'dark')
    # spark nodes on the cables: small emissive lumps
    s.detail = 1
    sparks = []
    for j in range(4):
        for t in (0.3, 0.62, 0.85):
            a0, cy0, cz0 = pods[j]
            a1, cy1, cz1 = pods[(j + 1) % 4]
            sag = math.sin(math.pi * t) * 4.5
            sparks.append(((sag, cy0 + (cy1 - cy0) * t - sag * math.cos((a0 + a1) / 2),
                             cz0 + (cz1 - cz0) * t - sag * math.sin((a0 + a1) / 2)),
                           (0.5, 0.5, 0.5), (0, 0, 0)))
    K.boxes(s, F, 'Sparks', sparks, 'glow_warm.spark')
    # red strobes on every third segment + a jury-rigged control shack on the top segment
    for i in (0, 3, 6):
        gc = math.pi * 2 * (i + 0.5) / n_seg
        F.light(s, f'Strobe{i}', (HX + 2.6, (R_OUT + 1.2) * math.cos(gc), (R_OUT + 1.2) * math.sin(gc)),
                'glow_red.reach', size=0.7)
    F.box(s, 'Shack', (0, 0, R_OUT + 4.0), (HX * 2 + 5, 7.0, 7.0), material='paint2', bevel=0.4)
    win = [((-HX - 2.6, 1.5, R_OUT + 4.5), (0.15, 1.6, 1.1), (0, 0, 0)),
           ((-HX - 2.6, -1.5, R_OUT + 4.5), (0.15, 1.6, 1.1), (0, 0, 0))]
    K.boxes(s, F, 'ShackWin', win, 'glow_warm.spark')
    s.detail = 0
    K.gate_sockets(s, ring_radius=R_OUT + 6.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
