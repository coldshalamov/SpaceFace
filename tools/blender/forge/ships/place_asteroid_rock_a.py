"""Helios rock A (place_asteroid_rock_a) — Forge rebuild (GFX-8 rework).

Idea: "the quarried rock". One big displaced-stone mass with a flat quarried face on top,
2-3 strata bands cut through the body, and satellite boulders. The cut face is STONE
(stone.quarry), never the machinery tile. Reads as ROCK: fine facets, strata, weight.
Live bounds (Blender): x +-9, y -4.3..4, z +-6.2. Sockets/root copied live
(SOCKET_Structure_Core, SF_M4_HELIOS_ROCK_A_ROOT — the helios-rock-a pilot's rootNode).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_rock_a'
COLORS = {
    'stone': '#5e564b',          # tan-grey belt mid value
    'stone.strata': '#4a443b',   # darker stratum bands
    'stone.deep': '#4a443b',     # satellites
    'stone.quarry': '#6a6256',   # flat quarried face — a shade lighter, same stone finish
    'paint2': '#3a3f45',
    'dark': '#16191d',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the mass: displaced core with a quarried top face + satellite boulders ------------
    F.rock(s, 'Core', (0, 0, -0.6), 5.5, seed=11, subdiv=4, relief=0.34, terrace=0.45,
           material='stone',
           quarry_plane=((0.4, -0.2, 4.2), (0.15, -0.1, 1.0)), quarry_material='stone.quarry')
    F.rock(s, 'LumpA', (-4.6, -1.4, 1.4), 2.6, seed=23, subdiv=4, relief=0.3, terrace=0.4,
           material='stone.deep')
    F.rock(s, 'LumpB', (3.8, 1.4, -2.2), 2.4, seed=37, subdiv=4, relief=0.3, terrace=0.4,
           material='stone')
    F.rock(s, 'LumpC', (-2.2, 1.8, -3.0), 1.9, seed=51, subdiv=4, relief=0.3, terrace=0.4,
           material='stone.deep')
    F.rock(s, 'Shard', (4.9, -1.8, 1.9), 1.5, seed=63, subdiv=4, relief=0.28, terrace=0.4,
           material='stone.deep',
           quarry_plane=((4.9, -1.8, 2.4), (-0.4, 0.2, 1.0)), quarry_material='stone.quarry')

    # --- strata: two darker bands following the displaced form ---------------------------------
    F.band(s, 'Core', (0, -0.5, 1.2), (0.12, 0.08, 1.0), 1.2, 'stone.strata')
    F.band(s, 'Core', (0, 0.4, -2.4), (0.06, -0.12, 1.0), 0.9, 'stone.strata')
    F.band(s, 'LumpA', (-4.6, -1.4, 1.6), (0.2, 0.1, 1.0), 0.6, 'stone.strata')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
