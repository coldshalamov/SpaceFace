"""ANI-42 — Belt Mining Rig: the cutter drum chews, the gantry trolley works the rock, the hab scan head sweeps.

The rig is "a crane rig chewing a captive asteroid", so the two things that move are the cutter drum at the
sawn face and a gantry trolley carrying its grab over the rock. The drum is 14 m long and 6.6 m across: it
turns once in 30 s (12 deg/s), always down-cut so the spoil falls into the chute below. The trolley is a
4 m block hanging a grab: it crawls 8.5 m along its girder at under half a metre a second, holds while the
grab "works", and crawls home. The 2.8 m scan dish on the crew hab sweeps when a ship comes into dock range.

Groups
  mining_cutter  — Drum + Teeth (all 96 cutter teeth). Rotation about the drum axis (Y).
  mining_trolley — the west gantry's Trolley0, cab, both hoist lines, grab and its two jaws, as one rigid
                   unit. Translation along the girder (Y). The traverse stays within the span where the
                   rock top is within +/-0.8 m of the authored contact height, so the dark jaws never
                   float over the rock or sink in more than the authored 0.6 m.
  mining_scan    — the hab scan dish (bowl, rim, feed, lens). Yaw about its mast head. Event-only.

Clips
- mining_ambient (120 s, loop): drum 4 turns (8 equal 45 deg keys per turn: constant rate); trolley one
  crawl out, a hold, and one crawl home, resting dead still at both ends.
- scan_sweep (40 s, rest): dish sweeps out, back across and parks. Maps to dock:range.

Group ids avoid dish/radar/antenna/ring2 (infrastructureMotion.js name-scans station children for those).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'station_mining'
PERIOD_S = 120.0
DRUM_TURNS = 4                      # one turn per 30 s
DRUM_KEYS_PER_TURN = 8              # 45 deg per key: equal secants -> constant rate
TROLLEY_MOVES = [(8.0, 34.0, -8.5), (62.0, 34.0, 8.5)]     # metres along the girder (Y), out then home
SWEEP_S = 40.0
SWEEP_MOVES = [(0.0, 10.0, 40.0), (12.0, 16.0, -72.0), (30.0, 8.0, 32.0)]

# Mirrors place_station_mining.py: XCUT = RC.x + RX * 0.64, DRUM_X = XCUT + 2.0.
DRUM_X = -26.0 + 19.5 * 0.64 + 2.0
CUTTER_PIVOT = (DRUM_X, 0.0, 0.0)
TROLLEY_PIVOT = (-36.0, 5.5, 24.0)  # Trolley0 centre: gantry 0 at x = -36, trolley at y = 5.5, z = 24.0
SCAN_PIVOT = (-2.0, -16.0, 7.6)     # hab dish mast head

TROLLEY_NAMES = ('Trolley0', 'TrolleyCab0', 'Hoist0-1.1', 'Hoist0+1.1', 'Grab0', 'GrabJaw0-1', 'GrabJaw01')


def _sstep(u):
    """Quintic smootherstep: zero velocity and acceleration at both ends."""
    u = 0.0 if u < 0.0 else 1.0 if u > 1.0 else u
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def _profile(t, moves):
    return sum(d * _sstep((t - t0) / dur) for t0, dur, d in moves)


def _sample_times(moves, total, step):
    """Keys inside every move (>=8, one per `step` units of travel); endpoints only across holds."""
    ts = {0.0, float(total)}
    for t0, dur, delta in moves:
        n = max(8, int(math.ceil(abs(delta) / step)))
        for i in range(n + 1):
            ts.add(round(t0 + dur * i / n, 4))
    return sorted(ts)


def register(ship):
    """Declare the three motion groups (call after the recipe has built every part)."""
    names = {o.name: o for o in ship.objects}
    cutter = [names['Drum'], names['Teeth']]
    trolley = [names[n] for n in TROLLEY_NAMES]
    scan = [o for o in ship.objects if o.name == 'Dish' or o.name.startswith('Dish_')]
    if len(scan) != 4:
        raise RuntimeError(f'ANI-42 scan: expected 4 parts, found {sorted(o.name for o in scan)}')
    ship.motion_group('mining_cutter', CUTTER_PIVOT, objects=cutter)
    ship.motion_group('mining_trolley', TROLLEY_PIVOT, objects=trolley)
    ship.motion_group('mining_scan', SCAN_PIVOT, objects=scan)


def author(bank):
    amb = bank.clip('mining_ambient', PERIOD_S, loop=True, end_mode='rest')
    n = DRUM_TURNS * DRUM_KEYS_PER_TURN
    for k in range(n + 1):
        # down-cut: the teeth on the rock side move downward, spoil drops into the chute
        amb.key('mining_cutter', PERIOD_S * k / n, rot=Euler((0.0, -2.0 * math.pi * DRUM_TURNS * k / n, 0.0)))
    hx, hy, hz = TROLLEY_PIVOT
    for t in _sample_times(TROLLEY_MOVES, PERIOD_S, step=0.5):
        amb.key('mining_trolley', t, loc=(hx, hy + _profile(t, TROLLEY_MOVES), hz))

    sweep = bank.clip('scan_sweep', SWEEP_S, loop=False, end_mode='rest')
    for t in _sample_times(SWEEP_MOVES, SWEEP_S, step=2.5):
        sweep.key('mining_scan', t, rot=Euler((0.0, 0.0, math.radians(_profile(t, SWEEP_MOVES)))))


EVENTS = {
    'authoredMotion:attach': 'mining_ambient',
    'dock:range': 'scan_sweep',
}


def build(ship, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
