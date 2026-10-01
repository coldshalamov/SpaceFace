"""ANI-07 — Kestrel shoulder armour cap: hinge peel, load rock and damaged-hold settle.

Reference: assets/animation-references/videos/ANI-07.mp4 (97 frames @24fps, phases undamaged 1 ->
lift 18 -> loose-plate-pose 49 -> damaged-hold 97). The prompt's authoritative motion: only the
existing flat dark blue-grey armour cap peels slightly upward about its original inner long
attachment edge, rocks once under load, and settles partly raised with a narrow structural gap
beneath it — one thin rigid plate, no growing box, no detached part.

Mechanism truth: ShoulderCap's outline [(4.0,3.4),(3.1,5.8),(0.5,5.8),(0.5,3.4)] makes y=3.4 the
inner long edge — the hinge line. The pivot sits on that edge's midpoint at the plate's bottom
plane so the outboard lip peels up as one rigid rotation (proposedGeometry: null — the source
part is authoritative).

Groups:
  kestrel_armor_cap   hinge pivot on the inner edge — the only moving group.

Clips:
  armorPeel   lift ~15 deg, one weighted rock back, settle at ~10 deg raised (endMode
              'hold' — the peel IS the damage state; it stays up)
  armorStow   short re-seat when a repair completion finishes the hull (endMode 'hold' —
              a rest-ended clip parks and lets armorPeel's held pose re-claim the group;
              holding at rest keeps the cap seated until the next hull hit re-peels it)

Bank routes: kestrel:armorPeel -> armorPeel, kestrel:armorFix -> armorStow.
"""
import math
import os
import sys

from mathutils import Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'kestrel_armor'
PEEL_RAD = math.radians(10)      # settled damaged-hold — a narrow structural gap

EVENTS = {
    'kestrel:armorPeel': 'armorPeel',
    'kestrel:armorFix': 'armorStow',
}


def register(ship, parts):
    """parts: {'cap': obj} — the authored ShoulderCap plate itself."""
    ship.motion_group('kestrel_armor_cap', pivot=(2.25, 3.4, 0.62), objects=[parts['cap']])


def author(bank):
    """One lift, one rock, a weighted settle — then the damage stays."""
    peel = next(c for c in bank.clips if c.name == 'armorPeel')
    peel_keys = [
        (0.00, 0.0), (0.22, 0.10), (0.48, 0.26), (0.68, 0.30),   # lift + load rock up
        (0.95, 0.09), (1.20, 0.22), (1.50, 0.13),                # the single rock back
        (1.95, PEEL_RAD), (2.60, PEEL_RAD),                      # settle: ~10 deg raised gap
    ]
    for t, a in peel_keys:
        peel.key('kestrel_armor_cap', t, rot=Euler((a, 0.0, 0.0)))

    fix = next(c for c in bank.clips if c.name == 'armorStow')
    for t, a in [(0.00, PEEL_RAD), (0.45, 0.05), (0.75, -0.012), (0.90, 0.0)]:
        fix.key('kestrel_armor_cap', t, rot=Euler((a, 0.0, 0.0)))


def build(ship, parts, source_asset_id, bank=None):
    """Register groups and author clips into the ship's shared motion bank (ANI-01's)."""
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    bank.clip('armorPeel', 2.6, loop=False, end_mode='hold')
    bank.clip('armorStow', 0.9, loop=False, end_mode='hold')
    author(bank)
    return bank
