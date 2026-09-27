"""Prospector Skiff — independent Work-family prospector. One pilot, one drill lance, one engine.

Plan read at the chase camera: a stubby mustard hull with a long drill lance out front (the needle), two
graphite saddle tanks hugging the flanks, a rack of sample canisters on the back and one big drive
aft. Scruffy but tidy: a bolted-on graphite patch plate and a mismatched tank cap are modelled, not
painted.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'prospector_skiff'
COLORS = {
    'paint': '#6e5a26',    # prospector mustard (authored dark: the key light lifts it ~2.5x)
    'paint2': '#2c2e33',   # graphite
    'stripe': '#2c2e33',
    'hazard': '#c8901e',
    'paint.patch': '#4b4a45',  # a replaced plate still in primer grey
}

TY = 2.0    # saddle tank centre line
TZ = 0.12   # saddle tank centre height


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Hull: a stubby teardrop, tall at the cockpit, drive block aft.
    F.loft(s, 'Hull', [
        dict(x=-6.5, w=1.05, ht=0.95, hb=0.85, zc=0.1, n=2.8),
        dict(x=-6.0, w=1.3, ht=1.15, hb=0.95, zc=0.1, n=3.0),
        dict(x=-2.0, w=1.5, ht=1.3, hb=1.0, zc=0.1, n=3.0),
        dict(x=2.0, w=1.45, ht=1.35, hb=0.95, zc=0.1, n=2.8),
        dict(x=4.4, w=1.1, ht=1.05, hb=0.85, zc=0.05, n=2.6),
        dict(x=5.7, w=0.62, ht=0.55, hb=0.6, zc=0.0, n=2.4),
        dict(x=6.2, w=0.2, ht=0.18, hb=0.25, zc=0.0, n=2.0),
    ], material='paint', belly='paint2', back_material='dark', count=56)
    F.band(s, 'Hull', (-4.9, 0, 0), (1, 0, 0), 0.5, 'paint2', inset=0.02, depth=0.03)
    F.band(s, 'Hull', (4.6, 0, 0), (1, 0, 0), 0.9, 'paint2', inset=0.02, depth=0.02)
    F.band(s, 'Hull', (4.0, 0, 0), (1, 0, 0), 0.22, 'hazard')
    # Cockpit bubble, set forward on the crown.
    # Patch plate: a replaced crown panel still in primer grey, off-centre beside the canopy.
    F.panel(s, 'Hull', (0.15, 0.5), (1.5, 0.85), 'paint.patch', inset=0.04, depth=0.04)
    F.panel(s, 'Hull', (0.15, -0.5), (1.5, 0.85), 'paint', inset=0.04, depth=0.03)
    F.canopy(s, 'Canopy', x0=1.2, x1=4.4, w=0.72, h=0.55, z=1.25, peak=0.45, n=2.4)
    # --- Saddle tanks: graphite, with mustard end caps; one cap replaced in plain gunmetal.
    F.loft(s, 'Tank', [
        dict(x=-4.9, w=0.25, ht=0.25, hb=0.25, zc=TZ, n=2.0, y=TY),
        dict(x=-4.6, w=0.48, ht=0.48, hb=0.48, zc=TZ, n=2.0, y=TY),
        dict(x=1.6, w=0.48, ht=0.48, hb=0.48, zc=TZ, n=2.0, y=TY),
        dict(x=2.2, w=0.3, ht=0.3, hb=0.3, zc=TZ, n=2.0, y=TY),
        dict(x=2.4, w=0.08, ht=0.08, hb=0.08, zc=TZ, n=2.0, y=TY),
    ], material='paint2', count=36, mirror=True)
    F.band(s, 'Tank', (1.9, TY, 0), (1, 0, 0), 0.8, 'paint', mirror=True)
    F.band(s, 'Tank', (-4.5, TY, 0), (1, 0, 0), 0.6, 'paint', mirror=True)
    F.band(s, 'Tank', (-1.4, TY, 0), (1, 0, 0), 0.3, 'hazard', mirror=True)
    for i, x in enumerate((-3.4, 0.6)):
        F.box(s, f'TankStrap{i}', (x, TY * 0.72, TZ), (0.4, 1.0, 0.4), material='gunmetal', bevel=0.03, mirror=True)
        F.cylinder(s, f'TankBand{i}', (x - 0.12, TY, TZ), (x + 0.12, TY, TZ), 0.52, material='gunmetal',
                   segments=28, mirror=True, cap=False)

    # --- Drill lance: motor housing on the chin, long shaft, cutter head with spiral flutes.
    F.box(s, 'LanceMount', (4.2, 0.0, -0.55), (2.4, 0.9, 0.55), material='paint2', bevel=0.05, taper=0.9)
    F.cylinder(s, 'LanceMotor', (4.8, 0.0, -0.5), (7.0, 0.0, -0.5), 0.5, 0.44, material='gunmetal', segments=28,
               cap_material='dark')
    F.cylinder(s, 'LanceCollar', (6.8, 0.0, -0.5), (7.25, 0.0, -0.5), 0.52, material='hazard', segments=28)
    F.cylinder(s, 'LanceShaft', (7.2, 0.0, -0.5), (9.4, 0.0, -0.5), 0.17, material='bare', segments=16)
    F.cylinder(s, 'LanceGuide', (8.5, 0.0, -0.5), (8.75, 0.0, -0.5), 0.26, material='gunmetal', segments=16)
    F.cylinder(s, 'DrillHead', (9.3, 0.0, -0.5), (10.3, 0.0, -0.5), 0.36, 0.04, material='gunmetal', segments=24,
               cap_material='dark')
    for i in range(3):
        x = 9.45 + i * 0.27
        r = 0.36 - (x - 9.3) * 0.32
        F.cylinder(s, f'DrillFlute{i}', (x, 0.0, -0.5), (x + 0.09, 0.0, -0.5), r + 0.05, r, material='hazard',
                   segments=24, bevel=0.0, cap=False)
    F.light(s, 'LanceLamp', (7.0, 0.0, -0.02), 'glow_warm', size=0.16)

    # --- Sample rack on the back: graphite deck, 2 x 4 canisters standing up.
    F.plate(s, 'RackDeck', [(-1.4, 0.85), (-5.4, 0.85), (-5.4, -0.85), (-1.4, -0.85)], z0=1.12, thickness=0.36,
            material='paint2', chamfer=0.06)
    caps = ('paint', 'hazard', 'paint', 'ceramic', 'hazard', 'paint', 'ceramic', 'paint')
    k = 0
    for row, y in enumerate((0.42, -0.42)):
        for j, x in enumerate((-1.95, -2.9, -3.85, -4.8)):
            F.cylinder(s, f'Can{row}{j}', (x, y, 1.46), (x, y, 2.1), 0.28, material='bare', segments=20)
            F.cylinder(s, f'CanCap{row}{j}', (x, y, 2.08), (x, y, 2.22), 0.31, material=caps[k], segments=20)
            k += 1
    F.box(s, 'RackRail', (-3.4, 0.82, 1.78), (4.0, 0.08, 0.3), material='gunmetal', bevel=0.01, mirror=True)
    for x in (-1.5, -5.3):
        F.box(s, f'RackPost{x}', (x, 0.82, 1.65), (0.12, 0.12, 0.5), material='gunmetal', bevel=0.01, mirror=True)

    # --- One engine: a big bell in a graphite collar.
    F.cylinder(s, 'DriveCollar', (-7.1, 0.0, 0.1), (-5.9, 0.0, 0.1), 0.98, 0.95, material='paint2', segments=40,
               cap_material='dark')
    F.nozzle(s, 'Nozzle', (-8.1, 0.0, 0.1), 0.8, 1.0, material='gunmetal', bell=1.2)
    s.hook('HOOK_DRIVE_CORE', (-8.0, 0.0, 0.1))
    # Canted tail fins off the drive collar: graphite, mustard tips (the skiff's little swagger).
    F.plate(s, 'TailFin', [(-4.4, 0.7), (-6.4, 1.75), (-7.1, 1.75), (-6.3, 0.7)], z0=1.0, thickness=0.14,
            material='paint2', chamfer=0.07, mirror=True)
    F.band(s, 'TailFin', (-6.7, 1.6, 0), (0, 1, 0), 0.3, 'paint', facing=(0, 0, 1), mirror=True)

    s.detail = 1
    F.rcs(s, 'RCS', (2.0, TY + 0.46, TZ), size=0.3, mirror=True)
    F.antenna(s, 'Mast', (-0.3, -0.7, 1.22), 1.0, tip=None)
    F.cylinder(s, 'ProbeArm', (5.1, -0.75, 0.55), (6.7, -1.0, 0.55), 0.06, material='gunmetal', segments=8)
    F.sensor_dome(s, 'ProbeHead', (6.75, -1.0, 0.5), 0.16)
    F.box(s, 'ProbeFoot', (5.1, -0.75, 0.55), (0.3, 0.25, 0.25), material='gunmetal', bevel=0.02)
    s.detail = 0

    F.light(s, 'NavPort', (-4.6, TY + 0.5, TZ), 'glow_red', size=0.14)
    F.light(s, 'NavStarboard', (-4.6, -TY - 0.5, TZ), 'glow_green', size=0.14)
    F.light(s, 'Beacon', (-5.25, 0.0, 1.5), 'glow_amber', size=0.16)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
