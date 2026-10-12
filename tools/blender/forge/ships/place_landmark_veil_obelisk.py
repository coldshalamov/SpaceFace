"""place_landmark_veil_obelisk — QUEUE F7-31 veil-cyan obelisk (C6).

A dark faceted monolith rising from a broken rock shelf, its faces etched with
cyan light seams; a slow halo of levitating shards orbits its crown.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_veil_obelisk'
COLORS = {
    'paint': '#2b2f36',        # near-black slate
    'paint2': '#191d24',
    'dark': '#0e1116',
    'glow_cyan.veil': '#66f0ff',
}


def monolith(s, name, z0, z1, w0, w1, material='paint', lean=0.06):
    """Leaning faceted monolith: 8 verts, sheared upward."""
    import bmesh
    bm = bmesh.new()
    prof = []
    for z, w, sh in ((z0, w0, 0.0), (z1, w1, 1.0)):
        half = w / 2
        # faceted: 8 points around a stretched octagon
        ring = []
        for i in range(8):
            a = 2 * math.pi * i / 8 + math.pi / 8
            ring.append(bm.verts.new((half * math.cos(a) + lean * sh * (z1 - z0) * 0.4,
                                      half * 0.72 * math.sin(a), z)))
        prof.append(ring)
    for i in range(8):
        j = (i + 1) % 8
        bm.faces.new((prof[0][i], prof[0][j], prof[1][j], prof[1][i]))
    bm.faces.new(list(reversed(prof[0])))
    bm.faces.new(prof[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=0.25, smooth_angle=18.0))


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.rock_base(s, F, 'RockShelf', (0, 0, 1.5), 22.0, seed=11)
    monolith(s, 'Obelisk', 4.0, 104.0, 22.0, 9.0, 'paint')
    # cyan seams etched down the faces
    seams = []
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8
        ca, sa = math.cos(a), math.sin(a)
        for t in (0.28, 0.55, 0.8):
            z = 4.0 + (104.0 - 4.0) * t
            w = (22.0 + (9.0 - 22.0) * t) / 2 + 0.15
            seams.append(((w * ca + 0.06 * (z - 4.0) * 0.4, w * 0.72 * sa, z),
                          (0.22, 4.5, 0.9), (a + math.pi / 2, 0.0, 0.0)))
    K.boxes(s, F, 'CyanSeams', seams, 'glow_cyan.veil')
    # a low companion shard (broken twin)
    monolith(s, 'Twin', 3.0, 34.0, 9.0, 4.5, 'paint2', lean=-0.16)
    # levitating crown halo of shards
    shards = []
    for i in range(9):
        a = 2 * math.pi * i / 9 + 0.35
        r = 16.0 + (i % 3) * 2.5
        z = 96.0 + 6.0 * math.sin(a * 2.7)
        shards.append(((r * math.cos(a), r * math.sin(a), z), (1.6, 1.6, 3.2 + (i % 4)),
                       (0.3 * math.sin(a), 0.4, a)))
    K.boxes(s, F, 'Halo', shards, 'glow_cyan.veil', bevel=0.08)
    # etched ground ring + dim panel lights on the shelf
    K.annular_sector(s, F, 'EtchRing', 18.0, 18.6, 0, 2 * math.pi, 4.55, 4.75,
                     material='glow_cyan.veil', steps=20, bevel=0.0)
    s.detail = 1
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.5
        F.light(s, f'ShelfLamp{i}', (15.0 * math.cos(a), 15.0 * math.sin(a), 5.2),
                'glow_cyan.veil', size=0.5)
    s.detail = 0
    K.landmark_sockets(s, focus_z=50.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
