"""Reach raider hauler: dirty grey with crimson bands and boxes. Same hull as helios_span.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'helios_span_reach'
COLORS = {'paint': '#6e6a62', 'paint2': '#5e1a24', 'stripe': '#5e1a24', 'paint2.box': '#3a1218', 'paint2.b': '#26282c', 'paint2.teal': '#2a2c30', 'hazard': '#c9621c'}

if __name__ == '__main__':
    main('helios_span', SHIP_ID, COLORS)
