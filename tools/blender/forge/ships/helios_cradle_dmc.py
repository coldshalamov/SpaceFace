"""Drift Miners Collective barge: dark copper plate with bright copper bands, an umber bin and copper strip lights.
Same hull as helios_cradle.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'helios_cradle_dmc'
COLORS = {'paint': '#4b2511', 'paint2': '#20130a', 'stripe': '#e0883a', 'hazard': '#e0883a',
          'glow_amber': '#ff5a14'}  # copper-red, lit: cabin ring + arm lines (and the work lamps)

if __name__ == '__main__':
    main('helios_cradle', SHIP_ID, COLORS)
