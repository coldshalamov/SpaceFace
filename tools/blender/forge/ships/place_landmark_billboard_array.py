"""place_landmark_billboard_array — BP-8b Meridian/Tethys flat ad arrays (C6).

A truss gantry carrying a fan of flat holo-ad panels — Meridian gold frames,
emissive ad faces (amber/cyan/red panels), a service spine with climbing lights.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_billboard_array'
COLORS = {
    'paint': '#5a4f38',        # Meridian gold-frame metal
    'paint2': '#2e2a22',
    'dark': '#141210',
    'stripe.gold': '#c8a03c',
    'glow_warm.ad': '#ffcf70',
    'glow_cyan.ad': '#6fd8ff',
    'glow_red.ad': '#ff6a4a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    # mooring pylon: two legs joined by a service spine
    F.box(s, 'LegL', (-16.0, 0, 14.0), (5.0, 6.0, 28.0), material='paint2', bevel=0.4)
    F.box(s, 'LegR', (16.0, 0, 14.0), (5.0, 6.0, 28.0), material='paint2', bevel=0.4)
    F.truss(s, 'Spine', (-16.0, 0, 30.0), (16.0, 0, 30.0), 2.2, 6,
            material='gunmetal')
    # top gantry beam the panels hang from
    F.box(s, 'Gantry', (0, 0, 34.0), (64.0, 4.0, 4.5), material='paint', bevel=0.3)
    for x in (-20.0, 0.0, 20.0):
        F.truss(s, f'Hanger{x:.0f}', (x, 0, 34.0), (x, 0, 20.0), 1.4, 3, material='gunmetal')
    # fan of flat ad panels: 5 faces at increasing tilt, each framed in gold
    panels = [
        (-24.0, -0.50, 22.0, 'glow_warm.ad'),
        (-12.0, -0.26, 26.0, 'glow_cyan.ad'),
        (0.0, 0.0, 30.0, 'glow_red.ad'),
        (12.0, 0.26, 26.0, 'glow_cyan.ad'),
        (24.0, 0.50, 22.0, 'glow_warm.ad'),
    ]
    for i, (x, tilt, h, finish) in enumerate(panels):
        w = 10.0 if i == 2 else 9.0
        zc = 22.0
        # frame: four border boxes around the emissive face
        rot = (tilt, 0, 0)
        F.box(s, f'FrameT{i}', (x, -math.sin(tilt) * (h / 2), zc + math.cos(tilt) * h / 2),
              (w + 1.4, 0.9, 1.2), material='stripe.gold', rot=rot, bevel=0.1)
        F.box(s, f'FrameB{i}', (x, math.sin(tilt) * (h / 2), zc - math.cos(tilt) * h / 2),
              (w + 1.4, 0.9, 1.2), material='stripe.gold', rot=rot, bevel=0.1)
        F.box(s, f'FrameL{i}', (x - w / 2, 0, zc), (1.2, 0.9, h), material='stripe.gold',
              rot=rot, bevel=0.1)
        F.box(s, f'FrameR{i}', (x + w / 2, 0, zc), (1.2, 0.9, h), material='stripe.gold',
              rot=rot, bevel=0.1)
        # emissive ad face (thin slab)
        F.box(s, f'Face{i}', (x, 0, zc), (w, 0.35, h - 1.0), material=finish, rot=rot, bevel=0.05)
        # scanline strips across the face — the "ad flicker" read
        strips = []
        for k in range(3):
            strips.append(((x - w / 4 + k * w / 4, -0.25, zc + (k - 1) * h / 4),
                           (w * 0.18, 0.06, 0.8), (0, 0, 0)))
        K.boxes(s, F, f'Scan{i}', strips, 'dark')
    # gold corner finials + toll lamps on the legs
    for x in (-31.0, 31.0):
        F.box(s, f'Finial{x:.0f}', (x, 0, 36.8), (3.0, 3.0, 3.6), material='stripe.gold',
              rot=(0, 0, math.pi / 4), bevel=0.2)
    s.detail = 1
    for i, x in enumerate((-16.0, 16.0)):
        for z in (8.0, 18.0, 28.0):
            F.light(s, f'LegLamp{i}{z:.0f}', (x + (2.6 if x < 0 else -2.6), 0, z),
                    'glow_warm.ad', size=0.5)
    s.detail = 0
    K.landmark_sockets(s, focus_z=20.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
