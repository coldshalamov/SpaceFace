"""Quiessence freighter B — the container-spine hauler of the becalmed ring.
Brand-new place (new_place): second hull of the Quiessence formation.

Idea: "a spine wearing its cargo like vertebrae". A narrow keel truss with a forward
bridge pod, six double-stacked container frames along the flanks, and a twin engine
block astern. Warm bunk windows on the crew pod; all else cold and dark.
Three values: charcoal-violet skin, violet-black boxes, near-black machinery.
Identity colour: dim violet band on the bridge. Lights: bunk windows + one faint violet
beacon.
Envelope ~ x [-18, 18], y [-5.5, 5.5], z [-5, 6].
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import quiessence_freighter_kit as Q  # noqa: E402

SHIP_ID = 'place_quiessence_freighter_b'


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, Q.COLORS)

    # narrow keel spine the cargo frames hang from
    F.box(s, 'Spine', (0.5, 0, 0), (33.0, 2.2, 2.2), material='gunmetal', bevel=0.1)
    F.box(s, 'SpineTop', (0.5, 0, 1.5), (30.0, 0.9, 0.8), material='deadmetal.deep', bevel=0.05)

    # six container bays: stacked twin pods each side of the spine
    for i in range(6):
        x = -8.5 + i * 4.4
        F.box(s, f'BayFrame{i}', (x, 0, 0), (3.6, 9.4, 3.4), material='gunmetal', bevel=0.1)
        for e in (-1, 1):
            F.box(s, f'Box{i}{e:+d}', (x, e * 3.3, 0), (3.2, 4.4, 2.9), material='deadmetal',
                  bevel=0.12)
            F.band(s, f'Box{i}{e:+d}', (x, e * 3.3, 0), (1, 0, 0), 0.5, 'paint2', depth=0.06)
            # corner castings
            s.detail = 1
            for ex in (-1, 1):
                F.box(s, f'Cast{i}{e:+d}{ex:+d}', (x + ex * 1.55, e * 5.3, 0), (0.5, 0.5, 2.6),
                      material='gunmetal', bevel=0.04)
            s.detail = 0

    # forward bridge pod — the crew quarters, bunk windows burning
    F.box(s, 'Bridge', (16.6, 0, 1.6), (5.0, 6.0, 4.6), material='deadmetal', bevel=0.4)
    F.box(s, 'BridgeBrow', (18.2, 0, 3.2), (2.4, 4.6, 1.4), material='deadmetal.deep', bevel=0.2)
    F.box(s, 'BridgeGlass', (19.4, 0, 3.2), (0.3, 3.8, 1.0), material='glass', bevel=0.02)
    F.band(s, 'Bridge', (16.6, 0, 3.4), (0, 0, 1), 0.6, 'stripe', depth=0.06)
    Q.bunk_windows(s, 14.9, 18.1, 4, y=3.05, z=1.2, tag='B')
    Q.violet_beacon(s, (16.6, 0.0, 4.6))

    # twin engine block astern — cold
    F.box(s, 'EngBlock', (-17.6, 0, 0), (4.2, 5.4, 4.6), material='deadmetal.deep', bevel=0.25)
    Q.cold_engines(s, -19.4, (-1.7, 1.7), r=1.5)
    Q.dead_nav(s, 17.5)

    # sockets for the new place
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Camera_Focus', (16.6, 0.0, 2.0))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
