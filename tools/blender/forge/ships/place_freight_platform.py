"""Freight platform (place_freight_platform) — Forge rebuild.

Idea: "the loading apron". A wide open deck on stub columns — cargo rack rows parked on the
apron, a crew cab at one corner, floodlight masts at the ends, a hazard-striped lip along the
approach edge (-Y side where the apron socket lives). Plan reads: broad pale apron, dark rack
rows, lamp posts — the freight pad.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_29  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_freight_platform'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- apron deck on stub columns --------------------------------------------------------------
    F.box(s, 'Apron', (0, 0, 4.4), (24.0, 12.0, 1.0), material='paint2', bevel=0.08)
    F.box(s, 'ApronUnder', (0, 0, 3.6), (23.0, 11.0, 0.8), material='paint2', bevel=0.05)
    # dark grating lanes between the rack rows — the apron reads as grate + racks, not a slab
    s.detail = 1
    for k, gy in enumerate((-4.4, -1.0, 2.2, 4.8)):
        F.box(s, f'Grate{k}', (0, gy, 4.95), (21.0, 1.6, 0.16), material='dark', bevel=0.0)
    s.detail = 0
    for k in range(6):
        for e in (-1, 1):
            F.cylinder(s, f'Column{k}{e:+d}', (-10.0 + k * 4.0, e * 4.8, 0.2),
                       (-10.0 + k * 4.0, e * 4.8, 3.6), 0.55, material='paint2',
                       segments=10)
    # hazard-striped approach lip on the -Y edge
    for k in range(6):
        F.box(s, f'Lip{k}', (-10.0 + k * 4.0, -6.1, 4.9), (3.6, 0.5, 0.5),
              material='hazard' if k % 2 == 0 else 'dark', bevel=0.0)
    # guide lamps along the approach edge
    for k in range(4):
        F.light(s, f'EdgeLamp{k}', (-9.0 + k * 6.0, -6.2, 5.3), 'glow_green', size=0.3)

    # --- cargo rack rows parked on the apron ------------------------------------------------------
    for row, ry in enumerate((-2.6, 0.6, 3.6)):
        n = 5 if row != 1 else 4
        for k in range(n):
            rx = -8.0 + k * 4.4 + (2.0 if row == 1 else 0.0)
            F.box(s, f'Rack{row}_{k}', (rx, ry, 5.6), (3.6, 2.6, 1.8),
                  material='paint.aged' if (k + row) % 3 else 'paint2', bevel=0.08)
            F.box(s, f'RackBand{row}_{k}', (rx, ry, 6.1), (3.7, 0.5, 0.5),
                  material='hazard' if (k + row) % 2 else 'stripe', bevel=0.0)

    # --- crew cab at the +X/-Y corner --------------------------------------------------------------
    F.box(s, 'Cab', (10.4, -4.6, 6.2), (3.2, 2.8, 3.0), material='paint', bevel=0.15,
          taper=0.9)
    s.detail = 1
    for i in range(2):
        F.box(s, f'CabWin{i}', (9.8 + i * 1.2, -6.05, 6.8), (0.9, 0.14, 0.7),
              material='glow_warm', bevel=0.0)
    s.detail = 0
    F.beacon(s, 'CabBeacon', (10.4, -4.6, 8.0), finish='glow_amber', size=0.4)

    # --- floodlight masts at both ends -------------------------------------------------------------
    for k, mx in enumerate((-11.0, 11.0)):
        F.cylinder(s, f'Mast{k}', (mx, 5.2, 4.8), (mx, 5.2, 9.6), 0.3, material='paint2',
                   segments=10)
        F.work_lamp(s, f'Flood{k}', (mx, 4.8, 9.8), aim=(0.0 if k else -0.3, -0.5, -0.8),
                    size=0.55, lens='glow_warm')
        F.beams(s, f'MastFoot{k}', [((mx, 5.2, 6.0), (mx + (1.6 if k == 0 else -1.6), 5.8,
                                    4.9))], 0.25, material='paint2')

    # ANI-29: traveling bridge crane over the rack lanes — rails are static; the bridge,
    # carriage and grab block ride motion pivots.
    F.box(s, 'CraneRail', (0.0, -4.2, 6.0), (21.0, 0.5, 0.4), material='dark', bevel=0.02)
    F.box(s, 'CraneRail2', (0.0, 4.2, 6.0), (21.0, 0.5, 0.4), material='dark', bevel=0.02)
    beam = F.box(s, 'CraneBeam', (0.0, 0.0, 7.5), (1.2, 9.2, 0.8), material='hazard', bevel=0.05)
    truck_l = F.box(s, 'CraneTruckL', (0.0, -4.2, 7.1), (1.6, 0.9, 1.0), material='gunmetal', bevel=0.04)
    truck_r = F.box(s, 'CraneTruckR', (0.0, 4.2, 7.1), (1.6, 0.9, 1.0), material='gunmetal', bevel=0.04)
    carriage = F.box(s, 'CraneCarriage', (0.0, -2.0, 7.0), (1.1, 1.3, 0.6), material='gunmetal', bevel=0.03)
    cable = F.cylinder(s, 'HookCable', (0.0, -2.0, 6.9), (0.0, -2.0, 5.7), 0.07, material='dark', segments=8)
    block = F.box(s, 'HookBlock', (0.0, -2.0, 5.5), (0.5, 0.5, 0.4), material='hazard', bevel=0.04, taper=0.7)
    s.ani29_bank = ANI_29.build(s, {
        'bridge': [beam, truck_l, truck_r], 'carriage': carriage, 'hook': [cable, block],
    }, source_asset_id=E.fleet_spec(s.id)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani29_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_29.motion_bank.MOTIONS_DIR,
                                                   'freight-platform.motion.json'))

