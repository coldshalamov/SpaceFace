"""ANI-11 — cargo-pod lock-bar breach, door swing and retainer fold.

Reference: assets/animation-references/videos/ANI-11.mp4 (6.04s @24fps). The prompt's
authoritative motion: at the worked (+X) end the lock bars turn a quarter turn and
withdraw their bolts, then two rigid door leaves release from the central seam and
swing outward on the end-frame hinges, exposing a shallow dark cargo interior. A brief
resistant latch beat precedes the weighted opening; the final open pose is held.

Mechanism truth: the source model ships only a flat `Door{sx}` slab and vertical
`LockBar{sx}{y}` cylinders per end. The +X end gets the worked rig — the -X end
stays a sealed slab, matching the reference where only the visible end opens.
New geometry (per the manifest's proposedGeometry): two door leaves hinged on the
outer end-posts, two fold-down retainer panels hinged on the bottom seam, and a
shallow dark cavity behind them.

Groups (pivot-local, +X end only):
  cargo_lock_t{0..3}   the four +X lock bars — each on its own axial pivot so the
                       quarter-turn is about the bar's own length, then +x retraction.
  cargo_door_port/star the two leaves — pivots on the outer end-posts, swing ~115 deg
                       outward past the end plane.
  cargo_retain_port/star the inner retainer panels — pivots on the bottom seam,
                       fold ~80 deg down into a shallow ramp.

Clips:
  breach  unlock beat (bars fight, turn, withdraw) -> latch-crack beat -> leaves swing
          out weighted -> retainers fold -> hold open. Fired by `mining:start` with
          verb 'split' — the beam pries the pod open over its charge, so the door
          swing is visible while the split work accumulates. endMode 'hold' keeps the
          open pose until the pod entity is consumed by `mining:podSplit`.
  seal    retainers up -> leaves home with a small clap -> bars re-engage; parks at
          exact rest. Fired when the beam disengages early (`mining:stop`,
          `beam:denied` gated on the pod's own id).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'cargo_pod_door'

BAR_TURN_RAD = 1.5708     # quarter turn about the bar's own axis
BAR_PULL_M = 0.18         # bolt tips withdraw out of the leaf faces
LEAF_RAD = 2.01           # ~115 deg outward swing on the end-post hinges
RETAIN_RAD = -1.4         # ~80 deg fold-down into a shallow ramp

# +X end geometry (mirrors the builder's constants: L/2=3.0, W/2=1.65, H/2=1.55)
LOCK_X = 3.02
LOCK_YS = (-0.7, -0.25, 0.25, 0.7)
LEAF_HINGE_Y = 1.48       # leaf outer edge — the end-post hinge line
RETAIN_Z = -1.39          # bottom seam the retainer panels fold from


def register(ship, parts):
    """Register the ANI-11 groups. `parts` = the builder's +X-end door objects."""
    for i, y in enumerate(LOCK_YS):
        ship.motion_group(f'cargo_lock_t{i}', pivot=(LOCK_X, y, 0.0),
                          objects=[parts['locks'][i]])
    ship.motion_group('cargo_door_port', pivot=(3.0, -LEAF_HINGE_Y, 0.0),
                      objects=parts['leaf_port'])
    ship.motion_group('cargo_door_star', pivot=(3.0, LEAF_HINGE_Y, 0.0),
                      objects=parts['leaf_star'])
    ship.motion_group('cargo_retain_port', pivot=(3.0, -0.82, RETAIN_Z),
                      objects=parts['retain_port'])
    ship.motion_group('cargo_retain_star', pivot=(3.0, 0.82, RETAIN_Z),
                      objects=parts['retain_star'])


def _key_leaf(clip, rig, pivot, at_rest, angle_of, keys):
    for t, a in keys:
        clip.key(rig, t, loc=at_rest(pivot), rot=Euler((0, 0, angle_of(a))))


def author(bank):
    pivots = bank.ship.motion_pivots

    # ---- breach -------------------------------------------------------------
    breach = bank.clip('breach', 3.2, loop=False, end_mode='hold')

    # lock bars: fight the latch, quarter-turn, withdraw, seat.
    lock_keys = [
        (0.00, 0.0, 0.0), (0.10, 0.0, -0.02),          # fight: nudge inboard
        (0.22, 0.35 * BAR_TURN_RAD, 0.0),
        (0.38, 0.8 * BAR_TURN_RAD, 0.02),
        (0.52, BAR_TURN_RAD, 0.10),
        (0.68, BAR_TURN_RAD, BAR_PULL_M),
        (0.78, BAR_TURN_RAD, BAR_PULL_M - 0.008),      # seat
    ]
    for i, y in enumerate(LOCK_YS):
        rest = pivots[f'cargo_lock_t{i}'].matrix_basis.translation
        # stagger the four bars a touch — real multi-point latches never release at once
        lag = i * 0.045
        for t, ang, dx in lock_keys:
            breach.key(f'cargo_lock_t{i}', t + lag,
                       loc=(rest.x + dx, rest.y, rest.z),
                       rot=Euler((0, 0, ang)))

    # door leaves: resistant latch beat, then weighted outward swing with a small
    # overshoot settle. Port hinge at -y rotates -113 deg, star +113 deg.
    leaf_keys = [
        (0.30, 0.0), (0.44, 0.07),                     # crack against the latch
        (0.56, 0.04), (0.72, 0.18),                    # release
        (1.10, 0.9), (1.55, 1.85), (1.95, 2.02),       # weighted swing + overshoot
        (2.15, 1.96), (2.35, 1.97), (3.2, 1.97),       # settle held
    ]
    for rig, sgn in (('cargo_door_port', -1), ('cargo_door_star', 1)):
        rest = pivots[rig].matrix_basis.translation
        for t, a in leaf_keys:
            breach.key(rig, t, loc=rest, rot=Euler((0, 0, sgn * a)))

    # retainers: fold down once the leaves clear the opening, soft settle into the ramp.
    retain_keys = [
        (0.90, 0.0), (1.15, 0.12), (1.55, 0.62), (1.95, 0.86),
        (2.25, 0.81), (2.5, 0.825), (3.2, 0.825),
    ]
    for rig in ('cargo_retain_port', 'cargo_retain_star'):
        rest = pivots[rig].matrix_basis.translation
        for t, a in retain_keys:
            breach.key(rig, t, loc=rest, rot=Euler((0, a * 1.5708, 0)))

    # ---- seal ---------------------------------------------------------------
    seal = bank.clip('seal', 2.2, loop=False, end_mode='rest')

    # retainers lift home first (panel back in the doorway), leaves then swing shut
    # with a small clap, bars re-engage last.
    retain_up = [(0.0, 0.825), (0.35, 0.7), (0.68, 0.06), (0.8, 0.0)]
    for rig in ('cargo_retain_port', 'cargo_retain_star'):
        rest = pivots[rig].matrix_basis.translation
        for t, a in retain_up:
            seal.key(rig, t, loc=rest, rot=Euler((0, a * 1.5708, 0)))

    leaf_home = [
        (0.45, 1.97), (0.9, 1.7), (1.35, 0.35),
        (1.62, 0.02), (1.74, 0.035), (1.9, 0.0), (2.2, 0.0),  # clap + settle
    ]
    for rig, sgn in (('cargo_door_port', -1), ('cargo_door_star', 1)):
        rest = pivots[rig].matrix_basis.translation
        for t, a in leaf_home:
            seal.key(rig, t, loc=rest, rot=Euler((0, 0, sgn * a)))

    lock_home = [
        (1.7, BAR_TURN_RAD, BAR_PULL_M), (1.9, 0.4 * BAR_TURN_RAD, 0.02),
        (2.05, 0.0, 0.0), (2.2, 0.0, 0.0),
    ]
    for i in range(len(LOCK_YS)):
        rest = pivots[f'cargo_lock_t{i}'].matrix_basis.translation
        for t, ang, dx in lock_home:
            seal.key(f'cargo_lock_t{i}', t,
                     loc=(rest.x + dx, rest.y, rest.z),
                     rot=Euler((0, 0, ang)))


EVENTS = {
    'mining:start': 'breach',
    'mining:stop': 'seal',
    'beam:denied': 'seal',
}


def build(ship, parts, source_asset_id, bank=None):
    """Register the groups and author the clips. Call before export_ship."""
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
