"""Atlas — tier-3 player heavy hauler. "Crane-spine hauler with container racks."

Plan read at the chase camera: a long navy spine carrying three container stacks per side, each held
in a gunmetal clamp frame, an orange gantry crane spanning the cargo like a cross-bar, a lit command
cab out front and a massive four-nozzle drive block aft, with a docking collar and clamp jaws on the
spine nose. Three values: light steel containers, navy spine and cab, dark machinery; safety orange
carried in bands, clamp pads and the crane.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402
import math  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

SHIP_ID = 'atlas'
COLORS = {
    'paint': '#283648',          # navy blue-grey (brief #34465a, authored darker: the key light lifts ~2.5x)
    'paint2': '#565c64',         # steel containers
    'paint2.orange': '#5e2a12',  # the odd orange box in the stack
    'paint2.navy': '#2e3c4c',    # and the odd navy one
    'stripe': '#b0501a',         # safety orange (brief #c05a1c)
    'hazard': '#b0501a',
    'dark': '#171a1e',
    'glow_cyan.orange': '#ff7a1e',  # safety orange, lit: the spine line
}

ROWS = (4.1, 0.0, -4.1)      # container stack centres along X
CY, CW, CL, CH = 2.2, 2.3, 3.7, 1.25   # container centre Y, width, length, height


# Close-zoom hero detail (Workflow C): every part is seated on the real skin of the part it sits on,
# found by dropping a ray onto the built (pre-bevel) mesh, so nothing floats and nothing clips.
def _hit(name, x, y, z=40.0):
    o = bpy.data.objects.get(name)
    ok, loc, nrm, _ = o.ray_cast(Vector((x, y, z)), Vector((0.0, 0.0, -1.0)))
    return (loc, nrm) if ok else None


def _studs(name, pts, nz=0.55, lift=0.05, sink=0.03):
    """Fastener rods standing on part `name` at plan points, along the skin normal (one mesh via F.beams)."""
    out = []
    for x, y in pts:
        h = _hit(name, x, y)
        if h and h[1].z > nz:
            out.append((tuple(h[0] - h[1] * sink), tuple(h[0] + h[1] * lift)))
    return out


def _run(name, pts, lift):
    """A pipe/cable path hugging part `name`: plan points lifted `lift` above the skin."""
    zs = [_hit(name, x, y) for x, y in pts]
    return [(x, y, h[0].z + lift) for (x, y), h in zip(pts, zs) if h]


def _hatch(part, cx, cy, sx, sy, lift=0.0):
    """Access hatch on part: (coaming struts hugging the skin, handle strut)."""
    c = [(cx - sx / 2, cy - sy / 2), (cx + sx / 2, cy - sy / 2), (cx + sx / 2, cy + sy / 2), (cx - sx / 2, cy + sy / 2)]
    lp = _run(part, [c[0], c[1], c[2], c[3], c[0]], lift)
    hp = _run(part, [(cx, cy - sy * 0.22), (cx, cy + sy * 0.22)], 0.045 + lift)
    return [(lp[i], lp[i + 1]) for i in range(len(lp) - 1)], (hp[0], hp[1])


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- spine: long navy keel beam with orange frame bands ----------------------------------------
    F.loft(s, 'Spine', [
        dict(x=-8.6, w=0.95, ht=0.95, hb=0.95, zc=0.1, n=4.0),
        dict(x=-8.3, w=1.0, ht=1.0, hb=1.0, zc=0.1, n=4.5),
        dict(x=7.0, w=1.0, ht=1.0, hb=1.0, zc=0.1, n=4.5),
        dict(x=7.3, w=0.95, ht=0.95, hb=0.95, zc=0.1, n=4.0),
    ], material='paint', count=32)
    for x in (6.35, 2.05, -2.05, -6.2):
        F.band(s, 'Spine', (x, 0, 0), (1, 0, 0), 0.34, 'stripe', inset=0.015, depth=0.03)
    # crane rails along the spine roof
    F.box(s, 'Rail', (-0.6, 0.62, 1.16), (13.8, 0.14, 0.12), material='bare', mirror=True, bevel=0.01)
    F.panel(s, 'Spine', (-0.6, 0.0), (13.0, 0.8), 'dark', inset=0.03, depth=-0.04)
    # Identity trim, lit: one thin safety-orange line down the spine channel between the racks,
    # crossed by the crane -- the hauler's backbone read by its light (LOOK.md: lamps are light).
    F.band(s, 'Spine', (0, 0, 0), (0, 1, 0), 0.1, 'glow_cyan.orange', facing=(0, 0, 1), min_facing=0.6,
           region=(('x', -7.8, 5.9),))

    # --- container stacks in clamp frames, two high, three per side --------------------------------
    odd = {(0, 1): 'paint2.orange', (2, -1): 'paint2.orange', (1, -1): 'paint2.navy'}
    for i, x in enumerate(ROWS):
        for side in (1, -1):
            y = CY * side
            for level, z in enumerate((-0.62, 0.7)):
                fin = odd.get((i, side), 'paint2') if level == 1 else 'paint2'
                F.container(s, f'Box{i}{side}{level}', (x, y, z), (CL, CW, CH), finish=fin, ribs=4)
            # clamp frame: two bars over the top of the stack, outer posts, orange clamp pads
            for e in (-1, 1):
                bx = x + e * (CL / 2 - 0.35)
                F.box(s, f'ClampBar{i}{side}{e}', (bx, y * 0.98, 1.42), (0.34, CW + 0.95, 0.22), material='gunmetal',
                      bevel=0.03)
                F.box(s, f'ClampPost{i}{side}{e}', (bx, side * (CY + CW / 2 + 0.14), 0.05), (0.34, 0.2, 2.9),
                      material='gunmetal', bevel=0.03)
                F.box(s, f'ClampPad{i}{side}{e}', (bx, side * (CY + CW / 2 + 0.14), 1.3), (0.44, 0.28, 0.34),
                      material='hazard', bevel=0.02)
            F.box(s, f'Cradle{i}{side}', (x, y, -1.35), (CL + 0.2, CW * 0.6, 0.2), material='gunmetal', bevel=0.02)
            F.box(s, f'Strut{i}{side}', (x, side * 1.1, -1.0), (0.5, 1.4, 0.6), material='gunmetal', bevel=0.02)

    # --- gantry crane: orange bridge riding the spine rails, spanning both racks -------------------
    GX = -2.05
    crane = [
        F.box(s, 'CraneTower', (GX, 0.0, 1.9), (0.9, 1.5, 1.4), material='hazard', bevel=0.04),
        F.box(s, 'CraneBeam', (GX, 0.0, 2.72), (0.5, 7.4, 0.42), material='hazard', bevel=0.03),
        F.box(s, 'CraneCab', (GX + 0.55, 0.45, 2.1), (0.5, 0.6, 0.5), material='paint', bevel=0.03),
    ]
    for k, y in enumerate((-3.0, -2.2, -1.4, 1.4, 2.2, 3.0)):
        F.band(s, 'CraneBeam', (GX, y, 0), (0.6, 0.8, 0), 0.26, 'dark', facing=(0, 0, 1), min_facing=0.5)
    crane.append(F.light(s, 'CraneCabWin', (GX + 0.81, 0.45, 2.18), 'glow_warm', size=0.2))
    for side in (1, -1):
        crane.append(F.box(s, f'CraneTrolley{side}', (GX, side * 2.4, 2.46), (0.8, 0.7, 0.3), material='gunmetal',
                           bevel=0.02))
    s.hook_part('HOOK_SECONDARY_CRANE', *crane)

    # --- command cab forward -----------------------------------------------------------------------
    F.loft(s, 'Cab', [
        dict(x=6.8, w=1.35, ht=1.15, hb=1.05, zc=0.35, n=3.2),
        dict(x=7.4, w=1.75, ht=1.4, hb=1.1, zc=0.35, n=3.4),
        dict(x=10.2, w=1.8, ht=1.4, hb=1.1, zc=0.35, n=3.4),
        dict(x=11.2, w=1.55, ht=1.05, hb=0.95, zc=0.3, n=3.0),
        dict(x=11.7, w=1.1, ht=0.55, hb=0.7, zc=0.25, n=2.6),
    ], material='paint', count=48)
    F.band(s, 'Cab', (11.15, 0, 1.2), (1, 0, 0), 0.8, 'glass', facing=(1, 0, 0.5), min_facing=0.3)
    F.band(s, 'Cab', (8.1, 0, 0), (1, 0, 0), 0.34, 'stripe', inset=0.015, depth=0.02)
    F.panel(s, 'Cab', (9.3, 0.0), (1.6, 2.0), 'paint', inset=0.05, depth=0.05)
    F.windows(s, 'CabWin', 8.6, 10.6, 1.78, 0.75, 4, size=(0.4, 0.22), mirror=True)
    F.box(s, 'CabChin', (10.9, 0.0, -0.75), (1.4, 1.8, 0.4), material='dark', bevel=0.03)

    # sensor mast on the cab roof (sensor damage part)
    ped = F.box(s, 'MastFoot', (8.9, 0.0, 1.78), (0.5, 0.5, 0.2), material='gunmetal', bevel=0.02)
    mast = F.cylinder(s, 'Mast', (8.9, 0.0, 1.8), (8.9, 0.0, 2.9), 0.06, 0.035, material='gunmetal', segments=10)
    arm = F.box(s, 'MastArm', (8.9, 0.0, 2.55), (0.1, 1.2, 0.08), material='gunmetal', bevel=0.0)
    beacon = F.light(s, 'Beacon', (8.9, 0.0, 2.93), 'glow_amber.beacon', size=0.16)
    s.hook_part('HOOK_SENSOR_MAST', ped, mast, arm, beacon)

    # --- docking collar on the spine nose, with three orange clamp jaws -----------------------------
    F.cylinder(s, 'DockCollar', (6.3, 0.0, 1.05), (6.3, 0.0, 1.5), 0.62, material='gunmetal', segments=32,
               cap_material='dark')
    F.cylinder(s, 'DockRing', (6.3, 0.0, 1.5), (6.3, 0.0, 1.6), 0.7, material='hazard', segments=32, cap=False)
    for k, (dx, dy) in enumerate(((0.62, 0.0), (-0.31, 0.54), (-0.31, -0.54))):
        F.box(s, f'DockJaw{k}', (6.3 + dx, dy, 1.62), (0.22, 0.22, 0.3), material='gunmetal', bevel=0.02)

    # --- long-haul propellant tanks either side of the aft spine -----------------------------------
    for y in (1.55, -1.55):
        F.cylinder(s, f'PropTank{y}', (-8.3, y, 0.1), (-6.3, y, 0.1), 0.78, material='paint', segments=40,
                   cap_material='gunmetal')
        F.cylinder(s, f'PropTankBand{y}', (-7.45, y, 0.1), (-7.15, y, 0.1), 0.82, material='stripe', segments=40,
                   cap=False)
        F.box(s, f'PropTankSaddle{y}', (-7.3, y * 0.72, 0.1), (1.4, 0.6, 0.5), material='gunmetal', bevel=0.02)

    # --- drive block: four nozzles in a 2 x 2 frame ------------------------------------------------
    F.box(s, 'DriveBlock', (-9.6, 0.0, 0.1), (2.4, 3.6, 3.0), material='paint', bevel=0.06)
    F.band(s, 'DriveBlock', (-9.6, 0, 0), (1, 0, 0), 0.4, 'stripe', inset=0.02, depth=0.03)
    F.box(s, 'DriveCollar', (-10.9, 0.0, 0.1), (0.3, 3.8, 3.2), material='gunmetal', bevel=0.04)
    for y in (0.9, -0.9):
        for z in (0.85, -0.65):
            F.nozzle(s, f'Nozzle{y}{z}', (-12.0, y, z), 0.66, 1.0, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-11.9, 0.0, 0.1))

    # --- detail ------------------------------------------------------------------------------------
    s.detail = 1
    for y in (1.2, -1.2):
        F.vent(s, f'DriveVent{y}', (-9.6, y, 1.62), (1.4, 0.9, 0.1), slats=5)
    F.rcs(s, 'RCSFwd', (10.0, 1.82, 0.0), size=0.4, mirror=True)
    F.rcs(s, 'RCSAft', (-9.2, 1.86, -0.8), size=0.4, mirror=True)
    F.antenna(s, 'Whip', (-8.8, -1.1, 1.6), 1.2, tip='glow_red')
    for x in (6.0, -6.1):
        F.box(s, f'SpineLamp{x}', (x, 0.0, 1.22), (0.3, 0.3, 0.14), material='gunmetal', bevel=0.02)
    s.detail = 0

    # --- close-zoom hero detail layer (LOD0 only; finishes this hull already draws) ----------------
    bpy.context.view_layer.update()
    s.detail = 2
    studs, bolts = [], []
    frames, handles = [], []
    for i, x in enumerate(ROWS):
        for side in (1, -1):
            # one access hatch on each stack-top container, between its two clamp bars
            fr, hd = _hatch(f'Box{i}{side}1', x, side * CY, 0.62, 0.9)
            frames += fr
            handles.append(hd)
            # clamp bars bolted down where they cross the stack top
            for e in (-1, 1):
                bolts += _studs(f'ClampBar{i}{side}{e}', [(x + e * (CL / 2 - 0.35), side * CY * 0.98 + dy) for dy in (-1.0, 0.0, 1.0)])
    # command cab: roof course bolted, two roof hatches, mullions across the windscreen
    studs += _studs('Cab', [(x, sg * 0.88) for x in (8.64, 9.3, 9.96) for sg in (1, -1)])
    for cy in (0.55, -0.55):
        fr, hd = _hatch('Cab', 9.6, cy, 0.6, 0.5)
        frames += fr
        handles.append(hd)
    mull = []
    for y in (-0.9, -0.3, 0.3, 0.9):
        a, b = _hit('Cab', 10.8, y), _hit('Cab', 11.5, y)
        if a and b:
            mull.append(((10.8, y, a[0].z + 0.03), (11.5, y, b[0].z + 0.03)))
    F.beams(s, 'WindscreenMullions', mull, 0.09, material='gunmetal', h=0.07)
    # drive block lip bolted; docking collar bolt circle
    studs += _studs('DriveBlock', [(x, sg * 1.55) for x in (-10.5, -8.7) for sg in (1, -1)])
    studs += _studs('DockCollar', [(6.3 + 0.35 * math.cos(2 * math.pi * k / 6), 0.35 * math.sin(2 * math.pi * k / 6)) for k in range(6)])
    # propellant tank straps
    for y in (1.55, -1.55):
        for x in (-7.9, -6.7):
            F.cylinder(s, f'TankStrap{y}{x}', (x - 0.05, y, 0.1), (x + 0.05, y, 0.1), 0.81, material='gunmetal', segments=40,
                       cap=False)
    F.beams(s, 'HullStuds', studs, 0.11, material='gunmetal')
    F.beams(s, 'ClampBolts', bolts, 0.12, material='bare')
    F.beams(s, 'HatchComing', frames, 0.06, material='dark')
    F.beams(s, 'HatchHandle', handles, 0.05, material='gunmetal')
    s.detail = 0

    # --- lights ------------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-5.6, CY + CW / 2 + 0.34, 1.3), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (-5.6, -(CY + CW / 2 + 0.34), 1.3), 'glow_green', size=0.2)
    F.light(s, 'NavPortFwd', (11.0, 1.45, 0.6), 'glow_red', size=0.14)
    F.light(s, 'NavStarboardFwd', (11.0, -1.45, 0.6), 'glow_green', size=0.14)
    F.light(s, 'BeaconAft', (-9.6, 0.0, 1.66), 'glow_amber.beacon', size=0.18)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
