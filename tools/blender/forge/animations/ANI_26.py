"""ANI-26 — drill-platform string spin, feed creep, stall kick, park.

The seam drill is the biggest machine a player works next to: while a borehole
session runs the drill string spins under the derrick and the feed collar
ratchets it down in creeping steps; a cell break jolts the string on a torque
stall, and session end parks everything back to rest.

Groups
  drill_string — the string + bit, spinning under the crown.
  drill_collar — feed collar that creeps down the string in ratchet steps.
  drill_crown — torque crown on the derrick top, takes the stall kicks.

Clips
- drill_spin_up (1.4s, loop): continuous string yaw, quarter-turn keys.
- drill_feed (6s, loop): collar ratchet creep — three down-steps, spring reset.
- drill_stall_kick (0.5s, rest): torque-stall shudder on the drive crown.
- drill_park (1.4s, rest): collar lifts home and the string unwinds.

Triggers: `drill:start` -> drill_spin_up (+ side-band `drill:feed` ->
drill_feed); `drill:break` -> drill_stall_kick; `drill:end` -> drill_park.
All fanned out to every drill_platform rig — the visible platform is the one
the session is happening at.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'drill_platform'
SPIN_PERIOD = 1.4
FEED_STEP = 0.3
STALL_RAD = 0.18
# clip.key loc is the absolute local translation: the collar strokes from its
# mast-top home, so feed keys are home z minus the screw travel.
COLLAR_HOME_Z = 4.4


def register(ship, parts):
    """parts: {'string': [objs], 'collar': obj, 'crown': obj}."""
    ship.motion_group('drill_string', pivot=(0.0, 0.0, 10.6), objects=list(parts['string']))
    ship.motion_group('drill_collar', pivot=(0.0, 0.0, 4.4), objects=[parts['collar']])
    ship.motion_group('drill_crown', pivot=(0.0, 0.0, 11.4), objects=[parts['crown']])


def author(bank):
    spin = bank.clip('drill_spin_up', SPIN_PERIOD, loop=True, end_mode='rest')
    for i in range(4):
        spin.key('drill_string', i * SPIN_PERIOD / 3.0,
                 rot=Euler((0.0, 0.0, i * 2 * math.pi / 3.0)))

    feed = bank.clip('drill_feed', 6.0, loop=True, end_mode='rest')
    # Three ratchet steps down, spring return — a feed screw working the collar.
    for t, f in [(0.0, 0.0), (1.4, 0.0), (1.6, 1.0), (3.0, 1.0), (3.2, 2.0),
                 (4.6, 2.0), (4.8, 3.0), (5.6, 3.0), (6.0, 0.0)]:
        feed.key('drill_collar', t, loc=(0.0, 0.0, COLLAR_HOME_Z - FEED_STEP * f))

    # The kick rocks the torque crown, never the string: keying the spinning group
    # would both pop the string to a fixed first key and permanently supersede the
    # spin loop — the platform would freeze at its busiest moment.
    kick = bank.clip('drill_stall_kick', 0.5, loop=False, end_mode='rest')
    for t, f in [(0.0, 0.0), (0.08, 1.0), (0.18, -0.55), (0.3, 0.3),
                 (0.42, -0.1), (0.5, 0.0)]:
        kick.key('drill_crown', t, rot=Euler((0.0, 0.0, STALL_RAD * f)))

    park = bank.clip('drill_park', 1.4, loop=False, end_mode='rest')
    # Park must claim the string too or the spin loop owns it forever after
    # drill:end — a slow coast to a dead stop supersedes the loop.
    for t, f in [(0.0, 3.0), (0.4, 2.4), (0.8, 1.2), (1.1, 0.3), (1.4, 0.0)]:
        park.key('drill_collar', t, loc=(0.0, 0.0, COLLAR_HOME_Z - FEED_STEP * f))
    for t, r in [(0.0, 0.10), (0.35, 0.045), (0.7, 0.015), (1.4, 0.0)]:
        park.key('drill_string', t, rot=Euler((0.0, 0.0, r)))

    # Ambient: a parked platform still hums — the collar creeps millimetres on
    # its track and the string index-turns a lazy fraction, both at rest at seam.
    idle = bank.clip('drill_idle', 8.0, loop=True, end_mode='rest')
    for i in range(9):
        t = i * 1.0
        phase = 2 * math.pi * t / 8.0
        idle.key('drill_collar', t,
                 loc=(0.0, 0.0, COLLAR_HOME_Z - 0.05 * (0.5 - 0.5 * math.cos(phase))))
        idle.key('drill_string', t,
                 rot=Euler((0.0, 0.0, 0.06 * math.sin(phase))))


EVENTS = {
    'authoredMotion:attach': 'drill_idle',
    'drill:start': 'drill_spin_up',
    'drill:feed': 'drill_feed',
    'drill:break': 'drill_stall_kick',
    'drill:end': 'drill_park',
    # Rock breaking is its own kick — the head bucks as the asteroid gives.
    'asteroid:destroyed': 'drill_stall_kick',
    'asteroid:chunked': 'drill_stall_kick',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
