"""ANI-21 — yard-tug hook idle dangle + line quiver.

A moored tug's tow hook should read as suspended hardware, not a rigid hull part:
it hangs off the fairlead and sways slowly on its line, then trembles when the line
takes load — a snare arming or strain telemetry — before settling.

Clips
- hook_dangle (6.0s, loop): pendulum sway of the hook about the fairlead line axis;
  fairlead gets a faint sympathetic nod.
- line_quiver (0.6s, rest): fast low-amplitude shake on hook + fairlead for line load.

Triggers: `authoredMotion:attach` (ambient), `massline:snareArmed` and
`tether:strain` (quiver). Payout/catch/reel supersede cleanly because they claim the
same groups; the ambient pass resumes when they park.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

PERIOD_S = 6.0
DANGLE_SWAY_DEG = 2.4     # hook pendulum roll
DANGLE_BOB_M = 0.05       # tiny line take-up on the sway
FAIRLEAD_NOD_DEG = 0.4
QUIVER_AMP_M = 0.035
QUIVER_S = 0.6


def author(bank):
    pivots = bank.ship.motion_pivots
    hook_rest = pivots['yard_tug_hook'].matrix_basis.translation
    lead_rest = pivots['yard_tug_fairlead'].matrix_basis.translation

    dangle = bank.clip('hook_dangle', PERIOD_S, loop=True, end_mode='rest')
    keys = 17
    for k in range(keys):
        t = k * PERIOD_S / (keys - 1)
        phase = 2 * math.pi * t / PERIOD_S
        # pendulum: roll about x (line axis) with a soft y drift — swings like a hanging hook
        dangle.key('yard_tug_hook', t,
                   loc=(hook_rest.x, hook_rest.y + 0.06 * math.sin(phase),
                        hook_rest.z - DANGLE_BOB_M * (0.5 - 0.5 * math.cos(phase))),
                   rot=Euler((math.radians(DANGLE_SWAY_DEG) * math.sin(phase), 0, 0)))
        dangle.key('yard_tug_fairlead', t,
                   loc=(lead_rest.x, lead_rest.y, lead_rest.z),
                   rot=Euler((math.radians(FAIRLEAD_NOD_DEG) * math.sin(phase + 0.4), 0, 0)))

    quiver = bank.clip('line_quiver', QUIVER_S, loop=False, end_mode='rest')
    qk = [(0.0, 0.0), (0.08, 1.0), (0.16, -0.7), (0.26, 0.5), (0.36, -0.3),
          (0.48, 0.15), (QUIVER_S, 0.0)]
    for t, f in qk:
        quiver.key('yard_tug_hook', t,
                   loc=(hook_rest.x, hook_rest.y + QUIVER_AMP_M * f, hook_rest.z),
                   rot=Euler((0, 0, math.radians(1.2) * f)))
        quiver.key('yard_tug_fairlead', t,
                   loc=(lead_rest.x, lead_rest.y + QUIVER_AMP_M * 0.5 * f, lead_rest.z),
                   rot=Euler((0, 0, 0)))


EVENTS = {
    'authoredMotion:attach': 'hook_dangle',
    'massline:snareArmed': 'line_quiver',
    'tether:strain': 'line_quiver',
}


def build(ship, parts, source_asset_id, bank=None):
    if bank is None:
        bank = motion_bank.MotionBank(ship, 'yard_tug_winch', source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
