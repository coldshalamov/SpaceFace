"""ANI-23 — salvage-cutter jaw idle micro-chomp.

An idling cutter should look hungry: the jaw pair breathes a shallow open-close
(small fraction of the work gape) while the ram pair inches its stroke like a
machine checking its bite.

Clips
- jaw_idle_chomp (5.0s, loop): jaws breathe ~8% gape, rams creep ~4% slide, phase-offset.

Trigger: `authoredMotion:attach` (ambient). The jawOpen/bite/release clips supersede
cleanly by group claim and the chomp resumes when they park. (cutComplete stays mapped
to jawBite — the bite landing on completion is the established event contract.)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler, Vector  # noqa: E402

PERIOD_S = 5.0
IDLE_GAPE_RAD = math.radians(4.0)     # ~8% of the work gape
IDLE_SLIDE_M = 0.06
RAM_SLIDE_M = 1.55                     # matches ANI_09 stroke
RAM_YAW = math.radians(2.0)
BRACE_SLIDE_M = 0.9                    # partial ram stroke — braced, not a work cut
BRACE_GAPE_RAD = math.radians(7.0)     # jaws close down hard against the blast


def author(bank):
    chomp = bank.clip('jaw_idle_chomp', PERIOD_S, loop=True, end_mode='rest')
    keys = 15
    for side in ('port', 'star'):
        sgn = 1.0 if side == 'port' else -1.0
        jaw = f'salvage_jaw_{side}'
        ram = f'salvage_ram_{side}'
        ram_rest = bank.ship.motion_pivots[ram].matrix_basis.translation
        rod_dir = Vector((1.8, sgn * 0.32, -0.15)).normalized()
        phase_off = 0.0 if side == 'port' else 0.35 * PERIOD_S
        for k in range(keys):
            t = k * PERIOD_S / (keys - 1)
            phase = 2 * math.pi * (t - phase_off) / PERIOD_S
            gape = IDLE_GAPE_RAD * (0.5 + 0.5 * math.cos(phase))
            slide = IDLE_SLIDE_M * (0.5 - 0.5 * math.cos(phase))
            at = ram_rest + rod_dir * -slide
            chomp.key(jaw, t, rot=Euler((0.0, 0.0, sgn * gape)))
            chomp.key(ram, t, loc=(at.x, at.y, at.z),
                      rot=Euler((0.0, 0.0, sgn * (slide / RAM_SLIDE_M) * RAM_YAW)))

    # Core eject: the cutter slams its rams home and clamps the gape shut — a
    # full brace against the blast the moment the hot core vents.
    brace = bank.clip('ram_brace', 0.9, loop=False, end_mode='rest')
    for side in ('port', 'star'):
        sgn = 1.0 if side == 'port' else -1.0
        jaw = f'salvage_jaw_{side}'
        ram = f'salvage_ram_{side}'
        ram_rest = bank.ship.motion_pivots[ram].matrix_basis.translation
        rod_dir = Vector((1.8, sgn * 0.32, -0.15)).normalized()
        for t, f in ((0.0, 0.0), (0.12, 0.85), (0.3, 1.0), (0.5, 0.94),
                     (0.7, 0.6), (0.85, 0.2), (0.9, 0.0)):
            at = ram_rest + rod_dir * (-BRACE_SLIDE_M * f)
            brace.key(jaw, t, rot=Euler((0.0, 0.0, sgn * BRACE_GAPE_RAD * f)))
            brace.key(ram, t, loc=(at.x, at.y, at.z),
                      rot=Euler((0.0, 0.0, sgn * (f * BRACE_SLIDE_M / RAM_SLIDE_M) * RAM_YAW)))


EVENTS = {
    'authoredMotion:attach': 'jaw_idle_chomp',
    'salvage:coreEjected': 'ram_brace',
}


def build(ship, parts, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, 'salvage_cutter_jaw', source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
