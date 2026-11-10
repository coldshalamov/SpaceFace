"""Improvised dock (place_improvised_dock) — Forge rebuild.

Idea: "the stolen berth". A salvage-rigged docking arm: a heavy counterweight block at the
root carries a leaning truss boom out to a clamp cradle (SOCKET_Berth) — teal-painted
salvage plating, rust structure, guide lamps at the cradle, a draped festoon cable and one
warm crew lamp where a tug hacks the berth together.
Live bounds (Blender): x -3.06..6.1, y -1.7..10.76, z -1.6..2.85 — the arm reaches +Y.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_improvised_dock'
COLORS = {
    'paint': '#8f8674',
    'paint2': '#3a3f45',
    'gunmetal.teal': '#24473f',   # teal salvage paint on metal — dielectric tops go pale
    'deadmetal.rust': '#6a4a30',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'hazard': '#8a7418',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_green': '#3dff7a',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- root block: counterweight + winch house ----------------------------------------------
    F.box(s, 'Root', (1.4, -0.6, 0.4), (5.6, 3.4, 2.6), material='deadmetal.rust', bevel=0.15)
    F.box(s, 'RootPlate', (1.4, -0.6, 1.8), (5.2, 3.0, 0.35), material='gunmetal.teal', bevel=0.05)
    # Lit structure (GFX light-upgrades): an amber line across the teal root plate and one across the
    # cradle, so the stolen berth reads lit from the lane (LOOK.md: lamps are light).
    F.band(s, 'RootPlate', (3.4, -0.6, 1.8), (1, 0, 0), 0.3, 'glow_amber', facing=(0, 0, 1), min_facing=0.5,
           inset=0.01, depth=-0.02)
    F.box(s, 'Winch', (-1.2, -0.4, 1.9), (2.0, 2.2, 1.6), material='dark', bevel=0.1)
    F.cylinder(s, 'WinchDrum', (-1.2, -1.4, 2.1), (-1.2, 0.6, 2.1), 0.55,
               material='gunmetal', segments=12)
    F.box(s, 'RootKerb', (1.4, -2.2, 1.9), (5.4, 0.4, 0.4), material='hazard', bevel=0.0)
    F.light(s, 'RootLamp', (-1.2, -1.3, 2.7), 'glow_warm', size=0.35)

    # --- the leaning truss boom out to the cradle ----------------------------------------------
    F.truss(s, 'Boom', (1.4, 0.8, 1.4), (2.6, 9.4, 1.8), 2.0, 6, material='gunmetal',
            chord=0.4, web=0.22)
    # a second, cheaper chord — mismatched salvage rail under the boom
    F.beams(s, 'BoomRail', [((0.4, 1.0, 0.8), (1.6, 9.2, 1.4))], 0.5, material='deadmetal.rust')
    # festoon cable drooping off the boom
    s.detail = 1
    F.beams(s, 'Festoon', [((1.4, 3.0, 2.0), (2.2, 6.0, 1.4)),
                           ((2.2, 6.0, 1.4), (2.5, 8.6, 2.2))], 0.1, material='dark')
    s.detail = 0

    # --- clamp cradle at the tip: two open jaws + berth pads + guide lamps ----------------------
    cy = 9.4
    F.box(s, 'Cradle', (2.8, cy, 2.2), (3.6, 2.0, 1.0), material='gunmetal.teal', bevel=0.1)
    F.box(s, 'CradlePad', (2.8, cy, 2.5), (2.8, 1.5, 0.3), material='dark', bevel=0.03)
    F.band(s, 'Cradle', (2.8, cy - 0.85, 2.2), (0, 1, 0), 0.25, 'glow_amber', facing=(0, 0, 1), min_facing=0.5,
           inset=0.01, depth=-0.02)
    for e in (-1, 1):
        F.box(s, f'Jaw{e:+d}', (2.8 + e * 1.9, cy + 0.4, 2.0), (0.7, 1.6, 1.5),
              material='paint2', bevel=0.08, rot_z=math.radians(-e * 10))
        F.box(s, f'JawPad{e:+d}', (2.8 + e * 1.55, cy + 0.4, 2.1), (0.25, 1.2, 1.3),
              material='dark', bevel=0.02)
        F.light(s, f'JawLamp{e:+d}', (2.8 + e * 1.9, cy + 1.1, 2.45),
                'glow_green' if e > 0 else 'glow_red', size=0.3)
    F.beacon(s, 'BerthStrobe', (2.8, cy + 1.0, 2.45), 'glow_amber', size=0.28)

    # --- counterweight tail + a stowed salvage hook ---------------------------------------------
    F.box(s, 'Tail', (1.2, -1.9, 1.0), (2.4, 1.0, 1.4), material='dark', bevel=0.08)
    F.beams(s, 'HookCable', [((1.2, -2.2, 1.0), (1.2, -2.2, -0.6))], 0.09,
            material='dark')
    F.box(s, 'Hook', (1.2, -2.2, -0.9), (0.6, 0.6, 0.6), material='gunmetal', bevel=0.06)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
