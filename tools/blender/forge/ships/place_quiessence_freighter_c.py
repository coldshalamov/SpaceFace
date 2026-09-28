"""Quiessence freighter C — the bulk hopper of the becalmed ring.
Brand-new place (new_place): a Quiessence formation freighter.

Variant of ore_barge (tools/blender/forge/variant.py): a long low barge with four open
hoppers, deck gantry, aft bridge tower and a four-bell drive — rebuilt becalmed:
charcoal-violet hulls, dead running lights, cold engines, ore heaps gone dark, but every
bunk window warm and one faint violet beacon answering the buoy.
Plan read: a long dark plank with four darker wells and a lit aft tower.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import quiessence_freighter_kit as Q  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'place_quiessence_freighter_c'


def extra(s):
    # Warm bunks: a lit row along each hull flank — the crew quarters under the deck edge.
    Q.bunk_windows(s, -12.0, 13.0, 14, y=3.8, z=0.55, tag='Flank', z_top=1.5)
    # one faint violet beacon on the mast head
    Q.violet_beacon(s, (-15.3, 0.0, 6.6))
    Q.place_sockets(s, focus=(0.0, 0.0, 2.0))


if __name__ == '__main__':
    main('ore_barge', SHIP_ID, Q.COLORS, extra)
