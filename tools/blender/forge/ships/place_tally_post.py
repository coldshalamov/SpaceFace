"""Tally post — the cargo-weigh gantry standing in the Helios lanes.
Forge rebuild of place_tally_post.glb (same file, same asset id).

Idea: "the foreman's scale". A mast with a railed operator deck at its head; under the deck
a hung yoke carries a pair of tally tongs that read a pallet's mass. A ledger plate, an
invoice lamp over the operator's nook, grating floor, four splayed feet.
Three values: pale deck coat, charcoal mast and tongs, dark nook. Identity colour: Helios
teal on the ledger band. Lights: invoice lamp under the deck, one warm window on the nook.
Live bounds (Blender): x [-1.9, 1.9], y [-1.9, 1.9], z [-1.0, 15.5] — pivot near the foot.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_tally_post'
COLORS = {
    'paint': '#6e675c',
    'paint2': '#3a3f45',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'ceramic': '#867e6e',
    'hazard': '#9a7a1e',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # feet: four splayed legs off a ballast collar
    F.ring(s, 'Collar', (0, 0, -0.6), 0.9, 0.3, axis=(0, 0, 1), material='paint2',
           segments=14, sides=8)
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = 1.8 * math.cos(a), 1.8 * math.sin(a)
        F.beams(s, f'Leg{i}', [((0.5 * math.cos(a), 0.5 * math.sin(a), -0.3),
                                (x, y, -0.9))], 0.32, material='gunmetal')
        F.box(s, f'LegPad{i}', (x, y, -0.98), (0.8, 0.8, 0.4), material='paint2', bevel=0.06)
        # knee brace from the pad up to the mast
        F.beams(s, f'LegBrace{i}', [((x * 0.9, y * 0.9, -0.7), (x * 0.3, y * 0.3, 1.6))],
                0.18, material='gunmetal')
    # mast
    F.box(s, 'Mast', (0, 0, 6.0), (0.9, 0.9, 14.2), material='paint', bevel=0.06)
    F.band(s, 'Mast', (0, 0, 10.6), (0, 0, 1), 0.5, 'stripe', depth=0.05)
    # ledger plate mid-mast
    F.box(s, 'LedgerPlate', (0, -0.52, 7.2), (0.7, 0.08, 1.6), material='paint2', bevel=0.03)
    F.band(s, 'LedgerPlate', (0, -0.52, 7.5), (0, 0, 1), 0.3, 'stripe')

    # operator deck at the head — grating floor, rails, scale-house nook
    F.plate(s, 'Deck', [(-2.3, -1.7), (2.3, -1.7), (2.3, 1.7), (-2.3, 1.7)], 13.0, 0.4,
            material='paint2', chamfer=0.08)
    F.box(s, 'DeckSkirt', (0, 0, 12.7), (4.7, 3.5, 0.5), material='paint', bevel=0.05)
    s.detail = 1
    grates = [((-1.9 + i * 0.76, 0, 13.24), (0.14, 3.2, 0.06), 0.0) for i in range(6)]
    F.boxes(s, 'Grates', grates, 'gunmetal')
    s.detail = 0
    for e in (-1, 1):
        F.beams(s, f'Rail{e:+d}', [((-2.3, e * 1.7, 14.0), (2.3, e * 1.7, 14.0))], 0.12,
                material='gunmetal')
        for i in range(4):
            F.box(s, f'RailPost{e:+d}{i}', (-2.1 + i * 1.4, e * 1.7, 13.65),
                  (0.1, 0.1, 0.9), material='gunmetal', bevel=0.0)
    for e in (-1, 1):
        F.beams(s, f'RailEnd{e:+d}', [((e * 2.3, -1.7, 14.0), (e * 2.3, 1.7, 14.0))], 0.12,
                material='gunmetal')

    # scale-house nook on the deck edge
    F.box(s, 'Nook', (-1.5, 0.7, 14.1), (1.6, 1.8, 2.0), material='paint', bevel=0.1)
    F.box(s, 'NookRoof', (-1.5, 0.7, 15.25), (1.9, 2.1, 0.3), material='paint2', bevel=0.06)
    F.box(s, 'NookWindow', (-1.5, -0.21, 14.3), (1.0, 0.06, 0.7), material='glow_warm',
          bevel=0.0)
    # mast cap
    F.box(s, 'MastCap', (0, 0, 15.4), (1.2, 1.2, 0.5), material='paint2', bevel=0.05)
    F.beacon(s, 'TopBeacon', (0, 0, 15.85), 'glow_red', size=0.16)

    # the hung yoke under the deck with tally tongs
    F.box(s, 'YokeHub', (0.8, 0, 12.0), (1.0, 1.0, 1.2), material='gunmetal', bevel=0.08)
    F.cylinder(s, 'YokeDropA', (0.8, -0.35, 12.6), (0.8, -0.35, 13.0), 0.1, material='gunmetal',
               segments=6, bevel=0.0)
    F.cylinder(s, 'YokeDropB', (0.8, 0.35, 12.6), (0.8, 0.35, 13.0), 0.1, material='gunmetal',
               segments=6, bevel=0.0)
    # the tongs: two arms angled in, pads at the ends
    for e in (-1, 1):
        F.beams(s, f'Tong{e:+d}A', [((0.8, e * 0.4, 11.6), (0.8, e * 1.5, 9.6))], 0.28,
                material='gunmetal')
        F.beams(s, f'Tong{e:+d}B', [((0.8, e * 1.5, 9.6), (0.8, e * 0.9, 8.6))], 0.24,
                material='gunmetal')
        F.box(s, f'TongPad{e:+d}', (0.8, e * 0.85, 8.3), (0.7, 0.5, 0.7), material='paint2',
              bevel=0.06)
    F.box(s, 'TongCrossbar', (0.8, 0, 9.6), (0.3, 3.1, 0.3), material='gunmetal', bevel=0.03)
    # invoice lamp under the deck edge
    F.work_lamp(s, 'InvoiceLamp', (1.9, -1.4, 12.6), aim=(-0.3, 0.2, 0.9), size=0.22)
    # wear cup under the tongs — the pale dished weigh mark on the base collar
    F.cylinder(s, 'WearCup', (0.8, 0, -0.62), (0.8, 0, -0.2), 0.5, 0.62, material='ceramic',
               segments=10, bevel=0.04)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
