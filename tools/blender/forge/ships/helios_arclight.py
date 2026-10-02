"""Helios Arclight — Helios civil heavy hauler. Twin hulls, one arched spine, one big pod.

Plan read at the chase camera: a catamaran. Two long ivory hulls with lit window rows, joined at the
bow by a glazed bridge and aft by a drive beam with four drives. Between them hangs a deep-teal cargo
pod, slung from a tall arched spine (the "arc") that springs from bridge to drive beam; paired ribs
arch from each hull up to the spine, so from above the ship reads as a harp over its cargo.
"""
import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'helios_arclight'
COLORS = {
    'paint': '#bfb6a3',    # Helios ivory
    'paint2': '#0f4f4d',   # deep courier teal (key light lifts it ~2.5x)
    'stripe': '#0f4f4d',
    'hazard': '#c8901e',
    'paint.graphite': '#26292d',
    'glow_cyan.helios': '#2fe0cf',   # the courier teal lifted to light (identity trim)
}

HY = 4.4                 # hull centre lines (port +HY)
HW, HT, HB = 1.45, 1.4, 1.2
SX0, SX1 = -11.2, 11.0   # spine springing points
SZ0, SZ_APEX = 2.1, 5.3


def spine_z(x):
    t = (x - SX0) / (SX1 - SX0)
    return SZ0 + (SZ_APEX - SZ0) * math.sin(math.pi * max(0.0, min(1.0, t)))


def sweep(s, name, pts, hw, hh, side, material='paint', bevel=0.03):
    """Local helper (the kit has no path sweep): a rectangular beam swept along a 3D polyline.

    side: the beam's constant lateral axis (e.g. (0,1,0) for an arch in the XZ plane)."""
    bm = bmesh.new()
    sv = Vector(side).normalized()
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        t = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        up = t.cross(sv).normalized()
        if up.z < 0:
            up = -up
        sd = up.cross(t).normalized()
        rings.append([bm.verts.new(p + sd * a * hw + up * b * hh) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, b in zip(rings, rings[1:]):
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((a[j], a[k], b[k], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=35.0))


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Twin hulls: long rounded Helios hulls, teal belly, bow glass, lit window rows outboard.
    F.loft(s, 'Hull', [
        dict(x=-14.9, w=1.1, ht=1.05, hb=0.95, zc=0.0, n=2.5, y=HY),
        dict(x=-14.2, w=HW, ht=HT, hb=HB, zc=0.0, n=2.6, y=HY),
        dict(x=10.5, w=HW, ht=HT, hb=HB, zc=0.0, n=2.6, y=HY),
        dict(x=13.4, w=1.3, ht=1.2, hb=1.1, zc=-0.05, n=2.5, y=HY),
        dict(x=15.4, w=0.85, ht=0.72, hb=0.75, zc=-0.1, n=2.3, y=HY),
        dict(x=16.4, w=0.25, ht=0.2, hb=0.25, zc=-0.15, n=2.0, y=HY),
    ], material='paint', belly='paint2', back_material='dark', count=56, mirror=True)
    F.band(s, 'Hull', (15.0, HY, 0), (1, 0, 0), 1.6, 'glass', facing=(0.6, 0, 0.8), min_facing=0.45, mirror=True)
    F.band(s, 'Hull', (13.6, HY, 0), (1, 0, 0), 0.5, 'paint2', inset=0.02, depth=0.02, mirror=True)
    # Identity trim, lit: a thin teal ring on each hull's ivory just aft of the bow band (LOOK.md: lamps are light).
    F.band(s, 'Hull', (13.05, HY, 0), (1, 0, 0), 0.16, 'glow_cyan.helios', inset=0.01, depth=-0.02, mirror=True)
    F.band(s, 'Hull', (-12.6, HY, 0), (1, 0, 0), 0.8, 'paint2', inset=0.02, depth=0.02, mirror=True)
    F.band(s, 'Hull', (-1.0, HY, 0), (0, 1, 0), 0.5, 'stripe', facing=(0, 0, 1), min_facing=0.7, mirror=True)
    zw = 0.35
    yw = HY + HW * (1 - (zw / HT) ** 2.6) ** (1 / 2.6)
    F.box(s, 'GlazeStrip', (0.8, yw - 0.02, zw), (20.0, 0.08, 0.5), material='glass', bevel=0.02, mirror=True)
    F.windows(s, 'HullWin', -9.0, 10.6, yw + 0.03, zw, 18, size=(0.62, 0.34), mirror=True)
    F.windows(s, 'HullSky', -8.0, 9.6, HY + 0.62, HT - 0.05, 10, size=(0.72, 0.3), normal='z', mirror=True)

    # --- Bow bridge: a glazed deckhouse spanning the hulls.
    F.plate(s, 'BowDeck', [(12.6, HY - 0.4), (10.2, HY - 0.4), (9.4, 2.4), (9.4, -2.4), (10.2, -HY + 0.4),
                           (12.6, -HY + 0.4), (13.4, -1.6), (13.4, 1.6)], z0=0.1, thickness=1.2, material='paint',
            chamfer=0.18)
    F.loft(s, 'Bridge', [
        dict(x=9.0, w=1.6, ht=1.0, hb=0.6, zc=1.5, n=3.0),
        dict(x=9.6, w=1.9, ht=1.3, hb=0.6, zc=1.5, n=3.2),
        dict(x=12.4, w=1.9, ht=1.3, hb=0.6, zc=1.5, n=3.2),
        dict(x=13.6, w=1.5, ht=0.85, hb=0.6, zc=1.5, n=2.8),
        dict(x=14.1, w=0.8, ht=0.35, hb=0.6, zc=1.5, n=2.4),
    ], material='paint', count=48)
    F.band(s, 'Bridge', (13.3, 0, 2.2), (1, 0, 0), 1.6, 'glass', facing=(0.6, 0, 0.8), min_facing=0.3)
    F.band(s, 'Bridge', (10.6, 0, 0), (1, 0, 0), 0.5, 'paint2', inset=0.02, depth=0.02)
    F.windows(s, 'BridgeWin', 9.8, 12.2, 1.92, 1.75, 4, size=(0.44, 0.3), mirror=True)

    # --- Drive beam aft: spans the hulls, four drives (two in the hulls, two on the beam).
    F.plate(s, 'DriveBeam', [(-10.6, HY - 0.3), (-13.8, HY - 0.3), (-13.8, -HY + 0.3), (-10.6, -HY + 0.3)],
            z0=-0.7, thickness=1.9, material='paint2', chamfer=0.2)
    for y in (HY, 1.55, -1.55, -HY):
        F.nozzle(s, f'Nozzle{y:+.1f}', (-15.7 if abs(y) > 2 else -14.7, y, 0.0 if abs(y) > 2 else 0.25), 0.95, 1.1,
                 material='gunmetal')
    for y in (1.55, -1.55):
        F.cylinder(s, f'BeamDrive{y:+.1f}', (-14.0, y, 0.25), (-12.6, y, 0.25), 1.05, 1.0, material='paint',
                   segments=40, cap_material='dark')
        F.cylinder(s, f'BeamDriveRing{y:+.1f}', (-13.6, y, 0.25), (-13.25, y, 0.25), 1.12, material='paint2',
                   segments=40, cap=False)
    s.hook('HOOK_DRIVE_CORE', (-15.5, 0.0, 0.1))

    # --- Cargo pod: deep teal, boxy-round, ivory frame rings, slung between the hulls.
    F.loft(s, 'Pod', [
        dict(x=-10.0, w=1.9, ht=1.25, hb=1.35, zc=-0.2, n=3.2),
        dict(x=-9.4, w=2.45, ht=1.6, hb=1.75, zc=-0.2, n=3.8),
        dict(x=7.6, w=2.45, ht=1.6, hb=1.75, zc=-0.2, n=3.8),
        dict(x=8.6, w=2.1, ht=1.3, hb=1.4, zc=-0.2, n=3.2),
        dict(x=9.1, w=1.5, ht=0.9, hb=1.0, zc=-0.2, n=2.8),
    ], material='paint2', back_material='dark', front_material='paint.graphite', count=48)
    for x in (-7.2, -3.0, 1.2, 5.4):
        F.band(s, 'Pod', (x, 0, 0), (1, 0, 0), 0.36, 'paint', inset=0.03, depth=0.05)
    # cargo hatches on the pod roof: graphite lids between the frame rings
    for x in (-5.1, -0.9, 3.3):
        F.box(s, f'PodHatch{x:+.1f}', (x, 0.0, 1.36), (2.6, 2.6, 0.16), material='paint.graphite', bevel=0.04)

    # --- The arc: a tall spine from bridge to drive beam, ribs from each hull up to it.
    n = 28
    pts = [(SX1 + (SX0 - SX1) * i / (n - 1), 0.0, spine_z(SX1 + (SX0 - SX1) * i / (n - 1))) for i in range(n)]
    sweep(s, 'Spine', pts, 0.6, 0.38, (0, 1, 0), material='paint')
    F.band(s, 'Spine', (0, 0, 0), (0, 1, 0), 0.5, 'stripe', facing=(0, 0, 1), min_facing=0.4)
    # the lit runway up the arc: one thin teal line down the spine's top, inside the stripe
    F.band(s, 'Spine', (0, 0, 0), (0, 1, 0), 0.14, 'glow_cyan.helios', facing=(0, 0, 1), min_facing=0.4, inset=0.01,
           depth=-0.02)
    for j, x in enumerate((-7.2, -3.0, 1.2, 5.4)):
        zs = spine_z(x)
        rib = []
        for i in range(12):
            t = i / 11
            rib.append((x, HY * (1 - t), 1.1 + (zs - 1.1) * math.sin(t * math.pi / 2) - 0.1 * t))
        sweep(s, f'Rib{j}', rib, 0.24, 0.24, (1, 0, 0), material='paint2')
        sweep(s, f'Rib{j}_M', [(p[0], -p[1], p[2]) for p in rib], 0.24, 0.24, (1, 0, 0), material='paint2')
    # hangers from spine to pod
    for k, x in enumerate((-7.2, -3.0, 1.2, 5.4)):
        top = spine_z(x) - 0.3
        for y in (0.9, -0.9):
            F.cylinder(s, f'Hanger{k}{y:+.1f}', (x, y * 0.4, top), (x, y, 1.25), 0.1, material='gunmetal', segments=8,
                       bevel=0.0)
        F.box(s, f'HangerClamp{k}', (x, 0.0, 1.46), (0.6, 2.3, 0.2), material='paint.graphite', bevel=0.03)
    # spine springs sit on the bridge and on the drive beam
    F.box(s, 'SpineFootFwd', (SX1 - 0.3, 0.0, 2.1), (1.8, 1.5, 1.0), material='paint2', bevel=0.08)
    F.box(s, 'SpineFootAft', (SX0 + 0.2, 0.0, 1.55), (1.8, 1.6, 1.6), material='paint2', bevel=0.08)

    s.detail = 1
    F.vent(s, 'HullVent', (-10.4, HY, HT - 0.06), (2.4, 0.5, 0.12), mirror=True, slats=6)
    F.rcs(s, 'RCSFwd', (12.4, HY + 1.35, 0.0), size=0.4, mirror=True)
    F.rcs(s, 'RCSAft', (-11.8, HY + 1.4, 0.0), size=0.4, mirror=True)
    F.antenna(s, 'Mast', (0.9, 0.0, spine_z(0.9) + 0.36), 1.3, tip=None)
    F.sensor_dome(s, 'Dome', (11.6, 0.0, 2.78), 0.36)
    s.detail = 0

    F.light(s, 'NavPort', (-13.2, HY + 1.42, 0.3), 'glow_red', size=0.22)
    F.light(s, 'NavStarboard', (-13.2, -HY - 1.42, 0.3), 'glow_green', size=0.22)
    F.light(s, 'NavPortFwd', (13.2, HY + 1.22, 0.3), 'glow_red', size=0.18)
    F.light(s, 'NavStarboardFwd', (13.2, -HY - 1.22, 0.3), 'glow_green', size=0.18)
    F.light(s, 'Beacon', (-0.6, 0.0, SZ_APEX + 0.42), 'glow_amber', size=0.3)
    F.light(s, 'BeaconAft', (-12.2, 0.0, 1.25), 'glow_amber', size=0.22)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
