"""ANI-41 — Coalition Bastion: the citadel radar turns, the bow battery tracks, the fire-control dish locks on.

The keep is a star-fort seen from above, and from above the things that move are the radar bar crowning
the lattice mast and the heavy turret on the first bow terrace. The bar is 7 m of steel turning once in
twenty seconds at a constant rate (a search radar never stops). The three-barrel main turret is a ~14 m
machine and never hurries: it slews to a target over 14-22 s with the creep of a tracking fire solution
in between. The small fire-control dish on the citadel is idle until the station's traffic control looks at
a ship (dock range) or turns one away (dock denied); then it runs a tracking sweep and parks.

Groups
  military_sweep   — RadarBar + RadarFace on the mast head. Yaw about the mast. (The mast tip lamp sits on
                     the axis and stays static.)
  military_battery — Main2 turret: house, mantlet, sleeves, barrels, muzzles, sight bar and its lenses.
                     Yaw about the barbette; the barbette and red ring are static. Only the +X arc is used,
                     so no barrel ever overflies the gatehouse roofs, the hangar mouth or the T2 wall.
  military_track   — FireControl dish (bowl, rim, feed, lens). Yaw about its post. Event-only.

Clips
- military_ambient (120 s, loop): the bar turns 6 times (constant rate), the turret runs three slews with
  creeping tracking and parks dead still at both ends.
- track_sweep (40 s, rest): the fire-control dish sweeps one way, back across, and parks. Maps to dock:range
  and dock:denied.

Group ids avoid dish/radar/antenna/ring2: infrastructureMotion.js name-scans station children for those.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'station_military'
PERIOD_S = 120.0
BAR_TURNS = 6                        # one turn per 20 s
BAR_KEYS_PER_TURN = 8                # 45 deg per key: equal secants -> constant rate
TURRET_MOVES = [
    (8.0, 14.0, 26.0), (22.0, 20.0, 3.0),
    (46.0, 22.0, -48.0), (68.0, 18.0, -2.0),
    (90.0, 22.0, 21.0),
]
TRACK_S = 40.0
TRACK_MOVES = [(0.0, 10.0, 50.0), (12.0, 16.0, -90.0), (30.0, 8.0, 40.0)]

SWEEP_PIVOT = (-16.5, 0.0, 38.3)     # radar bar centre on the mast head
BATTERY_PIVOT = (13.2, 0.0, 17.1)    # Main2 barbette axis (T1 bow terrace)
TRACK_PIVOT = (-19.2, 3.0, 31.6)     # fire-control dish on its post


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
    """Declare the three motion groups (call after the recipe has built every part)."""
    names = {o.name: o for o in ship.objects}
    sweep = [names[n] for n in ('RadarBar', 'RadarFace')]
    battery = [o for o in ship.objects if o.name.startswith('Main2_')
               and o.name not in ('Main2_Barbette', 'Main2_Ring')]
    track = [o for o in ship.objects if o.name == 'FireControl' or o.name.startswith('FireControl_')]
    for key, objs, count in (('battery', battery, 14), ('track', track, 4)):
        if len(objs) != count:
            raise RuntimeError(f'ANI-41 {key}: expected {count} parts, found {sorted(o.name for o in objs)}')
    ship.motion_group('military_sweep', SWEEP_PIVOT, objects=sweep)
    ship.motion_group('military_battery', BATTERY_PIVOT, objects=battery)
    ship.motion_group('military_track', TRACK_PIVOT, objects=track)


def _yaw(deg):
    return Euler((0.0, 0.0, math.radians(deg)))


def author(bank):
    amb = bank.clip('military_ambient', PERIOD_S, loop=True, end_mode='rest')
    n = BAR_TURNS * BAR_KEYS_PER_TURN
    for k in range(n + 1):
        amb.key('military_sweep', PERIOD_S * k / n, rot=_yaw(360.0 * BAR_TURNS * k / n))
    for t in _sample_times(TURRET_MOVES, PERIOD_S):
        amb.key('military_battery', t, rot=_yaw(_profile(t, TURRET_MOVES)))

    trk = bank.clip('track_sweep', TRACK_S, loop=False, end_mode='rest')
    for t in _sample_times(TRACK_MOVES, TRACK_S):
        trk.key('military_track', t, rot=_yaw(_profile(t, TRACK_MOVES)))


EVENTS = {
    'authoredMotion:attach': 'military_ambient',
    'dock:range': 'track_sweep',
    'dock:denied': 'track_sweep',
}


def build(ship, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
