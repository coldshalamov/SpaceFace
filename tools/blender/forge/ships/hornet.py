"""Hornet — player interceptor. Yellow-jacket livery, needle nose, swept delta, twin close-coupled drives.

Plan read at the chase camera: an arrowhead with a black spine stripe and two hot nozzles.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_37  # noqa: E402

SHIP_ID = 'hornet'
COLORS = {
    'paint': '#d6951a',    # yellow jacket, deep amber (pure yellow reads as a toy)
    'paint2': '#2a2d33',   # graphite
    'stripe': '#141619',
    'hazard': '#d6951a',
    'glow_cyan.jacket': '#ffcc2e',  # lit yellow-jacket trim: the wing leading edges
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Fuselage: sensor nose -> cockpit bulge -> engine block. Belly graphite.
    F.loft(s, 'Fuselage', [
        dict(x=-4.7, w=1.0, ht=0.56, hb=0.5, zc=0.05, n=2.8),
        dict(x=-3.8, w=1.08, ht=0.64, hb=0.54, zc=0.05, n=2.7),
        dict(x=-1.4, w=0.95, ht=0.66, hb=0.5, zc=0.05, n=2.6),
        dict(x=0.8, w=0.74, ht=0.64, hb=0.44, zc=0.03, n=2.4),
        dict(x=2.9, w=0.46, ht=0.40, hb=0.30, zc=-0.02, n=2.2),
        dict(x=4.1, w=0.2, ht=0.18, hb=0.15, zc=-0.05, n=2.0),
        dict(x=4.55, w=0.05, ht=0.05, hb=0.05, zc=-0.06, n=2.0),
    ], material='paint', belly='paint2', back_material='dark', front_material='dark', count=56)
    F.loft(s, 'NoseCone', [
        dict(x=3.7, w=0.265, ht=0.235, hb=0.2, zc=-0.045, n=2.0),
        dict(x=4.2, w=0.17, ht=0.15, hb=0.13, zc=-0.05, n=2.0),
        dict(x=4.62, w=0.02, ht=0.02, hb=0.02, zc=-0.06, n=2.0),
    ], material='paint2', count=24)

    # Cranked delta wings with a straight tip rail for the wingtip cannon pod. The trailing edge is a
    # separate flap row with a dark hinge gap, so the wing reads as built, not as one slab.
    wing = [(1.5, 0.72), (-2.2, 4.1), (-4.3, 4.1), (-3.75, 3.15), (-3.25, 2.3), (-3.5, 1.2), (-3.0, 0.78)]
    F.plate(s, 'Wing', wing, z0=-0.12, thickness=0.24, material='paint', chamfer=0.32, chamfer_bottom=0.1,
            mirror=True, side_material='paint2')
    F.plate(s, 'FlapOuter', [(-3.86, 3.16), (-4.4, 4.02), (-4.62, 3.62), (-4.2, 2.42), (-3.36, 2.36)], z0=-0.09,
            thickness=0.15, material='paint2', chamfer=0.08, mirror=True)
    F.plate(s, 'FlapInner', [(-3.34, 2.24), (-4.12, 2.28), (-4.3, 1.2), (-3.62, 1.18)], z0=-0.09,
            thickness=0.15, material='paint2', chamfer=0.08, mirror=True)
    F.box(s, 'FlapHinge', (-3.55, 2.3, -0.05), (0.18, 3.2, 0.12), material='dark', mirror=True, rot_z=-0.18)
    # Yellow-jacket bands: two graphite bars across each wing, cut into the wing itself.
    F.band(s, 'Wing', (-1.55, 2.4, 0), (0.62, 0.78, 0), 0.62, 'stripe', facing=(0, 0, 1), mirror=True)
    F.band(s, 'Wing', (-2.55, 3.45, 0), (0.62, 0.78, 0), 0.42, 'stripe', facing=(0, 0, 1), mirror=True)
    # The identity line is lit: one thin yellow neon channel just inside each wing's leading edge
    # (the V the chase camera reads first; the Look: lamps are light).
    F.band(s, 'Wing', (-0.59, 2.14, 0), (0.674, 0.738, 0), 0.1, 'glow_cyan.jacket', facing=(0, 0, 1), inset=0.01,
           depth=-0.02, mirror=True)
    # Canards
    F.plate(s, 'Canard', [(2.9, 0.38), (1.9, 1.5), (1.55, 1.5), (2.1, 0.38)], z0=-0.04, thickness=0.1,
            material='paint2', chamfer=0.07, mirror=True)
    # Canted tail fins over the engine block.
    F.plate(s, 'TailFin', [(-2.5, 0.5), (-4.25, 1.5), (-4.7, 1.5), (-4.45, 0.5)], z0=0.34, thickness=0.12,
            material='paint2', chamfer=0.09, mirror=True, top_material='stripe')
    # Dorsal spine stripe cut into the fuselage skin (nose to engine saddle).
    F.band(s, 'Fuselage', (0, 0, 0), (0, 1, 0), 0.5, 'stripe', facing=(0, 0, 1), min_facing=0.5)
    F.box(s, 'SpineVent', (-2.6, 0.0, 0.73), (1.3, 0.34, 0.05), material='gunmetal', bevel=0.01)

    # Cockpit
    F.canopy(s, 'Canopy', x0=0.55, x1=3.0, w=0.42, h=0.42, z=0.52, peak=0.4)

    # Twin drives
    F.cylinder(s, 'DriveHousing', (-4.4, 0.5, 0.04), (-2.2, 0.5, 0.04), 0.44, 0.38, material='gunmetal', mirror=True)
    F.nozzle(s, 'Nozzle', (-5.2, 0.5, 0.04), 0.38, 0.85, material='gunmetal', mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-5.15, 0.0, 0.04))

    s.detail = 1
    # Wingtip cannon pods along the tip rail.
    F.cylinder(s, 'TipPod', (-4.5, 4.15, 0.0), (-2.4, 4.15, 0.0), 0.17, 0.15, material='paint2', mirror=True)
    F.cylinder(s, 'TipBarrel', (-2.45, 4.15, 0.0), (-1.1, 4.15, 0.0), 0.065, material='gunmetal', mirror=True,
               cap_material='dark')
    # Chin intakes
    F.box(s, 'Intake', (0.7, 0.8, -0.06), (1.7, 0.24, 0.36), material='dark', mirror=True, taper=0.85)
    F.box(s, 'IntakeLip', (1.58, 0.8, -0.06), (0.1, 0.3, 0.42), material='gunmetal', mirror=True, bevel=0.01)
    # Nose gun slots
    F.box(s, 'GunSlot', (2.6, 0.36, -0.12), (0.7, 0.07, 0.07), material='dark', mirror=True, bevel=0.0)
    # Engine block armour: graphite saddle over the drives with vent louvres.
    F.plate(s, 'EngineSaddle', [(-2.1, 0.95), (-4.55, 1.05), (-4.55, -1.05), (-2.1, -0.95)], z0=0.3, thickness=0.26,
            material='paint2', chamfer=0.12)
    F.box(s, 'SaddleVent', (-3.55, 0.55, 0.58), (1.2, 0.3, 0.04), material='gunmetal', mirror=True, bevel=0.005)
    F.light(s, 'EngineStrip', (-4.56, 0.0, 0.42), 'glow_drive', size=0.1)
    # RCS blocks
    F.box(s, 'RCS', (-3.2, 0.98, 0.1), (0.35, 0.16, 0.2), material='gunmetal', mirror=True)
    s.detail = 0
    # Lights
    F.light(s, 'NavPort', (-4.35, 4.34, 0.0), 'glow_red')
    F.light(s, 'NavStarboard', (-4.35, -4.34, 0.0), 'glow_green')
    F.light(s, 'Beacon', (-1.0, 0.0, 0.73), 'glow_amber', size=0.1)

    # --- damage hooks: wingtip gun pod sheds, beacon strobes at critical, port flap displaces ----
    _dmg = {o.name: o for o in s.objects}
    s.hook_part('HOOK_SECONDARY_TIPPOD', _dmg['TipPod'], _dmg['TipBarrel'])
    s.hook_part('HOOK_SENSOR_BEACON', _dmg['Beacon'])
    s.hook_part('HOOK_ARMOR_FLAP', _dmg['FlapOuter'])
    s.ani37_bank = ANI_37.build(s, {
        'tippodP': [_dmg['TipPod'], _dmg['TipBarrel']],
        'tippodS': [_dmg['TipPod_M'], _dmg['TipBarrel_M']],
        'flapP': [_dmg['FlapOuter'], _dmg['FlapInner']],
        'flapS': [_dmg['FlapOuter_M'], _dmg['FlapInner_M']],
        'canardP': [_dmg['Canard']],
        'canardS': [_dmg['Canard_M']],
    }, source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        # The production pilot key seals this filename; LOD pilots share it (bankKey
        # strips the -lodN suffix, so one bank serves hornet-production-v1{,-lod1,-lod2}).
        ship.ani37_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_37.motion_bank.MOTIONS_DIR,
                                                   'hornet-production-v1.motion.json'))
