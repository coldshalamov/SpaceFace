"""ANI-43 — Black-Market Warren: a shifty signal yardarm on the spire, jaws that gape and slam at the dock.

The warren is a shanty town on quarried rocks; its landmark from above is the neon spire on the Crown rock.
A smuggler's signal lamp works the top of that spire: a 5 m yardarm with an amber lens on one end and a cyan
on the other, sweeping a slow 100 deg arc each way as if watching the lanes, never settling into a clean
rotation. At the dock mouth the two hazard-paint clamp jaws answer ships: they open to take an arrival (dock
range) and clench shut at a refused one (dock denied). All of it is slow, heavy steel.

Groups
  blackmarket_signal — new signal yardarm on the SpireMast: hub, arm, amber lamp, cyan lamp (all new parts
                       in finishes the station already draws: gunmetal, glow_amber, glow_cyan). Yaw about the mast.
  blackmarket_jaw_p / blackmarket_jaw_s — each clamp jaw with its dark pad and its amber lamp. Yaw about the
                       jaw hinge at the arm tip. Event-only.

Clips
- blackmarket_ambient (72 s, loop): the yardarm sweeps +100, -100 (through rest), +100... back to rest, with
  slow eased reversals and a short dead-still dwell at the rest pose at both ends of the loop.
- jaw_welcome (13 s, rest): both jaws open 17 deg (port leads by half a second), hold, and close. dock:range.
- jaw_refuse (9 s, rest): both jaws clench inward 14 deg, hold, and let go. dock:denied.

Group ids avoid dish/radar/antenna/ring2 (infrastructureMotion.js name-scans station children for those).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'station_blackmarket'
PERIOD_S = 72.0
SIGNAL_MOVES = [(2.0, 14.0, 100.0), (19.0, 30.0, -200.0), (52.0, 16.0, 100.0)]
WELCOME_S = 13.0
WELCOME_P = [(0.0, 4.0, 17.0), (6.5, 5.5, -17.0)]
WELCOME_S_MOVES = [(0.5, 4.0, 17.0), (7.0, 5.5, -17.0)]
REFUSE_S = 9.0
REFUSE_MOVES = [(0.0, 2.5, -14.0), (4.1, 4.5, 14.0)]

# The Spire's mast: the recipe stacks five floors from z = 39 and the mast rises from the top (54.8).
SPIRE_XY = (-16.0, -2.5)
SPIRE_TOP_Z = 54.8
SIGNAL_Z = SPIRE_TOP_Z + 3.7
SIGNAL_PIVOT = (SPIRE_XY[0], SPIRE_XY[1], SIGNAL_Z)
# Jaw hinge = the jaw box's base end at the clamp-arm tip.
JAW_HINGE_X = 40.0
JAW_HINGE_Y = 5.9
JAW_Z = -4.5


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


def build_signal(F, ship, spire_z):
    """The signal yardarm's parts (new geometry). Called by the recipe right after the SpireMast."""
    if abs(SPIRE_TOP_Z - spire_z) > 1e-6:
        raise RuntimeError(f'ANI-43: spire top moved to z={spire_z}; update SPIRE_TOP_Z')
    x, y = SPIRE_XY
    z = spire_z + 3.7
    F.cylinder(ship, 'SignalHub', (x, y, z - 0.35), (x, y, z + 0.35), 0.5, material='gunmetal', segments=12)
    F.box(ship, 'SignalArm', (x, y, z), (5.0, 0.3, 0.3), material='gunmetal', bevel=0.0)
    F.light(ship, 'SignalLampA', (x + 2.5, y, z), 'glow_amber', size=0.6)
    F.light(ship, 'SignalLampB', (x - 2.5, y, z), 'glow_cyan', size=0.6)


def register(ship):
    """Declare the three motion groups (call after the recipe has built every part)."""
    names = {o.name: o for o in ship.objects}
    signal = [names[n] for n in ('SignalHub', 'SignalArm', 'SignalLampA', 'SignalLampB')]
    ship.motion_group('blackmarket_signal', SIGNAL_PIVOT, objects=signal)
    for tag, sy in (('p', 1), ('s', -1)):
        jaw = [names[f'ClampJaw{sy}'], names[f'ClampPad{sy}'], names[f'JawLamp{sy}']]
        ship.motion_group(f'blackmarket_jaw_{tag}', (JAW_HINGE_X, sy * JAW_HINGE_Y, JAW_Z), objects=jaw)


def _yaw(deg):
    return Euler((0.0, 0.0, math.radians(deg)))


def author(bank):
    amb = bank.clip('blackmarket_ambient', PERIOD_S, loop=True, end_mode='rest')
    for t in _sample_times(SIGNAL_MOVES, PERIOD_S):
        amb.key('blackmarket_signal', t, rot=_yaw(_profile(t, SIGNAL_MOVES)))

    # jaw_p opens with +yaw, the mirrored jaw_s with -yaw
    welcome = bank.clip('jaw_welcome', WELCOME_S, loop=False, end_mode='rest')
    for t in _sample_times(WELCOME_P, WELCOME_S, step=1.5):
        welcome.key('blackmarket_jaw_p', t, rot=_yaw(_profile(t, WELCOME_P)))
    for t in _sample_times(WELCOME_S_MOVES, WELCOME_S, step=1.5):
        welcome.key('blackmarket_jaw_s', t, rot=_yaw(-_profile(t, WELCOME_S_MOVES)))

    refuse = bank.clip('jaw_refuse', REFUSE_S, loop=False, end_mode='rest')
    for t in _sample_times(REFUSE_MOVES, REFUSE_S, step=1.5):
        refuse.key('blackmarket_jaw_p', t, rot=_yaw(_profile(t, REFUSE_MOVES)))
        refuse.key('blackmarket_jaw_s', t, rot=_yaw(-_profile(t, REFUSE_MOVES)))


EVENTS = {
    'authoredMotion:attach': 'blackmarket_ambient',
    'dock:range': 'jaw_welcome',
    'dock:denied': 'jaw_refuse',
}


def build(ship, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
