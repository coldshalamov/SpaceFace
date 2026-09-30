"""ANI-05 — Kestrel boost-drive iris: petals slide, powered hold, actuator lock, retract.

Reference: assets/animation-references/videos/ANI-05.mp4 (97 frames @ 24 fps, ~4 s). The prompt's
authoritative motion: inside the aft DriveBell's blue exhaust opening, six compact rigid metal
iris petals slide a little outward from under the inner rim, reveal the blue core during a brief
powered hold, then slide back to their hidden positions. The nozzle diameter, collar, clamps and
hull never move.

Geometry (allowed by proposedGeometry): six trapezoid petal plates + nothing else, authored inside
the bell mouth at x=-14.2 — tucked radially outward under the rim at rest so the nozzle reads as
the plain glowing core; on boost they slide toward the axis and form the six-blade fan with the
glowing core showing between blades.

Groups: kestrel_iris_0..5 — one root-mounted pivot per petal, translation-only slides along the
petal's own radial direction.

Clips: prime (0.35 s hold) — petal tips emerge on the pre-kick; ignite (0.85 s hold) — full
extension with an actuator-lock settle; stow (1.0 s rest) — retract under the rim and park.
Bank routes: ship:boostPreKick -> prime, ship:boostStart -> ignite, ship:boostStop -> stow.
"""
import math
import os
import sys

from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'kestrel_iris'
PETALS = 6
TRAVEL_M = 1.22        # tips sweep from r~1.42 (hidden inside the throat wall) to r~0.2
PRIME_M = 0.4          # the pre-kick's partial extension
PETAL_X = -13.55       # 0.05 aft of the glow disc (-13.5): blades cover the glow when extended;

EVENTS = {
    'ship:boostPreKick': 'irisPrime',
    'ship:boostStart': 'irisIgnite',
    'ship:boostStop': 'irisStow',
}


def petal_outline(angle):
    """Trapezoid in the (y, z) plane: narrow tip at r~1.7, wide heel at r~2.45, centred on the
    petal's radial direction. Rest chord lives inside the bell's inner wall (r 1.6-2.27), so
    the stowed iris is invisible from outside."""
    c, s = math.cos(angle), math.sin(angle)
    dir_ = Vector((c, s))
    tan = Vector((-s, c))
    p_in = dir_ * 1.42
    p_out = dir_ * 2.05
    pts = [p_in + tan * 0.24, p_in - tan * 0.24, p_out - tan * 0.55, p_out + tan * 0.55]
    return [(p.x, p.y) for p in pts]


def register(ship, parts):
    """parts: {'petals': [six petal objects in slot order]}."""
    for i, petal in enumerate(parts['petals']):
        a = math.radians(i * 60 + 30)
        ship.motion_group(f'kestrel_iris_{i}',
                          pivot=(PETAL_X, 1.73 * math.cos(a), 1.73 * math.sin(a)),
                          objects=[petal])


def author(bank):
    """Keyframe prime/ignite/stow — each petal slides along its own radial direction."""
    for i in range(PETALS):
        a = math.radians(i * 60 + 30)
        pivot = bank.ship.motion_pivots[f'kestrel_iris_{i}']
        rest = pivot.matrix_basis.translation
        inward = Vector((0.0, -math.cos(a), -math.sin(a)))

        def at(d, _rest=rest, _inward=inward):
            v = _rest + _inward * d
            return (v.x, v.y, v.z)

        for clip_name, keys in (
            ('irisPrime', [(0.0, 0.0), (0.18, PRIME_M * 0.75), (0.28, PRIME_M + 0.03),
                       (0.35, PRIME_M)]),
            ('irisIgnite', [(0.0, PRIME_M), (0.14, 0.95), (0.3, TRAVEL_M + 0.06),
                        (0.5, TRAVEL_M - 0.02), (0.85, TRAVEL_M)]),
            ('irisStow', [(0.0, TRAVEL_M), (0.4, 0.25), (0.7, -0.01), (1.0, 0.0)]),
        ):
            clip = next(c for c in bank.clips if c.name == clip_name)
            for t, d in keys:
                clip.key(f'kestrel_iris_{i}', t, loc=at(d))


def build(ship, parts, source_asset_id, bank=None):
    """Register groups and author clips. `bank` is the ship's shared motion bank (ANI-01's);
    all Kestrel rigs live in kestrel.motion.json. Call before export_ship."""
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    bank.clip('irisPrime', 0.35, loop=False, end_mode='hold')
    bank.clip('irisIgnite', 0.85, loop=False, end_mode='hold')
    bank.clip('irisStow', 1.0, loop=False, end_mode='rest')
    author(bank)
    return bank
