"""Ashline Lode — raider bruiser. A rust-red wedge that rams.

Plan read at the chase camera: a stubby wedge led by a hazard-chevroned steel ram, two massive armoured
shoulders each carrying a heavy gun, and a black engine block with four hot drives. Same Ashline
language as the Dart: oxide red over blackened steel, honed bare-steel edges, sodium lamps.
"""
import os
import sys

import bmesh

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'ashline_lode'
COLORS = {
    'paint': '#4a1b15',    # oxide red (the illustrated light lifts it; keep it deep)
    'paint2': '#161719',   # blackened steel
    'stripe': '#c9621c',   # sodium orange
    'hazard': '#d99a1e',
    'bare': '#868c93',     # honed ram edge
    'glow_drive': '#ff9a4a',
}


def band_half(s, part, point, normal, width, finish, side, facing=(0, 0, 1), min_facing=0.3):
    """band() restricted to one side of the centreline (side=+1 port, -1 starboard): lets a single,
    unmirrored part carry a chevron (two bands meeting on the centreline)."""
    mat = s.mat(finish)
    obj = F.bpy.data.objects[part]
    me = obj.data
    if mat.name not in [m.name for m in me.materials if m]:
        me.materials.append(mat)
    slot = [m.name if m else None for m in me.materials].index(mat.name)
    nv = F.Vector(normal).normalized()
    pv = F.Vector(point)
    fv = F.Vector(facing).normalized()
    bm = bmesh.new()
    bm.from_mesh(me)
    cuts = [(pv + nv * off, nv) for off in (-width / 2.0, width / 2.0)] + [(F.Vector((0, 0, 0)), F.Vector((0, 1, 0)))]
    for co, no in cuts:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-5)
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        if abs((c - pv).dot(nv)) < width / 2.0 - 1e-4 and c.y * side > 0 and f.normal.dot(fv) > min_facing:
            f.material_index = slot
    bm.to_mesh(me)
    bm.free()


def chevron(s, part, x, width, finish, spread=0.62):
    """A forward-pointing chevron across an unmirrored part, apex on the centreline at x."""
    for side in (1, -1):
        n = (1.0, side * spread, 0.0)
        band_half(s, part, (x, 0.0, 0.0), n, width, finish, side)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Deck: the wedge itself. Narrow at the ram, wide at the shoulders, sloped armour skirts.
    deck = [(-8.6, -4.3), (-7.0, -5.0), (0.5, -3.7), (4.6, -2.1), (4.6, 2.1), (0.5, 3.7), (-7.0, 5.0), (-8.6, 4.3)]
    F.plate(s, 'Deck', deck, z0=-0.8, thickness=1.3, material='paint', chamfer=0.7, chamfer_bottom=0.4,
            side_material='paint2')
    F.band(s, 'Deck', (-7.6, 0, 0), (1, 0, 0), 0.4, 'stripe', facing=(0, 0, 1), min_facing=0.3)
    F.panel(s, 'Deck', (-5.0, 1.85), (2.2, 0.5), 'dark', inset=0.03, depth=-0.03)
    F.panel(s, 'Deck', (-5.0, -1.85), (2.2, 0.5), 'dark', inset=0.03, depth=-0.03)

    # Keel: a faceted black spine down the wedge (low segment count = angular armour).
    F.loft(s, 'Keel', [
        dict(x=-9.0, w=1.25, ht=1.7, hb=0.9, zc=0.3, n=2.2),
        dict(x=-3.0, w=1.4, ht=1.95, hb=0.9, zc=0.3, n=2.2),
        dict(x=2.5, w=1.25, ht=1.6, hb=0.9, zc=0.3, n=2.2),
        dict(x=5.0, w=0.95, ht=1.0, hb=0.8, zc=0.2, n=2.2),
        dict(x=5.6, w=0.6, ht=0.6, hb=0.6, zc=0.2, n=2.2),
    ], material='paint2', back_material='dark', count=12, smooth_angle=20)
    F.band(s, 'Keel', (0, 0, 0), (0, 1, 0), 0.16, 'stripe', facing=(0, 0, 1), min_facing=0.8)
    for x in (-7.8, -7.3):
        F.band(s, 'Keel', (x, 0, 0), (1, 0, 0), 0.2, 'gunmetal', inset=0.02, depth=0.03)
    # Oxide armour saddles bolted over the black keel (raised), breaking it into segments.
    for cx, ln in ((-4.6, 2.6), (-0.9, 2.4)):
        F.panel(s, 'Keel', (cx, 0.0), (ln, 3.0), 'paint', inset=0.05, depth=0.05, min_facing=0.35)

    # Ram prow: a blackened plough-section loft with hazard chevrons and a honed steel edge.
    F.loft(s, 'Ram', [
        dict(x=3.4, w=2.3, ht=1.25, hb=0.95, zc=0.0, n=1.7),
        dict(x=6.8, w=1.75, ht=0.85, hb=0.7, zc=-0.05, n=1.6),
        dict(x=9.4, w=0.7, ht=0.38, hb=0.32, zc=-0.1, n=1.5),
        dict(x=10.6, w=0.12, ht=0.08, hb=0.08, zc=-0.12, n=1.5),
        dict(x=10.9, w=0.02, ht=0.02, hb=0.02, zc=-0.12, n=1.5),
    ], material='paint2', count=48, smooth_angle=30)
    for x in (6.2, 7.6, 9.0):
        chevron(s, 'Ram', x, 0.45, 'hazard')
    edge = [(4.6, 1.4), (6.8, 1.2), (9.4, 0.36), (10.6, 0.03), (11.2, 0.0),
            (10.6, 0.22), (9.4, 0.84), (6.8, 1.95), (4.6, 2.4), (4.0, 2.1)]
    F.plate(s, 'RamEdge', edge, z0=-0.16, thickness=0.14, material='bare', chamfer=0.1, chamfer_bottom=0.05,
            mirror=True)

    # Armoured shoulders on the wedge's rear corners: oxide tops, black flanks, a pauldron on top.
    shoulder = [(-8.3, 2.2), (-1.4, 2.2), (0.6, 3.1), (-0.3, 4.5), (-5.6, 5.35), (-8.3, 4.7)]
    F.plate(s, 'Shoulder', shoulder, z0=-0.2, thickness=1.9, material='paint', chamfer=0.5, chamfer_bottom=0.2,
            mirror=True, side_material='paint2')
    for i in range(3):
        F.band(s, 'Shoulder', (0.0, 3.0 + i * 0.5, 0), (0.3, 1.0, 0), 0.22, 'hazard',
               facing=(1, 0, 0.3), mirror=True, min_facing=0.55)
    pauldron = [(-7.2, 2.6), (-1.8, 2.6), (-0.6, 3.3), (-1.3, 4.3), (-5.4, 4.9), (-7.3, 4.3)]
    F.plate(s, 'Pauldron', pauldron, z0=1.5, thickness=0.45, material='paint', chamfer=0.2, mirror=True,
            side_material='gunmetal')
    F.panel(s, 'Pauldron', (-5.3, 3.7), (1.6, 1.1), 'dark', inset=0.04, depth=-0.04, mirror=True)
    F.band(s, 'Pauldron', (-3.9, 3.6, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1), mirror=True, min_facing=0.2)
    F.band(s, 'Pauldron', (-3.45, 3.6, 0), (1, 0, 0), 0.1, 'stripe', facing=(0, 0, 1), mirror=True, min_facing=0.2)

    # Twin heavy guns riding the pauldrons.
    F.box(s, 'GunHouse', (-1.9, 3.5, 2.22), (2.6, 1.1, 0.8), material='paint2', mirror=True)
    F.cylinder(s, 'GunJacket', (-0.6, 3.5, 2.3), (2.2, 3.5, 2.3), 0.36, 0.33, material='gunmetal', mirror=True,
               segments=24)
    F.cylinder(s, 'GunBarrel', (2.1, 3.5, 2.3), (7.0, 3.5, 2.3), 0.24, 0.21, material='gunmetal', mirror=True,
               cap_material='dark', segments=24)
    F.box(s, 'MuzzleBrake', (6.85, 3.5, 2.3), (0.7, 0.6, 0.48), material='dark', mirror=True)

    # Armoured bridge on the keel's brow, a sodium visor slit.
    F.plate(s, 'Bridge', [(1.2, -0.8), (3.5, -0.65), (4.3, 0.0), (3.5, 0.65), (1.2, 0.8)], z0=1.1, thickness=1.15,
            material='paint2', chamfer=0.25, side_material='gunmetal')
    F.box(s, 'Visor', (3.35, 0.0, 2.25), (0.14, 0.9, 0.05), material='glow_warm', bevel=0.0)

    # Engine block: black, four hot drives (two main in the block, one in each shoulder).
    F.box(s, 'EngineBlock', (-9.0, 0.0, 0.3), (1.4, 4.0, 2.0), material='dark')
    F.nozzle(s, 'Main', (-10.9, 1.2, 0.3), 0.88, 1.5, material='gunmetal', mirror=True)
    F.cylinder(s, 'HeatSeam', (-9.86, 1.2, 0.3), (-9.72, 1.2, 0.3), 0.97, material='glow_drive', mirror=True,
               segments=40)
    F.nozzle(s, 'Aux', (-9.3, 3.5, 0.75), 0.62, 1.2, material='gunmetal', mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-10.8, 0.0, 0.3))

    s.detail = 1
    F.vent(s, 'DeckVent', (1.3, 2.75, 0.52), (1.6, 0.55, 0.12), mirror=True)
    F.rcs(s, 'RCS', (-7.0, 5.05, 0.6), size=0.36, mirror=True)
    F.antenna(s, 'Mast', (-4.5, -0.5, 2.05), 1.0, tip='glow_amber')
    F.cylinder(s, 'Pipe', (-8.0, 1.75, 0.62), (-1.2, 1.75, 0.62), 0.11, material='gunmetal', mirror=True,
               segments=12)
    F.cylinder(s, 'PipeLow', (-7.6, 1.5, 0.58), (-2.2, 1.5, 0.58), 0.07, material='bare', mirror=True, segments=12)
    F.box(s, 'GunCradle', (-0.9, 3.5, 1.98), (1.2, 0.7, 0.2), material='gunmetal', mirror=True)
    s.detail = 0

    # Lights.
    F.light(s, 'NavPort', (-5.6, 5.42, 0.75), 'glow_red', size=0.18)
    F.light(s, 'NavStarboard', (-5.6, -5.42, 0.75), 'glow_green', size=0.18)
    F.light(s, 'Beacon', (-6.5, 0.0, 2.12), 'glow_amber', size=0.18)
    F.light(s, 'ShoulderLamp', (-8.36, 3.0, 1.2), 'glow_amber', size=0.2, mirror=True)
    F.light(s, 'RamLamp', (4.3, 2.05, 0.52), 'glow_amber', size=0.2, mirror=True)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
