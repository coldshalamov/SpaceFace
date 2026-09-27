"""Debris chunk — the torn hull-section landmark found at yards, caches and stashes.
Forge rebuild of place_debris_chunk.glb (same file, same asset id, sockets copied from live).

Idea: "a ship's flank, sheared off whole". One intact face — a patch of hull plating with its
frame rings still inside — and every other edge ragged: bent stringers, a ruptured pressure
tank, slag teeth, a drift of small plates still welded at the tear line. The mass tumbles
slowly; nothing about it is lit or alive.
Three values: oxidised hull grey skin, charcoal frame, black torn interior. Identity colour:
a dead ochre cargo stencil band across the face. Lights: none — debris carries no lamps.
Live bounds (Blender): x [0.2, 24.1], y [-5.0, 5.5], z [-4.0, 3.7] — pivot at the stem end.
The live SOCKET_Tether_Massline sits near (2.0, 0.0, -1.0) Blender — put a mooring eye there.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_debris_chunk'
COLORS = {
    'deadmetal': '#100f0d',      # oxidised hull grey, near-black under the wash
    'deadmetal.deep': '#0e1013', # charcoal inner structure
    'stripe': '#2a2416',      # dead ochre stencil band
    'gunmetal': '#23282e',
    'dark': '#0d1013',
    'bare': '#38322a',        # burnt torn metal
    'ceramic': '#867e6e',     # insulation at the tear
    'hazard': '#7a6420',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the intact face: a hull-plate patch, bulged like the ship's flank -------
    # face plate in the YZ plane at the -X end, slightly domed by stacked slabs
    F.plate_v(s, 'Face', [(-5.0, -3.9), (4.6, -3.4), (5.4, 0.4), (4.2, 3.9), (-4.4, 3.6),
                          (-5.4, 0.2)],
              0.3, 0.6, plane='yz', material='deadmetal', chamfer=0.5, uv_scale=2.0)
    F.plate_v(s, 'FaceInset', [(-3.2, -2.2), (3.0, -2.0), (3.8, 0.3), (2.8, 2.4), (-3.0, 2.4),
                               (-4.0, 0.2)],
              -0.35, 0.6, plane='yz', material='deadmetal.deep', chamfer=0.3)
    # dead ochre stencil band across the face
    F.box(s, 'Stencil', (-0.05, 0.4, 0.4), (0.24, 7.6, 1.1), material='stripe', bevel=0.02,
          rot=(0, 0, math.radians(7)))

    # --- ribs and stringers running aft from the face ----------------------------
    # frame hoops at the tear stations
    for i, x in enumerate((4.6, 9.4, 14.2)):
        r = 4.5 - i * 0.5
        F.cylinder(s, f'HoopT{i}', (x, 0.3, -r * 0.62), (x, 0.3, r * 0.95), 0.22,
                   material='gunmetal', segments=8, bevel=0.0)
        F.cylinder(s, f'HoopL{i}', (x, -r * 0.62, 0.2), (x, r * 0.9, 0.2), 0.22,
                   material='gunmetal', segments=8, bevel=0.0)
    # longitudinal stringers, bent ragged at the tear
    F.beams(s, 'StringerA', [((0.8, 3.9, 1.4), (8.5, 3.4, 1.0)), ((8.5, 3.4, 1.0), (15.6, 4.1, 0.2)),
                             ((15.6, 4.1, 0.2), (20.5, 3.0, 0.9))], 0.42, material='gunmetal')
    F.beams(s, 'StringerB', [((0.8, -3.9, 1.0), (9.5, -3.4, 0.6)), ((9.5, -3.4, 0.6), (17.0, -2.6, -0.8))],
            0.42, material='gunmetal')
    F.beams(s, 'StringerC', [((0.9, 0.4, -3.2), (10.0, 0.2, -2.8)), ((10.0, 0.2, -2.8), (18.6, 0.9, -1.6))],
            0.38, material='gunmetal')
    F.beams(s, 'StringerD', [((1.0, -3.6, -2.2), (12.0, -2.9, -1.8))], 0.36, material='gunmetal')

    # --- skin patches still on the frame ----------------------------------------
    F.box(s, 'SkinTop', (5.4, 0.6, 2.2), (7.2, 5.8, 0.34), material='deadmetal', bevel=0.04,
          rot=(math.radians(6), math.radians(-16), math.radians(-4)))
    F.box(s, 'SkinStbd', (8.0, -3.9, -0.4), (7.4, 0.32, 5.2), material='deadmetal', bevel=0.04,
          rot=(0, math.radians(-7), math.radians(5)))
    F.box(s, 'SkinMid', (12.2, 1.2, 1.4), (5.4, 4.6, 0.3), material='deadmetal', bevel=0.04,
          rot=(math.radians(14), math.radians(26), math.radians(-10)))
    F.box(s, 'SkinLoose', (17.9, 2.2, 1.6), (3.6, 2.8, 0.24), material='bare', bevel=0.03,
          rot=(math.radians(20), math.radians(28), math.radians(-12)))

    # --- embedded ruptured pressure tank, half inside the mass ------------------
    F.cylinder(s, 'Tank', (13.5, -0.6, -1.6), (20.8, -0.2, -0.9), 2.0, material='deadmetal.deep',
               segments=12, bevel=0.1)
    F.ring(s, 'TankBand', (15.4, -0.55, -1.5), 2.06, 0.3, axis=(1, 0, 0), material='hazard',
           segments=12, sides=6)
    F.sphere(s, 'TankCap', (21.2, -0.15, -0.85), 1.9, material='bare', segments=12)
    # torn plumbing off the tank
    F.cylinder(s, 'PipeA', (14.2, -0.5, -2.6), (15.8, 1.4, -3.4), 0.22, material='gunmetal',
               segments=8)
    F.cylinder(s, 'PipeB', (14.4, -0.6, -2.5), (16.4, -2.2, -2.9), 0.18, material='gunmetal',
               segments=8)

    # --- slag teeth and shrapnel welded at the tear line -------------------------
    s.detail = 1
    teeth = []
    for i in range(9):
        a = -2.4 + i * 0.62
        teeth.append(((21.5 + 0.6 * (i % 3), a, -2.6 + 0.5 * (i % 4)), (1.6, 0.5, 0.3), 0.0))
    for i in range(7):
        a = -3.0 + i * 0.9
        teeth.append(((18.5 + 0.4 * (i % 2), a, 2.9 + 0.2 * i), (1.1, 0.42, 0.24), 0.0))
    F.boxes(s, 'SlagTeeth', teeth, 'bare')
    s.detail = 0

    # --- the mooring eye where the live tether socket sits -----------------------
    F.ring(s, 'TetherEye', (2.0, 0.0, 1.0), 0.55, 0.16, axis=(1, 0, 0), material='hazard',
           segments=16, sides=8)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
