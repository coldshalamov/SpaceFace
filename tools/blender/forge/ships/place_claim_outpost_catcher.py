"""Claim outpost — CATCHER (place_claim_outpost_catcher) — Forge rebuild.

Idea: "the catch cradle". The shared anchor ring carries a cargo-capture rig: a slewing
articulated arm off the dock-side ring holds a U-shaped catch cradle proud of the wheel face
— open jaws with padded hooks, a strung capture net between the tips, amber guide strobes
running up the arms, and a winch house with cable drums on the ops pod flank. Reads from
above as a claw reaching out of the ring — heist-catcher silhouette.

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


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'seed': 31})

    # --- slew pedestal on the dock-side ring station ----------------------------------------
    K.plan_cyl(s, 'SlewBase', 28.0, 0.0, 1.6, 28.0, 0.0, 4.6, 5.4, material='paint2',
               segments=24)
    K.plan_cyl(s, 'SlewCollar', 28.0, 0.0, 4.0, 28.0, 0.0, 5.6, 6.0, material='paint2',
               segments=24)

    # --- articulated arm: shoulder -> elbow -> cradle root ------------------------------------
    K.plan_truss(s, 'ArmA', (28.0, 0.0, 5.0), (34.0, 2.0, 11.0), 3.2, 4,
                 material='paint2', chord=0.5, web=0.28)
    K.plan_cyl(s, 'Elbow', 34.0, 2.0, 10.0, 34.0, 2.0, 12.4, 2.6, material='paint2',
               segments=16)
    K.plan_truss(s, 'ArmB', (34.0, 2.0, 11.6), (38.0, 0.0, 14.0), 2.6, 3,
                 material='paint2', chord=0.42, web=0.24)

    # --- catch cradle: U of padded jaws around a capture mouth (inside live depth ≈17) ---------
    cx, cv, cd = 40.0, 0.0, 11.0
    K.plan_box(s, 'CradleRoot', cx - 3.0, cv, cd - 1.0, 5.0, 7.0, 4.0, material='paint2',
               bevel=0.2)
    for e in (-1, 1):
        # jaw arms run forward past the mouth, then angle inward
        K.plan_truss(s, f'Jaw{e:+d}', (cx - 2.0, cv + e * 5.2, cd + 1.0),
                     (cx + 8.0, cv + e * 5.2, cd + 4.4), 1.8, 3, material='paint.role',
                     chord=0.5, web=0.3)
        K.plan_truss(s, f'JawTip{e:+d}', (cx + 8.0, cv + e * 5.2, cd + 4.4),
                     (cx + 11.5, cv + e * 2.6, cd + 5.4), 1.4, 2, material='paint.role',
                     chord=0.4, web=0.26)
        # padded hook face on the jaw inner side
        K.plan_box(s, f'Pad{e:+d}', cx + 5.0, cv + e * 4.4, cd + 3.6, 8.0, 0.9, 2.2,
                   material='dark', bevel=0.1)
        # guide strobes up each jaw — catch-me lights
        for i in range(3):
            t = i / 2.0
            jx = cx - 1.0 + (cx + 9.0 - (cx - 1.0)) * t
            jd = cd + 1.4 + (cd + 5.0 - (cd + 1.4)) * t
            F.light(s, f'JawStrobe{e:+d}{i}', K.P(jx, cv + e * 5.2, jd), 'glow_cyan',
                    size=0.35)
    # capture net: strap webbing strung between the jaw tips across the mouth
    s.detail = 1
    for i in range(4):
        t = -3.6 + i * 2.4
        K.plan_beams(s, f'NetV{i}',
                     [((cx + 9.5, cv - 4.4, cd + 4.4 + t * 0.2),
                       (cx + 9.5, cv + 4.4, cd + 4.4 + t * 0.2))], 0.16, material='dark')
    for j in range(3):
        t = -4.0 + j * 4.0
        K.plan_beams(s, f'NetH{j}',
                     [((cx + 9.5, cv + t, cd + 4.0), (cx + 9.5, cv + t, cd + 5.8))],
                     0.16, material='dark')
    s.detail = 0
    # throat lamp inside the mouth
    F.light(s, 'MouthLamp', K.P(cx + 8.0, cv, cd + 4.6), 'glow_warm', size=0.6)

    # --- winch house + cable drums on the ops pod flank (kept inside the live depth) -----------
    K.plan_box(s, 'WinchHouse', -10.0, 6.0, 10.8, 8.0, 6.0, 3.4, material='paint2',
               bevel=0.15)
    for e in (-1, 1):
        K.plan_cyl(s, f'Drum{e:+d}', -10.0 + e * 1.8, 6.0, 11.4, -10.0 + e * 1.8, 6.0,
                   12.9, 1.0, material='gunmetal', segments=14)
    # the tow cable from drum to the arm elbow
    K.plan_beams(s, 'TowCable', [((-10.0, 6.0, 13.4), (34.0, 2.0, 12.4))], 0.14,
                 material='dark')
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
