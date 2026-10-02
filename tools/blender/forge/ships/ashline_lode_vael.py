"""Vael warden: the Ashline lode ram under deep teal lacquer with pale jade trim and mint lamps.
Same hull as ashline_lode.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'ashline_lode_vael'
COLORS = {'paint': '#0f3d36', 'paint2': '#0e1819', 'bare': '#a9bdb5', 'stripe': '#7fae9b', 'hazard': '#1e9c7a',
          'glow_drive': '#58ffc4', 'glow_cyan.sodium': '#3dffb2'}

if __name__ == '__main__':
    main('ashline_lode', SHIP_ID, COLORS)
