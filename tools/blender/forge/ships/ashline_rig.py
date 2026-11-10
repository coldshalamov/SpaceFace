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
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'ashline_rig'
COLORS = {
    'paint': '#4a1b15',    # oxide red (the illustrated light lifts it; keep it deep)
    'paint2': '#161719',   # blackened steel
    'stripe': '#c9621c',   # sodium orange
    'hazard': '#d99a1e',
    'bare': '#868c93',     # honed steel
    'glow_drive': '#ff9a4a',
    'glow_cyan.sodium': '#ff8a2a',   # sodium lifted to light (Ashline identity trim)
}

RAIL_Y = 1.2       # truss rails either side of the centreline (the corsair runs them tighter)
RAIL_Z = 0.25
FRAME_X0, FRAME_X1 = -4.6, 5.2


def build_frame(s, rail_y=RAIL_Y, bays=(-3.6, -2.2, -0.8, 0.6, 2.0, 3.4), lit_rails=True):
    """Open truss spine: two box rails with black caps (hazard-banded ends), cross ties, X bracing, a
    round keel tube underneath on struts."""
    cx_mid, length = (FRAME_X0 + FRAME_X1) / 2, FRAME_X1 - FRAME_X0
    F.box(s, 'Rail', (cx_mid, rail_y, RAIL_Z), (length, 0.34, 0.5), material='gunmetal', mirror=True, bevel=0.03)
    F.box(s, 'RailCap', (cx_mid, rail_y, RAIL_Z + 0.27), (length - 0.2, 0.22, 0.06), material='paint2', mirror=True,
          bevel=0.01)
    for x in (FRAME_X0 + 0.55, FRAME_X1 - 0.55):
        F.band(s, 'RailCap', (x, rail_y, 0), (1, 0, 0), 0.5, 'hazard', mirror=True)
    if lit_rails:
        # Identity trim, lit: a thin sodium line down each black rail cap between the hazard ends, so the
        # open truss reads as two lit rails at the chase camera (LOOK.md: lamps are light).
        F.band(s, 'RailCap', (cx_mid, rail_y, 0), (0, 1, 0), 0.08, 'glow_cyan.sodium', facing=(0, 0, 1),
               min_facing=0.5, mirror=True, inset=0.004, depth=-0.01,
               region=(('x', FRAME_X0 + 0.85, FRAME_X1 - 0.85),))
    ties = [FRAME_X0 + 0.3] + [b for b in bays] + [FRAME_X1 - 0.3]
    for i, x in enumerate(ties):
        F.box(s, f'Tie{i}', (x, 0.0, RAIL_Z), (0.26, rail_y * 2, 0.36), material='gunmetal', bevel=0.02)
    for i in range(len(ties) - 1):
        xa, xb = ties[i], ties[i + 1]
        cx, lx = (xa + xb) / 2, (xb - xa)
        ang = math.atan2(rail_y * 2, lx)
        diag = math.hypot(lx, rail_y * 2) - 0.2
        F.box(s, f'BraceA{i}', (cx, 0.0, RAIL_Z - 0.08), (diag, 0.12, 0.16), material='dark', rot_z=ang, bevel=0.01)
        F.box(s, f'BraceB{i}', (cx, 0.0, RAIL_Z - 0.08), (diag, 0.12, 0.16), material='dark', rot_z=-ang, bevel=0.01)
    F.cylinder(s, 'KeelTube', (FRAME_X0 - 0.4, 0.0, -0.35), (FRAME_X1 + 0.2, 0.0, -0.35), 0.32, material='paint2',
               segments=24)
    for x in (FRAME_X0 + 0.3, 0.6, FRAME_X1 - 0.3):
        F.box(s, f'KeelStrut{x:.1f}', (x, 0.0, -0.05), (0.22, 0.3, 0.6), material='gunmetal')


def build_engine(s, x_front=-4.4, ew=1.55, detail_pipes=True):
    """Exposed engine block (half-width ew): a black box with tank cylinders on top, two hot drives aft."""
    F.box(s, 'EngineBlock', (x_front - 1.5, 0.0, 0.15), (3.2, ew * 2, 1.5), material='paint2', bevel=0.05)
    F.band(s, 'EngineBlock', (x_front - 0.35, 0, 0), (1, 0, 0), 0.26, 'hazard', inset=0.015, depth=0.02)
    F.band(s, 'EngineBlock', (x_front - 0.75, 0, 0), (1, 0, 0), 0.26, 'hazard', inset=0.015, depth=0.02)
    ty = ew * 0.47
    F.cylinder(s, 'Tank', (x_front - 2.9, ty, 0.95), (x_front - 0.5, ty, 0.95), 0.42 * ew / 1.3, material='gunmetal',
               mirror=True, segments=28, cap_material='dark')
    for x in (x_front - 2.4, x_front - 1.0):
        F.box(s, f'TankStrap{x:.1f}', (x, 0.0, 0.93 + 0.1 * (ew - 1.3)), (0.14, ew * 1.55, 0.3), material='dark',
              bevel=0.01)
    dy, dr = ew * 0.55, 0.62 * ew / 1.3
    F.nozzle(s, 'Drive', (x_front - 4.3, dy, 0.1), dr, 1.3, material='gunmetal', mirror=True)
    F.cylinder(s, 'HeatSeam', (x_front - 3.14, dy, 0.1), (x_front - 3.04, dy, 0.1), dr * 1.13, material='glow_drive',
               mirror=True, segments=36)
    s.hook('HOOK_DRIVE_CORE', (x_front - 4.2, 0.0, 0.1))
    if detail_pipes:
        s.detail = 1
        F.vent(s, 'EngineVent', (x_front - 1.7, 0.0, 0.92), (1.0, 0.5, 0.1), axis='y')
        F.cylinder(s, 'ExhaustPipe', (x_front - 2.9, ew + 0.04, 0.4), (x_front + 0.6, ew - 0.2, 0.4), 0.08,
                   material='bare', mirror=True, segments=12)
        F.rcs(s, 'EngineRCS', (x_front - 2.6, ew + 0.12, 0.0), size=0.34, mirror=True)
        s.detail = 0


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_frame(s)
    build_engine(s)

    # Cobbled plates: salvaged oxide and black panels bolted over some bays, a little askew.
    F.box(s, 'PlateA', (-3.0, 0.1, 0.56), (1.9, 2.3, 0.1), material='paint', rot_z=0.04, bevel=0.03)
    F.box(s, 'PlateB', (-1.2, -0.3, 0.56), (1.0, 1.7, 0.09), material='paint2', rot_z=-0.07, bevel=0.03)
    F.box(s, 'PlateC', (1.3, 0.15, 0.56), (1.5, 2.2, 0.1), material='paint', rot_z=-0.03, bevel=0.03)
    F.band(s, 'PlateA', (-3.0, 0, 0), (1, 0, 0), 0.22, 'stripe', facing=(0, 0, 1))
    F.panel(s, 'PlateC', (1.3, 0.15), (0.6, 0.9), 'dark', inset=0.03, depth=-0.03)
    F.box(s, 'PatchD', (3.0, -0.35, 0.56), (0.9, 1.1, 0.08), material='paint', rot_z=0.09, bevel=0.03)

    # Claw head: the grapple's black housing, hazard-banded, at the nose of the spine.
    F.plate(s, 'ClawHead', [(4.6, -1.5), (6.3, -1.15), (6.8, 0.0), (6.3, 1.15), (4.6, 1.5)], z0=-0.4,
            thickness=1.2, material='paint2', chamfer=0.25, chamfer_bottom=0.15, side_material='gunmetal')
    F.band(s, 'ClawHead', (5.3, 0, 0), (1, 0, 0), 0.3, 'hazard', facing=(0, 0, 1), min_facing=0.3)
    F.cylinder(s, 'ClawPivot', (5.9, 1.42, 0.2), (5.9, -1.42, 0.2), 0.32, material='gunmetal', segments=24)
    # Two hooked jaws, open. Oxide with hazard tips and honed steel teeth on the inner edge.
    jaw = [(5.8, 0.85), (7.2, 1.6), (8.5, 1.6), (9.25, 1.1), (9.65, 1.25), (8.95, 2.25), (7.3, 2.5), (5.6, 1.7)]
    F.plate(s, 'Jaw', jaw, z0=-0.1, thickness=0.55, material='paint', chamfer=0.16, chamfer_bottom=0.08,
            mirror=True, side_material='paint2')
    for x in (8.6, 9.0):
        F.band(s, 'Jaw', (x, 1.7, 0), (0.85, 0.5, 0), 0.2, 'hazard', facing=(0, 0, 1), mirror=True, min_facing=0.3)
    F.plate(s, 'JawTeeth', [(7.2, 1.5), (8.5, 1.5), (9.2, 1.02), (9.35, 1.15), (8.55, 1.7), (7.2, 1.7)],
            z0=0.02, thickness=0.3, material='bare', chamfer=0.05, mirror=True)
    F.cylinder(s, 'JawRam', (4.9, 1.25, 0.55), (7.1, 1.95, 0.55), 0.12, material='bare', mirror=True, segments=14)

    # Tether winch: a big drum hung off the starboard rail, cable running forward to the claw head.
    F.cylinder(s, 'Drum', (0.9, -1.35, 0.3), (0.9, -2.75, 0.3), 0.72, material='dark', segments=32)
    F.cylinder(s, 'DrumFlangeIn', (0.9, -1.3, 0.3), (0.9, -1.45, 0.3), 0.95, material='hazard', segments=32)
    F.cylinder(s, 'DrumFlangeOut', (0.9, -2.65, 0.3), (0.9, -2.83, 0.3), 0.95, material='paint2', segments=32)
    F.cylinder(s, 'DrumHub', (0.9, -2.83, 0.3), (0.9, -2.93, 0.3), 0.3, material='hazard', segments=20)
    for i in range(5):
        y = -1.6 - i * 0.24
        F.cylinder(s, f'Wrap{i}', (0.9, y, 0.3), (0.9, y - 0.14, 0.3), 0.78, material='gunmetal', segments=32)
    F.box(s, 'DrumMount', (0.9, -1.35, 0.05), (1.3, 0.4, 0.5), material='gunmetal')
    F.cylinder(s, 'Tether', (0.9, -2.05, 1.08), (5.0, -0.8, 0.75), 0.06, material='bare', segments=10)
    F.box(s, 'Fairlead', (5.0, -0.8, 0.72), (0.4, 0.3, 0.24), material='gunmetal')

    # Crew cab bolted to the port rail: a faceted oxide pod, lit windows, a dark glass brow.
    cy = 2.15
    F.loft(s, 'Cab', [
        dict(x=1.6, w=0.7, ht=0.62, hb=0.5, zc=0.4, n=2.4, y=cy),
        dict(x=2.2, w=0.85, ht=0.8, hb=0.55, zc=0.4, n=2.4, y=cy),
        dict(x=4.0, w=0.8, ht=0.72, hb=0.5, zc=0.38, n=2.4, y=cy),
        dict(x=4.8, w=0.5, ht=0.42, hb=0.36, zc=0.3, n=2.2, y=cy),
        dict(x=5.0, w=0.22, ht=0.2, hb=0.15, zc=0.28, n=2.2, y=cy),
    ], material='paint', belly='paint2', back_material='dark', count=16, smooth_angle=20)
    F.band(s, 'Cab', (3.0, 0, 0), (1, 0, 0), 0.16, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    F.canopy(s, 'CabGlass', x0=3.0, x1=4.6, w=0.45, h=0.3, z=0.84, y=cy, peak=0.5)
    F.windows(s, 'CabWin', 2.0, 3.6, cy + 0.84, 0.5, 3, size=(0.34, 0.16))
    F.box(s, 'CabArm', (3.0, 1.55, 0.3), (1.2, 0.6, 0.3), material='gunmetal')

    s.detail = 1
    F.antenna(s, 'Mast', (2.6, cy + 0.2, 1.15), 0.9, tip='glow_amber')
    F.rcs(s, 'CabRCS', (4.0, cy + 0.8, 0.3), size=0.26)
    F.box(s, 'JunkBox', (-0.2, 0.2, 0.62), (0.7, 0.5, 0.35), material='gunmetal', rot_z=0.12)
    s.detail = 0

    # Lights: claw work-lamps (sodium), nav at the extremities, beacon on the engine block.
    F.light(s, 'ClawLamp', (6.0, 0.75, 0.8), 'glow_amber', size=0.2, mirror=True)
    F.light(s, 'NavPort', (3.0, cy + 0.88, 0.62), 'glow_red', size=0.15)
    F.light(s, 'NavStarboard', (0.9, -2.97, 0.3), 'glow_green', size=0.15)
    F.light(s, 'Beacon', (-4.6, 0.0, 0.92), 'glow_amber', size=0.16)
    F.light(s, 'RailLamp', (-4.3, RAIL_Y + 0.19, 0.3), 'glow_warm', size=0.14, mirror=True)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
