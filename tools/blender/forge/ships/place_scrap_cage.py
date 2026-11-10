"""Scrap cage (place_scrap_cage) — Forge rebuild.

Idea: "the driller's pen". An open salvage pen: corner posts and rail bars forming a cage
around a heaped scrap pile — torn plate shards, a bent pipe run, a crushed container — with
a gate leaf hinged on the -X end (SOCKET_Gate) and hooded work lamps on two posts. Rust/
graphite improvised language, mid-value hazard only on the gate edge.
Live bounds (Blender): x -6.37..4.7, y +-3.2, z -2.75..2.95 — pivot off-centre toward -X.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_scrap_cage'
COLORS = {
    'paint': '#8f8674',
    'paint2': '#3a3f45',
    'deadmetal.rust': '#6a4a30',
    'bare.steel': '#4a4f55',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'dark.scorch': '#18120c',
    'hazard': '#8a7418',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}

X0, X1 = -6.0, 4.4      # pen extent (live envelope is offset -X)
Y0, Y1 = -2.9, 2.9
TOP = 2.6


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- cage frame: corner posts + two rail courses ------------------------------------------
    for k, (px, py) in enumerate(((X0, Y0), (X0, Y1), (X1, Y0), (X1, Y1))):
        F.box(s, f'Post{k}', (px, py, (TOP - 1.0) / 2), (0.55, 0.55, TOP + 1.0),
              material='deadmetal.rust', bevel=0.05)
        F.box(s, f'PostCap{k}', (px, py, TOP + 0.55), (0.75, 0.75, 0.3), material='dark',
              bevel=0.03)
    # rails along the long sides and the +X end (the -X end is the gate)
    for d in (0.6, 1.9):
        for py in (Y0, Y1):
            F.beams(s, f'Rail{py}{d}', [((X0, py, d), (X1, py, d))], 0.28,
                    material='bare.steel')
        F.beams(s, f'RailX{d}', [((X1, Y0, d), (X1, Y1, d))], 0.28, material='bare.steel')
    # Lit structure (GFX light-upgrades): an amber stripe along both long top rails (post rings were one
    # pixel at the place tilt), so the pen reads as two lit edges (LOOK.md: lamps are light).
    for py in (Y0, Y1):
        F.band(s, f'Rail{py}1.9', ((X0 + X1) / 2, py, 1.9), (0, 0, 1), 0.14, 'glow_amber', inset=0.01,
               depth=-0.02)
    # diagonal braces on the sides
    for py in (Y0, Y1):
        F.beams(s, f'Brace{py}', [((X0 + 0.3, py, 0.4), (X1 - 0.3, py, 2.4))], 0.18,
                material='gunmetal')

    # --- the gate leaf on -X: hinged to the corner post, hazard-edged -------------------------
    F.cylinder(s, 'GateHinge', (X0, Y0, -1.0), (X0, Y0, TOP), 0.3, material='gunmetal',
               segments=10)
    F.box(s, 'GateLeaf', (X0 - 0.35, 0.6, 0.9), (0.45, 4.6, 2.4), material='paint2',
          bevel=0.05, rot_z=math.radians(-14))
    F.box(s, 'GateEdge', (X0 - 0.45, 0.6, 2.0), (0.5, 4.7, 0.35), material='hazard',
          bevel=0.0, rot_z=math.radians(-14))
    F.light(s, 'GateLamp', (X0 - 0.7, 2.6, 2.2), 'glow_amber', size=0.3)

    # --- the scrap heap inside: layered shards, one crushed box, a bent pipe ------------------
    F.box(s, 'HeapBase', (-0.8, 0.0, -1.6), (8.6, 4.6, 1.4), material='dark.scorch', bevel=0.3,
          taper=0.8)
    shards = [
        ((-2.4, -0.8, -0.3), (3.2, 1.8, 0.3), 24, 'bare.steel'),
        ((-0.2, 1.0, -0.2), (2.6, 1.5, 0.28), -31, 'deadmetal.rust'),
        ((1.8, -1.0, -0.4), (2.9, 1.3, 0.26), 12, 'paint2'),
        ((-3.8, 0.9, -0.5), (2.0, 1.4, 0.24), 47, 'dark.scorch'),
        ((0.6, -0.3, 0.0), (1.8, 1.1, 0.2), -18, 'bare.steel'),
    ]
    for i, (c, sz, rot, mat) in enumerate(shards):
        F.box(s, f'Shard{i}', c, sz, material=mat, bevel=0.03, rot_z=math.radians(rot))
    # one crushed container still recognisable
    F.box(s, 'CrushedPod', (1.4, 0.9, 0.3), (2.4, 1.6, 1.4), material='deadmetal.rust', bevel=0.12,
          rot_z=math.radians(-8), taper=0.85)
    F.box(s, 'CrushedPodBand', (1.4, 0.9, 0.7), (2.5, 0.3, 0.22), material='hazard',
          bevel=0.0, rot_z=math.radians(-8))
    # bent pipe off the heap
    s.detail = 1
    F.beams(s, 'BentPipe', [((-1.0, -1.5, 0.2), (0.6, -2.2, 1.2)),
                            ((0.6, -2.2, 1.2), (2.2, -2.6, 0.9))], 0.22,
            material='gunmetal')
    s.detail = 0

    # --- hooded work lamps on the two tall posts ------------------------------------------------
    F.work_lamp(s, 'LampA', (X0 + 0.4, Y0 + 0.4, TOP + 0.7), aim=(0.5, 0.4, -0.7),
                size=0.45, lens='glow_warm')
    F.work_lamp(s, 'LampB', (X1 - 0.4, Y1 - 0.4, TOP + 0.7), aim=(-0.5, -0.4, -0.7),
                size=0.45, lens='glow_warm')
    F.beacon(s, 'PenStrobe', (X1, Y1, TOP + 0.9), 'glow_red', size=0.3)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
