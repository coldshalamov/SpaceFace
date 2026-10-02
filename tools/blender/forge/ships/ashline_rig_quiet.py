"""The Quiet's armed smuggler: the Ashline rig under ink-indigo lacquer with violet trim and ultraviolet lamps.
Same hull as ashline_rig.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'ashline_rig_quiet'
COLORS = {'paint': '#1d1736', 'paint2': '#0e0c18', 'bare': '#9a96b8', 'stripe': '#6b59b4', 'hazard': '#6b59b4',
          'glow_drive': '#b69cff', 'glow_cyan.sodium': '#a58bff'}

if __name__ == '__main__':
    main('ashline_rig', SHIP_ID, COLORS)
