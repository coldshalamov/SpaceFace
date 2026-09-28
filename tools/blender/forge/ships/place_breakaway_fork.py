"""Breakaway capture fork (place_breakaway_fork) — Forge rebuild.

Idea: "the catcher's open hands". The Third Shift receiver: a wide mouth frame at the
origin (the GLB's origin is the mouth plane — DO NOT recentre), two long trussed tines
reaching +X and slightly converging, guide-lamp rows down the inner faces, a seat cradle
mid-span (socket_seat station) and a service pylon near the tips (socket_service).
Bone/graphite industrial with copper work accents and amber guide lights.
Live bounds (Blender): x -3.5..89.5, y +-37.5, z -9.5..5.65.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_breakaway_fork'
COLORS = {
    'paint': '#a89e8c',        # bone
    'paint2': '#23282e',       # graphite
    'paint.aged': '#6e685c',
    'gunmetal.copper': '#7a5a30',
    'gunmetal': '#23282e',
    'dark': '#14171b',
    'hazard': '#8a7418',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_green': '#3dff7a',
    'glow_red': '#ff3a2a',
}

# tine runs mouth -> tip, converging inward as it goes
TINE_Y0, TINE_Y1 = 34.0, 14.0
TIP_X = 84.0


def _tine(s, e):
    """One fork tine: truss rail + inner guide lamps + tip cap."""
    y0, y1 = e * TINE_Y0, e * TINE_Y1
    F.truss(s, f'Tine{e:+d}', (2.0, y0, -1.0), (TIP_X, y1, -1.0), 3.4, 14,
            material='paint2', chord=0.6, web=0.34)
    # inner rubbing face — the surface the caught hull slides on
    F.beams(s, f'TineFace{e:+d}', [((4.0, y0 - e * 2.0, -0.6),
                                   (TIP_X - 1.0, y1 - e * 2.0, -0.6))], 0.8,
            material='dark')
    # guide lamps down the inner face — the landing read
    for i in range(8):
        t = i / 7.0
        lx = 6.0 + (TIP_X - 8.0) * t
        ly = (y0 - e * 3.0) * (1 - t) + (y1 - e * 3.0) * t
        s.detail = 1
        F.light(s, f'Guide{e:+d}{i}', (lx, ly, -0.2), 'glow_amber', size=0.3)
        s.detail = 0
    # tip cap + forward marker
    F.box(s, f'TineTip{e:+d}', (TIP_X + 1.0, y1, -1.0), (3.0, 4.2, 3.6),
          material='paint', bevel=0.15)
    F.box(s, f'TineTipBand{e:+d}', (TIP_X + 2.2, y1, -1.0), (0.5, 4.4, 2.2),
          material='hazard', bevel=0.0)
    F.light(s, f'TipLamp{e:+d}', (TIP_X + 2.6, y1, 0.4),
            'glow_green' if e > 0 else 'glow_red', size=0.4)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the mouth frame at the origin: a wide sill + two horn posts --------------------------
    F.box(s, 'MouthSill', (0.5, 0.0, -7.5), (4.0, 68.0, 3.4), material='paint2', bevel=0.2)
    F.box(s, 'MouthSillTop', (0.5, 0.0, -5.6), (3.4, 66.0, 0.6), material='paint.aged',
          bevel=0.05)
    # horn posts at the mouth corners
    for e in (-1, 1):
        F.box(s, f'Horn{e:+d}', (0.5, e * TINE_Y0, -1.5), (4.6, 5.0, 8.5),
              material='paint2', bevel=0.25)
        F.box(s, f'HornFace{e:+d}', (2.9, e * TINE_Y0, -1.0), (0.5, 3.6, 5.6),
              material='gunmetal.copper', bevel=0.05)
        F.beacon(s, f'HornBeacon{e:+d}', (0.5, e * TINE_Y0, 3.0), 'glow_amber', size=0.5)
    # mouth lintel across the top of the frame — shallow, off the centreline
    F.box(s, 'MouthLintel', (0.5, 0.0, 2.8), (4.0, 70.0, 1.4), material='paint2',
          bevel=0.1)
    s.detail = 1
    for i in range(9):
        F.box(s, f'LintelLamp{i}', (2.6, -28.0 + i * 7.0, 2.8), (0.2, 1.4, 0.5),
              material='glow_warm', bevel=0.0)
    s.detail = 0

    # --- the two tines -------------------------------------------------------------------------
    _tine(s, -1)
    _tine(s, 1)
    # cross-ties keeping the tines honest — three spread spans
    for i, (tx, ty) in enumerate(((24.0, 28.0), (46.0, 22.0), (68.0, 16.5))):
        F.truss(s, f'Tie{i}', (tx, -ty, -1.2), (tx, ty, -1.2), 1.8, 5,
                material='gunmetal', chord=0.4, web=0.24)

    # --- the seat cradle mid-span (socket_seat station, x ~ 44) ---------------------------------
    F.annulus(s, 'Seat', (44.0, 0.0, -1.0), 7.0, 10.0, -2.6, 1.6, material='gunmetal.copper',
              segments=24)
    for k in range(4):
        a = math.radians(45 + k * 90)
        F.box(s, f'SeatPad{k}', (44.0 + math.cos(a) * 8.5, math.sin(a) * 8.5, -1.4),
              (2.4, 2.4, 1.0), material='dark', rot_z=a, bevel=0.05)
    F.light(s, 'SeatLamp', (44.0, 0.0, 0.2), 'glow_amber', size=0.5)

    # --- service pylon near the tips (socket_service station, x ~ 77) ---------------------------
    F.box(s, 'ServicePylon', (77.0, 0.0, -1.0), (4.4, 5.0, 6.4), material='paint',
          bevel=0.2)
    F.box(s, 'ServiceFace', (77.0, 0.0, 2.5), (3.4, 3.6, 0.5), material='dark', bevel=0.05)
    s.detail = 1
    for i in range(3):
        F.box(s, f'ServiceLamp{i}', (75.5 + i * 1.4, 0.0, 2.8), (0.7, 0.5, 0.12),
              material='glow_warm', bevel=0.0)
    s.detail = 0
    F.beacon(s, 'ServiceStrobe', (77.0, 0.0, 3.4), 'glow_amber', size=0.45)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
