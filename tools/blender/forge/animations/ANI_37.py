"""ANI-37 — hornet intercept authority: customs brace / scan sweep / stand-down.

Hornet is the hull customs patrols actually fly (ship_hornet), so the boarding
verbs need a real rig on the real hull: the wingtip cannon pods spread and the
canards pitch up as the patrol serves the inspection, the flap rows ripple a
scan pass over the player's hull while the verdict runs, and the whole rig
folds home when the scan breaks or the patrol is done with you.

Same hull also flies combat as a pirate interceptor: telegraph reuses the brace
crouch, predation punches the tip cannons forward, and a fleeing hornet tucks
its pods low — the wasp family vocabulary translated to this airframe.

Clips
- hornet_brace (1.4s, rest): canards pitch up + tip pods spread — challenge.
- hornet_sweep (1.7s, rest): flap rows ripple port->starboard — scan pass.
- hornet_lunge (1.2s, rest): pods slam flat + thrust forward — strike cue.
- hornet_yield (1.2s, rest): canards fold, pods tuck — stand-down / release.
- hornet_idle_drift (7.0s, loop): pod sway + canard breathing under everything.

All event clips self-recover ('rest'): an interrupted inspection or a telegraph
that never converts can't leave the rig stuck flared.

Triggers: `lawfulInspection:choose`, `customs:submit`, `player:scannedByPatrol`,
`customs:breakScan` (customs), plus the combat set `ai:telegraph` /
`encounter:predationEngaged` / `ai:flee` — all entity-addressed.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'hornet'

CANARD_UP_RAD = math.radians(9.0)    # brace: canards bite up into the intercept
POD_SPREAD_RAD = math.radians(7.0)   # brace: tip pods yaw out, announcing teeth
POD_SLAM_RAD = math.radians(-5.0)    # lunge: pods flatten to the shot line
FLAP_RIPPLE_RAD = math.radians(8.0)  # sweep: flap rows ripple a scan pass
TUCK_RAD = math.radians(-11.0)       # yield: everything folds home
POD_EXT_M = 0.45                     # lunge: tip barrels punch forward
IDLE_CANARD_RAD = math.radians(1.6)  # ambient: canard breathing — far under the brace
IDLE_POD_RAD = math.radians(1.2)     # ambient: tip-pod sway, phase-offset from canards
# clip.key loc is the absolute local translation: pod travel rides the wingtip
# rail's home position, not the hull origin.
POD_HOME_P = (-3.4, 4.15, 0.0)
POD_HOME_S = (-3.4, -4.15, 0.0)
pod_p = lambda dx: (POD_HOME_P[0] + dx, POD_HOME_P[1], POD_HOME_P[2])
pod_s = lambda dx: (POD_HOME_S[0] + dx, POD_HOME_S[1], POD_HOME_S[2])


def register(ship, parts):
    """parts: {'tippodP': [..], 'tippodS': [..], 'flapP': [..], 'flapS': [..],
    'canardP': [..], 'canardS': [..]}"""
    ship.motion_group('hornet_tippod_p', pivot=(-3.4, 4.15, 0.0), objects=parts['tippodP'])
    ship.motion_group('hornet_tippod_s', pivot=(-3.4, -4.15, 0.0), objects=parts['tippodS'])
    ship.motion_group('hornet_flap_p', pivot=(-3.8, 2.4, -0.09), objects=parts['flapP'])
    ship.motion_group('hornet_flap_s', pivot=(-3.8, -2.4, -0.09), objects=parts['flapS'])
    ship.motion_group('hornet_canard_p', pivot=(2.4, 1.0, -0.04), objects=parts['canardP'])
    ship.motion_group('hornet_canard_s', pivot=(2.4, -1.0, -0.04), objects=parts['canardS'])


def _canard_keys(clip, keys):
    """keys: [(t, pitch)] — mirrored canards pitch together about their roots."""
    for t, a in keys:
        clip.key('hornet_canard_p', t, rot=Euler((0.0, -a, 0.0)))
        clip.key('hornet_canard_s', t, rot=Euler((0.0, a, 0.0)))


def _pod_keys(clip, keys):
    """keys: [(t, spread)] — pods yaw apart (p:+a, s:-a)."""
    for t, a in keys:
        clip.key('hornet_tippod_p', t, rot=Euler((0.0, 0.0, a)))
        clip.key('hornet_tippod_s', t, rot=Euler((0.0, 0.0, -a)))


def author(bank):
    # --- brace: canards up, pods yaw out — the served challenge ----------------------
    c = bank.clip('hornet_brace', 1.4, loop=False, end_mode='rest')
    _canard_keys(c, [
        (0.0, 0.0), (0.22, CANARD_UP_RAD), (0.5, CANARD_UP_RAD * 0.9),
        (0.9, CANARD_UP_RAD * 0.4), (1.4, 0.0)])
    _pod_keys(c, [
        (0.0, 0.0), (0.3, POD_SPREAD_RAD), (0.7, POD_SPREAD_RAD * 0.85), (1.4, 0.0)])

    # --- sweep: flap rows ripple a scan pass, port first then starboard ---------------
    c = bank.clip('hornet_sweep', 1.7, loop=False, end_mode='rest')
    for t, a in [(0.0, 0.0), (0.25, FLAP_RIPPLE_RAD), (0.55, FLAP_RIPPLE_RAD * 0.7),
                 (1.0, FLAP_RIPPLE_RAD * 0.25), (1.7, 0.0)]:
        c.key('hornet_flap_p', t, rot=Euler((a, 0.0, 0.0)))
    for t, a in [(0.0, 0.0), (0.45, 0.0), (0.7, FLAP_RIPPLE_RAD),
                 (1.0, FLAP_RIPPLE_RAD * 0.7), (1.45, FLAP_RIPPLE_RAD * 0.2), (1.7, 0.0)]:
        c.key('hornet_flap_s', t, rot=Euler((a, 0.0, 0.0)))
    _canard_keys(c, [(0.0, 0.0), (0.4, CANARD_UP_RAD * 0.5), (1.2, CANARD_UP_RAD * 0.2), (1.7, 0.0)])

    # --- lunge: pods slam flat and the tip barrels punch out --------------------------
    c = bank.clip('hornet_lunge', 1.2, loop=False, end_mode='rest')
    _pod_keys(c, [
        (0.0, 0.0), (0.18, POD_SLAM_RAD), (0.5, POD_SLAM_RAD * 0.8), (1.2, 0.0)])
    c.key('hornet_tippod_p', 0.0, loc=pod_p(0.0))
    c.key('hornet_tippod_p', 0.15, loc=pod_p(POD_EXT_M))
    c.key('hornet_tippod_p', 0.55, loc=pod_p(POD_EXT_M * 0.85))
    c.key('hornet_tippod_p', 1.2, loc=pod_p(0.0))
    c.key('hornet_tippod_s', 0.0, loc=pod_s(0.0))
    c.key('hornet_tippod_s', 0.15, loc=pod_s(POD_EXT_M))
    c.key('hornet_tippod_s', 0.55, loc=pod_s(POD_EXT_M * 0.85))
    c.key('hornet_tippod_s', 1.2, loc=pod_s(0.0))

    # --- yield: canards fold and pods tuck — stand-down --------------------------------
    c = bank.clip('hornet_yield', 1.2, loop=False, end_mode='rest')
    _canard_keys(c, [(0.0, 0.0), (0.3, TUCK_RAD * 0.6), (0.7, TUCK_RAD * 0.5), (1.2, 0.0)])
    _pod_keys(c, [(0.0, 0.0), (0.35, TUCK_RAD), (0.75, TUCK_RAD * 0.9), (1.2, 0.0)])

    # --- ambient: a patrol hornet breathes on its canards, sways on its pods -----------
    idle = bank.clip('hornet_idle_drift', 7.0, loop=True, end_mode='rest')
    for i in range(9):
        t = i * 7.0 / 8
        a = IDLE_CANARD_RAD * math.sin(2 * math.pi * t / 7.0)
        idle.key('hornet_canard_p', t, rot=Euler((0.0, -a, 0.0)))
        idle.key('hornet_canard_s', t, rot=Euler((0.0, a, 0.0)))
        b = IDLE_POD_RAD * math.sin(2 * math.pi * (t / 7.0 + 0.5))
        idle.key('hornet_tippod_p', t, rot=Euler((0.0, 0.0, b)))
        idle.key('hornet_tippod_s', t, rot=Euler((0.0, 0.0, -b)))


EVENTS = {
    'authoredMotion:attach': 'hornet_idle_drift',
    # Customs intercept verbs — the arm the inspection-cutter lends big cases,
    # the hornet pair every patrol actually flies.
    'lawfulInspection:choose': 'hornet_brace',
    'customs:submit': 'hornet_brace',
    'player:scannedByPatrol': 'hornet_sweep',
    'customs:breakScan': 'hornet_yield',
    # Combat vocabulary — hornet patrols double as pirate interceptors.
    'ai:telegraph': 'hornet_brace',
    'encounter:telegraph': 'hornet_brace',
    'encounter:predationTelegraph': 'hornet_brace',
    'ai:stateChange': 'hornet_brace',
    'encounter:predationEngaged': 'hornet_lunge',
    'ai:flee': 'hornet_yield',
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
