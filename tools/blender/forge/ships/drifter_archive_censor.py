"""Row 514 Archive indigo scriptorium kit on the reading-courier Drifter — the hull the
Archive actually fields live in Pallas Drift (factionPresence). Same scriptorium palette
as ranger_archive_censor.py. Variant of drifter.py (tools/blender/forge/variant.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'drifter_archive_censor'
COLORS = {
    'paint': '#1e1830',            # indigo scriptorium (faction #3A2A5A lifted by the key)
    'paint2': '#2c2344',
    'stripe': '#4a3a70',
    'hazard': '#5a4a88',
    'dark': '#0e0c14',
    'paint.patch': '#2c2344',      # even field repairs are rebound in Archive cloth
    'paint.primer': '#231c38',
    'glow_cyan.copper': '#9a8ae0', # the livery rings turn to reading-lamp violet
}

if __name__ == '__main__':
    main('drifter', SHIP_ID, COLORS)
