"""Maintenance gantry (place_maintenance_gantry) — Forge rebuild.

Idea: "the service arch". A long portal gantry a small hull slides under: two rail tracks on
leg pairs run the length, a travelling trolley with a hoist hook mid-span, fold-down work
platforms on the inner faces, festoon cable loop along one track, amber guide lamps marking
the berth (SOCKET_Berth under the arch). Plan reads: two long rails, repeated portal ribs.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_maintenance_gantry'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- portal frames: leg pairs + top crossbeam, repeated along Y ---------------------------------------
    for k in range(5):
        y = -8.4 + k * 4.2
        for e in (-1, 1):
            F.box(s, f'Leg{k}{e:+d}', (e * 1.7, y, 4.4), (0.5, 0.7, 8.6),
                  material='paint2', bevel=0.05)
            F.box(s, f'LegFoot{k}{e:+d}', (e * 1.7, y, 0.4), (1.2, 1.4, 0.8),
                  material='paint2', bevel=0.04)
            F.box(s, f'LegPad{k}{e:+d}', (e * 1.7, y, 0.9), (1.0, 1.1, 0.2),
                  material='hazard', bevel=0.0)
        F.box(s, f'Beam{k}', (0, y, 8.9), (4.0, 0.7, 0.9), material='paint2', bevel=0.05)
    # longitudinal rail tracks on the leg tops
    for e in (-1, 1):
        F.box(s, f'Rail{e:+d}', (e * 1.7, 0, 9.5), (0.8, 19.4, 0.5), material='paint2',
              bevel=0.03)
        F.box(s, f'RailLip{e:+d}', (e * 1.7, 0, 9.85), (0.9, 19.4, 0.2), material='hazard',
              bevel=0.0)
        # inner work platform half-way up
        for k in range(2):
            py = -4.2 + k * 8.4
            F.box(s, f'Plat{e:+d}{k}', (e * 1.35, py, 5.6), (0.6, 2.6, 0.25),
                  material='dark', bevel=0.02)
            F.light(s, f'PlatLamp{e:+d}{k}', (e * 1.35, py + 1.2, 5.9), 'glow_warm',
                    size=0.28)

    # --- travelling trolley + hoist under the crown ---------------------------------------------------------
    F.box(s, 'Trolley', (0, 1.0, 9.9), (3.6, 2.4, 0.9), material='paint2', bevel=0.08)
    for e in (-1, 1):
        F.cylinder(s, f'TrolleyWheel{e:+d}', (e * 1.7, 0.2, 9.7), (e * 1.7, 1.8, 9.7),
                   0.3, material='gunmetal', segments=10)
    F.cylinder(s, 'HoistCable', (0, 1.0, 9.5), (0, 1.0, 6.4), 0.09, material='dark',
               segments=8)
    F.box(s, 'Hook', (0, 1.0, 6.1), (0.8, 0.8, 0.7), material='gunmetal', bevel=0.06)

    # --- festoon cable loop along the +X track --------------------------------------------------------------
    s.detail = 1
    F.beams(s, 'Festoon', [((1.95, -8.4, 9.2), (1.95, 1.0, 8.6)),
                           ((1.95, 1.0, 8.6), (1.95, 9.0, 9.2))], 0.08, material='dark')
    s.detail = 0

    # --- berth guide lamps marking where the hull parks ------------------------------------------------------
    for k, y in enumerate((-6.0, 0.0, 6.0)):
        F.light(s, f'BerthLamp{k}', (0, y, 1.2), 'glow_amber', size=0.35)
    F.box(s, 'BerthPad', (0, 0, 0.15), (3.0, 16.0, 0.3), material='dark', bevel=0.0)
    F.beacon(s, 'GantryStrobe', (0, -9.0, 10.2), finish='glow_red', size=0.4)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
