"""ANI-30 — inspection-cutter boarding arm + scan array.

Customs and interdiction are the cutter's whole job and its most dramatic verbs
played with the hull frozen: the boarding clamp now slides out on its mount when
a lawful inspection opens, the forward scan ring whooshes a sweep when the
patrol's sensors roll over you, and the arm stows when the scan breaks or the
verdict clears. An idle ring crawl keeps the hull alive while it loiters.

Groups
  cutter_arm      — boarding clamp column (tube, collar, seal, claws), port flank.
  cutter_scanring — forward scanner ring around the dome seat.

Clips
- arm_extend    (1.6s, hold): column slides +y with a collar lag, claws seat.
- scanring_sweep (1.8s, rest): ring spins ~1.5 turns, ease-out glide — one sweep.
- arm_retract   (1.2s, rest): column stows home.
- scan_idle     (11s, loop): slow continuous ring crawl — the loiter spin.

Triggers: `lawfulInspection:choose` / `customs:submit` -> arm_extend;
`player:scannedByPatrol` -> scanring_sweep; `customs:breakScan` -> arm_retract;
`authoredMotion:attach` -> scan_idle.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'inspection_cutter'

ARM_EXT_Y = 0.9        # column stroke along its mount axis (+y blender = +y glTF)
ARM_COLLAR_LAG = 0.12  # collar trails the column — telescoping read
SWEEP_TURNS = 2.0    # whole turns so the rest-ended sweep parks on identity
IDLE_PERIOD = 11.0

# clip.key loc is the absolute local translation: extend/sweep keys ride the
# group's home offset plus the stroke so the rig slides instead of snapping.
ARM_HOME = (-0.6, 1.3, 0.2)
RING_HOME = (4.6, 0.0, 1.2)


def register(ship, parts):
    """parts: {'arm': [objs], 'scanring': obj}."""
    ship.motion_group('cutter_arm', pivot=(-0.6, 1.3, 0.2), objects=list(parts['arm']))
    ship.motion_group('cutter_scanring', pivot=(4.6, 0.0, 1.2), objects=[parts['scanring']])


def author(bank):
    # --- extend: column out fast, small overshoot, settle on the hull -------------------
    c = bank.clip('arm_extend', 1.6, loop=False, end_mode='hold')
    for t, f in ((0.0, 0.0), (0.4, 0.0), (0.8, 0.72), (1.15, 1.04), (1.35, 0.98),
                 (1.6, 1.0)):
        c.key('cutter_arm', t,
              loc=(ARM_HOME[0], ARM_HOME[1] + ARM_EXT_Y * f, ARM_HOME[2]))

    # --- sweep: accelerate into the spin, glide out — one clean sensor pass --------------
    c = bank.clip('scanring_sweep', 1.8, loop=False, end_mode='rest')
    sweep = ((0.0, 0.0), (0.3, 0.35), (0.7, 0.95), (1.2, 1.3), (1.55, 1.47), (1.8, 1.5))
    for t, turns in sweep:
        c.key('cutter_scanring', t, rot=Euler((0.0, 0.0, turns * 6.283185307179586)))
    for t, f in ((0.0, 0.0), (0.4, 1.0), (0.9, 0.6), (1.8, 0.0)):
        c.key('cutter_scanring', t,
              loc=(RING_HOME[0], RING_HOME[1], RING_HOME[2] + 0.12 * f))

    # --- retract: smooth stow home ------------------------------------------------------
    c = bank.clip('arm_retract', 1.2, loop=False, end_mode='rest')
    for t, f in ((0.0, 1.0), (0.35, 0.85), (0.8, 0.15), (1.05, 0.02), (1.2, 0.0)):
        c.key('cutter_arm', t,
              loc=(ARM_HOME[0], ARM_HOME[1] + ARM_EXT_Y * f, ARM_HOME[2]))

    # --- idle: the ring never fully sleeps on a customs hull ----------------------------
    c = bank.clip('scan_idle', IDLE_PERIOD, loop=True)
    for i in range(4):
        c.key('cutter_scanring', i * IDLE_PERIOD / 3.0,
              rot=Euler((0.0, 0.0, i * 6.283185307179586 / 3.0)))


EVENTS = {
    'authoredMotion:attach': 'scan_idle',
    'lawfulInspection:choose': 'arm_extend',
    'customs:submit': 'arm_extend',
    'player:scannedByPatrol': 'scanring_sweep',
    'customs:breakScan': 'arm_retract',
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
