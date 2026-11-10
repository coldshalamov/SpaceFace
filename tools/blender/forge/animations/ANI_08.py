"""ANI-08 — wasp hull rupture: residual torn-edge motion on spawned wreck fragments.

Physics owns all fragment separation, translation, rotation and momentum — the bank owns only
the torn-edge children. Each fragment's 'rupture' clip fires once on spawn (hull:fractured →
wreck:rupture): torn skin flaps kick a further ~14 degrees open and settle back to their authored
ajar pose, and the aft fragment's mast whip twangs twice before dying out. Kill and bodies stay
immediate — no anticipation.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

D2R = math.pi / 180

EVENTS = {
    'wreck:rupture': 'rupture',
}

# Flap peel: fast kick (~0.14 s), elastic check, long settle into the authored ajar pose.
FLAP_POP = 14 * D2R
FLAP_KEYS = [(0.0, 0.0), (0.14, 1.0), (0.34, 0.5), (0.62, 0.7), (1.0, 0.35), (1.6, 0.0)]
# Mast whip: sharp twang, one counter-swing, damped ring-down to rest.
MAST_SWING = 9 * D2R
MAST_KEYS = [(0.0, 0.0), (0.1, 1.0), (0.32, -0.5), (0.62, 0.24), (0.95, -0.1), (1.6, 0.0)]


def _rot_key(clip, rig_id, t, eul):
    clip.key(rig_id, t, rot=eul)


def author_bow(bank):
    rupture = bank.clip('rupture', 1.6, loop=False, end_mode='rest')
    for t, f in FLAP_KEYS:
        # flap A (+y, top): peel = free edge pitches up-out, hinge axis ~+Y
        _rot_key(rupture, 'frag_flap_a', t, Euler((0, -FLAP_POP * f, 0)))
        # flap B (−y, bottom): mirrored peel
        _rot_key(rupture, 'frag_flap_b', t, Euler((0, FLAP_POP * f, 0)))


def author_aft(bank):
    rupture = bank.clip('rupture', 1.6, loop=False, end_mode='rest')
    for t, f in FLAP_KEYS:
        _rot_key(rupture, 'frag_flap', t, Euler((0, FLAP_POP * f, 0)))
    for t, f in MAST_KEYS:
        # whip rocks about its foot in the x-axis (fore-aft lean)
        _rot_key(rupture, 'frag_mast', t, Euler((MAST_SWING * f, 0, 0)))


def build(ship, rig_id, source_asset_id, bank=None):
    """Author the fragment's rupture clip against its already-registered motion groups.
    Call after the builder's s.motion_group(...) registrations, before export_ship."""
    if bank is None:
        bank = motion_bank.MotionBank(ship, rig_id, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    if rig_id == 'wasp_frag_bow':
        author_bow(bank)
    elif rig_id == 'wasp_frag_aft':
        author_aft(bank)
    else:
        raise ValueError(f'ANI-08: unknown fragment rig {rig_id!r}')
    return bank
