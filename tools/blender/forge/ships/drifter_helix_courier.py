"""Row 514 Helix white-glass seal kit: the Directorate courier Drifter in pristine pale
steel-blue — every replacement plate repainted to match, because Helix flies TOO perfectly
(02 §9). Same hull as drifter.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'drifter_helix_courier'
COLORS = {
    'paint': '#3f4c63',            # pale directorate blue-grey (faction #8B9CB8 lifted by the key)
    'paint2': '#57677f',
    'stripe': '#7d93b4',
    'hazard': '#c8d4e4',           # the seal-mark reads white-glass, not warning yellow
    'dark': '#141820',
    'paint.patch': '#57677f',      # Helix repaint is total — no mismatched field patches
    'paint.primer': '#4a586e',
    'glow_cyan.copper': '#cfe4ff', # the livery rings go cold white-blue
}

if __name__ == '__main__':
    main('drifter', SHIP_ID, COLORS)
