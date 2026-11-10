"""Meridian (MTS) faction station kit — row 512. The gold ticker-strip: an elevated halo on
pylon crowns, a scrolling-look ticker band of lit gold dashes, and a gate arch over +X —
the exchange floor's claim on the station."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_meridian_v01'
COLORS = {
    'paint': '#5c5648',            # warm exchange stone coat
    'paint2': '#3a3428',
    'stripe': '#8a6a1a',           # meridian gold #F2B233, authored dark
    'gunmetal': '#46403a',
    'dark': '#16141a',
    'glow_amber.mts': '#f2b233',   # ticker gold light
    'glow_warm': '#ffc27a',
}

PYLONS = (30.0, 90.0, 150.0, 210.0, 270.0, 330.0)


def dress(s):
    # the ticker band: alternating lit gold dashes and dark spacers — reads as a scrolling
    # price tape round the whole station
    K.ring_wall(s, 'TickerDark', K.SHELL_R + 0.8, 12.0, 20.0, 2.2, 'dark', segs=56)
    s.detail = 1
    dashes = []
    for i in range(36):
        a = 5.0 + i * 10.0
        dashes.append(K.tangent_box(a, K.SHELL_R + 1.15, 16.0 + (1.8 if i % 3 == 0 else 0.0),
                                    0.5, 3.4 + (i % 4), 1.4))
    F.boxes(s, 'TickerDash', dashes, 'glow_amber.mts', bevel=0.04)
    s.detail = 0
    # the elevated halo: a thin ring held off the shell on six pylon crowns
    F.ring(s, 'Halo', (0.0, 0.0, 38.0), K.SHELL_R + 4.0, 0.9, axis=(0, 0, 1),
           material='paint2', segments=48, sides=8)
    for i, a in enumerate(PYLONS):
        p_top = K.polar(K.SHELL_R + 4.0, a, 38.0)
        p_base = K.polar(K.SHELL_R + 0.5, a, 24.0)
        F.truss(s, f'HaloPylon{i}', p_base, p_top, 1.5, 6, material='gunmetal',
                chord=0.24, web=0.14)
        F.box(s, f'HaloPylon{i}Crown', p_top, (2.6, 2.6, 1.8), material='stripe', bevel=0.06)
        s.detail = 1
        F.light(s, f'HaloPylon{i}Lamp', K.polar(K.SHELL_R + 4.0, a, 39.2),
                'glow_amber.mts', size=0.5)
        s.detail = 0
    # the gate arch over +X — the toll doorway a stranger reads first
    arch = K.arc_ring_path(K.SHELL_R + 2.0, 13.0, 168.0, 12.0, n=10)
    # arc through the top: lift midpoints to a crown over the mouth
    pts = []
    for i, p in enumerate(arch):
        t = i / (len(arch) - 1)
        pts.append((p[0], p[1], 13.0 + 22.0 * math.sin(math.pi * t)))
    F.sweep(s, 'GateArch', pts, 1.6, 1.2, material='paint2', bevel=0.05)
    F.band(s, 'GateArch', pts[len(pts) // 2], (0, 0, 1), 1.2, 'stripe')
    for t in (0.25, 0.5, 0.75):
        i = min(len(pts) - 1, int(t * (len(pts) - 1)))
        F.light(s, f'GateLamp{t:.2f}', (pts[i][0], pts[i][1], pts[i][2] - 1.4),
                'glow_amber.mts', size=0.55)
    # warm exchange windows under the ticker band
    s.detail = 1
    K.lamp_ring(s, 'FloorLamp', 'glow_warm', r=K.SHELL_R + 1.8, z=8.0, count=18, size=0.4)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
