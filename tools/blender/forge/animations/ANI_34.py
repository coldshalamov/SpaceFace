"""ANI-34 — extraction-mast pumpjack cycle + idle breathing.

The mast is a borehole pump: it should visibly WORK its claim. A walking beam
on the crown rocks the plunger rod in and out of the wellhead while the site
produces, and breathes on a slow idle cycle otherwise — site machinery that
sits perfectly still reads as a decal, not a machine.

Groups
  mast_beam — walking beam + counterweight rocking about its crown trunnion.
  mast_rod  — plunger rod driven off the beam nose.

Clips
- mast_pump_cycle (2.4s, loop): full work stroke, beam rock +/-8deg with the
  rod in counter-phase (down while the nose comes up).
- mast_idle (9s, loop): gentle breathing rock while the claim sits warm.

Triggers: `site:producing` -> mast_pump_cycle; `authoredMotion:attach` ->
mast_idle. `site:machineRemoved` settles the groups render-side, which drains
back to the ambient idle through the bank's ambient-resume.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'extraction_mast'
ROCK_RAD = 0.14      # ~8deg walking-beam rock
STROKE_M = 0.28      # plunger travel (beam nose travels ~0.3 at the rod eye)
ROD_HOME = (1.2, 0.0, 5.4)   # plunger's pivot seat on the mast (loc keys absolute local)


def register(ship, parts):
    """parts: {'beam': [objs], 'rod': obj}."""
    ship.motion_group('mast_beam', pivot=(-0.35, 0.0, 8.6), objects=list(parts['beam']))
    ship.motion_group('mast_rod', pivot=(1.2, 0.0, 5.4), objects=[parts['rod']])


def author(bank):
    pump = bank.clip('mast_pump_cycle', 2.4, loop=True, end_mode='rest')
    # Beam rocks sinusoidally; the rod strokes on a 90-degree lag like a real
    # pumpjack. Both channels sit at rest at the loop seam so loop entry and
    # re-entry never pop.
    for i in range(9):
        p = i / 8.0
        t = i * 0.3
        beam = ROCK_RAD * math.sin(2.0 * math.pi * p)
        stroke = STROKE_M * (1.0 - math.cos(2.0 * math.pi * p)) * 0.5
        pump.key('mast_beam', t, rot=Euler((0.0, beam, 0.0)))
        # loc keys are absolute local: the plunger strokes from its mast home.
        pump.key('mast_rod', t, loc=(ROD_HOME[0], ROD_HOME[1], ROD_HOME[2] - stroke))

    idle = bank.clip('mast_idle', 9.0, loop=True, end_mode='rest')
    for i, f in enumerate((0.0, 0.4, 0.85, 1.0, 0.85, 0.4, 0.0)):
        t = i * 1.5
        idle.key('mast_beam', t, rot=Euler((0.0, 0.022 * math.sin(f * math.pi), 0.0)))


EVENTS = {
    'authoredMotion:attach': 'mast_idle',
    'site:producing': 'mast_pump_cycle',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
