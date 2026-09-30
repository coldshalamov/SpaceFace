"""Memorial array — the ring of vigil lamps kept burning for the lost crews.
Forge rebuild of place_memorial_array.glb (same file, same asset id; SOCKET_Structure_Core
at origin is copied on export). Now a prop: the Candle Fleet landmark has its own body.

Idea: "a wreath of candles". From the top-down camera the read is one warm circle: an annulus
deck ring carrying twelve lamp capsules on short radial arms — every light steady, every one
warm — around a dark central obelisk holding a single flame on its crown plate. Outrigger
feet under the ring keep it standing against nothing.
Three values: charcoal ring and obelisk, pale capsule cups, dark name plates. Identity
colour: none — the lights are the identity, all warm. Lights: twelve capsule flames + the
one obelisk flame, slightly brighter.
Live bounds (Blender): x [-1.5, 13.3], y [-1.5, 1.5], z [-1.2, 1.9]. The ring is centred at
(6.0, 0) so it fits the live X span with a little radial give — a wreath reads as a ring at
any scale.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_memorial_array'
COLORS = {
    'paint': '#7d7668',       # pale capsule cups
    'paint2': '#3a3f45',      # charcoal ring deck
    'gunmetal': '#23282e',
    'dark': '#0f1216',        # the obelisk — near-black
    'bare': '#4a4238',        # name plates, etched
    'stripe': '#1c5552',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
}

CX, CY = 6.0, 0.0          # ring centre
R_RING = 5.6             # annulus midline radius
LAMPS = 12


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # === the wreath: a flat annulus deck with an inner lip ========================
    F.annulus(s, 'Wreath', (CX, CY), R_RING - 0.7, R_RING + 0.7, 0.35, 0.5,
              material='paint2', segments=32, bevel=0.05)
    # inner lip + outer kerb — layered edges so the ring reads as built, not cut
    F.annulus(s, 'WreathLip', (CX, CY), R_RING - 0.85, R_RING - 0.55, 0.6, 0.28,
              material='gunmetal', segments=32, bevel=0.03)
    F.annulus(s, 'WreathKerb', (CX, CY), R_RING + 0.55, R_RING + 0.85, 0.6, 0.28,
              material='paint', segments=32, bevel=0.03)

    # === the twelve candles: short radial arm, cup, steady warm flame ============
    for i in range(LAMPS):
        a = 2 * math.pi * i / LAMPS + math.pi / LAMPS
        ca, sa = math.cos(a), math.sin(a)
        arm_r = R_RING - 0.1
        # short radial arm from the ring inward
        F.beams(s, f'Arm{i}', [((CX + arm_r * ca, CY + arm_r * sa, 0.6),
                                (CX + (R_RING - 1.7) * ca, CY + (R_RING - 1.7) * sa, 0.85))],
                0.22, material='gunmetal')
        # lipped cup at the arm's end
        lx, ly = CX + (R_RING - 1.75) * ca, CY + (R_RING - 1.75) * sa
        F.cylinder(s, f'Cup{i}', (lx, ly, 0.7), (lx, ly, 1.35), 0.34, 0.42, material='paint',
                   segments=8, bevel=0.03)
        F.cylinder(s, f'CupLip{i}', (lx, ly, 1.35), (lx, ly, 1.47), 0.46, material='paint',
                   segments=8, bevel=0.02)
        F.light(s, f'Flame{i}', (lx, ly, 1.6), 'glow_warm', size=0.3)
        # engraved name plate on the ring face between arms
        a2 = a + math.pi / LAMPS
        nx, ny = CX + (R_RING + 0.15) * math.cos(a2), CY + (R_RING + 0.15) * math.sin(a2)
        F.box(s, f'Plate{i}', (nx, ny, 0.62), (0.7, 0.35, 0.08), material='bare', bevel=0.01,
              rot_z=a2)

    # === the obelisk at the centre — dark, holding one flame ======================
    # tapering needle on a stepped plinth
    F.box(s, 'ObeliskBase', (CX, CY, 0.45), (2.4, 2.4, 0.9), material='dark', bevel=0.08)
    F.box(s, 'Obelisk', (CX, CY, 2.6), (1.1, 1.1, 3.6), material='dark', bevel=0.06, taper=0.55)
    F.box(s, 'ObeliskCrown', (CX, CY, 4.5), (0.7, 0.7, 0.3), material='paint2', bevel=0.04)
    F.light(s, 'ObeliskFlame', (CX, CY, 4.75), 'glow_amber', size=0.4)
    # four tribute feet tying the plinth to the ring — nothing floats
    for i in range(4):
        a = math.radians(45 + i * 90)
        ca, sa = math.cos(a), math.sin(a)
        F.beams(s, f'Tie{i}', [((CX + 1.4 * ca, CY + 1.4 * sa, 0.55),
                                (CX + (R_RING - 0.9) * ca, CY + (R_RING - 0.9) * sa, 0.5))],
                0.2, material='gunmetal')

    # === the causeway: a narrow walk from the -X approach to the ring edge =========
    # the copied SOCKET_Structure_Core sits at the origin — the causeway lands on it
    F.plate(s, 'Causeway', [(-1.3, -0.75), (0.6, -0.75), (0.6, 0.75), (-1.3, 0.75)], 0.2, 0.4,
            material='paint2', chamfer=0.05)
    F.beams(s, 'CausewayLink', [((0.6, -0.6, 0.4), (1.4, -0.6, 0.4)),
                                ((0.6, 0.6, 0.4), (1.4, 0.6, 0.4))], 0.18, material='gunmetal')
    F.light(s, 'CausewayLampA', (-0.9, -0.55, 0.65), 'glow_warm', size=0.16)
    F.light(s, 'CausewayLampB', (-0.9, 0.55, 0.65), 'glow_warm', size=0.16)

    # === outrigger feet under the ring, four stations =============================
    s.detail = 1
    for i in range(4):
        a = math.radians(i * 90)
        ca, sa = math.cos(a), math.sin(a)
        F.box(s, f'Foot{i}', (CX + R_RING * ca, CY + R_RING * sa, -0.35),
              (0.9, 0.9, 0.5), material='paint2', bevel=0.06, rot_z=a)
        F.beams(s, f'FootBrace{i}', [((CX + R_RING * ca, CY + R_RING * sa, -0.1),
                                      (CX + (R_RING - 0.5) * ca, CY + (R_RING - 0.5) * sa, 0.35))],
                0.16, material='gunmetal')
    s.detail = 0

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
