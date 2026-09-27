"""Whistle — the message-drum buoy left drifting on the lane for whoever passes.
Forge rebuild of place_whistle.glb (same file, same asset id).

Idea: "a hand-cranked message drum". A tripod boot carries a chain-hung basket; inside the
basket sits the drum you wind with a crank; whip antennae rake off the top and a signal
lamp marks it live.
Three values: pale drum coat, charcoal boot and basket, dark whip wire. Identity colour:
hazard ochre on the drum band. Lights: one amber signal lamp and a small crank lamp.
Live bounds (Blender): x [-1.7, 1.7], y [-1.7, 1.7], z [-0.5, 7.8].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_whistle'
COLORS = {
    'paint': '#8f8674',
    'paint2': '#3a3f45',
    'stripe': '#9a7a1e',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'bare': '#4a4238',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # tripod boot — three splayed legs on a sole ring
    F.ring(s, 'BootSole', (0, 0, -0.3), 1.15, 0.3, axis=(0, 0, 1), material='paint2',
           segments=14, sides=8)
    for i in range(3):
        a = math.radians(30 + i * 120)
        x, y = 1.1 * math.cos(a), 1.1 * math.sin(a)
        F.beams(s, f'BootLeg{i}', [((x * 0.9, y * 0.9, -0.2), (x * 0.35, y * 0.35, 1.8))],
                0.3, material='gunmetal')
        F.box(s, f'BootToe{i}', (x, y, -0.42), (0.5, 0.5, 0.4), material='paint2', bevel=0.05,
              rot_z=a)
    F.cylinder(s, 'BootHub', (0, 0, 0.2), (0, 0, 2.1), 0.5, 0.42, material='paint2',
               segments=10, bevel=0.05)

    # chain-hung basket cage
    F.ring(s, 'BasketRing', (0, 0, 2.3), 1.05, 0.09, axis=(0, 0, 1), material='gunmetal',
           segments=14, sides=6)
    F.ring(s, 'BasketRingHi', (0, 0, 5.6), 0.95, 0.09, axis=(0, 0, 1), material='gunmetal',
           segments=14, sides=6)
    for i in range(4):
        a = math.radians(45 + i * 90)
        F.beams(s, f'BasketBar{i}', [((1.05 * math.cos(a), 1.05 * math.sin(a), 2.3),
                                     (0.95 * math.cos(a), 0.95 * math.sin(a), 5.6))],
                0.09, material='gunmetal')
        # chains from the boot legs to the basket ring
        ca = math.radians(30 + i * 120) if i < 3 else math.radians(45)
        F.cylinder(s, f'Chain{i}', (1.1 * math.cos(ca), 1.1 * math.sin(ca), 0.1),
                   (1.05 * math.cos(a), 1.05 * math.sin(a), 2.3), 0.045, material='gunmetal',
                   segments=5, bevel=0.0)

    # the drum inside the basket, on a trunnion
    F.cylinder(s, 'Drum', (-0.85, 0, 3.9), (0.85, 0, 3.9), 0.95, material='paint',
               segments=14, cap=True, bevel=0.05)
    F.band(s, 'Drum', (0, 0, 3.9), (1, 0, 0), 0.35, 'stripe', depth=0.05)
    F.cylinder(s, 'DrumAxle', (-1.1, 0, 3.9), (1.1, 0, 3.9), 0.12, material='gunmetal',
               segments=8, bevel=0.0)
    # crank on the starboard side
    F.box(s, 'CrankHub', (1.05, 0, 3.9), (0.3, 0.3, 0.3), material='gunmetal', bevel=0.03)
    F.beams(s, 'CrankArm', [((1.2, 0, 3.9), (1.45, 0.55, 3.4))], 0.12, material='gunmetal')
    F.cylinder(s, 'CrankGrip', (1.45, 0.55, 3.4), (1.45, 0.85, 3.4), 0.09, material='paint2',
               segments=6, bevel=0.0)

    # whip antennae raking off the top
    F.cylinder(s, 'WhipA', (0, 0, 5.6), (-0.7, 0.5, 7.8), 0.05, 0.025, material='gunmetal',
               segments=6, bevel=0.0)
    F.cylinder(s, 'WhipB', (0, 0, 5.6), (0.8, -0.4, 7.4), 0.05, 0.025, material='gunmetal',
               segments=6, bevel=0.0)
    F.cylinder(s, 'WhipC', (0, 0, 5.6), (0.1, 0.7, 7.6), 0.045, 0.02, material='gunmetal',
               segments=6, bevel=0.0)
    for i, p in enumerate(((-0.7, 0.5, 7.8), (0.8, -0.4, 7.4))):
        F.box(s, f'WhipTip{i}', p, (0.12, 0.12, 0.12), material='glow_amber', bevel=0.02)
    # signal lamp on the basket crown
    F.beacon(s, 'SignalLamp', (0, 0, 5.95), 'glow_amber', size=0.24)
    # small crank lamp under the basket
    F.light(s, 'CrankLamp', (1.0, -0.4, 2.6), 'glow_red', size=0.12)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
