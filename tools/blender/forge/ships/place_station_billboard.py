"""Station billboard — the dockside information display standing off the trade hub.
Forge rebuild of place_station_billboard.glb (same file, same asset id; live socket
SOCKET_Structure_Core at origin is copied on export).

Idea: "the harbour's lit notice board". A wide twin-face display panel carried on an A-frame
truss — splayed legs, a service deck at the board's foot, a lattice back — lit faces with
abstract segmented light bars (NO text ever), corner status lamps, and a small crane hoist on
the deck for swapping the display cassette.
Three values: pale ivory frame, charcoal back lattice, dark glass faces. Identity colour:
Helios teal in a thin border band and one status lamp colour per end. Lights: the big warm
lit faces, red/green end markers, small work lamps on the deck.
Live bounds (Blender): x [-7.1, 7.1], y [-3.8, 3.8], z [-7.0, 4.6] — the board stands with
its top toward -Z (below the origin): pivot is at the TOP of the frame. Keep that: this prop
is placed pivot-up so the panel hangs under the anchor point.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_billboard'
COLORS = {
    'paint': '#8f8674',       # pale ivory frame (authored dark)
    'paint2': '#3a3f45',      # charcoal secondary
    'stripe': '#1c5552',      # Helios teal border band
    'gunmetal': '#23282e',
    'dark': '#101418',
    'glass': '#0d1216',
    'hazard': '#9a7a1e',
    'glow_warm': '#ffdba6',
    'glow_cyan': '#6ee7e0',
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
    'glow_amber': '#ffb345',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the panel: framed twin-face board, top edge at the pivot ----------------
    # frame rails around a 13.4 x 7.6 board hung from z +4.6 down to z -4.4
    F.box(s, 'Board', (0, 0, 0.0), (13.4, 1.1, 8.4), material='paint', bevel=0.12)
    F.band(s, 'Board', (0, 0, 3.9), (0, 0, 1), 0.7, 'stripe', inset=0.06, depth=0.12)
    F.band(s, 'Board', (0, 0, -3.9), (0, 0, 1), 0.7, 'stripe', inset=0.06, depth=0.12)
    # lit display faces both sides — segmented bars, no glyphs
    for e in (-1, 1):
        F.box(s, f'Face{e:+d}', (0, e * 0.58, 0.0), (12.2, 0.14, 6.9), material='dark',
              bevel=0.02)
        F.box(s, f'Screen{e:+d}', (0, e * 0.66, 0.55), (11.4, 0.06, 4.9), material='glow_warm',
              bevel=0.0)
        # segmented readout bars — bright blocks of different heights, pure pattern
        s.detail = 1
        bars = []
        for i in range(9):
            x = -5.0 + i * 1.25
            h = 1.0 + 1.15 * ((i * 5 + (1 if e > 0 else 0)) % 4) / 4.0
            bars.append(((x, e * 0.70, -2.4 + h / 2.0), (0.82, 0.05, h), 0.0))
        F.boxes(s, f'SegBars{e:+d}', bars, 'glow_cyan')
        s.detail = 0
    # corner status lamps
    F.light(s, 'LampTL', (-6.6, -0.62, 3.9), 'glow_red', size=0.3)
    F.light(s, 'LampTR', (6.6, -0.62, 3.9), 'glow_green', size=0.3)
    F.light(s, 'LampBL', (-6.6, -0.62, -3.9), 'glow_amber', size=0.26)
    F.light(s, 'LampBR', (6.6, -0.62, -3.9), 'glow_amber', size=0.26)

    # --- the frame: splayed A-legs in Y, head truss at the pivot ------------------
    for e in (-1, 1):
        F.truss(s, f'Leg{e:+d}', (0, e * 0.6, -4.2), (0, e * 3.4, -6.9), 0.8, 3,
                material='gunmetal', chord=0.28, web=0.16)
        F.box(s, f'Foot{e:+d}', (0, e * 3.5, -6.95), (3.6, 1.4, 0.8), material='paint2',
              bevel=0.08)
        F.beams(s, f'FootKnee{e:+d}', [((-6.2, e * 0.7, -4.0), (0, e * 3.3, -6.6)),
                                       ((6.2, e * 0.7, -4.0), (0, e * 3.3, -6.6))],
                0.4, material='gunmetal')
    # head truss across the top (the pivot bar the whole sign hangs from)
    F.truss(s, 'HeadTruss', (-7.0, 0, 4.2), (7.0, 0, 4.2), 1.0, 8, material='gunmetal',
            chord=0.3, web=0.18)
    for e in (-1, 1):
        F.cylinder(s, f'HeadPost{e:+d}', (e * 7.0, 0, 4.2), (e * 7.0, 0, 2.2), 0.22,
                   material='gunmetal', segments=8)
        F.box(s, f'EndCap{e:+d}', (e * 7.0, 0, 4.3), (0.9, 1.2, 1.4), material='paint2',
              bevel=0.08)
    # service deck under the board with rails and a cassette hoist
    F.plate(s, 'Deck', [(-5.4, -2.8), (5.4, -2.8), (5.4, 2.8), (-5.4, 2.8)], -5.6, 0.35,
            material='paint2', chamfer=0.1)
    for e in (-1, 1):
        F.beams(s, f'DeckRail{e:+d}', [((-5.4, e * 2.7, -5.3), (5.4, e * 2.7, -5.3))],
                0.14, material='gunmetal')
        for i in range(5):
            F.box(s, f'DeckPost{e:+d}{i}', (-4.9 + i * 2.45, e * 2.7, -5.05),
                  (0.12, 0.12, 0.7), material='gunmetal', bevel=0.0)
    # hoist: kingpost + jib over the deck
    F.cylinder(s, 'HoistPost', (-4.6, 1.6, -5.2), (-4.6, 1.6, -3.2), 0.18, material='gunmetal',
               segments=8)
    F.beams(s, 'HoistJib', [((-4.6, 1.6, -3.3), (-4.6, -1.6, -4.1))], 0.22, material='gunmetal')
    F.cylinder(s, 'HoistChain', (-4.6, -1.3, -4.1), (-4.6, -1.3, -4.8), 0.05,
               material='gunmetal', segments=6, bevel=0.0)
    F.box(s, 'HoistHook', (-4.6, -1.3, -4.95), (0.24, 0.24, 0.3), material='hazard', bevel=0.02)
    # deck work lamps
    F.work_lamp(s, 'DeckLampA', (-5.0, 1.9, -5.0), aim=(0.5, -0.3, 0.8), size=0.22)
    F.work_lamp(s, 'DeckLampB', (5.0, -1.9, -5.0), aim=(-0.5, 0.3, 0.8), size=0.22)

    # back lattice over the rear face
    s.detail = 1
    lat = []
    for i in range(6):
        x = -5.5 + i * 2.2
        lat.append(((x, 0.75, -0.1), (0.16, 0.16, 7.6), 0.0))
    for i in range(4):
        z = -3.2 + i * 2.2
        lat.append(((0, 0.75, z), (12.6, 0.16, 0.16), 0.0))
    F.boxes(s, 'BackLattice', lat, 'gunmetal')
    s.detail = 0

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
