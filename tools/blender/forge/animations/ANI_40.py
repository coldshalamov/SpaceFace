"""ANI-40 — Refinery Process Crown: the stack crown turns over the furnace, the hab scan head sweeps.

The four glowing ivory furnace stacks stand on the furnace cap round the tall central chimney. They are one
rotary crown: boots, stacks, hot throats, lips, the stack brace ring and the four ties that reach in to the
chimney all turn together, once in three minutes. At the camera's 144 WU that is the amber throats
circling the chimney: slow, heavy, unmistakably alive, and nothing ever twitches. The 3.4 m scan dish on the
crew hab runs a sweep when a ship comes into dock range and parks again.

Groups
  refinery_crown — Stack0-3 (+ lips, hot throats, boots), StackBrace, StackTie0-3. Yaw about the chimney axis.
                   The chimney, its lamps, the cap and the cap lamps are static: the crown turns round them.
  refinery_scan  — the hab scan dish (bowl, rim, feed, lens). Yaw about the mast head. Event-only.

Clips
- crown_turn (180 s, loop): one full turn in 8 equal 45 deg keys (constant rate, closes exactly).
- scan_sweep (42 s, rest): dish slews out, back across, and parks. Maps to dock:range.
"""
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'station_refinery'
PERIOD_S = 180.0
CROWN_KEYS = 8                      # 45 deg per key: equal secants -> constant rate
SWEEP_S = 42.0
SWEEP_MOVES = [(0.0, 10.0, 40.0), (12.0, 16.0, -72.0), (30.0, 10.0, 32.0)]

CROWN_PIVOT = (0.0, 0.0, 13.4)      # the chimney axis, at the cap deck
SCAN_PIVOT = (-7.0, -37.0, 9.0)     # the hab dish mast head

_CROWN_NAME = re.compile(r'^Stack(Lip|Hot|Boot|Tie)?[0-3]$')


def _sstep(u):
    """Quintic smootherstep: zero velocity and acceleration at both ends."""
    u = 0.0 if u < 0.0 else 1.0 if u > 1.0 else u
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def _profile(t, moves):
    return sum(d * _sstep((t - t0) / dur) for t0, dur, d in moves)


def _sample_times(moves, total, step=2.5):
    ts = {0.0, float(total)}
    for t0, dur, delta in moves:
        n = max(8, int(math.ceil(abs(delta) / step)))
        for i in range(n + 1):
            ts.add(round(t0 + dur * i / n, 4))
    return sorted(ts)


def register(ship):
    """Declare the two motion groups (call after the recipe has built every part)."""
    crown = [o for o in ship.objects if _CROWN_NAME.match(o.name) or o.name == 'StackBrace']
    scan = [o for o in ship.objects if o.name == 'Dish' or o.name.startswith('Dish_')]
    for key, objs, count in (('crown', crown, 4 * 5 + 1), ('scan', scan, 4)):
        if len(objs) != count:
            raise RuntimeError(f'ANI-40 {key}: expected {count} parts, found {sorted(o.name for o in objs)}')
    ship.motion_group('refinery_crown', CROWN_PIVOT, objects=crown)
    ship.motion_group('refinery_scan', SCAN_PIVOT, objects=scan)


def _yaw(deg):
    return Euler((0.0, 0.0, math.radians(deg)))


def author(bank):
    turn = bank.clip('crown_turn', PERIOD_S, loop=True, end_mode='rest')
    for k in range(CROWN_KEYS + 1):
        turn.key('refinery_crown', PERIOD_S * k / CROWN_KEYS, rot=_yaw(360.0 * k / CROWN_KEYS))

    sweep = bank.clip('scan_sweep', SWEEP_S, loop=False, end_mode='rest')
    for t in _sample_times(SWEEP_MOVES, SWEEP_S):
        sweep.key('refinery_scan', t, rot=_yaw(_profile(t, SWEEP_MOVES)))


EVENTS = {
    'authoredMotion:attach': 'crown_turn',
    'dock:range': 'scan_sweep',
}


def build(ship, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
