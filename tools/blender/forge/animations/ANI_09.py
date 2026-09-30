"""ANI-09 — Salvage-cutter hydraulic jaw: gape open, bite, release.

Reference: assets/animation-references/videos/ANI-09.mp4 (~97 frames @24 fps, ~4 s). The prompt's
authoritative motion: the two forward jaws rotate outward ~20° on their existing shoulder hinge
pins, hold briefly, then return to the original gape; the silver hydraulic rods slide within
their cylinders keeping both ends attached. Hull, cab, scrap cage, shredder never move.

Mechanism truth (rigid parts only, proposedGeometry: null):
  - Each jaw (plate + blade + glow edge + ram lug) yaws about the Z axis through its JawPivot
    pin (x=4.6, y=±1.3). Port opens +Z, starboard -Z — mirrored.
  - JawRamRod is a rigid rod: as the jaw opens the lug swings outward-and-aft, shortening the
    hull-to-lug span, so the rod retracts into its cylinder and re-aims toward the lug. Sold as
    one yaw about the rod's hull-end pivot plus a small slide along its own axis — no stretching.

Groups: salvage_jaw_port / salvage_jaw_star / salvage_ram_port / salvage_ram_star.
Clips: jawOpen (0.9 s hold), jawBite (0.45 s hold — one chomp per cut/yield),
jawRelease (0.9 s rest — parks at the original gape).
"""
import math
import os
import sys

from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'salvage_cutter_jaw'
GAPE_RAD = math.radians(20.0)     # ~20° outward yaw per the reference
BITE_RAD = math.radians(6.0)      # the chomp closes past the gape a touch, then re-opens
RAM_YAW = math.radians(26.0)      # rod re-aim toward the swung lug
RAM_SLIDE_M = 0.30                # rod retracts into its cylinder as the span shortens

EVENTS = {
    'salvage:npcExtraction': 'jawCycle',
    'mining:start': 'jawOpen',
    'mining:yield': 'jawBite',
    'salvage:cutComplete': 'jawBite',
    'mining:stop': 'jawRelease',
    'beam:denied': 'jawRelease',
}


def register(ship, parts):
    """parts: {'jaw_port':[objs], 'jaw_star':[objs], 'ram_port':[objs], 'ram_star':[objs]}."""
    ship.motion_group('salvage_jaw_port', pivot=(4.6, 1.3, 0.0), objects=parts['jaw_port'])
    ship.motion_group('salvage_jaw_star', pivot=(4.6, -1.3, 0.0), objects=parts['jaw_star'])
    ship.motion_group('salvage_ram_port', pivot=(4.5, 2.68, 0.55), objects=parts['ram_port'])
    ship.motion_group('salvage_ram_star', pivot=(4.5, -2.68, 0.55), objects=parts['ram_star'])


def author(bank):
    for side in ('port', 'star'):
        sgn = 1.0 if side == 'port' else -1.0
        jaw = f'salvage_jaw_{side}'
        ram = f'salvage_ram_{side}'
        jaw_pivot = bank.ship.motion_pivots[jaw]
        ram_pivot = bank.ship.motion_pivots[ram]
        ram_rest = ram_pivot.matrix_basis.translation
        # rod axis from hull end toward the lug (mirrored on y)
        rod_dir = Vector((1.8, sgn * 0.32, -0.15)).normalized()
        ram_at = lambda d: (ram_rest + rod_dir * -d)[:]

        for clip_name, jaw_keys, ram_keys in (
            ('jawOpen',
             [(0.0, 0.0), (0.3, GAPE_RAD * 0.9), (0.45, GAPE_RAD * 1.03),
              (0.6, GAPE_RAD), (0.9, GAPE_RAD)],
             [(0.0, 0.0), (0.35, 0.85), (0.55, 1.0), (0.9, 1.0)]),
            ('jawBite',
             [(0.0, GAPE_RAD), (0.12, GAPE_RAD - BITE_RAD), (0.24, GAPE_RAD - BITE_RAD * 0.3),
              (0.45, GAPE_RAD)],
             [(0.0, 1.0), (0.12, 0.7), (0.45, 1.0)]),
            ('jawRelease',
             [(0.0, GAPE_RAD), (0.35, GAPE_RAD * 0.4), (0.6, 0.01), (0.9, 0.0)],
             [(0.0, 1.0), (0.4, 0.35), (0.7, 0.0), (0.9, 0.0)]),
            ('jawCycle',
             [(0.0, 0.0), (0.35, GAPE_RAD * 0.95), (0.55, GAPE_RAD * 1.03),
              (0.8, GAPE_RAD), (1.2, GAPE_RAD * 0.96), (1.6, GAPE_RAD * 0.3),
              (1.9, 0.01), (2.1, 0.0)],
             [(0.0, 0.0), (0.4, 0.9), (0.7, 1.0), (1.3, 0.95),
              (1.7, 0.3), (2.0, 0.0), (2.1, 0.0)]),
        ):
            clip = next(c for c in bank.clips if c.name == clip_name)
            for t, a in jaw_keys:
                clip.key(jaw, t, rot=Euler((0.0, 0.0, sgn * a)))
            for t, k in ram_keys:
                clip.key(ram, t, loc=ram_at(k * RAM_SLIDE_M), rot=Euler((0.0, 0.0, sgn * k * RAM_YAW)))


def build(ship, parts, source_asset_id, bank=None):
    """Register the four groups and author the clips. Call before export_ship."""
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    bank.clip('jawOpen', 0.9, loop=False, end_mode='hold')
    bank.clip('jawBite', 0.45, loop=False, end_mode='hold')
    bank.clip('jawRelease', 0.9, loop=False, end_mode='rest')
    bank.clip('jawCycle', 2.1, loop=False, end_mode='rest')
    author(bank)
    return bank
