"""Lane pin — the tall navigation mast planted in Helios space.
Forge rebuild of place_lane_pin.glb (same file, same asset id).

Idea: "a surveyor's pin for shipping lanes". A slim mast on a four-leg ballast tripod,
carrying a chevron light housing near the top — the lit arrow every pilot lines up on —
two vane rings mid-mast and a run of speed lamps down the shaft.
Three values: pale mast coat, charcoal legs, dark housing. Identity colour: Helios teal on
the chevron band; the lit face is cyan. Lights: chevron lens, speed lamps, head beacon.
Live bounds (Blender): x [-1.3, 1.3], y [-1.3, 1.3], z [-1.9, 31.7] — pivot near the foot.
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
    'glow_cyan': '#6ee7e0',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # four splayed feet with ballast ring
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = 1.35 * math.cos(a), 1.35 * math.sin(a)
        F.beams(s, f'Foot{i}', [((0, 0, -1.4), (x, y, -1.8))], 0.34, material='gunmetal')
        F.box(s, f'FootPad{i}', (x * 1.12, y * 1.12, -1.9), (0.7, 0.7, 0.5),
              material='paint2', bevel=0.06)
    F.ring(s, 'BallastRing', (0, 0, -1.55), 1.15, 0.28, axis=(0, 0, 1), material='paint2',
           segments=16, sides=8)

    # the mast
    F.cylinder(s, 'Mast', (0, 0, -1.6), (0, 0, 26.0), 0.42, 0.28, material='paint',
               segments=10, bevel=0.03)
    F.band(s, 'Mast', (0, 0, 4.0), (0, 0, 1), 0.5, 'stripe', depth=0.06)
    F.band(s, 'Mast', (0, 0, 18.0), (0, 0, 1), 0.5, 'stripe', depth=0.06)
    # vane rings mid-mast
    F.ring(s, 'Vane0', (0, 0, 10.5), 1.05, 0.12, axis=(0, 0, 1), material='gunmetal',
           segments=14, sides=6)
    F.ring(s, 'Vane1', (0, 0, 15.5), 0.85, 0.12, axis=(0, 0, 1), material='gunmetal',
           segments=14, sides=6)

    # speed lamps down the shaft — alternate amber
    s.detail = 1
    for i in range(5):
        a = math.radians(i * 72)
        F.light(s, f'Speed{i}', (0.45 * math.cos(a), 0.45 * math.sin(a), 3.0 + i * 4.2),
                'glow_amber', size=0.16)
    s.detail = 0

    # chevron housing at the head: a dark drum with a lit cyan arrow slit both sides
    F.cylinder(s, 'Head', (0, 0, 26.0), (0, 0, 30.4), 0.9, material='dark', segments=12,
               bevel=0.08)
    F.band(s, 'Head', (0, 0, 28.2), (0, 0, 1), 0.9, 'stripe', depth=0.08)
    for e in (-1, 1):
        # chevron bars: two angled lit slots meeting in a point — reads as >> the lane arrow
        F.box(s, f'Chev{e:+d}A', (e * 0.92, -0.28, 28.4), (0.08, 0.55, 0.16),
              material='glow_cyan', bevel=0.02, rot=(math.radians(35), 0, 0))
        F.box(s, f'Chev{e:+d}B', (e * 0.92, -0.28, 27.7), (0.08, 0.55, 0.16),
              material='glow_cyan', bevel=0.02, rot=(math.radians(-35), 0, 0))
        F.box(s, f'Chev{e:+d}C', (e * 0.92, 0.34, 28.05), (0.08, 0.42, 0.14),
              material='glow_cyan', bevel=0.02)
    # head beacon
    F.beacon(s, 'HeadBeacon', (0, 0, 30.9), 'glow_red', size=0.22)
    F.cylinder(s, 'HeadMast', (0, 0, 30.4), (0, 0, 31.4), 0.08, material='gunmetal',
               segments=6, bevel=0.0)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
