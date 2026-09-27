"""Deep-Space Research Array — Helios observatory station. Forge rebuild. "Telescope array round a glass core."

The station stands astride the flight plane (Blender z = 0): a glazed ivory lab sphere sits on the
plane, girdled by a teal equatorial ring. A vertical spine runs through it: up to a great open-truss
telescope on a fork mount (the silhouette the top-down camera remembers), down to a deep-space dish.
Four truss arms radiate in the flight plane, each carrying a lit service tube and radiator vanes:
+X ends in the docking hub (SOCKET_Dock_Approach), -X in the big survey dish, and the port/starboard
arms in paired dishes and sensor pods. Every pod and dish is carried by a visible truss or strut.
Palette: Helios ivory, research teal, dark machinery; cyan instrument lights, warm lab windows.
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_station_research'
COLORS = {
    'paint': '#716b5d',       # Helios ivory (brief #a69d8a is the ceiling; authored under it)
    'paint2': '#0f3536',      # research teal
    'stripe': '#17605d',      # teal livery bands
    'hazard': '#8c6a1a',
    'dark': '#15191d',
    'paint.graphite': '#262a2f',
}

CORE_R = 13.0


def boxes(s, name, items, material, bevel=0.0):
    """Local helper: many boxes in one part. items: (center, size[, rot_z])."""
    bm = bmesh.new()
    for it in items:
        c, sz = it[0], it[1]
        rz = it[2] if len(it) > 2 else 0.0
        m = Matrix.Translation(c) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Diagonal((sz[0], sz[1], sz[2], 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def beams(s, name, segs, r, material='gunmetal', sides=6):
    """Local helper: many thin prismatic members (truss chords, braces, struts) in one part."""
    bm = bmesh.new()
    for a, b in segs:
        a, b = Vector(a), Vector(b)
        ax = b - a
        if ax.length < 1e-4:
            continue
        rot = Vector((0, 0, 1)).rotation_difference(ax.normalized()).to_matrix().to_4x4()
        m = Matrix.Translation(a) @ rot
        v0 = [bm.verts.new(m @ Vector((r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides), 0)))
              for i in range(sides)]
        v1 = [bm.verts.new(m @ Vector((r * math.cos(2 * math.pi * i / sides), r * math.sin(2 * math.pi * i / sides),
                                       ax.length))) for i in range(sides)]
        for i in range(sides):
            j = (i + 1) % sides
            bm.faces.new((v0[i], v0[j], v1[j], v1[i]))
        bm.faces.new(list(reversed(v0)))
        bm.faces.new(v1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.0, smooth_angle=50.0))


def truss(p0, p1, w, bays, up=(0, 0, 1)):
    """Square box truss between two points: 4 chords + zig-zag braces on the four faces + frames."""
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0)
    t = ax.normalized()
    u = Vector(up)
    if abs(t.dot(u)) > 0.9:
        u = Vector((1, 0, 0))
    sd = t.cross(u).normalized() * (w / 2)
    nu = sd.cross(t).normalized() * (w / 2)
    corners = [sd + nu, -sd + nu, -sd - nu, sd - nu]
    segs = [(p0 + c, p1 + c) for c in corners]
    for k in range(bays + 1):
        q = p0 + ax * (k / bays)
        for i in range(4):
            segs.append((q + corners[i], q + corners[(i + 1) % 4]))
        if k < bays:
            q2 = p0 + ax * ((k + 1) / bays)
            for i in range(4):
                a, b = (corners[i], corners[(i + 1) % 4]) if k % 2 == 0 else (corners[(i + 1) % 4], corners[i])
                segs.append((q + a, q2 + b))
    return segs


def sphere(s, name, center, r, material='paint', count=48, rings=18, zscale=1.0):
    cx, cy, cz = center
    secs = []
    for i in range(rings + 1):
        a = -math.pi / 2 + math.pi * i / rings
        x = cx + r * math.sin(a)
        w = max(r * math.cos(a), 0.02)
        secs.append(dict(x=x, w=w, ht=w * zscale, hb=w * zscale, zc=cz, n=2.0, y=cy))
    return F.loft(s, name, secs, material=material, count=count, bevel=0.0, smooth_angle=80.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    trusses = []      # all truss members, one part
    struts = []       # heavier struts

    # --- glass core: ivory lab sphere with glazed deck bands and a teal equator ---------------
    core = sphere(s, 'Core', (0, 0, 0), CORE_R, count=64, rings=24)
    for z, w in ((-7.5, 1.3), (-2.6, 1.1), (5.5, 1.2), (9.6, 1.0)):
        F.band(s, 'Core', (0, 0, z), (0, 0, 1), w, 'glass', min_facing=-1.0)
    F.band(s, 'Core', (0, 0, 1.4), (0, 0, 1), 1.6, 'paint2', inset=0.05, depth=0.12, min_facing=-1.0)
    # lit lab windows round the glazed decks
    win = []
    for z, n in ((-7.5, 34), (-2.6, 44), (5.5, 40), (9.6, 30)):
        rr = math.sqrt(CORE_R ** 2 - z ** 2) + 0.02
        for i in range(n):
            a = 2 * math.pi * (i + 0.5) / n
            if z > -3 and z < 0 and any(abs(((a - b + math.pi) % (2 * math.pi)) - math.pi) < 0.17
                                        for b in (0, math.pi / 2, math.pi, 3 * math.pi / 2)):
                continue
            win.append(((rr * math.cos(a), rr * math.sin(a), z), (0.2, 0.9, 0.55), a))
    # crown observatory dome (glass cap) with a ring of skylights
    sphere(s, 'Crown', (0, 0, CORE_R - 1.4), 5.0, material='glass', count=40, rings=12, zscale=0.8)
    F.ring(s, 'CrownRim', (0, 0, CORE_R - 1.0), 5.2, 0.5, axis=(0, 0, 1), material='paint2', segments=40, sides=8)
    # equatorial ring: the teal halo that frames the core from above, braced to the sphere
    F.ring(s, 'Equator', (0, 0, 0.0), 19.0, 1.5, axis=(0, 0, 1), material='paint2', segments=72, sides=12)
    F.ring(s, 'EquatorTrim', (0, 0, 1.45), 19.0, 0.35, axis=(0, 0, 1), material='stripe', segments=72, sides=6)
    for i in range(12):
        a = 2 * math.pi * (i + 0.5) / 12
        c, sn = math.cos(a), math.sin(a)
        struts.append(((CORE_R * 0.93 * c, CORE_R * 0.93 * sn, 0.0), (17.6 * c, 17.6 * sn, 0.0)))
    # ring windows (a lit habitat torus)
    for i in range(48):
        a = 2 * math.pi * (i + 0.5) / 48
        if min(abs(((a - b + math.pi) % (2 * math.pi)) - math.pi) for b in (0, math.pi / 2, math.pi, 1.5 * math.pi)) < 0.12:
            continue
        rr = 20.5
        win.append(((rr * math.cos(a), rr * math.sin(a), 0.0), (0.2, 0.9, 0.5), a))
        win.append(((19.0 * math.cos(a), 19.0 * math.sin(a), 1.52), (0.9, 0.5, 0.06), a))

    # --- vertical spine: up to the telescope, down to the deep-space dish ----------------------
    F.cylinder(s, 'SpineUp', (0, 0, CORE_R - 2.0), (0, 0, 34.0), 2.2, 1.8, material='paint', segments=24,
               cap_material='dark')
    F.cylinder(s, 'SpineDown', (0, 0, -CORE_R + 2.0), (0, 0, -38.0), 2.2, 1.6, material='paint', segments=24,
               cap_material='dark')
    for z in (18.0, 24.0, 30.0, -18.0, -24.0, -30.0):
        F.cylinder(s, f'SpineCollar{z}', (0, 0, z - 0.4), (0, 0, z + 0.4), 2.6, material='paint2', segments=24)
    for z in (21.0, 27.0, -21.0, -27.0):
        for i in range(8):
            a = 2 * math.pi * i / 8
            win.append(((2.12 * math.cos(a), 2.12 * math.sin(a), z), (0.2, 0.55, 1.2), a))
    # telescope: fork mount on a turntable, open Serrurier-truss tube tilted toward -X
    F.cylinder(s, 'Turntable', (0, 0, 33.6), (0, 0, 35.2), 7.2, 7.0, material='paint2', segments=40,
               cap_material='paint')
    F.ring(s, 'TurntableRim', (0, 0, 35.2), 7.0, 0.3, axis=(0, 0, 1), material='stripe', segments=40, sides=6)
    for sy in (1, -1):
        F.box(s, f'Fork{sy}', (0, sy * 6.4, 39.0), (3.6, 1.3, 8.0), material='paint', bevel=0.2, taper=0.8)
    tilt = math.radians(24.0)
    axis = Vector((-math.sin(tilt), 0.0, math.cos(tilt)))
    pivot = Vector((0.0, 0.0, 41.5))
    F.cylinder(s, 'Trunnion', (0, 6.9, 41.5), (0, -6.9, 41.5), 0.9, material='gunmetal', segments=16)
    mirror_c = pivot - axis * 4.5
    top_c = pivot + axis * 11.5
    F.cylinder(s, 'MirrorCell', tuple(mirror_c - axis * 1.5), tuple(mirror_c + axis * 0.6), 5.6, 5.6,
               material='paint2', segments=40, cap_material='dark')
    F.ring(s, 'MirrorRing', tuple(mirror_c + axis * 0.6), 5.4, 0.35, axis=tuple(axis), material='paint', segments=40,
           sides=8)
    F.cylinder(s, 'Mirror', tuple(mirror_c + axis * 0.55), tuple(mirror_c + axis * 0.7), 5.0, material='glass',
               segments=40, cap_material='glass')
    F.ring(s, 'TopRing', tuple(top_c), 5.4, 0.6, axis=tuple(axis), material='paint', segments=40, sides=8)
    F.ring(s, 'TopRingTrim', tuple(top_c + axis * 0.55), 5.4, 0.25, axis=tuple(axis), material='stripe', segments=40,
           sides=6)
    sx = Vector((math.cos(tilt), 0.0, math.sin(tilt)))
    sy_ = Vector((0.0, 1.0, 0.0))
    for i in range(8):
        a0 = 2 * math.pi * i / 8
        a1 = 2 * math.pi * (i + 1) / 8
        pa = mirror_c + axis * 0.6 + (sx * math.cos(a0) + sy_ * math.sin(a0)) * 5.3
        pb = top_c + (sx * math.cos(a1) + sy_ * math.sin(a1)) * 5.3
        pc = top_c + (sx * math.cos(a0 - (a1 - a0)) + sy_ * math.sin(a0 - (a1 - a0))) * 5.3
        trusses.append((tuple(pa), tuple(pb)))
        trusses.append((tuple(pa), tuple(pc)))
    # secondary mirror on a spider
    sec = top_c - axis * 0.5
    F.cylinder(s, 'Secondary', tuple(sec - axis * 0.6), tuple(sec + axis * 0.6), 1.1, material='paint2', segments=20,
               cap_material='dark')
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        trusses.append((tuple(sec), tuple(sec + (sx * math.cos(a) + sy_ * math.sin(a)) * 5.3)))
    F.light(s, 'ScopeTip', tuple(top_c + axis * 0.9 + sx * 5.4), 'glow_red', size=0.5)
    # keel: a lab drum on the lower spine, then the deep-space dish aimed aft and down
    F.cylinder(s, 'LabDrum', (0, 0, -19.5), (0, 0, -26.5), 5.2, material='paint', segments=40,
               cap_material='paint2')
    F.band(s, 'LabDrum', (0, 0, -23.0), (0, 0, 1), 1.2, 'paint2', inset=0.04, depth=0.1, min_facing=-1.0)
    for z in (-21.0, -25.0):
        for i in range(20):
            a = 2 * math.pi * (i + 0.5) / 20
            win.append(((5.22 * math.cos(a), 5.22 * math.sin(a), z), (0.2, 0.9, 0.6), a))
    kd = Vector((-0.62, 0.0, -0.78))
    kc = Vector((0.0, 0.0, -38.0)) + kd * 2.2
    F.cylinder(s, 'KeelDishHub', (0, 0, -37.0), tuple(kc), 1.8, 1.3, material='paint2', segments=20)
    F.dish(s, 'KeelDish', tuple(kc), 7.5, 2.3, axis=tuple(kd), material='paint2', face='paint', segments=48)
    F.light(s, 'KeelTip', (0.0, 0.0, -38.3), 'glow_red', size=0.5)

    # --- four truss arms in the flight plane --------------------------------------------------
    arms = [((1, 0), 20.2, 31.0), ((-1, 0), 20.2, 36.0), ((0, 1), 20.2, 30.0), ((0, -1), 20.2, 30.0)]
    for k, ((dx, dy), r0, r1) in enumerate(arms):
        p0 = (dx * r0, dy * r0, 0.0)
        p1 = (dx * r1, dy * r1, 0.0)
        trusses += truss(p0, p1, 3.6, int((r1 - r0) / 3.2))
        # pressurised service tube inside the truss, lit window strip on top
        F.cylinder(s, f'Tube{k}', (dx * (r0 + 0.3), dy * (r0 + 0.3), 0.0), (dx * (r1 - 0.2), dy * (r1 - 0.2), 0.0),
                   1.05, material='paint', segments=16, cap=False)
        n = int((r1 - r0) / 1.6)
        for i in range(n):
            rr = r0 + 1.0 + (r1 - r0 - 2.0) * (i + 0.5) / n
            win.append(((dx * rr, dy * rr, 1.02), (0.9 if dx else 0.35, 0.35 if dx else 0.9, 0.1)))
        # radiator vanes: dark panels hung off each arm (dark value share from above)
        for side in (1, -1):
            ox, oy = -dy * side, dx * side
            for j in range(2):
                a0 = r0 + 2.0 + j * (r1 - r0 - 3.0) / 2
                a1 = a0 + (r1 - r0 - 5.0) / 2
                cx, cy = dx * (a0 + a1) / 2 + ox * 4.4, dy * (a0 + a1) / 2 + oy * 4.4
                L = a1 - a0
                boxes(s, f'Vane{k}{side}{j}', [((cx, cy, 0.0), (L if dx else 5.0, 5.0 if dx else L, 0.18))],
                      'paint.graphite', bevel=0.04)
                F.box(s, f'VaneFrame{k}{side}{j}', (cx, cy, 0.0), (L + 0.4 if dx else 5.4, 5.4 if dx else L + 0.4, 0.1),
                      material='gunmetal', bevel=0.0)
        # arm root collar on the equator ring
        F.box(s, f'ArmRoot{k}', (dx * 19.8, dy * 19.8, 0.0), (4.6 if dx else 5.6, 5.6 if dx else 4.6, 4.6),
              material='paint', bevel=0.3)
        F.band(s, f'ArmRoot{k}', (0, 0, 0), (0, 0, 1), 1.0, 'stripe', min_facing=-1.0)

    # +X: docking hub (the dock approach sits in front of its collar)
    F.cylinder(s, 'DockHub', (30.0, 0, 0), (38.0, 0, 0), 4.2, material='paint', segments=40, cap_material='paint2')
    F.cylinder(s, 'DockCollar', (38.0, 0, 0), (39.6, 0, 0), 3.0, 2.6, material='paint2', segments=32,
               cap_material='dark')
    F.ring(s, 'DockLightRing', (39.7, 0, 0), 2.7, 0.18, axis=(1, 0, 0), material='glow_amber', segments=32, sides=6)
    F.band(s, 'DockHub', (33.0, 0, 0), (1, 0, 0), 1.0, 'stripe', inset=0.04, depth=0.08)
    F.band(s, 'DockHub', (36.6, 0, 0), (1, 0, 0), 0.5, 'hazard')
    for sy in (1, -1):
        F.cylinder(s, f'Berth{sy}', (34.0, sy * 3.6, 0), (34.0, sy * 7.2, 0), 1.9, 1.7, material='paint', segments=24,
                   cap_material='paint2')
        F.ring(s, f'BerthLights{sy}', (34.0, sy * 7.25, 0), 1.6, 0.14, axis=(0, 1, 0), material='glow_green', segments=24,
               sides=6)
        F.light(s, f'BerthBeacon{sy}', (34.0, sy * 6.0, 1.9), 'glow_amber', size=0.4)
    for i in range(10):
        a = 2 * math.pi * (i + 0.5) / 10
        win.append(((34.0 + (i % 2) * 2.5, 4.22 * math.cos(a), 4.22 * math.sin(a)), (0.9, 0.5, 0.5), 0.0))
    # a Helios shuttle docked at the port berth: scale reference
    F.loft(s, 'Shuttle', [
        dict(x=31.6, w=0.9, ht=0.8, hb=0.7, zc=0.0, n=2.4, y=10.5),
        dict(x=32.2, w=1.3, ht=1.1, hb=0.9, zc=0.0, n=2.6, y=10.5),
        dict(x=36.4, w=1.3, ht=1.1, hb=0.9, zc=0.0, n=2.6, y=10.5),
        dict(x=37.6, w=0.7, ht=0.6, hb=0.5, zc=-0.05, n=2.2, y=10.5),
    ], material='paint', belly='paint2', back_material='dark', count=24)
    F.cylinder(s, 'ShuttleLock', (34.0, 7.2, 0.0), (34.0, 9.4, 0.0), 0.8, material='paint2', segments=12)
    F.band(s, 'Shuttle', (36.9, 10.5, 0), (1, 0, 0), 0.6, 'glass', facing=(0.6, 0, 0.8), min_facing=0.3)
    F.band(s, 'Shuttle', (33.0, 10.5, 0), (1, 0, 0), 0.4, 'stripe')
    # approach light string ahead of the collar, carried on a boom
    trusses.append(((39.6, 0, -2.6), (46.0, 0, -2.6)))
    boxes(s, 'ApproachLights', [((41.0 + i * 1.3, 0, -2.6), (0.35, 0.35, 0.35)) for i in range(5)], 'glow_green')
    F.light(s, 'ApproachEnd', (46.3, 0, -2.6), 'glow_red', size=0.6)

    # -X: survey dish, the big one, on a yoke facing up-aft
    F.box(s, 'SurveyYoke', (-38.5, 0, 0.0), (5.0, 7.0, 4.0), material='paint', bevel=0.3)
    F.cylinder(s, 'SurveyMast', (-38.5, 0, 1.5), (-41.6, 0, 9.4), 1.2, material='paint2', segments=16)
    F.cylinder(s, 'SurveyHub', (-41.0, 0, 9.1), (-42.4, 0, 11.2), 2.4, 1.6, material='paint', segments=24,
               cap_material='dark')
    F.dish(s, 'Survey', (-42.0, 0.0, 10.0), 12.0, 3.4, axis=(-0.55, 0.0, 0.84), material='paint', face='paint2',
           segments=48)
    # port / starboard: paired dishes and sensor pods on T-bars
    for sy in (1, -1):
        F.box(s, f'TBar{sy}', (0.0, sy * 30.5, 0.0), (22.0, 2.4, 2.4), material='paint', bevel=0.25)
        F.band(s, f'TBar{sy}', (0, 0, 0), (1, 0, 0), 1.2, 'stripe', min_facing=-1.0)
        for ex in (-1, 1):
            F.dish(s, f'SideDish{sy}{ex}', (ex * 9.0, sy * 30.5, 4.4), 6.5, 1.8,
                   axis=(ex * 0.35, sy * 0.3, 0.89), material='paint', face='paint2', segments=40)
            F.cylinder(s, f'SideDishPost{sy}{ex}', (ex * 9.0, sy * 30.5, 1.1), (ex * 9.0, sy * 30.5, 4.6), 0.7,
                       material='gunmetal', segments=12)
        # sensor pod at the arm tip, below the T-bar, on a strut
        F.cylinder(s, f'PodStrut{sy}', (0.0, sy * 31.2, -1.0), (0.0, sy * 34.0, -3.5), 0.6, material='gunmetal',
                   segments=10)
        sphere(s, f'Pod{sy}', (0.0, sy * 35.0, -4.2), 2.6, material='paint2', count=24, rings=10)
        F.band(s, f'Pod{sy}', (0, 0, -4.2), (0, 0, 1), 0.6, 'glow_cyan', min_facing=-1.0)
        F.light(s, f'Nav{sy}', (0.0, sy * 31.9, 1.4), 'glow_red' if sy > 0 else 'glow_green', size=0.6)

    # --- lower half: diagonal service arms to instrument booms (keeps the tall read) -----------
    for k, (dx, dy) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        a = (dx * 17.0, dy * 17.0, -2.0)
        b = (dx * 26.0, dy * 26.0, -22.0)
        trusses += truss(a, b, 2.0, 6)
        sphere(s, f'LowPod{k}', (dx * 27.0, dy * 27.0, -24.5), 3.2, material='paint', count=28, rings=12)
        F.band(s, f'LowPod{k}', (0, 0, -24.5), (0, 0, 1), 0.8, 'paint2', min_facing=-1.0)
        F.cylinder(s, f'LowPodMast{k}', (dx * 27.0, dy * 27.0, -27.5), (dx * 27.0, dy * 27.0, -34.0), 0.25,
                   material='gunmetal', segments=8)
        F.light(s, f'LowPodTip{k}', (dx * 27.0, dy * 27.0, -34.0), 'glow_cyan', size=0.4)
        for i in range(6):
            aa = 2 * math.pi * (i + 0.5) / 6
            win.append(((dx * 27.0 + 3.2 * math.cos(aa), dy * 27.0 + 3.2 * math.sin(aa), -24.0), (0.2, 0.7, 0.4), aa))
    # upper instrument masts on the equator ring (short, carrying cyan sensors)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        c, sn = math.cos(a), math.sin(a)
        F.cylinder(s, f'RingMast{i}', (19 * c, 19 * sn, 1.2), (19 * c, 19 * sn, 7.5), 0.35, material='gunmetal',
                   segments=10)
        F.sensor_dome(s, f'RingSensor{i}', (19 * c, 19 * sn, 7.5), 1.2, material='paint2')
        F.light(s, f'RingLamp{i}', (21.4 * c, 21.4 * sn, 0.0), 'glow_cyan', size=0.5)

    beams(s, 'Truss', trusses, 0.16, material='gunmetal')
    beams(s, 'Struts', struts, 0.45, material='paint2', sides=8)
    boxes(s, 'Windows', win, 'glow_warm')

    s.detail = 1
    for sy in (1, -1):
        F.antenna(s, f'Whip{sy}', (-2.0, sy * 3.5, 35.2), 3.0, tip='glow_red')
    for k, (dx, dy) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        F.work_lamp(s, f'ArmLamp{k}', (dx * 23.0 + dy * 2.2, dy * 23.0 + dx * 2.2, 2.4), aim=(dx * 0.5, dy * 0.5, 0.8),
                    size=0.6)
    s.detail = 0
    F.beacon(s, 'Beacon', (-3.2, 0.0, 35.2), size=0.5)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
