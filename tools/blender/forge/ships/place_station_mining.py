"""Belt Mining Rig — Helios ore processing station. Forge rebuild.

Idea: "crane rig chewing a captive asteroid". Plan read from the chase camera: a dark faceted rock
held in an ochre cradle frame — two long rails, four hydraulic clamp arms biting into its flanks and
two gantry cranes straddling it with hoists and floodlights. At the rock's sawn face a cutter drum
chews, glowing where it bites; conveyors carry ore up into the mill, the crusher towers and the
silos, and the docking arm (+X, the dock approach socket) holds a parked ore hauler. The smelter
with its glowing louvres sits on the port side (the emissive socket), the crew hab to starboard.
Three values: ochre frame and bands, ivory towers and habs, graphite machinery and a near-black rock.
Sockets (dock approach, emissive, structure core) are copied from the live file on export.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_mining'
COLORS = {
    'paint': '#a69d8a',           # Helios ivory (brightest allowed)
    'paint2': '#584418',          # mining ochre, authored dark (the key light lifts it ~2.5x)
    'stripe': '#584418',
    'hazard': '#a8861c',
    'paint.graphite': '#26292d',  # graphite
    'dark': '#16191d',
    'ceramic': '#0f0d0b',         # the captive rock, near black (the key light lifts it a lot)
    'ceramic.cut': '#3a332b',     # sawn rock face, lighter
    'ceramic.ore': '#4a280c',     # rusty ore seams
}

RC = Vector((-26.0, 0.0, 0.0))   # rock centre
RX, RY, RZ = 19.5, 18.0, 14.0    # rock radii
XCUT = RC.x + RX * 0.64          # sawn face plane (the cutter side, +X)
DRUM_X = XCUT + 2.0
RAIL_Y, RAIL_Z = 25.0, -3.0
GANTRIES = (-36.0, -20.5)


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (r * math.cos(a), r * math.sin(a), z)


# --- local helpers --------------------------------------------------------------------------------

def cluster(s, name, items, material, bevel=0.0):
    """Many small boxes in one mesh (windows, lights, teeth): items = (center, size, rot_z)."""
    bm = bmesh.new()
    for c, sz, rz in items:
        geom = bmesh.ops.create_cube(bm, size=1.0)
        vs = geom['verts']
        for v in vs:
            v.co.x *= sz[0]
            v.co.y *= sz[1]
            v.co.z *= sz[2]
        if rz:
            bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(rz, 3, 'Z'))
        bmesh.ops.translate(bm, verts=vs, vec=c)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def beam(s, name, p0, p1, w, h=None, material='gunmetal', bevel=0.0):
    return F.sweep(s, name, [p0, p1], w, h if h is not None else w, material=material, bevel=bevel)


def truss(s, name, p0, p1, width, depth, bays, material='gunmetal', chord=0.45, web=0.25):
    """Box truss between two points: four chords plus zig-zag webs on all four faces."""
    a, b = Vector(p0), Vector(p1)
    t = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
    side = t.cross(up).normalized()
    nrm = side.cross(t).normalized()
    corners = [side * sx * width / 2 + nrm * sz * depth / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm = bmesh.new()

    def strut(q0, q1, w):
        d = (q1 - q0)
        if d.length < 1e-4:
            return
        tt = d.normalized()
        u = Vector((0, 0, 1)) if abs(tt.z) < 0.9 else Vector((0, 1, 0))
        sd = tt.cross(u).normalized()
        nn = sd.cross(tt).normalized()
        ring = []
        for q in (q0, q1):
            ring.append([bm.verts.new(q + sd * x * w / 2 + nn * y * w / 2) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
        r0, r1 = ring
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
        bm.faces.new(list(reversed(r0)))
        bm.faces.new(r1)
    for c in corners:
        strut(a + c, b + c, chord)
    for i in range(bays):
        q0 = a + (b - a) * (i / bays)
        q1 = a + (b - a) * ((i + 1) / bays)
        for f in range(4):
            c0, c1 = corners[f], corners[(f + 1) % 4]
            if i % 2 == 0:
                strut(q0 + c0, q1 + c1, web)
            else:
                strut(q0 + c1, q1 + c0, web)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=30.0))


def lump(p):
    """Deterministic lumpy displacement for the rock (unit-sphere coords)."""
    x, y, z = p
    return (1.0 + 0.11 * math.sin(3.1 * x + 1.3) * math.cos(2.7 * y + 0.4)
            + 0.08 * math.sin(5.3 * z + 0.7 + 1.9 * x) + 0.05 * math.sin(7.1 * (x + y) + 2.2)
            + 0.04 * math.cos(9.7 * (y - z) + 0.3))


def rock_radius(dx, dy, dz):
    """Approximate rock surface distance along a direction (for placing clamps and grabs)."""
    d = Vector((dx, dy, dz)).normalized()
    r = 1.0 / math.sqrt((d.x / RX) ** 2 + (d.y / RY) ** 2 + (d.z / RZ) ** 2)
    return r * lump(tuple(d))


def surface(x, y, z, axis):
    """March inward along `axis` (1 = y, 2 = z) from outside until the point is inside the rock."""
    p = [x, y, z]
    start = p[axis]
    for i in range(400):
        p[axis] = start * (1 - i / 400)
        d = Vector(p) - RC
        if d.length <= rock_radius(d.x, d.y, d.z):
            return p[axis]
    return 0.0


def rock(s):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    for v in bm.verts:
        u = v.co.normalized()
        k = lump(tuple(u))
        v.co = Vector((u.x * RX * k, u.y * RY * k, u.z * RZ * k)) + RC
        if v.co.x > XCUT:
            v.co.x = XCUT
    bm.normal_update()
    mats = ['ceramic', 'ceramic.cut', 'ceramic.ore']
    for f in bm.faces:
        c = f.calc_center_median()
        if f.normal.x > 0.97 and c.x > XCUT - 0.05:
            f.material_index = 1
        else:
            u = (c - RC)
            seam = math.sin(0.55 * u.x + 0.35 * u.y) + 0.6 * math.sin(0.4 * u.z - 0.3 * u.y + 1.0)
            if abs(seam) < 0.13:
                f.material_index = 2
    return s.add(F._new_object('Rock', bm, s.slots(mats), bevel=0.0, smooth_angle=16.0))


def boulder(s, name, center, radius, seed, finish='ceramic'):
    """A faceted boulder half-sunk into the rock surface (breaks up the big lump's silhouette)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for i, v in enumerate(bm.verts):
        k = 0.75 + 0.45 * (0.5 + 0.5 * math.sin(seed * 12.9898 + i * 78.233))
        v.co *= radius * k
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(seed * 1.7, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    return s.add(F._new_object(name, bm, s.slots([finish]), bevel=0.0, smooth_angle=16.0))


def rock_point(theta, phi, sink=0.35):
    """A point on the rock surface at spherical angles (degrees), pulled `sink` of the way in."""
    t, p = math.radians(theta), math.radians(phi)
    d = Vector((math.cos(p) * math.cos(t), math.cos(p) * math.sin(t), math.sin(p)))
    r = rock_radius(d.x, d.y, d.z)
    return RC + d * r * (1.0 - sink * 0.08)


# --- build ------------------------------------------------------------------------------------

def build_cradle(s):
    rock(s)
    for k, (th, ph, r) in enumerate(((150, 30, 3.2), (200, 45, 2.6), (110, 55, 2.4), (250, 20, 3.0),
                                     (175, 70, 2.2), (90, 15, 2.8), (270, 50, 2.4), (210, -10, 3.0),
                                     (130, -20, 2.6), (60, 40, 2.0), (300, 30, 2.2))):
        boulder(s, f'Boulder{k}', tuple(rock_point(th, ph)), r, seed=k + 3,
                finish='ceramic.ore' if k % 4 == 1 else 'ceramic')
    # rails and cross members of the cradle frame
    F.box(s, 'Rail', (-24.5, RAIL_Y, RAIL_Z), (53.0, 2.6, 3.2), material='paint2', bevel=0.15, mirror=True)
    for x in (-48.0, -1.5):
        F.band(s, 'Rail', (x, RAIL_Y, 0), (1, 0, 0), 1.6, 'hazard', mirror=True)
    F.band(s, 'Rail', (0, RAIL_Y, RAIL_Z - 0.6), (0, 0, 1), 0.7, 'paint.graphite', facing=(0, 1, 0), min_facing=0.7,
           inset=0.03, depth=-0.08, mirror=True)
    F.box(s, 'AftBeam', (-50.0, 0, RAIL_Z), (3.0, 2 * RAIL_Y + 2.6, 3.2), material='paint.graphite', bevel=0.15)
    F.band(s, 'AftBeam', (0, 0, 0), (0, 1, 0), 3.0, 'paint2', facing=(0, 0, 1))
    truss(s, 'UnderTruss', (-50.0, 0, -15.5), (-2.0, 0, -15.5), 3.0, 2.4, 12)
    for x in (-50.0, -2.0):
        beam(s, f'UnderPost{x:+.0f}', (x, 0, -15.0), (x, 0, RAIL_Z - 1.4), 1.4, material='paint.graphite')
    beam(s, 'UnderCradle', (-26.0, -RAIL_Y, RAIL_Z - 1.0), (-26.0, 0, -14.8), 1.2, material='gunmetal')
    beam(s, 'UnderCradle_M', (-26.0, RAIL_Y, RAIL_Z - 1.0), (-26.0, 0, -14.8), 1.2, material='gunmetal')
    # the rock rests on the under truss through a cradle pad
    F.box(s, 'CradlePad', (-26.0, 0, -13.6), (7.0, 5.0, 2.4), material='dark', bevel=0.1)
    # four hydraulic clamp arms from the rails biting into the rock flanks
    for k, x in enumerate((-38.0, -16.5)):
        for side in (1, -1):
            dy = abs(surface(x, side * 30.0, 2.0, 1))
            pad = Vector((x, side * (dy - 0.3), 2.0))
            base = Vector((x, side * (RAIL_Y - 1.2), RAIL_Z + 1.2))
            elbow = Vector((x, side * (RAIL_Y - 3.5), 9.0))
            nm = f'Clamp{k}{"P" if side > 0 else "S"}'
            F.box(s, nm + 'Knuckle', tuple(base), (3.6, 2.2, 2.6), material='paint.graphite', bevel=0.1)
            beam(s, nm + 'Upper', tuple(base), tuple(elbow), 1.8, 1.6, material='paint2', bevel=0.08)
            beam(s, nm + 'Fore', tuple(elbow), tuple(pad + Vector((0, side * 1.4, 0))), 1.5, 1.4, material='paint2',
                 bevel=0.08)
            F.cylinder(s, nm + 'Ram', tuple(base + Vector((0.95, -side * 0.6, 0.4))),
                       tuple(elbow + Vector((0.95, -side * 2.4, -2.6))), 0.35, material='bare', segments=10, bevel=0.0)
            F.cylinder(s, nm + 'RamBody', tuple(base + Vector((0.95, -side * 0.6, 0.4))),
                       tuple(base + (elbow - base) * 0.5 + Vector((0.95, -side * 1.5, -1.0))), 0.55,
                       material='paint.graphite', segments=10, bevel=0.0)
            F.box(s, nm + 'Pad', tuple(pad + Vector((0, side * 0.6, 0))), (4.2, 1.4, 4.2), material='dark', bevel=0.1)
            F.box(s, nm + 'Elbow', tuple(elbow), (2.4, 2.4, 2.4), material='paint.graphite', bevel=0.1)
    # two gantry cranes straddling the rock on the rails
    for g, x in enumerate(GANTRIES):
        for side in (1, -1):
            F.box(s, f'Leg{g}{side}', (x, side * RAIL_Y, 9.6), (2.2, 2.2, 22.0), material='paint2', bevel=0.1)
            F.box(s, f'Bogie{g}{side}', (x, side * RAIL_Y, RAIL_Z + 2.0), (5.0, 3.0, 1.2), material='paint.graphite',
                  bevel=0.08)
            beam(s, f'LegBrace{g}{side}', (x - 2.2, side * RAIL_Y, RAIL_Z + 2.4), (x, side * RAIL_Y, 8.0), 0.7,
                 material='gunmetal')
            beam(s, f'LegBraceB{g}{side}', (x + 2.2, side * RAIL_Y, RAIL_Z + 2.4), (x, side * RAIL_Y, 8.0), 0.7,
                 material='gunmetal')
        F.box(s, f'Girder{g}', (x, 0, 21.8), (3.0, 2 * RAIL_Y + 3.0, 2.6), material='paint2', bevel=0.12)
        for side in (1, -1):
            F.band(s, f'Girder{g}', (x, side * (RAIL_Y - 1.0), 0), (0, 1, 0), 1.2, 'hazard')
        F.band(s, f'Girder{g}', (x, 0, 21.8), (0, 0, 1), 0.6, 'paint.graphite', facing=(1, 0, 0), min_facing=0.7)
        F.band(s, f'Girder{g}', (x, 0, 21.8), (0, 0, 1), 0.6, 'paint.graphite', facing=(-1, 0, 0), min_facing=0.7)
        ty = 5.5 if g == 0 else -6.5
        F.box(s, f'Trolley{g}', (x, ty, 24.0), (4.4, 4.6, 2.2), material='paint.graphite', bevel=0.12)
        F.box(s, f'TrolleyCab{g}', (x + 2.6, ty, 23.4), (1.4, 2.8, 1.8), material='paint', bevel=0.08)
        gz = surface(x, ty, 30.0, 2) + 0.9
        for dy in (-1.1, 1.1):
            F.cylinder(s, f'Hoist{g}{dy:+.1f}', (x, ty + dy, 23.0), (x, ty + dy * 0.6, gz + 1.2), 0.14,
                       material='gunmetal', segments=6, bevel=0.0)
        F.box(s, f'Grab{g}', (x, ty, gz + 0.6), (3.2, 3.2, 1.4), material='paint.graphite', bevel=0.08)
        for e in (-1, 1):
            F.box(s, f'GrabJaw{g}{e}', (x + e * 1.5, ty, gz - 0.4), (0.6, 3.0, 2.2), material='dark', bevel=0.0,
                  rot=(0, e * 0.35, 0))


def build_cradle_details(s):
    lamps = []
    for g, x in enumerate(GANTRIES):
        for yy in (-14.0, -5.0, 5.0, 14.0):
            F.work_lamp(s, f'GLamp{g}{yy:+.0f}', (x + 1.9, yy, 21.2), aim=(0.5, 0.0, 1.0), size=1.1)
        F.beacon(s, f'GBeacon{g}', (x, RAIL_Y, 20.7 + 0.1), 'glow_amber', size=0.9, mirror=True)
    for x in (-45.0, -28.0, -10.0):
        F.work_lamp(s, f'RLamp{x:+.0f}', (x, RAIL_Y - 1.0, RAIL_Z + 2.2), aim=(0.0, -0.6, 1.0), size=1.2, mirror=True)
    rail_lights = []
    for i in range(18):
        x = -49.0 + i * 2.9
        for side in (1, -1):
            rail_lights.append(((x, side * (RAIL_Y + 1.32), RAIL_Z + 0.6), (0.5, 0.12, 0.3), 0.0))
    cluster(s, 'RailLights', rail_lights, 'glow_amber')
    # survey markers pinned on the rock and bore holes on the sawn face
    holes = []
    for i in range(5):
        for j in range(3):
            y = -9.0 + i * 4.5
            z = -5.0 + j * 5.0
            if abs(y) < 7.5 and abs(z) < 4.0:
                continue
            holes.append(((XCUT + 0.05, y, z), (0.2, 0.9, 0.9), 0.0))
    cluster(s, 'BoreHoles', holes, 'dark')
    for k, (th, ph) in enumerate(((160, 60), (220, 35), (125, 40), (190, 15), (240, 60))):
        p = rock_point(th, ph, sink=0.6)
        F.cylinder(s, f'Survey{k}', tuple(p), tuple(p + Vector((0, 0, 2.4))), 0.12, material='gunmetal', segments=6,
                   bevel=0.0)
        F.light(s, f'SurveyLamp{k}', tuple(p + Vector((0, 0, 2.5))), 'glow_amber' if k % 2 else 'glow_cyan', size=0.4)
    F.light(s, 'NavPortAft', (-50.0, RAIL_Y + 1.4, RAIL_Z + 1.0), 'glow_red', size=0.8)
    F.light(s, 'NavStbdAft', (-50.0, -RAIL_Y - 1.4, RAIL_Z + 1.0), 'glow_green', size=0.8)
    F.light(s, 'NavPortFwd', (1.0, RAIL_Y + 1.4, RAIL_Z + 1.0), 'glow_red', size=0.8)
    F.light(s, 'NavStbdFwd', (1.0, -RAIL_Y - 1.4, RAIL_Z + 1.0), 'glow_green', size=0.8)


def build_cutter(s):
    # crusher housing on the fore cross member, cutter drum biting into the sawn face
    F.box(s, 'FwdBeam', (-1.5, 0, RAIL_Z), (3.4, 2 * RAIL_Y + 2.6, 3.2), material='paint.graphite', bevel=0.15)
    F.band(s, 'FwdBeam', (0, 0, 0), (0, 1, 0), 3.0, 'paint2', facing=(0, 0, 1))
    F.box(s, 'Housing', (-4.2, 0, 1.2), (8.0, 17.0, 11.0), material='paint.graphite', bevel=0.25)
    F.band(s, 'Housing', (0, 0, 5.2), (0, 0, 1), 0.8, 'paint2', inset=0.05, depth=0.12)
    F.band(s, 'Housing', (-7.6, 0, 0), (1, 0, 0), 0.8, 'hazard', facing=(0, 0, 1))
    for side in (1, -1):
        F.box(s, f'DrumArm{side}', ((DRUM_X - 8.2) / 2, side * 7.6, 0.0), (abs(DRUM_X + 8.2) + 0.6, 1.4, 3.4), material='paint2', bevel=0.1)
    F.cylinder(s, 'Drum', (DRUM_X, -7.0, 0.0), (DRUM_X, 7.0, 0.0), 3.3, material='bare', segments=24, bevel=0.0,
               cap_material='paint.graphite')
    for yb in (-3.5, 0.0, 3.5):
        F.band(s, 'Drum', (0, yb, 0), (0, 1, 0), 0.5, 'paint.graphite', inset=0.03, depth=0.12)
    teeth = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        for j in range(6):
            y = -6.0 + j * 2.4 + (0.6 if i % 2 else 0.0)
            teeth.append(((DRUM_X + 3.5 * math.cos(a), y, 3.5 * math.sin(a)), (0.9, 0.5, 0.5), 0.0))
    cluster(s, 'Teeth', teeth, 'dark')
    # spoil chute under the drum funnels the cut ore into the housing
    F.box(s, 'SpoilChute', ((DRUM_X - 8.2) / 2 + 0.3, 0, -4.9), (abs(DRUM_X + 8.2) + 1.2, 12.0, 2.6),
          material='paint.graphite', bevel=0.1, taper=1.18)
    F.box(s, 'SpoilChuteMouth', ((DRUM_X - 8.2) / 2 + 0.3, 0, -3.55), (abs(DRUM_X + 8.2) + 2.2, 13.6, 0.14),
          material='dark', bevel=0.0)
    # hot bite: glowing seams on the sawn face where the drum cuts
    F.box(s, 'BiteTop', (XCUT + 0.1, 0, 3.75), (0.3, 13.4, 0.5), material='glow_amber', bevel=0.0)
    F.box(s, 'BiteLow', (XCUT + 0.1, 0, -3.75), (0.3, 13.4, 0.5), material='glow_amber', bevel=0.0)
    # conveyors up into the mill (on top of the housing and riding up to the crusher towers)
    for side in (1, -1):
        y = side * 4.2
        p0, p1 = Vector((-2.5, y, 7.4)), Vector((10.0, y, 13.0))
        beam(s, f'Conveyor{side}', tuple(p0), tuple(p1), 2.4, 1.0, material='gunmetal')
        beam(s, f'Belt{side}', tuple(p0 + Vector((0, 0, 0.55))), tuple(p1 + Vector((0, 0, 0.55))), 1.8, 0.15,
             material='dark')
        for t in (0.3, 0.7):
            q = p0 + (p1 - p0) * t
            beam(s, f'ConvLeg{side}{t}', tuple(q - Vector((0, 0, 0.5))), (q.x, q.y, 5.0 if q.x < 0 else 4.5), 0.6,
                 material='paint.graphite')


def build_cutter_details(s):
    ore = []
    for side in (1, -1):
        y = side * 4.2
        p0, p1 = Vector((-2.5, y, 7.4)), Vector((10.0, y, 13.0))
        for i in range(10):
            t = (i + 0.4) / 10
            q = p0 + (p1 - p0) * t
            w = 0.7 + 0.3 * math.sin(i * 2.1 + side)
            ore.append(((q.x, q.y + 0.25 * math.sin(i * 1.7), q.z + 0.95), (w, w * 0.9, w * 0.6), i * 0.7))
    cluster(s, 'BeltOre', ore, 'ceramic.ore')
    for side in (1, -1):
        F.work_lamp(s, f'DrumLamp{side}', (-7.8, side * 8.2, 7.2), aim=(-0.7, -side * 0.3, 0.7), size=1.2)
    win = [((-8.25, -6.0 + i * 1.5, 5.4), (0.12, 0.8, 0.5), 0.0) for i in range(9)]
    cluster(s, 'HousingWin', win, 'glow_warm')


def build_mill(s):
    # the mill block, crusher towers with hopper heads, silos, smelter (port), hab (starboard)
    F.box(s, 'Mill', (8.0, 0, 0.5), (13.0, 13.0, 11.0), material='paint.graphite', bevel=0.25)
    F.band(s, 'Mill', (8.0, 0, 3.2), (0, 0, 1), 0.7, 'paint2', inset=0.05, depth=0.12)
    for side in (1, -1):
        y = side * 4.4
        F.box(s, f'Crusher{side}', (13.0, y, 5.0), (6.0, 6.0, 20.0), material='paint', bevel=0.2)
        for zb in (0.5, 6.5):
            F.band(s, f'Crusher{side}', (13.0, y, zb), (0, 0, 1), 0.8, 'paint2', inset=0.05, depth=0.12)
        F.band(s, f'Crusher{side}', (13.0, y, 13.6), (0, 0, 1), 0.7, 'hazard')
        F.box(s, f'HopperHead{side}', (13.0, y, 16.6), (5.4, 5.4, 3.2), material='paint2', bevel=0.1, taper=1.35)
        F.box(s, f'HopperMouth{side}', (13.0, y, 18.25), (6.6, 6.6, 0.12), material='dark', bevel=0.0)
        F.box(s, f'Chute{side}', (13.0, y, -6.6), (3.0, 3.0, 3.6), material='paint.graphite', bevel=0.08, taper=1.6)
    # silos
    for i, x in enumerate((21.0, 27.0)):
        for side in (1, -1):
            y = side * 6.0
            nm = f'Silo{i}{"P" if side > 0 else "S"}'
            F.cylinder(s, nm, (x, y, -9.0), (x, y, 8.0), 2.8, material='paint', segments=24, bevel=0.0,
                       cap_material='paint.graphite')
            F.band(s, nm, (x, y, 4.0), (0, 0, 1), 0.9, 'paint2', inset=0.04, depth=0.12)
            F.band(s, nm, (x, y, -4.0), (0, 0, 1), 0.6, 'paint.graphite', inset=0.04, depth=0.1)
            F.cylinder(s, nm + 'Cone', (x, y, -9.0), (x, y, -13.0), 2.8, 0.8, material='gunmetal', segments=24,
                       bevel=0.0)
    truss(s, 'SiloTruss', (16.0, 0, -2.0), (30.0, 0, -2.0), 3.0, 2.4, 5)
    for x in (21.0, 27.0):
        beam(s, f'SiloTie{x:+.0f}', (x, -6.0, 0.0), (x, 6.0, 0.0), 1.0, material='paint.graphite')
        beam(s, f'SiloGallery{x:+.0f}', (x, -6.0, 8.3), (x, 6.0, 8.3), 1.2, 0.6, material='gunmetal')
    # smelter on the port side (emissive socket): glowing louvres on top
    F.box(s, 'Smelter', (3.0, 16.4, 0.0), (13.0, 7.2, 8.4), material='paint.graphite', bevel=0.25)
    F.band(s, 'Smelter', (3.0, 16.4, 2.6), (0, 0, 1), 0.5, 'paint2', inset=0.04, depth=0.1)
    F.box(s, 'SmelterNeck', (5.0, 10.8, 0.0), (5.0, 4.4, 5.0), material='paint2', bevel=0.12)
    for k, x in enumerate((-1.2, 3.0, 7.2)):
        F.box(s, f'SmWell{k}', (x, 16.4, 4.25), (3.2, 5.4, 0.3), material='glow_amber', bevel=0.0)
        for j in range(5):
            F.box(s, f'SmSlat{k}{j}', (x, 14.2 + j * 1.1, 4.5), (3.4, 0.35, 0.25), material='gunmetal', bevel=0.0,
                  rot=(0.5, 0, 0))
    F.cylinder(s, 'SmStack', (9.0, 18.4, 4.2), (9.0, 18.4, 12.0), 1.2, 1.0, material='paint', segments=16,
               bevel=0.0, cap_material='dark')
    F.band(s, 'SmStack', (9.0, 18.4, 10.8), (0, 0, 1), 0.7, 'hazard')
    F.cylinder(s, 'SmStackHot', (9.0, 18.4, 11.95), (9.0, 18.4, 12.15), 0.7, material='glow_amber', segments=12,
               bevel=0.0)
    # crew hab on the starboard side
    F.plate(s, 'Hab', [(10.0, -11.5), (10.0, -18.5), (8.0, -20.5), (-3.0, -20.5), (-5.0, -18.5), (-5.0, -11.5)],
            z0=-3.8, thickness=8.8, material='paint', chamfer=0.45, bevel=0.2)
    F.band(s, 'Hab', (0, 0, 0.6), (0, 0, 1), 0.6, 'paint2', inset=0.05, depth=0.1)
    F.plate(s, 'HabBridge', [(9.0, -12.8), (9.0, -17.4), (1.0, -17.4), (1.0, -12.8)], z0=4.8, thickness=2.6,
            material='paint2', chamfer=0.3, bevel=0.1)
    F.band(s, 'HabBridge', (8.5, -15.1, 0), (1, 0, 0), 1.1, 'glass', facing=(1, 0, 0.3), min_facing=0.3)
    F.box(s, 'HabNeck', (5.0, -10.4, 0.0), (5.0, 3.4, 4.6), material='paint.graphite', bevel=0.12)
    F.cylinder(s, 'DishMast', (-2.0, -16.0, 4.8), (-2.0, -16.0, 7.6), 0.4, material='gunmetal', segments=10, bevel=0.0)
    F.dish(s, 'Dish', (-2.0, -16.0, 7.6), 2.8, 0.9, axis=(0.3, -0.5, 1.0), material='gunmetal', face='paint')


def build_roofs(s):
    F.panel(s, 'Mill', (6.0, 0.0), (8.0, 9.0), 'dark', inset=0.1, depth=-0.12)
    for k, (x, y) in enumerate(((4.0, -2.4), (4.0, 2.4), (8.2, -2.4), (8.2, 2.4))):
        F.cylinder(s, f'Fan{k}', (x, y, 5.9), (x, y, 6.5), 1.6, material='gunmetal', segments=16, bevel=0.0,
                   cap_material='dark')
        F.box(s, f'FanHub{k}', (x, y, 6.55), (0.7, 0.7, 0.15), material='paint2', bevel=0.0)
    F.box(s, 'MillCab', (12.4, 0.0, 6.6), (2.8, 3.4, 1.6), material='paint', bevel=0.06)
    F.panel(s, 'Housing', (-4.2, -4.5), (5.0, 4.0), 'paint2', inset=0.08, depth=0.1)
    F.panel(s, 'Housing', (-4.2, 4.5), (5.0, 4.0), 'paint2', inset=0.08, depth=0.1)
    F.panel(s, 'FwdBeam', (-1.5, 14.0), (2.4, 8.0), 'dark', inset=0.06, depth=-0.08)
    F.panel(s, 'FwdBeam', (-1.5, -14.0), (2.4, 8.0), 'dark', inset=0.06, depth=-0.08)


def build_mill_details(s):
    wins = []
    for z in (-1.6, 0.8, 3.2):
        for i in range(11):
            wins.append(((-4.2 + i * 1.3, -20.55, z), (0.6, 0.12, 0.45), 0.0))
        for i in range(5):
            wins.append(((-5.05, -12.3 - i * 1.5, z), (0.12, 0.6, 0.45), 0.0))
            wins.append(((10.05, -12.3 - i * 1.5, z), (0.12, 0.6, 0.45), 0.0))
    for i in range(5):
        wins.append(((2.0 + i * 1.4, -17.45, 6.0), (0.7, 0.12, 0.55), 0.0))
    for side in (1, -1):
        for zz in range(-3, 12, 3):
            wins.append(((16.05, side * 4.4, zz), (0.12, 0.8, 0.5), 0.0))
            wins.append(((16.05, side * 4.4 + 1.4, zz), (0.12, 0.8, 0.5), 0.0))
    for i in range(7):
        wins.append(((14.55, -4.5 + i * 1.5, 2.8), (0.12, 0.8, 0.5), 0.0))
    cluster(s, 'Windows', wins, 'glow_warm')
    F.beacon(s, 'HabBeacon', (5.0, -15.1, 7.4), 'glow_amber', size=0.6)
    F.antenna(s, 'HabMast', (-3.5, -19.5, 5.0), 3.5)
    for side in (1, -1):
        F.light(s, f'CrusherTop{side}', (15.6, side * 6.9, 15.2), 'glow_red', size=0.45)
    F.light(s, 'SmelterNav', (3.0, 20.1, 1.0), 'glow_red', size=0.6)
    F.light(s, 'HabNav', (2.5, -20.6, 1.0), 'glow_green', size=0.6)


def build_dock(s):
    truss(s, 'DockTruss', (27.0, 0, -2.0), (42.0, 0, -2.0), 3.0, 2.4, 6)
    F.cylinder(s, 'ArmTube', (29.0, 0, 2.4), (39.5, 0, 2.4), 2.1, material='paint', segments=24, bevel=0.0)
    F.band(s, 'ArmTube', (34.2, 0, 0), (1, 0, 0), 0.8, 'paint2', inset=0.05, depth=0.12)
    F.box(s, 'ArmRoot', (28.5, 0, 1.4), (3.6, 6.0, 6.0), material='paint.graphite', bevel=0.15)
    F.cylinder(s, 'Collar', (39.5, 0, 2.4), (42.3, 0, 2.4), 3.2, 3.0, material='paint2', segments=32, bevel=0.1)
    F.band(s, 'Collar', (40.6, 0, 0), (1, 0, 0), 0.6, 'hazard')
    F.cylinder(s, 'Port', (42.2, 0, 2.4), (42.8, 0, 2.4), 2.3, material='gunmetal', segments=24, cap_material='dark',
               bevel=0.0)
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        F.light(s, f'PortLight{k}', (42.7, 2.8 * math.cos(a), 2.4 + 2.8 * math.sin(a)),
                'glow_green' if k % 2 else 'glow_amber', size=0.38)
    F.beacon(s, 'DockBeacon', (41.0, 0, 5.55), 'glow_amber', size=0.8)
    # parked ore hauler (starboard): graphite hull, three ochre ore skips, bridge forward
    hy = -9.0
    F.box(s, 'Hauler', (33.5, hy, 1.2), (15.0, 4.6, 2.6), material='paint.graphite', bevel=0.15)
    for k, x in enumerate((28.8, 32.4, 36.0)):
        F.box(s, f'Skip{k}', (x, hy, 3.4), (3.2, 4.2, 1.9), material='paint2', bevel=0.08, taper=1.08)
        F.box(s, f'SkipOre{k}', (x, hy, 4.38), (2.6, 3.6, 0.2), material='ceramic.ore', bevel=0.0)
    F.box(s, 'HaulerBridge', (39.6, hy, 3.2), (2.6, 3.2, 1.8), material='paint', bevel=0.08)
    F.band(s, 'HaulerBridge', (40.7, hy, 0), (1, 0, 0), 0.5, 'glass')
    for dy in (-1.2, 1.2):
        F.nozzle(s, f'HaulerDrive{dy:+.1f}', (25.3, hy + dy, 1.2), 0.9, 0.9, material='gunmetal')
    F.box(s, 'Gangway', (34.0, -4.4, 2.2), (2.0, 4.6, 1.5), material='paint.graphite', bevel=0.06)


def build_dock_details(s):
    w = []
    for side in (1, -1):
        for i in range(8):
            x = 30.0 + i * 1.15
            if abs(x - 34.2) < 0.7:
                continue
            w.append(((x, side * 2.06, 2.9), (0.55, 0.12, 0.42), 0.0))
    w += [((40.95, -9.0 + j * 0.8 - 0.8, 3.5), (0.12, 0.55, 0.4), 0.0) for j in range(3)]
    cluster(s, 'DockWin', w, 'glow_warm')
    F.light(s, 'HaulerNavP', (38.0, -9.0 + 2.35, 1.4), 'glow_red', size=0.3)
    F.light(s, 'HaulerNavS', (38.0, -9.0 - 2.35, 1.4), 'glow_green', size=0.3)
    run = [((30.0 + i * 2.0, 0, 4.55), (0.35, 0.35, 0.12), 0.0) for i in range(5)]
    cluster(s, 'ArmRunway', run, 'glow_green')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_cradle(s)
    build_cutter(s)
    build_mill(s)
    build_dock(s)
    build_roofs(s)
    s.detail = 1
    build_cradle_details(s)
    build_cutter_details(s)
    build_mill_details(s)
    build_dock_details(s)
    s.detail = 0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
