"""ANI-29 — freight-apron traveling gantry.

The loading apron's bridge crane was a static prop glued over the racks. Now it
earns its rails: the bridge walks the apron while the carriage shuffles lanes
and the hook dips for boxes — sector freight arrivals and throughput ticks make
every apron in view lean into the work.

Groups (nested — carriage rides the bridge, hook rides the carriage)
  freight_bridge    — bridge beam + end trucks, travels ±x down the rails.
  freight_carriage  — trolley on the bridge, runs ±y across the lanes.
  freight_hook      — cable + grab block, drops toward the deck (-z).

Clips
- gantry_work_idle (16s, loop): bridge creep + lane shuffle + hook sway.
- gantry_pick      (5.5s, rest): full pick — roll to cell, run to lane, dip,
  dead-lift, carriage home, bridge park.
- gantry_sweep    (3.2s, rest): bridge covers half the apron and returns —
  throughput pulse.

Triggers: `authoredMotion:attach` -> gantry_work_idle; `freight:arrival` +
`freight:custodyChanged` -> gantry_pick; `station:throughput` -> gantry_sweep.
Place props carry no stationId, so dispatch fans out to every apron rig in the
sector — the pad wakes up when freight moves.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'freight_platform'

BRIDGE_SPAN = 8.5     # rail travel ±x
LANE_TRAVEL = 2.5     # carriage ±y across the rack lanes
HOOK_DROP = -1.9      # grab descent toward the deck
IDLE_PERIOD = 16.0

# clip.key loc is the absolute local translation: each group's home is its rest
# offset from its parent, so travel keys are home + the slide along the rail.
BRIDGE_HOME = (0.0, 0.0, 7.5)
CARRIAGE_HOME = (0.0, -2.0, -0.3)  # hangs under the bridge beam
HOOK_HOME = (0.0, 0.0, -0.2)       # hangs under the carriage


def register(ship, parts):
    """parts: {'bridge': [objs], 'carriage': obj, 'hook': [objs]}."""
    ship.motion_group('freight_bridge', pivot=(0.0, 0.0, 7.5), objects=list(parts['bridge']))
    ship.motion_group('freight_carriage', pivot=(0.0, -2.0, 7.2),
                      objects=[parts['carriage']], parent='freight_bridge')
    ship.motion_group('freight_hook', pivot=(0.0, -2.0, 7.0), objects=list(parts['hook']),
                      parent='freight_carriage')


def author(bank):
    # --- idle: the crane never quite sits still --------------------------------------------
    c = bank.clip('gantry_work_idle', IDLE_PERIOD, loop=True)
    for t, x in ((0.0, 0.0), (4.0, 1.4), (8.0, 0.6), (12.0, -1.1), (16.0, 0.0)):
        c.key('freight_bridge', t,
              loc=(BRIDGE_HOME[0] + x, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    for t, y in ((0.0, 0.0), (5.0, 0.6), (11.0, -0.45), (16.0, 0.0)):
        c.key('freight_carriage', t,
              loc=(CARRIAGE_HOME[0], CARRIAGE_HOME[1] + y, CARRIAGE_HOME[2]))
    for t, z in ((0.0, 0.0), (6.0, -0.25), (13.0, -0.05), (16.0, 0.0)):
        c.key('freight_hook', t,
              loc=(HOOK_HOME[0], HOOK_HOME[1], HOOK_HOME[2] + z))
        c.key('freight_hook', t, rot=Euler((0.0, 0.0, 0.0)))

    # --- the pick: bridge to cell, carriage to lane, dip, lift, home -------------------------
    # A five-ton bridge never snaps to a speed: every leg keys on a smoothstep
    # envelope so acceleration eases in and out instead of stepping at keys.
    c = bank.clip('gantry_pick', 5.5, loop=False, end_mode='rest')
    for i in range(8):
        t = 1.15 * i / 7
        x = BRIDGE_SPAN * 0.62 * t * t * (3.0 - 2.0 * t / 1.15) / 1.15
        c.key('freight_bridge', t,
              loc=(BRIDGE_HOME[0] + x, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    for i in range(6):
        t = 4.3 + 0.8 * i / 5
        u = (t - 4.3) / 0.8
        x = BRIDGE_SPAN * 0.62 * (1.0 - u * u * (3.0 - 2.0 * u))
        c.key('freight_bridge', t,
              loc=(BRIDGE_HOME[0] + x, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    c.key('freight_bridge', 5.5, loc=(BRIDGE_HOME[0], BRIDGE_HOME[1], BRIDGE_HOME[2]))
    for t, y in ((0.0, 0.0), (0.15, 0.0), (1.05, LANE_TRAVEL * 0.8), (1.25, LANE_TRAVEL),
                 (3.6, LANE_TRAVEL), (4.35, 0.0), (5.5, 0.0)):
        c.key('freight_carriage', t,
              loc=(CARRIAGE_HOME[0], CARRIAGE_HOME[1] + y, CARRIAGE_HOME[2]))
    for t, z in ((0.0, 0.0), (1.4, 0.0), (1.9, HOOK_DROP), (2.45, HOOK_DROP),
                 (3.05, 0.0), (5.5, 0.0)):
        c.key('freight_hook', t,
              loc=(HOOK_HOME[0], HOOK_HOME[1], HOOK_HOME[2] + z))

    # --- sweep: throughput pulse — bridge covers half the apron ------------------------------
    c = bank.clip('gantry_sweep', 3.2, loop=False, end_mode='rest')
    for i in range(7):
        t = 0.8 * i / 6
        x = BRIDGE_SPAN * 0.45 * t * t * (3.0 - 2.0 * t / 0.8) / 0.8
        c.key('freight_bridge', t,
              loc=(BRIDGE_HOME[0] + x, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    c.key('freight_bridge', 1.6,
          loc=(BRIDGE_HOME[0] + BRIDGE_SPAN * 0.45, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    for i in range(8):
        t = 1.6 + 0.9 * i / 7
        u = (t - 1.6) / 0.9
        x = BRIDGE_SPAN * (0.45 - 0.65 * u * u * (3.0 - 2.0 * u))
        c.key('freight_bridge', t,
              loc=(BRIDGE_HOME[0] + x, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    for i in range(7):
        t = 2.5 + 0.7 * i / 6
        u = (t - 2.5) / 0.7
        x = -BRIDGE_SPAN * 0.2 * (1.0 - u * u * (3.0 - 2.0 * u))
        c.key('freight_bridge', t,
              loc=(BRIDGE_HOME[0] + x, BRIDGE_HOME[1], BRIDGE_HOME[2]))
    for t, z in ((0.0, 0.0), (1.0, -0.4), (2.2, -0.4), (3.2, 0.0)):
        c.key('freight_hook', t,
              loc=(HOOK_HOME[0], HOOK_HOME[1], HOOK_HOME[2] + z))
    for t, y in ((0.0, 0.0), (0.7, 0.5), (2.6, 0.5), (3.2, 0.0)):
        c.key('freight_carriage', t,
              loc=(CARRIAGE_HOME[0], CARRIAGE_HOME[1] + y, CARRIAGE_HOME[2]))


EVENTS = {
    'authoredMotion:attach': 'gantry_work_idle',
    'freight:arrival': 'gantry_pick',
    'freight:custodyChanged': 'gantry_pick',
    'station:throughput': 'gantry_sweep',
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
