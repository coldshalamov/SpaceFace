"""ANI-39 — Deep-Space Research Array: the habitat wheel turns, the telescope slews, the survey dish sweeps.

The research station is a 40 m habitat wheel girdling a glass lab sphere, a 16 m Serrurier telescope on a
fork-mounted turntable crowning the spine, and a 24 m survey dish on the aft arm. Every one of those is a
heavy machine, so nothing here is quick: the wheel needs four minutes for a turn, the telescope takes
15-25 s to change target and then parks dead still, and the dish takes most of a minute to run a sweep.
All motion is smoothstep-eased (quintic: zero velocity and acceleration at both ends of every move).

Groups
  research_wheel   — the teal equatorial ring, its trim, the 12 spokes to the core and the lit ring windows.
                     Yaw about the spine. The four arm-root collars stay put: the wheel turns through them.
  research_scope   — fork mount, trunnion, mirror cell, Serrurier truss, top ring, secondary and tip lamp,
                     all on the turntable. Yaw about the spine (azimuth slew).
  research_survey  — the aft 24 m survey dish and its hub. Yaw about the mast head. Event-only: it has no
                     ambient channel, so the event never has to bridge a moving part.

Clips
- research_ambient (240 s, loop): wheel one full turn (16 equal 22.5 deg keys -> constant rate),
  telescope four slews with creeping tracking between them and a dead-still park at both ends.
- survey_sweep (66 s, rest): the dish slews round to one side, back across, and parks. Maps to dock:range
  (the station's traffic control looking at the incoming ship).

Names: no group id contains dish/radar/antenna/ring2 — infrastructureMotion.js scans station children by
those substrings and would become a second transform writer.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'station_research'
PERIOD_S = 240.0
WHEEL_KEYS = 16                 # 22.5 deg per key: equal secants keep the spin constant

# azimuth moves for the telescope: (start s, duration s, delta deg). Slews are the big ones; the
# creeps between them are the sidereal tracking drift, so the tube is never frozen between targets.
SCOPE_MOVES = [
    (14.0, 16.0, 34.0), (30.0, 56.0, 3.0),
    (88.0, 20.0, -58.0), (108.0, 44.0, 3.0),
    (154.0, 24.0, 34.0), (178.0, 36.0, 2.0),
    (214.0, 22.0, -18.0),
]
SWEEP_S = 66.0
SURVEY_MOVES = [(0.0, 16.0, 36.0), (19.0, 24.0, -58.0), (45.0, 18.0, 22.0)]

WHEEL_PIVOT = (0.0, 0.0, 0.0)
SCOPE_PIVOT = (0.0, 0.0, 35.2)          # turntable top: the vertical slew axis
SURVEY_PIVOT = (-41.6, 0.0, 9.4)        # mast head: the survey dish yaws about it


def _sstep(u):
    """Quintic smootherstep: zero velocity and acceleration at both ends."""
    u = 0.0 if u < 0.0 else 1.0 if u > 1.0 else u
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def _profile(t, moves):
    return sum(d * _sstep((t - t0) / dur) for t0, dur, d in moves)


def _sample_times(moves, total, step=2.5):
    """Keys inside every move (>=8, and one per `step` units of travel), only the endpoints across the
    holds between them. The runtime evaluates sparse keys as a C1 curve, so this reproduces the quintic."""
    ts = {0.0, float(total)}
    for t0, dur, delta in moves:
        n = max(8, int(math.ceil(abs(delta) / step)))
        for i in range(n + 1):
            ts.add(round(t0 + dur * i / n, 4))
    return sorted(ts)


def _parts(ship, names=(), prefixes=()):
    """Objects by exact name, or by `<prefix>` / `<prefix>_<suffix>` (helper spawn: _Rim, _Feed, _Lens...)."""
    found = []
    for obj in ship.objects:
        if obj.name in names or any(obj.name == p or obj.name.startswith(p + '_') for p in prefixes):
            found.append(obj)
    return found


def register(ship):
    """Declare the three motion groups on the finished-geometry station (call before finish())."""
    wheel = _parts(ship, names=('Equator', 'EquatorTrim', 'Struts', 'RingWindows'))
    scope = _parts(ship, names=('Fork1', 'Fork-1', 'Trunnion', 'MirrorCell', 'MirrorRing', 'Mirror', 'TopRing',
                                'TopRingTrim', 'Secondary', 'ScopeTip', 'ScopeTruss'))
    survey = _parts(ship, names=('SurveyHub',), prefixes=('Survey',))
    survey = [o for o in survey if o.name not in ('SurveyYoke', 'SurveyMast')]
    expect = {'wheel': (wheel, 4), 'scope': (scope, 11), 'survey': (survey, 5)}
    for key, (objs, count) in expect.items():
        if len(objs) != count:
            raise RuntimeError(f'ANI-39 {key}: expected {count} parts, found {sorted(o.name for o in objs)}')
    ship.motion_group('research_wheel', WHEEL_PIVOT, objects=wheel)
    ship.motion_group('research_scope', SCOPE_PIVOT, objects=scope)
    ship.motion_group('research_survey', SURVEY_PIVOT, objects=survey)


def _yaw(deg):
    return Euler((0.0, 0.0, math.radians(deg)))


def author(bank):
    amb = bank.clip('research_ambient', PERIOD_S, loop=True, end_mode='rest')
    for k in range(WHEEL_KEYS + 1):
        amb.key('research_wheel', PERIOD_S * k / WHEEL_KEYS, rot=_yaw(360.0 * k / WHEEL_KEYS))
    for t in _sample_times(SCOPE_MOVES, PERIOD_S):
        amb.key('research_scope', t, rot=_yaw(_profile(t, SCOPE_MOVES)))

    sweep = bank.clip('survey_sweep', SWEEP_S, loop=False, end_mode='rest')
    for t in _sample_times(SURVEY_MOVES, SWEEP_S):
        sweep.key('research_survey', t, rot=_yaw(_profile(t, SURVEY_MOVES)))


EVENTS = {
    'authoredMotion:attach': 'research_ambient',
    'dock:range': 'survey_sweep',
}


def build(ship, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
