"""ANI-13/14 — fab-yard welder seam work + crane plate cycle.

One existing two-link welder arm (arm1 on the +Y wall) unfolds toward the hull seam while a
fabrication job runs: the elbow straightens to press the tool head onto the plate, the
shoulder rides a straight pass, lifts, repositions and welds a second bead, then folds home.
On the rightmost bridge crane the trolley jogs a short traverse, the paired hoist lines pay
the curved hull plate down a little toward the ribs, it holds aligned with a damped settle,
then returns to suspension.

Clips
- workLoop (9.0s, loop): arm1 runs a two-bead weld cycle; crane0 runs one
  traverse/lower/hold/return cycle. Rest keys at both ends make the loop seam exact.

Events: craft:queueChanged receipts enriched with {stationId, active} — the authoredMotion
bus resolves the world station id to the live place entity and maps queue-active to
fab:workStart -> workLoop; done/cancelled calls controller.settle(1.2) so a mid-phase stop
blends home from the live pose instead of snapping to a fixed park clip.

Geometry truth the clip obeys (measured on the exported GLB):
- arm1's tip rests 1.4 m short of the hull face — contact needs the elbow to straighten
  ~-18deg local X plus ~-15deg shoulder X (tip reaches ~-1.3 m inward, ~+0.6 m up).
- Shoulder Z swings the head ~0.12 m/deg along the hull axis (the seam direction); elbow Z
  counters ~0.06 m/deg to keep the head tangent. Positive shoulder X pulls the tip back off
  the hull and slightly down — the reposition-hop lift.
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

ARMS = (('arm1', 1),)   # the spec's ONE working welder — the yard's other arms stay parked
LOOP_S = 9.0
HOIST_DROP = 2.0
TROLLEY_TRAVEL = -1.6

# Measured on the exported GLB: this combo parks the weld point +0.17 m off the plate at
# z~1.6 — arc-contact standoff, the closest the fixed links can reach without sliding.
PRESS_X = -8.0    # shoulder local-X deg during plate contact
REACH_X = -18.0   # elbow local-X deg that straightens the chain across the 1.4 m air gap


def _deg(rot_x=0.0, rot_z=0.0):
    return Euler((math.radians(rot_x), 0.0, math.radians(rot_z)))


def author(bank):
    # ---- welder arm ----------------------------------------------------------
    # (t, pitch_deg on local X, swing_deg on local Z) — swing slides the tool head along
    # the seam (hull axis); negative pitch presses the head onto the plate, positive lifts
    # it clear for reposition hops.
    shoulder = [
        (0.00, 0.0, 0.0), (0.45, 0.0, 0.0),          # parked dwell
        (0.80, 0.0, 9.0), (1.10, -4.0, 9.6),         # unfold + swing to the bead start
        (1.35, PRESS_X, 9.0),                        # press — tool tip on the plate
        (2.90, PRESS_X, -5.0),                       # pass 1: slow seam trace, ~1.7 m
        (3.15, 7.0, -5.4), (3.55, 7.0, -8.0),        # lift off
        (3.95, 7.0, 8.4),                            # reposition hop to the next bead
        (4.30, PRESS_X, 8.0),                        # re-contact
        (5.90, PRESS_X, -4.0),                       # pass 2: return trace
        (6.40, 7.0, -1.0), (7.00, 0.0, 0.0),         # lift away + fold home
        (LOOP_S, 0.0, 0.0),
    ]
    elbow = [
        (0.00, 0.0, 0.0), (0.45, 0.0, 0.0),
        (0.80, -6.0, -5.0), (1.10, -13.0, -5.4),     # chain straightening toward the hull
        (1.35, REACH_X, -5.0),
        (2.90, REACH_X, 3.0),
        (3.15, 4.0, 3.4), (3.55, 5.0, 4.2),          # fold back for the hop
        (3.95, 5.0, -7.0),
        (4.30, REACH_X, -7.4),
        (5.90, REACH_X, 2.6),
        (6.40, 4.0, 0.8), (7.00, 0.0, 0.0), (LOOP_S, 0.0, 0.0),
    ]
    wrist = [
        (0.00, 0.0, 0.0), (0.45, 0.0, 0.0), (0.80, 0.0, 3.5),
        (1.35, 0.0, 3.5), (2.90, 0.0, -2.0),
        (4.30, 0.0, 4.0), (5.90, 0.0, -1.5),
        (7.00, 0.0, 0.0), (LOOP_S, 0.0, 0.0),
    ]
    work = bank.clip('workLoop', LOOP_S, loop=True, end_mode='hold')
    pivots = bank.ship.motion_pivots
    for prefix, side in ARMS:
        for rig, keys in (('shoulder', shoulder), ('elbow', elbow), ('wrist', wrist)):
            rig_id = f'{prefix}_{rig}'
            rest = pivots[rig_id].matrix_basis.translation
            for t, rx, rz in keys:
                work.key(rig_id, t, loc=(rest.x, rest.y, rest.z),
                         rot=_deg(rx * side, rz * side))

    # ---- crane 0 -------------------------------------------------------------
    trolley = pivots['crane0_trolley'].matrix_basis.translation
    hoist = pivots['crane0_hoist'].matrix_basis.translation
    for t, dy in ((0.0, 0.0), (0.9, 0.0), (2.1, TROLLEY_TRAVEL), (6.9, TROLLEY_TRAVEL),
                  (8.2, 0.0), (LOOP_S, 0.0)):
        work.key('crane0_trolley', t, loc=(trolley.x, trolley.y + dy, trolley.z),
                 rot=Euler((0, 0, 0)))
    # paid stroke once the traverse is seated, hold with a damped pendulum settle, return
    for t, dz, sway in ((0.0, 0.0, 0.0), (2.5, 0.0, 0.0), (4.1, -HOIST_DROP, 0.0),
                        (4.55, -HOIST_DROP, 1.6), (5.05, -HOIST_DROP, -1.0),
                        (5.5, -HOIST_DROP, 0.5), (5.9, -HOIST_DROP, 0.0),
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
