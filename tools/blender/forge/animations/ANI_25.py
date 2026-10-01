"""ANI-25 — dock berth clamps + umbilical boom: the bay's handshake.

The dock interior is the single most-viewed model in the game and the dock verb
used to resolve with zero body language on the bay side. The cradle jaws now
gape in greeting when a ship enters range, slide in and grip with a staggered
seat while the service boom telescopes out to mate, flare open in refusal on a
denied request, and retract on release. All three interiors (standard, grit,
military) share dock_interior_kit.build_hangar, so one rig covers every bay.

Groups
  dock_clamp_l / dock_clamp_r — cradle arm + pad jaws either side of the pad.
  dock_umbilical             — service boom arm + coupler head, back-right deck.

Clips
- dock_anticipate (1.0s, rest): clamps crack open and the boom stirs — ready stance.
- dock_engage     (1.8s, hold): port leads starboard by a beat; boom extends with
  coupler overshoot. Holds for the whole berth.
- dock_release    (1.2s, rest): boom retracts first, jaws home last.
- clamp_denied_flare (0.8s, rest): jaws snap wide, boom flinches back — a refusal.

Triggers: `dock:range` -> dock_anticipate (render-side gate on payload.inRange);
`dock:docked` -> dock_engage; `dock:undocked` -> dock_release;
`dock:denied` -> clamp_denied_flare.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'dock_interior'

CLAMP_GRIP_X = 1.35    # jaws travel inward to meet the hull
CLAMP_GAPE_X = -0.4    # anticipation crack (outward)
CLAMP_DENY_X = -0.8    # refusal flare (outward)
CLAMP_LIFT_Z = 0.12    # grip also climbs a touch — pads ride up onto the hull
BOOM_EXT_Y = -3.0      # telescoping stroke toward the pad (-y blender = +z glTF wall fwd)
BOOM_STIR_Y = -0.35
BOOM_FLINCH_Y = 0.5


def register(ship, parts):
    """parts: {'clampL': [objs], 'clampR': [objs], 'boom': [objs]}."""
    ship.motion_group('dock_clamp_l', pivot=(-4.4, -1.0, -3.2), objects=list(parts['clampL']))
    ship.motion_group('dock_clamp_r', pivot=(4.4, -1.0, -3.2), objects=list(parts['clampR']))
    ship.motion_group('dock_umbilical', pivot=(10.0, 12.0, -3.0), objects=list(parts['boom']))


def _clamp_keys(clip, keys):
    """keys: [(t, {group: (dx, dz)})] — group names 'l'/'r'."""
    for t, spec in keys:
        for side, (dx, dz) in spec.items():
            clip.key(f'dock_clamp_{side}', t, loc=(dx, 0.0, dz))


def author(bank):
    # --- anticipate: jaws crack open, boom stirs -------------------------------------
    c = bank.clip('dock_anticipate', 1.0, loop=False, end_mode='rest')
    _clamp_keys(c, [
        (0.0, {'l': (0.0, 0.0), 'r': (0.0, 0.0)}),
        (0.3, {'l': (CLAMP_GAPE_X, 0.0), 'r': (-CLAMP_GAPE_X, 0.0)}),
        (0.7, {'l': (CLAMP_GAPE_X * 0.8, 0.0), 'r': (-CLAMP_GAPE_X * 0.8, 0.0)}),
        (1.0, {'l': (0.0, 0.0), 'r': (0.0, 0.0)}),
    ])
    for t, f in ((0.0, 0.0), (0.35, 1.0), (0.65, 0.9), (1.0, 0.0)):
        c.key('dock_umbilical', t, loc=(0.0, BOOM_STIR_Y * f, 0.0),
              rot=Euler((0.0, 0.0, 0.0)))

    # --- engage: port jaw leads, starboard follows; boom telescopes with overshoot ----
    c = bank.clip('dock_engage', 1.8, loop=False, end_mode='hold')
    for t, f in ((0.0, 0.0), (0.35, 0.55), (0.7, 0.95), (0.9, 1.06), (1.15, 0.99),
                 (1.8, 1.0)):
        c.key('dock_clamp_l', t, loc=(CLAMP_GRIP_X * f, 0.0, CLAMP_LIFT_Z * f))
    for t, f in ((0.0, 0.0), (0.15, 0.0), (0.5, 0.5), (0.85, 0.92), (1.05, 1.05),
                 (1.3, 0.99), (1.8, 1.0)):
        c.key('dock_clamp_r', t, loc=(-CLAMP_GRIP_X * f, 0.0, CLAMP_LIFT_Z * f))
    for t, f, pitch in ((0.0, 0.0, 0.0), (0.5, 0.0, 0.0), (1.0, 0.6, 0.02),
                        (1.35, 1.05, 0.035), (1.6, 0.98, 0.03), (1.8, 1.0, 0.03)):
        c.key('dock_umbilical', t, loc=(0.0, BOOM_EXT_Y * f, 0.0),
              rot=Euler((pitch, 0.0, 0.0)))

    # --- release: boom home first, jaws follow -----------------------------------------
    c = bank.clip('dock_release', 1.2, loop=False, end_mode='rest')
    for t, f in ((0.0, 1.0), (0.4, 0.35), (0.75, 0.05), (0.9, 0.0), (1.2, 0.0)):
        c.key('dock_umbilical', t, loc=(0.0, BOOM_EXT_Y * f, 0.0))
    _clamp_keys(c, [
        (0.0, {'l': (CLAMP_GRIP_X, CLAMP_LIFT_Z), 'r': (-CLAMP_GRIP_X, CLAMP_LIFT_Z)}),
        (0.45, {'l': (CLAMP_GRIP_X * 0.9, CLAMP_LIFT_Z), 'r': (-CLAMP_GRIP_X * 0.9, CLAMP_LIFT_Z)}),
        (0.85, {'l': (0.05, 0.0), 'r': (-0.05, 0.0)}),
        (1.2, {'l': (0.0, 0.0), 'r': (0.0, 0.0)}),
    ])

    # --- denied: jaws flare open, boom recoils — the bay says no ------------------------
    c = bank.clip('clamp_denied_flare', 0.8, loop=False, end_mode='rest')
    _clamp_keys(c, [
        (0.0, {'l': (0.0, 0.0), 'r': (0.0, 0.0)}),
        (0.15, {'l': (CLAMP_DENY_X, 0.0), 'r': (-CLAMP_DENY_X, 0.0)}),
        (0.45, {'l': (CLAMP_DENY_X * 0.75, 0.0), 'r': (-CLAMP_DENY_X * 0.75, 0.0)}),
        (0.8, {'l': (0.0, 0.0), 'r': (0.0, 0.0)}),
    ])
    for t, f in ((0.0, 0.0), (0.2, 1.0), (0.8, 0.0)):
        c.key('dock_umbilical', t, loc=(0.0, BOOM_FLINCH_Y * f, 0.0))


EVENTS = {
    'dock:range': 'dock_anticipate',
    'dock:docked': 'dock_engage',
    'dock:undocked': 'dock_release',
    'dock:denied': 'clamp_denied_flare',
}


def build(ship, parts, source_asset_id, bank=None):
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
