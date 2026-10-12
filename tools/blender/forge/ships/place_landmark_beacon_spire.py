"""place_landmark_beacon_spire — QUEUE F7-30 sector-identity beacon (C6).

A monumental navigation lighthouse: an octagonal ivory shaft tapering to a rotating
beacon crown drum of warm lenses, ringed by a collar of antenna fins mid-mast and
three guy-strut roots. Reads as a candle tower from the 60-degree chase camera.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import c6_kit as K  # noqa: E402

SHIP_ID = 'place_landmark_beacon_spire'
COLORS = {
    'paint': '#6e695c',        # ivory civic stone
    'paint2': '#3a3f45',
    'stripe': '#1b4d5e',
    'dark': '#14171b',
    'glow_warm.beacon': '#ffd9a0',
}


def octa(s, name, z0, z1, r0, r1, material='paint', n=8, bevel=0.15):
    """Tapered n-gon prism: r0 at z0, r1 at z1."""
    import bmesh
    bm = bmesh.new()
    rings = []
    for z, r in ((z0, r0), (z1, r1)):
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / n + math.pi / n),
                                    r * math.sin(2 * math.pi * i / n + math.pi / n), z))
                      for i in range(n)])
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bm.faces.new(list(reversed(rings[0])))
    if r1 > 0.01:
        bm.faces.new(rings[1])
    else:
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[1][i], rings[1][j], rings[1][0]))
    import bmesh as _b
    _b.ops.recalc_face_normals(bm, faces=bm.faces)
    return s.add(F._new_object(name, bm, s.slots([material]), bevel=bevel, smooth_angle=30.0))


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.rock_base(s, F, 'RockPlinth', (0, 0, 2.0), 26.0, seed=7)
    # stepped civic plinth
    K.annular_sector(s, F, 'Plinth', 0, 22, 0, 2 * math.pi, 3.0, 9.5, material='paint2', steps=10)
    K.annular_sector(s, F, 'PlinthCap', 0, 18, 0, 2 * math.pi, 9.5, 11.5, material='paint', steps=10)
    # main tapering shaft
    octa(s, 'Shaft', 11.5, 96.0, 13.0, 5.2, 'paint')
    # civic stripe collars at each taper break
    for z, r in ((30.0, 10.6), (52.0, 8.6), (74.0, 6.7)):
        K.annular_sector(s, F, f'Collar{z:.0f}', r - 0.5, r + 0.7, 0, 2 * math.pi, z - 1.4, z + 1.4,
                         material='stripe', steps=10)
        K.annular_sector(s, F, f'CollarTrim{z:.0f}', r + 0.7, r + 1.05, 0, 2 * math.pi, z - 0.5, z + 0.5,
                         material='dark', steps=10)
    # maintenance gallery ring mid-mast with lit windows
    K.annular_sector(s, F, 'Gallery', 7.4, 12.4, 0, 2 * math.pi, 62.0, 66.4, material='paint2', steps=10)
    K.annular_sector(s, F, 'GalleryDeck', 8.0, 14.0, 0, 2 * math.pi, 61.4, 62.2, material='dark', steps=10)
    win = []
    for i in range(20):
        a = 2 * math.pi * i / 20
        win.append(((12.45 * math.cos(a), 12.45 * math.sin(a), 64.2), (1.6, 0.12, 0.7), (a + math.pi / 2, 0, 0)))
    K.boxes(s, F, 'GalleryWindows', win, 'glow_warm.beacon')
    # antenna fin collar at 3/4 height
    fins = []
    for i in range(12):
        a = 2 * math.pi * i / 12
        r0 = 5.6
        fins.append(((r0 * math.cos(a), r0 * math.sin(a), 88.0), (0.5, 6.5, 7.5), (0, 0, a + math.pi / 2)))
    K.boxes(s, F, 'AntennaFins', fins, 'gunmetal')
    # beacon crown: drum of lenses between dark cheeks
    octa(s, 'CrownBase', 96.0, 101.0, 5.2, 7.8, 'paint2')
    K.annular_sector(s, F, 'BeaconDrum', 0, 9.0, 0, 2 * math.pi, 101.0, 107.5, material='dark', steps=10)
    lenses = []
    for i in range(8):
        a = 2 * math.pi * i / 8 + math.pi / 8
        lenses.append(((8.55 * math.cos(a), 8.55 * math.sin(a), 104.3), (2.0, 0.4, 4.6), (a, 0, 0)))
    K.boxes(s, F, 'BeaconLenses', lenses, 'glow_warm.beacon')
    octa(s, 'CrownCap', 107.5, 112.0, 7.4, 2.0, 'paint2')
    F.cylinder(s, 'Finial', (0, 0, 112.0), (0, 0, 120.0), 0.5, 0.15, material='gunmetal', segments=10)
    F.beacon(s, 'ApexLight', (0, 0, 120.4), finish='glow_red', size=0.7)
    # guy-strut roots to the plinth
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        top = (10.5 * math.cos(a), 10.5 * math.sin(a), 30.0)
        foot = (20.0 * math.cos(a), 20.0 * math.sin(a), 9.8)
        F.cylinder(s, f'Guy{i}', foot, top, 0.9, material='dark', segments=8)
    # nav lamps up the shaft + plinth edge lights
    s.detail = 1
    lamps = []
    for i in range(8):
        a = 2 * math.pi * i / 8 + 0.2
        for z, r in ((36, 10.0), (58, 7.9), (80, 6.1)):
            lamps.append(((r * math.cos(a), r * math.sin(a), z), (0.5, 0.5, 0.5), (0, 0, 0)))
    K.boxes(s, F, 'NavLamps', lamps, 'glow_amber')
    for i in range(10):
        a = 2 * math.pi * i / 10
        F.light(s, f'Edge{i}', (21.5 * math.cos(a), 21.5 * math.sin(a), 9.8), 'glow_cyan', size=0.45)
    s.detail = 0
    K.landmark_sockets(s, focus_z=60.0)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
