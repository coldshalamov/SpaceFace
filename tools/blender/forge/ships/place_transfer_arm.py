"""Transfer arm (place_transfer_arm) — Forge rebuild.

Idea: "the loading crane". A slew-ring pedestal carries a counterweighted lattice boom tipped
with a grapple head (SOCKET_Grapple station at the raised tip). Operator cab on the turntable
with a lit window, hazard slew band, cable hoist running boom-to-grapple, amber work lamp at
the wrist. Plan reads: base + long boom — a crane, not a slab.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_transfer_arm'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- pedestal + slew ring -------------------------------------------------------------------------
    F.box(s, 'Base', (-2.0, 0, 0.9), (5.0, 4.4, 1.8), material='paint2', bevel=0.15)
    for k in range(4):
        a = math.radians(45 + k * 90)
        F.box(s, f'BaseFoot{k}', (-2.0 + math.cos(a) * 2.6, math.sin(a) * 2.4, 0.35),
              (1.4, 1.2, 0.7), material='paint.aged', bevel=0.05)
    F.cylinder(s, 'Pedestal', (-2.0, 0, 1.8), (-2.0, 0, 3.6), 1.7, material='paint',
               segments=20)
    F.cylinder(s, 'SlewBand', (-2.0, 0, 3.4), (-2.0, 0, 4.2), 1.85, material='hazard',
               segments=20)

    # --- turntable: cab + counterweight + machinery house -----------------------------------------------
    F.box(s, 'Turntable', (-2.0, 0, 4.6), (4.6, 3.6, 0.8), material='paint2', bevel=0.06)
    F.box(s, 'Counterweight', (-4.4, 0, 5.6), (2.0, 3.0, 2.0), material='paint.aged',
          bevel=0.1)
    F.box(s, 'CwHaz', (-5.4, 0, 5.6), (0.3, 3.1, 1.2), material='hazard', bevel=0.0)
    F.box(s, 'Cab', (-0.6, -1.3, 5.9), (1.8, 1.6, 1.8), material='paint', bevel=0.15)
    s.detail = 1
    F.box(s, 'CabWin', (-0.6, -2.15, 6.1), (1.2, 0.12, 0.8), material='glow_warm',
          bevel=0.0)
    s.detail = 0
    F.box(s, 'MachHouse', (-1.6, 1.3, 5.7), (2.6, 1.8, 1.6), material='paint2', bevel=0.1)
    F.cylinder(s, 'HoistDrum', (-1.6, 1.3, 6.6), (-1.6, 0.6, 6.6), 0.4,
               material='gunmetal', segments=12)

    # --- the boom: lattice truss rising to the grapple tip ------------------------------------------------
    F.truss(s, 'Boom', (-0.4, 0, 5.4), (14.0, 0, 8.6), 2.0, 7, material='paint',
            chord=0.42, web=0.24)
    F.truss(s, 'BoomFly', (13.0, 0, 8.4), (16.6, 0, 9.4), 1.2, 2, material='paint2',
            chord=0.3, web=0.18)
    # hoist cable drum -> boom tip
    s.detail = 1
    F.beams(s, 'HoistCable', [((-1.6, 0.6, 6.8), (15.4, 0, 9.2))], 0.1, material='dark')
    s.detail = 0

    # --- grapple head at the tip (SOCKET_Grapple station) ---------------------------------------------------
    F.box(s, 'Wrist', (16.4, 0, 9.0), (1.6, 1.6, 1.6), material='paint2', bevel=0.1)
    F.cylinder(s, 'DropCable', (16.4, 0, 8.8), (16.4, 0, 7.0), 0.12, material='dark',
               segments=8)
    F.box(s, 'Grapple', (16.4, 0, 6.6), (1.8, 1.8, 0.9), material='hazard', bevel=0.08)
    for e in (-1, 1):
        F.beams(s, f'Claw{e:+d}', [((16.4 + e * 0.7, 0, 6.4), (16.4 + e * 1.1, 0, 5.2))],
                0.3, material='gunmetal')
        F.beams(s, f'ClawY{e:+d}', [((16.4, e * 0.7, 6.4), (16.4, e * 1.1, 5.2))],
                0.3, material='gunmetal')
    F.work_lamp(s, 'WristLamp', (15.4, -0.9, 8.6), aim=(0.3, -0.2, -0.9), size=0.45,
                lens='glow_amber')
    F.beacon(s, 'BoomTip', (16.8, 0, 9.9), finish='glow_red', size=0.35)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
