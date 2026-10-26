"""Row 514 Verge-Layers nacre-lattice kit: the surveyor prism Ranger in grey-lavender
nacre with a pale strut lattice draped over the dorsal hull — measured, not painted
(02 §14, 05 §4). Same hull as ranger.py (tools/blender/forge/variant.py); the lattice
is seated on the real Hull skin via skin.run, so nothing floats."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'ranger_verge_surveyor'
COLORS = {
    'paint': '#464052',            # grey-lavender nacre (faction #B0A8B8 lifted by the key)
    'paint2': '#5a5468',
    'stripe': '#8a8298',
    'hazard': '#b0a8b8',
    'dark': '#181620',
    'glow_amber.beacon': '#cfc4e0',
    'glow_cyan': '#cfc4e0',
    'glow_warm': '#bfb4d4',
    'bare': '#a89eb8',             # the lattice is bright nacre strutwork
}


def extra(ship):
    """The lattice: two diagonal strut runs + their posts seated on the PressureHull's own
    skin — a measured frame, the Verge signature, not a decal."""
    import bpy
    import skin
    bpy.context.view_layer.update()
    for k, (x0, y0, x1, y1) in enumerate(((-8.5, -1.6, -1.0, 1.6), (-8.5, 1.6, -1.0, -1.6),
                                          (-1.0, -1.4, 4.5, 1.4), (-1.0, 1.4, 4.5, -1.4))):
        path = skin.run('Hull', [(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8)
                                 for i in range(9)], 0.06)
        if len(path) > 1:
            F.sweep(ship, f'Lattice{k}', path, 0.07, 0.06, material='bare', bevel=0.01)


if __name__ == '__main__':
    main('ranger', SHIP_ID, COLORS, extra)
