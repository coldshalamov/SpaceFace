"""Graffiti asteroid (place_asteroid_graffiti) — Forge rebuild (GFX-8).

Idea: "the tagged rock". A mid-size boulder with one face quarried flat — and miners have
marked it: modelled paint bands and a rough hazard chevron sprayed on the cut face, two
survey stakes with flag plates planted on the rim, one work lamp. No text anywhere.
Reads as a claimed/worked rock — paint marks and hardware ON stone.
Live bounds (Blender): x -12.5..12.2, y -9.7..9.9, z -9..9.4.
Scene root stays place_asteroid_graffiti; SOCKET_Camera_Focus copied live.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_asteroid_graffiti'
COLORS = {
    'stone': '#49443c',
    'stone.deep': '#37332e',
    'bare': '#5c5548',           # quarried face
    'paint.tag1': '#2a6a66',     # teal tag band
    'paint.tag2': '#8a5a1c',     # ochre tag band
    'paint.tag3': '#7a3826',     # rust-red tag band
    'hazard': '#8a7418',
    'gunmetal': '#3a3f45',
    'dark': '#16191d',
    'glow_warm': '#ffc27a',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the mass: core + lumps; a flat quarried face looking up/forward -------------------------
    F.rock(s, 'Core', (0, 0, -0.5), 9.6, seed=17, material='stone',
           quarry_plane=((0.5, -0.5, 6.4), (0.1, -0.25, 1.0)))
    F.rock(s, 'LumpA', (-6.8, 2.5, -1.0), 4.2, seed=53, material='stone.deep')
    F.rock(s, 'LumpB', (5.5, -4.0, 2.5), 3.6, seed=67, material='stone')
    F.rock(s, 'LumpC', (-3.0, -6.0, -3.5), 3.4, seed=79, material='stone.deep')

    # --- the quarried face: fresh pale cut ------------------------------------------------------
    F.box(s, 'CutFace', (0.5, -0.6, 6.5), (10.5, 8.0, 0.5), material='bare', bevel=0.06,
          rot=(0.1, 0.24, 0.0))

    # --- miners' marks ON the cut face: paint bands, no glyphs ----------------------------------
    face_rot = (0.1, 0.24, 0.0)
    # two long sprayed bands
    F.box(s, 'TagBandA', (-0.8, -1.4, 6.85), (7.6, 1.1, 0.16), material='paint.tag1',
          bevel=0.0, rot=(0.1, 0.24, math.radians(9)))
    F.box(s, 'TagBandB', (0.6, 0.2, 6.95), (5.2, 0.9, 0.16), material='paint.tag2',
          bevel=0.0, rot=(0.1, 0.24, math.radians(-6)))
    # a rough hazard chevron block
    for i in range(3):
        F.box(s, f'Chev{i}', (-3.4 + i * 1.1, 1.6 + i * 0.55, 6.9), (0.7, 1.4, 0.15),
              material='hazard', bevel=0.0, rot=(0.1, 0.24, math.radians(35)))
    # a small rust-red claim tag off to one side
    F.box(s, 'TagDot', (3.4, 1.8, 6.9), (1.6, 1.2, 0.15), material='paint.tag3',
          bevel=0.0, rot=(0.1, 0.24, math.radians(-12)))

    # --- survey stakes planted on the rim — thin posts + flag plates -----------------------------
    for k, (sx, sy, sz) in enumerate(((7.8, 3.4, 4.2), (-8.2, -3.8, 2.6))):
        F.cylinder(s, f'Stake{k}', (sx, sy, sz), (sx, sy, sz + 2.6), 0.09,
                   material='gunmetal', segments=6)
        F.box(s, f'StakeFlag{k}', (sx + 0.45, sy, sz + 2.3), (0.9, 0.05, 0.55),
              material='paint.tag1' if k == 0 else 'paint.tag2', bevel=0.0)
        F.light(s, f'StakeTip{k}', (sx, sy, sz + 2.75), 'glow_amber', size=0.2)
    # one work lamp on a stub tripod aimed at the tagged face
    F.cylinder(s, 'LampPole', (5.8, 4.6, 2.2), (5.8, 4.6, 4.0), 0.12, material='gunmetal',
               segments=6)
    F.work_lamp(s, 'SiteLamp', (5.8, 4.6, 4.2), aim=(-0.4, -0.3, 0.6), size=0.5,
                lens='glow_warm')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
