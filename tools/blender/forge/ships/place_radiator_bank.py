"""Radiator bank (place_radiator_bank) — Forge rebuild.

Idea: "the heat fence". A manifold skid carrying six vertical radiator fins in a row, dull
furnace-amber cores glowing in the gaps between fins, bypass pipe along the back, service
walkway on top with amber lamps. Plan reads: a long thin bank — the fins themselves are the
silhouette, so the manifold frame gets end houses to widen the plan at both ends.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_radiator_bank'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- manifold skid frame ----------------------------------------------------------------------
    F.box(s, 'Skid', (0, 0, 0.7), (16.5, 1.6, 1.4), material='paint2', bevel=0.08)
    for e in (-1, 1):
        F.box(s, f'Foot{e:+d}', (e * 7.6, 0, 0.4), (1.6, 2.4, 0.8), material='paint.aged',
              bevel=0.05)
    # feed pipes along the skid
    F.cylinder(s, 'FeedA', (-8.2, -0.5, 1.6), (8.2, -0.5, 1.6), 0.3, material='gunmetal',
               segments=10)
    F.cylinder(s, 'FeedB', (-8.2, 0.5, 1.6), (8.2, 0.5, 1.6), 0.22, material='gunmetal',
               segments=8)

    # --- six fins on risers + glowing cores in the gaps ---------------------------------------------
    fin_x = [-6.8 + k * 2.72 for k in range(6)]
    for k, fx in enumerate(fin_x):
        F.cylinder(s, f'Riser{k}', (fx, 0, 1.4), (fx, 0, 2.4), 0.35, material='gunmetal',
                   segments=10)
        F.box(s, f'Fin{k}', (fx, 0, 4.6), (0.5, 0.7, 5.6), material='paint2', bevel=0.04)
        # the hot edge: a thin warm glow strip along the fin tip — the only emissive on the fin
        F.box(s, f'FinEdge{k}', (fx, 0, 7.3), (0.56, 0.2, 0.24), material='glow_amber',
              bevel=0.0)
        # edge ribs on each fin face so the fin reads as folded plate, not a card
        s.detail = 1
        for e in (-1, 1):
            F.box(s, f'FinRib{k}{e:+d}', (fx, e * 0.42, 4.6), (0.42, 0.1, 4.8),
                  material='paint2', bevel=0.0)
        s.detail = 0
    # furnace cores glowing in the five gaps — narrow slits, not emissive panels
    for k in range(5):
        gx = (fin_x[k] + fin_x[k + 1]) / 2
        F.box(s, f'Core{k}', (gx, 0, 4.4), (0.45, 0.3, 3.6), material='glow_amber',
              bevel=0.02)

    # --- end houses widening the plan at both ends ---------------------------------------------------
    for k, ex in enumerate((-8.0, 8.0)):
        F.box(s, f'EndHouse{k}', (ex, 0, 3.0), (1.8, 1.9, 4.2), material='paint2',
              bevel=0.12, taper=0.9)
        F.box(s, f'EndBand{k}', (ex, 0, 4.7), (1.92, 0.6, 0.24), material='hazard',
              bevel=0.0)
        F.light(s, f'EndLamp{k}', (ex, -1.0, 5.4), 'glow_amber', size=0.35)

    # --- service walkway over the fins ----------------------------------------------------------------
    F.box(s, 'Walkway', (0, 0, 7.6), (16.4, 1.4, 0.3), material='paint2', bevel=0.02)
    for k in range(5):
        F.cylinder(s, f'Rail{k}', (-7.0 + k * 3.5, 0.55, 7.7), (-7.0 + k * 3.5, 0.55, 8.6),
                   0.07, material='paint2', segments=6)
    F.cylinder(s, 'RailTop', (-7.2, 0.55, 8.6), (7.2, 0.55, 8.6), 0.07, material='hazard',
               segments=6)
    F.beacon(s, 'SkidStrobe', (-8.0, 0, 5.6), finish='glow_red', size=0.35)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
