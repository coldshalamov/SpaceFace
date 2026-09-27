"""Memorial array — the low row of vigil lamps kept burning for the lost crews.
Forge rebuild of place_memorial_array.glb (same file, same asset id; SOCKET_Structure_Core
at origin is copied on export). Now a prop: the Candle Fleet landmark has its own body.

Idea: "a row of candles on a shelf". A long dark spine beam carries eleven vigil-lamp
housings — small lipped cups, each with a steady warm light — with engraved name plates on
the beam face, and truss outriggers that keep the shelf standing against nothing.
Three values: charcoal spine, pale lamp cups, dark plates. Identity colour: none — the
lights themselves are the identity, all warm. Lights: eleven steady warm flames, no blink.
Live bounds (Blender): x [-1.5, 13.3], y [-1.5, 1.5], z [-1.2, 1.9] — pivot at the -X end.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_memorial_array'
COLORS = {
    'paint': '#7d7668',       # pale cups
    'paint2': '#3a3f45',      # charcoal spine
    'gunmetal': '#23282e',
    'dark': '#101418',
    'bare': '#4a4238',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
}

LAMPS = 11
SPAN = 13.0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # the spine beam the lamps sit on
    F.box(s, 'Spine', (SPAN / 2, 0, 0.4), (SPAN + 0.8, 0.9, 0.9), material='paint2', bevel=0.08)
    F.band(s, 'Spine', (SPAN / 2, 0, 0.4), (1, 0, 0), 0.5, 'gunmetal', depth=0.05)

    # vigil lamps: lipped cup + flame light + etched plate on the beam face
    for i in range(LAMPS):
        x = 0.65 + i * (SPAN - 1.3) / (LAMPS - 1)
        F.cylinder(s, f'Cup{i}', (x, 0, 0.85), (x, 0, 1.5), 0.34, 0.42, material='paint',
                   segments=10, bevel=0.03)
        F.cylinder(s, f'Lip{i}', (x, 0, 1.5), (x, 0, 1.62), 0.46, material='paint',
                   segments=10, bevel=0.02)
        F.light(s, f'Flame{i}', (x, 0, 1.74), 'glow_warm', size=0.3)
        F.ring(s, f'LipGlow{i}', (x, 0, 1.56), 0.42, 0.05, axis=(0, 0, 1),
               material='glow_amber', segments=10, sides=5)
        # small engraved plate on the spine's forward face under each lamp
        F.box(s, f'Plate{i}', (x, -0.47, 0.35), (0.55, 0.06, 0.4), material='bare', bevel=0.01)

    # truss outriggers — splayed feet at each end and mid-span
    s.detail = 1
    outr = []
    for x in (0.3, SPAN / 2, SPAN - 0.3):
        for e in (-1, 1):
            outr.append(((x, e * 0.75, -0.6), (0.35, 0.9, 0.35), 0.0))
    F.boxes(s, 'OutriggerFeet', outr, 'paint2')
    s.detail = 0
    for i, x in enumerate((0.3, SPAN / 2, SPAN - 0.3)):
        for e in (-1, 1):
            F.beams(s, f'Outrigger{i}{e:+d}', [((x, e * 0.75, -0.4), (x, e * 0.3, 0.15))],
                    0.16, material='gunmetal')
    # end caps with a faint lamp each — the row's bookends
    for e, x in ((-1, -0.2), (1, SPAN + 0.2)):
        F.box(s, f'EndCap{e:+d}', (x, 0, 0.4), (0.5, 1.1, 1.1), material='paint', bevel=0.08)
        F.light(s, f'EndLamp{e:+d}', (x + e * 0.28, 0, 0.55), 'glow_amber', size=0.14)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
