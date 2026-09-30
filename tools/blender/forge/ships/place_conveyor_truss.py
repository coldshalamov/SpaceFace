"""Conveyor truss (place_conveyor_truss) — Forge rebuild.

Idea: "the ore bridge". An elevated conveyor span between a drive house (+X discharge) and a
tail house (-X feed): a lattice truss carries an enclosed belt gallery on its top chord and a
return strand beneath; A-frame legs drop to spread feet every bay. Amber walkway lamps along
the gallery, hazard bands on the houses. Plan reads: thin span but visibly trussed — two
houses, one bridge.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_conveyor_truss'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # --- drive house (+X) and tail house (-X) ---------------------------------------------------
    F.box(s, 'DriveHouse', (11.5, 0, 4.2), (5.5, 4.6, 5.0), material='paint', bevel=0.25,
          taper=0.9)
    F.box(s, 'DriveBand', (11.5, 0, 5.6), (5.7, 4.8, 0.7), material='hazard', bevel=0.0)
    n0 = len(s.objects)
    F.cylinder(s, 'DriveDrum', (11.5, -2.4, 5.4), (11.5, 2.4, 5.4), 1.1, material='gunmetal',
               segments=18)
    s.anim(s.objects[n0:], 'spin:side:1p8', (11.5, 0, 5.4))
    lamp = F.light(s, 'DriveLamp', (11.5, -2.2, 7.0), 'glow_amber', size=0.45)
    s.anim(lamp, 'blink:1p7:0p4', (11.5, -2.2, 7.0))
    F.box(s, 'TailHouse', (-11.5, 0, 3.4), (4.6, 4.0, 3.4), material='paint2', bevel=0.2)
    n1 = len(s.objects)
    F.cylinder(s, 'TailDrum', (-11.5, -2.0, 4.2), (-11.5, 2.0, 4.2), 0.9,
               material='gunmetal', segments=16)
    s.anim(s.objects[n1:], 'spin:side:1p8', (-11.5, 0, 4.2))
    F.box(s, 'FeedChute', (-11.5, 0, 1.6), (3.0, 2.6, 2.0), material='dark', bevel=0.1)

    # --- the span: lattice truss + enclosed belt gallery on top --------------------------------
    F.truss(s, 'Span', (-9.2, 0, 3.0), (9.2, 0, 4.4), 3.2, 8, material='paint2',
            chord=0.35, web=0.2)
    F.box(s, 'Gallery', (0.0, 0, 5.6), (19.0, 2.4, 1.7), material='paint2', bevel=0.1)
    F.box(s, 'GalleryRoof', (0.0, 0, 6.6), (19.0, 2.8, 0.3), material='dark', bevel=0.02)
    # return strand under the truss
    F.box(s, 'Return', (0.0, 0, 2.6), (18.6, 1.2, 0.5), material='dark', bevel=0.02)

    # --- A-frame legs with spread feet at two stations ------------------------------------------
    for k, lx in enumerate((-4.5, 4.5)):
        for e in (-1, 1):
            F.beams(s, f'Leg{k}{e:+d}', [((lx - 1.2, e * 3.4, 0.2), (lx, e * 1.4, 3.4)),
                                         ((lx + 1.2, e * 3.4, 0.2), (lx, e * 1.4, 3.4))],
                    0.4, material='paint2')
            F.box(s, f'Foot{k}{e:+d}', (lx, e * 3.5, 0.4), (3.2, 1.4, 0.7),
                  material='paint2', bevel=0.06)
        F.beams(s, f'LegBar{k}', [((lx, -3.4, 1.0), (lx, 3.4, 1.0))], 0.3,
                material='paint2')

    # --- walkway lamps — one per bay on the gallery side ----------------------------------------
    s.detail = 1
    for i in range(5):
        wx = -7.6 + i * 3.8
        F.cylinder(s, f'LampPost{i}', (wx, -1.7, 5.9), (wx, -1.7, 7.2), 0.09,
                   material='paint2', segments=8)
        F.light(s, f'WalkLamp{i}', (wx, -1.7, 7.4), 'glow_amber', size=0.3)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
