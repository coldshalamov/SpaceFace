"""Standard cargo pod — the freight the Massline grabs. Forge rebuild.

A proper intermodal space container: ribbed teal walls, charcoal corner castings and frame rails,
a hazard-banded grapple lug on top (the clamp socket), end doors with locking bars, a status lamp.
Sockets (SOCKET_Clamp_Dorsal, SOCKET_Hoist_Center) are copied from the live file on export.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_cargo_pod_standard'
COLORS = {
    'paint': '#1c5552',       # freight teal
    'paint2': '#262a2f',      # charcoal frame
    'stripe': '#9c7a2a',
    'hazard': '#b88a22',
}

L, W, H = 6.0, 3.3, 3.1


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    # Body with a fine ribbed skin: raised ribs along the long walls and roof.
    F.box(s, 'Body', (0, 0, 0), (L - 0.3, W - 0.2, H - 0.2), material='paint', bevel=0.04)
    for i in range(9):
        x = -L / 2 + 0.55 + i * (L - 1.1) / 8
        F.box(s, f'Rib{i}', (x, 0, 0), (0.12, W - 0.08, H - 0.08), material='paint', bevel=0.015)
    F.band(s, 'Body', (1.7, 0, 0), (1, 0, 0), 0.35, 'hazard')
    F.band(s, 'Body', (-1.7, 0, 0), (1, 0, 0), 0.35, 'hazard')
    # Frame: corner posts and top/bottom rails with cast corner blocks.
    for sx in (-1, 1):
        for sy in (-1, 1):
            F.box(s, f'Post{sx}{sy}', (sx * (L / 2 - 0.12), sy * (W / 2 - 0.12), 0), (0.26, 0.26, H), material='paint2',
                  bevel=0.02)
            for sz in (-1, 1):
                F.box(s, f'Corner{sx}{sy}{sz}', (sx * (L / 2 - 0.12), sy * (W / 2 - 0.12), sz * (H / 2 - 0.12)),
                      (0.34, 0.34, 0.3), material='gunmetal', bevel=0.03)
        for sz in (-1, 1):
            F.box(s, f'EndRail{sx}{sz}', (sx * (L / 2 - 0.12), 0, sz * (H / 2 - 0.12)), (0.24, W, 0.24),
                  material='paint2', bevel=0.02)
    for sy in (-1, 1):
        for sz in (-1, 1):
            F.box(s, f'SideRail{sy}{sz}', (0, sy * (W / 2 - 0.12), sz * (H / 2 - 0.12)), (L, 0.24, 0.24),
                  material='paint2', bevel=0.02)
    # End doors with locking bars. The -X end stays a sealed slab; the +X end carries
    # the ANI-11 worked rig — two hinged leaves, two fold-down retainers, a cavity.
    for sx in (-1, 1):
        if sx < 0:
            F.box(s, f'Door{sx}', (sx * (L / 2 - 0.05), 0, 0), (0.08, W - 0.6, H - 0.6), material='paint2', bevel=0.01)
        for y in (-0.7, -0.25, 0.25, 0.7):
            F.cylinder(s, f'LockBar{sx}{y}', (sx * (L / 2 + 0.02), y, -H / 2 + 0.4), (sx * (L / 2 + 0.02), y, H / 2 - 0.4),
                       0.04, material='gunmetal', segments=8, bevel=0.0)
            # Cam lug on the bar's outboard face: without it the bar's 8-segment profile is
            # rotationally symmetric and the ANI-11 quarter-turn reads as nothing. Hazard
            # paint makes the sweep readable even in a short glance.
            F.box(s, f'LockBarLug{sx}{y}', (sx * (L / 2 + 0.1), y, 0.45), (0.16, 0.1, 0.18),
                  material='hazard', bevel=0.015)
            # Guide brackets on the end rails: the retracted bolt (x up to ~3.12 on +X)
            # slides inside them, so a worked bar never reads as floating hardware.
            for sz in (-1, 1):
                F.box(s, f'LockGuide{sx}{y}{sz}', (sx * (L / 2 + 0.1), y, sz * (H / 2 - 0.28)),
                      (0.28, 0.14, 0.2), material='paint2', bevel=0.015)
    # +X doorway: shallow cargo cavity behind the leaves (reads once they open), two
    # door leaves hung on the outer end-posts, and two retainers that fold down.
    F.box(s, 'Cavity', (L / 2 - 0.5, 0, 0), (0.72, W - 0.72, H - 0.72), material='paint2', bevel=0.01)
    for sy in (-1, 1):
        leaf_name = 'DoorLeafPort' if sy < 0 else 'DoorLeafStar'
        # leaf covers half the opening; its outer edge meets the end-post hinge line
        F.box(s, leaf_name, (L / 2 - 0.02, sy * (W / 4 - 0.02), 0),
              (0.08, W / 2 - 0.3, H - 0.66), material='paint2', bevel=0.015)
        # seam-side hazard strip so each leaf reads as worked hardware
        F.box(s, f'{leaf_name}Strip', (L / 2 + 0.02, sy * 0.28, 0), (0.05, 0.12, H - 0.8),
              material='hazard', bevel=0.005)
        ret_name = 'RetainerPort' if sy < 0 else 'RetainerStar'
        # retainer fills the lower part of the doorway behind the leaves; hinges at
        # the bottom seam so it folds out into a shallow ramp
        F.box(s, ret_name, (L / 2 - 0.06, sy * 0.82, -H / 2 + 0.55),
              (0.06, W / 2 - 0.34, 0.8), material='paint', bevel=0.012)
    # Grapple lug on the roof (the Massline clamp point) and a status lamp.
    F.box(s, 'LugBase', (0, 0, H / 2 + 0.08), (1.4, 1.1, 0.16), material='paint2', bevel=0.02)
    F.ring(s, 'Lug', (0, 0, H / 2 + 0.42), 0.34, 0.09, axis=(0, 1, 0), material='hazard', segments=24, sides=8)
    F.light(s, 'Status', (L / 2 - 0.45, W / 2 - 0.45, H / 2 + 0.05), 'glow_amber', size=0.14)
    F.light(s, 'StatusB', (-L / 2 + 0.45, -W / 2 + 0.45, H / 2 + 0.05), 'glow_green', size=0.12)
    return s


if __name__ == '__main__':
    import forge_export as E
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
    import ANI_11  # noqa: E402
    import motion_bank  # noqa: E402
    ship = build().finish()
    _o = {o.name: o for o in ship.objects}
    ship.ani11_bank = ANI_11.build(ship, {
        'locks': [[_o[f'LockBar1{y}'], _o[f'LockBarLug1{y}']]
                  for y in (-0.7, -0.25, 0.25, 0.7)],
        'leaf_port': [_o['DoorLeafPort'], _o['DoorLeafPortStrip']],
        'leaf_star': [_o['DoorLeafStar'], _o['DoorLeafStarStrip']],
        'retain_port': [_o['RetainerPort']],
        'retain_star': [_o['RetainerStar']],
    }, source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani11_bank.bake(
            [p for p, _t in written],
            out_path=os.path.join(motion_bank.MOTIONS_DIR, 'cargo-pod-standard.motion.json'))
