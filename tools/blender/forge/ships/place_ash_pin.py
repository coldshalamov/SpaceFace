"""Ash pin — the squat memorial cairn where ashes were committed to the lane.
Forge rebuild of place_ash_pin.glb (same file, same asset id).

Idea: "a small shrine that keeps station". A low ballast base on four feet, a spar carrying
an offering cage — a little basket of hung tokens and wire offerings — and a name plate
lit by one warm lamp.
Three values: pale stone-grey base, dark cage and spar, charcoal feet. Identity colour:
none loud — warm lamp only, one pale name plate. Lights: the single warm offering lamp.
Live bounds (Blender): x [-1.7, 1.7], y [-1.7, 1.7], z [-0.1, 3.7].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_ash_pin'
COLORS = {
    'paint': '#48443c',       # cairn stone grey
    'paint2': '#3a3f45',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'bare': '#4a4238',
    'glow_warm': '#ffdba6',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # ballast base: a low drum on four blocky feet
    F.cylinder(s, 'Base', (0, 0, 0.0), (0, 0, 0.9), 1.35, 1.55, material='paint',
               segments=12, bevel=0.08)
    F.band(s, 'Base', (0, 0, 0.5), (0, 0, 1), 0.3, 'paint2', depth=0.06)
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = 1.45 * math.cos(a), 1.45 * math.sin(a)
        F.box(s, f'Foot{i}', (x, y, 0.1), (0.55, 0.55, 0.7), material='paint2', bevel=0.06,
              rot_z=a)
        F.beams(s, f'FootBrace{i}', [((x * 0.9, y * 0.9, 0.4), (x * 0.45, y * 0.45, 1.0))],
                0.14, material='gunmetal')
    # chain eyes around the base rim
    s.detail = 1
    links = [((1.38 * math.cos(math.radians(i * 45 + 22)), 1.38 * math.sin(math.radians(i * 45 + 22)),
              0.85), (0.16, 0.16, 0.2), 0.0) for i in range(5)]
    F.boxes(s, 'ChainEyes', links, 'gunmetal')
    s.detail = 0

    # spar rising off the base carrying the offering cage
    F.cylinder(s, 'Spar', (0, 0, 0.9), (0.15, 0.1, 3.3), 0.16, 0.1, material='gunmetal',
               segments=8, bevel=0.02)
    # cage: ring + bars, hung slightly off-axis like a basket
    F.cylinder(s, 'CageArm', (0.15, 0.1, 3.1), (0.85, 0.5, 3.05), 0.07, material='gunmetal',
               segments=6, bevel=0.0)
    cx, cy, cz = 0.95, 0.55, 2.6
    F.ring(s, 'CageRing', (cx, cy, cz + 0.55), 0.5, 0.06, axis=(0, 0, 1), material='gunmetal',
           segments=12, sides=5)
    F.ring(s, 'CageRingLo', (cx, cy, cz - 0.15), 0.38, 0.06, axis=(0, 0, 1), material='gunmetal',
           segments=12, sides=5)
    for i in range(4):
        a = math.radians(45 + i * 90)
        F.beams(s, f'CageBar{i}', [((cx + 0.5 * math.cos(a), cy + 0.5 * math.sin(a), cz + 0.55),
                                    (cx + 0.38 * math.cos(a), cy + 0.38 * math.sin(a), cz - 0.15))],
                0.07, material='gunmetal')
    F.cylinder(s, 'CageHang', (0.85, 0.5, 3.05), (cx, cy, cz + 0.55), 0.045,
               material='gunmetal', segments=6, bevel=0.0)
    # hung tokens inside the cage — the offerings
    s.detail = 1
    for i in range(3):
        a = math.radians(i * 120 + 30)
        F.box(s, f'Token{i}', (cx + 0.3 * math.cos(a), cy + 0.3 * math.sin(a), cz + 0.2),
              (0.16, 0.05, 0.3), material='bare', bevel=0.01, rot_z=a)
    s.detail = 0
    F.beacon(s, 'OfferingLamp', (cx, cy, cz + 0.15), 'glow_warm', size=0.22)

    # name plate on the base face, lit by the lamp above it
    F.box(s, 'NamePlate', (0, -1.38, 0.5), (0.9, 0.08, 0.5), material='bare', bevel=0.02)
    F.box(s, 'PlateBoltL', (-0.35, -1.42, 0.5), (0.09, 0.06, 0.09), material='gunmetal',
          bevel=0.01)
    F.box(s, 'PlateBoltR', (0.35, -1.42, 0.5), (0.09, 0.06, 0.09), material='gunmetal',
          bevel=0.01)
    # offering wires drooping from the spar
    F.cylinder(s, 'WireA', (0.15, 0.1, 3.0), (-0.5, -0.6, 2.1), 0.03, material='gunmetal',
               segments=5, bevel=0.0)
    F.cylinder(s, 'WireB', (0.15, 0.1, 2.8), (0.7, -0.5, 2.0), 0.03, material='gunmetal',
               segments=5, bevel=0.0)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
