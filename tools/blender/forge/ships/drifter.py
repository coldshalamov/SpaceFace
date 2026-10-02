"""Drifter — tier-2 player multirole. A rugged frontier scout-hauler.

Plan read at the chase camera: deliberately lopsided. A weathered-teal hull with its cockpit offset
to port; a copper gun arm with a twin turret out to port, a ribbed cargo bay slung to starboard, twin
drive nacelles aft, a drill spike under the nose. A few hull plates are patched in other paint —
the ship has been repaired out where there are no yards.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

SHIP_ID = 'drifter'
COLORS = {
    'paint': '#1f3a38',          # weathered teal (#3f6e6a as seen: the key light lifts value and chroma)
    'paint2': '#56331f',         # copper (#8a5a3a as seen)
    'stripe': '#56331f',
    'hazard': '#b88a22',
    'dark': '#121416',
    'paint.patch': '#3d5058',    # a replacement plate in a sun-faded blue-grey
    'paint.primer': '#57554e',   # an unpainted primer-grey patch
    'glow_cyan.copper': '#ff8a3c',  # the copper livery rings, lit
}

NY = 2.15  # nacelle centre lines


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


def _rim(cx, cy, sx, sy, inset=0.12, pitch=0.45, skip=()):
    """Rivet points round a patch plate: along its perimeter, `inset` in from the edge, minus obstacles."""
    x0, x1, y0, y1 = cx - sx / 2 + inset, cx + sx / 2 - inset, cy - sy / 2 + inset, cy + sy / 2 - inset
    nx, ny = max(1, round((x1 - x0) / pitch)), max(1, round((y1 - y0) / pitch))
    pts = [(x0 + (x1 - x0) * i / nx, y) for i in range(nx + 1) for y in (y0, y1)]
    pts += [(x, y0 + (y1 - y0) * j / ny) for j in range(1, ny) for x in (x0, x1)]
    return [p for p in pts if all((p[0] - ox) ** 2 + (p[1] - oy) ** 2 > 0.35 ** 2 for ox, oy in skip)]


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Hull -----------------------------------------------------------------------------------
    F.loft(s, 'Hull', [
        dict(x=-7.6, w=0.9, ht=0.8, hb=0.7, zc=0.1, n=2.6),
        dict(x=-6.8, w=1.35, ht=1.1, hb=0.9, zc=0.1, n=2.8),
        dict(x=-2.0, w=1.6, ht=1.25, hb=1.0, zc=0.1, n=2.8),
        dict(x=3.0, w=1.45, ht=1.1, hb=0.9, zc=0.1, n=2.7),
        dict(x=6.5, w=1.0, ht=0.8, hb=0.7, zc=0.05, n=2.5),
        dict(x=8.3, w=0.5, ht=0.45, hb=0.4, zc=0.0, n=2.3),
        dict(x=8.9, w=0.12, ht=0.12, hb=0.12, zc=0.0, n=2.0),
    ], material='paint', belly='gunmetal', back_material='dark', count=64)
    F.band(s, 'Hull', (7.3, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.02, depth=0.02)
    F.band(s, 'Hull', (-5.2, 0, 0), (1, 0, 0), 0.4, 'stripe', inset=0.02, depth=0.02)
    # Identity trim, lit: one thin copper ring beside each livery ring (nose collar, tail collar),
    # so the lopsided hull still reads as one ship by its lights (LOOK.md: lamps are light).
    F.band(s, 'Hull', (6.85, 0, 0), (1, 0, 0), 0.14, 'glow_cyan.copper', inset=0.01, depth=-0.02)
    F.band(s, 'Hull', (-4.8, 0, 0), (1, 0, 0), 0.14, 'glow_cyan.copper', inset=0.01, depth=-0.02)
    # Patched plates: the jack-of-all-trades has been fixed wherever it broke.
    F.panel(s, 'Hull', (-3.2, 0.35), (1.7, 1.1), 'paint.patch', inset=0.04, depth=0.06)
    F.panel(s, 'Hull', (0.9, -0.55), (1.3, 0.8), 'paint2', inset=0.04, depth=0.05)
    F.panel(s, 'Hull', (-1.3, -0.4), (1.2, 0.9), 'paint', inset=0.04, depth=0.03)
    F.panel(s, 'Hull', (4.6, -0.45), (1.0, 0.6), 'paint.primer', inset=0.03, depth=0.03)
    F.panel(s, 'Hull', (2.6, -0.7), (1.6, 0.5), 'dark', inset=0.03, depth=-0.03)

    # --- Offset cockpit (port shoulder) -------------------------------------------------------------
    CY = 0.78
    F.loft(s, 'CockpitHump', [
        dict(x=1.6, w=0.15, ht=0.1, hb=0.6, zc=1.0, n=2.4, y=CY),
        dict(x=2.5, w=0.64, ht=0.45, hb=0.6, zc=0.92, n=2.6, y=CY),
        dict(x=4.6, w=0.62, ht=0.4, hb=0.6, zc=0.8, n=2.6, y=CY),
        dict(x=6.2, w=0.42, ht=0.25, hb=0.5, zc=0.62, n=2.4, y=CY),
        dict(x=7.0, w=0.1, ht=0.05, hb=0.3, zc=0.6, n=2.2, y=CY),
    ], material='paint2', count=48)
    F.loft(s, 'Canopy', [
        dict(x=2.8, w=0.1, ht=0.05, hb=0.02, zc=1.3, n=2.2, y=CY),
        dict(x=3.4, w=0.4, ht=0.25, hb=0.02, zc=1.25, n=2.4, y=CY),
        dict(x=4.6, w=0.46, ht=0.28, hb=0.02, zc=1.15, n=2.4, y=CY),
        dict(x=5.6, w=0.36, ht=0.2, hb=0.02, zc=0.98, n=2.3, y=CY),
        dict(x=6.1, w=0.07, ht=0.04, hb=0.02, zc=0.85, n=2.2, y=CY),
    ], material='glass', count=24, bevel=0.0, smooth_angle=60.0)

    # --- Port gun arm with a twin turret ---------------------------------------------------------------
    F.plate(s, 'GunArm', [(2.6, 1.2), (1.2, 3.45), (-2.2, 3.45), (-3.0, 1.2)], z0=-0.15, thickness=0.4,
            material='paint2', chamfer=0.2, chamfer_bottom=0.08, side_material='gunmetal')
    F.panel(s, 'GunArm', (-1.9, 2.4), (0.9, 1.3), 'paint.primer', inset=0.03, depth=0.03)
    F.cylinder(s, 'TurretRing', (-0.3, 2.45, 0.1), (-0.3, 2.45, 0.52), 0.66, material='gunmetal', segments=32)
    F.box(s, 'TurretHead', (-0.2, 2.45, 0.72), (1.4, 1.05, 0.45), material='paint', bevel=0.07, taper=0.85)
    F.box(s, 'Mantlet', (0.6, 2.45, 0.72), (0.35, 0.82, 0.36), material='gunmetal', bevel=0.03)
    for y in (2.25, 2.65):
        F.cylinder(s, f'TurretGun{y}', (0.6, y, 0.72), (3.4, y, 0.72), 0.085, material='gunmetal', cap_material='dark')
        F.cylinder(s, f'TurretMuzzle{y}', (3.1, y, 0.72), (3.5, y, 0.72), 0.12, material='dark')

    # --- Starboard cargo bay ---------------------------------------------------------------------------
    BY = -2.35
    F.box(s, 'Bay', (-1.3, BY, 0.1), (6.4, 2.1, 1.7), material='paint', bevel=0.1)
    F.panel(s, 'Bay', (-0.6, BY), (3.6, 1.5), 'paint2', inset=0.05, depth=0.04)
    F.panel(s, 'Bay', (-0.6, BY), (3.2, 1.15), 'dark', inset=0.03, depth=-0.03)
    F.panel(s, 'Bay', (-3.4, BY - 0.2), (1.1, 1.1), 'paint.patch', inset=0.04, depth=0.035)
    for i, x in enumerate((-4.35, 1.75)):
        F.box(s, f'BayFrame{i}', (x, BY, 0.1), (0.2, 2.18, 1.78), material='gunmetal', bevel=0.02)
    for i, x in enumerate((-1.95, 0.75)):
        F.box(s, f'DoorHinge{i}', (x, BY - 0.02, 0.97), (0.16, 1.5, 0.08), material='gunmetal', bevel=0.0)
    F.band(s, 'Bay', (1.2, 0, 0), (1, 0, 0), 0.3, 'hazard', facing=(0, 0, 1))
    # Little cargo crane on the bay's aft corner.
    F.cylinder(s, 'CranePost', (-3.8, BY - 0.55, 0.9), (-3.8, BY - 0.55, 1.75), 0.16, material='gunmetal', segments=16)
    F.box(s, 'CraneBoom', (-2.75, BY - 0.25, 1.8), (2.4, 0.18, 0.18), material='hazard', bevel=0.02, rot_z=0.28)
    F.cylinder(s, 'CraneHook', (-1.6, BY + 0.08, 1.72), (-1.6, BY + 0.08, 1.2), 0.03, material='gunmetal', segments=8)
    F.box(s, 'CraneBlock', (-1.6, BY + 0.08, 1.18), (0.16, 0.16, 0.14), material='dark', bevel=0.01)
    F.box(s, 'BayYoke', (-1.3, -1.35, -0.25), (4.0, 0.8, 0.7), material='gunmetal', bevel=0.04)

    # --- Drives: twin nacelles on winglets plus a central core -------------------------------------------
    F.plate(s, 'Winglet', [(-3.3, 1.1), (-4.5, NY + 0.3), (-7.2, NY + 0.3), (-6.9, 1.1)], z0=-0.12, thickness=0.28,
            material='paint2', chamfer=0.12, mirror=True, side_material='gunmetal')
    F.loft(s, 'Nacelle', [
        dict(x=-8.3, w=0.55, ht=0.55, hb=0.55, zc=0.05, n=2.3, y=NY),
        dict(x=-7.8, w=0.66, ht=0.66, hb=0.66, zc=0.05, n=2.4, y=NY),
        dict(x=-4.8, w=0.64, ht=0.64, hb=0.64, zc=0.05, n=2.4, y=NY),
        dict(x=-4.0, w=0.42, ht=0.42, hb=0.42, zc=0.05, n=2.2, y=NY),
        dict(x=-3.7, w=0.12, ht=0.12, hb=0.12, zc=0.05, n=2.0, y=NY),
    ], material='paint', back_material='dark', count=48, mirror=True)
    F.band(s, 'Nacelle', (-6.0, NY, 0), (1, 0, 0), 0.35, 'stripe', inset=0.02, depth=0.02, mirror=True)
    F.nozzle(s, 'NacNozzle', (-9.0, NY, 0.05), 0.52, 0.75, material='gunmetal', mirror=True)
    F.nozzle(s, 'CoreNozzle', (-8.3, 0.0, 0.1), 0.6, 0.8, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-8.4, 0.0, 0.1))
    # Scorched ring on the port nozzle collar: wear modelled, not painted.
    F.cylinder(s, 'ScorchRing', (-8.45, NY, 0.05), (-8.25, NY, 0.05), 0.6, material='dark', cap=False, segments=32)

    # --- Rear gun and nose drill -------------------------------------------------------------------------
    F.cylinder(s, 'RearRing', (-5.9, 0.0, 1.0), (-5.9, 0.0, 1.3), 0.45, material='gunmetal', segments=28)
    F.box(s, 'RearHead', (-6.1, 0.0, 1.45), (0.8, 0.62, 0.34), material='paint2', bevel=0.05, taper=0.85)
    F.cylinder(s, 'RearGun', (-6.4, 0.0, 1.45), (-8.2, 0.0, 1.45), 0.08, material='gunmetal', cap_material='dark')
    F.box(s, 'DrillBracket', (6.9, 0.0, -0.55), (1.4, 0.7, 0.5), material='gunmetal', bevel=0.04, taper=0.9)
    F.cylinder(s, 'DrillCollar', (7.4, 0.0, -0.58), (7.9, 0.0, -0.58), 0.36, material='paint2', cap_material='dark')
    F.cylinder(s, 'Drill', (7.9, 0.0, -0.58), (9.6, 0.0, -0.58), 0.3, 0.03, material='bare', segments=24)

    # Scout dish on the dorsal, behind the cockpit.
    F.cylinder(s, 'DishPost', (-0.9, -0.35, 1.2), (-0.9, -0.35, 1.72), 0.12, 0.09, material='gunmetal', segments=12)
    F.cylinder(s, 'Dish', (-0.82, -0.35, 1.75), (-1.0, -0.35, 1.9), 0.62, 0.68, material='gunmetal', segments=28)
    F.cylinder(s, 'DishFace', (-0.99, -0.35, 1.89), (-1.03, -0.35, 1.93), 0.42, material='dark', segments=24)
    F.cylinder(s, 'DishHorn', (-0.98, -0.35, 1.88), (-1.2, -0.35, 2.25), 0.04, 0.025, material='gunmetal', segments=8)
    F.light(s, 'DishFeed', (-1.21, -0.35, 2.27), 'glow_cyan', size=0.08)

    s.detail = 1
    F.vent(s, 'Vent', (-4.8, -0.6, 1.1), (1.2, 0.5, 0.1))
    F.vent(s, 'SpineVent', (-1.6, 0.55, 1.28), (1.4, 0.4, 0.1))
    F.rcs(s, 'RCS', (1.6, -1.35, 0.55), size=0.3)
    F.rcs(s, 'RCSArm', (0.9, 3.4, 0.1), size=0.3)
    F.antenna(s, 'Mast', (-2.4, -0.7, 1.3), 1.1, tip='glow_red')
    F.sensor_dome(s, 'Dome', (1.2, -0.6, 1.2), 0.28)
    F.windows(s, 'CockpitSide', 3.2, 5.4, CY + 0.76, 1.08, 3, size=(0.3, 0.16))
    F.light(s, 'BayLamp', (1.85, BY - 0.7, 0.7), 'glow_warm', size=0.14)
    F.light(s, 'BayLamp2', (1.85, BY + 0.7, 0.7), 'glow_warm', size=0.14)
    s.detail = 0
    F.light(s, 'NavPort', (-2.1, 3.52, 0.12), 'glow_red', size=0.14)
    F.light(s, 'NavStarboard', (-4.3, BY - 1.1, 0.5), 'glow_green', size=0.14)
    F.light(s, 'Beacon', (-3.6, 0.0, 1.38), 'glow_amber', size=0.13)

    # --- close-zoom hero detail layer (LOD0 only; gunmetal and dark, finishes this hull already draws) ----
    bpy.context.view_layer.update()
    s.detail = 2
    studs = []
    under_parts = ((-0.9, -0.35), (1.2, -0.6))   # scout dish post and sensor dome stand on the hull plates
    # the patched plates are riveted down
    for cx, cy, sx, sy in ((-3.2, 0.35, 1.7, 1.1), (0.9, -0.55, 1.3, 0.8), (-1.3, -0.4, 1.2, 0.9), (4.6, -0.45, 1.0, 0.6)):
        studs += _studs('Hull', _rim(cx, cy, sx, sy, skip=under_parts))
    studs += _studs('GunArm', _rim(-1.9, 2.4, 0.9, 1.3))
    studs += _studs('Bay', _rim(-3.4, BY - 0.2, 1.1, 1.1))
    # livery rings carry a stud row; the gun arm is fastened along its outer edge; the bay lid along its rim
    studs += _studs('Hull', [(-5.2, y) for y in (-0.75, -0.35, 0.35, 0.75)] + [(7.3, y) for y in (-0.3, 0.3)], nz=0.4)
    studs += _studs('GunArm', [(x, 3.22) for x in (-1.8, -1.25, 0.6, 1.0)])
    studs += _studs('Bay', [(x, BY + dy) for x in (-2.35, -1.4, 0.15, 1.15) for dy in (-0.68, 0.68)])
    for part, ny in (('Nacelle', NY), ('Nacelle_M', -NY)):
        studs += _studs(part, [(x, ny + dy) for x in (-7.7, -4.9) for dy in (-0.3, 0.0, 0.3)], nz=0.5)
    F.beams(s, 'HullStuds', studs, 0.11, material='gunmetal')

    # cockpit: gunmetal frame arches over the canopy glass
    for x in (3.3, 4.2, 5.0, 5.7):
        zc = 1.3 - (x - 2.8) * 0.19 if x < 4.6 else 1.15 - (x - 4.6) * 0.17
        path = [p for p in _run('Canopy', [(x, CY + dy / 10.0) for dy in range(-5, 6)], 0.02) if p[2] > zc + 0.06]
        if len(path) > 2:
            F.sweep(s, f'CanopyArch{x}', path, 0.1, 0.07, material='gunmetal', bevel=0.0)

    # pipe runs: along the gun-arm root and along the cargo-bay seam, with dark brackets
    pipe = _run('GunArm', [(x, 1.65) for x in (-2.4, -1.4, -0.4, 0.6, 1.6, 2.0)], 0.07)
    F.beams(s, 'ArmPipe', [(pipe[i], pipe[i + 1]) for i in range(len(pipe) - 1)], 0.1, material='gunmetal')
    F.boxes(s, 'ArmBrackets', [((x, 1.65, _hit('GunArm', x, 1.65)[0].z + 0.02), (0.2, 0.3, 0.04)) for x in (-2.0, -0.4, 1.2)],
            material='dark')
    pipe = _run('Bay', [(x, BY + 0.85) for x in (-4.1, -3.0, -1.9, -0.8, 0.3, 1.4, 1.6)], 0.07)
    F.beams(s, 'BayPipe', [(pipe[i], pipe[i + 1]) for i in range(len(pipe) - 1)], 0.1, material='gunmetal')
    F.boxes(s, 'BayBrackets', [((x, BY + 0.85, _hit('Bay', x, BY + 0.85)[0].z + 0.02), (0.2, 0.3, 0.04)) for x in (-3.5, -1.3, 0.9)],
            material='dark')

    # nacelle plate seams (thin dark rings, cut into the skin) and a handle on the dark hull hatch
    for x in (-5.4, -7.0):
        F.band(s, 'Nacelle', (x, NY, 0), (1, 0, 0), 0.05, 'dark', mirror=True)
    hp = _run('Hull', [(2.35, -0.7), (2.85, -0.7)], 0.045)
    F.beams(s, 'HatchHandle', [(hp[0], hp[1])], 0.05, material='gunmetal')
    s.detail = 0

    # --- damage hooks: port turret + bay crane + mast shed, scout dish flickers, winglet lifts ---
    _dmg = {o.name: o for o in s.objects}
    s.hook_part('HOOK_SECONDARY_TURRET', _dmg['TurretRing'], _dmg['TurretHead'], _dmg['Mantlet'],
                _dmg['TurretGun2.25'], _dmg['TurretGun2.65'], _dmg['TurretMuzzle2.25'], _dmg['TurretMuzzle2.65'])
    s.hook_part('HOOK_SECONDARY_CRANE', _dmg['CranePost'], _dmg['CraneBoom'], _dmg['CraneHook'], _dmg['CraneBlock'],
                _dmg['Mast_Mast'], _dmg['Mast_Foot'], _dmg['Mast_Tip'])
    s.hook_part('HOOK_SENSOR_DISH', _dmg['DishPost'], _dmg['Dish'], _dmg['DishFace'], _dmg['DishHorn'],
                _dmg['DishFeed'])
    s.hook_part('HOOK_ARMOR_WINGLET', _dmg['Winglet'])
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
