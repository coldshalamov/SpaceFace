"""Helios rock C (place_asteroid_rock_c) — Forge rebuild (GFX-8).

Idea: "the crystal rock". A small faceted stone core with one flank sprouting a cluster of
sharp crystals — pale blades with faintly glowing tips, the only emissive on the body.
Reads as ROCK + crystal outcrop, no machinery.
Live bounds (Blender): x +-4.9, y -4.5..4.2, z -4.6..5.2. Socket/root copied live
(SOCKET_Structure_Core, SF_M4_HELIOS_ROCK_C_ROOT).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_rock_c'
COLORS = {
    'stone': '#4c463e',
    'stone.deep': '#37332e',
    'ceramic.xtal': '#6e7c86',   # pale crystal blades
    'glow_cyan': '#4fd8e8',      # faint crystal tips only
    'gunmetal': '#3a3f45',
    'dark': '#16191d',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the stone core ----------------------------------------------------------------------
    F.rock(s, 'Core', (0, 0, 0), 4.4, seed=31, material='stone')
    F.rock(s, 'LumpA', (2.6, -1.8, 1.6), 1.9, seed=43, material='stone.deep')

    # --- crystal cluster on the sunward flank: tapered blades + faint lit tips -----------------
    spikes = [
        (-1.8, 2.2, 2.6, 0.55, 2.8, (0.2, -0.5)),
        (-0.6, 2.8, 3.0, 0.7, 3.4, (0.1, -0.3)),
        (0.8, 2.4, 2.8, 0.5, 2.6, (0.35, -0.15)),
        (1.8, 1.2, 3.4, 0.4, 2.0, (0.5, 0.1)),
        (-2.4, 1.0, 3.2, 0.42, 2.2, (-0.15, -0.6)),
        (0.2, 3.2, 1.6, 0.38, 1.8, (0.5, -0.4)),
    ]
    for i, (px, py, pz, r, ln, (rx, ry)) in enumerate(spikes):
        # a blade: thin tapered box, tip reaching out of the flank
        F.box(s, f'Xtal{i}', (px, py, pz + ln * 0.4), (r * 2.0, r * 0.8, ln),
              material='ceramic.xtal', bevel=0.02, taper=0.25, rot=(rx, ry, 0.3 * i))
        F.light(s, f'XtalTip{i}', (px, py, pz + ln * 0.9), 'glow_cyan', size=0.16)
    # one loose shard fallen at the foot
    F.box(s, 'XtalFallen', (-2.0, -2.6, -3.2), (0.9, 0.5, 1.6), material='ceramic.xtal',
          bevel=0.02, taper=0.3, rot=(0.9, 0.4, 0.6))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
