"""place_landmark_crystal_spire — BP-8b Veil luminous faceted spire (C6).

A luminous crystal eruption: a crown of faceted prismatic shards bursting out of a
dark rock collar, cyan-lit from within — the brightest object in the Veil Nebula.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_crystal_spire'
COLORS = {
    'paint': '#1d2128',        # dark rock collar
    'dark': '#0f1218',
    'stone.veil': '#3a3f4a',
    'glass.crystal': '#7fd8e8',
    'glow_cyan.crystal': '#8ff0ff',
    'glow_cyan.deep': '#37b6d8',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.rock_base(s, F, 'Collar', (0, 0, 1.5), 27.0, seed=53)
    # master spire: the great central shard
    K.crystal_shard(s, F, 'SpireA', (0, 0, 4.0), 96.0, 11.0, 'glow_cyan.crystal', lean=(3.0, 1.0), sides=6)
    # ring of companion shards, leaning outward
    comps = [
        (14.0, 0.9, 58.0, 6.0), (12.5, 2.4, 68.0, 5.5), (15.0, 3.8, 46.0, 5.0),
        (13.0, 5.1, 76.0, 6.5), (16.0, 5.9, 38.0, 4.5), (10.5, 1.6, 50.0, 4.0),
        (15.5, 4.5, 62.0, 5.0),
    ]
    for i, (r, a, h, w) in enumerate(comps):
        lean = (r * math.cos(a) * 0.55, r * math.sin(a) * 0.55)
        K.crystal_shard(s, F, f'Shard{i}', (r * math.cos(a) * 0.8, r * math.sin(a) * 0.8, 3.5),
                        h, w, 'glow_cyan.crystal' if i % 3 else 'glass.crystal',
                        lean=lean, sides=5 + (i % 3))
    # fallen shards on the collar — litter reads as the eruption's debris
    fallen = []
    for i in range(10):
        a = 2 * math.pi * i / 10 + 0.4
        r = 20.0 + (i % 3) * 3.5
        fallen.append(((r * math.cos(a), r * math.sin(a), 4.5), (2.2, 2.2, 5.0 + (i % 4)),
                       (0.9 + 0.2 * (i % 3), 0.4, a)))
    K.boxes(s, F, 'Fallen', fallen, 'glow_cyan.deep', bevel=0.1)
    # dim strata seams on the collar
    s.detail = 1
    for i in range(8):
        a = 2 * math.pi * i / 8 + 0.2
        F.light(s, f'Stratum{i}', (17.5 * math.cos(a), 17.5 * math.sin(a), 5.0),
                'glow_cyan.deep', size=0.5)
    s.detail = 0
    K.landmark_sockets(s, focus_z=42.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
