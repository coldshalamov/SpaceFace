"""Helios rock A (place_asteroid_rock_a) — Forge rebuild (GFX-8).

Idea: "the quarried metal rock". A dark faceted boulder cluster — one big mass, two lumps —
with a flat quarried face on top where a chunk was cut away, and thin dark metallic veins
running through the cut. Reads as ROCK: facets, no machinery tile, no lights.
Live bounds (Blender): x +-9, y -4.3..4, z +-6.2. Sockets/root copied live
(SOCKET_Structure_Core, SF_M4_HELIOS_ROCK_A_ROOT — the helios-rock-a pilot's rootNode).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_rock_a'
COLORS = {
    'stone': '#4a443d',          # dark ore-bearing basalt
    'stone.deep': '#37332e',     # shadowed facets
    'gunmetal': '#3a3f45',       # dark specular vein metal
    'bare': '#5e574a',           # fresh quarried face
    'paint2': '#3a3f45',
    'dark': '#16191d',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the mass: one big boulder with a quarried top face + two satellite lumps -----------
    F.rock(s, 'Core', (0, 0, -0.4), 5.6, seed=11, material='stone',
           quarry_plane=((0.4, -0.2, 4.6), (0.15, -0.1, 1.0)))
    F.rock(s, 'LumpA', (-4.6, -1.2, 2.2), 2.9, seed=23, material='stone.deep')
    F.rock(s, 'LumpB', (3.8, 1.6, -2.4), 2.5, seed=37, material='stone')
    # a small shard leaning on the flank — broken off the quarry face
    F.rock(s, 'Shard', (4.8, -2.2, 2.6), 1.4, seed=51, material='stone.deep',
           quarry_plane=((4.8, -2.2, 2.9), (-0.4, 0.2, 1.0)))

    # --- the quarried cut face: pale fresh stone + dark metallic veins ------------------------
    F.box(s, 'CutFace', (0.4, -0.2, 4.75), (7.2, 5.0, 0.5), material='bare', bevel=0.06,
          rot=(0.06, 0.15, 0.1))
    # metallic specular veins crossing the cut — dark, narrow, following one grain
    for i, (vy, vz, ln) in enumerate(((-1.4, 4.9, 5.2), (0.2, 4.95, 6.4), (1.6, 4.85, 4.6))):
        F.box(s, f'Vein{i}', (0.3, vy, vz), (ln, 0.35, 0.18), material='gunmetal',
              bevel=0.02, rot=(0.06, 0.15, 0.35))
    # two vein continuations down the sunward flank
    for i, (vx, vy, vz) in enumerate(((-3.2, 1.8, 2.4), (2.6, -2.6, 1.8))):
        F.box(s, f'FlankVein{i}', (vx, vy, vz), (0.35, 0.3, 2.6), material='gunmetal',
              bevel=0.02, rot=(0.5, 0.2, 0.1))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
