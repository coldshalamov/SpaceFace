"""ANI-01 — Kestrel scanner dish deploy, aim, pulse and park.

Reference: assets/animation-references/videos/ANI-01.mp4 (accepted v2). The prompt's authoritative
motion: the dish rotates gently side to side on its short local pedestal, lifts straight up by a
quarter of its diameter on an attached telescoping stem, holds, lowers, and parks exactly at rest.
The roof spine, rail and hull never move — one small rigid mechanism only.

Groups (registered on the ship before export; pivots persist into the GLB):
  kestrel_dish       yaw pivot at the pedestal top — the gentle side-to-side aim
  kestrel_dish_stem  lift pivot nested inside the yaw pivot — carries stem+dish+horn up
  kestrel_dish_feed  small feed-horn translate nested inside the lift — the pulse response

Keyframe times mirror the reference phase landmarks (deploy ~1s, aim ~2.5s, retract ~4s,
parked ~5.5s, rest at 6s). The bank writes `scan` once — the runtime replays it per accepted
`scan:pulse` (events map below).
"""
import os
import sys

from mathutils import Euler, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'kestrel_dish'
CLIP_S = 6.0
LIFT_M = 0.42          # a quarter of the dish's 1.68 m diameter, per the reference
FEED_M = 0.06          # the feed-horn's small pulse response along the horn axis

# The horn runs from the stem top toward the feed: in stem-local space (lift group's frame) it is
# mostly +Z with a slight -X lean. The feed slides along it — cosmetic travel inside the horn.
FEED_DIR = Vector((-0.25, 0.0, 0.95)).normalized()


def register(ship, parts):
    """Register the three ANI-01 groups. `parts` = the ship builder's dish objects.

    parts: {'stem': obj, 'dish': [dish, horn], 'feed': obj}
    The pedestal itself is NOT in a group — it stays welded to the roof spine, matching the
    reference (the host geometry is authoritative and motionless).
    """
    # Yaw pivot sits at the pedestal top where the stem emerges.
    ship.motion_group('kestrel_dish', pivot=(-2.2, -0.9, 2.85), objects=[])
    # Lift pivot nested inside the yaw pivot: the stem rises vertically while the whole assembly
    # sweeps. Everything the dish carries (stem tube, dish, horn) rides the lift.
    ship.motion_group('kestrel_dish_stem', pivot=(-2.2, -0.9, 2.85),
                      objects=[parts['stem'], *parts['dish']], parent='kestrel_dish')
    # The feed rides its own nested pivot for the small pulse response.
    ship.motion_group('kestrel_dish_feed', pivot=(-2.56, -0.9, 3.58),
                      objects=[parts['feed']], parent='kestrel_dish_stem')


def author(bank):
    """Keyframe the 'scan' action on the ship's motion pivots (reference-aligned)."""
    scan = bank.clip('scan', CLIP_S, loop=False, end_mode='rest')

    # Lift (stem group, translation): rest -> deploy (~1s) -> hold -> retract (~4s) -> park.
    lift = [
        (0.00, 0.0), (0.55, 0.10), (0.90, 0.38), (1.00, LIFT_M),
        (3.95, LIFT_M), (4.00, LIFT_M), (4.45, 0.33), (4.85, 0.02), (5.00, 0.0),
        (CLIP_S, 0.0),
    ]
    for t, dz in lift:
        scan.key('kestrel_dish_stem', t, loc=(0.0, 0.0, dz))

    # Yaw (dish group, rotation about local Z — the gentle side-to-side aim).
    yaw = [
        (0.00, 0.0), (1.00, 0.0),
        (1.70, -0.55), (2.50, 0.60), (3.35, -0.42), (4.15, 0.18), (4.90, 0.0),
        (CLIP_S, 0.0),
    ]
    for t, angle in yaw:
        scan.key('kestrel_dish', t, rot=Euler((0.0, 0.0, angle)))

    # Feed response (translation along the horn axis): extends through the aim sweep, settles
    # before park. Small enough to read as mechanism detail, not a limb.
    # Keys write ABSOLUTE pivot-local translation, so the feed's rest offset from the stem pivot
    # (world (-2.56,-0.9,3.58) - stem pivot (-2.2,-0.9,2.85)) is composed with the slide delta.
    feed_rest = Vector((-0.36, 0.0, 0.73))
    feed = [
        (0.00, 0.0), (1.95, 0.0),
        (2.30, FEED_M), (2.75, 0.02), (3.20, FEED_M * 1.15), (4.30, 0.0),
        (CLIP_S, 0.0),
    ]
    for t, d in feed:
        v = feed_rest + FEED_DIR * d
        scan.key('kestrel_dish_feed', t, loc=(v.x, v.y, v.z))

    return scan


def build(ship, parts, source_asset_id):
    """Register groups and author the bank object. Call before export_ship."""
    register(ship, parts)
    bank = motion_bank.MotionBank(
        ship, RIG_ID, source_asset_id,
        events={'scan:pulse': 'scan'},
    )
    author(bank)
    return bank
