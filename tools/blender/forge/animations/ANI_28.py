"""ANI-28 — ore-barge loading claw cycle.

Working miners and haulers used to run pure waypoint loops with a dead crane
bolted to the deck. The barge's gantry claw now lives: a slack idle sway while
it loiters, and a full bite/lift/traverse/dump/home cycle when ore is collected
or a miner relocates — the haul becomes visible at range.

Groups (nested — jaws ride the drop carriage, carriage rides the trolley)
  barge_trolley   — gantry trolley traversing the beam (±y).
  barge_claw      — cable + grab head, drops toward the hopper (-z).
  barge_claw_l    — port jaw blade, hinge at the grab head (+x hinge).
  barge_claw_r    — starboard jaw blade, mirrored hinge.

Clips
- claw_idle      (14s, loop): trolley drift + grab sway — slack rig at anchor.
- claw_cycle     (4.8s, rest): drop, bite, lift, traverse to the hopper mouth,
  spill, trolley home. The whole pick in one shot.
- gantry_traverse (2.4s, rest): trolley sweeps beam-end to beam-end — a relocate.

Triggers: `authoredMotion:attach` -> claw_idle; `traffic:oreCollected` ->
claw_cycle (gated to the carrier's own rig); `npcjobs:minerRelocated` ->
gantry_traverse.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402

RIG_ID = 'ore_barge'

TROLLEY_SPAN = 2.2    # beam-end to beam-end traverse
CYCLE_TRAVERSE = 1.35 # hopper-mouth position for the dump
CLAW_DROP = -1.3      # grab descent below the beam
JAW_OPEN = 0.55       # hinge swing (radians about x)
IDLE_PERIOD = 14.0

# clip.key loc is the absolute local translation: each group's home is its rest
# offset from its parent, so travel keys are home + the slide along the rail.
TROLLEY_HOME = (1.5, 1.6, 3.5)
CLAW_HOME = (0.0, 0.0, -0.3)  # hangs 0.3 under the trolley


def register(ship, parts):
    """parts: {'trolley': obj, 'carriage': [objs], 'jawL': obj, 'jawR': obj}."""
    ship.motion_group('barge_trolley', pivot=(1.5, 1.6, 3.5), objects=[parts['trolley']])
    ship.motion_group('barge_claw', pivot=(1.5, 1.6, 3.2), objects=list(parts['carriage']),
                      parent='barge_trolley')
    ship.motion_group('barge_claw_l', pivot=(1.5, 1.32, 2.55), objects=[parts['jawL']],
                      parent='barge_claw')
    ship.motion_group('barge_claw_r', pivot=(1.5, 1.88, 2.55), objects=[parts['jawR']],
                      parent='barge_claw')


def _jaws(clip, keys):
    """keys: [(t, open_rad)] — a>0 spreads the blade tips; hinges sit at the blade tops,
    so the port blade opens on -x and the starboard on +x."""
    for t, a in keys:
        clip.key('barge_claw_l', t, rot=Euler((-a, 0.0, 0.0)))
        clip.key('barge_claw_r', t, rot=Euler((a, 0.0, 0.0)))


def author(bank):
    # --- idle: heavy-rig drift — trolley creeps, grab sways under it --------------------
    c = bank.clip('claw_idle', IDLE_PERIOD, loop=True)
    sway = ((0.0, 0.0), (3.5, 0.5), (7.0, -0.35), (10.5, 0.2), (14.0, 0.0))
    for t, y in sway:
        c.key('barge_trolley', t,
              loc=(TROLLEY_HOME[0], TROLLEY_HOME[1] + y, TROLLEY_HOME[2]))
    for t, x in ((0.0, 0.0), (4.0, 0.06), (9.0, -0.05), (14.0, 0.0)):
        c.key('barge_claw', t,
              loc=(CLAW_HOME[0] + x, CLAW_HOME[1], CLAW_HOME[2]))

    # --- the pick: drop, bite, lift, traverse, spill, come home -------------------------
    c = bank.clip('claw_cycle', 4.8, loop=False, end_mode='rest')
    # carriage drop/hold/lift
    for t, f in ((0.0, 0.0), (0.7, 1.0), (2.0, 1.0), (2.6, 0.0), (4.8, 0.0)):
        c.key('barge_claw', t,
              loc=(CLAW_HOME[0], CLAW_HOME[1], CLAW_HOME[2] + CLAW_DROP * f))
    # jaws: open on the way down, bite, hold the load, spill over the hopper, stow
    _jaws(c, [
        (0.0, 0.0), (0.7, JAW_OPEN), (1.1, JAW_OPEN), (1.5, 0.0),
        (3.0, 0.0), (3.4, JAW_OPEN), (3.9, JAW_OPEN), (4.3, 0.0), (4.8, 0.0)])
    # trolley: wait for the bite, run to the hopper mouth, come home
    for t, y in ((0.0, 0.0), (2.0, 0.0), (2.7, CYCLE_TRAVERSE * 0.7), (3.05, CYCLE_TRAVERSE),
                 (4.05, CYCLE_TRAVERSE), (4.5, 0.0), (4.8, 0.0)):
        c.key('barge_trolley', t,
              loc=(TROLLEY_HOME[0], TROLLEY_HOME[1] + y, TROLLEY_HOME[2]))

    # --- traverse: full beam sweep with a grab drag — the crane relocates ----------------
    c = bank.clip('gantry_traverse', 2.4, loop=False, end_mode='rest')
    for t, y in ((0.0, 0.0), (0.6, TROLLEY_SPAN * 0.55), (1.2, TROLLEY_SPAN),
                 (1.5, TROLLEY_SPAN), (2.0, 0.3), (2.4, 0.0)):
        c.key('barge_trolley', t,
              loc=(TROLLEY_HOME[0], TROLLEY_HOME[1] + y, TROLLEY_HOME[2]))
    for t, x in ((0.0, 0.0), (0.5, 0.09), (1.6, -0.05), (2.4, 0.0)):
        c.key('barge_claw', t,
              loc=(CLAW_HOME[0] + x, CLAW_HOME[1], CLAW_HOME[2]))
    _jaws(c, [(0.0, 0.0), (0.5, 0.12), (1.9, 0.1), (2.4, 0.0)])


EVENTS = {
    'authoredMotion:attach': 'claw_idle',
    'traffic:oreCollected': 'claw_cycle',
    'npcjobs:minerRelocated': 'gantry_traverse',
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
