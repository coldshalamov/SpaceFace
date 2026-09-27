"""DMC hauler: Helios ivory with copper freight bands and boxes. Same hull as helios_span.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'helios_span_dmc'
COLORS = {'paint2': '#7a3f1a', 'stripe': '#7a3f1a', 'paint2.box': '#4a2812', 'paint2.teal': '#5a3a1c'}

if __name__ == '__main__':
    main('helios_span', SHIP_ID, COLORS)
