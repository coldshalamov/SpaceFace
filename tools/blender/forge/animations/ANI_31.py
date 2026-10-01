"""ANI-31 — wasp combat telegraph: winglet bristle / strike snap / flee tuck.

Four pilots share this rig (wasp + free_militia/mts_escort/scn_patrol variants, which
rebuild the same hull through variant.py): the winglets and tail fins flare as one
predator bristle when a wasp winds up an attack run, slam flat while the stinger
guns punch forward as predation engages, and tuck low when the AI turns and burns.

Clips
- wasp_bristle (1.4s, rest): wing tips rise/spread then settle — attack wind-up.
- wasp_predate (1.2s, rest): winglets slam flat + guns thrust forward — strike cue.
- wasp_flee   (1.2s, rest): tips tuck low + guns recoil — disengage body language.

All clips self-recover ('rest'): a telegraph that never converts to engagement
can't leave the rig stuck flared.

Triggers: `ai:telegraph`, `encounter:predationEngaged` (payload.raiderId),
`ai:flee` — all entity-addressed.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'wasp'

FLARE_RAD = 0.24   # bristle: wing tips rise
SLAM_RAD = -0.16   # predation: wings flatten hard
TUCK_RAD = -0.30   # flee: tips fold low
GUN_EXT_M = 0.5
GUN_REC_M = -0.22
# clip.key loc is the absolute local translation: gun travel rides the pod's
# chin-mount home, not the hull origin.
GUN_HOME = (3.2, 0.0, 0.55)
gun_at = lambda dx: (GUN_HOME[0] + dx, GUN_HOME[1], GUN_HOME[2])


def register(ship, parts):
    """parts: {'wingletP': [..], 'wingletS': [..], 'guns': [..]}"""
    ship.motion_group('wasp_winglet_p', pivot=(-8.0, 5.0, 0.2), objects=parts['wingletP'])
    ship.motion_group('wasp_winglet_s', pivot=(-8.0, -5.0, 0.2), objects=parts['wingletS'])
    ship.motion_group('wasp_guns', pivot=(3.2, 0.0, 0.55), objects=parts['guns'])


def _wing_keys(clip, keys):
    """keys: [(t, flare_angle)] — mirrored across both winglets (p:+a, s:-a)."""
    for t, a in keys:
        clip.key('wasp_winglet_p', t, rot=Euler((a, 0.0, 0.0)))
        clip.key('wasp_winglet_s', t, rot=Euler((-a, 0.0, 0.0)))


def author(bank):
    # --- bristle: rise to full flare fast, quiver on it, settle ---------------------
    c = bank.clip('wasp_bristle', 1.4, loop=False, end_mode='rest')
    _wing_keys(c, [
        (0.0, 0.0), (0.25, FLARE_RAD), (0.45, FLARE_RAD * 0.92),
        (0.8, FLARE_RAD * 0.88), (1.0, FLARE_RAD * 0.35), (1.4, 0.0)])
    c.key('wasp_guns', 0.0)
    c.key('wasp_guns', 0.3, loc=gun_at(0.18))
    c.key('wasp_guns', 0.8, loc=gun_at(0.18))
    c.key('wasp_guns', 1.4)

    # --- predation: wings slam flat while the guns punch out --------------------------
    c = bank.clip('wasp_predate', 1.2, loop=False, end_mode='rest')
    _wing_keys(c, [
        (0.0, 0.0), (0.18, SLAM_RAD), (0.5, SLAM_RAD * 0.8), (1.2, 0.0)])
    c.key('wasp_guns', 0.0)
    c.key('wasp_guns', 0.15, loc=gun_at(GUN_EXT_M))
    c.key('wasp_guns', 0.55, loc=gun_at(GUN_EXT_M * 0.85))
    c.key('wasp_guns', 1.2)

    # --- flee: tuck low and recoil the stingers -----------------------------------------
    c = bank.clip('wasp_flee', 1.2, loop=False, end_mode='rest')
    _wing_keys(c, [
        (0.0, 0.0), (0.3, TUCK_RAD), (0.7, TUCK_RAD * 0.9), (1.2, 0.0)])
    c.key('wasp_guns', 0.0)
    c.key('wasp_guns', 0.35, loc=gun_at(GUN_REC_M))
    c.key('wasp_guns', 1.2)


EVENTS = {
    'ai:telegraph': 'wasp_bristle',
    'encounter:predationEngaged': 'wasp_predate',
    'ai:flee': 'wasp_flee',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
