"""Quiessence freighter A — the tank-cluster hauler of the becalmed ring.
Brand-new place (new_place): a Quiessence formation freighter.

Variant of volatiles_tanker (tools/blender/forge/variant.py): four pressure tanks in a truss
cage, manifold spine, graphite cab, heavy drive block — rebuilt becalmed: charcoal-violet
hulls, dead running lights, cold engines, but every bunk window warm and one faint violet
beacon answering the buoy.
Plan read: a long ladder of dark tanks with warm lit rows on the cage frames.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import quiessence_freighter_kit as Q  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'place_quiessence_freighter_a'


def extra(s):
    s.emit_scale = 4.0
    # Warm bunks: the crew sleeps in the cage frames — a lit row along each top longeron.
    Q.bunk_windows(s, -9.0, 9.0, 10, y=2.8, z=2.92, tag='Cage', z_top=3.35)
    # one faint violet beacon over the cab roof
    Q.violet_beacon(s, (13.4, 0.0, 2.72))
    Q.place_sockets(s, focus=(0.0, 0.0, 2.5))


if __name__ == '__main__':
    main('volatiles_tanker', SHIP_ID, Q.COLORS, extra)
