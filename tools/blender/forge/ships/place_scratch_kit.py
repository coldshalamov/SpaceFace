"""Scratch kit test-bed — NOT a shipped asset. One small place that exercises every GFX-6 kit
helper so a single `place` view render proves they all read correctly:

  annulus decks (stepped ring), sphere dome, truss mast + span, ladder, boxes crate yard,
  beams gantry, plate_v fin + bulkhead, band with mirror on a keel-straddling part,
  region-limited band (top face only), work_lamp with lit halo, rock boulders + quarried cut,
  'stone' finish, and per-part uv_scale (outer deck tiles run larger than the inner deck).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402

SHIP_ID = 'place_scratch_kit'
COLORS = {
    'paint': '#c9c0ae',       # ivory deck
    'paint2': '#44555c',      # teal-grey structures
    'stripe': '#2fb2a6',      # teal inlay
    'hazard': '#c9941f',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Stepped annulus decks; outer ring carries a coarser panel tile via uv_scale.
    F.annulus(s, 'DeckOuter', (0, 0), 9.0, 16.0, 0.0, 1.2, material='paint', side_material='dark',
              uv_scale=0.45)
    F.annulus(s, 'DeckInner', (0, 0), 4.8, 9.0, 1.2, 1.0, material='paint2', side_material='gunmetal')

    # Sphere dome on the hub.
    F.sphere(s, 'Dome', (0, 0, 2.2), 4.4, material='ceramic', segments=24)

    # Truss mast and horizontal span.
    F.truss(s, 'TrussMast', (-4, -7, 1.2), (-4, -7, 13.0), 2.2, 5, material='gunmetal')
    F.truss(s, 'TrussSpan', (-4, -7, 13.0), (11, -7, 13.0), 1.5, 6, material='gunmetal')

    # Ladder up the inner-well wall.
    F.ladder(s, 'WellLadder', (4.9, -1.5, 2.2), (4.9, -1.5, 8.4), 0.9, 7, material='bare')

    # Crate yard (single mesh) and a gantry of beams (single mesh).
    F.boxes(s, 'Crates', [
        ((8.5, 9.5, 1.9), (2.4, 2.0, 1.4), 0.0),
        ((8.5, 9.5, 3.25), (2.0, 1.7, 1.3), 0.2),
        ((11.3, 9.0, 1.75), (1.8, 1.6, 1.1), -0.15),
        ((9.6, 11.9, 1.7), (1.5, 1.4, 1.0), 0.35),
    ], material='hazard', bevel=0.06)
    F.beams(s, 'Gantry', [
        ((-11, 7.5, 1.2), (-11, 7.5, 9.0)),
        ((-14, 7.5, 9.0), (-7.5, 7.5, 9.0)),
        ((-7.5, 7.5, 1.2), (-7.5, 7.5, 9.0)),
        ((-11, 7.5, 9.0), (-11, 11.5, 9.0)),
        ((-11, 11.5, 1.2), (-11, 11.5, 9.0)),
    ], 0.55, material='gunmetal')

    # Vertical plates: a fin standing on the deck (xz plane) and a bulkhead across it (yz).
    F.plate_v(s, 'FinX', [(-15.5, 1.2), (-15.5, 6.8), (-12.5, 6.8), (-12.5, 4.0), (-13.6, 1.2)],
              -0.5, 1.0, plane='xz', material='paint2', chamfer=0.5)
    F.plate_v(s, 'BulkY', [(-2.6, 1.2), (-2.6, 6.2), (2.6, 6.2), (2.6, 1.2)],
              12.5, 0.7, plane='yz', material='paint', chamfer=0.3, mirror=False)

    # Keel-straddling beam: mirror=True band must cut it once, not crash or double-cut;
    # a tilted band paints a mirrored chevron pair into the same mesh; a region-limited band
    # paints only the top face (stripe that does not wrap the sides).
    F.box(s, 'Keel', (0, 0, 5.0), (11, 4.4, 1.4), material='paint', bevel=0.08)
    F.band(s, 'Keel', (3.4, 0, 5.0), (1, 0, 0), 1.0, 'stripe', mirror=True)
    F.band(s, 'Keel', (0.6, 1.1, 5.0), (0.85, 0.53, 0.0), 0.7, 'hazard', mirror=True)
    F.band(s, 'Keel', (-2.8, 0, 5.0), (1, 0, 0), 1.5, 'glow_amber', region=(('z', 5.2, 6.2),))

    # Work lamps: lit lens, matte back, halo ring overhead.
    F.box(s, 'LampPylon', (11, 5.5, 4.6), (0.9, 0.9, 7.0), material='gunmetal', bevel=0.05)
    F.work_lamp(s, 'LampA', (11, 5.5, 8.4), aim=(0.25, -0.45, 0.86), size=1.0, halo=True)
    F.work_lamp(s, 'LampB', (-6.5, -11.5, 2.6), aim=(-0.45, -0.2, 0.87), size=0.85, halo=True,
                lens='glow_cyan')

    # Boulders: two seeded rocks (deterministic), one with a flat quarried top cut.
    F.rock(s, 'BoulderA', (-14, -11, 1.6), 2.3, seed=5)
    F.rock(s, 'BoulderB', (-17.5, -13.5, 1.1), 1.5, seed=9)
    F.rock(s, 'QuarryBlock', (-14, -16.5, 1.8), 2.6, seed=7, quarry_plane=((-14, -16.5, 2.9), (0, 0, 1)))

    return s


if __name__ == '__main__':
    ship = build().finish()
    E.export_ship(ship, {'layout': 'place', 'file': SHIP_ID, 'asset_id': 'SF_FORGE_SCRATCH_KIT',
                         'part_id': SHIP_ID}, preview='--live' not in sys.argv)
