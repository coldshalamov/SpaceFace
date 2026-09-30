"""Salvage Cutter — Work fleet salvor. A scrapper with cutting jaws.

Plan read at the chase camera: a stag-beetle — two heavy jaw arms spread ahead of a squat green-grey
hull, their inner blade edges glowing amber, hydraulic rams on the jaw shoulders, and an open scrap
cage full of wreckage on its back. The hull is visibly patched: odd plates in rust primer, grey
primer and olive, modelled as real raised plates. The cab sits offset on the starboard shoulder.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_09  # noqa: E402

SHIP_ID = 'salvage_cutter'
COLORS = {
    'paint': '#364640',         # salvage green-grey (Helios key light lifts values ~2.5x: author dark)
    'paint2': '#212824',        # dark green-grey armour
    'stripe': '#212824',
    'hazard': '#b8521a',        # salvage orange
    'paint.patch': '#5a3622',   # rust-primer patch plate
    'paint.primer': '#4c4f51',  # grey-primer patch plate
    'paint2.olive': '#3c4526',  # olive replacement plate
}


def work_lamp(s, name, base, direction, r, mirror=False):
    """Local helper: a tilted flood can on a yoke — gunmetal barrel, bright lens disc, dark bezel."""
    bx, by, bz = base
    dx, dy, dz = direction
    L = r * 1.5
    tip = (bx + dx * L, by + dy * L, bz + dz * L)
    F.box(s, name + 'Yoke', (bx, by, bz - r * 0.35), (r * 1.4, r * 1.6, r * 0.5), material='gunmetal', bevel=0.02,
          mirror=mirror)
    F.cylinder(s, name + 'Can', base, tip, r * 0.9, r, material='gunmetal', segments=18, mirror=mirror)
    lens0 = (tip[0] - dx * 0.02, tip[1] - dy * 0.02, tip[2] - dz * 0.02)
    lens1 = (tip[0] + dx * 0.04, tip[1] + dy * 0.04, tip[2] + dz * 0.04)
    F.cylinder(s, name + 'Bezel', lens0, lens1, r * 1.08, material='dark', segments=18, bevel=0.0, mirror=mirror)
    lens2 = (tip[0] + dx * 0.07, tip[1] + dy * 0.07, tip[2] + dz * 0.07)
    F.cylinder(s, name + 'Lens', lens0, lens2, r * 0.86, material='glow_warm', segments=18, bevel=0.0, mirror=mirror)


def offset(poly, dy):
    """Shift a port-side polyline outboard (+y) by dy."""
    return [(x, y + dy) for (x, y) in poly]


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Hull: squat, broad-shouldered ---------------------------------------------------------------
    F.loft(s, 'Hull', [
        dict(x=-9.4, w=1.85, ht=1.25, hb=1.15, zc=0.0, n=3.2),
        dict(x=-8.6, w=2.25, ht=1.55, hb=1.35, zc=0.0, n=3.4),
        dict(x=-1.0, w=2.5, ht=1.7, hb=1.45, zc=0.0, n=3.4),
        dict(x=2.8, w=2.35, ht=1.5, hb=1.35, zc=0.0, n=3.2),
        dict(x=4.6, w=1.7, ht=1.05, hb=1.0, zc=0.0, n=3.0),
        dict(x=5.3, w=0.9, ht=0.6, hb=0.6, zc=0.0, n=2.6),
    ], material='paint', belly='paint2', back_material='dark', count=48)
    # hazard collar round the drive end, graphite spine band
    F.band(s, 'Hull', (-8.1, 0, 0), (1, 0, 0), 0.5, 'hazard', inset=0.02, depth=0.02)
    # patched plates: mismatched replacement panels, modelled proud of the skin
    F.panel(s, 'Hull', (1.6, 0.95), (1.5, 1.1), 'paint.patch', inset=0.04, depth=0.05)
    F.panel(s, 'Hull', (-0.05, 0.35), (0.8, 1.3), 'dark', inset=0.04, depth=-0.05)
    F.panel(s, 'Hull', (-8.6, -1.1), (1.2, 1.2), 'paint.primer', inset=0.04, depth=0.05)
    F.panel(s, 'Hull', (0.4, -1.4), (1.1, 0.8), 'paint2.olive', inset=0.04, depth=0.04)
    F.panel(s, 'Hull', (-4.2, 2.35), (1.6, 0.5), 'paint.primer', facing=(0, 1, 0), inset=0.04, depth=0.04)
    F.panel(s, 'Hull', (-6.4, -2.3), (1.3, 0.5), 'paint.patch', facing=(0, -1, 0), inset=0.04, depth=0.04)
    F.panel(s, 'Hull', (1.2, -2.3), (1.0, 0.5), 'paint2.olive', facing=(0, -1, 0), inset=0.04, depth=0.04)

    # --- Jaws: hinge block, two heavy jaw arms, bare blade plates with amber cutter edges -----------
    F.box(s, 'JawHinge', (4.4, 0.0, 0.0), (2.2, 3.6, 1.5), material='gunmetal', bevel=0.06)
    F.cylinder(s, 'JawPivot', (4.6, 1.3, -0.95), (4.6, 1.3, 0.95), 0.5, material='dark', segments=24, mirror=True,
               cap_material='gunmetal')
    # inner cutting edge (port side), nose-ward
    edge = [(4.9, 0.8), (6.4, 1.3), (8.6, 1.45), (10.2, 0.95), (10.75, 0.55)]
    jaw = [(4.9, 1.2), (6.4, 1.72), (8.6, 1.9), (10.0, 1.55), (10.75, 0.95), (10.4, 2.1), (9.0, 3.0), (6.8, 3.45),
           (4.5, 2.95), (3.7, 1.9)]
    F.plate(s, 'Jaw', jaw, z0=-0.45, thickness=0.9, material='paint2', chamfer=0.14, chamfer_bottom=0.08, mirror=True)
    # hazard stripes across the jaw backs
    F.band(s, 'Jaw', (7.2, 2.6, 0), (0.8, -0.6, 0), 0.34, 'hazard', facing=(0, 0, 1), mirror=True)
    F.band(s, 'Jaw', (8.1, 2.35, 0), (0.8, -0.6, 0), 0.34, 'hazard', facing=(0, 0, 1), mirror=True)
    # blade plate: bare steel, thinner, proud of the jaw's inner edge
    blade = [edge[0]] + edge[1:] + list(reversed(offset(edge, 0.62)))
    F.plate(s, 'Blade', blade, z0=-0.1, thickness=0.2, material='bare', chamfer=0.06, mirror=True)
    glow = list(offset(edge, -0.05)) + list(reversed(offset(edge, 0.08)))
    F.plate(s, 'CutterEdge', glow, z0=-0.13, thickness=0.26, material='glow_amber', mirror=True)
    # shredder roller in the jaw throat: toothed drum that feeds cut scrap back to the cage
    F.cylinder(s, 'Shredder', (5.75, 1.05, 0.0), (5.75, -1.05, 0.0), 0.5, material='dark', segments=28)
    for i in range(6):
        y = -0.85 + i * 0.34
        F.cylinder(s, f'ShredderTooth{i}', (5.75, y - 0.06, 0.0), (5.75, y + 0.06, 0.0), 0.62, material='bare',
                   segments=10, bevel=0.0)
    # hydraulic rams from hull shoulders to jaw backs
    F.cylinder(s, 'JawRam', (1.8, 2.2, 0.55), (4.6, 2.7, 0.55), 0.3, material='gunmetal', mirror=True,
               cap_material='dark', segments=20)
    F.cylinder(s, 'JawRamRod', (4.5, 2.68, 0.55), (6.3, 3.0, 0.4), 0.15, material='bare', mirror=True, segments=14)
    F.box(s, 'JawRamLug', (6.4, 3.0, 0.4), (0.5, 0.4, 0.5), material='gunmetal', mirror=True)

    # --- Offset cab on the starboard shoulder -----------------------------------------------------
    F.loft(s, 'CabPod', [
        dict(x=0.6, w=0.85, ht=0.5, hb=0.3, zc=1.45, n=3.0, y=-1.3),
        dict(x=1.1, w=1.05, ht=0.8, hb=0.3, zc=1.45, n=3.2, y=-1.3),
        dict(x=3.0, w=1.0, ht=0.72, hb=0.3, zc=1.3, n=3.2, y=-1.3),
        dict(x=3.7, w=0.7, ht=0.4, hb=0.3, zc=1.2, n=2.6, y=-1.3),
    ], material='paint', count=32)
    F.band(s, 'CabPod', (3.35, -1.3, 1.6), (1, 0, 0), 0.8, 'glass', facing=(1, 0, 0.5), min_facing=0.3)
    F.windows(s, 'CabWin', 1.3, 2.9, -2.33, 1.7, 3, size=(0.4, 0.22), finish='glow_warm')

    # --- Scrap cage on the back --------------------------------------------------------------------
    CX0, CX1, CY, CZ0, CZ1 = -7.6, -0.6, 1.95, 1.45, 3.1
    for (x, y) in ((CX0, CY), (CX1, CY), (CX0, -CY), (CX1, -CY), ((CX0 + CX1) / 2, CY), ((CX0 + CX1) / 2, -CY)):
        F.box(s, f'CagePost{x:.1f}{y:.1f}', (x, y, (CZ0 + CZ1) / 2), (0.22, 0.22, CZ1 - CZ0), material='gunmetal',
              bevel=0.01)
    for y in (-CY, CY):
        F.box(s, f'CageTopRail{y:.1f}', ((CX0 + CX1) / 2, y, CZ1), (CX1 - CX0 + 0.22, 0.26, 0.24), material='hazard',
              bevel=0.02)
    for x in (CX0, CX1):
        F.box(s, f'CageCrossRail{x:.1f}', (x, 0.0, CZ1), (0.26, 2 * CY + 0.22, 0.24), material='hazard', bevel=0.02)
    for i, y in enumerate((-1.3, -0.65, 0.0, 0.65, 1.3)):
        F.box(s, f'CageBar{i}', ((CX0 + CX1) / 2, y, CZ1 + 0.02), (CX1 - CX0, 0.08, 0.08), material='gunmetal',
              bevel=0.0)
    # wreckage in the cage: torn plates, a spar, a cracked drive bell, a crate
    s.detail = 1
    F.box(s, 'Scrap0', (-6.4, 0.9, 2.0), (1.6, 1.0, 0.8), material='paint.primer', rot_z=0.4, bevel=0.03)
    F.box(s, 'Scrap1', (-4.6, -0.8, 1.95), (2.0, 1.2, 0.7), material='paint.patch', rot_z=-0.3, bevel=0.03)
    F.box(s, 'Scrap2', (-2.3, 0.7, 2.1), (1.4, 1.3, 1.0), material='paint2.olive', rot_z=0.9, bevel=0.03)
    F.plate(s, 'ScrapWing', [(-7.3, -1.7), (-5.2, -1.2), (-5.6, -0.3), (-7.1, -0.6)], z0=2.25, thickness=0.12,
            material='hazard', chamfer=0.0)
    F.cylinder(s, 'ScrapSpar', (-7.2, -1.4, 2.0), (-1.2, 0.2, 2.5), 0.16, material='bare', segments=12)
    F.nozzle(s, 'ScrapBell', (-1.6, -1.0, 2.1), 0.45, 0.6, material='gunmetal', glow='dark')
    F.plate(s, 'ScrapSheet', [(-5.6, 0.2), (-3.4, -0.2), (-3.0, 1.4), (-4.9, 1.6)], z0=2.2, thickness=0.08,
            material='paint', chamfer=0.0)
    s.detail = 0

    # --- Drives ---------------------------------------------------------------------------------
    F.nozzle(s, 'Nozzle', (-10.35, 1.15, 0.0), 0.72, 1.2, material='gunmetal', mirror=True, bell=1.2)
    F.box(s, 'DriveFrame', (-9.35, 0.0, 0.0), (0.6, 3.9, 1.8), material='paint2', bevel=0.05)
    s.hook('HOOK_DRIVE_CORE', (-10.3, 0.0, 0.0))

    s.detail = 1
    work_lamp(s, 'JawFlood', (4.3, 1.15, 0.9), (0.8, 0, 0.6), 0.26, mirror=True)
    F.rcs(s, 'RCS', (-8.6, 2.3, 0.4), size=0.38, mirror=True)
    F.antenna(s, 'Mast', (2.2, 0.9, 1.52), 1.0, tip='glow_red')
    s.detail = 0

    F.light(s, 'NavPort', (6.8, 3.47, 0.1), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (6.8, -3.47, 0.1), 'glow_green', size=0.2)
    F.light(s, 'Beacon', (-4.1, 0.0, 3.27), 'glow_amber', size=0.26)
    F.box(s, 'BeaconBar', (-4.1, 0.0, 3.12), (0.3, 2 * CY, 0.14), material='gunmetal', bevel=0.01)

    # ANI-09: jaws+blades+cutter edges+ram lugs ride each shoulder pin; rods alone ride the ram
    # pivots (JawPivot pins stay welded — the hinge itself never moves).
    _o = {o.name: o for o in s.objects}
    s.ani09_bank = ANI_09.build(s, {
        'jaw_port': [_o['Jaw'], _o['Blade'], _o['CutterEdge'], _o['JawRamLug']],
        'jaw_star': [_o['Jaw_M'], _o['Blade_M'], _o['CutterEdge_M'], _o['JawRamLug_M']],
        'ram_port': [_o['JawRamRod']],
        'ram_star': [_o['JawRamRod_M']],
    }, source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani09_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_09.motion_bank.MOTIONS_DIR,
                                                   'salvage-cutter.motion.json'))
