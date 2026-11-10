"""ANI-24 — cargo-pod drift wobble on jettison.

A pod kicked loose should not look bolted shut: doors shiver against their hinges,
retainer brackets rattle, and the lock toggles jitter in their tracks — a loosely
sealed container tumbling free, not a sealed machine at attention.

Clips
- pod_drift_wobble (8.0s, loop): all four lock toggles jitter, retainers breathe a
  degree, both door leaves creak micro-rotations. Loop keeps running until the pod
  is collected or despawns; breach/seal supersede on contact events.

Trigger: `cargo:jettisoned` routed to the pod entity by authoredMotion.js.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

PERIOD_S = 8.0
LOCK_JITTER_M = 0.02
DOOR_CREAK_DEG = 1.2
RETAIN_BREATHE_DEG = 0.9


def author(bank):
    pivots = bank.ship.motion_pivots
    wobble = bank.clip('pod_drift_wobble', PERIOD_S, loop=True, end_mode='rest')
    keys = 13

    for i in range(4):
        rig = f'cargo_lock_t{i}'
        rest = pivots[rig].matrix_basis.translation
        ph = i * 1.1
        for k in range(keys):
            t = k * PERIOD_S / (keys - 1)
            f = math.sin(2 * math.pi * t / PERIOD_S + ph) * math.sin(3 * math.pi * t / PERIOD_S)
            wobble.key(rig, t,
                       loc=(rest.x, rest.y + LOCK_JITTER_M * f, rest.z),
                       rot=Euler((0, 0, 0)))

    for side, sgn in (('port', -1.0), ('star', 1.0)):
        door = f'cargo_door_{side}'
        ret = f'cargo_retain_{side}'
        drest = pivots[door].matrix_basis.translation
        rrest = pivots[ret].matrix_basis.translation
        ph = 0.7 if side == 'star' else 0.0
        for k in range(keys):
            t = k * PERIOD_S / (keys - 1)
            f = math.sin(2 * math.pi * t / PERIOD_S + ph)
            wobble.key(door, t, loc=(drest.x, drest.y, drest.z),
                       rot=Euler((0, 0, sgn * math.radians(DOOR_CREAK_DEG) * f)))
            wobble.key(ret, t, loc=(rrest.x, rrest.y, rrest.z),
                       rot=Euler((0, math.radians(RETAIN_BREATHE_DEG) * f, 0)))


EVENTS = {
    # Every cargo-pod entity in-world is a jettisoned payload by definition (cargo:jettisoned
    # carries no entity id), so the drift wobble is ambient life, armed at attach.
    'authoredMotion:attach': 'pod_drift_wobble',
}


def build(ship, parts, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, 'cargo_pod_door', source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
