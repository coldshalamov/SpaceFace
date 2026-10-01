"""ANI-33 — interdiction-buoy iris petals + snare core spin-up.

The authority buoy should telegraph a trap arming: its crown petals stand
flush along the deck, and when an interdiction field trips they flare open
like an iris while the emitter core spools to a snare spin. On the drop they
fold home. The first warning the player gets is the buoy *opening*.

Groups
  snare_petal_0..5 — six deck-rim petals, each pivot rotated so its local Y is
  the hinge tangent (one identical rot-Y key unfolds all six).
  snare_core — emitter core + ring + slits, spools on the Z axis.

Clips
- petals_unfold (1.6s, hold): staged flare to ~75deg with a lock clunk.
- core_spin_up (1.8s, loop): quarter-turn yaw keys, snare cadence.
- petals_close (1.2s, rest): fold back to flush.

Triggers: `interdiction:triggered` -> petals_unfold (dispatched to each
entityId the trap placed); `cruise:snareRequest` -> core_spin_up;
`cruise:dropped` -> petals_close.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'interdiction_buoy'
PETALS = 6
FLARE_RAD = 1.31     # ~75deg outward fold
SPIN_PERIOD = 1.8


def petal_groups():
    return [f'snare_petal_{k}' for k in range(PETALS)]


def register(ship, parts):
    """parts: {'petals': [6 objs in angle order], 'core': [objs]}."""
    for k, petal in enumerate(parts['petals']):
        a = math.radians(k * 60)
        ship.motion_group(f'snare_petal_{k}', pivot=(2.05 * math.cos(a),
                                                     2.05 * math.sin(a), 1.3),
                          objects=[petal], rotation=Euler((0.0, 0.0, a)))
    ship.motion_group('snare_core', pivot=(0.0, 0.0, 2.0), objects=list(parts['core']))


def _petal_rot(a, f):
    """Absolute local rotation for a yawed petal: rest yaw composed with the
    tangent-hinge flare. Keys are absolute — the yaw must ride in the key or
    the delta swings the petal around the ring instead of hinging it."""
    return (Euler((0.0, 0.0, a)).to_quaternion()
            @ Euler((0.0, FLARE_RAD * f, 0.0)).to_quaternion())


def author(bank):
    unfold = bank.clip('petals_unfold', 1.6, loop=False, end_mode='hold')
    for k in range(PETALS):
        group = f'snare_petal_{k}'
        a = math.radians(k * 60)
        # Stagger the ring: petal k starts at k*0.08s — the iris blooms in a wave.
        lag = k * 0.08
        for t, f in [(0.0, 0.0), (0.25, 0.28), (0.55, 0.75), (0.78, 1.0),
                     (0.92, 1.06), (1.06, 0.98), (1.2, 1.0)]:
            tt = lag + t * 0.75
            if tt <= 1.6:
                unfold.key(group, tt, rot=_petal_rot(a, f))
        unfold.key(group, 1.6, rot=_petal_rot(a, 1.0))

    spin = bank.clip('core_spin_up', SPIN_PERIOD, loop=True, end_mode='rest')
    for i in range(4):
        spin.key('snare_core', i * SPIN_PERIOD / 3.0,
                 rot=Euler((0.0, 0.0, i * 2 * math.pi / 3.0)))

    close = bank.clip('petals_close', 1.2, loop=False, end_mode='rest')
    for k, group in enumerate(petal_groups()):
        a = math.radians(k * 60)
        for t, f in [(0.0, 1.0), (0.3, 0.92), (0.6, 0.62), (0.85, 0.25),
                     (1.0, 0.06), (1.1, 0.10), (1.2, 0.0)]:
            close.key(group, t, rot=_petal_rot(a, f))

    # Ambient: a parked trap still breathes — each petal shimmers a few degrees
    # on its hinge, phase-offset around the ring so the shimmer travels.
    shimmer = bank.clip('petal_shimmer', 7.0, loop=True, end_mode='rest')
    for k, group in enumerate(petal_groups()):
        a = math.radians(k * 60)
        phase = k / PETALS
        for i in range(9):
            t = i * 7.0 / 8
            shimmer.key(group, t,
                        rot=_petal_rot(a, 0.05 * math.sin(2 * math.pi * (t / 7.0 + phase))))


EVENTS = {
    'authoredMotion:attach': 'petal_shimmer',
    'interdiction:triggered': 'petals_unfold',
    'cruise:snareRequest': 'core_spin_up',
    'cruise:dropped': 'petals_close',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
