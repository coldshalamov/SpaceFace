"""Dock interior (place_dock_interior) — Forge rebuild (GFX-14).

The shipworks backdrop: a hangar bay seen from front-left-above — deck with lit landing
pad, gantry crane hugging the back wall, tool racks, bay walls with window galleries and
signal lights. Open toward -x / -y (Blender) so the shipworks camera always sees the hull.
Sockets + previewMount copied live; LOD0-only export (shipPreviewMount draws all prims).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import dock_interior_kit as D  # noqa: E402

SHIP_ID = 'place_dock_interior'


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, D.BASE_COLORS)
    return D.build_hangar(s, 'standard')


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani25_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(D.ANI_25.motion_bank.MOTIONS_DIR,
                                                   'dock-interior.motion.json'))
