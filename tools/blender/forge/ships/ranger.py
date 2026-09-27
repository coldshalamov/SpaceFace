"""Ranger — tier-3 player explorer. "Long-range scout with sensor spear."

Plan read at the chase camera: a slender forest-green dart whose nose runs out into a long sensor
boom ending in a spearhead array, swept wings carrying two long ivory endurance drive pods, a big
ivory survey dish on the back, and ivory fuel tanks along the flanks. Cyan sensor lights run down
the spear. Three values: ivory, forest green, dark machinery.
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'ranger'
COLORS = {
    'paint': '#1c3223',    # forest green (brief #2f4a36, authored darker: the key light lifts ~2.5x)
    'paint2': '#6a6758',   # survey ivory (brief #a9a38f, same calibration)
    'stripe': '#6a6758',
    'hazard': '#b0761c',
    'dark': '#1a1d1e',
}


def dish(s, name, center, radius, depth, normal, thickness=0.07, rings=10, segments=40, face='paint2',
         back='gunmetal'):
    """Local helper: a real parabolic survey dish (concave face + shell back) aimed along `normal`."""
    bm = bmesh.new()
    front, rear = [], []
    for i in range(1, rings + 1):
        r = radius * i / rings
        z = depth * (i / rings) ** 2
        front.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments),
                                    r * math.sin(2 * math.pi * k / segments), z)) for k in range(segments)])
        rear.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments),
                                   r * math.sin(2 * math.pi * k / segments), z - thickness)) for k in range(segments)])
    pole_f = bm.verts.new((0, 0, 0))
    pole_r = bm.verts.new((0, 0, -thickness))
    faces_front, faces_back = [], []
    for k in range(segments):
        j = (k + 1) % segments
        faces_front.append(bm.faces.new((pole_f, front[0][k], front[0][j])))
        faces_back.append(bm.faces.new((pole_r, rear[0][j], rear[0][k])))
        for i in range(rings - 1):
            faces_front.append(bm.faces.new((front[i][k], front[i + 1][k], front[i + 1][j], front[i][j])))
            faces_back.append(bm.faces.new((rear[i][k], rear[i][j], rear[i + 1][j], rear[i + 1][k])))
        faces_back.append(bm.faces.new((front[-1][k], rear[-1][k], rear[-1][j], front[-1][j])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in faces_back:
        f.material_index = 1
    rot = Vector((0, 0, 1)).rotation_difference(Vector(normal).normalized()).to_matrix()
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    obj = F._new_object(name, bm, s.slots([face, back]), bevel=0.0, smooth_angle=60.0)
    return s.add(obj)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- slender hull: green dart, ivory belly -----------------------------------------------------
    F.loft(s, 'Hull', [
        dict(x=-6.7, w=0.5, ht=0.45, hb=0.42, zc=0.05, n=2.2),
        dict(x=-6.1, w=0.78, ht=0.66, hb=0.58, zc=0.05, n=2.4),
        dict(x=-3.0, w=1.1, ht=0.9, hb=0.7, zc=0.05, n=2.5),
        dict(x=0.6, w=1.15, ht=0.95, hb=0.7, zc=0.08, n=2.5),
        dict(x=3.0, w=0.92, ht=0.78, hb=0.58, zc=0.06, n=2.4),
        dict(x=4.7, w=0.56, ht=0.48, hb=0.38, zc=0.02, n=2.2),
        dict(x=5.5, w=0.26, ht=0.24, hb=0.2, zc=0.0, n=2.0),
        dict(x=5.75, w=0.1, ht=0.1, hb=0.1, zc=0.0, n=2.0),
    ], material='paint', belly='paint2', back_material='dark', count=56)
    # ivory dorsal stripe from nose to tail, a cyan-trimmed sensor collar at the nose
    F.band(s, 'Hull', (0, 0, 0), (0, 1, 0), 0.34, 'paint2', facing=(0, 0, 1), min_facing=0.55, inset=0.015,
           depth=0.015)
    F.band(s, 'Hull', (4.2, 0, 0), (1, 0, 0), 0.3, 'paint2', inset=0.015, depth=0.02)

    # --- sensor spear: boom, ivory sleeves, cyan sensor rings, spearhead array --------------------
    F.cylinder(s, 'SpearShaft', (5.3, 0.0, 0.0), (8.4, 0.0, 0.0), 0.085, material='gunmetal', segments=16)
    F.cylinder(s, 'SpearSleeve', (5.2, 0.0, 0.0), (6.5, 0.0, 0.0), 0.22, 0.15, material='paint2', segments=24,
               cap_material='dark')
    for i, x in enumerate((6.8, 7.35, 7.9)):
        F.cylinder(s, f'SpearRing{i}', (x, 0.0, 0.0), (x + 0.08, 0.0, 0.0), 0.15, material='glow_cyan', segments=20,
                   bevel=0.0)
        F.cylinder(s, f'SpearCollar{i}', (x - 0.1, 0.0, 0.0), (x, 0.0, 0.0), 0.13, material='gunmetal', segments=20,
                   bevel=0.0)
    head = [(9.35, 0.0), (8.55, 0.36), (7.95, 0.14), (7.95, -0.14), (8.55, -0.36)]
    F.plate(s, 'Spearhead', head, z0=-0.05, thickness=0.1, material='paint2', chamfer=0.06, chamfer_bottom=0.03)
    F.band(s, 'Spearhead', (0, 0, 0), (0, 1, 0), 0.08, 'glow_cyan', facing=(0, 0, 1))
    F.light(s, 'SpearTip', (9.36, 0.0, 0.0), 'glow_cyan', size=0.1)

    # dorsal sensor bay: a raised green fairing between canopy and dish, cyan scanner slot
    F.plate(s, 'SensorBay', [(2.25, 0.32), (0.1, 0.52), (-0.1, 0.4), (-0.1, -0.4), (0.1, -0.52), (2.25, -0.32)],
            z0=0.9, thickness=0.22, material='paint', chamfer=0.09, side_material='paint2')
    F.band(s, 'SensorBay', (1.0, 0, 0), (1, 0, 0), 0.12, 'glow_cyan', facing=(0, 0, 1))

    # --- cockpit and canards --------------------------------------------------------------------
    F.canopy(s, 'Canopy', x0=2.2, x1=4.3, w=0.5, h=0.36, z=0.74, peak=0.4)
    F.plate(s, 'Canard', [(3.9, 0.6), (2.9, 1.55), (2.55, 1.55), (2.9, 0.6)], z0=-0.08, thickness=0.1,
            material='paint', chamfer=0.06, mirror=True, top_material='paint2')

    # --- swept wings to the endurance pods ---------------------------------------------------------
    PY = 3.05
    wing = [(1.2, 0.75), (-3.0, PY - 0.1), (-5.3, PY - 0.1), (-3.6, 0.75)]
    F.plate(s, 'Wing', wing, z0=-0.14, thickness=0.2, material='paint', chamfer=0.22, chamfer_bottom=0.06,
            mirror=True, side_material='paint2')
    F.band(s, 'Wing', (-1.4, 1.9, 0), (0.46, 0.89, 0), 0.34, 'paint2', facing=(0, 0, 1), mirror=True)
    F.panel(s, 'Wing', (-2.9, 1.9), (1.3, 0.9), 'paint', inset=0.04, depth=0.04, mirror=True)
    F.plate(s, 'Flap', [(-3.72, 0.9), (-5.35, PY - 0.3), (-5.75, PY - 0.3), (-4.2, 0.9)], z0=-0.1, thickness=0.12,
            material='paint', chamfer=0.05, mirror=True)
    F.loft(s, 'Pod', [
        dict(x=-7.6, w=0.5, ht=0.5, hb=0.5, zc=0.0, n=2.0, y=PY),
        dict(x=-7.2, w=0.62, ht=0.62, hb=0.62, zc=0.0, n=2.0, y=PY),
        dict(x=-3.2, w=0.6, ht=0.6, hb=0.6, zc=0.0, n=2.0, y=PY),
        dict(x=-2.2, w=0.45, ht=0.45, hb=0.45, zc=0.0, n=2.0, y=PY),
        dict(x=-1.55, w=0.14, ht=0.14, hb=0.14, zc=0.0, n=2.0, y=PY),
    ], material='paint2', count=40, mirror=True)
    F.band(s, 'Pod', (-2.75, PY, 0), (1, 0, 0), 0.36, 'paint', inset=0.015, depth=0.02, mirror=True)
    F.band(s, 'Pod', (-6.4, PY, 0), (1, 0, 0), 0.5, 'paint', inset=0.015, depth=0.02, mirror=True)
    F.light(s, 'PodSensor', (-1.5, PY, 0.0), 'glow_cyan', size=0.13, mirror=True)
    F.nozzle(s, 'PodNozzle', (-8.3, PY, 0.0), 0.5, 0.75, material='gunmetal', mirror=True)
    F.nozzle(s, 'TailNozzle', (-7.25, 0.0, 0.05), 0.4, 0.6, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-8.25, 0.0, 0.0))

    # --- fuel tanks along the flanks (port tank is the secondary damage part) ----------------------
    tanks = {}
    for y in (1.25, -1.25):
        body = F.cylinder(s, f'Tank{y}', (-4.9, y, 0.2), (-2.3, y, 0.2), 0.44, material='paint', segments=32,
                          cap_material='dark')
        band = F.cylinder(s, f'TankBand{y}', (-3.75, y, 0.2), (-3.45, y, 0.2), 0.47, material='paint2', segments=32)
        cap_a = F.cylinder(s, f'TankEndA{y}', (-5.2, y, 0.2), (-4.85, y, 0.2), 0.26, 0.42, material='gunmetal',
                           segments=32)
        cap_b = F.cylinder(s, f'TankEndB{y}', (-2.35, y, 0.2), (-2.0, y, 0.2), 0.42, 0.26, material='gunmetal',
                           segments=32)
        tanks[y] = (body, band, cap_a, cap_b)
    s.hook_part('HOOK_SECONDARY_TANK', *tanks[1.25])

    # --- dorsal survey dish (sensor damage part) ---------------------------------------------------
    DX, DZ = -1.0, 1.6
    ped = F.cylinder(s, 'DishPedestal', (DX, 0.0, 0.85), (DX, 0.0, DZ), 0.22, 0.14, material='gunmetal',
                     segments=16)
    yoke = F.box(s, 'DishYoke', (DX, 0.0, DZ), (0.4, 0.5, 0.2), material='gunmetal', bevel=0.02)
    nrm = (-0.42, 0.0, 0.91)
    dc = Vector((DX + 0.05, 0.0, DZ + 0.05))
    d = dish(s, 'Dish', tuple(dc), 1.5, 0.4, nrm)
    rot = Vector((0, 0, 1)).rotation_difference(Vector(nrm).normalized()).to_matrix()
    focus = dc + rot @ Vector((0, 0, 1.15))
    fx, fz = focus.x, focus.z
    struts = []
    for i, ang in enumerate((0.0, 2.094, 4.189)):
        rim = dc + rot @ Vector((1.35 * math.cos(ang), 1.35 * math.sin(ang), 0.4 * 0.8))
        struts.append(F.cylinder(s, f'DishStrut{i}', tuple(rim), tuple(focus), 0.025, material='gunmetal', segments=6,
                                 bevel=0.0))
    feed = F.light(s, 'DishFeed', (fx, focus.y, fz), 'glow_cyan', size=0.14)
    s.hook_part('HOOK_SENSOR_DISH', ped, yoke, d, *struts, feed)

    # --- detail ------------------------------------------------------------------------------------
    s.detail = 1
    F.vent(s, 'SpineVent', (-5.1, 0.0, 0.72), (0.9, 0.5, 0.1), slats=4)
    F.rcs(s, 'RCSFwd', (2.0, 0.95, 0.15), size=0.3, mirror=True)
    F.rcs(s, 'RCSPod', (-6.9, PY + 0.6, 0.0), size=0.28, mirror=True)
    F.antenna(s, 'Whip', (-5.8, 0.35, 0.6), 1.1, tip='glow_cyan')
    F.windows(s, 'CabinWin', 0.6, 2.0, 0.98, 0.45, 3, size=(0.3, 0.16), mirror=True)
    F.box(s, 'ChinSensor', (4.6, 0.0, -0.4), (0.7, 0.4, 0.16), material='gunmetal', bevel=0.02)
    F.light(s, 'ChinLens', (4.96, 0.0, -0.4), 'glow_cyan', size=0.1)
    s.detail = 0

    # --- lights --------------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-5.0, PY + 0.62, 0.05), 'glow_red', size=0.16)
    F.light(s, 'NavStarboard', (-5.0, -PY - 0.62, 0.05), 'glow_green', size=0.16)
    F.light(s, 'Beacon', (-6.1, 0.0, 0.7), 'glow_amber', size=0.14)
    s.socket('SOCKET_Weapon_Front', (5.4, 0.0, -0.05))
    s.socket('SOCKET_Mining_Front', (5.3, 0.0, -0.2))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
