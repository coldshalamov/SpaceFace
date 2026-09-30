"""ANI-15 — jump-gate emitter index, lock and reset.

The twelve rim emitters already point their small white tips at the aperture; this
rig makes those tips ride a short radial carriage stroke. On a gate jump charge the
tips index inward (< one tip-length), settle together into an energised hold for as
long as the charge lasts, then return to rest when the jump fires or aborts.

Clips
- index (0.55s, hold): simultaneous inward stroke with a two-beat mechanical settle.
- reset (0.7s, rest): calm return, slight ease into parked.

Events come from authoredMotion.js's gate routing: gate:range remembers the gate the
player is charged at, jump:chargeStart (via 'gate') fires gate:index, and
jump:start / jump:arrive / jump:chargeAbort fire gate:reset.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'gate_emitter_index'

N_SEG = 12
STROKE_M = 0.55   # radial inward index stroke, < one tip length (1.1)
TIP_R = 28.35     # pivot radius of the tip carriage (matches the builder's glow tips)


def register(ship, parts):
    """parts: {'tips': [[EmitTip, EmitTipGlow] x12]} — one motion group per emitter,
    pivot on the tip so the whole carriage slides as one solid block."""
    step = 2 * math.pi / N_SEG
    for i in range(N_SEG):
        # segment emitter centre angle matches the builder's am = gc + step/2
        am = i * step + step / 2 - math.radians(0.0)
        ship.motion_group(f'gate_tip_{i}', pivot=(0.0, TIP_R * math.cos(am), TIP_R * math.sin(am)),
                          objects=parts['tips'][i])


def author(bank):
    pivots = bank.ship.motion_pivots
    step = 2 * math.pi / N_SEG

    # ---- index ---------------------------------------------------------------
    index = bank.clip('index', 0.55, loop=False, end_mode='hold')
    # two-beat carriage stroke: fast travel, small check, settle into the hold
    keys = [(0.0, 0.0), (0.16, 0.62), (0.3, 0.82), (0.42, 0.97), (0.55, 1.0)]
    for i in range(N_SEG):
        am = i * step + step / 2
        rest = pivots[f'gate_tip_{i}'].matrix_basis.translation
        # inward = decreasing radius in the y-z ring plane
        dx, dy, dz = 0.0, -math.cos(am) * STROKE_M, -math.sin(am) * STROKE_M
        for t, f in keys:
            index.key(f'gate_tip_{i}', t,
                      loc=(rest.x + dx * f, rest.y + dy * f, rest.z + dz * f),
                      rot=Euler((0, 0, 0)))

    # ---- reset ---------------------------------------------------------------
    reset = bank.clip('reset', 0.7, loop=False, end_mode='rest')
    back = [(0.0, 1.0), (0.2, 0.7), (0.42, 0.16), (0.58, 0.02), (0.7, 0.0)]
    for i in range(N_SEG):
        am = i * step + step / 2
        rest = pivots[f'gate_tip_{i}'].matrix_basis.translation
        dx, dy, dz = 0.0, -math.cos(am) * STROKE_M, -math.sin(am) * STROKE_M
        for t, f in back:
            reset.key(f'gate_tip_{i}', t,
                      loc=(rest.x + dx * f, rest.y + dy * f, rest.z + dz * f),
                      rot=Euler((0, 0, 0)))


EVENTS = {
    'gate:index': 'index',
    'gate:reset': 'reset',
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
