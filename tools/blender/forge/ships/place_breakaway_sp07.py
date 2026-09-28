"""Breakaway SP-07 flywheel (place_breakaway_sp07) — Forge rebuild.

Idea: "the caged gyro". The Third Shift flywheel payload: a spoked ring standing in the
Blender YZ plane (wheel axis along +X) hung inside a four-post cradle cage — copper ring,
graphite spokes, machined hub, tow eyes fore and aft (socket_tow_*), a service platform on
top. Reads from above as a long cage with the wheel cross inside it.
Live bounds (Blender): x +-13.9, y +-9.3, z -9.3..13.05.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_breakaway_sp07'
COLORS = {
    'paint': '#a89e8c',
    'paint2': '#23282e',
    'paint.aged': '#6e685c',
    'gunmetal.copper': '#7a5a30',
    'bare.steel': '#4a4f55',
    'gunmetal': '#23282e',
    'dark': '#14171b',
    'ceramic': '#3a3630',
    'hazard': '#8a7418',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}

WHEEL_R = 8.0    # wheel ring radius in the YZ plane


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the flywheel: ring + spokes + hub, axis along X ----------------------------------------
    F.ring(s, 'Wheel', (0, 0, 1.4), WHEEL_R, 1.1, axis=(1, 0, 0), material='gunmetal.copper',
           segments=28, sides=8)
    F.ring(s, 'WheelBand', (0, 0, 1.4), WHEEL_R + 0.1, 0.2, axis=(1, 0, 0),
           material='hazard', segments=28, sides=6)
    for k in range(6):
        a = math.radians(k * 60)
        F.beams(s, f'Spoke{k}', [((0, 0, 1.4),
                                 (0, math.cos(a) * (WHEEL_R - 0.8),
                                  1.4 + math.sin(a) * (WHEEL_R - 0.8)))],
                0.7, material='paint2')
    F.cylinder(s, 'Hub', (-1.6, 0, 1.4), (1.6, 0, 1.4), 1.8, material='bare.steel',
               segments=16, bevel=0.06)
    F.cylinder(s, 'HubCap', (-1.9, 0, 1.4), (-1.6, 0, 1.4), 1.2, material='dark',
               segments=12)
    F.cylinder(s, 'HubCapB', (1.9, 0, 1.4), (1.6, 0, 1.4), 1.2, material='dark',
               segments=12)

    # --- the cradle cage: corner posts + rails fore/aft of the wheel ----------------------------
    for ex in (-1, 1):
        for ey in (-1, 1):
            F.box(s, f'Post{ex:+d}{ey:+d}', (ex * 11.5, ey * 7.6, 1.0),
                  (1.6, 1.6, 14.0), material='paint2', bevel=0.1)
            F.box(s, f'PostCap{ex:+d}{ey:+d}', (ex * 11.5, ey * 7.6, 8.2),
                  (1.5, 1.5, 0.35), material='hazard', bevel=0.02)
    # longitudinal rails top and bottom on both flanks
    for ey in (-1, 1):
        for z in (-7.4, 7.9):
            F.box(s, f'Rail{ey:+d}{z}', (0, ey * 7.6, z), (24.5, 1.2, 1.0),
                  material='gunmetal', bevel=0.04)
    # end frames tying the posts
    for ex in (-1, 1):
        F.truss(s, f'EndFrame{ex:+d}', (ex * 11.5, -7.6, -7.0), (ex * 11.5, 7.6, -7.0),
                1.4, 3, material='paint2', chord=0.35, web=0.2)

    # --- tow eyes fore and aft (socket_tow stations) ---------------------------------------------
    for ex in (-1, 1):
        F.box(s, f'TowStub{ex:+d}', (ex * 12.6, 0.0, 1.0), (1.6, 2.2, 2.2),
              material='paint2', bevel=0.08)
        F.ring(s, f'TowEye{ex:+d}', (ex * 13.4, 0.0, 1.0), 1.1, 0.3, axis=(1, 0, 0),
               material='paint', segments=12, sides=6)
        F.light(s, f'TowLamp{ex:+d}', (ex * 13.4, 0.0, 2.4),
                'glow_green' if ex > 0 else 'glow_red', size=0.3)

    # --- service platform on the cage roof (socket_service station) -------------------------------
    F.box(s, 'ServiceDeck', (3.0, 0.0, 8.6), (7.0, 5.0, 0.5), material='dark', bevel=0.04)
    for e in (-1, 1):
        F.box(s, f'ServiceRail{e:+d}', (3.0, e * 2.4, 9.2), (6.6, 0.2, 0.8),
              material='paint2', bevel=0.0)
    F.box(s, 'ServiceBox', (5.8, 1.2, 9.3), (1.8, 1.4, 1.2), material='paint.aged',
          bevel=0.08)
    F.work_lamp(s, 'ServiceLamp', (0.4, -2.0, 9.6), aim=(0.2, 0.3, -0.8), size=0.4,
                lens='glow_warm')
    F.beacon(s, 'CageStrobe', (-6.0, 0.0, 9.6), 'glow_amber', size=0.4)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
