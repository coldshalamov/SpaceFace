"""Drill platform (place_drill_platform) — Forge rebuild.

Idea: "the rock-chewer". A square jack-up deck held over the claim face on four splayed
outrigger legs; a lattice derrick over the centre feeds the drill string straight down through
a moon pool in the deck. Power house with lit windows, pipe rack, mud tanks, work lamps on
each leg station. Plan reads: square deck, four splayed feet, derrick cross on top.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_26  # noqa: E402

SHIP_ID = 'place_drill_platform'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- square deck with moon pool -----------------------------------------------------------
    # deck as four slabs around a central square hole
    F.box(s, 'DeckA', (0, -4.8, 4.0), (14.0, 5.0, 1.0), material='paint2', bevel=0.06)
    F.box(s, 'DeckB', (0, 4.8, 4.0), (14.0, 5.0, 1.0), material='paint2', bevel=0.06)
    # Lit structure (GFX light-upgrades): one thin amber line along each long deck edge, outside the
    # grates, so the square deck reads as a lit outline at the place tilt (LOOK.md: lamps are light).
    for e in (-1, 1):
        F.band(s, 'DeckA' if e < 0 else 'DeckB', (0, e * 7.0, 4.0), (0, 1, 0), 0.2, 'glow_amber',
               facing=(0, 0, 1), min_facing=0.5, inset=0.01, depth=-0.02)
    F.box(s, 'DeckC', (-4.8, 0, 4.0), (4.4, 4.8, 1.0), material='paint.aged', bevel=0.06)
    F.box(s, 'DeckD', (4.8, 0, 4.0), (4.4, 4.8, 1.0), material='paint.aged', bevel=0.06)
    # recessed dark grating insets on the slabs
    s.detail = 1
    F.box(s, 'GrateA', (0, -4.8, 4.56), (11.0, 3.4, 0.16), material='dark', bevel=0.0)
    F.box(s, 'GrateB', (0, 4.8, 4.56), (11.0, 3.4, 0.16), material='dark', bevel=0.0)
    s.detail = 0
    # moon-pool kerb ring + hazard edge
    for e in (-1, 1):
        F.box(s, f'PoolKerb{e:+d}', (e * 2.4, 0, 4.6), (0.4, 5.0, 0.4), material='hazard',
              bevel=0.0)
        F.box(s, f'PoolKerbY{e:+d}', (0, e * 2.4, 4.6), (5.0, 0.4, 0.4), material='hazard',
              bevel=0.0)
    F.box(s, 'PoolThroat', (0, 0, 3.2), (4.4, 4.4, 1.2), material='dark', bevel=0.05)

    # --- four splayed outrigger legs to spread feet -------------------------------------------
    for k, (ex, ey) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        fx, fy = ex * 6.6, ey * 6.6
        F.beams(s, f'Leg{k}', [((fx, fy, 0.4), (ex * 5.6, ey * 5.6, 3.9))], 0.9,
                material='paint2')
        F.box(s, f'Foot{k}', (fx, fy, 0.3), (2.8, 2.8, 0.7), material='paint2',
              bevel=0.08)
        F.box(s, f'FootHaz{k}', (fx, fy, 0.75), (2.0, 2.0, 0.2), material='hazard',
              bevel=0.0)
        F.light(s, f'LegLamp{k}', (fx, fy, 1.2), 'glow_amber', size=0.35)

    # --- derrick over the moon pool: tapering lattice tower -----------------------------------
    F.truss(s, 'DerrickA', (-1.8, -1.8, 4.4), (-0.5, -0.5, 11.0), 0.9, 4, material='paint2',
            chord=0.28, web=0.16)
    F.truss(s, 'DerrickB', (1.8, 1.8, 4.4), (0.5, 0.5, 11.0), 0.9, 4, material='paint2',
            chord=0.28, web=0.16)
    F.truss(s, 'DerrickC', (-1.8, 1.8, 4.4), (-0.5, 0.5, 11.0), 0.9, 4, material='paint2',
            chord=0.28, web=0.16)
    F.truss(s, 'DerrickD', (1.8, -1.8, 4.4), (0.5, -0.5, 11.0), 0.9, 4, material='paint2',
            chord=0.28, web=0.16)
    F.box(s, 'Crown', (0, 0, 11.4), (2.0, 2.0, 1.0), material='hazard', bevel=0.06)
    F.beacon(s, 'CrownStrobe', (0, 0, 12.1), finish='glow_red', size=0.4)
    # drill string down through the moon pool
    drill_string = F.cylinder(s, 'DrillString', (0, 0, 10.6), (0, 0, -6.5), 0.45,
                              material='gunmetal', segments=12)
    drill_bit = F.cylinder(s, 'DrillBit', (0, 0, -6.5), (0, 0, -8.4), 0.9, 0.3,
                           material='bare', segments=12)
    # ANI-26: feed collar riding the string at deck level — ratchets the bore down.
    collar = F.cylinder(s, 'FeedCollar', (0, 0, 4.2), (0, 0, 4.7), 0.8, 0.72,
                        material='hazard', segments=12, bevel=0.02)

    # --- power house + pipe rack + mud tanks ----------------------------------------------------
    F.box(s, 'PowerHouse', (-4.6, -4.8, 6.0), (4.4, 3.8, 3.0), material='paint', bevel=0.15,
          taper=0.9)
    s.detail = 1
    for i in range(2):
        F.box(s, f'PwrWin{i}', (-5.6 + i * 2.0, -6.75, 6.4), (1.0, 0.14, 0.7),
              material='glow_warm', bevel=0.0)
    s.detail = 0
    F.cylinder(s, 'Exhaust', (-3.4, -4.4, 7.5), (-3.4, -4.4, 9.6), 0.3, material='dark',
               segments=10)
    # pipe rack along the deck edge
    for i in range(3):
        F.cylinder(s, f'Pipe{i}', (-6.5, 4.6 + i * 0.5, 4.8), (6.5, 4.6 + i * 0.5, 4.8),
                   0.22, material='gunmetal', segments=10)
    # twin mud tanks
    for e in (-1, 1):
        F.cylinder(s, f'MudTank{e:+d}', (4.6, e * 4.9 - 1.4, 4.5), (4.6, e * 4.9 + 1.4, 4.5),
                   1.1, material='paint.aged', segments=14)
        F.light(s, f'MudLamp{e:+d}', (4.6, e * 4.9, 5.8), 'glow_amber', size=0.3)
    s.ani26_bank = ANI_26.build(s, {'string': [drill_string, drill_bit], 'collar': collar},
                                source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani26_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_26.motion_bank.MOTIONS_DIR,
                                                   'drill-platform.motion.json'))
