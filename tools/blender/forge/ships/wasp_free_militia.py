"""Free militia: sea-green graphite with teal-green strip lights. Same hull as wasp.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'wasp_free_militia'
COLORS = {'paint': '#16262a', 'paint2': '#23393c', 'stripe': '#4e6a60', 'glow_cyan': '#5fe8c8'}

if __name__ == '__main__':
    main('wasp', SHIP_ID, COLORS)
