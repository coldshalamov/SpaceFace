"""Floodlight tower (place_worklight_tower) — Forge rebuild.

Idea: "yellow lattice mast, lamp crown". A charcoal base plate with hazard-banded edges, ballast
blocks and a generator, four outrigger braces, a safety-yellow square lattice mast, and at the top a
square lamp crown: a grated platform with a railing and eight big floodlight cans aimed down and out,
two per face, plus an amber beacon over the crown. Plan read: a square crown of warm lenses round a
beacon — the light the yard works under.

Live contract (glTF): X ±1.5, Y-up 0..15.82, Z ±1.5; SOCKET_Head at Y 15.1.
Blender (x, y, z) = glTF (X, -Z, Y).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
from mathutils import Vector  # noqa: E402

SHIP_ID = 'place_worklight_tower'
COLORS = {
    'paint': '#8c6c1e',       # safety yellow (work fleet)
    'paint2': '#23282e',      # charcoal
    'stripe': '#23282e',
    'hazard': '#b88a22',
    'glow_warm': '#ffcf8a',
}

ZP = 0.34            # base plate top
Z_MAST1 = 13.6       # mast top / crown floor
MH = 0.45            # mast half-width
CH = 1.22            # crown half-width


def strut(s, name, p0, p1, w, material='paint2', bevel=0.0):
    return F.sweep(s, name, [p0, p1], w, w, material=material, bevel=bevel)


def flood(s, name, pos, aim, r=0.3, lens='glow_warm'):
    """Floodlight can: matte charcoal body, yellow sun visor, dark bezel, lit lens with an LED halo
    ring (the halo is what the top-down camera catches when the lamp is aimed down and out)."""
    p = Vector(pos)
    a = Vector(aim).normalized()
    back, front = p - a * r * 0.8, p + a * r * 0.9
    F.cylinder(s, name + 'Can', tuple(back), tuple(front), r * 0.72, r, material='paint2', segments=18,
               bevel=0.015)
    F.cylinder(s, name + 'Bezel', tuple(front - a * 0.02), tuple(front + a * 0.05), r * 1.12, material='dark',
               segments=18, bevel=0.0)
    F.cylinder(s, name + 'Lens', tuple(front), tuple(front + a * 0.08), r * 0.9, material=lens, segments=18,
               bevel=0.0)
    F.ring(s, name + 'Halo', tuple(front + a * 0.06), r * 1.1, 0.05, axis=tuple(a), material=lens, segments=18,
           sides=5)
    up = Vector((0, 0, 1))
    F.sweep(s, name + 'Visor', [tuple(back + up * r * 1.0), tuple(front + a * 0.15 + up * r * 1.12)], r * 2.1, 0.05,
            material='paint', bevel=0.0)
    F.box(s, name + 'Back', tuple(back - a * 0.05), (0.16, 0.16, 0.16), material='dark', bevel=0.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- base plate ------------------------------------------------------------------------------
    F.box(s, 'Plate', (0, 0, ZP / 2), (2.96, 2.96, ZP), material='paint2', bevel=0.04)
    for sx in (-1, 1):
        F.band(s, 'Plate', (sx * 1.3, 0, 0), (1, 0, 0), 0.3, 'hazard', facing=(0, 0, 1))
    for k in range(-4, 5):
        F.band(s, 'Plate', (1.3, k * 0.34, 0), (0.5, 0.866, 0), 0.1, 'paint2', facing=(0, 0, 1))
        F.band(s, 'Plate', (-1.3, k * 0.34, 0), (-0.5, 0.866, 0), 0.1, 'paint2', facing=(0, 0, 1))
    # ballast blocks and a generator
    for sy in (-1, 1):
        F.box(s, f'Ballast{sy}', (0.75, sy * 0.95, ZP + 0.28), (0.9, 0.7, 0.56), material='paint', bevel=0.04)
        F.band(s, f'Ballast{sy}', (0.75, 0, 0), (1, 0, 0), 0.16, 'paint2')
    F.box(s, 'Genset', (-0.9, 0, ZP + 0.4), (0.85, 1.9, 0.8), material='paint2', bevel=0.05)
    F.panel(s, 'Genset', (-0.9, 0.35), (0.6, 0.6), 'paint', inset=0.04, depth=-0.03)
    F.vent(s, 'GenVent', (-0.9, -0.5, ZP + 0.8), (0.6, 0.6, 0.06), slats=5)
    F.light(s, 'GenLamp', (-0.5, 0.75, ZP + 0.8), 'glow_green', size=0.1)
    F.cylinder(s, 'GenCable', (-0.5, 0, ZP + 0.3), (-MH, 0, ZP + 0.3), 0.07, material='dark', segments=8)
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Pad{sx}{sy}', (sx * 1.3, sy * 1.3, 0.06), (0.4, 0.4, 0.12), material='gunmetal', bevel=0.02)

    # --- lattice mast ----------------------------------------------------------------------------
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Post{sx}{sy}', (sx * MH, sy * MH, (ZP + Z_MAST1) / 2), (0.16, 0.16, Z_MAST1 - ZP),
                  material='paint', bevel=0.02)
    levels = [ZP + 0.25 + k * 1.1 for k in range(13)]
    levels = [z for z in levels if z < Z_MAST1 - 0.15]
    for k, z in enumerate(levels):
        for sx in (-1, 1):
            F.box(s, f'RX{k}{sx}', (sx * MH, 0, z), (0.1, MH * 2, 0.1), material='paint', bevel=0.0)
            F.box(s, f'RY{k}{sx}', (0, sx * MH, z), (MH * 2, 0.1, 0.1), material='paint', bevel=0.0)
    s.detail = 1
    for k in range(len(levels) - 1):
        z0, z1 = levels[k], levels[k + 1]
        f = 1 if k % 2 == 0 else -1
        for sx in (-1, 1):
            strut(s, f'DX{k}{sx}', (sx * MH, -f * MH, z0), (sx * MH, f * MH, z1), 0.07)
            strut(s, f'DY{k}{sx}', (-f * MH, sx * MH, z0), (f * MH, sx * MH, z1), 0.07)
    s.detail = 0
    # hazard bands on the posts near the foot and a cable riser
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.band(s, f'Post{sx}{sy}', (0, 0, ZP + 1.2), (0, 0, 1), 0.9, 'paint2')
    F.cylinder(s, 'Riser', (-MH + 0.14, 0, ZP), (-MH + 0.14, 0, Z_MAST1), 0.06, material='dark', segments=8)
    # outrigger braces from the plate corners to the mast
    for sx in (-1, 1):
        for sy in (-1, 1):
            strut(s, f'Outrigger{sx}{sy}', (sx * 1.2, sy * 1.2, ZP + 0.05), (sx * MH, sy * MH, ZP + 3.2), 0.12,
                  material='paint2', bevel=0.01)
    # mid-height aircraft warning lamps
    F.light(s, 'MidLampA', (MH + 0.09, 0, 7.2), 'glow_red', size=0.12)
    F.light(s, 'MidLampB', (-MH - 0.09, 0, 7.2), 'glow_red', size=0.12)

    # --- crown: platform, railing, lamp rack ---------------------------------------------------------
    F.box(s, 'CrownDeck', (0, 0, Z_MAST1 + 0.1), (CH * 2, CH * 2, 0.2), material='paint2', bevel=0.03)
    F.panel(s, 'CrownDeck', (0, 0), (CH * 2 - 0.4, CH * 2 - 0.4), 'dark', inset=0.03, depth=-0.04)
    for sx in (-1, 1):
        F.band(s, 'CrownDeck', (sx * (CH - 0.1), 0, 0), (1, 0, 0), 0.16, 'hazard', facing=(0, 0, 1))
    # corner brackets under the deck
    for sx in (-1, 1):
        for sy in (-1, 1):
            strut(s, f'Bracket{sx}{sy}', (sx * MH, sy * MH, Z_MAST1 - 1.0), (sx * (CH - 0.1), sy * (CH - 0.1),
                                                                               Z_MAST1), 0.1, material='paint')
            F.box(s, f'RailPost{sx}{sy}', (sx * (CH - 0.06), sy * (CH - 0.06), Z_MAST1 + 0.55), (0.08, 0.08, 0.9),
                  material='paint', bevel=0.0)
    for sx in (-1, 1):
        F.box(s, f'RailX{sx}', (sx * (CH - 0.06), 0, Z_MAST1 + 0.95), (0.07, CH * 2, 0.07), material='paint',
              bevel=0.0)
        F.box(s, f'RailY{sx}', (0, sx * (CH - 0.06), Z_MAST1 + 0.95), (CH * 2, 0.07, 0.07), material='paint',
              bevel=0.0)
    # lamp rack: a central junction box with a cross of arms, two floods per face
    F.box(s, 'Junction', (0, 0, Z_MAST1 + 0.55), (0.9, 0.9, 0.7), material='paint', bevel=0.04)
    F.band(s, 'Junction', (0, 0, Z_MAST1 + 0.55), (0, 0, 1), 0.14, 'paint2')
    F.box(s, 'RackX', (0, 0, Z_MAST1 + 1.05), (CH * 2 - 0.1, 0.2, 0.16), material='paint2', bevel=0.02)
    F.box(s, 'RackY', (0, 0, Z_MAST1 + 1.05), (0.2, CH * 2 - 0.1, 0.16), material='paint2', bevel=0.02)
    lamps = []
    for k in range(4):
        a = k * math.pi / 2
        nx, ny = math.cos(a), math.sin(a)
        tx, ty = -ny, nx
        for off in (-0.55, 0.55):
            px, py = nx * 0.95 + tx * off, ny * 0.95 + ty * off
            lamps.append((f'Flood{k}{"a" if off < 0 else "b"}', (px, py, Z_MAST1 + 1.0), (nx, ny, -0.55)))
            strut(s, f'Arm{k}{off:.1f}', (nx * 0.45 + tx * off * 0.5, ny * 0.45 + ty * off * 0.5, Z_MAST1 + 1.05),
                  (px - nx * 0.2, py - ny * 0.2, Z_MAST1 + 1.05), 0.1, material='paint2')
    for name, pos, aim in lamps:
        flood(s, name, pos, aim, r=0.3)
    # beacon mast over the crown
    F.cylinder(s, 'BeaconMast', (0, 0, Z_MAST1 + 0.9), (0, 0, Z_MAST1 + 1.75), 0.09, material='gunmetal',
               segments=10)
    F.beacon(s, 'Beacon', (0, 0, Z_MAST1 + 1.75), finish='glow_amber', size=0.34)
    s.detail = 2
    F.antenna(s, 'Whip', (0.3, 0.3, Z_MAST1 + 0.9), 0.6, tip='glow_red')
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
