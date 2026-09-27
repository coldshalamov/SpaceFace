"""Quiessence freighter C — the tank-line hauler of the becalmed ring.
Brand-new place (new_place): third hull of the Quiessence formation.

Idea: "a string of sleeping tanks". Four saddle tanks on a low spine, an aft bridge tower
with warm bunk windows over the engine block, twin dark bells. Becalmed: cold drives,
one faint violet beacon.
Three values: charcoal-violet skin, violet-black tanks, near-black machinery.
Identity colour: dim violet tank bands. Lights: bridge bunks + one faint violet beacon.
Envelope ~ x [-20, 19], y [-5.5, 5.5], z [-5, 8].
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import quiessence_freighter_kit as Q  # noqa: E402

SHIP_ID = 'place_quiessence_freighter_c'


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, Q.COLORS)

    # low spine and bows
    F.box(s, 'Spine', (0, 0, -0.4), (34.0, 2.6, 2.6), material='gunmetal', bevel=0.12)
    F.box(s, 'Bowsprit', (18.0, 0, -0.2), (5.0, 1.4, 1.4), material='deadmetal.deep', bevel=0.2,
          taper=0.6)

    # four saddle tanks: big drums in saddles, violet band each
    for i, x in enumerate((-12.0, -4.0, 4.0, 12.0)):
        F.cylinder(s, f'Tank{i}', (x - 3.2, 0, 1.6), (x + 3.2, 0, 1.6), 3.1,
                   material='deadmetal.deep', segments=14, bevel=0.15)
        F.ring(s, f'TankBand{i}', (x, 0, 1.6), 3.15, 0.4, axis=(1, 0, 0), material='stripe',
               segments=14, sides=6)
        # saddles joining tank to spine
        for e in (-1, 1):
            F.box(s, f'Saddle{i}{e:+d}', (x + e * 2.6, 0, -0.1), (0.7, 5.4, 1.8),
                  material='gunmetal', bevel=0.06)
        F.box(s, f'TankCap{i}F', (x + 3.35, 0, 1.6), (0.4, 3.2, 3.2), material='gunmetal',
              bevel=0.05)

    # aft tower: engine block below, bridge above — bunks burning
    F.box(s, 'EngBlock', (-18.0, 0, 0.4), (4.6, 6.0, 5.4), material='deadmetal.deep', bevel=0.25)
    F.box(s, 'Tower', (-17.4, 0, 5.0), (3.6, 4.4, 5.4), material='deadmetal', bevel=0.3)
    F.box(s, 'TowerCap', (-17.4, 0, 7.9), (4.0, 4.8, 0.7), material='deadmetal.deep', bevel=0.12)
    F.box(s, 'TowerGlass', (-16.9, 0, 6.9), (1.8, 3.6, 0.9), material='glass', bevel=0.04)
    F.band(s, 'Tower', (-17.4, 0, 6.4), (0, 0, 1), 0.5, 'stripe', depth=0.06)
    # bunk windows on the tower flanks
    s.detail = 1
    bunks = []
    for e in (-1, 1):
        for i in range(3):
            bunks.append(((-17.4 + (i - 1) * 1.0, e * 2.25, 5.6), (0.5, 0.1, 0.34), 0.0))
            bunks.append(((-17.4 + (i - 1) * 1.0, e * 2.25, 4.6), (0.5, 0.1, 0.34), 0.0))
    F.boxes(s, 'TowerBunks', bunks, 'glow_warm')
    s.detail = 0

    Q.cold_engines(s, -20.0, (-1.7, 1.7), r=1.5)
    Q.dead_nav(s, 18.5)
    Q.violet_beacon(s, (-17.4, 0.0, 8.6))

    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Camera_Focus', (-17.4, 0.0, 5.0))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
