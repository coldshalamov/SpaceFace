"""ANI-44 — Stormshift collector: radiator fans fold from harvest to transit stow.

The collector works with its jaws and stacked ceramic radiator fans open. For a transit run the
six fan leaves fold inward onto the hull so the silhouette narrows and the fan edges clear the
tow line. The cheek jaws never move at runtime: they are compound collision members, so the bank
keeps them unkeyed (identity delta at every LOD, pinned by stormshift-collector-collision tests).

Groups
  stormshift_fan_port_0/1/2, stormshift_fan_starboard_0/1/2 — rigid radiator leaves on one
                       mechanical hub per side; each leaf rotates about its own hub Z to its
                       authored stowedRotationZ from the ship's rig contract.
  stormshift_cheek_port / stormshift_cheek_starboard — bound at rest only. Compound-solid.

Clips
- stormshift_stow (8 s, hold): every fan leaf rotates 0 -> stowedRotationZ with smootherstep ease.
- stormshift_deploy (8 s, rest): fans return stowedRotationZ -> 0. Ends at harvest rest.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'ships'))

import motion_bank  # noqa: E402
from mathutils import Euler  # noqa: E402
import stormshift_collector  # noqa: E402

RIG_ID = 'stormshift_collector'
MOVE_S = 8.0


def _sstep(u):
    u = 0.0 if u < 0.0 else 1.0 if u > 1.0 else u
    return u * u * u * (u * (6.0 * u - 15.0) + 10.0)


def _yaw(rad):
    return Euler((0.0, 0.0, rad))


def _fan_stows(ship):
    return {g['id']: g['stowedRotationZ'] for g in ship.rig_contract['groups']
            if g['id'].startswith('stormshift_fan_')}


def author(bank, stows):
    stow = bank.clip('stormshift_stow', MOVE_S, loop=False, end_mode='hold')
    deploy = bank.clip('stormshift_deploy', MOVE_S, loop=False, end_mode='rest')
    steps = max(8, int(MOVE_S * 15))
    for i in range(steps + 1):
        t = round(MOVE_S * i / steps, 4)
        u = _sstep(i / steps)
        for rig, target in stows.items():
            stow.key(rig, t, rot=_yaw(target * u))
            deploy.key(rig, t, rot=_yaw(target * (1.0 - u)))


def build(ship=None):
    if ship is None:
        ship = stormshift_collector.build().finish()
    bank = motion_bank.MotionBank(ship, RIG_ID, stormshift_collector.SPEC['asset_id'])
    author(bank, _fan_stows(ship))
    return ship, bank


if __name__ == '__main__':
    ship, bank = build()
    parts_glb = os.path.join(motion_bank.ROOT,
                             'assets', 'ships', 'parts', 'wholeships',
                             f"{stormshift_collector.SPEC['file']}.glb")
    out = os.path.join(motion_bank.MOTIONS_DIR, 'stormshift-collector.motion.json')
    bank.bake([parts_glb], out_path=out)
    print(f'[ANI-44] baked stormshift-collector -> {out}')
