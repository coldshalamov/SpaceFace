"""Dock interior — GRIT (place_dock_interior_grit) — Forge rebuild (GFX-14).

The patched civilian yard: same hangar shell, rust patches welded over deck and walls,
crate clutter and a parked tug on the open apron, extra strung work lamps.
Sockets + previewMount copied live; LOD0-only export.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import dock_interior_kit as D  # noqa: E402

SHIP_ID = 'place_dock_interior_grit'


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, D.GRIT_COLORS)
    return D.build_hangar(s, 'grit')


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani25_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(D.ANI_25.motion_bank.MOTIONS_DIR,
                                                   'dock-interior-grit.motion.json'))
