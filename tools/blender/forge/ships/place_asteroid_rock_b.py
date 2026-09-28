"""Helios rock B (place_asteroid_rock_b) — Forge rebuild (GFX-8).

Idea: "the icy rock". A compact faceted core in cold blue-grey stone, frost caps on the
sunward facets and thin translucent ice veins at the rim — mining data calls this body icy
with a blue rim. Reads as ROCK, never machinery; the only glassy bits are thin vein slivers.
Live bounds (Blender): x -3.4..3.8, y -6.8..6.7, z -4.2..6.9. Socket/root copied live
(SOCKET_Structure_Core, SF_M4_HELIOS_ROCK_B_ROOT).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_rock_b'
COLORS = {
    'stone': '#4e585e',          # cold blue-grey basalt
    'stone.deep': '#3a4046',
    'ceramic.ice': '#8fa4ae',    # pale frost caps — matte, not glass
    'glass': '#2a4048',          # thin translucent vein slivers only
    'paint2': '#3a3f45',
    'dark': '#16191d',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- compact core, asymmetric lumps kept inside the live envelope -------------------------
    F.rock(s, 'Core', (0.1, 0, 0.6), 4.6, seed=19, material='stone')
    F.rock(s, 'LumpA', (-1.6, -2.6, 3.4), 2.2, seed=29, material='stone.deep')
    F.rock(s, 'LumpB', (1.8, 2.4, -1.6), 2.0, seed=41, material='stone')

    # --- frost caps: pale matte plates lying on the sunward facets ------------------------------
    for i, (px, py, pz, s_, r_) in enumerate(((-1.2, -0.6, 4.4, 2.6, 0.3),
                                             (1.8, 1.4, 3.4, 1.9, -0.5),
                                             (-0.4, 3.2, 1.8, 2.2, 0.9),
                                             (2.2, -2.8, 0.4, 1.6, 1.4))):
        F.box(s, f'Frost{i}', (px, py, pz), (s_, s_ * 0.7, 0.22), material='ceramic.ice',
              bevel=0.04, rot=(0.3, 0.2, r_))
    # --- thin ice veins at the rim — the faint translucent blue slivers ---------------------------
    for i, (px, py, pz, ln, r_) in enumerate(((-2.6, 1.0, 2.0, 3.4, 0.6),
                                             (2.4, 0.6, 3.0, 2.6, -0.4),
                                             (0.4, -3.6, -0.4, 2.8, 1.1))):
        F.box(s, f'IceVein{i}', (px, py, pz), (ln, 0.18, 0.5), material='glass', bevel=0.01,
              rot=(0.2, 0.35, r_))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
