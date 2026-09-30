"""ANI-10: mining-drone cutter drum — spin-up, grind strokes, coast-down.

Reference: assets/animation-references/place_mining_drone.mp4 — the front toothed drum spins about
the longitudinal gearbox axis, makes three small pressure strokes along the guide, then coasts
back to the original stopped pose.

In-game this is a continuous state, not a one-shot: while a mining drone is parked on a rock its
drum works. The bank carries the reference's ONE deliberate cycle as 'grindCycle' (rest-ended, the
roll lands exactly on the wrap pose so successive cycles chain seamlessly); automation re-fires
drone:grindStart while the drone keeps grinding and emits drone:grindStop when it leaves the
rock — which maps to the bank's 'rest' state, parking the drum mid-roll (teeth make the exact stop
angle unreadable; the coast pose is the natural landing when a cycle completes).

Usage inside place_mining_drone.build():  s.ani10_bank = ANI_10.build(s, parts, asset_id)
"""
import math
import os
import sys

from mathutils import Euler, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402

RIG_ID = 'mining_drone_drum'

CYCLE_S = 4.2          # the full reference cycle
REVS = 4.0             # total drum revolutions across the cycle
STROKE_M = 0.08        # pressure-stroke travel along the guide (+x, toward the rock)

EVENTS = {
    'drone:grindStart': 'grindCycle',
    'drone:grindStop': 'rest',
}


def register(ship, parts):
    """parts: {'drum':[objs]} — the whole rotating cutter head: drum shell, lip, cut face,
    teeth, inner cutters and the drill spike. Pivot on the drum axis."""
    ship.motion_group('drone_drum', pivot=(3.75, 0.0, 0.45), objects=parts['drum'])


def author(bank):
    group = 'drone_drum'
    pivot = bank.ship.motion_pivots[group]
    rest = pivot.matrix_basis.translation
    at = lambda dx: (rest + Vector((dx, 0.0, 0.0)))[:]

    cyc = next(c for c in bank.clips if c.name == 'grindCycle')
    # Roll: spin-up over 0.8s, sustained grind through 3.0s, coast down landing on exactly
    # REVS turns at 4.2s — an integral wrap so cycle-end pose == rest pose.
    for t, revs in ((0.0, 0.0), (0.4, 0.18), (0.8, 0.55), (1.4, 1.35), (2.0, 2.15),
                    (2.6, 2.9), (3.0, 3.35), (3.5, 3.72), (3.9, 3.94), (CYCLE_S, REVS)):
        cyc.key(group, t, rot=Euler((revs * 2.0 * math.pi, 0.0, 0.0)))
    # Three pressure strokes along the guide during the sustained phase: quick push toward
    # +x, partial relax, seat back.
    for t0 in (1.15, 1.85, 2.55):
        cyc.key(group, t0, loc=at(0.0))
        cyc.key(group, t0 + 0.16, loc=at(STROKE_M))
        cyc.key(group, t0 + 0.34, loc=at(STROKE_M * 0.25))
        cyc.key(group, t0 + 0.45, loc=at(0.0))
    cyc.key(group, CYCLE_S, loc=at(0.0))


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    bank.clip('grindCycle', CYCLE_S, loop=False, end_mode='rest')
    author(bank)
    return bank
