"""Quiessence freighter B — the container-spine hauler of the becalmed ring.
Brand-new place (new_place): a Quiessence formation freighter.

Variant of helios_span (tools/blender/forge/variant.py): rounded cab, lit spine carrying six
ribbed containers in clamp frames, three-bell drive — rebuilt becalmed: charcoal-violet
hulls, dead running lights, cold engines, but every bunk window warm and one faint violet
beacon answering the buoy.
Plan read: a long dark truck — cab, twin container rows, lit spine, cold drive block.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import quiessence_freighter_kit as Q  # noqa: E402
from variant import main  # noqa: E402

SHIP_ID = 'place_quiessence_freighter_b'


def extra(s):
    s.emit_scale = 4.0
    # Warm bunks: the crew rides in the clamp-lock blocks — a lit row on each lock spine.
    Q.bunk_windows(s, -6.6, 6.6, 8, y=0.66, z=1.55, tag='Lock', z_top=3.05)
    # one faint violet beacon over the cab roof
    Q.violet_beacon(s, (10.6, 0.0, 2.5))
    Q.place_sockets(s, focus=(0.0, 0.0, 1.5))


if __name__ == '__main__':
    main('helios_span', SHIP_ID, Q.COLORS, extra)
