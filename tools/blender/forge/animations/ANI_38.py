"""ANI-38 — chassis secondary-motion kit: one rig for every flying hull.

The bespoke banks (wasp, hornet, the work rigs) animate authored parts, but the
rest of the fleet — a dozen player hulls and the traffic wholeships — had no
motion at all: dead airframes sliding through space. This kit hangs the entire
ship under a single root pivot and gives every hull the same chassis grammar a
ship handler would read from a real craft:

Clips
- hull_idle  (8.0s loop): slow roll/pitch breathing + a faint heave — a hull
              under power never sits perfectly still.
- hull_brace (1.2s rest): nose comes up 2.2° and the hull settles level — the
              combat crouch, fired on telegraph verbs.
- hull_kick  (0.9s rest): the hull dips nose-down on boost ignition and springs
              back — chassis jolt on ship:boostStart/PreKick.
- hull_veer  (1.4s rest): banks hard through a roll excursion — evasive/flee.
- hull_wag   (1.6s rest): a wing-rock — the pass-by greeting when traffic hails.

Amplitudes stay small (whole-ship motion rides on top of the sim's own
transform; anything bigger would fight the flight model).

Triggers: `ai:telegraph`/`encounter:telegraph`/`encounter:predationTelegraph` /
`ai:stateChange` (brace), `ship:boostStart`/`ship:boostPreKick` (kick),
`ai:flee` (veer), `authoredMotion:attach` (idle) — all entity-addressed.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

# Hull frame: nose +X, up +Z — X rolls, Y pitches, Z yaws.
IDLE_ROLL = math.radians(0.45)
IDLE_PITCH = math.radians(0.28)
IDLE_HEAVE = 0.05          # WU
BRACE_PITCH = math.radians(2.2)
BRACE_ROLL = math.radians(-1.1)
KICK_PITCH = math.radians(-1.8)
KICK_HEAVE = -0.14
VEER_ROLL = math.radians(3.2)
VEER_YAW = math.radians(1.2)
WAG_ROLL = math.radians(4.5)


def register(ship, objects):
    """The whole airframe under one pivot at the origin — secondary motion only."""
    ship.motion_group('hull_core', pivot=(0.0, 0.0, 0.0), objects=list(objects))


def author(bank):
    # --- idle: the chassis breathes — roll and pitch 90° out of phase, faint heave ---
    idle = bank.clip('hull_idle', 8.0, loop=True, end_mode='rest')
    for i in range(9):
        t = i * 8.0 / 8
        ph = 2 * math.pi * t / 8.0
        idle.key('hull_core', t,
                 loc=(0.0, 0.0, IDLE_HEAVE * math.sin(ph)),
                 rot=Euler((IDLE_ROLL * math.sin(ph),
                            IDLE_PITCH * math.sin(ph + math.pi / 2), 0.0)))

    # --- brace: nose up into the intercept, level the wings ---------------------
    c = bank.clip('hull_brace', 1.2, loop=False, end_mode='rest')
    c.key('hull_core', 0.0, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))
    c.key('hull_core', 0.2, loc=(0.0, 0.0, 0.04), rot=Euler((0.0, BRACE_PITCH, 0.0)))
    c.key('hull_core', 0.55, loc=(0.0, 0.0, 0.03), rot=Euler((BRACE_ROLL, BRACE_PITCH * 0.9, 0.0)))
    c.key('hull_core', 0.85, loc=(0.0, 0.0, 0.01), rot=Euler((0.0, BRACE_PITCH * 0.35, 0.0)))
    c.key('hull_core', 1.2, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))

    # --- kick: boost ignition slams the nose down, chassis springs back ---------
    c = bank.clip('hull_kick', 0.9, loop=False, end_mode='rest')
    c.key('hull_core', 0.0, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))
    c.key('hull_core', 0.1, loc=(0.0, 0.0, KICK_HEAVE), rot=Euler((0.0, KICK_PITCH, 0.0)))
    c.key('hull_core', 0.4, loc=(0.0, 0.0, KICK_HEAVE * -0.25),
          rot=Euler((0.0, KICK_PITCH * -0.22, 0.0)))
    c.key('hull_core', 0.9, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))

    # --- veer: hard bank through a roll excursion, yaw washes out ---------------
    c = bank.clip('hull_veer', 1.4, loop=False, end_mode='rest')
    c.key('hull_core', 0.0, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))
    c.key('hull_core', 0.22, rot=Euler((VEER_ROLL, 0.0, VEER_YAW)))
    c.key('hull_core', 0.7, rot=Euler((VEER_ROLL * 0.82, 0.0, VEER_YAW * 0.9)))
    c.key('hull_core', 1.05, rot=Euler((VEER_ROLL * 0.25, 0.0, VEER_YAW * 0.3)))
    c.key('hull_core', 1.4, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))

    # --- wag: the passing-traffic greeting — rock the wings once ------------------
    c = bank.clip('hull_wag', 1.6, loop=False, end_mode='rest')
    c.key('hull_core', 0.0, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))
    c.key('hull_core', 0.25, rot=Euler((WAG_ROLL, 0.0, 0.0)))
    c.key('hull_core', 0.55, rot=Euler((-WAG_ROLL * 0.9, 0.0, 0.0)))
    c.key('hull_core', 0.85, rot=Euler((WAG_ROLL * 0.55, 0.0, 0.0)))
    c.key('hull_core', 1.15, rot=Euler((-WAG_ROLL * 0.2, 0.0, 0.0)))
    c.key('hull_core', 1.6, loc=(0.0, 0.0, 0.0), rot=Euler((0.0, 0.0, 0.0)))


EVENTS = {
    'authoredMotion:attach': 'hull_idle',
    'ai:telegraph': 'hull_brace',
    'encounter:telegraph': 'hull_brace',
    'encounter:predationTelegraph': 'hull_brace',
    'ai:stateChange': 'hull_brace',
    'ship:boostStart': 'hull_kick',
    'ship:boostPreKick': 'hull_kick',
    'ai:flee': 'hull_veer',
    'npc:hailed': 'hull_wag',
}


def build(ship, objects, source_asset_id, bank=None, rig_id='hull'):
    register(ship, objects)
    if bank is None:
        bank = motion_bank.MotionBank(ship, rig_id, source_asset_id,
                                    events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank


def bake_ship_banks(ship, written, bank_key, out_path=None):
    """Bake every *_bank attribute the ship built to <bank_key>.motion.json.

    Ship __main__ blocks call this after a --live export so a bank authored in
    build() is sealed next to the GLB it was baked against. Variants reach the
    same path through variant.main (the base build() already ran with the
    variant's fleet spec, so bindings/rest poses are the variant's own).
    """
    banks = [(name, getattr(ship, name)) for name in dir(ship)
             if name.endswith('_bank') and hasattr(getattr(ship, name, None), 'bake')]
    if not banks:
        return
    if out_path is None:
        out_path = os.path.join(motion_bank.MOTIONS_DIR, f'{bank_key}.motion.json')
    glb_paths = [path for path, _tris in written]
    for name, bank in banks:
        bank.bake(glb_paths, out_path=out_path)
        print(f'[ANI] baked {name} -> {out_path}')
