"""ANI-20 — fab-yard crane work-idle sway.

Between queue jobs the fab rig should idle like a heavy crane that never fully powers
down: the trolley creeps a hair along its rail and back, the hoist rope breathes with
a damped pendulum sway, and the weld wrist does a small readiness tremor. All motion
stays well under the workLoop strokes so the ambient pass never reads as welding.

Clips
- crane_idle_sway (8.0s, loop): trolley drift ±0.35 m on y, hoist bob + swing, wrist tremor.

Trigger: synthetic `authoredMotion:attach`; the runtime re-enters it whenever the
workLoop drains, so the yard settles back into ambient life instead of freezing.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

def _deg(rx, rz):
    return Euler((math.radians(rx), 0.0, math.radians(rz)))

PERIOD_S = 8.0
TROLLEY_DRIFT = 0.35
HOIST_BOB_M = 0.06
HOIST_SWAY_DEG = 0.8
WRIST_TREMOR_DEG = 1.5


def author(bank):
    pivots = bank.ship.motion_pivots
    sway = bank.clip('crane_idle_sway', PERIOD_S, loop=True, end_mode='rest')
    keys = 17

    trolley = pivots['crane0_trolley'].matrix_basis.translation
    hoist = pivots['crane0_hoist'].matrix_basis.translation
    wrist = pivots['arm1_wrist'].matrix_basis.translation

    for k in range(keys):
        t = k * PERIOD_S / (keys - 1)
        phase = 2 * math.pi * t / PERIOD_S
        # trolley creeps out and returns — one slow cosine
        sway.key('crane0_trolley', t,
                 loc=(trolley.x, trolley.y + TROLLEY_DRIFT * (0.5 - 0.5 * math.cos(phase)),
                      trolley.z),
                 rot=Euler((0, 0, 0)))
        # hoist: tiny vertical bob plus a pendulum swing at twice the frequency
        sway.key('crane0_hoist', t,
                 loc=(hoist.x, hoist.y, hoist.z - HOIST_BOB_M * (0.5 + 0.5 * math.cos(phase))),
                 rot=_deg(HOIST_SWAY_DEG * math.sin(2 * phase), 0.0))
        # wrist readiness tremor, offset so the parts never move as one block
        sway.key('arm1_wrist', t,
                 loc=(wrist.x, wrist.y, wrist.z),
                 rot=_deg(0.0, WRIST_TREMOR_DEG * math.sin(3 * phase + 0.9)))


EVENTS = {
    'authoredMotion:attach': 'crane_idle_sway',
}


def build(ship, parts, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, 'fab_yard_rig', source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
