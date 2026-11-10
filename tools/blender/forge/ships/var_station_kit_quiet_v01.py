"""The Quiet faction station kit — row 512. The matte no-light claim: angular dead shroud
panels leaned over the shell, every lamp left unlit — a stranger reads the Quiet station
as the dark one, the silhouette that refuses to shine."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_quiet_v01'
COLORS = {
    'paint': '#221e2a',            # matte dead violet-black
    'paint2': '#17141d',
    'stripe': '#3a3252',           # quiet violet #7A5FB0 crushed nearly to black
    'gunmetal': '#2a2830',
    'dark': '#0e0c12',
    'glow_cyan.quiet': '#4a3f6a',  # nearly dead instrument glim — sparse, not zero
}

SHROUDS = (15.0, 75.0, 140.0, 200.0, 255.0, 315.0)


def dress(s):
    # dead shroud band: matte plates swallowing the shell's running lights — the claim is
    # what is NOT lit
    K.ring_wall(s, 'Shroud', K.SHELL_R + 0.9, 8.0, 26.0, 2.8, 'paint', segs=56, bevel=0.02)
    K.ring_wall(s, 'ShroudEdge', K.SHELL_R + 1.15, 26.0, 26.6, 3.0, 'stripe', segs=56)
    # leaning matte plates — angular baffles that break the silhouette
    for i, a in enumerate(SHROUDS):
        x, y, _ = K.polar(K.SHELL_R + 0.5, a)
        lean = 0.18 if i % 2 else -0.12
        F.box(s, f'Baffle{i}', (x, y, 20.0 + (i % 3) * 3.0), (1.8, 14.0 + (i % 3) * 3.0, 26.0),
              material='paint2', rot_z=math.radians(a), taper=0.8, bevel=0.06)
        # baffle tips lean outward past the shell — the silhouette goes jagged
        F.box(s, f'Baffle{i}Tip', K.polar(K.SHELL_R + 4.2, a, 34.0 + (i % 3) * 3.0),
              (1.2, 8.0, 10.0), material='paint', rot_z=math.radians(a), taper=0.5,
              bevel=0.04)
    # dead antenna thicket on the crown — quiet means listening, not broadcasting
    for i, a in enumerate((30.0, 150.0, 270.0)):
        base = K.polar(6.0, a, 36.0)
        F.cylinder(s, f'Rod{i}', base, (base[0], base[1], 44.0 + i * 2.0), 0.3, 0.12,
                   material='gunmetal', segments=8, bevel=0.0)
    F.box(s, 'CrownShroud', (0.0, 0.0, 36.5), (16.0, 16.0, 2.0), material='paint2', bevel=0.1)
    # exactly three near-dead instrument glims — a watcher finds them, a stranger finds none
    s.detail = 1
    for i, a in enumerate((60.0, 180.0, 300.0)):
        F.light(s, f'Glim{i}', K.polar(K.SHELL_R + 1.4, a, 7.0), 'glow_cyan.quiet', size=0.3)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
