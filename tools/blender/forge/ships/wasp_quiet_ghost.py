"""The Quiet's ghost: ink-violet lacquer with ultraviolet strip lights. Same hull as wasp.py
(tools/blender/forge/variant.py). The sniper_lance role in the enemy table."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'wasp_quiet_ghost'
COLORS = {'paint': '#1a1430', 'paint2': '#2c2250', 'dark': '#0b0912', 'stripe': '#5d4b94', 'hazard': '#5d4b94',
          'glow_cyan': '#a58bff'}

if __name__ == '__main__':
    main('wasp', SHIP_ID, COLORS)
