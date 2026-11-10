"""Concord (SCN) interdictor: navy lacquer, pale pursuit stripe, blue wing-edge lamps. Same hull as hornet.py
(tools/blender/forge/variant.py). Patrol Interceptor and Customs Cutter fly the Hornet frame in the enemy
table; the Concord paint is what makes them the law instead of a stolen player ship."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from variant import main  # noqa: E402

SHIP_ID = 'hornet_scn_interdictor'
COLORS = {'paint': '#22407a', 'paint2': '#1a1f2b', 'stripe': '#b9c6dc', 'hazard': '#b9c6dc',
          'glow_cyan.jacket': '#5aa8ff'}  # Concord blue, lit: the wing leading edges

if __name__ == '__main__':
    main('hornet', SHIP_ID, COLORS)
