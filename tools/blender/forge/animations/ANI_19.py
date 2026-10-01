"""ANI-19 — jump-gate emitter ambient roll.

The gate should feel energised even when nobody is charging: the twelve rim emitters
ride a slow travelling radial wave — each tip breathes outward in turn so a soft swell
walks around the ring like a rotating field, then hands off seamlessly because the
loop's first and last pose match.

Clips
- emitter_roll (6.0s, loop): per-tip radial breathing, phase-offset one twelfth of the
  period so the peak travels tip-to-tip. Amplitude is smaller than the ANI-15 index
  stroke and OUTWARD, so the ambient swell never reads as a charge.

Trigger: the synthetic `authoredMotion:attach` event (fired by the motion driver's
first update) starts the roll; the runtime re-enters it whenever event clips drain,
so the gate calms back to life after index/reset rather than freezing.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

N_SEG = 12
PERIOD_S = 6.0
AMP_M = 0.22     # ambient breathing amplitude — visibly gentle next to the 0.55 m index
TIP_R = 28.35


def author(bank):
    pivots = bank.ship.motion_pivots
    step = 2 * math.pi / N_SEG

    roll = bank.clip('emitter_roll', PERIOD_S, loop=True, end_mode='rest')
    keys = 13  # 30-degree phase resolution per tip — smooth enough at this amplitude
    for i in range(N_SEG):
        am = i * step + step / 2
        rest = pivots[f'gate_tip_{i}'].matrix_basis.translation
        dy = math.cos(am)
        dz = math.sin(am)
        phase = (i / N_SEG) * PERIOD_S
        for k in range(keys):
            t = k * PERIOD_S / (keys - 1)
            # cosine breathing: closed-form loop, first and last keys identical
            f = 0.5 + 0.5 * math.cos(2 * math.pi * (t - phase) / PERIOD_S)
            roll.key(f'gate_tip_{i}', t,
                     loc=(rest.x, rest.y + dy * AMP_M * f, rest.z + dz * AMP_M * f),
                     rot=Euler((0, 0, 0)))


EVENTS = {
    'authoredMotion:attach': 'emitter_roll',
}


def build(ship, parts, source_asset_id, bank=None):
    """Author ambient clips onto the existing ANI-15 tip groups and merge events."""
    if bank is None:
        bank = motion_bank.MotionBank(ship, 'gate_emitter_index', source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
