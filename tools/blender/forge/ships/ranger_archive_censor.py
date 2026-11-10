"""Row 514 Archive indigo scriptorium kit: the censor frigate Ranger in deep violet-black
with muted violet lamps — the hull that arrives to unsee things (02 §12). Same hull as
ranger.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'ranger_archive_censor'
COLORS = {
    'paint': '#1e1830',            # indigo scriptorium (faction #3A2A5A lifted by the key)
    'paint2': '#2c2344',
    'stripe': '#4a3a70',
    'hazard': '#5a4a88',           # Archive marks are catalogued violet, not warning yellow
    'dark': '#0e0c14',
    'glow_amber.beacon': '#8a7ac8',# beacons turn to reading-lamp violet
    'glow_cyan': '#9a8ae0',
    'glow_warm': '#8a78c0',
}

if __name__ == '__main__':
    main('ranger', SHIP_ID, COLORS)
