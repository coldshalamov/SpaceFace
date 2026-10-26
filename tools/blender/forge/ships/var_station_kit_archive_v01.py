"""The Archive faction station kit — row 512. Indigo scriptorium: stacked scroll bands,
pressed glyph tiles on dark vellum, dim violet reading lamps — the station reads as a
reading room that happens to be a station."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_archive_v01'
COLORS = {
    'paint': '#3a2a5a',            # archive indigo
    'paint2': '#241a38',           # deep vellum
    'stripe': '#6a4a9a',           # script violet
    'ceramic': '#8a7a9a',          # pressed glyph vellum-pale
    'gunmetal': '#38303e',
    'dark': '#12101a',
    'glow_warm.arc': '#9a7ad0',    # reading-lamp violet
    'glow_amber.arc': '#d0b060',   # catalogue gilt, rare
}

GLYPHS = 18


def dress(s):
    # vellum band: deep indigo plate — the page the glyphs are pressed into
    K.ring_wall(s, 'VellumBand', K.SHELL_R + 0.8, 9.0, 25.0, 2.4, 'paint2', segs=56)
    # stacked scroll courses — the scriptorium's shelved lines
    for i, z in enumerate((11.0, 17.0, 23.0)):
        K.ring_wall(s, f'Scroll{i}', K.SHELL_R + 1.1, z, z + 1.6, 2.8, 'paint', segs=56)
        K.ring_wall(s, f'ScrollEdge{i}', K.SHELL_R + 1.2, z + 1.6, z + 2.1, 2.9, 'stripe',
                    segs=56)
    # pressed glyph tiles between the scroll courses — the collection's index
    s.detail = 1
    for i in range(GLYPHS):
        a = 10.0 + i * (360.0 / GLYPHS)
        z = 13.6 + (i % 2) * 6.0
        F.box(s, f'Glyph{i}', K.polar(K.SHELL_R + 1.35, a, z), (0.6, 4.6, 3.4),
              material='ceramic', rot_z=math.radians(a), bevel=0.08)
        F.box(s, f'Glyph{i}Mark', K.polar(K.SHELL_R + 1.7, a, z), (0.25, 2.8, 0.5),
              material='stripe', rot_z=math.radians(a + (i % 3) * 6.0), bevel=0.02)
    s.detail = 0
    # the catalogue crown: a gilt index ring with one amber lamp — the librarian's desk light
    F.ring(s, 'IndexRing', (0.0, 0.0, 37.0), 10.0, 1.0, axis=(0, 0, 1), material='gunmetal',
           segments=30, sides=6)
    for i in range(5):
        a = 36.0 + i * 72.0
        F.box(s, f'IndexTab{i}', K.polar(10.0, a, 37.0), (2.0, 3.2, 1.4), material='ceramic',
              rot_z=math.radians(a), bevel=0.05)
    F.cylinder(s, 'CatalogSpire', (0.0, 0.0, 35.0), (0.0, 0.0, 41.0), 1.6, 1.1,
               material='paint', segments=14, bevel=0.05)
    F.light(s, 'CatalogLamp', (0.0, 0.0, 41.6), 'glow_amber.arc', size=0.8)
    # dim violet reading lamps under the scroll courses — lit for readers, not advertising
    s.detail = 1
    K.lamp_ring(s, 'Reading', 'glow_warm.arc', r=K.SHELL_R + 1.7, z=26.4, count=12, size=0.4)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
