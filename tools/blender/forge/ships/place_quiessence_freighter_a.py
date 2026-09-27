"""Quiessence freighter A — the long-haul liner of the becalmed ring.
Brand-new place (new_place): the Quiessence formation's long freighter hull.

Idea: "a sleeper ship that forgot to wake". Long parallel hull with a plough bow, a low
crew casette amidships carrying two full rows of warm bunk windows, container collars
fore and aft of it, and a dead triple-bell engine block astern. Every bunk is warm; no
drive glow, no nav lights except one faint violet beacon.
Three values: charcoal-violet skin, violet-black secondary, near-black machinery.
Identity colour: dim violet band; one faint violet beacon. Lights: bunk windows only.
Envelope ~ x [-21, 19], y [-4.5, 4.5], z [-4.5, 5.5] — smaller than the old hulk stand-in.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import quiessence_freighter_kit as Q  # noqa: E402

SHIP_ID = 'place_quiessence_freighter_a'


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, Q.COLORS)

    # main hull — long slab-sided freighter body
    F.box(s, 'Hull', (-1.0, 0, 0), (36.0, 7.0, 6.6), material='deadmetal', bevel=0.5, taper=1.0)
    F.band(s, 'Hull', (-6.0, 0, 0), (1, 0, 0), 0.8, 'stripe', depth=0.1)
    F.band(s, 'Hull', (8.0, 0, 0), (1, 0, 0), 0.8, 'stripe', depth=0.1)
    # plough bow
    F.box(s, 'Bow', (18.4, 0, 0.2), (4.6, 5.6, 5.4), material='deadmetal.deep', bevel=0.6,
          taper=0.62)
    F.box(s, 'BowKeel', (19.6, 0, -2.2), (3.2, 3.4, 1.6), material='gunmetal', bevel=0.3,
          taper=0.5)
    # spine keel line dorsal
    F.box(s, 'Spine', (-1.0, 0, 3.6), (34.0, 1.1, 0.9), material='deadmetal.deep', bevel=0.06)

    # crew cassette amidships — two rows of warm bunks, the ship's only lit face
    F.box(s, 'Crew', (4.5, 0, 3.0), (10.0, 7.6, 1.6), material='deadmetal.deep', bevel=0.1)
    Q.bunk_windows(s, 0.6, 8.6, 9, y=3.85, z=3.0, tag='T')
    Q.bunk_windows(s, 0.6, 8.6, 9, y=3.55, z=1.15, tag='F')

    # container collars fore and aft — cargo ribs around the hull
    for i, x in enumerate((-9.5, -6.5, -3.5, 11.5, 14.0)):
        F.ring(s, f'Collar{i}', (x, 0, 0), 4.9, 0.5, axis=(1, 0, 0), material='gunmetal',
               segments=4, sides=4)
        F.box(s, f'CollarPlate{i}', (x, 0, 4.55), (0.7, 4.4, 0.5), material='deadmetal.deep',
              bevel=0.04)

    # engine block astern — cold
    F.box(s, 'EngBlock', (-20.0, 0, 0), (3.2, 6.6, 6.2), material='deadmetal.deep', bevel=0.25)
    Q.cold_engines(s, -21.4, (-1.9, 1.9, 0.0), r=1.35)
    Q.dead_nav(s, 16.5)
    Q.violet_beacon(s, (4.5, 0.0, 4.6))

    # sockets for the new place
    s.socket_names = ['SOCKET_Structure_Core', 'SOCKET_Camera_Focus']
    s.socket('SOCKET_Structure_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Camera_Focus', (4.5, 0.0, 3.0))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
