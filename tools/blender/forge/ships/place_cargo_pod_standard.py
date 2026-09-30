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
    s.emit_scale = 4.0
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
    # End doors with locking bars.
    for sx in (-1, 1):
        F.box(s, f'Door{sx}', (sx * (L / 2 - 0.05), 0, 0), (0.08, W - 0.6, H - 0.6), material='paint2', bevel=0.01)
        for y in (-0.7, -0.25, 0.25, 0.7):
            F.cylinder(s, f'LockBar{sx}{y}', (sx * (L / 2 + 0.02), y, -H / 2 + 0.4), (sx * (L / 2 + 0.02), y, H / 2 - 0.4),
                       0.04, material='gunmetal', segments=8, bevel=0.0)
    # Grapple lug on the roof (the Massline clamp point) and a status lamp.
    F.box(s, 'LugBase', (0, 0, H / 2 + 0.08), (1.4, 1.1, 0.16), material='paint2', bevel=0.02)
    F.ring(s, 'Lug', (0, 0, H / 2 + 0.42), 0.34, 0.09, axis=(0, 1, 0), material='hazard', segments=24, sides=8)
    F.light(s, 'Status', (L / 2 - 0.45, W / 2 - 0.45, H / 2 + 0.05), 'glow_amber', size=0.14)
    F.light(s, 'StatusB', (-L / 2 + 0.45, -W / 2 + 0.45, H / 2 + 0.05), 'glow_green', size=0.12)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
