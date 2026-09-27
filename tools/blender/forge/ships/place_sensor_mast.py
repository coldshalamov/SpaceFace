"""Sensor mast (place_sensor_mast) — Forge rebuild.

Idea: "tripod mast, sweeping radar bar". A splayed three-leg tripod on hazard-banded pads with a
navy equipment cabinet at the hub, an ivory mast banded in navy, a small tilted relay dish on a
side arm, and near the top a turntable carrying a long slatted radar array (cyan emitter row) that
sweeps the lane, topped by a red aviation beacon and whip antennas. Plan read: a long radar bar
crossing a round turntable, with a dish off to the side — a listening post.

Live contract (glTF): X -1.0..4.3, Y-up 0..13.3, Z -2.2..1.8; SOCKET_Listen at Y 9.4.
Blender (x, y, z) = glTF (X, -Z, Y).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_sensor_mast'
COLORS = {
    'paint': '#a69d8a',       # Helios ivory
    'paint2': '#1f3355',      # authority navy (occupation colour)
    'stripe': '#1f3355',
    'hazard': '#b88a22',
    'paint.graphite': '#23282e',
}

Z_HUB = 2.3
Z_MAST1 = 12.3
Z_RADAR = 9.4


def strut(s, name, p0, p1, w, material='paint.graphite', bevel=0.0):
    return F.sweep(s, name, [p0, p1], w, w, material=material, bevel=bevel)


def polar(r, a, z):
    return (r * math.cos(a), r * math.sin(a), z)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- tripod ------------------------------------------------------------------------------------
    angles = [0.0, 2 * math.pi / 3, 4 * math.pi / 3]
    for k, a in enumerate(angles):
        foot = polar(1.75, a, 0.25)
        F.box(s, f'Pad{k}', polar(1.8, a, 0.12), (0.62, 0.62, 0.24), material='paint.graphite', bevel=0.03, rot_z=a)
        F.box(s, f'PadHaz{k}', polar(1.8, a, 0.27), (0.5, 0.5, 0.08), material='hazard', bevel=0.01, rot_z=a)
        F.band(s, f'PadHaz{k}', polar(1.8, a, 0.27), (math.cos(a + 0.8), math.sin(a + 0.8), 0), 0.12, 'paint.graphite')
        strut(s, f'Leg{k}', polar(0.32, a, Z_HUB + 0.2), foot, 0.2, material='paint', bevel=0.02)
        F.cylinder(s, f'Knee{k}', polar(1.75, a, 0.25), polar(1.75, a, 0.55), 0.12, material='gunmetal', segments=10)
        # ties between legs
        b = angles[(k + 1) % 3]
        strut(s, f'Tie{k}', polar(1.15, a, 0.95), polar(1.15, b, 0.95), 0.09)
    F.cylinder(s, 'HubCollar', (0, 0, Z_HUB - 0.2), (0, 0, Z_HUB + 0.35), 0.5, 0.42, material='paint.graphite',
               segments=24)
    # equipment cabinet hugging the hub
    F.box(s, 'Cabinet', (-0.1, 0, Z_HUB + 0.85), (1.1, 1.2, 1.0), material='paint2', bevel=0.05)
    F.band(s, 'Cabinet', (0, 0, Z_HUB + 1.2), (0, 0, 1), 0.12, 'paint', inset=0.01, depth=-0.01)
    F.panel(s, 'Cabinet', (-0.3, 0), (0.5, 0.9), 'paint.graphite', inset=0.04, depth=-0.03)
    F.light(s, 'CabLampG', (0.46, 0.42, Z_HUB + 1.2), 'glow_green', size=0.1)
    F.light(s, 'CabLampA', (0.46, -0.42, Z_HUB + 1.2), 'glow_amber', size=0.1)
    s.detail = 2
    F.vent(s, 'CabVent', (-0.1, 0.0, Z_HUB + 1.36), (0.4, 0.8, 0.05), slats=4)
    s.detail = 0

    # --- mast --------------------------------------------------------------------------------------
    F.cylinder(s, 'Mast', (0, 0, Z_HUB), (0, 0, Z_MAST1), 0.26, 0.19, material='paint', segments=24)
    for z in (4.2, 6.2, 8.2, 11.2):
        F.band(s, 'Mast', (0, 0, z), (0, 0, 1), 0.3, 'paint2')
    for z in (Z_HUB + 1.5, 5.2, 7.2):
        F.ring(s, f'MastFlange{z:.1f}', (0, 0, z), 0.27, 0.05, axis=(0, 0, 1), material='gunmetal', segments=20,
               sides=6)
    F.cylinder(s, 'Cable', (-0.3, 0, Z_HUB + 1.3), (-0.3, 0, Z_RADAR - 0.4), 0.05, material='paint.graphite',
               segments=8)
    for z in (4.0, 6.0, 8.0):
        F.box(s, f'Clamp{z}', (-0.26, 0, z), (0.16, 0.14, 0.1), material='gunmetal', bevel=0.0)

    # --- relay dish on a side arm ------------------------------------------------------------------
    ZD = 6.4
    F.box(s, 'ArmRoot', (0.3, 0, ZD), (0.36, 0.44, 0.44), material='paint.graphite', bevel=0.03)
    strut(s, 'Arm', (0.4, 0, ZD), (2.6, 0, ZD + 0.3), 0.22, material='paint', bevel=0.02)
    strut(s, 'ArmStay', (0.2, 0, ZD - 1.2), (2.2, 0, ZD + 0.22), 0.1)
    F.box(s, 'DishYoke', (2.75, 0, ZD + 0.35), (0.36, 0.6, 0.36), material='paint2', bevel=0.03)
    ax = (0.8, 0.0, 0.6)
    F.dish(s, 'Dish', (3.0, 0, ZD + 0.55), 0.78, 0.26, axis=ax, material='paint', face='gunmetal', segments=28,
           feed='glow_cyan')

    # --- radar turntable and array -------------------------------------------------------------
    F.cylinder(s, 'TurntableBase', (0, 0, Z_RADAR - 0.45), (0, 0, Z_RADAR - 0.15), 0.34, 0.6, material='paint2',
               segments=28)
    F.cylinder(s, 'Turntable', (0, 0, Z_RADAR - 0.15), (0, 0, Z_RADAR + 0.1), 0.62, 0.62, material='paint.graphite',
               segments=28)
    F.ring(s, 'TurnRing', (0, 0, Z_RADAR + 0.1), 0.6, 0.05, axis=(0, 0, 1), material='bare', segments=28, sides=6)
    F.box(s, 'Pedestal', (0, 0, Z_RADAR + 0.35), (0.5, 0.6, 0.5), material='paint2', bevel=0.04)
    tilt = 0.28
    ZA = Z_RADAR + 0.95
    F.box(s, 'Array', (0.1, 0, ZA), (0.26, 4.0, 0.95), material='paint', bevel=0.04, rot=(0.0, -tilt, 0.0))
    F.band(s, 'Array', (0, 1.75, 0), (0, 1, 0), 0.3, 'paint2')
    F.band(s, 'Array', (0, -1.75, 0), (0, 1, 0), 0.3, 'paint2')
    # emitter row on the front face (tilted with the array)
    fx, fz = math.cos(tilt), math.sin(tilt)
    for i in range(9):
        y = -1.44 + i * 0.36
        F.box(s, f'Emitter{i}', (0.1 + 0.14 * fx, y, ZA + 0.14 * fz), (0.04, 0.22, 0.5), material='glow_cyan',
              bevel=0.0, rot=(0.0, -tilt, 0.0))
    # back ribs and top spine of the array
    for i in range(5):
        y = -1.6 + i * 0.8
        F.box(s, f'ArrayRib{i}', (0.1 - 0.17 * fx, y, ZA - 0.17 * fz), (0.1, 0.1, 0.9), material='paint.graphite',
              bevel=0.0, rot=(0.0, -tilt, 0.0))
    F.box(s, 'ArraySpine', (0.1 - 0.16 * fx, 0, ZA - 0.16 * fz), (0.08, 3.8, 0.12), material='paint.graphite',
          bevel=0.0)
    for sy in (-1, 1):
        F.light(s, f'ArrayTip{sy}', (0.1 - 0.12 * fz, sy * 2.02, ZA + 0.2), 'glow_red' if sy > 0 else 'glow_green',
                size=0.13)
        strut(s, f'ArrayStay{sy}', (0, sy * 0.3, Z_RADAR + 0.5), (0.05, sy * 1.2, ZA - 0.35), 0.08)

    # --- mast top ----------------------------------------------------------------------------------
    F.cylinder(s, 'TopCap', (0, 0, Z_MAST1), (0, 0, Z_MAST1 + 0.2), 0.34, 0.3, material='paint2', segments=20)
    F.beacon(s, 'Aviation', (0, 0, Z_MAST1 + 0.2), finish='glow_red', size=0.36)
    s.detail = 2
    for k in range(2):
        a = math.pi / 2 + k * math.pi
        F.antenna(s, f'Whip{k}', polar(0.26, a, Z_MAST1 + 0.1), 0.85, tip='glow_amber')
    s.detail = 0
    F.light(s, 'MidLamp', (0.28, 0, 8.0), 'glow_amber', size=0.12)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
