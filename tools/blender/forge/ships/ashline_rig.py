"""Ashline Rig — raider work-ship. A pirate claw on a bare spine.

Plan read at the chase camera: an open truss spine you can see through, a big hazard-tipped grapple claw
at the nose, a tether winch drum hung off the starboard rail, a crew cab bolted to port, cobbled
oxide plates and an exposed black engine block with two hot drives. Ashline language: oxide red over
blackened steel, sodium lamps, hazard bands, honed bare-steel edges.

The frame and engine block are shared with the Corsair Blade (ashline_rig_corsair_blade.py), which is
this rig re-armoured as a predator.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'ashline_rig'
COLORS = {
    'paint': '#4a1b15',    # oxide red (the illustrated light lifts it; keep it deep)
    'paint2': '#161719',   # blackened steel
    'stripe': '#c9621c',   # sodium orange
    'hazard': '#d99a1e',
    'bare': '#868c93',     # honed steel
    'glow_drive': '#ff9a4a',
}

RAIL_Y = 0.95      # truss rails either side of the centreline
RAIL_Z = 0.25
FRAME_X0, FRAME_X1 = -4.6, 5.2


def build_frame(s, bays=(-3.6, -2.2, -0.8, 0.6, 2.0, 3.4)):
    """Open truss spine: two box rails, cross ties, X bracing, a round keel tube underneath."""
    F.box(s, 'Rail', ((FRAME_X0 + FRAME_X1) / 2, RAIL_Y, RAIL_Z), (FRAME_X1 - FRAME_X0, 0.34, 0.5),
          material='gunmetal', mirror=True, bevel=0.03)
    F.box(s, 'RailCap', ((FRAME_X0 + FRAME_X1) / 2, RAIL_Y, RAIL_Z + 0.27), (FRAME_X1 - FRAME_X0 - 0.2, 0.2, 0.06),
          material='hazard', mirror=True, bevel=0.01)
    ties = [FRAME_X0 + 0.3] + [b for b in bays] + [FRAME_X1 - 0.3]
    for i, x in enumerate(ties):
        F.box(s, f'Tie{i}', (x, 0.0, RAIL_Z), (0.26, RAIL_Y * 2, 0.36), material='gunmetal', bevel=0.02)
    for i in range(len(ties) - 1):
        xa, xb = ties[i], ties[i + 1]
        cx, lx = (xa + xb) / 2, (xb - xa)
        ang = math.atan2(RAIL_Y * 2, lx)
        diag = math.hypot(lx, RAIL_Y * 2) - 0.2
        F.box(s, f'BraceA{i}', (cx, 0.0, RAIL_Z - 0.08), (diag, 0.12, 0.16), material='dark', rot_z=ang, bevel=0.01)
        F.box(s, f'BraceB{i}', (cx, 0.0, RAIL_Z - 0.08), (diag, 0.12, 0.16), material='dark', rot_z=-ang, bevel=0.01)
    F.cylinder(s, 'KeelTube', (FRAME_X0 - 0.4, 0.0, -0.35), (FRAME_X1 + 0.2, 0.0, -0.35), 0.32, material='paint2',
               segments=24)
    for x in (FRAME_X0 + 0.3, 0.6, FRAME_X1 - 0.3):
        F.box(s, f'KeelStrut{x:.1f}', (x, 0.0, -0.05), (0.22, 0.3, 0.6), material='gunmetal')


def build_engine(s, x_front=-4.4, detail_pipes=True):
    """Exposed engine block: a black box with tank cylinders on top, two hot drives aft."""
    F.box(s, 'EngineBlock', (x_front - 1.5, 0.0, 0.15), (3.2, 2.6, 1.5), material='paint2', bevel=0.05)
    F.band(s, 'EngineBlock', (x_front - 0.35, 0, 0), (1, 0, 0), 0.26, 'hazard', inset=0.015, depth=0.02)
    F.band(s, 'EngineBlock', (x_front - 0.75, 0, 0), (1, 0, 0), 0.26, 'hazard', inset=0.015, depth=0.02)
    F.cylinder(s, 'Tank', (x_front - 2.9, 0.62, 0.95), (x_front - 0.5, 0.62, 0.95), 0.42, material='gunmetal',
               mirror=True, segments=28, cap_material='dark')
    for x in (x_front - 2.4, x_front - 1.0):
        F.box(s, f'TankStrap{x:.1f}', (x, 0.0, 0.93), (0.14, 2.0, 0.28), material='dark', bevel=0.01)
    F.nozzle(s, 'Drive', (x_front - 4.3, 0.72, 0.1), 0.62, 1.3, material='gunmetal', mirror=True)
    F.cylinder(s, 'HeatSeam', (x_front - 3.14, 0.72, 0.1), (x_front - 3.04, 0.72, 0.1), 0.7, material='glow_drive',
               mirror=True, segments=36)
    s.hook('HOOK_DRIVE_CORE', (x_front - 4.2, 0.0, 0.1))
    if detail_pipes:
        s.detail = 1
        F.vent(s, 'EngineVent', (x_front - 1.7, 0.0, 0.92), (1.0, 0.5, 0.1), axis='y')
        F.cylinder(s, 'ExhaustPipe', (x_front - 2.9, 1.34, 0.4), (x_front + 0.6, 1.1, 0.4), 0.08, material='bare',
                   mirror=True, segments=12)
        F.rcs(s, 'EngineRCS', (x_front - 2.6, 1.42, 0.0), size=0.34, mirror=True)
        s.detail = 0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_frame(s)
    build_engine(s)

    # Cobbled plates: salvaged oxide and black panels bolted over some bays, a little askew.
    F.box(s, 'PlateA', (-3.0, 0.1, 0.56), (1.9, 1.7, 0.1), material='paint', rot_z=0.04, bevel=0.03)
    F.box(s, 'PlateB', (-1.2, -0.25, 0.56), (1.0, 1.3, 0.09), material='paint2', rot_z=-0.07, bevel=0.03)
    F.box(s, 'PlateC', (1.3, 0.15, 0.56), (1.5, 1.65, 0.1), material='paint', rot_z=-0.03, bevel=0.03)
    F.band(s, 'PlateA', (-3.0, 0, 0), (1, 0, 0), 0.22, 'stripe', facing=(0, 0, 1))
    F.panel(s, 'PlateC', (1.3, 0.15), (0.6, 0.8), 'dark', inset=0.03, depth=-0.03)

    # Claw head: the grapple's black housing, hazard-banded, at the nose of the spine.
    F.plate(s, 'ClawHead', [(4.6, -1.3), (6.3, -1.0), (6.7, 0.0), (6.3, 1.0), (4.6, 1.3)], z0=-0.4, thickness=1.2,
            material='paint2', chamfer=0.25, chamfer_bottom=0.15, side_material='gunmetal')
    F.band(s, 'ClawHead', (5.3, 0, 0), (1, 0, 0), 0.3, 'hazard', facing=(0, 0, 1), min_facing=0.3)
    F.cylinder(s, 'ClawPivot', (5.9, 1.25, 0.2), (5.9, -1.25, 0.2), 0.3, material='gunmetal', segments=24)
    # Two hooked jaws, open. Blackened with hazard tips and honed steel teeth on the inner edge.
    jaw = [(5.8, 0.75), (7.1, 1.45), (8.3, 1.45), (9.0, 1.0), (9.35, 1.15), (8.7, 2.05), (7.2, 2.25), (5.6, 1.5)]
    F.plate(s, 'Jaw', jaw, z0=-0.1, thickness=0.55, material='paint', chamfer=0.16, chamfer_bottom=0.08,
            mirror=True, side_material='paint2')
    for i, x in enumerate((8.35, 8.75)):
        F.band(s, 'Jaw', (x, 1.5, 0), (0.85, 0.5, 0), 0.2, 'hazard', facing=(0, 0, 1), mirror=True, min_facing=0.3)
    F.plate(s, 'JawTeeth', [(7.1, 1.35), (8.3, 1.35), (8.95, 0.92), (9.1, 1.05), (8.35, 1.55), (7.1, 1.55)],
            z0=0.02, thickness=0.3, material='bare', chamfer=0.05, mirror=True)
    F.cylinder(s, 'JawRam', (4.9, 1.05, 0.55), (6.9, 1.7, 0.55), 0.12, material='bare', mirror=True, segments=14)

    # Tether winch: a big drum hung off the starboard rail, cable running forward to the claw head.
    F.cylinder(s, 'Drum', (0.9, -1.1, 0.3), (0.9, -2.5, 0.3), 0.72, material='dark', segments=32)
    F.cylinder(s, 'DrumFlangeIn', (0.9, -1.05, 0.3), (0.9, -1.2, 0.3), 0.95, material='hazard', segments=32)
    F.cylinder(s, 'DrumFlangeOut', (0.9, -2.4, 0.3), (0.9, -2.58, 0.3), 0.95, material='hazard', segments=32)
    for i in range(5):
        y = -1.35 - i * 0.24
        F.cylinder(s, f'Wrap{i}', (0.9, y, 0.3), (0.9, y - 0.14, 0.3), 0.78, material='gunmetal', segments=32)
    F.box(s, 'DrumMount', (0.9, -1.1, 0.05), (1.3, 0.4, 0.5), material='gunmetal')
    F.cylinder(s, 'Tether', (0.9, -1.8, 1.08), (5.0, -0.7, 0.75), 0.06, material='bare', segments=10)
    F.box(s, 'Fairlead', (5.0, -0.7, 0.72), (0.4, 0.3, 0.24), material='gunmetal')

    # Crew cab bolted to the port rail: small oxide pod, lit windows, a dark glass brow.
    F.loft(s, 'Cab', [
        dict(x=1.6, w=0.7, ht=0.62, hb=0.5, zc=0.4, n=2.6, y=1.9),
        dict(x=2.2, w=0.85, ht=0.78, hb=0.55, zc=0.4, n=2.8, y=1.95),
        dict(x=4.0, w=0.8, ht=0.72, hb=0.5, zc=0.38, n=2.8, y=1.95),
        dict(x=4.7, w=0.55, ht=0.5, hb=0.38, zc=0.34, n=2.4, y=1.9),
        dict(x=4.95, w=0.2, ht=0.2, hb=0.15, zc=0.32, n=2.2, y=1.9),
    ], material='paint', belly='paint2', back_material='dark', count=48)
    F.band(s, 'Cab', (3.0, 0, 0), (1, 0, 0), 0.16, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.canopy(s, 'CabGlass', x0=3.0, x1=4.55, w=0.45, h=0.3, z=0.86, y=1.93, peak=0.5)
    F.windows(s, 'CabWin', 2.0, 3.6, 2.82, 0.55, 3, size=(0.34, 0.16))
    F.box(s, 'CabArm', (3.0, 1.3, 0.3), (1.2, 0.8, 0.3), material='gunmetal')

    s.detail = 1
    F.antenna(s, 'Mast', (2.6, 2.1, 1.15), 0.9, tip='glow_amber')
    F.rcs(s, 'CabRCS', (4.0, 2.72, 0.3), size=0.26)
    F.box(s, 'RailBolt', (-0.8, 0.95, 0.52), (0.3, 0.3, 0.06), material='bare', mirror=True)
    F.box(s, 'JunkBox', (-0.2, 0.2, 0.62), (0.7, 0.5, 0.35), material='gunmetal', rot_z=0.12)
    s.detail = 0

    # Lights: claw work-lamps (sodium), nav at the extremities, beacon on the engine block.
    F.light(s, 'ClawLamp', (6.0, 0.7, 0.8), 'glow_amber', size=0.2, mirror=True)
    F.light(s, 'NavPort', (3.0, 2.84, 0.62), 'glow_red', size=0.15)
    F.light(s, 'NavStarboard', (0.9, -2.62, 1.0), 'glow_green', size=0.15)
    F.light(s, 'Beacon', (-4.6, 0.0, 0.92), 'glow_amber', size=0.16)
    F.light(s, 'RailLamp', (-4.3, 1.12, 0.3), 'glow_warm', size=0.14, mirror=True)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
