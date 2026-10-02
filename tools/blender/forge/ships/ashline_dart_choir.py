"""Ascendant Choir zealot: the Ashline dart blade under plum lacquer, bone ridge and edge, hot magenta lamp.
Same hull as ashline_dart.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'ashline_dart_choir'
COLORS = {'paint': '#3a1740', 'paint2': '#170f1c', 'bare': '#cdb9cc', 'stripe': '#b99ab4', 'hazard': '#9c4a92',
          'glow_drive': '#ff8ae8', 'glow_cyan.sodium': '#ff4fd6'}

if __name__ == '__main__':
    main('ashline_dart', SHIP_ID, COLORS)
