"""ANI-13/14 — fab-yard welder seam work + crane plate cycle.

Two wall-mounted two-link welder arms (arm1 on the +Y wall, arm4 on -Y) take turns tracing
short hull seams while a fabrication job runs: shoulder and elbow unfold a small reach, the
wrist aligns the tool head, the head rides a straight pass, lifts, repositions and welds a
second bead, then settles. On the rightmost bridge crane the trolley jogs a short traverse,
the paired hoist lines pay the curved hull plate down a little toward the ribs, it holds in
alignment with a damped settle, then returns to suspension.

Clips
- workLoop (9.0s, loop): arm1 and arm4 take phased seam passes (arm4 offset mid-cycle so the
  yard reads busy, not synchronized); crane0 runs one traverse/lower/hold/return cycle.

Events: craft:queueChanged receipts enriched with {stationId, active} — the authoredMotion
bus resolves the world station id to the live place entity and maps queue-active to
fab:workStart -> workLoop; done/cancelled calls controller.settle(1.2) so a mid-phase stop
blends home from the live pose instead of snapping to a fixed park clip.

Geometry truth the clip obeys:
- Arms span ~7 m from wall to hull: shoulder yaw ~5-7° moves the tool head ~0.8-1.2 m along
  the seam (x axis); elbow counters ~3° to keep the head tangent; a ~3.6° shoulder pitch
  lifts the head ~0.5 m off the hull for reposition hops.
- Hoist lines bury 2.5 m of spare length inside the trolley's winch housing, so a 2.0 m paid
  stroke keeps cable tops hidden and bottoms pinned to the plate at every frame.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'fab_yard_work'

ARMS = (('arm1', 1), ('arm4', -1))   # (rig prefix, wall side sign)
LOOP_S = 9.0
HOIST_DROP = 2.0
TROLLEY_TRAVEL = -1.6


def _deg(rot_x=0.0, rot_z=0.0):
    return Euler((math.radians(rot_x), 0.0, math.radians(rot_z)))


def author(bank):
    # ---- welder arms ---------------------------------------------------------
    # (t, lift_deg on local X, swing_deg on local Z) — swing slides the tool head along the
    # seam (hull axis), lift clears it for reposition hops. Values are signed for the
    # +Y-wall arm; arm4 mirrors both signs so its pass stays symmetric.
    shoulder = [
        (0.00, 0.0, 0.0), (0.70, 0.0, 5.0), (0.95, 0.0, 5.3),
        (2.55, 0.0, -3.0),                        # pass 1: slow seam trace
        (2.75, -1.8, -3.4), (3.15, -3.6, -4.2),   # lift off
        (3.75, -3.6, 6.8),                        # reposition hop to the next point
        (4.15, 0.0, 6.5),                         # re-contact
        (6.00, 0.0, -1.5),                        # pass 2: return trace
        (6.60, 0.0, 0.0), (LOOP_S, 0.0, 0.0),     # settle + dwell at rest
    ]
    elbow = [
        (0.00, 0.0, 0.0), (0.70, 0.0, -3.2), (2.55, 0.0, 1.6),
        (3.15, 2.4, 2.4), (3.75, 2.4, -4.0), (4.15, 0.0, -3.8),
        (6.00, 0.0, 0.9), (6.60, 0.0, 0.0), (LOOP_S, 0.0, 0.0),
    ]
    wrist = [
        (0.00, 0.0, 0.0), (0.70, 0.0, 2.0), (2.55, 0.0, -1.0),
        (4.15, 0.0, 2.2), (6.00, 0.0, -0.6), (6.60, 0.0, 0.0), (LOOP_S, 0.0, 0.0),
    ]
    work = bank.clip('workLoop', LOOP_S, loop=True, end_mode='hold')
    pivots = bank.ship.motion_pivots
    for prefix, side in ARMS:
        offset = 0.0 if prefix == 'arm1' else 3.0   # stagger the second welder mid-cycle
        for rig, keys in (('shoulder', shoulder), ('elbow', elbow), ('wrist', wrist)):
            rig_id = f'{prefix}_{rig}'
            rest = pivots[rig_id].matrix_basis.translation
            keyed = sorted(((t + offset) % LOOP_S, _deg(rx * side, rz * side))
                           for t, rx, rz in keys)
            for t, euler in keyed:
                work.key(rig_id, t, loc=(rest.x, rest.y, rest.z), rot=euler)

    # ---- crane 0 -------------------------------------------------------------
    trolley = pivots['crane0_trolley'].matrix_basis.translation
    hoist = pivots['crane0_hoist'].matrix_basis.translation
    for t, dy in ((0.0, 0.0), (0.9, 0.0), (2.1, TROLLEY_TRAVEL), (6.9, TROLLEY_TRAVEL),
                  (8.2, 0.0), (LOOP_S, 0.0)):
        work.key('crane0_trolley', t, loc=(trolley.x, trolley.y + dy, trolley.z),
                 rot=Euler((0, 0, 0)))
    # paid stroke once the traverse is seated, hold with a damped pendulum settle, return
    for t, dz, sway in ((0.0, 0.0, 0.0), (2.5, 0.0, 0.0), (4.1, -HOIST_DROP, 0.0),
                        (4.55, -HOIST_DROP, 0.55), (5.05, -HOIST_DROP, -0.3),
                        (5.5, -HOIST_DROP, 0.1), (5.9, -HOIST_DROP, 0.0),
                        (6.9, 0.0, 0.0), (LOOP_S, 0.0, 0.0)):
        work.key('crane0_hoist', t,
                 loc=(hoist.x, hoist.y, hoist.z + dz),
                 rot=_deg(sway))


EVENTS = {
    'fab:workStart': 'workLoop',
    # fab:workDone parks via controller.settle(1.2) — see authoredMotion.js; a fixed
    # absolute-delta park clip would pop whenever the loop stops mid-pass.
}


def build(ship, parts, source_asset_id, bank=None):
    """Author the clips onto the groups the builder registered. Call before export_ship."""
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
