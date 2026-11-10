"""ANI-36 — lane-beacon gantry ambient life (ANI-27 doc scope).

A lane gantry is working navigation hardware: the mast-head aviation beacon
rotates continuously, the big lane lamp at the boom tip pans a slow scan up and
down the approach, and the under-boom signal pods nod in sequence when the lane
answers routing. All drift sits under the lamp emissives so the mast reads as
machinery holding station, not a dead prop.

Groups
  lane_lamp  — tip lamp housing + lens stack; yaw sweep about the mast vertical.
  lane_avi   — mast-head aviation beacon; continuous rotation.
  lane_pod0..2 — under-boom signal pods; hanger-pivot nod.

Clips
- lane_ambient (8s, loop): avi spin + lamp pan + pod micro-sway, all phase-offset.
- lane_chase (1.8s, rest): pods nod in sequence root->tip on lane routing events.

Triggers: `authoredMotion:attach` (ambient), `nav:waypoint` and
`band:bearingResolved` (chase) — the same lane events the nav buoys answer.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'lane_beacon'
PERIOD_S = 8.0
AVI_TURNS = 2            # aviation beacons sweep continuously — two turns per loop
LAMP_PAN_DEG = 16        # lane lamp scans the approach, yaw about the mast vertical
POD_SWAY_DEG = 3.0
CHASE_DIP_DEG = 11.0
CHASE_S = 1.8


def register(ship, parts):
    """parts: {'lamp': [tip lamp objects], 'avi': [avi beacon], 'pods': [[pod0], [pod1], [pod2]]}."""
    ship.motion_group('lane_lamp', pivot=(8.5, 0.0, 5.5), objects=list(parts['lamp']))
    ship.motion_group('lane_avi', pivot=(0.55, 0.0, 8.9), objects=list(parts['avi']))
    for i, pod in enumerate(parts['pods']):
        # hanger top: the pod nods from its mount, not its centre
        ship.motion_group(f'lane_pod{i}', pivot=(2.3 + i * 1.6, 0.0, 4.9),
                          objects=list(pod))


def author(bank):
    ambient = bank.clip('lane_ambient', PERIOD_S, loop=True, end_mode='rest')
    keys = 17
    for k in range(keys):
        t = k * PERIOD_S / (keys - 1)
        phase = 2 * math.pi * t / PERIOD_S
        # aviation beacon: two whole turns per loop -> identity seam
        ambient.key('lane_avi', t, rot=Euler((0, 0, AVI_TURNS * phase)))
        # lane lamp pans the approach and holds a beat at each edge
        ambient.key('lane_lamp', t,
                    rot=Euler((0, 0, math.radians(LAMP_PAN_DEG) * math.sin(phase))))
        # pods breathe in sequence so the boom never moves as one block
        for i in range(3):
            ambient.key(f'lane_pod{i}', t,
                        rot=Euler((math.radians(POD_SWAY_DEG)
                                   * math.sin(phase + i * 0.9), 0, 0)))

    chase = bank.clip('lane_chase', CHASE_S, loop=False, end_mode='rest')
    # root-to-tip nod chain: each pod dips and recovers a third of a beat later
    for i in range(3):
        t0 = i * 0.3
        for t, f in [(t0, 0.0), (t0 + 0.18, 1.0), (t0 + 0.55, 0.0)]:
            chase.key(f'lane_pod{i}', t,
                      rot=Euler((math.radians(CHASE_DIP_DEG) * f, 0, 0)))
    # park all three pods at rest for the tail — rest-end must land on identity
    for i in range(3):
        chase.key(f'lane_pod{i}', CHASE_S, rot=Euler((0, 0, 0)))


EVENTS = {
    'authoredMotion:attach': 'lane_ambient',
    'nav:waypoint': 'lane_chase',
    'band:bearingResolved': 'lane_chase',
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
