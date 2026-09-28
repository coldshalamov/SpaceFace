"""Lane pin — "Corridor Pin 44-C", the marker buoy planted on the Helios lane.
Forge rebuild of place_lane_pin.glb (same file, same asset id).

Idea: "a hex float with a lit halo". From above the read is a hexagon with a glowing teal
ring — a squat hexagonal buoyancy/drive float, chamfered corners carrying ballast pods, a
short tower in the middle ringed by a lit teal halo (the lane colour), topped by a white
top-hat blink light. Splayed stub legs land the float on nothing.
Three values: pale buoy coat, charcoal underframe, dark tower. Identity colour: Helios teal
— the halo ring and a band on the tower. Lights: the teal halo (reads from the top), the
white top blink, two amber side markers.
Live bounds (Blender): x [-1.3, 1.3], y [-1.3, 1.3], z [-1.9, 31.7] — pivot near the foot.
The live body was a tall mast; the buoy reads the same in plan and stays well inside bounds.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_lane_pin'
COLORS = {
    'paint': '#8f8674',
    'paint2': '#3a3f45',
    'stripe': '#1c5552',      # Helios teal
    'gunmetal': '#23282e',
    'dark': '#101418',
    'hazard': '#9a7a1e',
    'glow_cyan': '#6ee7e0',   # the halo
    'glow_warm': '#ffdba6',   # white-warm top blink
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}

HEX_R = 4.2    # float radius to corner


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === the hexagonal float ======================================================
    # a 6-sided drum: flat top deck, chamfered rim, ballast pods at the corners
    F.cylinder(s, 'Float', (0, 0, -0.9), (0, 0, 0.9), HEX_R, material='paint', segments=6,
               bevel=0.18, cap=True)
    F.cylinder(s, 'FloatDeck', (0, 0, 0.9), (0, 0, 1.15), HEX_R * 0.86, material='paint2',
               segments=6, bevel=0.08)
    # underside skirt so the float reads as a hull, not a coin
    F.cylinder(s, 'FloatSkirt', (0, 0, -1.4), (0, 0, -0.9), HEX_R * 0.72, HEX_R * 0.9,
               material='dark', segments=6, bevel=0.05)
    # ballast pods on the six corners — the plan silhouette's detail
    for i in range(6):
        a = math.radians(30 + i * 60)
        x, y = (HEX_R + 0.35) * math.cos(a), (HEX_R + 0.35) * math.sin(a)
        F.box(s, f'Ballast{i}', (x, y, -0.3), (1.5, 1.1, 1.6), material='paint2', bevel=0.12,
              rot_z=a)
        # one amber side marker per pod — reads as six dim dots from above
        s.detail = 1
        F.light(s, f'BallastLamp{i}', (x * 1.08, y * 1.08, -0.5), 'glow_amber', size=0.14)
        s.detail = 0
    # four stub feet under the skirt
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = 2.6 * math.cos(a), 2.6 * math.sin(a)
        F.beams(s, f'Foot{i}', [((x * 0.7, y * 0.7, -1.1), (x * 1.15, y * 1.15, -1.75))],
                0.3, material='gunmetal')
        F.box(s, f'FootPad{i}', (x * 1.2, y * 1.2, -1.85), (0.7, 0.7, 0.4),
              material='paint2', bevel=0.05, rot_z=a)

    # === the tower: short mast, lit teal halo, white top blink ====================
    F.cylinder(s, 'Tower', (0, 0, 0.9), (0, 0, 7.6), 0.9, 0.7, material='paint',
               segments=10, bevel=0.05)
    F.band(s, 'Tower', (0, 0, 4.4), (0, 0, 1), 0.7, 'stripe', depth=0.07)
    # the lit halo: a glowing teal ring carried on four spokes — THE top-view read
    F.ring(s, 'Halo', (0, 0, 7.9), 2.1, 0.22, axis=(0, 0, 1), material='glow_cyan',
           segments=20, sides=8)
    for i in range(4):
        a = math.radians(45 + i * 90)
        F.beams(s, f'HaloSpoke{i}', [((0.8 * math.cos(a), 0.8 * math.sin(a), 7.6),
                                      (2.1 * math.cos(a), 2.1 * math.sin(a), 7.9))],
                0.14, material='gunmetal')
    # cap + the white top blink
    F.cylinder(s, 'Cap', (0, 0, 8.4), (0, 0, 9.1), 0.55, 0.3, material='paint2',
               segments=10, bevel=0.04)
    F.beacon(s, 'TopBlink', (0, 0, 9.3), 'glow_warm', size=0.3)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
