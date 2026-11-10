"""Inspection Cutter — authority customs cutter. White blade with a blue-and-gold chevron.

Plan read at the chase camera: a sharp arrowhead. A long knife prow wearing a forward-pointing blue
chevron edged in gold, a tall bridge with a searchlight on its brow and a scanner dome forward, swept
blue stub wings aft with blue-white strobes, and a boarding clamp standing off the port flank (the
one asymmetric part, so the cutter reads as a boarding vessel from above).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_30  # noqa: E402

SHIP_ID = 'inspection_cutter'
COLORS = {
    'paint': '#b3b0a8',    # authority white
    'paint2': '#1c3566',   # authority blue (deep: the key light lifts it)
    'stripe': '#9c7f2e',   # gold
    'hazard': '#c8901e',
    'paint.graphite': '#25272c',
    'glow_cyan': '#8fd2ff',   # blue-white strobes
    'glow_cyan.blue': '#2f5cff',  # authority-blue strobe lamps
}


def work_lamp(s, name, base, direction, r, mirror=False, lens='glow_warm'):
    """Searchlight can on a yoke — gunmetal barrel, dark bezel, bright lens."""
    bx, by, bz = base
    dx, dy, dz = direction
    L = r * 1.6
    tip = (bx + dx * L, by + dy * L, bz + dz * L)
    F.box(s, name + 'Yoke', (bx, by, bz - r * 0.45), (r * 1.4, r * 1.8, r * 0.5), material='paint.graphite',
          bevel=0.02, mirror=mirror)
    F.cylinder(s, name + 'Can', base, tip, r * 0.9, r, material='gunmetal', segments=20, mirror=mirror)
    l0 = (tip[0] - dx * 0.02, tip[1] - dy * 0.02, tip[2] - dz * 0.02)
    F.cylinder(s, name + 'Bezel', l0, (tip[0] + dx * 0.04, tip[1] + dy * 0.04, tip[2] + dz * 0.04), r * 1.08,
               material='dark', segments=20, bevel=0.0, mirror=mirror)
    F.cylinder(s, name + 'Lens', l0, (tip[0] + dx * 0.07, tip[1] + dy * 0.07, tip[2] + dz * 0.07), r * 0.86,
               material=lens, segments=20, bevel=0.0, mirror=mirror)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Hull: a knife. Squarish drive section aft, chined (n<2) blade forward to a sharp prow.
    F.loft(s, 'Hull', [
        dict(x=-10.6, w=1.1, ht=1.1, hb=1.0, zc=0.0, n=2.6),
        dict(x=-9.9, w=1.42, ht=1.42, hb=1.25, zc=0.0, n=2.5),
        dict(x=-4.0, w=1.5, ht=1.62, hb=1.35, zc=0.0, n=2.2),
        dict(x=2.5, w=1.36, ht=1.45, hb=1.2, zc=0.0, n=2.0),
        dict(x=7.0, w=0.98, ht=1.0, hb=0.85, zc=-0.05, n=1.8),
        dict(x=9.8, w=0.42, ht=0.48, hb=0.42, zc=-0.1, n=1.7),
        dict(x=11.3, w=0.05, ht=0.06, hb=0.06, zc=-0.14, n=1.7),
    ], material='paint', belly='paint2', back_material='dark', count=64)
    # Forward chevron: a broad blue bar and a gold edge, each cut as two slanted bands (port and
    # starboard halves) so they meet in a V pointing along the prow.
    for side in (1, -1):
        F.band(s, 'Hull', (5.2, 0, 0), (0.8, 0.6 * side, 0), 1.2, 'paint2', facing=(0, side, 0.0), min_facing=0.01)
        F.band(s, 'Hull', (4.0, 0, 0), (0.8, 0.6 * side, 0), 0.32, 'stripe', facing=(0, side, 0.0), min_facing=0.01)
    F.band(s, 'Hull', (0, 0, 0), (0, 1, 0), 0.36, 'paint2', facing=(0, 0, 1), min_facing=0.8)
    # Lit chevron: a thin blue-white lit V on the white deck just aft of the gold edge, the same
    # two slanted cuts, so the cutter's authority mark reads as a light before it reads as paint.
    for side in (1, -1):
        F.band(s, 'Hull', (3.45, 0, 0), (0.8, 0.6 * side, 0), 0.14, 'glow_cyan', facing=(0, side, 0.0),
               min_facing=0.01, inset=0.01, depth=-0.02)
    # Waterline: a blue flank stripe with a gold pinstripe above it, the length of both flanks.
    for side in (1, -1):
        F.band(s, 'Hull', (0, 0, -0.38), (0, 0, 1), 0.46, 'paint2', facing=(0, side, 0), min_facing=0.45)
        F.band(s, 'Hull', (0, 0, 0.0), (0, 0, 1), 0.12, 'stripe', facing=(0, side, 0), min_facing=0.45)
    # Blue drive section aft with a gold ring.
    F.band(s, 'Hull', (-9.2, 0, 0), (1, 0, 0), 1.2, 'paint2', inset=0.02, depth=0.03)
    F.band(s, 'Hull', (-8.4, 0, 0), (1, 0, 0), 0.22, 'stripe')
    # Lit drive collar: a thin blue-white lit ring on the white just forward of the gold ring.
    F.band(s, 'Hull', (-8.08, 0, 0), (1, 0, 0), 0.14, 'glow_cyan', inset=0.01, depth=-0.02)
    F.panel(s, 'Hull', (-6.4, 0.0), (2.6, 2.2), 'paint', inset=0.05, depth=0.04)

    # --- Bridge: a tall wheelhouse amidships, wraparound glass, blue roof.
    F.loft(s, 'Bridge', [
        dict(x=-3.8, w=0.85, ht=0.9, hb=0.9, zc=1.6, n=3.0),
        dict(x=-3.2, w=1.05, ht=1.1, hb=0.9, zc=1.6, n=3.2),
        dict(x=0.6, w=1.05, ht=1.1, hb=0.9, zc=1.6, n=3.2),
        dict(x=1.8, w=0.8, ht=0.75, hb=0.9, zc=1.6, n=2.6),
        dict(x=2.4, w=0.3, ht=0.25, hb=0.9, zc=1.6, n=2.2),
    ], material='paint', count=48)
    F.band(s, 'Bridge', (1.2, 0, 2.2), (1, 0, 0), 1.3, 'glass', facing=(0.6, 0, 0.8), min_facing=0.3)
    F.band(s, 'Bridge', (-1.2, 0, 2.1), (0, 0, 1), 0.42, 'glass', facing=(0, 1, 0), min_facing=0.6)
    F.band(s, 'Bridge', (-1.2, 0, 2.1), (0, 0, 1), 0.42, 'glass', facing=(0, -1, 0), min_facing=0.6)
    F.panel(s, 'Bridge', (-1.6, 0.0), (2.6, 1.6), 'paint2', inset=0.04, depth=0.04)
    F.windows(s, 'BridgeWin', -2.8, 0.2, 1.02, 2.1, 4, size=(0.5, 0.26), finish='glow_warm', mirror=True)

    # --- Dorsal fin aft and ventral keel: thin lens-section lofts, blue with a gold leading edge.
    F.loft(s, 'DorsalFin', [
        dict(x=-10.2, w=0.1, ht=0.05, hb=0.05, zc=3.7, n=2.0),
        dict(x=-9.8, w=0.14, ht=1.1, hb=1.1, zc=2.6, n=2.0),
        dict(x=-7.6, w=0.16, ht=0.8, hb=0.8, zc=2.1, n=2.0),
        dict(x=-5.2, w=0.12, ht=0.2, hb=0.2, zc=1.6, n=2.0),
        dict(x=-4.6, w=0.05, ht=0.05, hb=0.05, zc=1.5, n=2.0),
    ], material='paint2', count=24, bevel=0.0)
    F.loft(s, 'Keel', [
        dict(x=-8.8, w=0.08, ht=0.05, hb=0.05, zc=-2.3, n=2.0),
        dict(x=-8.3, w=0.14, ht=0.9, hb=0.9, zc=-1.5, n=2.0),
        dict(x=-3.0, w=0.14, ht=0.5, hb=0.5, zc=-1.2, n=2.0),
        dict(x=-1.0, w=0.05, ht=0.05, hb=0.05, zc=-1.1, n=2.0),
    ], material='paint2', count=24, bevel=0.0)

    # --- Stub wings: swept, blue, gold trailing strip, strobe at the tip.
    wing = [(0.2, 1.15), (-7.2, 2.45), (-9.2, 2.45), (-9.5, 2.1), (-9.5, 1.15)]
    F.plate(s, 'Wing', wing, z0=-0.3, thickness=0.34, material='paint2', chamfer=0.2, chamfer_bottom=0.08,
            mirror=True)
    F.band(s, 'Wing', (-4.06, 1.54, 0), (0.173, 0.985, 0), 0.22, 'stripe', facing=(0, 0, 1), min_facing=0.5,
           mirror=True)
    F.plate(s, 'Canard', [(6.6, 0.8), (4.6, 1.75), (3.9, 1.75), (4.3, 0.8)], z0=-0.2, thickness=0.2,
            material='paint2', chamfer=0.1, mirror=True)
    F.band(s, 'Wing', (-8.75, 0, 0), (1, 0, 0), 0.28, 'stripe', facing=(0, 0, 1), min_facing=0.5, mirror=True)
    F.box(s, 'WingTip', (-8.2, 2.48, -0.14), (2.2, 0.24, 0.4), material='paint.graphite', bevel=0.04, mirror=True)

    # Strobe bar across the bridge roof: alternating authority blue and blue-white lamps.
    F.box(s, 'StrobeBar', (-0.4, 0.0, 2.72), (0.42, 1.2, 0.2), material='paint.graphite', bevel=0.03)
    for i, y in enumerate((-0.42, -0.14, 0.14, 0.42)):
        F.box(s, f'StrobeLamp{i}', (-0.4, y, 2.86), (0.32, 0.24, 0.12), material='glow_cyan.blue' if i % 3 == 0
              else 'glow_cyan', bevel=0.0)
    # --- Scanner dome on the forward deck, searchlight on the bridge brow.
    F.cylinder(s, 'ScanRing', (4.6, 0.0, 1.05), (4.6, 0.0, 1.35), 0.72, material='paint.graphite', segments=36)
    F.sensor_dome(s, 'ScanDome', (4.6, 0.0, 1.35), 0.62, material='paint', lens='glow_cyan')
    F.band(s, 'ScanDome', (4.6, 0, 1.55), (0, 0, 1), 0.14, 'paint2')
    work_lamp(s, 'Searchlight', (1.35, 0.0, 2.85), (0.93, 0.0, 0.36), 0.34, lens='glow_cyan')

    # --- Boarding clamp: port-side tube on a graphite mount, gold collar, three clamp claws.
    CX, CZ = -0.6, 0.2
    F.loft(s, 'ClampMount', [
        dict(x=CX - 1.6, w=0.12, ht=0.12, hb=0.12, zc=CZ, n=2.2, y=1.3),
        dict(x=CX - 1.2, w=0.42, ht=0.55, hb=0.55, zc=CZ, n=2.6, y=1.3),
        dict(x=CX + 0.9, w=0.42, ht=0.55, hb=0.55, zc=CZ, n=2.6, y=1.3),
        dict(x=CX + 1.5, w=0.12, ht=0.12, hb=0.12, zc=CZ, n=2.2, y=1.3),
    ], material='paint2', count=32)
    F.cylinder(s, 'ClampTube', (CX, 1.3, CZ), (CX, 2.2, CZ), 0.48, material='paint', segments=32)
    F.cylinder(s, 'ClampCollar', (CX, 2.1, CZ), (CX, 2.38, CZ), 0.68, material='stripe', segments=32,
               cap_material='paint.graphite')
    F.cylinder(s, 'ClampSeal', (CX, 2.38, CZ), (CX, 2.44, CZ), 0.5, material='dark', segments=32)
    for i, (dx, dz) in enumerate(((0.68, 0.0), (-0.68, 0.0), (0.0, 0.68), (0.0, -0.68))):
        F.box(s, f'Claw{i}', (CX + dx, 2.4, CZ + dz), (0.26 if dx else 0.36, 0.3, 0.36 if dx else 0.26),
              material='gunmetal', bevel=0.03)

    # --- Drives: blue drive block, twin bells and a centre bell.
    for y in (0.8, -0.8):
        F.nozzle(s, f'Nozzle{y}', (-11.35, y, 0.0), 0.56, 0.85, material='gunmetal')
    F.nozzle(s, 'NozzleC', (-11.2, 0.0, 0.55), 0.38, 0.65, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-11.3, 0.0, 0.0))

    s.detail = 1
    F.vent(s, 'DriveVent', (-8.9, 0.75, 1.18), (1.1, 0.36, 0.1), mirror=True, slats=4)
    F.rcs(s, 'RCSFwd', (6.4, 1.05, -0.05), size=0.3, mirror=True)
    F.rcs(s, 'RCSAft', (-9.9, 1.62, 0.2), size=0.32, mirror=True)
    F.antenna(s, 'Mast', (-2.4, 0.45, 2.7), 1.3, tip=None)
    F.antenna(s, 'Whip', (-2.4, -0.45, 2.7), 0.9, tip=None)
    s.detail = 0

    # --- Lights: blue-white strobes at the tips and on the fin; red/green nav on the wing roots.
    F.light(s, 'StrobeFin', (-10.15, 0.0, 3.72), 'glow_cyan', size=0.22)
    F.light(s, 'StrobeWing', (-7.2, 2.6, -0.08), 'glow_cyan', size=0.24, mirror=True)
    F.light(s, 'StrobeProw', (10.4, 0.0, 0.2), 'glow_cyan', size=0.16)
    F.light(s, 'StrobeBridge', (-3.4, 0.0, 2.72), 'glow_cyan', size=0.2)
    F.light(s, 'NavPort', (-9.2, 2.62, -0.2), 'glow_red', size=0.18)
    F.light(s, 'NavStarboard', (-9.2, -2.62, -0.2), 'glow_green', size=0.18)
    _o = {o.name: o for o in s.objects}
    s.ani30_bank = ANI_30.build(s, {
        'arm': [_o['ClampTube'], _o['ClampCollar'], _o['ClampSeal'],
                _o['Claw0'], _o['Claw1'], _o['Claw2'], _o['Claw3']],
        'scanring': _o['ScanRing'],
    }, source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani30_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_30.motion_bank.MOTIONS_DIR,
                                                   'inspection-cutter.motion.json'))
