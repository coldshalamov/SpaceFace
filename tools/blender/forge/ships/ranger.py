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
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'ranger'
COLORS = {
    'paint': '#1c3223',    # forest green (brief #2f4a36, authored darker: the key light lifts ~2.5x)
    'paint2': '#6b6a60',   # survey ivory (brief #a9a38f, same calibration)
    'stripe': '#6b6a60',
    'hazard': '#b0761c',
    'dark': '#1a1d1e',
}


def dish(s, name, center, radius, depth, normal, thickness=0.07, rings=10, segments=40, face='paint2',
         back='gunmetal', ring_bands=(2, 6)):
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
            f = bm.faces.new((front[i][k], front[i + 1][k], front[i + 1][j], front[i][j]))
            if i in ring_bands:
                f.material_index = 1
            faces_front.append(f)
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


def skin_z(x, y, parts):
    """Top-down ray onto the named parts: the skin height under (x, y). A miss is a design error."""
    best = None
    for n in parts:
        o = bpy.data.objects.get(n)
        if o is None:
            continue
        hit, loc, _, _ = o.ray_cast(Vector((x, y, 60.0)), Vector((0.0, 0.0, -1.0)))
        if hit and (best is None or loc.z > best):
            best = loc.z
    if best is None:
        raise ValueError(f'detail point ({x:.2f}, {y:.2f}) is off the skin')
    return best


def drape(pts, parts, step=0.15, proud=0.02, h=0.05, closed=False):
    """A plan-view polyline laid on the skin as beam segments: resampled every `step` m, tops `proud`
    above the surface, bodies buried (so nothing floats and nothing z-fights)."""
    pts = list(pts) + ([pts[0]] if closed else [])
    path = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, round(math.hypot(x1 - x0, y1 - y0) / step))
        for i in range(n):
            x, y = x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n
            path.append((x, y, skin_z(x, y, parts) + proud - h / 2))
    x, y = pts[-1]
    path.append((x, y, skin_z(x, y, parts) + proud - h / 2))
    return list(zip(path, path[1:]))


def rect(cx, cy, sx, sy, ang=0.0):
    """Closed plan-view rectangle (corner list), yawed `ang` rad about its centre."""
    c, sn = math.cos(ang), math.sin(ang)
    return [(cx + c * dx - sn * dy, cy + sn * dx + c * dy)
            for dx, dy in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2))]


def studs(pts, parts, size=0.07, proud=0.03):
    """Fastener heads sitting on the skin: (centre, size) rows for F.boxes."""
    return [((x, y, skin_z(x, y, parts) + proud - size / 2), (size, size, size)) for x, y in pts]


def along(p0, p1, pitch, t0=0.0, t1=1.0):
    """Evenly spaced plan points from p0 to p1 (fractions t0..t1 of the way), about `pitch` apart."""
    n = max(1, round(math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * (t1 - t0) / pitch))
    return [(p0[0] + (p1[0] - p0[0]) * (t0 + (t1 - t0) * (i + 0.5) / n),
             p0[1] + (p1[1] - p0[1]) * (t0 + (t1 - t0) * (i + 0.5) / n)) for i in range(n)]


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
    # Identity trim, lit: the cyan of the sensor spear carried aft as one thin line down the
    # centre of the ivory dorsal stripe, canopy to tail (LOOK.md: lamps are light).
    F.band(s, 'Hull', (0, 0, 0), (0, 1, 0), 0.08, 'glow_cyan', facing=(0, 0, 1), min_facing=0.55, inset=0.01,
           depth=-0.02, region=(('x', -6.2, 2.1),))

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

    # --- close-zoom detail layer (LOD0 only, existing finishes, every part seated on the real skin) ---
    bpy.context.view_layer.update()
    s.detail = 2
    # Cockpit tub: a dark floor following the glass outline on the hull skin, side rails, a seat and a dash
    # with one thin warm instrument strip (the hull already draws glow_warm in its cabin windows).
    def glass_w(x, x0=2.2, x1=4.3, w=0.5, peak=0.4):
        u = (x - x0) / (x1 - x0)
        k = math.sin(0.5 * math.pi * u / peak) if u <= peak else math.cos(0.5 * math.pi * (u - peak) / (1 - peak))
        return w * math.sqrt(max(k, 0.02))

    def fz(x):
        return skin_z(x, 0.0, ['Hull']) + 0.05
    th = math.atan2(fz(2.4) - fz(4.15), 1.75)
    F.loft(s, 'CockpitTub', [dict(x=x, w=0.86 * glass_w(x), ht=0.03, hb=0.09, zc=fz(x) - 0.03, n=2.2, y=0.0)
                             for x in (2.4, 2.8, 3.2, 3.6, 3.95, 4.12)], material='dark', count=20, bevel=0.0)
    rails = []
    for sg in (1, -1):
        for xa, xb in ((2.5, 3.1), (3.1, 3.7), (3.7, 4.0)):
            rails.append(((xa, sg * 0.8 * glass_w(xa), fz(xa) + 0.03), (xb, sg * 0.8 * glass_w(xb), fz(xb) + 0.03)))
    F.beams(s, 'CockpitRails', rails, 0.06, 'gunmetal', h=0.08)
    F.box(s, 'PilotSeat', (2.9, 0.0, fz(2.9) + 0.05), (0.38, 0.3, 0.1), material='gunmetal', bevel=0.01)
    F.box(s, 'SeatBack', (2.72, 0.0, fz(2.72) + 0.11), (0.1, 0.3, 0.22), material='gunmetal', bevel=0.01)
    F.box(s, 'Dash', (3.75, 0.0, fz(3.75) + 0.06), (0.3, 0.56, 0.12), material='dark', bevel=0.0, rot=(0.0, th, 0.0))
    F.box(s, 'DashStrip', (3.7, 0.0, fz(3.7) + 0.135), (0.06, 0.4, 0.025), material='glow_warm', bevel=0.0,
          rot=(0.0, th, 0.0))

    # Hull: access hatches on the dorsal flanks and plate seams at the frame joints (thin dark lines).
    hull_hatches = ((-3.95, 0.56, 0.8, 0.34), (-5.0, 0.56, 0.9, 0.34), (1.4, 0.8, 0.9, 0.3))
    dark = []
    for (cx, cy, sx, sy) in hull_hatches:
        dark += drape(rect(cx, cy, sx, sy), ['Hull'], closed=True)
    for x, y0, y1 in ((-6.0, 0.3, 0.6), (-3.0, 0.3, 0.95), (0.6, 0.62, 1.0)):
        dark += drape([(x, y0), (x, y1)], ['Hull'])
    # Wing: an access hatch laid along the leading edge, behind the ivory stripe
    A, Bp = (1.2, 0.75), (-3.0, 2.95)
    dl = math.hypot(Bp[0] - A[0], Bp[1] - A[1])
    ux, uy = (Bp[0] - A[0]) / dl, (Bp[1] - A[1]) / dl
    nx, ny = -uy, ux                       # unit normal pointing back off the leading edge
    wing_hatch = (A[0] + ux * 3.0 + nx * 0.8, A[1] + uy * 3.0 + ny * 0.8)
    wing_ang = math.atan2(-uy, -ux)
    F.beams(s, 'WingHatch', drape(rect(wing_hatch[0], wing_hatch[1], 0.6, 0.3, wing_ang), ['Wing'], closed=True),
            0.06, 'dark', h=0.05, mirror=True)
    F.beams(s, 'HullSeams', dark, 0.06, 'dark', h=0.05, mirror=True)
    F.beams(s, 'NoseHatch', drape(rect(4.95, 0.0, 0.5, 0.2), ['Hull'], closed=True), 0.06, 'dark', h=0.05)

    # Pods: dark seam rings at the barrel joints (thin proud rings, no cap) and two access hatches on top
    def pod_r(x):
        return 0.62 - 0.02 * (x + 7.2) / 4.0
    for x in (-3.4, -5.2, -7.0):
        F.cylinder(s, f'PodSeam{x}', (x, PY, 0.0), (x + 0.045, PY, 0.0), pod_r(x) + 0.012, material='dark',
                   segments=40, cap=False, bevel=0.0, mirror=True)
    pod_hatches = ((-4.2, 1.0), (-5.75, 0.7))
    pods = []
    for (cx, sx) in pod_hatches:
        pods += drape(rect(cx, PY, sx, 0.34), ['Pod'], closed=True, step=0.2)
    F.beams(s, 'PodHatches', pods, 0.06, 'dark', h=0.05, mirror=True)

    # Fasteners (one mesh): a row along the ivory leading-edge stripe, the flap hinge, and the hatch corners
    pts = [(A[0] + ux * d - uy * 0.28, A[1] + uy * d + ux * 0.28) for d in [1.0 + 0.4 * i for i in range(9)]]
    rivets = studs(pts, ['Wing'], size=0.07, proud=0.03)
    rivets += studs(along((-3.95, 1.1), (-5.5, 2.6), 0.4), ['Flap', 'Wing'], size=0.07, proud=0.03)
    for (cx, sx) in pod_hatches:
        rivets += studs(rect(cx, PY, sx, 0.34), ['Pod'], size=0.07, proud=0.03)
    for (cx, cy, sx, sy) in hull_hatches:
        rivets += studs(rect(cx, cy, sx, sy), ['Hull'], size=0.07, proud=0.03)
    F.boxes(s, 'Fasteners', rivets, material='gunmetal', mirror=True)

    # Tanks: seam rings, a filler hatch and a feed line to the hull. Built per side so the port set joins
    # the shed-first tank.
    tank_extra = {}
    for y in (1.25, -1.25):
        sg = 1 if y > 0 else -1
        parts = []
        for x in (-4.65, -2.6):
            parts.append(F.cylinder(s, f'TankSeam{y}_{x}', (x, y, 0.2), (x + 0.045, y, 0.2), 0.452, material='dark',
                                    segments=32, cap=False, bevel=0.0))
        parts.append(F.beams(s, f'TankHatch{y}', drape(rect(-4.2, y, 0.45, 0.24), [f'Tank{y}'], closed=True, step=0.2),
                             0.06, 'dark', h=0.05))
        parts.append(F.beams(s, f'TankFeed{y}', [((-2.0, sg * 1.25, 0.2), (-1.2, sg * 1.06, 0.2))], 0.1, 'gunmetal',
                             h=0.1))
        tank_extra[y] = parts
    s.hook_part('HOOK_SECONDARY_TANK', *tank_extra[1.25])

    # Survey dish: six dark rib seams on the ivory face and a ring of fasteners on the rim (all go with the dish)
    ribs, rim = [], []
    for k in range(6):
        ang = math.radians(60.0 * k + 30.0)
        rp = []
        for i in range(8):
            r = 0.4 + 0.98 * i / 7
            q = dc + rot @ Vector((r * math.cos(ang), r * math.sin(ang), 0.4 * (r / 1.5) ** 2))
            rp.append((q.x, q.y))
        ribs += drape(rp, ['Dish'], step=0.15, proud=0.02, h=0.04)
    for k in range(16):
        ang = 2 * math.pi * (k + 0.5) / 16
        q = dc + rot @ Vector((1.45 * math.cos(ang), 1.45 * math.sin(ang), 0.4 * (1.45 / 1.5) ** 2))
        rim.append((q.x, q.y))
    dish_extra = [F.beams(s, 'DishRibs', ribs, 0.04, 'gunmetal', h=0.04),
                  F.boxes(s, 'DishRim', studs(rim, ['Dish'], size=0.07, proud=0.03), material='gunmetal')]
    s.hook_part('HOOK_SENSOR_DISH', *dish_extra)
    s.detail = 0

    # --- lights --------------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-5.0, PY + 0.62, 0.05), 'glow_red', size=0.16)
    F.light(s, 'NavStarboard', (-5.0, -PY - 0.62, 0.05), 'glow_green', size=0.16)
    F.light(s, 'Beacon', (-6.1, 0.0, 0.7), 'glow_amber', size=0.14)
    s.socket('SOCKET_Weapon_Front', (5.4, 0.0, -0.05))
    s.socket('SOCKET_Mining_Front', (5.3, 0.0, -0.2))
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
