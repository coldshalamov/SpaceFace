"""ANI-03 — Yard Tug massline winch: payout, catch, loaded reel, slack release.

Reference: assets/animation-references/videos/ANI-03.mp4 (145 frames @ 24 fps). The prompt's
authoritative motion: the fairlead aligns a little, the drum pays out a short taut cable through
the rear guide, catches with one compact load reaction in the winch cheeks, then rotates steadily
to take the cable back in; finish with a distinct slack release and the hook back at stow.

Rigid-part truthfulness: the cable cannot stretch, so payout is sold as translation — TowHook and
TowCable ride one group sliding aft, which reads as cable paying out through the fairlead eye
while the drum spins the matching direction. The cheeks stay welded to the hull (they're the
housing the mechanism reacts against, matching "one compact load reaction" — the jolt lives in
the drum deceleration and the hook's pitch twitch).

Groups (registered on the ship before export; pivots persist into the GLB):
  yard_tug_winch     drum + wound cable + flanges + hubs — spins about the drum axis (local Y)
  yard_tug_fairlead  fairlead box + roller — small yaw align (local Z)
  yard_tug_hook      tow hook + standing cable — slides aft on payout, returns on reel

Clips: payout (1.6 s hold), catch (0.45 s hold), reel (0.95 s hold), release (0.45 s rest).
Bank routes: tether:attached/massline:snareDeployed -> payout, tether:snapCatch -> catch,
tether:reelPump -> reel, tether:released/massline:snareEnded/tether:latchDenied -> release.
"""
import os
import sys

from mathutils import Euler

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(HERE, '..')))
import motion_bank  # noqa: E402

RIG_ID = 'yard_tug_winch'
PAYOUT_M = 1.2         # hook+cable slide aft — the hook nub must clear the stern silhouette
CATCH_OVER_M = 0.2     # brief overshoot aft before the snatch settles — must read at game zoom
PAY_SPIN_RAD = 2.4     # ~137 deg of drum while paying out
REEL_SPIN_RAD = -1.7   # winds back past zero — reads as a steady loaded reel

EVENTS = {
    'tether:attached': 'payout',
    'massline:snareDeployed': 'payout',
    'tether:snapCatch': 'catch',
    'tether:reelPump': 'reel',
    'tether:released': 'release',
    'massline:snareEnded': 'release',
    'tether:latchDenied': 'release',
}


def register(ship, parts):
    """parts: {'winch': [drum, cables.., flanges, hubs], 'fairlead': [box, roll],
    'hook': [hook, cable]} — captured by the ship builder."""
    ship.motion_group('yard_tug_winch', pivot=(-7.6, 0.0, 2.45), objects=parts['winch'])
    ship.motion_group('yard_tug_fairlead', pivot=(-10.35, 0.0, 1.85), objects=parts['fairlead'])
    ship.motion_group('yard_tug_hook', pivot=(-10.95, 0.0, 1.6), objects=parts['hook'])


def author(bank):
    """Keyframe payout/catch/reel/release on the winch pivots.

    Keys write ABSOLUTE pivot-local transforms: root-mounted pivots carry their mount offset, so
    translation keys add the slide to the rest basis; rotation-only keys leave rest translation
    untouched (the bank strips it back to pure deltas).
    """
    hook_rest = bank.ship.motion_pivots['yard_tug_hook'].matrix_basis.translation
    hook_at = lambda dx: (hook_rest.x + dx, hook_rest.y, hook_rest.z)

    payout = bank.clip('payout', 1.6, loop=False, end_mode='hold')
    # drum pays out: steady spin with ease-in and a taut settle
    for t, a in [(0.0, 0.0), (0.3, 0.5), (0.85, 1.8), (1.2, 2.35), (1.4, 2.45), (1.6, PAY_SPIN_RAD)]:
        payout.key('yard_tug_winch', t, rot=Euler((0.0, a, 0.0)))
    # fairlead aligns a little
    for t, a in [(0.0, 0.0), (0.5, 0.0), (1.0, 0.16), (1.6, 0.14)]:
        payout.key('yard_tug_fairlead', t, rot=Euler((0.0, 0.0, a)))
    # hook+cable slide aft through the fairlead eye
    for t, dx in [(0.0, 0.0), (0.35, -0.08), (1.1, -1.14), (1.35, -1.23), (1.6, -PAYOUT_M)]:
        payout.key('yard_tug_hook', t, loc=hook_at(dx))

    catch = bank.clip('catch', 0.45, loop=False, end_mode='hold')
    # load snatches: drum decelerates hard with one overshoot
    for t, a in [(0.0, PAY_SPIN_RAD), (0.11, PAY_SPIN_RAD - 0.12), (0.26, PAY_SPIN_RAD - 0.02),
                 (0.45, PAY_SPIN_RAD - 0.05)]:
        catch.key('yard_tug_winch', t, rot=Euler((0.0, a, 0.0)))
    # hook dips under load with a short overshoot aft before it settles
    for t, dx, a in [(0.0, -PAYOUT_M, 0.0), (0.12, -(PAYOUT_M + CATCH_OVER_M), 0.14),
                     (0.3, -PAYOUT_M - 0.05, 0.07), (0.45, -PAYOUT_M - 0.05, 0.06)]:
        catch.key('yard_tug_hook', t, loc=hook_at(dx), rot=Euler((0.0, a, 0.0)))

    reel = bank.clip('reel', 0.95, loop=False, end_mode='hold')
    # steady brisk wind-in past rest — the drum reads as continuously reeling
    for t, a in [(0.0, PAY_SPIN_RAD - 0.05), (0.25, 1.4), (0.7, -1.4), (0.85, -1.75),
                 (0.95, REEL_SPIN_RAD)]:
        reel.key('yard_tug_winch', t, rot=Euler((0.0, a, 0.0)))
    # hook returns almost home but stays a touch out — the line is still attached
    for t, dx, a in [(0.0, -PAYOUT_M - 0.05, 0.06), (0.3, -0.75, 0.03), (0.75, -0.1, 0.0),
                     (0.95, -0.06, 0.0)]:
        reel.key('yard_tug_hook', t, loc=hook_at(dx), rot=Euler((0.0, a, 0.0)))
    for t, a in [(0.0, 0.14), (0.65, 0.02), (0.95, 0.02)]:
        reel.key('yard_tug_fairlead', t, rot=Euler((0.0, 0.0, a)))

    release = bank.clip('release', 0.45, loop=False, end_mode='rest')
    # slack release: the drum kicks loose and spins back to zero
    for t, a in [(0.0, REEL_SPIN_RAD), (0.13, REEL_SPIN_RAD - 0.25), (0.3, -1.55), (0.45, 0.0)]:
        release.key('yard_tug_winch', t, rot=Euler((0.0, a, 0.0)))
    for t, dx, a in [(0.0, -0.06, 0.0), (0.11, -0.02, -0.04), (0.45, 0.0, 0.0)]:
        release.key('yard_tug_hook', t, loc=hook_at(dx), rot=Euler((0.0, a, 0.0)))
    for t, a in [(0.0, 0.02), (0.45, 0.0)]:
        release.key('yard_tug_fairlead', t, rot=Euler((0.0, 0.0, a)))


def build(ship, parts, source_asset_id):
    """Register groups and author the bank object. Call before export_ship."""
    register(ship, parts)
    bank = motion_bank.MotionBank(ship, RIG_ID, source_asset_id, events=EVENTS)
    author(bank)
    return bank
