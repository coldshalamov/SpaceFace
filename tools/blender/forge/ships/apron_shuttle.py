"""Apron Shuttle — Helios civil station-apron passenger shuttle. A lit window-bus between berths.

Plan read at the chase camera: a long rounded ivory bus with a teal roof spine carrying a strip of lit
skylights, a wraparound windshield up front, a teal belt line under a long row of lit passenger
windows on both flanks, and a short drive yoke aft with two small pod drives just proud of the body.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'apron_shuttle'
COLORS = {
    'paint': '#bfb6a3',    # Helios ivory (the brightest paint the key light allows)
    'paint2': '#1b837f',   # courier teal
    'stripe': '#1b837f',
    'hazard': '#c8901e',
    'glow_cyan.helios': '#3ee8dc',  # courier teal, lit: the cab trim ring and the roof-spine edge lines
}

W, HT, HB, N = 1.62, 1.55, 1.25, 3.4   # bus cross-section


def side_y(w, h, n, z):
    """Where a superellipse section's flank sits at height z (for seating side hardware)."""
    return w * max(0.0, 1.0 - abs(z / h) ** n) ** (1.0 / n)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Body: a rounded bus. Blunt tail, long constant cabin, raked nose under a wrap windshield.
    F.loft(s, 'Body', [
        dict(x=-8.7, w=1.3, ht=1.2, hb=1.0, zc=0.0, n=3.0),
        dict(x=-8.3, w=1.52, ht=1.45, hb=1.18, zc=0.0, n=3.3),
        dict(x=-7.4, w=W, ht=HT, hb=HB, zc=0.0, n=N),
        dict(x=5.2, w=W, ht=HT, hb=HB, zc=0.0, n=N),
        dict(x=6.9, w=1.58, ht=1.42, hb=1.22, zc=-0.02, n=3.2),
        dict(x=8.1, w=1.42, ht=1.05, hb=1.12, zc=-0.06, n=2.9),
        dict(x=8.85, w=1.05, ht=0.55, hb=0.9, zc=-0.1, n=2.6),
        dict(x=9.2, w=0.5, ht=0.2, hb=0.45, zc=-0.14, n=2.2),
    ], material='paint', belly='paint2', back_material='dark', count=64)
    # Wraparound windshield: every forward-and-up face of the nose is glass.
    F.band(s, 'Body', (8.0, 0, 0), (1, 0, 0), 1.9, 'glass', facing=(0.62, 0, 0.78), min_facing=0.55)
    # Teal belt line under the window row, both flanks, raised a touch.
    for side in (1, -1):
        F.band(s, 'Body', (0, 0, -0.32), (0, 0, 1), 0.46, 'stripe', facing=(0, side, 0), min_facing=0.55)
    # Teal cab ring behind the windshield and a teal tail ring.
    F.band(s, 'Body', (6.35, 0, 0), (1, 0, 0), 0.4, 'paint2', inset=0.02, depth=0.02)
    F.band(s, 'Body', (-7.85, 0, 0), (1, 0, 0), 0.5, 'paint2', inset=0.02, depth=0.02)
    # Lit cab trim: a thin ring of lit courier teal on the ivory between the cab ring and the windshield.
    F.band(s, 'Body', (6.75, 0, 0), (1, 0, 0), 0.14, 'glow_cyan.helios', inset=0.01, depth=-0.02)
    # Lit roof-spine edges: two thin lit teal lines on the ivory roof hugging the teal spine plate,
    # the length of the skylight strip (the top-down read).
    F.band(s, 'Body', (0, 0.69, 0), (0, 1, 0), 0.1, 'glow_cyan.helios', facing=(0, 0, 1), min_facing=0.6,
           inset=0.01, depth=-0.02, mirror=True, region=(('x', -6.2, 4.6),))
    # Raised roof plates fore and aft of the skylight spine.
    F.panel(s, 'Body', (5.3, 0.0), (1.4, 2.2), 'paint', inset=0.04, depth=0.03)
    F.panel(s, 'Body', (-6.85, 0.0), (1.3, 2.3), 'dark', inset=0.04, depth=-0.06)
    # Dark rub strake at the waterline: the apron bumper, and a dark outline round the plan.
    for side in (1, -1):
        F.band(s, 'Body', (0, 0, -0.78), (0, 0, 1), 0.2, 'dark', facing=(0, side, 0), min_facing=0.4)

    # --- Window rows: dark glazing strip on each flank, lit windows set into it, sliding door.
    zw = 0.55
    yw = side_y(W, HT, N, zw)
    F.box(s, 'GlazeStrip', (-0.9, yw - 0.01, zw), (12.2, 0.08, 0.62), material='glass', bevel=0.02, mirror=True)
    F.windows(s, 'PaxWinA', -7.0, -3.3, yw + 0.035, zw, 4, size=(0.72, 0.42), mirror=True)
    F.windows(s, 'PaxWinB', -1.45, 2.15, yw + 0.035, zw, 4, size=(0.72, 0.42), mirror=True)
    F.windows(s, 'PaxWinC', 3.9, 5.5, yw + 0.035, zw, 2, size=(0.62, 0.42), mirror=True)
    # Door vestibules: teal boarding bays standing proud of both flanks (they break the pill outline
    # from above), double doors with lit panes, an amber step light under each.
    for k, x in enumerate((-2.4, 3.0)):
        F.box(s, f'Vestibule{k}', (x, W - 0.05, 0.1), (1.7, 0.72, 2.55), material='paint2', bevel=0.16, mirror=True)
        F.box(s, f'VestRoof{k}', (x, W - 0.05, 1.42), (1.5, 0.6, 0.12), material='dark', bevel=0.03, mirror=True)
        for d in (-0.34, 0.34):
            F.box(s, f'VestDoor{k}{d:+.1f}', (x + d, W + 0.33, 0.0), (0.6, 0.05, 1.85), material='gunmetal',
                  bevel=0.01, mirror=True)
            F.box(s, f'VestPane{k}{d:+.1f}', (x + d, W + 0.36, 0.35), (0.4, 0.04, 0.72), material='glow_warm',
                  bevel=0.0, mirror=True)
        F.box(s, f'VestStep{k}', (x, W + 0.3, -1.08), (1.3, 0.14, 0.08), material='glow_amber', bevel=0.0, mirror=True)

    # --- Roof spine: a teal raised deck carrying a strip of lit skylights (the top-down read).
    F.plate(s, 'RoofSpine', [(4.6, 0.62), (-6.2, 0.62), (-6.2, -0.62), (4.6, -0.62)], z0=HT - 0.12,
            thickness=0.28, material='paint2', chamfer=0.1)
    F.windows(s, 'Skylight', -5.6, 4.0, 0.0, HT + 0.17, 8, size=(0.95, 0.52), normal='z')

    # --- Drive yoke aft: a teal crossbeam with two small pod drives, centre service grille.
    F.plate(s, 'Yoke', [(-6.4, 1.5), (-7.3, 2.25), (-8.7, 2.25), (-8.7, -2.25), (-7.3, -2.25), (-6.4, -1.5)],
            z0=-0.45, thickness=0.5, material='paint2', chamfer=0.14)
    F.loft(s, 'Pod', [
        dict(x=-9.1, w=0.46, ht=0.46, hb=0.46, zc=-0.2, n=2.0, y=2.1),
        dict(x=-8.7, w=0.56, ht=0.56, hb=0.56, zc=-0.2, n=2.0, y=2.1),
        dict(x=-6.6, w=0.56, ht=0.56, hb=0.56, zc=-0.2, n=2.0, y=2.1),
        dict(x=-5.8, w=0.36, ht=0.36, hb=0.36, zc=-0.2, n=2.0, y=2.1),
        dict(x=-5.45, w=0.1, ht=0.1, hb=0.1, zc=-0.2, n=2.0, y=2.1),
    ], material='paint', count=36, mirror=True)
    F.band(s, 'Pod', (-7.5, 2.1, 0), (1, 0, 0), 0.4, 'stripe', mirror=True)
    F.nozzle(s, 'PodNozzle', (-9.65, 2.1, -0.2), 0.42, 0.6, material='gunmetal', mirror=True)
    F.nozzle(s, 'TailNozzle', (-9.2, 0.0, -0.35), 0.42, 0.6, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-9.35, 0.0, -0.35))
    F.box(s, 'TailGrille', (-8.72, 0.0, 0.55), (0.12, 1.6, 0.6), material='dark', bevel=0.02)

    F.box(s, 'RoofRail', (-0.8, 1.25, 1.36), (10.8, 0.1, 0.1), material='gunmetal', bevel=0.01, mirror=True)
    s.detail = 1
    F.fins(s, 'DeckFin', -7.4, -6.3, 0.0, 1.4, 0.14, 6, thickness=0.08, depth=1.8, material='gunmetal')
    for i in range(5):
        F.box(s, f'GrilleSlat{i}', (-8.76, 0.0, 0.33 + i * 0.11), (0.08, 1.5, 0.035), material='gunmetal', bevel=0.0)
    # Roof hardware: air units either side of the spine, a docking hatch ring forward, mast, dome.
    F.vent(s, 'RoofVent', (-4.6, 0.95, 1.45), (1.9, 0.4, 0.12), mirror=True, slats=5)
    F.vent(s, 'RoofVentFwd', (0.4, 0.95, 1.45), (1.9, 0.4, 0.12), mirror=True, slats=5)
    F.cylinder(s, 'Hatch', (5.5, 0.0, HT - 0.1), (5.5, 0.0, HT + 0.12), 0.55, material='gunmetal', segments=32,
               cap_material='paint2')
    F.antenna(s, 'Mast', (-7.2, -0.8, HT - 0.05), 0.8, tip=None)
    F.sensor_dome(s, 'Dome', (7.2, 0.0, 1.28), 0.26)
    F.rcs(s, 'RCSFwd', (6.4, 1.6, -0.2), size=0.32, mirror=True)
    # Headlights under the windshield.
    F.box(s, 'HeadLamp', (8.72, 0.72, -0.42), (0.12, 0.42, 0.16), material='glow_warm', bevel=0.0, mirror=True)
    s.detail = 0

    # --- Lights
    F.light(s, 'NavPort', (-8.0, 2.68, -0.2), 'glow_red', size=0.16)
    F.light(s, 'NavStarboard', (-8.0, -2.68, -0.2), 'glow_green', size=0.16)
    F.light(s, 'Beacon', (-6.7, 0.0, HT + 0.12), 'glow_amber', size=0.18)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
