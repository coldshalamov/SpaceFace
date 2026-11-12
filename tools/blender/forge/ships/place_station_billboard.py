"""Station billboard — the dockside information display standing off the trade hub.
Forge rebuild of place_station_billboard.glb (same file, same asset id; live socket
SOCKET_Structure_Core at origin is copied on export).

Idea: "the harbour's lit notice board, tipped up at the sky". The game reads top-down, so the
board is raked ~35 deg back off vertical about its top pivot: its face lifts toward the
camera and reads as a lit mosaic instead of an edge sliver. A framed screen split into muted
abstract colour blocks — Helios teal, warm amber, pale ivory — NO text, ever. The board hangs
on a lattice head truss carried by splayed A-legs; a service gantry deck with rails and work
lamps stands under it, and a small hoist swaps the display cassette.
Three values: pale ivory frame, charcoal back lattice, near-black glass bezels. Identity
colour: Helios teal border band and the muted teal mosaic block. Lights: the three muted
screen blocks, small red/green corner markers, gantry work lamps.
Live bounds (Blender): x [-7.1, 7.1], y [-3.8, 3.8], z [-7.0, 4.6] — pivot at the TOP of the
frame: this prop is placed pivot-up so the panel hangs under the anchor point.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_billboard'
COLORS = {
    'paint': '#8f8674',       # pale ivory frame
    'paint2': '#3a3f45',      # charcoal secondary
    'stripe': '#1c5552',      # Helios teal border band
    'gunmetal': '#23282e',
    'dark': '#101418',
    'glass': '#0d1216',
    'hazard': '#9a7a1e',
    # muted mid-value screen blocks — lit but never saturated
    'glow_warm': '#c9a06a',      # warm amber block, muted
    'glow_cyan': '#3e7a76',      # muted teal block
    'glow_warm.ivory': '#7d7668',  # pale ivory block, barely lit
    'glow_red': '#ff3a2a',
    'glow_green': '#3dff7a',
    'glow_amber': '#ffb345',
}

# The board assembly rakes back TILT about X through the top pivot (0,0,4.2) so the face
# reads from the top-down camera instead of edge-on.
TILT = math.radians(35)
PIVOT_Z = 4.2
_C, _S = math.cos(TILT), math.sin(TILT)


def _tilt(c):
    x, y, z = c
    dz = z - PIVOT_Z
    return (x, y * _C - dz * _S, PIVOT_Z + y * _S + dz * _C)


def _box(s, name, c, size, **kw):
    kw['rot'] = (TILT, 0, 0)
    return F.box(s, name, _tilt(c), size, **kw)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the board: framed twin-face screen, raked back on the top pivot ----------
    _box(s, 'Board', (0, 0, 0.0), (13.4, 1.1, 8.4), material='paint', bevel=0.12)
    F.band(s, 'Board', _tilt((0, 0, 3.9)), (0, _S, _C), 0.7, 'stripe', inset=0.06, depth=0.12)
    F.band(s, 'Board', _tilt((0, 0, -3.9)), (0, _S, _C), 0.7, 'stripe', inset=0.06, depth=0.12)
    for e in (-1, 1):
        # bezel
        _box(s, f'Face{e:+d}', (0, e * 0.58, 0.0), (12.2, 0.14, 6.9), material='dark',
             bevel=0.02)
        # the muted mosaic: three colour blocks, no glyphs
        _box(s, f'BlockA{e:+d}', (-3.6, e * 0.68, 0.8), (4.6, 0.06, 4.6),
             material='glow_cyan', bevel=0.0)
        _box(s, f'BlockB{e:+d}', (1.2, e * 0.68, 1.4), (4.2, 0.06, 3.4),
             material='glow_warm', bevel=0.0)
        _box(s, f'BlockC{e:+d}', (4.2, e * 0.68, -1.6), (3.4, 0.06, 3.0),
             material='glow_warm.ivory', bevel=0.0)
        _box(s, f'BlockD{e:+d}', (-2.2, e * 0.68, -2.4), (4.8, 0.06, 1.6),
             material='glow_warm', bevel=0.0)
    # corner status lamps ride the tilted board
    for tag, c, fin in (('LampTL', (-6.6, 0.62, 3.9), 'glow_red'),
                        ('LampTR', (6.6, 0.62, 3.9), 'glow_green'),
                        ('LampBL', (-6.6, 0.62, -3.9), 'glow_amber'),
                        ('LampBR', (6.6, 0.62, -3.9), 'glow_amber')):
        F.light(s, tag, _tilt(c), fin, size=0.28)

    # --- the frame: splayed A-legs under the board's swing path --------------------
    for e in (-1, 1):
        F.truss(s, f'Leg{e:+d}', (0, e * 0.6, -3.6), (0, e * 3.4, -6.9), 0.8, 3,
                material='gunmetal', chord=0.28, web=0.16)
        F.box(s, f'Foot{e:+d}', (0, e * 3.5, -6.95), (3.6, 1.4, 0.8), material='paint2',
              bevel=0.08)
        F.beams(s, f'FootKnee{e:+d}', [((-6.2, e * 0.7, -3.4), (0, e * 3.3, -6.6)),
                                       ((6.2, e * 0.7, -3.4), (0, e * 3.3, -6.6))],
                0.4, material='gunmetal')
    # head truss across the top (the pivot bar the whole sign hangs from)
    F.truss(s, 'HeadTruss', (-7.0, 0, 4.2), (7.0, 0, 4.2), 1.0, 8, material='gunmetal',
            chord=0.3, web=0.18)
    for e in (-1, 1):
        F.cylinder(s, f'HeadPost{e:+d}', (e * 7.0, 0, 4.2), (e * 7.0, 0, 2.2), 0.22,
                   material='gunmetal', segments=8)
        F.box(s, f'EndCap{e:+d}', (e * 7.0, 0, 4.3), (0.9, 1.2, 1.4), material='paint2',
              bevel=0.08)

    # service gantry deck under the board with rails, grating and a cassette hoist
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
    # gantry work lamps with lit halo rings so the deck reads from above
    F.work_lamp(s, 'DeckLampA', (-5.0, 1.9, -5.0), aim=(0.5, -0.3, 0.8), size=0.22)
    F.work_lamp(s, 'DeckLampB', (5.0, -1.9, -5.0), aim=(-0.5, 0.3, 0.8), size=0.22)

    # back lattice over the rear face — tilts with the board
    s.detail = 1
    lat = []
    for i in range(6):
        x = -5.5 + i * 2.2
        lat.append((_tilt((x, -0.75, -0.1)), (0.16, 0.16, 7.6), 0.0))
    for i in range(4):
        z = -3.2 + i * 2.2
        lat.append((_tilt((0, -0.75, z)), (12.6, 0.16, 0.16), 0.0))
    for i, (c, sz, rz) in enumerate(lat):
        F.box(s, f'BackLattice{i}', c, sz, material='gunmetal', bevel=0.0,
              rot=(TILT, 0, 0))
    s.detail = 0

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
