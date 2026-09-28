"""Claim outpost — RELAY (place_claim_outpost_relay) — Forge rebuild.

Idea: "the claim's voice". The shared anchor ring raises the comms fit: a tall lattice mast
on the teleporter pad with a big gimballed dish tilted up toward the flight camera, a field
of smaller whip antennae and horn feeders around the rim, cable stays back to the deck, and
cyan signal lamps blinking up the mast. Reads from above as a dish + mast — the relay.

Same contract as the base (sockets copied live; plan = Blender XZ, front face = +Y).
Tall/thin rule: the mast rises up the wheel face on a four-strut spread foot and the dish
tips toward the camera so its face reads as a wide ellipse from the chase view.
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
})


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'seed': 67})

    # --- comms mast on the teleporter pad (20, 20): spread foot + lattice -----------------
    mx, mv = 20.0, 20.0
    # four outrigger feet spreading the plan
    for k, (ex, ev) in enumerate(((-4.5, -4.5), (4.5, -4.5), (-4.5, 4.5), (4.5, 4.5))):
        K.plan_beams(s, f'MastFoot{k}',
                     [((mx + ex * 1.7, mv + ev * 1.7, 1.0), (mx + ex * 0.3, mv + ev * 0.3, 6.0))],
                     0.65, material='paint2')
        K.plan_box(s, f'MastShoe{k}', mx + ex * 1.7, mv + ev * 1.7, 1.4, 2.6, 2.6, 0.8,
                   material='hazard', bevel=0.05)
    # lattice mast rising UP the wheel face (+v = world up) to the rim
    K.plan_truss(s, 'Mast', (mx, mv + 1.0, 5.0), (mx, 37.0, 5.0), 2.4, 9, material='paint',
                 chord=0.4, web=0.22)
    K.plan_cyl(s, 'MastBandA', mx, 25.5, 4.6, mx, 26.9, 5.4, 1.5, material='hazard',
               segments=12)
    K.plan_cyl(s, 'MastBandB', mx, 32.5, 4.8, mx, 33.9, 5.2, 1.3, material='hazard',
               segments=12)
    # signal lamps blinking up the mast
    for i, vh in enumerate((24.0, 30.0, 36.0)):
        F.light(s, f'MastLamp{i}', K.P(mx + 1.3, vh, 5.4), 'glow_cyan', size=0.32)

    # --- the dish at the mast head, face tipped up toward the camera ---------------------------
    # gimbal yoke joins mast head to the dish back so nothing floats
    K.plan_cyl(s, 'Gimbal', mx, 37.0, 5.0, mx, 39.4, 6.6, 1.7, material='paint2',
               segments=16)
    K.plan_box(s, 'DishBack', mx, 40.6, 6.9, 4.4, 4.4, 1.6, material='paint2', bevel=0.15)
    dish = K.placed_sphere(s, 'Dish', mx, 41.4, 7.6, 6.4, material='paint', segments=28,
                           scale=(1.0, 0.42, 1.0), tilt_x_deg=55.0)
    # dish feed arm + horn, held off the face on the viewer side
    K.plan_beams(s, 'FeedArm', [((mx, 41.4, 7.6), (mx - 0.5, 44.0, 12.2))], 0.3,
                 material='gunmetal')
    K.plan_cyl(s, 'FeedHorn', mx - 0.5, 43.5, 11.5, mx - 0.5, 44.6, 12.5, 0.55,
               material='paint2', segments=10)
    F.light(s, 'FeedLamp', K.P(mx - 0.5, 44.2, 12.8), 'glow_cyan', size=0.4)
    # receiver ring inside the dish face (matches the tipped normal)
    F.ring(s, 'DishRing', K.P(mx, 41.4, 8.2), 4.4, 0.22, axis=(0, 0.574, 0.819),
           material='paint.role', segments=24, sides=8)

    # --- whip antennae + horn feeders around the rim — radial spikes off the rim ---------------
    for k, a in enumerate((70.0, 110.0, 250.0, 290.0, 330.0)):
        u, v, _ = K.polar_plan(K.RING_R1 - 1.2, a)
        h = 9.0 + (k % 3) * 2.5
        u2, v2, _ = K.polar_plan(min(48.0, K.RING_R1 - 1.2 + h), a)
        K.plan_cyl(s, f'Whip{k}', u, v, 1.8, u2, v2, 1.8, 0.22, material='paint2',
                   segments=8)
        F.light(s, f'WhipTip{k}', K.P(u2, v2, 2.2), 'glow_cyan', size=0.3)

    # --- cable stays from the mast head back to the deck --------------------------------------
    for k, (ex, ev) in enumerate(((-14.0, -10.0), (14.0, -10.0), (-10.0, 8.0),
                                  (10.0, 8.0))):
        s.detail = 1
        K.plan_beams(s, f'Stay{k}', [((mx + ex, mv + ev, 1.8), (mx, 36.0, 4.8))], 0.16,
                     material='dark')
        s.detail = 0

    # --- comms equipment hut at the mast base --------------------------------------------------
    K.plan_box(s, 'CommsHut', mx - 8.0, mv + 4.0, 4.0, 6.0, 5.0, 4.5, material='paint2',
               bevel=0.15, taper=0.9)
    s.detail = 1
    for i in range(3):
        K.plan_box(s, f'CommsWin{i}', mx - 9.8 + i * 1.8, mv + 1.4, 6.3, 1.0, 0.6, 0.14,
                   material='glow_warm', bevel=0.0)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
