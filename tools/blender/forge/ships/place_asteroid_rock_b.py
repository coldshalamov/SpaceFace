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
    'stone': '#4a4e45',          # cold grey-green — a step under so the key lift lands mid
    'stone.strata': '#3a3d37',   # darker strata
    'stone.deep': '#3a3d37',
    'stone.quarry': '#585c50',
    'ceramic.ice': '#66747c',    # matte frost — restrained, grey enough to read as rime
    'glass': '#2a4048',          # thin translucent vein slivers only
    'paint2': '#3a3f45',
    'dark': '#16191d',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # --- compact displaced core + satellites, inside the live envelope ----------------------
    F.rock(s, 'Core', (0.1, 0, 0.4), 4.5, seed=19, subdiv=4, relief=0.32, terrace=0.0,
           material='stone',
           quarry_plane=((0.4, 0.2, 4.4), (0.1, 0.05, 1.0)), quarry_material='stone.quarry')
    F.rock(s, 'LumpA', (-1.8, -2.6, 2.8), 2.1, seed=29, subdiv=4, relief=0.3, terrace=0.0,
           material='stone.deep')
    F.rock(s, 'LumpB', (1.9, 2.4, -1.6), 2.0, seed=41, subdiv=4, relief=0.3, terrace=0.0,
           material='stone')
    F.rock(s, 'LumpC', (-2.2, 3.0, -1.4), 1.6, seed=53, subdiv=4, relief=0.3, terrace=0.0,
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
    # matte frost on the quarried shoulder — irregular sheets chamfered down at the rim and
    # laid almost flush with the cut face so they read as rime, not a mounted panel
    F.plate(s, 'FrostCapA', [(-0.6, -0.5), (0.9, -0.8), (1.9, -0.1), (1.6, 0.9),
                             (0.2, 1.3), (-0.8, 0.7)], 4.26, 0.13, material='ceramic.ice',
            chamfer=0.10)
    F.plate(s, 'FrostCapB', [(-1.5, 0.5), (-0.6, 0.25), (-0.2, 1.0), (-0.9, 1.7),
                             (-1.8, 1.2)], 4.32, 0.11, material='ceramic.ice', chamfer=0.08)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
