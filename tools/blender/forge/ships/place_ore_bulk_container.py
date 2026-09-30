"""place_ore_bulk_container — open ore hopper, Forge rebuild (GFX-9, same slot).

The everyday-kit bulk box that sector dressing and world one-offs scatter around yards: an
open-topped bin — floor, four walls, rim rails, rub strakes — with a heap of raw ore inside.
SOCKET_Hoist_Center is authored (the file has no live parts/ copy to carry it from).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_ore_bulk_container'
COLORS = {
    'paint': '#4e4a42',          # weathered bin walls
    'gunmetal': '#4a5058',
    'dark': '#16191d',
    'stone': '#4a4038',          # raw ore — dark iron-brown rock
    'stone.deep': '#37312b',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # --- the bin: floor, four walls, rim rails, rub strakes (~9.7 x 4.7 x 4.1 like live) --------
    F.box(s, 'Floor', (0.0, 0.0, -1.85), (9.7, 4.7, 0.30), material='gunmetal', bevel=0.02)
    F.box(s, 'WallAft', (-4.85, 0.0, 0.0), (0.30, 4.7, 4.0), material='paint', bevel=0.03)
    F.box(s, 'WallFore', (4.85, 0.0, 0.0), (0.30, 4.7, 4.0), material='paint', bevel=0.03)
    F.box(s, 'WallPort', (0.0, -2.35, 0.0), (9.7, 0.30, 4.0), material='paint', bevel=0.03)
    F.box(s, 'WallStar', (0.0, 2.35, 0.0), (9.7, 0.30, 4.0), material='paint', bevel=0.03)
    # vertical ribs on the long walls so they read as structure, not flat slabs
    for i in range(7):
        x = -4.0 + i * (8.0 / 6)
        F.box(s, f'RibP{i}', (x, -2.42, -0.1), (0.22, 0.14, 3.6), material='gunmetal', bevel=0.01)
        F.box(s, f'RibS{i}', (x, 2.42, -0.1), (0.22, 0.14, 3.6), material='gunmetal', bevel=0.01)
    # rim rails + rub strakes
    F.box(s, 'RimPort', (0.0, -2.40, 2.05), (10.0, 0.26, 0.30), material='gunmetal', bevel=0.02)
    F.box(s, 'RimStar', (0.0, 2.40, 2.05), (10.0, 0.26, 0.30), material='gunmetal', bevel=0.02)
    F.box(s, 'RimFore', (4.95, 0.0, 2.05), (0.30, 4.9, 0.30), material='gunmetal', bevel=0.02)
    F.box(s, 'RimAft', (-4.95, 0.0, 2.05), (0.30, 4.9, 0.30), material='gunmetal', bevel=0.02)
    F.box(s, 'RubPort', (0.0, -2.46, -1.70), (9.9, 0.10, 0.24), material='dark', bevel=0.01)
    F.box(s, 'RubStar', (0.0, 2.46, -1.70), (9.9, 0.10, 0.24), material='dark', bevel=0.01)

    # --- the ore: a heaped fill slab under the rim plus displaced lumps breaking the crown ------
    F.box(s, 'OreFill', (0.0, 0.0, 1.35), (9.2, 4.1, 0.9), material='stone.deep', bevel=0.10)
    F.rock(s, 'OreA0', (-2.2, -0.3, 1.35), 2.1, seed=101, subdiv=3, relief=0.30, terrace=0.0,
           material='stone')
    F.rock(s, 'OreA1', (-1.05, -1.05, 1.45), 1.3, seed=113, subdiv=3, relief=0.30, terrace=0.0,
           material='stone.deep')
    F.rock(s, 'OreA2', (-3.25, 0.55, 1.5), 1.05, seed=127, subdiv=3, relief=0.30, terrace=0.0,
           material='stone')
    F.rock(s, 'OreB0', (2.4, 0.4, 1.5), 2.3, seed=139, subdiv=3, relief=0.28, terrace=0.0,
           material='stone')
    F.rock(s, 'OreB1', (3.55, -0.4, 1.55), 1.35, seed=149, subdiv=3, relief=0.30, terrace=0.0,
           material='stone.deep')
    F.rock(s, 'OreB2', (1.25, 1.3, 1.55), 1.15, seed=157, subdiv=3, relief=0.30, terrace=0.0,
           material='stone')

    # --- ID plate + hoist socket -----------------------------------------------------------------
    F.box(s, 'IdPlate', (2.6, 2.48, 0.6), (0.9, 0.05, 0.5), material='gunmetal', bevel=0.01)
    s.socket('SOCKET_Hoist_Center', (0.0, 0.0, 2.2), (0, 0, 1))
    s.socket_names = ['SOCKET_Hoist_Center']
    return s


if __name__ == '__main__':
    # This body ships through the everyday-space-kit pack slot (ore_bulk_container), so it has
    # no fleet.json place entry — preview it standalone.
    import forge_export as E
    ship = build().finish()
    E.export_place(ship, {'layout': 'place', 'file': 'ore_bulk_container',
                          'asset_id': 'place_ore_bulk_container', 'lod_levels': [0],
                          'new_place': True}, preview=True)
