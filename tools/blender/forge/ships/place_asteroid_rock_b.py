"""Helios rock B (place_asteroid_rock_b) — Forge rebuild (GFX-8 rework).

Idea: "the icy rock". A compact displaced-stone core, one quarried flank, thin ice veins
laid into the rim — mining data calls this body icy with a blue rim. Reads as ROCK:
fine facets, strata, weight; the only glassy bits are thin vein slivers.
Live bounds (Blender): x -3.4..3.8, y -6.8..6.7, z -4.2..6.9. Socket/root copied live
(SOCKET_Structure_Core, SF_M4_HELIOS_ROCK_B_ROOT).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_rock_b'
COLORS = {
    'stone': '#565a52',          # cold grey-green mid value
    'stone.strata': '#434741',   # darker strata
    'stone.deep': '#434741',
    'stone.quarry': '#676a60',
    'ceramic.ice': '#7c8a90',    # matte frost — restrained
    'glass': '#2a4048',          # thin translucent vein slivers only
    'paint2': '#3a3f45',
    'dark': '#16191d',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- compact displaced core + satellites, inside the live envelope ----------------------
    F.rock(s, 'Core', (0.1, 0, 0.4), 4.5, seed=19, subdiv=4, relief=0.32, terrace=0.45,
           material='stone',
           quarry_plane=((0.4, 0.2, 4.4), (0.1, 0.05, 1.0)), quarry_material='stone.quarry')
    F.rock(s, 'LumpA', (-1.8, -2.6, 2.8), 2.1, seed=29, subdiv=4, relief=0.3, terrace=0.4,
           material='stone.deep')
    F.rock(s, 'LumpB', (1.9, 2.4, -1.6), 2.0, seed=41, subdiv=4, relief=0.3, terrace=0.4,
           material='stone')
    F.rock(s, 'LumpC', (-2.2, 3.0, -1.4), 1.6, seed=53, subdiv=4, relief=0.3, terrace=0.4,
           material='stone.deep')

    # --- strata ---------------------------------------------------------------------------
    F.band(s, 'Core', (0.1, 0, 1.6), (0.15, -0.1, 1.0), 0.9, 'stone.strata')
    F.band(s, 'Core', (0.0, 0.3, -1.6), (0.1, 0.14, 1.0), 0.7, 'stone.strata')

    # --- ice veins: thin translucent slivers embedded at the rim ------------------------------
    for i, (px, py, pz, ln, r_) in enumerate(((-2.4, 0.8, 1.8, 2.8, 0.6),
                                             (2.2, 0.6, 2.6, 2.2, -0.4),
                                             (0.3, -3.2, -0.6, 2.4, 1.1))):
        F.box(s, f'IceVein{i}', (px, py, pz), (ln, 0.16, 0.4), material='glass', bevel=0.01,
              rot=(0.2, 0.35, r_))
    # one matte frost cap on the quarried shoulder — embedded, not floating
    F.box(s, 'FrostCap', (0.6, 0.4, 4.3), (2.6, 1.9, 0.24), material='ceramic.ice',
          bevel=0.04, rot=(0.1, 0.08, 0.3))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
