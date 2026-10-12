"""place_landmark_tower_crown — QUEUE F6-27 siege-brass tower (C6).

A siege-era crown keep: a squat brass-banded bastion on a rock crag, ringed by a
crenellated parapet carrying siege turrets; a lower battery deck bristles with
old guns. Brass, coal-black and ember warning paint.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_tower_crown'
COLORS = {
    'paint': '#6b5a38',        # siege brass
    'paint2': '#3a3226',
    'dark': '#16130e',
    'stripe.brass': '#8a743f',
    'glow_warm.siege': '#ffb050',
    'glow_red.siege': '#ff5030',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.rock_base(s, F, 'Crag', (0, 0, 2.0), 30.0, lumps=7, seed=41)
    # bastion body: two stepped octagonal drums
    import bmesh
    def drum(name, z0, z1, r, n=8):
        bm = bmesh.new()
        rings = []
        for z in (z0, z1):
            rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / n + math.pi / n),
                                        r * math.sin(2 * math.pi * i / n + math.pi / n), z))
                          for i in range(n)])
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return s.add(F._new_object(name, bm, s.slots(['paint']), bevel=0.1, smooth_angle=30.0))
    drum('LowerDrum', 8.0, 30.0, 26.0)
    drum('KeepDrum', 30.0, 58.0, 19.0)
    # brass band courses on both drums
    for z, r in ((16.0, 26.2), (36.0, 19.5), (52.0, 18.8)):
        K.annular_sector(s, F, f'BrassBand{z:.0f}', r, r + 0.9, 0, 2 * math.pi, z - 1.1, z + 1.1,
                         material='stripe.brass', steps=10)
    # parapet ring on the crown with crenellations
    K.annular_sector(s, F, 'Parapet', 17.5, 21.5, 0, 2 * math.pi, 58.0, 63.0, material='paint2', steps=8)
    merlons = []
    for i in range(10):
        a = 2 * math.pi * i / 10
        merlons.append(((19.5 * math.cos(a), 19.5 * math.sin(a), 65.0), (4.2, 3.0, 4.0), (0, 0, a + math.pi / 2)))
    K.boxes(s, F, 'Merlons', merlons, 'paint', bevel=0.0)
    # siege turrets: 4 brass cupolas with gun barrels
    for i in range(4):
        a = 2 * math.pi * i / 4 + math.pi / 4
        cx, cy = 15.5 * math.cos(a), 15.5 * math.sin(a)
        F.box(s, f'Turret{i}', (cx, cy, 60.5), (7.5, 7.5, 4.5), material='stripe.brass',
              rot=(0, 0, a), bevel=0.4)
        F.cylinder(s, f'Gun{i}', (cx + 2.0 * math.cos(a), cy + 2.0 * math.sin(a), 60.8),
                   (cx + 9.5 * math.cos(a), cy + 9.5 * math.sin(a), 61.8),
                   0.7, 0.5, material='gunmetal', segments=5)
    # lower battery deck: emplacements ring the base
    for i in range(5):
        a = 2 * math.pi * i / 5 + math.pi / 5
        cx, cy = 27.5 * math.cos(a), 27.5 * math.sin(a)
        F.box(s, f'Emplace{i}', (cx, cy, 11.0), (6.0, 4.5, 5.0), material='paint2',
              rot=(0, 0, a + math.pi / 2), bevel=0.1)
        F.cylinder(s, f'BatGun{i}', (cx + 2.2 * math.cos(a), cy + 2.2 * math.sin(a), 12.5),
                   (cx + 7.5 * math.cos(a), cy + 7.5 * math.sin(a), 14.0),
                   0.5, 0.35, material='gunmetal', segments=5)
    # keep crown: command cupola + lit gallery + mast
    drum('Cupola', 63.0, 69.0, 6.5)
    win = []
    for i in range(10):
        a = 2 * math.pi * i / 10
        win.append(((6.55 * math.cos(a), 6.55 * math.sin(a), 66.0), (0.9, 0.12, 1.1), (a, 0, 0)))
    K.boxes(s, F, 'CupolaWin', win, 'glow_warm.siege')
    F.cylinder(s, 'Mast', (0, 0, 69.0), (0, 0, 78.0), 0.4, material='gunmetal', segments=5)
    F.beacon(s, 'MastBeacon', (0, 0, 78.4), finish='glow_red.siege', size=0.6)
    # siege warning lamps + embrasure lights
    s.detail = 1
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.3
        F.light(s, f'SiegeLamp{i}', (19.1 * math.cos(a), 19.1 * math.sin(a), 51.0),
                'glow_warm.siege', size=0.55)
    s.detail = 0
    K.landmark_sockets(s, focus_z=40.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
