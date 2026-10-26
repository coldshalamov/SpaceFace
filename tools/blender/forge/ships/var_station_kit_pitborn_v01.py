"""The Pitborn faction station kit — row 512. Junk and string-light: welded scrap plates
scabbed onto the shell, amber string lights sagging between them, a rust crown of welded
offcuts — the station is held together the Pitborn way, and the lights say it's proud."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_pitborn_v01'
COLORS = {
    'paint': '#6a4630',            # packed rust
    'paint2': '#3e2e24',
    'paint.scrap': '#5a5148',      # grey scrap plate
    'paint.scrapb': '#4a3f38',     # darker offcut
    'stripe': '#c8501c',           # pitborn rust-orange
    'gunmetal': '#443e38',
    'dark': '#16120e',
    'hazard': '#e0a526',
    'glow_amber.pit': '#ffae2a',
    'glow_warm': '#ffc27a',
}

STRINGS = ((8.0, 52.0), (80.0, 124.0), (150.0, 196.0), (222.0, 266.0), (296.0, 340.0))


def dress(s):
    # scabbed band: rust plate, then the junk — welded offcuts at ragged angles
    K.ring_wall(s, 'ScabBand', K.SHELL_R + 0.7, 9.0, 25.0, 2.2, 'paint', segs=56)
    K.ring_wall(s, 'ScabRail', K.SHELL_R + 0.95, 25.0, 26.0, 2.4, 'stripe', segs=56)
    s.detail = 1
    K.patch_row(s, 'Scrap', 0.0, 32, 11.25, K.SHELL_R + 1.15, 10.5, 23.5,
                ['paint.scrap', 'paint.scrapb', 'paint2', 'gunmetal'], seed=9)
    # weld beads — the seams that say the scrap is held, not hung
    beads = [K.tangent_box(6.0 + i * 22.5, K.SHELL_R + 1.3, 12.0 + (i % 4) * 3.5, 0.5, 3.0, 0.6)
             for i in range(16)]
    F.boxes(s, 'WeldBead', beads, 'hazard', bevel=0.02)
    s.detail = 0
    # the string lights: amber catenaries sagging between scrap towers — the Pitborn look
    for i, (a0, a1) in enumerate(STRINGS):
        K.catenary(s, f'String{i}', a0, a1, 27.0 + (i % 2) * 2.0, 5.0, K.SHELL_R + 2.2,
                   'glow_amber.pit', lamps=5, lamp_size=0.45)
    # scrap towers at the string ends — welded offcut pylons holding the runs
    for i, a in enumerate((8.0, 80.0, 150.0, 222.0, 296.0)):
        x, y, _ = K.polar(K.SHELL_R + 0.8, a)
        F.box(s, f'Tower{i}', (x, y, 20.0), (3.0, 4.0, 18.0 + (i % 2) * 4.0),
              material='paint.scrapb', rot_z=math.radians(a), taper=0.85, bevel=0.08)
        F.light(s, f'TowerLamp{i}', K.polar(K.SHELL_R + 1.4, a, 29.5 + (i % 2) * 4.0),
                'glow_amber.pit', size=0.5)
    # the rust crown: welded offcut ring and one proud work lamp
    for i in range(6):
        a = i * 60.0
        F.box(s, f'CrownScrap{i}', K.polar(5.0, a, 36.0 + (i % 3)), (4.5, 3.0, 2.0),
              material='paint.scrap' if i % 2 else 'paint2', rot_z=math.radians(a + i * 7.0),
              bevel=0.05)
    F.cylinder(s, 'CrownMast', (0.0, 0.0, 36.0), (0.0, 0.0, 43.0), 1.0, 0.5,
               material='gunmetal', segments=10)
    F.light(s, 'CrownLamp', (0.0, 0.0, 43.6), 'glow_amber.pit', size=0.8)


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
