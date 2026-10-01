"""ANI-27 — nav-buoy lane life: cage rotation + spire pulse ring.

Lane furniture should never sit dead: the lantern's cage assembly turns slowly
like a lighthouse shutter, and a service ring rides up the spire when the lane
network answers a navigation event — the whole field of buoys pings when the
player sets a waypoint or the band radio resolves a bearing.

Groups
  nav_buoy_cage — the lantern cage (8 bars + 3 hoops), spins about the spire axis.
  nav_buoy_pulse — a spare service ring at the spire base, rides up on pulse.

Clips
- beacon_spin (14s, loop): slow continuous yaw, quarter-turn keys.
- ring_pulse (1.5s, rest): ring travels the spire and blends back down.

Triggers: `authoredMotion:attach` -> beacon_spin; `nav:waypoint` /
`band:bearingResolved` -> ring_pulse (fanned out to every live buoy bank).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'nav_buoy'
SPIN_PERIOD = 14.0
PULSE_TRAVEL = 8.6    # spire run: base ring to just under the lamp seat


def register(ship, parts):
    """parts: {'cage': [objs], 'pulse': obj}."""
    ship.motion_group('nav_buoy_cage', pivot=(0.0, 0.0, 7.3), objects=list(parts['cage']))
    ship.motion_group('nav_buoy_pulse', pivot=(0.0, 0.0, -2.8), objects=[parts['pulse']])


def author(bank):
    spin = bank.clip('beacon_spin', SPIN_PERIOD, loop=True, end_mode='rest')
    for i in range(4):
        spin.key('nav_buoy_cage', i * SPIN_PERIOD / 3.0,
                 rot=Euler((0.0, 0.0, i * 2 * 3.141592653589793 / 3.0)))

    pulse = bank.clip('ring_pulse', 1.5, loop=False, end_mode='rest')
    for t, f in [(0.0, 0.0), (0.14, 0.06), (0.45, 0.42), (0.8, 0.82),
                 (1.05, 0.98), (1.2, 1.0), (1.5, 1.0)]:
        pulse.key('nav_buoy_pulse', t, loc=(0.0, 0.0, PULSE_TRAVEL * f))


EVENTS = {
    'authoredMotion:attach': 'beacon_spin',
    'nav:waypoint': 'ring_pulse',
    'band:bearingResolved': 'ring_pulse',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
