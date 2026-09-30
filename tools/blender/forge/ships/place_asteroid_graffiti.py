"""Graffiti asteroid (place_asteroid_graffiti) — Forge rebuild (GFX-8 rework).

Idea: "the tagged rock". A mid-size displaced-stone boulder with one face quarried flat —
and miners have marked it: two modelled paint bands sprayed across the cut face in two
colours, survey stakes with flag plates planted on the rim, one work lamp. No text.
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
    'stone': '#524a40',
    'stone.strata': '#403830',
    'stone.deep': '#403830',
    'stone.quarry': '#5c5448',   # the flat cut face — lighter stone, never machinery tile
    'paint.tag1': '#3f6a62',     # teal survey band — muted
    'paint.tag2': '#8a5c20',     # ochre claim band — muted
    'hazard': '#8a7418',
    'gunmetal': '#3a3f45',
    'dark': '#16191d',
    'glow_warm': '#ffc27a',
    'glow_amber': '#c88f2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # --- the mass: displaced core + satellites; a flat quarried face up/forward -------------
    F.rock(s, 'Core', (0, 0, -0.5), 9.2, seed=17, subdiv=4, relief=0.34, terrace=0.0,
           material='stone',
           quarry_plane=((0.5, -0.5, 5.9), (0.1, -0.25, 1.0)), quarry_material='stone.quarry')
    F.rock(s, 'LumpA', (-6.8, 2.5, -1.0), 4.0, seed=53, subdiv=4, relief=0.3, terrace=0.0,
           material='stone.deep')
    F.rock(s, 'LumpB', (5.5, -4.0, 2.5), 3.4, seed=67, subdiv=4, relief=0.3, terrace=0.0,
           material='stone')
    F.rock(s, 'LumpC', (-3.0, -6.0, -3.5), 3.2, seed=79, subdiv=4, relief=0.3, terrace=0.0,
           material='stone.deep')

    # one stratum below the cut so the body reads layered
    F.band(s, 'Core', (0, 0.3, -3.2), (0.08, -0.1, 1.0), 1.0, 'stone.strata')

    # --- miners' marks ON the quarried face: modelled paint bands, no glyphs -----------------
    face_rot = (0.1, 0.24, 0.0)
    # two long sprayed bands in two colours, lying proud of the cut face
    F.box(s, 'TagBandA', (-0.8, -1.4, 6.1), (7.6, 1.1, 0.18), material='paint.tag1',
          bevel=0.0, rot=(0.1, 0.24, math.radians(9)))
    F.box(s, 'TagBandB', (0.6, 0.2, 6.2), (5.2, 0.9, 0.18), material='paint.tag2',
          bevel=0.0, rot=(0.1, 0.24, math.radians(-6)))
    # a rough hazard chevron row — three slanted blocks
    for i in range(3):
        F.box(s, f'Chev{i}', (-3.4 + i * 1.1, 1.6 + i * 0.55, 6.15), (0.7, 1.4, 0.16),
              material='hazard', bevel=0.0, rot=(0.1, 0.24, math.radians(35)))
    # a second sprayed band lower on the face in the other colour
    F.box(s, 'TagBandC', (1.2, -0.6, 5.9), (4.4, 0.8, 0.16), material='paint.tag2',
          bevel=0.0, rot=(0.1, 0.24, math.radians(4)))

    # --- survey stakes planted on the rim — thin posts + flag plates, bases in the stone ----
    for k, (sx, sy, sz) in enumerate(((7.6, 3.4, 3.6), (-8.0, -3.8, 2.0))):
        F.cylinder(s, f'Stake{k}', (sx, sy, sz), (sx, sy, sz + 2.6), 0.09,
                   material='gunmetal', segments=6)
        F.box(s, f'StakeFlag{k}', (sx + 0.45, sy, sz + 2.3), (0.9, 0.05, 0.55),
              material='paint.tag1' if k == 0 else 'paint.tag2', bevel=0.0)
        F.light(s, f'StakeTip{k}', (sx, sy, sz + 2.75), 'glow_amber', size=0.2)
    # one work lamp on a stub tripod aimed at the tagged face
    F.cylinder(s, 'LampPole', (5.8, 4.6, 1.6), (5.8, 4.6, 3.6), 0.12, material='gunmetal',
               segments=6)
    F.work_lamp(s, 'SiteLamp', (5.8, 4.6, 3.8), aim=(-0.4, -0.3, 0.6), size=0.5,
                lens='glow_warm')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
