"""Claim outpost — FENCE (place_claim_outpost_fence) — Forge rebuild.

Idea: "the staked perimeter". The shared anchor ring raises a defence fence: ten perimeter
pylons standing proud of the ring rim on splayed feet, a pulsing emitter head on each, and a
thin beam run pylon-to-pylon — a fence you can read from above as a ring of lit posts around
the deck. Inside: a salvage sorting yard — scrap bins and a sorting arm parked between the
module pads. Amber fence lights, ochre bands.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
Live bounds allow the pylons to stand ~5 m proud of the rim (plan r to ~51).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_fence'
COLORS = dict(K.COLORS, **{
    'paint.role': '#6b5a1e',     # fence-amber accent
    'glow_amber': '#ffb02e',
})

N_PYLONS = 10
PYLON_R = 47.5
PYLON_TIP = 12.0     # depth (d) the emitter head stands off the deck plane


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'seed': 43})

    tips = []
    for k in range(N_PYLONS):
        a = k * (360.0 / N_PYLONS) + 18.0
        u, v, _ = K.polar_plan(PYLON_R, a)
        # splayed three-strut foot welded to the ring rim, mast rising out of the wheel plane
        u2, v2, _ = K.polar_plan(PYLON_R - 4.5, a - 5.0)
        u3, v3, _ = K.polar_plan(PYLON_R - 4.5, a + 5.0)
        K.plan_beams(s, f'FenceFoot{k}', [((u2, v2, 1.2), (u, v, 4.0)),
                                          ((u3, v3, 1.2), (u, v, 4.0))],
                     0.7, material='paint2')
        K.plan_cyl(s, f'FenceMast{k}', u, v, 2.0, u, v, PYLON_TIP, 0.9, material='paint',
                   segments=12)
        K.plan_cyl(s, f'FenceBand{k}', u, v, 6.2, u, v, 7.6, 1.05, material='hazard',
                   segments=12)
        # emitter head: crossbar with two lamp caps and a centre strobe
        K.plan_box(s, f'FenceHead{k}', u, v, PYLON_TIP + 0.8, 3.6, 1.1, 1.1,
                   material='paint2', rot=math.radians(a), bevel=0.08)
        F.light(s, f'FenceStrobe{k}', K.P(u, v, PYLON_TIP + 1.7), 'glow_amber', size=0.5)
        tips.append((u, v, PYLON_TIP + 0.8))
        # stub of chain/anchor cable down the mast's foot
        K.plan_beams(s, f'FenceCable{k}', [((u, v, 4.0), (u, v, 1.4))], 0.3,
                     material='dark')
    # beam run tip-to-tip — the fence line itself, thin and lit
    s.detail = 1
    for k in range(N_PYLONS):
        a, b = tips[k], tips[(k + 1) % N_PYLONS]
        K.plan_beams(s, f'FenceBeam{k}', [(a, b)], 0.18, material='glow_amber')
    s.detail = 0

    # --- salvage yard between the pads: sorted scrap bins and a parked sorting arm ---------
    for k, (bu, bv, mat) in enumerate(((-8, -26, 'paint.aged'), (-1, -27, 'paint2'),
                                       (6, -26, 'paint.role'), (-26, 8, 'paint.aged'),
                                       (-27, 1, 'paint2'), (-26, -6, 'paint.role'))):
        K.plan_box(s, f'Bin{k}', bu, bv, 3.6, 5.4, 4.4, 3.0, material=mat, bevel=0.1)
        K.plan_box(s, f'BinLid{k}', bu, bv, 5.3, 5.8, 4.8, 0.4, material='hazard',
                   bevel=0.02)
    K.plan_truss(s, 'SortArm', (-4.0, -12.0, 3.0), (-14.0, -22.0, 8.0), 1.6, 3,
                 material='paint.role', chord=0.4, web=0.24)
    F.work_lamp(s, 'YardLamp', K.P(-10.0, -18.0, 9.0), aim=(0.1, 0.4, -1.0), size=0.5,
                lens='glow_warm')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
