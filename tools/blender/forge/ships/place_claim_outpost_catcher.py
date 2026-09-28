"""Claim outpost — CATCHER (place_claim_outpost_catcher) — Forge rebuild.

Idea: "the catch frame". The function block OWNS the plan: two long open truss arms run the
full width of the frame on raised posts, a capture net strung between them the whole way —
a giant racket over the deck. Winch house and drums sit aft under the arm line; cyan guide
strobes walk both arms. Reads from above as two bars + webbing — unmistakably the catcher.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_catcher'
COLORS = dict(K.COLORS, **{
    'paint.role': '#174a52',     # deep teal catcher accents
    'glow_cyan': '#46d8e8',
})

ARM_V = 15.0          # the two arm lines' v offsets
ARM_U0, ARM_U1 = -36.0, 38.0
ARM_D = 6.8           # arms stand proud of the deck


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'hab': (0.0, -27.0), 'hab_scale': 0.55})

    for e in (-1, 1):
        v = e * ARM_V
        # the arm itself: an open truss chord spanning the frame
        K.plan_truss(s, f'Arm{e:+d}', (ARM_U0, v, ARM_D), (ARM_U1, v, ARM_D), 3.0, 11,
                     material='paint2', chord=0.55, web=0.26)
        # raised on posts off the deck so the net below stays open
        for i, au in enumerate((-34.0, -16.0, 4.0, 22.0, 37.0)):
            K.plan_beams(s, f'ArmPost{e:+d}{i}',
                         [((au, v, 1.2), (au, v, ARM_D - 1.0))], 0.9,
                         material='paint2')
            K.plan_beams(s, f'ArmBrace{e:+d}{i}',
                         [((au, v - e * 2.6, 1.2), (au, v, ARM_D - 1.4))], 0.5,
                         material='dark')
        # padded jaw face along the arm's inner side
        K.plan_box(s, f'JawPad{e:+d}', 1.0, v - e * 2.0, ARM_D + 0.6, 70.0, 0.9, 2.4,
                   material='dark', bevel=0.1)
        # teeth on the jaw face — the capture pads
        for i in range(9):
            au = -28.0 + i * 7.0
            K.plan_box(s, f'JawTooth{e:+d}{i}', au, v - e * 1.4, ARM_D + 0.4, 1.6, 1.2,
                       1.8, material='paint.role', bevel=0.05)
        # arm end caps angled inward — the mouth of the catch
        K.plan_truss(s, f'ArmTip{e:+d}', (ARM_U1, v, ARM_D), (ARM_U1 + 3.0, v - e * 4.0,
                                                              ARM_D + 0.8),
                     1.6, 2, material='paint.role', chord=0.45, web=0.26)
        # guide strobes walking the arm
        for i in range(4):
            au = -30.0 + i * 20.0
            F.light(s, f'ArmStrobe{e:+d}{i}', K.P(au, v, ARM_D + 2.0), 'glow_cyan',
                    size=0.4)

    # --- the net: ribs + strands strung between the arms across the whole span ---------------
    s.detail = 1
    for i in range(13):
        nu = -33.0 + i * 6.0
        K.plan_beams(s, f'NetRib{i}', [((nu, -ARM_V + 1.4, ARM_D - 0.6),
                                        (nu, ARM_V - 1.4, ARM_D - 0.6))], 0.2,
                     material='dark')
    for j, nv in enumerate((-10.0, -5.0, 0.0, 5.0, 10.0)):
        K.plan_beams(s, f'NetStrand{j}', [((ARM_U0 + 1.5, nv, ARM_D - 0.8),
                                           (ARM_U1 - 1.5, nv, ARM_D - 0.8))], 0.16,
                     material='dark')
    s.detail = 0
    # net frame hardpoints — bigger nodes where ribs meet the arms
    for e in (-1, 1):
        for i, au in enumerate((-30.0, -12.0, 6.0, 24.0, 36.0)):
            K.plan_box(s, f'NetNode{e:+d}{i}', au, e * (ARM_V - 1.0), ARM_D - 0.5,
                       1.4, 1.4, 1.0, material='paint.role', bevel=0.04)

    # --- winch house + drums on the aft rim under the arm line --------------------------------
    K.plan_box(s, 'WinchHouse', -8.0, -ARM_V - 7.5, 4.2, 9.0, 6.5, 5.0, material='paint2',
               bevel=0.18)
    for e in (-1, 1):
        K.plan_cyl(s, f'Drum{e:+d}', -8.0 + e * 2.0, -ARM_V - 7.5, 6.9,
                   -8.0 + e * 2.0, -ARM_V - 7.5, 8.3, 1.1, material='gunmetal',
                   segments=14)
    # tow cable from the drum house up to the near arm
    K.plan_beams(s, 'TowCable', [((-8.0, -ARM_V - 4.0, 8.4), (-8.0, -ARM_V, ARM_D + 0.6))],
                 0.16, material='dark')
    # mouth lamp in the middle of the net
    F.light(s, 'NetLamp', K.P(ARM_U1 - 2.0, 0.0, ARM_D + 0.4), 'glow_warm', size=0.55)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
