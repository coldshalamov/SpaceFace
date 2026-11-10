"""Meridian (MTS) escort: bronze-black with gold strip lights. Same hull as wasp.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'wasp_mts_escort'
COLORS = {'paint': '#231d14', 'paint2': '#3a2e1a', 'stripe': '#7a6232', 'glow_cyan': '#ffc45a'}

if __name__ == '__main__':
    main('wasp', SHIP_ID, COLORS)
