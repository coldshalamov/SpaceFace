"""Pelican — tier-1 player miner. A pelican bill that eats rocks.

Plan read at the chase camera: a stout ivory body with a long safety-orange bill out front. The bill
is an open-topped scoop, so the camera looks straight into its dark mouth: a toothed cutter drum lit
by an amber lamp under the short upper mandible. A cargo pouch hangs under the body, twin drive pods
sit on the hips.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'pelican'
COLORS = {
    'paint': '#9c9586',    # white-ivory (#bdb5a5 as seen; the key light lifts authored values)
    'paint2': '#a8521a',   # safety-orange bill
    'stripe': '#a8521a',
    'hazard': '#b88a22',
    'dark': '#121417',
}


def vwall(s, name, profile, y, thickness, material='paint2', mirror=False, bevel=0.02, y_end=None):
    """Local helper (the kit has no vertical plate): a side-profile polygon (x, z) extruded across Y.
    y_end tapers the wall in plan: its centre runs from y at the aft-most x to y_end at the fore-most x."""
    import bmesh
    xa = min(p[0] for p in profile)
    xb = max(p[0] for p in profile)

    def build(sign):
        bm = bmesh.new()

        def yc(x):
            t = (x - xa) / (xb - xa)
            return sign * (y + ((y_end if y_end is not None else y) - y) * t)
        a = [bm.verts.new((x, yc(x) - thickness / 2, z)) for (x, z) in profile]
        b = [bm.verts.new((x, yc(x) + thickness / 2, z)) for (x, z) in profile]
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], b[i], b[j], a[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm
    obj = s.add(F._new_object(name, build(1), s.slots([material]), bevel=bevel, smooth_angle=30.0))
    if mirror:
        s.add(F._new_object(name + '_M', build(-1), s.slots([material]), bevel=bevel, smooth_angle=30.0))
    return obj


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Stout body -------------------------------------------------------------------------
    F.loft(s, 'Body', [
        dict(x=-5.6, w=1.15, ht=0.85, hb=0.85, zc=0.1, n=2.3),
        dict(x=-4.9, w=1.7, ht=1.3, hb=1.15, zc=0.1, n=2.4),
        dict(x=-2.2, w=2.05, ht=1.55, hb=1.3, zc=0.12, n=2.5),
        dict(x=0.0, w=1.95, ht=1.45, hb=1.15, zc=0.12, n=2.5),
        dict(x=1.1, w=1.65, ht=1.15, hb=0.85, zc=0.1, n=2.4),
        dict(x=1.6, w=1.35, ht=0.8, hb=0.7, zc=0.05, n=2.3),
    ], material='paint', belly='paint2', back_material='dark', front_material='dark', count=64)
    F.band(s, 'Body', (-3.6, 0, 0), (1, 0, 0), 0.45, 'stripe', inset=0.02, depth=0.02)
    F.panel(s, 'Body', (-1.7, 0.0), (2.2, 1.6), 'paint', inset=0.05, depth=0.04)
    F.canopy(s, 'Canopy', x0=-0.6, x1=1.25, w=1.15, h=0.45, z=1.12, peak=0.55, n=2.6)

    # --- The bill: open-topped scoop with a short upper mandible -------------------------------
    # Floor (dark inside, orange underside) and orange side walls that sweep down to a lip.
    F.plate(s, 'JawFloor', [(1.2, 1.4), (1.2, -1.4), (6.3, -1.08), (6.9, -0.8), (7.1, 0.0), (6.9, 0.8), (6.3, 1.08)],
            z0=-0.85, thickness=0.22, material='paint2', top_material='dark', chamfer_bottom=0.12)
    vwall(s, 'JawWall', [(1.0, -0.85), (6.95, -0.85), (6.95, -0.35), (5.4, 0.2), (2.2, 0.5), (1.0, 0.55)], 1.34, 0.24,
          'paint2', mirror=True, y_end=1.0)
    F.band(s, 'JawWall', (6.1, 0, 0), (1, 0, 0), 0.32, 'hazard', mirror=True)
    F.box(s, 'JawLip', (7.0, 0.0, -0.6), (0.36, 2.0, 0.55), material='paint2', bevel=0.06, taper=0.9)
    F.box(s, 'LipNail', (7.22, 0.0, -0.8), (0.34, 0.5, 0.32), material='gunmetal', bevel=0.04)
    # Jaw hinge knuckles where the bill meets the head.
    F.cylinder(s, 'Hinge', (1.5, 1.2, 0.05), (1.5, 1.62, 0.05), 0.3, material='gunmetal', mirror=True,
               cap_material='dark')
    # Upper mandible hood over the back of the mouth.
    F.loft(s, 'Mandible', [
        dict(x=0.9, w=1.45, ht=0.5, hb=0.12, zc=0.5, n=3.2),
        dict(x=2.2, w=1.45, ht=0.45, hb=0.12, zc=0.52, n=3.2),
        dict(x=2.95, w=1.35, ht=0.3, hb=0.1, zc=0.5, n=3.0),
        dict(x=3.2, w=1.2, ht=0.12, hb=0.08, zc=0.48, n=2.6),
    ], material='paint2', front_material='dark', count=48)
    F.band(s, 'Mandible', (1.9, 0, 0), (1, 0, 0), 0.18, 'dark', facing=(0, 0, 1), inset=0.01, depth=-0.02)
    # Mouth: cutter drum with teeth, amber cutter lamp behind it.
    F.cylinder(s, 'CutterDrum', (4.2, -1.12, -0.35), (4.2, 1.12, -0.35), 0.36, material='gunmetal', segments=32,
               cap_material='dark')
    for i in range(7):
        y = -0.9 + i * 0.3
        F.box(s, f'Tooth{i}', (4.2, y, 0.02), (0.22, 0.12, 0.16), material='bare', bevel=0.01, rot_z=0.0)
        F.box(s, f'ToothB{i}', (4.56, y + 0.15, -0.35), (0.16, 0.12, 0.22), material='bare', bevel=0.01)
    F.box(s, 'LampHousing', (3.5, 0.0, -0.4), (0.42, 2.3, 0.5), material='dark', bevel=0.01)
    F.box(s, 'CutterLamp', (3.5, 0.0, -0.13), (0.28, 2.1, 0.08), material='glow_amber', bevel=0.0)
    # Grab rails along the jaw floor.
    for y in (0.55, -0.55):
        F.box(s, f'FloorRail{y}', (5.6, y, -0.6), (3.0, 0.1, 0.06), material='gunmetal', bevel=0.0)

    # --- Cargo pouch under the body ------------------------------------------------------------
    F.loft(s, 'Pouch', [
        dict(x=-3.9, w=0.9, ht=0.3, hb=0.4, zc=-1.1, n=2.4),
        dict(x=-3.3, w=1.45, ht=0.5, hb=0.85, zc=-1.15, n=2.6),
        dict(x=0.0, w=1.45, ht=0.5, hb=0.95, zc=-1.15, n=2.6),
        dict(x=1.0, w=1.1, ht=0.4, hb=0.6, zc=-1.05, n=2.4),
    ], material='paint', count=48)
    F.band(s, 'Pouch', (-1.6, 0, 0), (1, 0, 0), 0.3, 'dark', inset=0.02, depth=-0.03)

    # --- Hip drive pods ------------------------------------------------------------------------
    PY = 2.35
    F.plate(s, 'Hip', [(-1.4, 1.2), (-3.4, PY), (-5.9, PY), (-5.6, 1.2)], z0=-0.2, thickness=0.4, material='paint',
            chamfer=0.18, mirror=True, side_material='gunmetal')
    F.loft(s, 'Pod', [
        dict(x=-6.6, w=0.6, ht=0.6, hb=0.6, zc=0.0, n=2.2, y=PY),
        dict(x=-6.1, w=0.72, ht=0.72, hb=0.72, zc=0.0, n=2.3, y=PY),
        dict(x=-3.4, w=0.7, ht=0.7, hb=0.7, zc=0.0, n=2.3, y=PY),
        dict(x=-2.5, w=0.5, ht=0.5, hb=0.5, zc=0.0, n=2.2, y=PY),
        dict(x=-2.1, w=0.15, ht=0.15, hb=0.15, zc=0.0, n=2.0, y=PY),
    ], material='paint', back_material='dark', count=48, mirror=True)
    F.band(s, 'Pod', (-4.1, PY, 0), (1, 0, 0), 0.4, 'stripe', inset=0.02, depth=0.02, mirror=True)
    F.nozzle(s, 'PodNozzle', (-7.3, PY, 0.0), 0.56, 0.8, material='gunmetal', mirror=True)
    F.nozzle(s, 'CoreNozzle', (-6.2, 0.0, 0.1), 0.62, 0.75, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-6.3, 0.0, 0.1))

    s.detail = 1
    F.vent(s, 'Vent', (-4.4, 0.95, 1.2), (1.1, 0.4, 0.1), mirror=True)
    F.vent(s, 'SpineVent', (-4.5, 0.0, 1.38), (1.2, 0.8, 0.1), axis='y')
    F.rcs(s, 'RCS', (0.2, 1.95, 0.2), size=0.34, mirror=True)
    F.antenna(s, 'Mast', (-3.0, -0.7, 1.6), 0.9, tip='glow_red')
    F.sensor_dome(s, 'Dome', (-2.8, 0.7, 1.62), 0.28)
    F.light(s, 'WorkLamp', (2.95, 1.0, 0.76), 'glow_warm', size=0.14, mirror=True)
    F.box(s, 'PouchHatch', (-1.6, 0.0, -2.08), (1.6, 1.0, 0.06), material='gunmetal', bevel=0.01)
    s.detail = 0
    F.light(s, 'NavPort', (-5.2, PY + 0.72, 0.0), 'glow_red')
    F.light(s, 'NavStarboard', (-5.2, -PY - 0.72, 0.0), 'glow_green')
    F.light(s, 'Beacon', (-3.9, 0.0, 1.62), 'glow_amber', size=0.13)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
