"""Extraction mast (place_extraction_mast) — Forge rebuild.

Idea: "the straw in the rock". A borehole extraction mast: lattice tower over a wellhead
housing, held by four splayed outriggers with spread feet (the tall-and-thin fix — the plan
reads as a cross of feet plus the crown, not a sliver). Amber flood head at the top (SOCKET_
Head), claim strobe above it, feeder pipes running down to a pump skid. Work-fleet palette,
ochre band, amber floods.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_34  # noqa: E402

SHIP_ID = 'place_extraction_mast'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- wellhead + pump skid at the base -------------------------------------------------------
    F.box(s, 'Wellhead', (0, 0, 1.2), (3.4, 3.4, 2.4), material='paint2', bevel=0.15)
    F.box(s, 'WellCap', (0, 0, 2.55), (2.4, 2.4, 0.5), material='hazard', bevel=0.03)
    F.box(s, 'PumpSkid', (2.8, -1.4, 0.8), (3.2, 2.0, 1.6), material='paint.aged',
          bevel=0.1)
    F.cylinder(s, 'FeederA', (2.8, -1.2, 1.4), (0.6, -0.4, 2.0), 0.22, material='gunmetal',
               segments=10)
    F.cylinder(s, 'FeederB', (2.8, -1.7, 1.4), (0.4, -0.8, 2.2), 0.18, material='gunmetal',
               segments=8)
    F.light(s, 'PumpLamp', (3.4, -1.4, 1.9), 'glow_amber', size=0.35)

    # --- four splayed outriggers spreading the plan ----------------------------------------------
    for k, (ex, ey) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        F.truss(s, f'Outrigger{k}', (ex * 0.7, ey * 0.7, 2.0), (ex * 4.6, ey * 3.4, 0.5),
                1.1, 2, material='paint2', chord=0.4, web=0.22)
        F.box(s, f'Foot{k}', (ex * 4.9, ey * 3.6, 0.4), (2.2, 1.8, 0.8),
              material='paint2', bevel=0.06)
        F.box(s, f'FootPad{k}', (ex * 4.9, ey * 3.6, 0.9), (1.6, 1.2, 0.25),
              material='hazard', bevel=0.0)
        F.light(s, f'FootLamp{k}', (ex * 4.9, ey * 3.6, 1.15), 'glow_amber', size=0.28)

    # --- lattice mast ---------------------------------------------------------------------------
    F.truss(s, 'Mast', (0, 0, 1.6), (0, 0, 11.2), 1.7, 7, material='paint2', chord=0.32,
            web=0.18)
    F.cylinder(s, 'MastBandA', (0, 0, 4.6), (0, 0, 6.0), 1.05, material='hazard',
               segments=12)
    F.cylinder(s, 'MastBandB', (0, 0, 8.8), (0, 0, 9.6), 0.95, material='hazard',
               segments=12)

    # --- ANI-34 pumpjack: walking beam on a mid-mast trunnion + plunger rod --------------------
    F.cylinder(s, 'BeamTrunnion', (-0.35, -0.5, 8.6), (-0.35, 0.5, 8.6), 0.22,
                          material='gunmetal', segments=12)
    beam = F.box(s, 'PumpBeam', (0.1, 0, 8.72), (3.4, 0.34, 0.4), material='hazard', bevel=0.04)
    counter = F.box(s, 'PumpCounter', (-1.6, 0, 8.72), (0.7, 0.5, 0.9), material='paint2', bevel=0.06)
    rod = F.cylinder(s, 'PlungerRod', (1.2, 0, 2.6), (1.2, 0, 8.5), 0.09, material='bare', segments=10)

    # --- crown flood head (SOCKET_Head station) ---------------------------------------------------
    F.box(s, 'Head', (0, 0, 11.9), (2.6, 2.6, 1.4), material='paint2', bevel=0.12)
    F.box(s, 'HeadBand', (0, 0, 12.0), (2.7, 2.7, 0.4), material='stripe', bevel=0.0)
    # three amber floods on arms, aimed down at the work face
    for k, a in enumerate((0.0, 120.0, 240.0)):
        import math as _m
        r = _m.radians(a)
        ax, ay = _m.cos(r) * 1.8, _m.sin(r) * 1.8
        F.beams(s, f'FloodArm{k}', [((0, 0, 11.9), (ax, ay, 11.7))], 0.22,
                material='paint2')
        F.work_lamp(s, f'Flood{k}', (ax, ay, 11.5), aim=(_m.cos(r) * 0.5, _m.sin(r) * 0.5,
                                                        -0.8), size=0.5, lens='glow_amber')
    F.beacon(s, 'ClaimStrobe', (0, 0, 13.0), finish='glow_red', size=0.4)
    s.ani34_bank = ANI_34.build(s, {'beam': [beam, counter], 'rod': rod},
                                source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani34_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_34.motion_bank.MOTIONS_DIR,
                                                   'extraction-mast.motion.json'))
