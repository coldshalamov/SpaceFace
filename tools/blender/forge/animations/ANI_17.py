"""ANI-17 — kestrel canopy hatch cycle on repair service.

A repair job physically opens the cockpit: the canopy blister hinges up on its
aft edge while the pod service arm works (ANI-06), then swings shut when the job
ends. Fighter-canopy grammar — slow rise with a hydraulic settle, brisk positive
close with a seat knock. It only opens for repair work (a refuel doesn't crack
the cockpit), reusing the arm lifecycle dispatch.

Groups
  kestrel_canopy — hinge pivot on the canopy's aft edge.

Clips
- canopyOpen (1.4s, hold): 0 -> ~38deg rise, small hydraulic settle into hold.
- canopyClose (1.1s, rest): swing shut with a seat knock at the sill.

Triggers: `kestrel:canopyOpen` / `kestrel:canopyClose` (dispatched render-side
alongside the pod-arm service lifecycle).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'kestrel_canopy'
OPEN_RAD = 0.66   # ~38deg up


def register(ship, parts):
    """parts: {'canopy': obj} — the glass loft. Hinge sits on its aft edge, sill height."""
    ship.motion_group(RIG_ID, pivot=(2.6, 0.0, 1.62), objects=[parts['canopy']])


def author(bank):
    # Negative Y pitches the bow end up (right-hand rule about the lateral axis).
    up = bank.clip('canopyOpen', 1.4, loop=False, end_mode='hold')
    for t, f in [(0.0, 0.0), (0.30, 0.30), (0.60, 0.78), (0.85, 1.0),
                 (1.05, 1.06), (1.2, 0.99), (1.4, 1.0)]:
        up.key(RIG_ID, t, rot=Euler((0.0, -OPEN_RAD * f, 0.0)))

    down = bank.clip('canopyClose', 1.1, loop=False, end_mode='rest')
    for t, f in [(0.0, 1.0), (0.20, 0.96), (0.50, 0.62), (0.75, 0.22),
                 (0.88, 0.04), (0.95, 0.10), (1.1, 0.0)]:
        down.key(RIG_ID, t, rot=Euler((0.0, -OPEN_RAD * f, 0.0)))


EVENTS = {
    'kestrel:canopyOpen': 'canopyOpen',
    'kestrel:canopyClose': 'canopyClose',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
