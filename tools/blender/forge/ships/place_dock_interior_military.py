"""Dock interior — MILITARY (place_dock_interior_military) — Forge rebuild (GFX-14).

The clean armoured bay: same hangar shell, navy band along the walls, red/white deck lanes,
lit readiness boards by the bay door, honour-guard stanchions flanking the pad.
Sockets + previewMount copied live; LOD0-only export.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import dock_interior_kit as D  # noqa: E402

SHIP_ID = 'place_dock_interior_military'


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, D.MIL_COLORS)
    return D.build_hangar(s, 'military')


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani25_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(D.ANI_25.motion_bank.MOTIONS_DIR,
                                                   'dock-interior-military.motion.json'))
