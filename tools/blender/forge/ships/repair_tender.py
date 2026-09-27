"""Repair Tender — Work fleet tender. A flying workshop with two manipulator arms.

Plan read at the chase camera: a boxy copper workshop with an ivory roof and an open dark roof bay
under a gantry crane, parts racks down both flanks, and two jointed repair arms folded forward like a
mantis, their welding tips burning cyan ahead of the nose.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'repair_tender'
COLORS = {
    'paint': '#7a4424',    # tender copper (Helios key light lifts values ~2.5x: author dark)
    'paint2': '#948e82',   # workshop ivory
    'stripe': '#3e2718',   # dark copper livery line
    'hazard': '#c8901e',
}


def beam(s, name, p0, p1, z, width, height, material='paint', mirror=True, bevel=0.03, taper=1.0):
    """Local helper: a straight arm segment (box) from p0 to p1 in plan, mirrored with the correct
    rotation (forge box mirror keeps rot_z, which is wrong for an angled member)."""
    (x0, y0), (x1, y1) = p0, p1
    length = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    c = ((x0 + x1) / 2, (y0 + y1) / 2, z)
    F.box(s, name, c, (length, width, height), material=material, bevel=bevel, rot_z=ang, taper=taper)
    if mirror:
        F.box(s, name + '_M', (c[0], -c[1], z), (length, width, height), material=material, bevel=bevel, rot_z=-ang,
              taper=taper)


def pin(s, name, xy, z0, z1, r, material='gunmetal', cap=None, mirror=True, segments=24):
    """Local helper: a vertical joint pin/turret."""
    x, y = xy
    F.cylinder(s, name, (x, y, z0), (x, y, z1), r, material=material, segments=segments, mirror=mirror,
               cap_material=cap)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Workshop hull: a big square-shouldered box ------------------------------------------------
    F.loft(s, 'Hull', [
        dict(x=-10.4, w=2.35, ht=1.6, hb=1.35, zc=0.0, n=4.0),
        dict(x=-9.7, w=2.75, ht=1.95, hb=1.6, zc=0.0, n=4.6),
        dict(x=4.4, w=2.85, ht=2.0, hb=1.6, zc=0.0, n=4.6),
        dict(x=6.7, w=2.55, ht=1.75, hb=1.45, zc=0.0, n=4.0),
        dict(x=8.1, w=1.95, ht=1.25, hb=1.2, zc=0.0, n=3.4),
        dict(x=8.7, w=1.2, ht=0.8, hb=0.9, zc=0.0, n=3.0),
    ], material='paint', belly='gunmetal', back_material='dark', count=48)
    # ivory workshop roof and a dark copper waist line
    F.panel(s, 'Hull', (-2.6, 0.0), (13.0, 4.3), 'paint2', inset=0.06, depth=0.05)
    F.panel(s, 'Hull', (2.3, 0.0), (1.9, 2.2), 'paint', inset=0.05, depth=0.04)
    F.panel(s, 'Hull', (-8.0, 0.0), (1.6, 3.4), 'stripe', inset=0.04, depth=-0.03)
    F.band(s, 'Hull', (0, 2.8, 0.55), (0, 0, 1), 0.28, 'stripe', facing=(0, 1, 0), min_facing=0.6, inset=0.02,
           depth=0.03)
    F.band(s, 'Hull', (0, -2.8, 0.55), (0, 0, 1), 0.28, 'stripe', facing=(0, -1, 0), min_facing=0.6, inset=0.02,
           depth=0.03)
    # open roof bay (dark machinery well) under the gantry
    F.panel(s, 'Hull', (-3.4, 0.0), (6.2, 3.2), 'dark', inset=0.06, depth=-0.4)
    # hazard frame at the bay's forward lip
    F.panel(s, 'Hull', (0.35, 0.0), (0.5, 3.6), 'hazard', inset=0.02, depth=0.02)

    # --- Bridge: glazed cab at the nose, between the arm shoulders --------------------------------
    F.loft(s, 'Bridge', [
        dict(x=3.6, w=1.35, ht=0.6, hb=0.3, zc=2.0, n=3.2),
        dict(x=4.2, w=1.6, ht=0.95, hb=0.3, zc=2.0, n=3.6),
        dict(x=6.6, w=1.55, ht=0.9, hb=0.3, zc=1.8, n=3.6),
        dict(x=7.7, w=1.3, ht=0.6, hb=0.3, zc=1.55, n=3.0),
        dict(x=8.05, w=0.9, ht=0.25, hb=0.3, zc=1.45, n=2.6),
    ], material='paint2', count=40)
    F.band(s, 'Bridge', (7.45, 0, 2.0), (1, 0, 0), 1.0, 'glass', facing=(1, 0, 0.5), min_facing=0.3)
    F.panel(s, 'Bridge', (5.2, 0.0), (1.8, 1.6), 'paint', inset=0.04, depth=0.03)
    F.windows(s, 'BridgeWin', 4.6, 6.6, 1.58, 2.25, 3, size=(0.5, 0.26), finish='glow_warm', mirror=True)

    # --- Drive block aft ----------------------------------------------------------------------------
    F.box(s, 'DriveBlock', (-11.0, 0.0, 0.1), (1.8, 4.2, 2.3), material='gunmetal', bevel=0.06)
    F.nozzle(s, 'Nozzle', (-12.35, 1.25, 0.1), 0.78, 1.2, material='gunmetal', mirror=True, bell=1.18)
    F.box(s, 'DriveCollar', (-11.9, 0.0, 0.1), (0.3, 4.4, 2.5), material='paint', bevel=0.04)
    s.hook('HOOK_DRIVE_CORE', (-12.3, 0.0, 0.1))
    F.band(s, 'Hull', (-9.2, 0, 0), (1, 0, 0), 0.5, 'hazard', inset=0.02, depth=0.02)

    # --- Manipulator arms (mirrored pose) -----------------------------------------------------------
    SH = (5.3, 3.05)     # shoulder turret
    EL = (9.9, 4.25)     # elbow
    WR = (12.1, 2.35)    # wrist
    TIP = (13.05, 1.55)  # tool tip
    # shoulder turret: a big drum on a copper sponson plate sunk into the hull side
    F.plate(s, 'ShoulderMount', [(3.9, 2.4), (6.7, 2.4), (6.5, 3.55), (4.1, 3.55)], z0=-0.7, thickness=1.5,
            material='paint', chamfer=0.1, mirror=True)
    pin(s, 'Shoulder', SH, 0.7, 1.55, 0.78, material='gunmetal', cap='dark')
    pin(s, 'ShoulderCap', SH, 1.5, 1.72, 0.6, material='paint')
    # upper arm: ivory box girder with a hydraulic ram along its top
    beam(s, 'UpperArm', SH, EL, 1.25, 0.98, 0.72, material='paint2')
    beam(s, 'UpperArmSpine', (SH[0] + 0.6, SH[1] + 0.16), (EL[0] - 0.6, EL[1] - 0.16), 1.65, 0.34, 0.16,
         material='stripe', bevel=0.01)
    pin(s, 'Elbow', EL, 0.8, 2.0, 0.64, material='gunmetal', cap='dark')
    pin(s, 'ElbowCap', EL, 1.95, 2.14, 0.46, material='hazard')
    # forearm folds back inboard, one level higher so the joint layering reads from above
    beam(s, 'Forearm', EL, WR, 1.62, 0.74, 0.58, material='paint2')
    beam(s, 'ForearmBand', (EL[0] + (WR[0] - EL[0]) * 0.55, EL[1] + (WR[1] - EL[1]) * 0.55),
         (EL[0] + (WR[0] - EL[0]) * 0.75, EL[1] + (WR[1] - EL[1]) * 0.75), 1.62, 0.8, 0.64, material='hazard',
         bevel=0.01)
    pin(s, 'Wrist', WR, 1.15, 2.05, 0.46, material='gunmetal', cap='dark')
    # tool head: welding torch with a cyan arc tip
    beam(s, 'ToolHead', WR, (WR[0] + (TIP[0] - WR[0]) * 0.55, WR[1] + (TIP[1] - WR[1]) * 0.55), 1.6, 0.52, 0.52,
         material='gunmetal', bevel=0.02)
    F.cylinder(s, 'Torch', (WR[0] + 0.45, WR[1] - 0.38, 1.6), TIP + (1.6,), 0.16, 0.07, material='bare',
               segments=14, mirror=True)
    F.light(s, 'WeldTip', TIP + (1.6,), 'glow_cyan', size=0.24, mirror=True)

    # --- Parts racks down both flanks ---------------------------------------------------------------
    s.detail = 1
    F.box(s, 'RackShelf', (-3.6, 3.05, -0.35), (10.4, 0.62, 0.12), material='gunmetal', bevel=0.01, mirror=True)
    F.box(s, 'RackRail', (-3.6, 3.33, 0.55), (10.4, 0.08, 0.08), material='gunmetal', bevel=0.0, mirror=True)
    for i in range(7):
        x = -8.6 + i * 1.67
        F.box(s, f'RackPost{i}', (x, 3.33, 0.1), (0.1, 0.1, 0.9), material='gunmetal', bevel=0.0, mirror=True)
    for i, x in enumerate((-8.1, -7.6, -7.1)):
        F.cylinder(s, f'GasBottle{i}', (x, 3.05, -0.29), (x, 3.05, 0.55), 0.21, material='paint2', segments=14,
                   mirror=True)
        F.cylinder(s, f'GasCap{i}', (x, 3.05, 0.55), (x, 3.05, 0.68), 0.13, material='hazard', segments=12,
                   mirror=True)
    for i, (x, sx) in enumerate(((-5.9, 1.3), (-4.3, 1.4), (-2.6, 1.2), (-1.1, 1.3))):
        F.container(s, f'PartsCrate{i}', (x, 3.05, 0.08), (sx, 0.5, 0.72), finish='paint' if i % 2 else 'stripe',
                    ribs=2, mirror=True)
    for i, x in enumerate((0.4, 0.95, 1.5)):
        F.cylinder(s, f'Spool{i}', (x, 3.05, -0.29), (x, 3.05, 0.35), 0.24, material='dark', segments=14,
                   mirror=True)
    # gantry crane over the roof bay
    F.box(s, 'GantryRail', (-3.4, 1.72, 2.25), (6.8, 0.2, 0.26), material='gunmetal', bevel=0.01, mirror=True)
    for i, x in enumerate((-6.6, -0.2)):
        F.box(s, f'GantryFoot{i}', (x, 1.72, 2.08), (0.3, 0.3, 0.26), material='gunmetal', bevel=0.01, mirror=True)
    F.box(s, 'GantryBridge', (-4.3, 0.0, 2.42), (0.42, 3.8, 0.28), material='hazard', bevel=0.02)
    F.box(s, 'GantryHoist', (-4.3, 0.4, 2.2), (0.6, 0.6, 0.4), material='gunmetal', bevel=0.02)
    F.container(s, 'BayCrate', (-4.3, 0.4, 1.95), (1.4, 1.1, 0.5), finish='paint', ribs=2)
    F.container(s, 'BayCrate2', (-2.0, -0.5, 1.95), (1.8, 1.4, 0.9), finish='paint2', ribs=3)
    F.box(s, 'BayMachine', (-5.8, -0.7, 1.9), (1.2, 1.2, 1.0), material='gunmetal', bevel=0.03)
    F.light(s, 'BayMachineLamp', (-5.8, -0.7, 2.42), 'glow_cyan', size=0.16)
    # drive radiators and roof hardware
    F.fins(s, 'DriveFin', -11.7, -10.2, 0.0, 1.25, 0.34, 6, thickness=0.08, depth=3.4, material='dark')
    F.vent(s, 'RoofVent', (-8.4, 0.0, 2.02), (1.4, 2.6, 0.12), slats=6)
    F.antenna(s, 'Mast', (3.2, -1.4, 2.0), 1.3, tip='glow_red')
    F.rcs(s, 'RCSAft', (-9.3, 2.9, 1.2), size=0.4, mirror=True)
    s.detail = 0

    # windows along the workshop walls, above the racks
    F.windows(s, 'HullWin', -8.2, 2.8, 2.79, 1.25, 8, size=(0.5, 0.26), finish='glow_warm', mirror=True)
    # work floods on the shoulder caps, looking at the tool tips
    F.light(s, 'ShoulderFlood', (SH[0] + 0.3, SH[1] - 0.1, 1.78), 'glow_warm', size=0.26, mirror=True)
    F.light(s, 'NavPort', (-10.2, 2.82, 1.2), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (-10.2, -2.82, 1.2), 'glow_green', size=0.2)
    F.light(s, 'NavPortArm', (EL[0], EL[1] + 0.64, 1.4), 'glow_red', size=0.14)
    F.light(s, 'NavStarboardArm', (EL[0], -EL[1] - 0.64, 1.4), 'glow_green', size=0.14)
    F.light(s, 'Beacon', (5.4, 0.0, 2.9), 'glow_amber', size=0.26)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
