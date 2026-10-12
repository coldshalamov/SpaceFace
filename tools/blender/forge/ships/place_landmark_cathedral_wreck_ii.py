"""place_landmark_cathedral_wreck_ii — BP-8b Ashfall capital-hull ribs (C6).

The SECOND cathedral wreck — a distinct silhouette from the shipped
place_landmark_wreck_cathedral: the exposed keel ribs of a broken capital hull
arc overhead like a shattered nave, a split stern tower leans against the last
rib, ember-lit debris lies in the aisle between.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_cathedral_wreck_ii'
COLORS = {
    'paint': '#4a4f55',        # cold hull steel
    'paint2': '#2b2f35',
    'dark': '#12151a',
    'deadmetal.ash': '#2a2624',
    'glow_warm.ash': '#ff9a45',
    'glow_red.ash': '#e05530',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.rock_base(s, F, 'Aisle', (0, 0, 1.0), 32.0, seed=67)
    # keel ribs: seven arches marching forward, each more damaged than the last.
    # Broken ribs stop early (shorter span, lower rise) and lean.
    ribs = [
        (-66.0, 92.0, 62.0, 5.0, 4.0, 1.00),
        (-44.0, 96.0, 66.0, 5.0, 4.0, 1.00),
        (-22.0, 90.0, 60.0, 4.6, 3.8, 0.98),
        (0.0, 78.0, 50.0, 4.4, 3.6, 0.95),
        (20.0, 58.0, 34.0, 4.0, 3.4, 0.90),
        (38.0, 40.0, 18.0, 3.6, 3.2, 0.85),
    ]
    for i, (x, span, rise, thick, chord, lean) in enumerate(ribs):
        obj = K.rib_arch(s, F, f'Rib{i}', span, rise, chord, thick,
                         'paint' if i < 4 else 'deadmetal.ash', x=x, z0=6.0, n=7, bevel=0.15)
        if lean < 1.0:
            obj.rotation_euler.y = (1.0 - lean) * 0.35  # slight collapse lean
    # torn deck stringers bridging the two longest ribs along X
    for i in range(3):
        y = -30.0 + i * 30.0
        F.cylinder(s, f'Stringer{i}', (-66.0, y, 55.0 - abs(y) * 0.5),
                   (-22.0, y, 50.0 - abs(y) * 0.45), 1.1, material='deadmetal.ash', segments=8)
    # split stern tower leaning on the last rib — the "spire" fragment
    F.box(s, 'SternTower', (56.0, 8.0, 34.0), (16.0, 14.0, 62.0), material='paint2',
          rot=(0.12, -0.30, 0.0), bevel=0.6)
    F.box(s, 'SternCap', (52.0, 6.0, 66.0), (13.0, 11.0, 5.0), material='dark',
          rot=(0.12, -0.30, 0.0), bevel=0.4)
    # torn plate skin sheets still hanging between ribs
    plates = []
    for i, x in enumerate((-55.0, -33.0, -11.0)):
        for sy in (1, -1):
            plates.append(((x, sy * (38.0 + i * 3.0), 30.0 + i * 6.0),
                           (18.0, 0.5, 12.0), (sy * 0.45, 0.05, 0.0)))
    K.boxes(s, F, 'SkinSheets', plates, 'paint2', bevel=0.1)
    # ember-lit debris field in the aisle: plates, a lifeboat husk, sparks
    debris = []
    for i in range(16):
        a = 2 * math.pi * i / 16 + 0.3
        r = 6.0 + (i % 4) * 5.0
        debris.append(((r * math.cos(a) - 8.0, r * math.sin(a), 5.0 + (i % 3)),
                       (3.0 + (i % 3), 2.0 + (i % 2), 1.2), (0.3 * (i % 3), 0.5, a)))
    K.boxes(s, F, 'Debris', debris, 'deadmetal.ash', bevel=0.1)
    F.box(s, 'Lifeboat', (-20.0, 8.0, 7.0), (9.0, 4.0, 3.0), material='paint2',
          rot=(0.1, 0.2, 0.5), bevel=0.5, taper=0.6)
    # ember memorial lamps along the aisle + two on the stern tower
    s.detail = 1
    for i in range(9):
        x = -60.0 + i * 15.0
        F.light(s, f'Ember{i}', (x, (i % 3 - 1) * 8.0, 6.5), 'glow_warm.ash', size=0.55)
    F.light(s, 'TowerEmber', (50.0, 4.0, 40.0), 'glow_red.ash', size=0.8)
    s.detail = 0
    K.landmark_sockets(s, focus_z=30.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
