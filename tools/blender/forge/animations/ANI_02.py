"""ANI-02 — Kestrel mining-head deploy, bite and stow.

Reference: assets/animation-references/videos/ANI-02.mp4 (accepted v2, 97 frames @24fps,
phases rest 1 -> extension 18 -> work-pose 45 -> withdraw 71 -> park 97). The prompt's
authoritative motion: the chin cutter rides its attached dark guide one short straight
extension toward the nose (~half the cutter diameter), holds as a working pose, then
withdraws and parks exactly at rest. Guns, nose armour and housing never move.

Mechanism truth: the source `MiningCutter` cylinder already carries its own dark shaft —
the rear portion sits hidden inside the `MiningClamp` housing. Sliding the cutter forward
on +X exposes that shaft as the guide extension, so no new geometry is needed
(proposedGeometry: null in the manifest). The clamp stays welded to the chin.

Groups:
  kestrel_mining  translate pivot at the cutter axis — the only moving group.

Clips:
  deploy  extend ~0.34 m (half the 0.68 m cutter face), settle, two engagement presses;
          endMode 'hold' parks the head extended for as long as the beam stays locked.
  bite    one quick press per `mining:yield` receipt — reads as the head biting ore.
  stow    withdraw and park at exact rest on `mining:stop` / `beam:denied`.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'kestrel_mining'
TRAVEL_M = 0.34          # half the cutter's 0.68 m face diameter, per the reference
PRESS_M = 0.045          # the bite press — small jab along the same axis


def register(ship, parts):
    """Register the ANI-02 group. `parts` = the ship builder's mining objects.

    parts: {'cutter': obj} — MiningClamp is NOT in the group: the housing stays on the
    chin, matching the reference where only cutter+guide move.
    """
    ship.motion_group('kestrel_mining', pivot=(12.1, 0.0, -1.05),
                      objects=[parts['cutter']])


def author(bank):
    """Keyframe the deploy/bite/stow clips on the mining pivot (reference-aligned).

    Keys are ABSOLUTE pivot-local transforms: the root-mounted pivot's rest local translation
    is its mount offset (12.1, 0, -1.05), so a +dx slide keys (rest + dx, 0, rest_z) — the
    baked bank strips it back to pure rest-relative deltas.
    """
    pivot = bank.ship.motion_pivots['kestrel_mining']
    rest_loc = pivot.matrix_basis.translation
    at = lambda dx: (rest_loc.x + dx, rest_loc.y, rest_loc.z)

    deploy = bank.clip('deploy', 1.7, loop=False, end_mode='hold')
    deploy_keys = [
        (0.00, 0.0), (0.14, 0.05), (0.42, 0.26), (0.62, TRAVEL_M + 0.012),
        (0.78, TRAVEL_M - 0.006), (0.92, TRAVEL_M),              # extend + settle
        (1.16, TRAVEL_M + PRESS_M), (1.36, TRAVEL_M),            # first engagement press
        (1.52, TRAVEL_M + PRESS_M * 0.55), (1.70, TRAVEL_M),     # second, softer
    ]
    for t, dx in deploy_keys:
        deploy.key('kestrel_mining', t, loc=at(dx))

    bite = bank.clip('bite', 0.55, loop=False, end_mode='hold')
    bite_keys = [
        (0.00, TRAVEL_M), (0.10, TRAVEL_M + PRESS_M), (0.26, TRAVEL_M - 0.004),
        (0.42, TRAVEL_M + 0.006), (0.55, TRAVEL_M),
    ]
    for t, dx in bite_keys:
        bite.key('kestrel_mining', t, loc=at(dx))

    stow = bank.clip('stow', 0.95, loop=False, end_mode='rest')
    stow_keys = [
        (0.00, TRAVEL_M), (0.16, TRAVEL_M - 0.02), (0.55, 0.05),
        (0.78, 0.004), (0.95, 0.0),
    ]
    for t, dx in stow_keys:
        stow.key('kestrel_mining', t, loc=at(dx))


EVENTS = {
    'mining:start': 'deploy',
    'mining:yield': 'bite',
    'mining:stop': 'stow',
    'beam:denied': 'stow',
}


def build(ship, parts, source_asset_id, bank=None):
    """Register the group and author the clips. Call before export_ship.

    `bank`: the ship's shared motion bank (one file per model — bake() iterates every
    registered group, so all Kestrel rigs live in kestrel.motion.json). Pass ANI_01's bank
    so ANI-02 clips land beside it; omit only for standalone use.
    """
    register(ship, parts)
    if bank is None:
        bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=dict(EVENTS))
    else:
        bank.events.update(EVENTS)
    author(bank)
    return bank
