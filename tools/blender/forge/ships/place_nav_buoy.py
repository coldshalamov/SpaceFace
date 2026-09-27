"""Helios navigation spire buoy (place_nav_buoy) — Forge rebuild.

Idea: "weighted spire, caged cyan lantern". A heavy charcoal ballast bulb with hazard collar and
three stabiliser legs, a tapered ivory spire banded in lane blue, four swept reflector fins, and on
top a big lit cyan lantern inside a gunmetal cage under a hooded cap with an amber beacon.
Seen from the chase camera (the spire points at the camera) it reads as a lit cyan disc in a
spoked cage, crossed by four reflector fins — a lamp you steer by.

Live contract (glTF): X -1.4..1.57, Y-up -5.0..10.3, Z ±1.4. Blender (x, y, z) = glTF (X, -Z, Y).
"""
import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_nav_buoy'
COLORS = {
    'paint': '#a69d8a',       # Helios ivory
    'paint2': '#23282e',      # charcoal
    'stripe': '#1d4f6a',      # lane-authority blue
    'hazard': '#b88a22',
}

Z0 = -5.0
Z_SPIRE0, Z_SPIRE1 = -3.0, 6.9
Z_LAMP0, Z_LAMP1 = 7.3, 9.3


def vfin(s, name, outline, thickness, angle, material='paint', bevel=0.02):
    """Vertical plate in the plane of `angle` (radians from +X): outline = [(radius, z), ...]."""
    bm = bmesh.new()
    c, sn = math.cos(angle), math.sin(angle)

    def P(u, z, t):
        return (u * c - t * sn, u * sn + t * c, z)
    front = [bm.verts.new(P(u, z, -thickness / 2)) for u, z in outline]
    back = [bm.verts.new(P(u, z, thickness / 2)) for u, z in outline]
    n = len(outline)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def polar(r, a, z):
    return (r * math.cos(a), r * math.sin(a), z)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- ballast bulb ------------------------------------------------------------------------------
    F.cylinder(s, 'BallastLow', (0, 0, Z0), (0, 0, Z0 + 0.7), 0.55, 1.05, material='paint2', segments=32, bevel=0.03)
    F.cylinder(s, 'Ballast', (0, 0, Z0 + 0.7), (0, 0, Z0 + 1.6), 1.05, 1.05, material='paint2', segments=32, bevel=0.03)
    F.cylinder(s, 'BallastTop', (0, 0, Z0 + 1.6), (0, 0, Z_SPIRE0 + 0.1), 1.05, 0.6, material='paint2', segments=32,
               bevel=0.03)
    # hazard collar with charcoal chevrons
    F.cylinder(s, 'Collar', (0, 0, Z0 + 0.85), (0, 0, Z0 + 1.45), 1.1, 1.1, material='hazard', segments=40, bevel=0.02)
    for k in range(6):
        a = k * math.pi / 6
        F.band(s, 'Collar', polar(1.1, a, Z0 + 1.15), (-math.sin(a), math.cos(a), 0.7), 0.2, 'paint2')
    F.ring(s, 'BallastRing', (0, 0, Z0 + 0.7), 1.07, 0.07, axis=(0, 0, 1), material='gunmetal', segments=40, sides=6)
    # three stabiliser legs with pads
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 6
        vfin(s, f'Leg{k}', [(0.6, Z0 + 1.6), (0.95, Z0 + 1.6), (1.35, Z0 + 0.3), (1.35, Z0), (0.5, Z0),
                             (0.5, Z0 + 0.4)], 0.18, a, material='gunmetal')
        F.box(s, f'LegPad{k}', polar(1.25, a, Z0 + 0.08), (0.45, 0.45, 0.16), material='paint2', bevel=0.03,
              rot_z=a)
    F.light(s, 'BallastLampG', polar(1.07, 0.0, Z0 + 1.9), 'glow_green', size=0.14)
    F.light(s, 'BallastLampR', polar(1.07, math.pi, Z0 + 1.9), 'glow_red', size=0.14)

    # --- tapered spire -----------------------------------------------------------------------------
    F.cylinder(s, 'Spire', (0, 0, Z_SPIRE0), (0, 0, Z_SPIRE1), 0.5, 0.26, material='paint', segments=28, bevel=0.02)
    for z, w in ((-1.6, 0.35), (1.4, 0.3), (4.4, 0.26)):
        F.band(s, 'Spire', (0, 0, z), (0, 0, 1), w, 'stripe', inset=0.01, depth=-0.015)
    for z, r in ((Z_SPIRE0 + 0.15, 0.56), (2.9, 0.4), (Z_SPIRE1 - 0.12, 0.32)):
        F.ring(s, f'SpireRing{z:.1f}', (0, 0, z), r, 0.05, axis=(0, 0, 1), material='gunmetal', segments=24, sides=6)
    # service ladder up one face
    s.detail = 2
    for sy in (-1, 1):
        F.cylinder(s, f'LadderRail{sy}', polar(0.52, sy * 0.28, -2.6), polar(0.34, sy * 0.46, 5.8), 0.03,
                   material='gunmetal', segments=6, bevel=0.0)
    for k in range(14):
        z = -2.4 + k * 0.58
        t = (z + 2.6) / 8.4
        r = 0.52 + (0.34 - 0.52) * t
        F.box(s, f'Rung{k}', polar(r, 0.0, z), (0.04, 0.34, 0.04), material='gunmetal', bevel=0.0)
    s.detail = 0

    # --- reflector fins: four swept vanes, ivory frames round polished mirror panels --------------
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        vfin(s, f'Fin{k}', [(0.3, 1.6), (0.5, 1.6), (1.3, 3.3), (1.3, 5.2), (0.26, 6.0)], 0.07, a,
             material='paint')
        vfin(s, f'Mirror{k}', [(0.62, 2.35), (1.12, 3.4), (1.12, 5.0), (0.62, 5.35)], 0.1, a, material='bare',
             bevel=0.0)
        # amber retro-reflector strip along the vane's outer edge
        vfin(s, f'FinRefl{k}', [(1.26, 3.45), (1.38, 3.45), (1.38, 5.05), (1.26, 5.05)], 0.12, a,
             material='glow_amber', bevel=0.0)
        vfin(s, f'FinBand{k}', [(0.46, 1.75), (0.62, 1.75), (1.2, 3.1), (1.04, 3.1)], 0.1, a, material='stripe',
             bevel=0.0)
        F.box(s, f'FinRoot{k}', polar(0.38, a, 3.8), (0.22, 0.14, 4.2), material='paint2', bevel=0.02, rot_z=a)

    # --- lantern head ----------------------------------------------------------------------------
    F.cylinder(s, 'LampSeat', (0, 0, Z_SPIRE1 - 0.05), (0, 0, Z_LAMP0), 0.4, 0.95, material='paint2', segments=32,
               bevel=0.02)
    F.cylinder(s, 'LampBase', (0, 0, Z_LAMP0), (0, 0, Z_LAMP0 + 0.18), 1.0, 1.0, material='paint', segments=32,
               bevel=0.02)
    F.cylinder(s, 'Lantern', (0, 0, Z_LAMP0 + 0.18), (0, 0, Z_LAMP1 - 0.18), 0.72, 0.72, material='glow_cyan',
               segments=32, bevel=0.0)
    F.cylinder(s, 'LampCore', (0, 0, Z_LAMP0 + 0.18), (0, 0, Z_LAMP1 - 0.18), 0.3, 0.3, material='glass',
               segments=16, bevel=0.0)
    # the cage: eight bars and three hoops
    for k in range(8):
        a = k * math.pi / 4
        F.box(s, f'CageBar{k}', polar(0.86, a, (Z_LAMP0 + Z_LAMP1) / 2), (0.1, 0.1, Z_LAMP1 - Z_LAMP0),
              material='gunmetal', bevel=0.0, rot_z=a)
    for z in (Z_LAMP0 + 0.2, (Z_LAMP0 + Z_LAMP1) / 2, Z_LAMP1 - 0.2):
        F.ring(s, f'CageHoop{z:.2f}', (0, 0, z), 0.87, 0.05, axis=(0, 0, 1), material='gunmetal', segments=32, sides=6)
    # hooded cap: ivory annulus with a lit oculus so the plan view sees the lantern
    F.cylinder(s, 'Cap', (0, 0, Z_LAMP1), (0, 0, Z_LAMP1 + 0.28), 1.05, 0.95, material='paint', segments=32,
               bevel=0.03)
    F.band(s, 'Cap', (0, 0, Z_LAMP1 + 0.14), (0, 0, 1), 0.1, 'stripe')
    F.ring(s, 'CapRim', (0, 0, Z_LAMP1 + 0.28), 0.62, 0.08, axis=(0, 0, 1), material='gunmetal', segments=32, sides=8)
    F.cylinder(s, 'Oculus', (0, 0, Z_LAMP1 + 0.2), (0, 0, Z_LAMP1 + 0.32), 0.56, 0.56, material='glow_cyan',
               segments=32, bevel=0.0)
    # spoked cage over the oculus + beacon mast
    for k in range(4):
        a = k * math.pi / 2
        F.box(s, f'Spoke{k}', polar(0.3, a, Z_LAMP1 + 0.4), (0.6, 0.09, 0.09), material='gunmetal', bevel=0.0,
              rot_z=a)
    F.cylinder(s, 'BeaconPost', (0, 0, Z_LAMP1 + 0.3), (0, 0, Z_LAMP1 + 0.6), 0.14, material='gunmetal', segments=12)
    F.beacon(s, 'TopBeacon', (0, 0, Z_LAMP1 + 0.6), finish='glow_amber', size=0.36)
    s.detail = 2
    F.antenna(s, 'Whip', polar(0.8, math.pi / 4, Z_LAMP1 + 0.28), 0.55, tip='glow_red')
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
