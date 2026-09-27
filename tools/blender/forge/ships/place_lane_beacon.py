"""Helios lane support gantry (place_lane_beacon) — Forge rebuild.

Idea: "ivory lattice mast, lamp boom". A square lattice mast on a hazard-banded plinth carries a
box-truss cantilever boom out along +X, held by twin stay cables from the mast head. The boom hangs a
row of signal lamp pods (amber / cyan alternating, lit on top, sides and underside) and ends in a big
cyan lane-lamp head. Plan read from the chase camera: a square mast cap with a red aviation beacon,
and a long ribbed boom dotted with lights pointing down the lane.

Live contract (glTF): mast at the origin, boom along +X to ~9 m, Y-up -5.1..9.2, width ~3.2 m.
Blender (x, y, z) = glTF (X, -Z, Y). Socket SOCKET_Structure_Core is copied from the live file.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_lane_beacon'
COLORS = {
    'paint': '#a69d8a',       # Helios ivory
    'paint2': '#23282e',      # charcoal
    'stripe': '#1d4f6a',      # lane-authority blue (occupation colour)
    'hazard': '#b88a22',
}

Z_BASE = -5.1
Z_PLINTH = -3.8
Z_TOP = 8.3
MH = 0.72          # mast half-width (post centres)
ARM_Z0, ARM_Z1 = 4.9, 6.1   # boom bottom / top chords
ARM_HW = 0.5       # boom half-width
ARM_X0, ARM_X1 = MH, 8.2


def strut(s, name, p0, p1, w, material='paint2', bevel=0.0):
    return F.sweep(s, name, [p0, p1], w, w, material=material, bevel=bevel)


def lattice_mast(s):
    posts = [(sx * MH, sy * MH) for sx in (-1, 1) for sy in (-1, 1)]
    for i, (x, y) in enumerate(posts):
        F.box(s, f'MastPost{i}', (x, y, (Z_PLINTH + Z_TOP) / 2), (0.26, 0.26, Z_TOP - Z_PLINTH), material='paint',
              bevel=0.03)
    levels = [Z_PLINTH + 0.3 + k * 1.5 for k in range(9)]
    levels = [z for z in levels if z < Z_TOP - 0.2]
    for k, z in enumerate(levels):
        for sx in (-1, 1):
            F.box(s, f'RingX{k}{sx}', (sx * MH, 0, z), (0.16, MH * 2, 0.16), material='paint2', bevel=0.0)
            F.box(s, f'RingY{k}{sx}', (0, sx * MH, z), (MH * 2, 0.16, 0.16), material='paint2', bevel=0.0)
    s.detail = 1
    for k in range(len(levels) - 1):
        z0, z1 = levels[k], levels[k + 1]
        flip = 1 if k % 2 == 0 else -1
        for sx in (-1, 1):
            strut(s, f'DiagX{k}{sx}', (sx * MH, -flip * MH, z0), (sx * MH, flip * MH, z1), 0.1)
            strut(s, f'DiagY{k}{sx}', (-flip * MH, sx * MH, z0), (flip * MH, sx * MH, z1), 0.1)
    s.detail = 0
    return levels


def lamp_pod(s, name, x, lens):
    """Signal lamp pod slung under the boom: gunmetal housing, lit side windows, underside and top."""
    zc = ARM_Z0 - 0.55
    F.box(s, name + 'Hanger', (x, 0, ARM_Z0 - 0.2), (0.2, 0.2, 0.4), material='gunmetal', bevel=0.0)
    F.box(s, name + 'Body', (x, 0, zc), (0.7, 0.95, 0.55), material='paint2', bevel=0.04)
    for sy in (-1, 1):
        F.box(s, f'{name}Lens{sy}', (x, sy * 0.49, zc), (0.5, 0.05, 0.3), material=lens, bevel=0.0)
    F.box(s, name + 'Under', (x, 0, zc - 0.29), (0.45, 0.6, 0.05), material=lens, bevel=0.0)
    F.ring(s, name + 'Hood', (x, 0, zc + 0.3), 0.3, 0.05, axis=(0, 0, 1), material='gunmetal', segments=16, sides=6)
    # lamp repeated on the top chord so the plan view reads it
    F.beacon(s, name + 'Top', (x, 0, ARM_Z1 + 0.1), finish=lens, size=0.34)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- plinth: charcoal block with a hazard collar and foot pads --------------------------------
    F.box(s, 'Plinth', (0, 0, (Z_BASE + Z_PLINTH) / 2), (2.9, 2.9, Z_PLINTH - Z_BASE), material='paint2', bevel=0.06,
          taper=0.9)
    F.box(s, 'Collar', (0, 0, Z_PLINTH - 0.25), (2.75, 2.75, 0.5), material='hazard', bevel=0.03)
    for k in range(-4, 5):
        F.band(s, 'Collar', (k * 0.62, 0, Z_PLINTH - 0.25), (0.7071, 0, 0.7071), 0.26, 'paint2')
    F.box(s, 'PlinthCap', (0, 0, Z_PLINTH + 0.06), (2.2, 2.2, 0.14), material='paint', bevel=0.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Foot{sx}{sy}', (sx * 1.3, sy * 1.3, Z_BASE + 0.18), (0.6, 0.6, 0.36), material='gunmetal',
                  bevel=0.03)
    F.panel(s, 'PlinthCap', (0, 0), (1.2, 1.2), 'dark', inset=0.04, depth=-0.03)
    # hatch + status lights on the plinth
    F.box(s, 'Hatch', (1.36, 0, Z_BASE + 0.75), (0.1, 0.9, 1.0), material='gunmetal', bevel=0.02)
    F.light(s, 'PlinthLampA', (1.25, 1.25, Z_PLINTH + 0.02), 'glow_green', size=0.14)
    F.light(s, 'PlinthLampB', (-1.25, -1.25, Z_PLINTH + 0.02), 'glow_red', size=0.14)

    # --- lattice mast ----------------------------------------------------------------------------
    lattice_mast(s)
    # lane-blue bands on the posts under the head and above the boom
    for i in range(4):
        F.band(s, f'MastPost{i}', (0, 0, 7.4), (0, 0, 1), 0.5, 'stripe')
        F.band(s, f'MastPost{i}', (0, 0, -2.6), (0, 0, 1), 0.5, 'stripe')
    # cable run up the inside of the mast
    F.cylinder(s, 'Conduit', (-MH + 0.2, 0, Z_PLINTH), (-MH + 0.2, 0, Z_TOP), 0.08, material='gunmetal', segments=8)

    # --- mast head: equipment cap, aviation beacon, antennas -------------------------------------
    F.box(s, 'Head', (0, 0, Z_TOP + 0.3), (2.1, 2.1, 0.6), material='paint', bevel=0.06)
    F.band(s, 'Head', (0, 0, Z_TOP + 0.3), (0, 0, 1), 0.22, 'stripe', inset=0.02, depth=-0.02)
    F.panel(s, 'Head', (-0.35, 0), (0.9, 1.5), 'paint2', inset=0.05, depth=-0.03)
    F.beacon(s, 'AviBeacon', (0.55, 0.0, Z_TOP + 0.6), finish='glow_red', size=0.34)
    s.detail = 2
    F.antenna(s, 'HeadAnt', (-0.75, 0.75, Z_TOP + 0.6), 0.3, tip='glow_red', mirror=True)
    F.vent(s, 'HeadVent', (-0.35, 0, Z_TOP + 0.58), (0.7, 1.2, 0.08), slats=4)
    s.detail = 0
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.light(s, f'HeadCorner{sx}{sy}', (sx * 1.02, sy * 1.02, Z_TOP + 0.3), 'glow_amber', size=0.12)

    # --- cantilever boom: box truss along +X -----------------------------------------------------
    chords = [(sy, z) for sy in (-1, 1) for z in (ARM_Z0, ARM_Z1)]
    for sy, z in chords:
        F.box(s, f'Chord{sy}{z:.1f}', ((ARM_X0 + ARM_X1) / 2, sy * ARM_HW, z), (ARM_X1 - ARM_X0, 0.2, 0.2),
              material='paint', bevel=0.025)
    F.band(s, 'Chord1' + f'{ARM_Z1:.1f}', (ARM_X1 - 0.4, 0, 0), (1, 0, 0), 0.5, 'stripe')
    F.band(s, 'Chord-1' + f'{ARM_Z1:.1f}', (ARM_X1 - 0.4, 0, 0), (1, 0, 0), 0.5, 'stripe')
    bays = 6
    xs = [ARM_X0 + (ARM_X1 - ARM_X0) * k / bays for k in range(bays + 1)]
    for k, x in enumerate(xs):
        for sy in (-1, 1):
            F.box(s, f'Vert{k}{sy}', (x, sy * ARM_HW, (ARM_Z0 + ARM_Z1) / 2), (0.14, 0.14, ARM_Z1 - ARM_Z0),
                  material='paint2', bevel=0.0)
        for z in (ARM_Z0, ARM_Z1):
            F.box(s, f'Cross{k}{z:.1f}', (x, 0, z), (0.14, ARM_HW * 2, 0.14), material='paint2', bevel=0.0)
    s.detail = 1
    for k in range(bays):
        flip = 1 if k % 2 == 0 else -1
        for sy in (-1, 1):
            strut(s, f'BoomDiag{k}{sy}', (xs[k], sy * ARM_HW, ARM_Z0 if flip > 0 else ARM_Z1),
                  (xs[k + 1], sy * ARM_HW, ARM_Z1 if flip > 0 else ARM_Z0), 0.09)
        strut(s, f'BoomTopDiag{k}', (xs[k], -flip * ARM_HW, ARM_Z1), (xs[k + 1], flip * ARM_HW, ARM_Z1), 0.08)
    s.detail = 0
    # root knee brace from the mast down to the boom underside
    for sy in (-1, 1):
        strut(s, f'Knee{sy}', (MH, sy * ARM_HW, ARM_Z0 - 2.2), (ARM_X0 + 2.0, sy * ARM_HW, ARM_Z0), 0.18,
              material='paint', bevel=0.02)
        # stay cable from the mast head to the boom tip
        strut(s, f'Stay{sy}', (MH, sy * MH, Z_TOP - 0.1), (ARM_X1 - 0.3, sy * ARM_HW, ARM_Z1 + 0.05), 0.07,
              material='gunmetal')
    F.box(s, 'StayLug', (MH + 0.1, 0, Z_TOP - 0.1), (0.3, MH * 2 + 0.2, 0.3), material='gunmetal', bevel=0.02)
    # service walkway on the lower chords (dark grating) — reads as depth from above
    F.box(s, 'Walk', ((ARM_X0 + ARM_X1) / 2 - 0.3, 0, ARM_Z0 + 0.08), (ARM_X1 - ARM_X0 - 0.8, ARM_HW * 2 - 0.2, 0.06),
          material='dark', bevel=0.0)
    # cable tray along the boom
    F.cylinder(s, 'BoomConduit', (ARM_X0, -ARM_HW + 0.12, ARM_Z1 - 0.18), (ARM_X1 - 0.3, -ARM_HW + 0.12, ARM_Z1 - 0.18),
               0.06, material='gunmetal', segments=8)

    # counterweight on the back of the mast, level with the boom (balances the cantilever)
    F.box(s, 'Counterweight', (-MH - 0.42, 0, (ARM_Z0 + ARM_Z1) / 2), (0.7, 1.5, 1.5), material='paint2', bevel=0.05)
    for k in range(-2, 3):
        F.band(s, 'Counterweight', (-MH - 0.42, k * 0.42, (ARM_Z0 + ARM_Z1) / 2), (0, 0.7071, 0.7071), 0.16, 'hazard')
    F.box(s, 'CwStrap', (-MH - 0.1, 0, (ARM_Z0 + ARM_Z1) / 2), (0.14, MH * 2 + 0.3, 0.5), material='gunmetal', bevel=0.02)
    F.light(s, 'CwLamp', (-MH - 0.78, 0, ARM_Z1 + 0.2), 'glow_red', size=0.14)
    # junction box where the boom meets the mast
    F.box(s, 'JBox', (MH + 0.35, 0, ARM_Z1 + 0.35), (0.6, 0.8, 0.5), material='paint', bevel=0.04)
    F.panel(s, 'JBox', (MH + 0.35, 0), (0.4, 0.5), 'stripe', inset=0.03, depth=-0.02)

    # --- signal lamps along the boom -------------------------------------------------------------
    for i, x in enumerate((2.3, 3.9, 5.5)):
        lamp_pod(s, f'Pod{i}', x, 'glow_amber' if i % 2 == 0 else 'glow_cyan')

    # --- lane lamp head at the tip -----------------------------------------------------------------
    HX = ARM_X1 + 0.3
    F.box(s, 'LampHousing', (HX, 0, (ARM_Z0 + ARM_Z1) / 2), (1.1, 1.6, 1.6), material='paint', bevel=0.08)
    F.band(s, 'LampHousing', (HX - 0.3, 0, 0), (1, 0, 0), 0.18, 'stripe', inset=0.02, depth=-0.02)
    F.box(s, 'LampBezel', (HX + 0.52, 0, (ARM_Z0 + ARM_Z1) / 2), (0.1, 1.3, 1.3), material='dark', bevel=0.02)
    F.cylinder(s, 'LampLens', (HX + 0.55, 0, (ARM_Z0 + ARM_Z1) / 2), (HX + 0.62, 0, (ARM_Z0 + ARM_Z1) / 2), 0.55,
               material='glow_cyan', segments=24, bevel=0.0)
    F.ring(s, 'LampRing', (HX + 0.6, 0, (ARM_Z0 + ARM_Z1) / 2), 0.58, 0.06, axis=(1, 0, 0), material='gunmetal',
           segments=24, sides=6)
    for sy in (-1, 1):
        F.box(s, f'LampSide{sy}', (HX + 0.05, sy * 0.81, (ARM_Z0 + ARM_Z1) / 2), (0.6, 0.05, 0.9),
              material='glow_cyan', bevel=0.0)
    F.beacon(s, 'TipBeacon', (HX - 0.1, 0, ARM_Z1 + 0.3), finish='glow_amber', size=0.42)
    F.box(s, 'LampUnder', (HX, 0, ARM_Z0 - 0.02), (0.7, 1.0, 0.05), material='glow_cyan', bevel=0.0)
    s.detail = 2
    F.vent(s, 'LampVent', (HX - 0.2, 0.45, ARM_Z1 + 0.3), (0.4, 0.4, 0.06), slats=3, axis='y')
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
