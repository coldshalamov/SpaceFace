"""Claim outpost — REFINERY (place_claim_outpost_refinery) — Forge rebuild.

Idea: "the rock that cooks". The function block OWNS the plan: a tight cluster of four tall
process tanks standing proud of the deck on dark skids around the core block, cross-tied by
pipe runs, with a flare stack climbing the face behind them — ember-mouthed. The shared hab
sits shrunk on the aft rim. Reads from above as four big circles + a stack — unmistakably
the refinery.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_refinery'
COLORS = dict(K.COLORS, **{
    'paint.role': '#7a4a16',     # furnace-amber refinery accent
    'glow_amber': '#ff8a2a',
})

# tank cluster owns the centre: four circles ~35 u across the middle of the frame
TANKS = ((-10.5, -9.0), (10.5, -9.0), (-10.5, 9.0), (10.5, 9.0))
TANK_R = 6.6


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0
    K.build_platform(s, {'hab': (0.0, -26.0), 'hab_scale': 0.6})

    for k, (tu, tv) in enumerate(TANKS):
        # dark skid frame under each tank — machinery, not ivory
        K.plan_box(s, f'Skid{k}', tu, tv, 1.7, 14.6, 14.6, 1.6, material='dark',
                   bevel=0.05)
        for e in (-1, 1):
            K.plan_beams(s, f'SkidLeg{k}{e:+d}',
                         [((tu + e * 6.4, tv - 6.4, 0.6), (tu + e * 6.4, tv - 6.4, 2.4)),
                          ((tu + e * 6.4, tv + 6.4, 0.6), (tu + e * 6.4, tv + 6.4, 2.4))],
                         0.7, material='paint2')
        # the tank: axis out of the face (d), standing proud — reads as a big circle
        K.plan_cyl(s, f'Tank{k}', tu, tv, 2.2, tu, tv, 10.6, TANK_R,
                   material='paint.aged', segments=24)
        K.placed_sphere(s, f'TankCap{k}', tu, tv, 10.6, TANK_R, material='paint.aged',
                        segments=20, scale=(1.0, 0.45, 1.0))
        # graphite banding + ONE narrow hazard band each — mid value only
        for bd in (4.2, 8.0):
            K.plan_cyl(s, f'TankBand{k}{bd}', tu, tv, bd, tu, tv, bd + 0.5,
                       TANK_R + 0.25, material='paint2', segments=24)
        K.plan_cyl(s, f'TankHaz{k}', tu, tv, 6.0, tu, tv, 6.5, TANK_R + 0.3,
                   material='hazard', segments=24)
        pos = K.P(tu, tv, 12.4)
        o = F.light(s, f'ValveLamp{k}', pos, 'glow_amber', size=0.35)
        s.anim(o, f'blink:2p{0 + k % 3}:0p{k}', pos)
    # manifold ring + risers tying the farm to the core block
    K.ring_slab(s, 'Manifold', 8.6, 9.8, 2.6, 3.6, material='paint2', segments=32)
    for k, (tu, tv) in enumerate(TANKS):
        a = math.degrees(math.atan2(tv, tu))
        u0, v0, _ = K.polar_plan(9.0, a)
        u1, v1, _ = K.polar_plan(TANK_R + 2.0, a)
        K.plan_cyl(s, f'Feed{k}', u0, v0, 3.2, u1, v1, 3.2, 0.5, material='gunmetal',
                   segments=10)
        K.plan_cyl(s, f'FeedRiser{k}', u1, v1, 3.2, u1, v1, 5.6, 0.4, material='gunmetal',
                   segments=8)

    # --- flare stack climbing the face behind the farm — the refinery's vertical ------------
    sx, sv = -20.0, 26.0
    K.plan_cyl(s, 'Stack', sx, sv - 8.0, 4.2, sx, sv + 12.0, 4.2, 1.8, material='paint2',
               segments=18)
    K.plan_cyl(s, 'StackLip', sx, sv + 11.6, 4.2, sx, sv + 13.4, 4.2, 2.3,
               material='gunmetal', segments=18)
    K.plan_cyl(s, 'StackBand', sx, sv + 2.0, 4.1, sx, sv + 3.4, 4.3, 2.0,
               material='hazard', segments=18)
    pos = K.P(sx, sv + 13.8, 4.2)
    o = F.light(s, 'StackEmber', pos, 'glow_amber', size=0.8)
    # the flare stack's ember mouth breathes on an irregular rhythm
    s.anim(o, 'flicker:0p8:0p2', pos)
    # furnace mouth on the stack foot — the warm glow at the core of the block
    K.plan_box(s, 'FurnaceFoot', sx, sv - 10.0, 3.4, 6.0, 5.0, 4.4, material='paint2',
               bevel=0.2, taper=0.9)
    K.plan_box(s, 'FurnaceMouth', sx, sv - 10.0, 5.7, 3.4, 1.4, 0.3, material='glow_amber',
               bevel=0.0)
    # pipe from furnace foot into the manifold
    K.plan_cyl(s, 'StackFeed', sx + 2.5, sv - 10.0, 3.0, 0.0, 14.0, 3.0, 0.55,
               material='gunmetal', segments=10)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
