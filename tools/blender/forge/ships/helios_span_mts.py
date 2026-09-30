"""Meridian (MTS) hauler: ivory with gold bands and bronze boxes. Same hull as helios_span.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'helios_span_mts'
COLORS = {'paint2': '#8a5e18', 'stripe': '#8a5e18', 'paint2.box': '#4d3710', 'paint2.teal': '#15413f',
          'glow_cyan.helios': '#ffb43a'}  # gold, lit: cab trim ring + spine runway lines

if __name__ == '__main__':
    main('helios_span', SHIP_ID, COLORS)
