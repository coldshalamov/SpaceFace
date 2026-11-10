"""Concord/SCN patrol: navy graphite with blue strip lights. Same hull as wasp.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'wasp_scn_patrol'
COLORS = {'paint': '#141d30', 'paint2': '#1f2c46', 'stripe': '#4a5f86', 'glow_cyan': '#6fa8ff'}

if __name__ == '__main__':
    main('wasp', SHIP_ID, COLORS)
