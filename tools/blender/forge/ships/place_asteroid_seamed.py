"""Seamed asteroid (place_asteroid_seamed) — Forge rebuild (GFX-8).

Idea: "the veined rock". One big faceted boulder with a mineral seam running across it —
a banded vein of mid-value ore colour laid into the stone as a chain of plates, cut with a
dark fracture line, with faint warm glints along the hot section. SOCKET_Scan_Target sits on
the seam (copied live). Reads as ROCK with a readable ore band — no machinery tile.
Live bounds (Blender): x -14.1..14.3, y -11.7..12.1, z -10.2..11.4.
Scene root stays place_asteroid_seamed (render-package pilot rootNode).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_seamed'
COLORS = {
    'stone': '#4b453d',
    'stone.deep': '#38332d',
    'paint.vein': '#6b5e3c',     # mid-value mineral band — dull brassy ore, not saturated
    'stripe': '#6b5416',
    'gunmetal': '#3a3f45',
    'bare': '#5e574a',
    'dark': '#16191d',
    'glow_warm': '#c8903a',      # faint hot-seam glints only
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the mass: one dominant boulder + flanking lumps ---------------------------------------
    F.rock(s, 'Core', (0, 0, 0), 11.0, seed=13, material='stone')
    F.rock(s, 'LumpA', (-7.5, -3.0, -2.0), 4.6, seed=47, material='stone.deep')
    F.rock(s, 'LumpB', (6.0, 4.5, 3.0), 4.0, seed=59, material='stone')
    F.rock(s, 'LumpC', (1.0, -6.5, 4.5), 3.2, seed=71, material='stone.deep',
           quarry_plane=((1.0, -6.5, 5.6), (0.0, -0.3, 1.0)))

    # --- the seam: a banded vein crossing the rock diagonally over the top ----------------------
    # A chain of flush plates following the surface, bordered by dark fracture strips.
    # Path runs x -10 -> +10 over the crown (z up to ~9), dipping down both flanks.
    seam = [(-10.5, -4.5, 2.2, 3.0, 1.05), (-7.0, -2.6, 5.6, 3.4, 0.8),
            (-3.5, -1.0, 7.8, 3.4, 0.5), (0.0, 0.6, 8.8, 3.4, 0.2),
            (3.5, 2.0, 8.0, 3.4, -0.1), (7.0, 3.4, 5.6, 3.2, -0.35),
            (10.0, 4.6, 2.8, 2.8, -0.6)]
    for i, (px, py, pz, w, pitch) in enumerate(seam):
        # fracture shoulders flanking the ore band
        F.box(s, f'SeamCut{i}A', (px, py - w * 0.62, pz - 0.1), (w * 1.1, 0.5, 0.5),
              material='dark', bevel=0.02, rot=(0.0, pitch, 0.35))
        F.box(s, f'SeamCut{i}B', (px, py + w * 0.62, pz - 0.1), (w * 1.1, 0.5, 0.5),
              material='dark', bevel=0.02, rot=(0.0, pitch, 0.35))
        # the ore plate itself — mid value, metallic glint via gunmetal sub-plates
        F.box(s, f'Seam{i}', (px, py, pz), (w, w * 0.9, 0.4), material='paint.vein',
              bevel=0.04, rot=(0.0, pitch, 0.35))
        if i % 2 == 0:
            F.box(s, f'SeamOre{i}', (px, py, pz + 0.25), (w * 0.5, w * 0.4, 0.15),
                  material='gunmetal', bevel=0.01, rot=(0.0, pitch, 0.35))
    # faint warm glints along the hot middle of the seam — small emissive points only
    for i, (px, py, pz) in enumerate(((-3.5, -1.0, 8.2), (0.0, 0.6, 9.2),
                                      (3.5, 2.0, 8.4))):
        F.light(s, f'SeamGlow{i}', (px, py, pz), 'glow_warm', size=0.3)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
