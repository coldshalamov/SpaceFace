"""ANI-32 — survivor-pod eject tumble + rescue ping sweep.

An ejected survivor pod is a body tumbling in the dark: the whole container
rolls on a slow multi-axis tumble while a scan ring sweeps its length on the
rescue ping cadence. When a rescue is selected the tumble damps to a stable
attitude for pickup — the ping keeps sweeping until the pod is delivered.

Groups
  pod_shell — the entire container body tumbling about its centre.
  pod_ping  — a scan ring riding the pod's long axis.

Clips
- pod_eject_tumble (11s, loop): continuous roll with a yaw/pitch wobble folded
  into the same quaternion keys (quarter-turn primary keys for continuity).
- beacon_pulse (2.6s, loop): ping ring sweeps nose to tail.
- pod_steady (1.6s, rest): tumble damps flat for grappling.

Triggers: `authoredMotion:attach` -> beacon_pulse; `survivorPod:ejected` ->
pod_eject_tumble; `survivorPod:rescueSelected` -> pod_steady.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'survivor_pod'
TUMBLE_PERIOD = 11.0
PING_PERIOD = 2.6
PING_TRAVEL = 5.3    # container nose (-0.4) to tail (4.9)
PING_HOME_X = -0.4   # beacon seat on the shell mount (loc keys are absolute local)


def register(ship, parts):
    """parts: {'shell': [every body object], 'ping': obj}."""
    ship.motion_group('pod_shell', pivot=(2.1, 0.0, 1.05), objects=list(parts['shell']))
    ship.motion_group('pod_ping', pivot=(-0.4, 0.0, 1.05), objects=[parts['ping']])


def author(bank):
    tumble = bank.clip('pod_eject_tumble', TUMBLE_PERIOD, loop=True, end_mode='rest')
    # Primary roll keyed in quarter turns (a single 0->2pi key would alias under
    # slerp); pitch/yaw wobble is folded into each sample at wobble frequency so
    # the tumble never reads as a clean single-axis spin.
    for i in range(9):
        t = i * TUMBLE_PERIOD / 8.0
        roll = i * 2 * math.pi / 8.0
        wob = math.sin(i / 8.0 * 2 * math.pi * 3.0) * 0.16
        yaw = math.sin(i / 8.0 * 2 * math.pi * 2.0) * 0.10
        tumble.key('pod_shell', t, rot=Euler((roll, wob, yaw)))

    ping = bank.clip('beacon_pulse', PING_PERIOD, loop=True, end_mode='rest')
    for t, f in [(0.0, 0.0), (0.2, 0.10), (0.55, 0.5), (0.9, 0.9),
                 (1.1, 1.0), (1.5, 1.0), (2.0, 0.55), (2.3, 0.15), (2.6, 0.0)]:
        # loc keys are absolute local: the beacon rides its shell-mount home.
        ping.key('pod_ping', t, loc=(PING_HOME_X + PING_TRAVEL * f, 0.0, 1.05))

    steady = bank.clip('pod_steady', 1.6, loop=False, end_mode='rest')
    # Damp the roll to flat over ~1.5s with a final settle bump; the runtime
    # blends entry from wherever the loop left the shell.
    for t, f in [(0.0, 1.0), (0.5, 0.6), (0.9, 0.28), (1.2, 0.10),
                 (1.4, 0.04), (1.6, 0.0)]:
        steady.key('pod_shell', t, rot=Euler((2 * math.pi * (1.0 - f), 0.0, 0.0)))


EVENTS = {
    'authoredMotion:attach': 'beacon_pulse',
    'survivorPod:ejected': 'pod_eject_tumble',
    'survivorPod:rescueSelected': 'pod_steady',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
