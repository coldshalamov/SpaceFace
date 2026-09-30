"""Claim outpost — FENCE (place_claim_outpost_fence) — Forge rebuild.

Idea: "the staked perimeter". The function block IS the perimeter: ten tall dark pylons
standing proud of the deck rim on splayed feet, a lit amber emitter cap on each, and a beam
run pylon-to-pylon ringing the whole frame — the open centre stays open. Reads from above
as a ring of lit posts — unmistakably the fence.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
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
PYLON_R = 43.0
PYLON_TIP = 12.4     # depth (d) the emitter head stands off the deck plane


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0
    K.build_platform(s, {'hab': (0.0, -26.0), 'hab_scale': 0.6})

    tips = []
    for k in range(N_PYLONS):
        a = k * (360.0 / N_PYLONS) + 18.0
        u, v, _ = K.polar_plan(PYLON_R, a)
        # splayed three-strut foot welded to the frame chords
        u2, v2, _ = K.polar_plan(K.FRAME_R - 2.0, a - 5.0)
        u3, v3, _ = K.polar_plan(K.FRAME_R - 2.0, a + 5.0)
        K.plan_beams(s, f'FenceFoot{k}', [((u2, v2, 1.2), (u, v, 4.4)),
                                          ((u3, v3, 1.2), (u, v, 4.4)),
                                          ((u2, v2, 1.2), (u, v, 2.0))],
                     0.75, material='dark')
        # the mast itself: tall, dark, thick — the fence's silhouette
        K.plan_cyl(s, f'FenceMast{k}', u, v, 2.0, u, v, PYLON_TIP, 1.15,
                   material='dark', segments=12)
        K.plan_cyl(s, f'FenceCollar{k}', u, v, 3.4, u, v, 4.6, 1.5,
                   material='paint2', segments=12)
        K.plan_cyl(s, f'FenceBand{k}', u, v, 7.8, u, v, 8.6, 1.3, material='hazard',
                   segments=12)
        # emitter head: crossbar + big lit cap — the lit crown reads at chase zoom
        K.plan_box(s, f'FenceHead{k}', u, v, PYLON_TIP + 0.7, 4.4, 1.4, 1.4,
                   material='paint2', rot=math.radians(a), bevel=0.08)
        K.plan_cyl(s, f'FenceCap{k}', u, v, PYLON_TIP, u, v, PYLON_TIP + 1.0, 0.9,
                   material='glow_amber', segments=12)
        pos = K.P(u, v, PYLON_TIP + 1.9)
        o = F.light(s, f'FenceStrobe{k}', pos, 'glow_amber', size=0.6)
        # the patrol strobe travels pylon to pylon round the fence ring
        s.anim(o, f'chase:fence:{k}:{N_PYLONS}:4p8', pos)
        tips.append((u, v, PYLON_TIP + 0.7))
    # beam run tip-to-tip — the fence line itself
    s.detail = 1
    for k in range(N_PYLONS):
        a, b = tips[k], tips[(k + 1) % N_PYLONS]
        K.plan_beams(s, f'FenceBeam{k}', [(a, b)], 0.22, material='glow_amber')
    s.detail = 0

    # --- small salvage yard between the pads — secondary, kept low -----------------------------
    for k, (bu, bv, mat) in enumerate(((-9, -14, 'paint.aged'), (-2, -15, 'paint2'),
                                       (5, -14, 'paint.role'))):
        K.plan_box(s, f'Bin{k}', bu, bv, 2.6, 5.0, 4.0, 2.4, material=mat, bevel=0.1)
    F.work_lamp(s, 'YardLamp', K.P(-4.0, -10.0, 7.0), aim=(0.1, 0.4, -1.0), size=0.5,
                lens='glow_warm')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
