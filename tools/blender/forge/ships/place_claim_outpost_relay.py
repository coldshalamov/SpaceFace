"""Claim outpost — RELAY (place_claim_outpost_relay) — Forge rebuild.

Idea: "the claim's voice". The function block OWNS the plan: one big dish — nearly half the
frame wide — cradled in the deck opening and tilted ~35 deg up toward the flight camera on a
gimbal yoke, a lattice mast rising behind it, whip antennae on the rim and cable stays back
to the deck. The shared hab hides shrunk on the aft rim. Reads from above as a giant circle
tipped at you — unmistakably the relay.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
The dish's tilted rim grazes the live front/back depth bound, so it sits in a gimbal cradle
half-sunk through the open deck.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_relay'
COLORS = dict(K.COLORS, **{
    'paint.role': '#1e4a44',     # signal-teal accent
    'glow_cyan': '#46d8e8',
})

# dish: r=17 (>= half the frame width), centre low so the 35-deg tilted rim stays inside the
# live depth envelope (front d ~ +12.5, back ~ -17)
DISH_U, DISH_V, DISH_D = 0.0, 10.0, -3.0
DISH_R = 17.0
TILT = math.radians(35.0)
DISH_AXIS = (0.0, math.cos(TILT), math.sin(TILT))   # mostly +d (viewer), tipped up the face


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'hab': (0.0, -28.0), 'hab_scale': 0.55})

    # --- gimbal cradle: the dish pivots in a yoke frame inside the deck opening ---------------
    for e in (-1, 1):
        # cradle cheeks either side of the dish
        K.plan_box(s, f'Cradle{e:+d}', DISH_U + e * 14.5, DISH_V, 1.0, 4.0, 10.0, 6.0,
                   material='paint2', bevel=0.15)
        K.plan_cyl(s, f'Trunnion{e:+d}', DISH_U + e * 14.5, DISH_V, 1.0,
                   DISH_U + e * 12.2, DISH_V, 0.2, 1.1, material='gunmetal', segments=12)
        # cradle feet strutting back to the frame chords
        for j, sv in enumerate((-6.0, 6.0)):
            K.plan_beams(s, f'CradleLeg{e:+d}{j}',
                         [((DISH_U + e * 14.5, DISH_V + sv, -0.5),
                           (DISH_U + e * 22.0, DISH_V + sv * 1.6, -3.0))], 0.7,
                         material='paint2')
    # counterweight under the dish's back rim
    K.plan_box(s, 'Counterweight', DISH_U, DISH_V - 10.0, -9.0, 8.0, 5.0, 3.0,
               material='paint2', bevel=0.15)

    # --- the dish itself (F.dish bakes the bowl + rim + feed horn + lens at the axis) ---------
    F.dish(s, 'BigDish', K.P(DISH_U, DISH_V, DISH_D), DISH_R, 4.4, axis=DISH_AXIS,
           material='paint', face='paint.role', segments=40, feed='glow_cyan')

    # --- lattice mast rising UP the face behind the dish ---------------------------------------
    mx, mv0, mv1 = 0.0, -20.0, 34.0
    for k, (ex, ev) in enumerate(((-4.5, -4.5), (4.5, -4.5), (-4.5, 4.5), (4.5, 4.5))):
        K.plan_beams(s, f'MastFoot{k}',
                     [((mx + ex * 1.8, mv0 + ev * 1.8, 1.0),
                       (mx + ex * 0.3, mv0 + ev * 0.3, 6.0))], 0.65,
                     material='paint2')
        K.plan_box(s, f'MastShoe{k}', mx + ex * 1.8, mv0 + ev * 1.8, 1.4, 2.4, 2.4, 0.7,
                   material='hazard', bevel=0.05)
    K.plan_truss(s, 'Mast', (mx, mv0, 5.0), (mx, mv1, 5.0), 2.6, 12,
                 material='paint2', chord=0.4, web=0.2)
    for i, vh in enumerate((-12.0, 4.0, 20.0)):
        F.light(s, f'MastLamp{i}', K.P(mx + 1.5, vh, 5.6), 'glow_cyan', size=0.32)
    K.plan_cyl(s, 'MastBand', mx, 30.0, 4.6, mx, 31.4, 5.4, 1.5, material='hazard',
               segments=12)
    # mast head platform + beacon
    K.plan_box(s, 'MastHead', mx, mv1, 5.4, 4.0, 3.0, 1.6, material='paint2', bevel=0.1)
    F.beacon(s, 'MastBeacon', K.P(mx, mv1 + 1.2, 5.4), finish='glow_cyan', size=0.5)

    # --- cable stays from the mast + dish rim back to the deck ----------------------------------
    for k, (ex, ev) in enumerate(((-16.0, -8.0), (16.0, -8.0), (-18.0, 18.0),
                                  (18.0, 18.0))):
        s.detail = 1
        K.plan_beams(s, f'Stay{k}', [((ex, ev, 1.4), (mx, 30.0, 4.8))], 0.16,
                     material='dark')
        s.detail = 0

    # --- whip antennae on the rim — radial spikes -----------------------------------------------
    for k, a in enumerate((70.0, 110.0, 250.0, 290.0)):
        u, v, _ = K.polar_plan(K.FRAME_R - 0.5, a)
        h = 9.0 + (k % 2) * 2.5
        u2, v2, _ = K.polar_plan(min(45.0, K.FRAME_R - 0.5 + h), a)
        K.plan_cyl(s, f'Whip{k}', u, v, 1.8, u2, v2, 1.8, 0.22, material='paint2',
                   segments=8)
        F.light(s, f'WhipTip{k}', K.P(u2, v2, 2.2), 'glow_cyan', size=0.3)

    # --- comms hut tucked beside the cradle -----------------------------------------------------
    K.plan_box(s, 'CommsHut', -24.0, -8.0, 4.0, 6.5, 5.5, 4.5, material='paint2',
               bevel=0.15, taper=0.9)
    s.detail = 1
    for i in range(3):
        K.plan_box(s, f'CommsWin{i}', -24.0 - 2.0 + i * 1.8, -8.0 - 2.6, 6.4, 1.0, 0.6,
                   0.14, material='glow_warm', bevel=0.0)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
