"""Ashline Dart — raider swarmer. A thrown knife with engines.

Plan read at the chase camera: a long oxide-red blade, a forward-swept crossguard of black blade fins
with hazard tips, a blackened handle of exposed drive machinery and one big hot nozzle as the pommel.
Ashline language: angular, blades, exposed gunmetal, sodium-orange lamps, a little salvaged asymmetry.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'ashline_dart'
COLORS = {
    'paint': '#4a1b15',    # oxide red (the illustrated light lifts it; keep it deep)
    'paint2': '#161719',   # blackened steel
    'bare': '#868c93',     # honed blade edge
    'stripe': '#c9621c',   # sodium orange
    'hazard': '#d99a1e',
    'glow_drive': '#ff9a4a',  # Ashline drives burn hot orange
    'glow_cyan.sodium': '#ff8a2a',  # Ashline identity light: the lit blade edge (family-wide)
}


def hazard_bars(s, part, start, direction, count, width, gap, finish='hazard', mirror=False, facing=(0, 0, 1)):
    """Alternating hazard bars cut into a part: `count` bands of `finish`, `gap` apart along `direction`."""
    d = F.Vector(direction).normalized()
    for i in range(count):
        p = F.Vector(start) + d * (i * (width + gap))
        F.band(s, part, tuple(p), tuple(d), width, finish, facing=facing, mirror=mirror, min_facing=0.3)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # The blade: a long, flat diamond-section hull with a centre ridge (n<2 gives the knife bevel),
    # widest just ahead of the guard like a fighting knife.
    F.loft(s, 'Blade', [
        dict(x=-2.3, w=1.0, ht=0.58, hb=0.46, zc=0.05, n=1.75),
        dict(x=-0.8, w=1.25, ht=0.56, hb=0.42, zc=0.05, n=1.7),
        dict(x=2.0, w=1.1, ht=0.46, hb=0.34, zc=0.03, n=1.6),
        dict(x=4.6, w=0.8, ht=0.34, hb=0.25, zc=0.0, n=1.55),
        dict(x=6.6, w=0.44, ht=0.2, hb=0.15, zc=-0.02, n=1.5),
        dict(x=7.8, w=0.12, ht=0.07, hb=0.06, zc=-0.03, n=1.5),
        dict(x=8.2, w=0.02, ht=0.02, hb=0.02, zc=-0.03, n=1.5),
    ], material='paint', belly='paint2', back_material='dark', count=64)
    # Sodium ridge line down the blade spine and a bar pair across the blade near the point.
    F.band(s, 'Blade', (0, 0, 0), (0, 1, 0), 0.12, 'stripe', facing=(0, 0, 1), min_facing=0.6)
    F.band(s, 'Blade', (5.0, 0, 0), (1, 0, 0), 0.36, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.band(s, 'Blade', (5.6, 0, 0), (1, 0, 0), 0.14, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    # The identity line is lit: one thin sodium channel just inside each flank of the blade, on the
    # dark oxide top, from the guard to the tip bars (the lit knife edge the chase camera reads).
    # Chord of the port edge (-0.8,1.25)->(4.6,0.8); outboard normal (0.083,0.9965); 0.2 m inboard.
    F.band(s, 'Blade', (1.883, 0.826, 0), (0.083, 0.9965, 0), 0.1, 'glow_cyan.sodium', facing=(0, 0, 1),
           min_facing=0.3, inset=0.01, depth=-0.02, mirror=True, region=(('x', -1.0, 4.4),))
    # Salvaged patch plate on the port blade (asymmetric, deliberate).
    F.panel(s, 'Blade', (2.4, 0.5), (1.4, 0.5), 'paint2', inset=0.03, depth=0.03)
    # Honed edge: a bright steel flange proud of the blade flanks, meeting at the point.
    edge = [(-0.9, 0.95), (2.0, 0.84), (4.6, 0.56), (6.6, 0.24), (7.9, 0.03), (8.55, 0.0),
            (7.9, 0.18), (6.6, 0.56), (4.6, 0.94), (2.0, 1.26), (-0.9, 1.4), (-1.6, 1.3)]
    F.plate(s, 'Edge', edge, z0=-0.03, thickness=0.09, material='bare', chamfer=0.07, chamfer_bottom=0.04,
            mirror=True)

    # Crossguard bar where blade meets handle: angular blackened block, lamps at its ends.
    F.plate(s, 'GuardBar', [(-2.6, -1.35), (-1.2, -1.15), (-1.2, 1.15), (-2.6, 1.35)], z0=-0.3, thickness=0.82,
            material='paint2', chamfer=0.14, chamfer_bottom=0.1, side_material='gunmetal')

    # The handle: blackened drive block, square-ish section, wrapped in gunmetal collars.
    F.loft(s, 'Handle', [
        dict(x=-6.3, w=0.92, ht=0.78, hb=0.7, zc=0.05, n=3.0),
        dict(x=-5.6, w=1.08, ht=0.86, hb=0.76, zc=0.05, n=3.2),
        dict(x=-3.0, w=1.02, ht=0.8, hb=0.7, zc=0.05, n=3.2),
        dict(x=-1.6, w=0.88, ht=0.66, hb=0.56, zc=0.05, n=2.8),
    ], material='paint2', back_material='dark', front_material='dark', count=56)
    for i, x in enumerate((-5.2, -4.3, -3.4)):
        F.band(s, 'Handle', (x, 0, 0), (1, 0, 0), 0.22, 'gunmetal', inset=0.02, depth=0.03)
    # Black grip wrap between the collars: recessed dark panels read as depth from above.
    for x in (-4.75, -3.85):
        F.panel(s, 'Handle', (x, 0.0), (0.56, 0.5), 'dark', inset=0.03, depth=-0.03)

    # One big hot drive: the pommel.
    F.nozzle(s, 'Nozzle', (-7.75, 0.0, 0.05), 0.92, 1.5, material='gunmetal')
    F.cylinder(s, 'NozzleCollar', (-6.55, 0, 0.05), (-6.0, 0, 0.05), 1.1, 1.1, material='gunmetal', segments=48)
    F.cylinder(s, 'HeatSeam', (-6.7, 0, 0.05), (-6.56, 0, 0.05), 1.02, 1.02, material='glow_drive', segments=48)
    F.cylinder(s, 'NozzleCollar2', (-6.95, 0, 0.05), (-6.7, 0, 0.05), 1.06, 1.06, material='dark', segments=48)
    s.hook('HOOK_DRIVE_CORE', (-7.7, 0.0, 0.05))

    # Crossguard: forward-swept black blade fins, hazard-barred tips.
    fin = [(-3.5, 0.8), (-1.3, 0.8), (1.7, 3.15), (1.3, 3.45), (-0.9, 2.35), (-1.5, 2.4), (-2.9, 1.5)]
    F.plate(s, 'Guard', fin, z0=-0.1, thickness=0.2, material='paint', chamfer=0.22, chamfer_bottom=0.06,
            mirror=True, side_material='gunmetal')
    # A sunk black spar line from root to tip, so the fin reads as built, not as one slab.
    F.band(s, 'Guard', (-1.35, 1.75, 0), (0.78, -0.62, 0), 0.2, 'dark', facing=(0, 0, 1), mirror=True,
           inset=0.02, depth=-0.03, min_facing=0.2)
    hazard_bars(s, 'Guard', (0.45, 2.5, 0), (0.62, 0.78, 0), 3, 0.2, 0.18, mirror=True)

    # Twin guns sitting on the guard roots, pointing along the blade.
    F.cylinder(s, 'GunBody', (-3.0, 1.5, 0.3), (-0.5, 1.5, 0.3), 0.21, 0.18, material='gunmetal', mirror=True,
               cap_material='dark')
    F.cylinder(s, 'GunBarrel', (-0.55, 1.5, 0.3), (1.7, 1.5, 0.3), 0.075, material='gunmetal', mirror=True,
               cap_material='dark')
    F.cylinder(s, 'GunMuzzle', (1.45, 1.5, 0.3), (1.8, 1.5, 0.3), 0.1, material='dark', mirror=True, segments=16)

    # Cockpit slit: a low raked blister at the blade root, dark glass.
    F.canopy(s, 'Canopy', x0=-1.2, x1=1.4, w=0.34, h=0.3, z=0.6, peak=0.35)

    # Dorsal blade fin on the handle, raked forward like the guard.
    F.plate(s, 'Dorsal', [(-5.9, -0.07), (-2.6, -0.07), (-3.4, 0.07), (-6.1, 0.07)], z0=0.7, thickness=0.55,
            material='paint2', chamfer=0.03, side_material='paint', top_material='stripe')

    s.detail = 1
    # Exposed machinery on the handle: pipes down each flank, a vent block, RCS.
    F.cylinder(s, 'Pipe', (-5.9, 1.02, 0.25), (-1.8, 0.86, 0.25), 0.07, material='gunmetal', mirror=True, segments=12)
    F.cylinder(s, 'PipeLow', (-5.9, 1.04, -0.12), (-2.2, 0.92, -0.12), 0.055, material='bare', segments=12)
    F.vent(s, 'Vent', (-4.4, 0.52, 0.83), (1.6, 0.34, 0.1), mirror=True)
    F.rcs(s, 'RCS', (-5.7, 1.1, 0.05), size=0.28, mirror=True)
    # Gun mounting straps into the guard.
    F.box(s, 'GunStrap', (-1.0, 1.5, 0.2), (0.26, 0.5, 0.3), material='paint2', mirror=True)
    # Starboard-only sensor stub (salvage asymmetry).
    F.antenna(s, 'Mast', (-2.4, -0.55, 0.6), 0.7, tip='glow_amber')
    s.detail = 0

    # Lights: sodium lamps on the handle, nav on the guard tips, a warm eye under the canopy.
    F.light(s, 'LampPort', (-5.2, 1.12, 0.45), 'glow_amber', size=0.14)
    F.light(s, 'LampStbd', (-5.2, -1.12, 0.45), 'glow_amber', size=0.14)
    F.light(s, 'GuardLamp', (-2.0, 1.28, 0.02), 'glow_amber', size=0.16, mirror=True)
    F.light(s, 'Eye', (1.45, 0.0, 0.52), 'glow_warm', size=0.12)
    F.light(s, 'NavPort', (1.4, 3.36, 0.03), 'glow_red')
    F.light(s, 'NavStarboard', (1.4, -3.36, 0.03), 'glow_green')
    F.light(s, 'Beacon', (-3.0, 0.0, 0.86), 'glow_amber', size=0.12)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
