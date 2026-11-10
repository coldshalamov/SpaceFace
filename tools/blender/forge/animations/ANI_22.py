"""ANI-22 — mining-drone idle life: drum coast + sensor vane.

A drone between grinds shouldn't read as a parked prop. Two authored behaviours:

- `drum_coast_idle` (6.0s, loop, attach-armed): the cutter drum keeps a slow
  coast — bearings unpowered but never dead. ANI-10's grind clips claim the
  drum at work; when the rig parks, the coast resumes on its own.
- `vane_stow` (0.9s, hold) / `vane_deploy` (1.1s, rest): a thin dorsal sense
  vane folds flat onto the deck while the cutter is spinning up (clearance +
  debris shrapnel discipline) and re-erects when the grind releases.

Group
  drone_vane — hinge pivot at the vane's root edge on the aft deck.

Triggers: `authoredMotion:attach` (coast), `drone:grindStart` -> vane_stow,
`drone:grindStop` -> vane_deploy.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'drone_vane'
STOW_RAD = math.radians(-68.0)   # raised rest -> folded flat, pitching nose-down toward deck
COAST_PERIOD = 6.0


def register(ship, parts):
    """parts: {'vane': obj} — the thin sense vane authored raised on the aft deck."""
    ship.motion_group(RIG_ID, pivot=(-0.1, 0.0, 0.89), objects=[parts['vane']])


def author(bank):
    # Slow coast: quarter-turn keys so each segment interpolates a real arc
    # (a single 0->2pi key would alias to identity under slerp).
    coast = bank.clip('drum_coast_idle', COAST_PERIOD, loop=True, end_mode='rest')
    for i in range(4):
        t = i * COAST_PERIOD / 3.0
        coast.key('drone_drum', t, rot=Euler((i * 2 * math.pi / 3.0, 0.0, 0.0)))

    stow = bank.clip('vane_stow', 0.9, loop=False, end_mode='hold')
    for t, f in [(0.0, 0.0), (0.18, 0.30), (0.42, 0.78), (0.62, 1.0),
                 (0.72, 1.04), (0.9, 1.0)]:
        stow.key(RIG_ID, t, rot=Euler((0.0, STOW_RAD * f, 0.0)))

    deploy = bank.clip('vane_deploy', 1.1, loop=False, end_mode='rest')
    for t, f in [(0.0, 1.0), (0.30, 0.92), (0.55, 0.55), (0.75, 0.18),
                 (0.9, 0.03), (1.0, 0.06), (1.1, 0.0)]:
        deploy.key(RIG_ID, t, rot=Euler((0.0, STOW_RAD * f, 0.0)))


EVENTS = {
    'authoredMotion:attach': 'drum_coast_idle',
    # The bank's event map is one clip per event — the vane rides synthetic side-band
    # events the render layer dispatches alongside the grind lifecycle (drum keeps
    # its established drone:grindStart/Stop -> grindCycle contract).
    'drone:vaneStow': 'vane_stow',
    'drone:vaneDeploy': 'vane_deploy',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
