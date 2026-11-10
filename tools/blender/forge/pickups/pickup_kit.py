"""Pickup shape kit: one bold silhouette per commodity category (GFX-16 slice 5).

Today every loot pickup is the same octahedron in one of 14 tints. This kit gives each commodity
CATEGORY its own readable solid (ore chunk, cut gem, crystal cluster, canister, pill, ammo crate...).

Design rules (the pickup is tiny on screen: radius ~2.2 WU, a few dozen pixels at close zoom):
- every shape fits a unit sphere, centred, flat-shaded, <= ~250 triangles, ONE material (the runtime
  supplies the dark-metal + emissive-tint material, so shapes carry geometry only);
- the silhouette must read from the top (the game camera) at ~24 px: distinct aspect ratios and bulk,
  not surface detail; bolt/pin detail only where it adds to the outline;
- authored in Blender, exported as a compact JS data module (no GLB fetch, no first-spawn hitch, no
  manifest plumbing: the same reasoning as src/render/vfx/fragmentFamilies.js).

Run in the open Blender (MCP):   exec(open(PATH).read()); build_all(); render_previews(DIR); export_js(OUT)
or headless:  blender -b --python pickup_kit.py -- --out <module.js> [--preview <dir>]
Blender axes: +Z up toward the camera. The JS export converts to glTF axes (x, y, z) = (x, z, -y).
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# category -> (shape name, runtime tint used for previews only; the tint lives in src/data/commodities.js)
SHAPES = [
    ('raw_ore', '#c89a6a'), ('gem', '#f2a7d7'), ('crystal', '#a987ff'), ('gas', '#59d6c7'),
    ('exotic', '#ff70d0'), ('salvage', '#9aa0a8'), ('bioresource', '#9fd8a0'), ('protocol', '#9fd8a0'),
    ('refined', '#91b7c9'), ('component', '#d8a94e'), ('tech', '#5fa8ff'), ('consumer', '#e3c06a'),
    ('luxury', '#f2a7d7'), ('food', '#82c96b'), ('med', '#7ad7b8'), ('contraband', '#ff7a45'),
    ('military', '#df6d78'),
]
COLL = 'PICKUP_KIT'


def M(loc=(0, 0, 0), rot=(0, 0, 0), sc=(1, 1, 1)):
    return Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0))


def cube(bm, loc, size, rot=(0, 0, 0)):
    bmesh.ops.create_cube(bm, size=1.0, matrix=M(loc, rot, size))


def cyl(bm, loc, r, depth, seg=8, rot=(0, 0, 0), r2=None, sc=(1, 1, 1)):
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth, matrix=M(loc, rot, sc))


def sph(bm, loc, r, sub=1, sc=(1, 1, 1)):
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r, matrix=M(loc, (0, 0, 0), sc))


def prism(bm, pts, z0, z1):
    """Extrude a plan polygon (CCW list of (x, y)) between z0 and z1."""
    lo = [bm.verts.new((x, y, z0)) for x, y in pts]
    hi = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(lo[::-1])
    bm.faces.new(hi)
    n = len(pts)
    for i in range(n):
        bm.faces.new((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i]))


def jitter(bm, rng, amount, axes=(1, 1, 1)):
    for v in bm.verts:
        v.co.x += rng.uniform(-amount, amount) * axes[0]
        v.co.y += rng.uniform(-amount, amount) * axes[1]
        v.co.z += rng.uniform(-amount, amount) * axes[2]


# ------------------------------------------------------------------------------------------- shapes
def s_raw_ore(bm):                                          # a rough chunk: jagged, one flat face
    rng = random.Random(7)
    sph(bm, (0, 0, 0), 1.0, sub=2)
    for v in bm.verts:
        k = 0.62 + 0.52 * rng.random()
        v.co *= k
        if v.co.z < -0.3:
            v.co.z = -0.3 - (v.co.z + 0.3) * 0.15          # flat underside: a chunk, not a ball
        v.co.x *= 1.25
        v.co.y *= 0.9


def s_gem(bm):                                              # cut gem, elongated: table, crown, girdle, pavilion
    sc = (1.45, 0.8, 1.0)
    cyl(bm, (0, 0, 0.20), 1.0, 0.34, seg=6, r2=0.55, sc=sc)
    cyl(bm, (0, 0, 0.0), 1.0, 0.07, seg=6, sc=sc)
    cyl(bm, (0, 0, -0.46), 1.0, 0.85, seg=6, r2=0.0, rot=(math.pi, 0, 0), sc=sc)


def s_crystal(bm):                                          # a cluster of hexagonal points
    spec = [((0.0, 0.0, 0.0), (0.0, 0.0, 0.0), 1.35), ((0.46, 0.18, -0.05), (0.0, 0.42, 0.25), 0.95),
            ((-0.38, 0.30, -0.08), (0.0, -0.5, -0.3), 0.85), ((0.05, -0.44, -0.08), (0.5, 0.0, 0.1), 0.8),
            ((-0.30, -0.22, -0.10), (-0.4, -0.25, 0.4), 0.6)]
    for loc, rot, h in spec:
        cyl(bm, (loc[0], loc[1], loc[2] + h / 2), 0.2, h, seg=6, rot=rot)
        cyl(bm, (loc[0], loc[1], loc[2] + h + 0.17), 0.2, 0.34, seg=6, r2=0.0, rot=rot)


def s_gas(bm):                                              # pressure canister, long axis X, valve on top
    cyl(bm, (0, 0, 0), 0.5, 1.2, seg=10, rot=(0, math.pi / 2, 0))
    for sx in (-1, 1):
        sph(bm, (sx * 0.6, 0, 0), 0.5, sub=1, sc=(0.55, 1, 1))
        cyl(bm, (sx * 0.34, 0, 0), 0.57, 0.12, seg=10, rot=(0, math.pi / 2, 0))
    cyl(bm, (0.05, 0, 0.62), 0.12, 0.3, seg=6)
    cyl(bm, (0.05, 0, 0.8), 0.26, 0.07, seg=8)


def s_exotic(bm):                                           # a spindle with orbiting shards
    cyl(bm, (0, 0, 0.35), 0.5, 0.7, seg=4, r2=0.0, rot=(0, 0, math.pi / 4))
    cyl(bm, (0, 0, -0.35), 0.5, 0.7, seg=4, r2=0.0, rot=(math.pi, 0, math.pi / 4))
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        cyl(bm, (math.cos(a) * 0.82, math.sin(a) * 0.82, (0.18 if i % 2 else -0.18)), 0.16, 0.34, seg=4, r2=0.0,
            rot=(0.5, a, 0))


def s_salvage(bm):                                          # a torn plate with a snapped strut
    rng = random.Random(11)
    outline = [(-0.85, -0.5), (0.2, -0.62), (0.9, -0.2), (0.55, 0.12), (0.88, 0.5), (-0.1, 0.62), (-0.35, 0.2), (-0.9, 0.3)]
    prism(bm, [(x + rng.uniform(-0.04, 0.04), y + rng.uniform(-0.04, 0.04)) for x, y in outline], -0.09, 0.09)
    for v in bm.verts:
        v.co.z += 0.1 * math.sin(v.co.x * 3.0) + rng.uniform(-0.04, 0.04)
    cyl(bm, (0.25, 0.12, 0.3), 0.08, 1.6, seg=6, rot=(0, math.pi / 2, 0.55))
    cyl(bm, (-0.55, -0.3, 0.2), 0.12, 0.12, seg=6)


def s_bioresource(bm):                                      # lobed living nodule on a stalk
    rng = random.Random(5)
    for loc, r in (((0, 0, 0), 0.62), ((0.5, 0.2, -0.1), 0.42), ((-0.42, 0.34, 0.05), 0.4), ((0.05, -0.5, 0.0), 0.38)):
        sph(bm, loc, r, sub=1)
    for v in bm.verts:
        k = 0.88 + 0.22 * rng.random()
        v.co.x *= k
        v.co.y *= k
    cyl(bm, (0, 0, 0.62), 0.14, 0.5, seg=5, r2=0.04)


def s_protocol(bm):                                         # a token: ring around a floating core
    major, minor, rs, rt = 0.82, 0.16, 12, 5
    ring = []
    for i in range(rs):
        a = 2 * math.pi * i / rs
        row = []
        for j in range(rt):
            b = 2 * math.pi * j / rt
            r = major + minor * math.cos(b)
            row.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        ring.append(row)
    for i in range(rs):
        for j in range(rt):
            bm.faces.new((ring[i][j], ring[(i + 1) % rs][j], ring[(i + 1) % rs][(j + 1) % rt], ring[i][(j + 1) % rt]))
    cyl(bm, (0, 0, 0.22), 0.36, 0.44, seg=4, r2=0.0, rot=(0, 0, math.pi / 4))
    cyl(bm, (0, 0, -0.22), 0.36, 0.44, seg=4, r2=0.0, rot=(math.pi, 0, math.pi / 4))


def s_refined(bm):                                          # a stack of ingots
    for loc in ((-0.42, 0, -0.22), (0.42, 0, -0.22), (0, 0, 0.2)):
        cyl(bm, loc, 0.62, 0.38, seg=4, r2=0.46, rot=(0, 0, math.pi / 4), sc=(1.0, 0.62, 1.0))


def s_component(bm):                                        # hull plate: slab, ribs, bolts
    cube(bm, (0, 0, 0), (1.8, 1.25, 0.3))
    cube(bm, (0, 0, 0.2), (1.5, 0.2, 0.14))
    cube(bm, (0.5, 0, 0.2), (0.2, 1.0, 0.14))
    cube(bm, (-0.5, 0, 0.2), (0.2, 1.0, 0.14))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(bm, (sx * 0.74, sy * 0.46, 0.2), 0.1, 0.14, seg=6)


def s_tech(bm):                                             # a chip: package, die, pins
    cube(bm, (0, 0, 0), (1.25, 1.25, 0.2))
    cube(bm, (0, 0, 0.14), (0.62, 0.62, 0.1))
    for k in (-0.38, 0.0, 0.38):
        for s in (-1, 1):
            cube(bm, (k, s * 0.74, -0.02), (0.15, 0.22, 0.08))
            cube(bm, (s * 0.74, k, -0.02), (0.22, 0.15, 0.08))


def s_consumer(bm):                                         # a ribboned parcel
    cube(bm, (0, 0, 0), (1.15, 1.15, 1.0))
    cube(bm, (0, 0, 0), (1.22, 0.24, 1.07))
    cube(bm, (0, 0, 0), (0.24, 1.22, 1.07))
    cyl(bm, (0.2, 0, 0.66), 0.2, 0.3, seg=4, r2=0.02, rot=(0, 0.9, 0))
    cyl(bm, (-0.2, 0, 0.66), 0.2, 0.3, seg=4, r2=0.02, rot=(0, -0.9, 0))


def s_luxury(bm):                                           # a five-point star with a gem at the heart
    pts = []
    for i in range(10):
        r = 1.0 if i % 2 == 0 else 0.48
        a = math.pi / 2 + i * math.pi / 5
        pts.append((r * math.cos(a), r * math.sin(a)))
    prism(bm, pts, -0.17, 0.17)
    cyl(bm, (0, 0, 0.36), 0.2, 0.3, seg=6, r2=0.0)


def s_food(bm):                                             # ration crate with carry handles
    cube(bm, (0, 0, 0), (1.5, 1.0, 0.85))
    cube(bm, (0, 0, 0.46), (1.58, 1.08, 0.12))
    for sx in (-1, 1):
        cube(bm, (sx * 0.8, 0, 0.1), (0.14, 0.46, 0.14))


def s_med(bm):                                              # a medical cross: a plus-shaped pack
    a, b = 0.34, 0.95
    plus = [(a, -b), (a, -a), (b, -a), (b, a), (a, a), (a, b), (-a, b), (-a, a), (-b, a), (-b, -a), (-a, -a), (-a, -b)]
    prism(bm, plus, -0.22, 0.22)
    cube(bm, (0, 0, 0.3), (0.34, 0.34, 0.12))


def s_contraband(bm):                                       # a wrapped brick, twisted ends
    cube(bm, (0, 0, 0), (1.2, 0.8, 0.6))
    for sx in (-1, 1):
        cyl(bm, (sx * 0.84, 0, 0), 0.34, 0.5, seg=6, r2=0.06, rot=(0, sx * math.pi / 2, 0.5))
    cube(bm, (0.25, 0, 0), (0.16, 0.86, 0.66))
    cube(bm, (-0.25, 0, 0), (0.16, 0.86, 0.66))


def s_military(bm):                                         # ammo crate with shells poking out
    cube(bm, (0, -0.25, 0), (1.5, 0.8, 0.7))
    cube(bm, (0, -0.25, 0.4), (1.58, 0.88, 0.1))
    for k in (-0.5, 0.0, 0.5):
        cyl(bm, (k, 0.46, 0.0), 0.15, 0.7, seg=8, rot=(math.pi / 2, 0, 0))
        cyl(bm, (k, 0.92, 0.0), 0.15, 0.3, seg=8, r2=0.0, rot=(math.pi / 2, 0, 0))


BUILDERS = {n: globals()['s_' + n] for n, _ in SHAPES}


# ---------------------------------------------------------------------------------------- scene
def _finish(bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # centre on the bounding box, scale so the farthest vertex sits on the unit sphere
    xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zs = [v.co.z for v in bm.verts]
    c = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    for v in bm.verts:
        v.co -= c
    far = max(v.co.length for v in bm.verts)
    for v in bm.verts:
        v.co /= far


def build_all():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)
    coll = bpy.data.collections.get(COLL) or bpy.data.collections.new(COLL)
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    out = {}
    for i, (name, tint) in enumerate(SHAPES):
        bm = bmesh.new()
        BUILDERS[name](bm)
        _finish(bm)
        me = bpy.data.meshes.new('PICKUP_' + name)
        bm.to_mesh(me)
        tris = len(me.polygons)
        bm.free()
        for p in me.polygons:
            p.use_smooth = False
        ob = bpy.data.objects.new('PICKUP_' + name, me)
        ob.location = ((i % 6) * 2.6 - 6.5, -(i // 6) * 2.6 + 2.6, 0)
        ob['tint'] = tint
        coll.objects.link(ob)
        out[name] = tris
    return out


def _mat(tint, emis=0.3):
    key = 'PK_%s_%s' % (tint, emis)
    m = bpy.data.materials.get(key)
    if m:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = tuple(int(tint[i:i + 2], 16) / 255.0 for i in (1, 3, 5))
    b.inputs['Base Color'].default_value = (0.063, 0.063, 0.078, 1)   # runtime: 0x101014 dark metal
    b.inputs['Metallic'].default_value = 0.9
    b.inputs['Roughness'].default_value = 0.15
    b.inputs['Emission Color'].default_value = (*c, 1)
    b.inputs['Emission Strength'].default_value = emis
    return m


def render_previews(outdir):
    """One overview (top, ~game angle) and one 3/4 view; plus a tiny strip to judge legibility at game size."""
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    for ob in bpy.data.objects:
        if ob.name.startswith('PICKUP_'):
            ob.data.materials.clear()
            ob.data.materials.append(_mat(ob['tint']))
    w = bpy.data.worlds.get('PKW') or bpy.data.worlds.new('PKW')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.01, 0.012, 0.02, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    sc.world = w
    for n in ('PK_SUN', 'PK_FILL', 'PK_CAM'):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    sun = bpy.data.objects.new('PK_SUN', bpy.data.lights.new('PK_SUN', 'SUN'))
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(40))
    fill = bpy.data.objects.new('PK_FILL', bpy.data.lights.new('PK_FILL', 'SUN'))
    fill.data.energy = 0.8
    fill.data.color = (0.5, 0.65, 1.0)
    fill.rotation_euler = (math.radians(70), math.radians(30), math.radians(-120))
    cam = bpy.data.objects.new('PK_CAM', bpy.data.cameras.new('PK_CAM'))
    for o in (sun, fill, cam):
        bpy.context.scene.collection.objects.link(o)
    sc.camera = cam
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.film_transparent = False
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 17.5
    paths = {}
    for tag, loc, rot, res in (('top', (0, 0, 20), (0, 0, 0), (1500, 760)),
                               ('tilt', (0, -14, 14), (math.radians(45), 0, 0), (1500, 900)),
                               ('small', (0, 0, 20), (0, 0, 0), (360, 183))):
        cam.location = loc
        cam.rotation_euler = rot
        sc.render.resolution_x, sc.render.resolution_y = res
        sc.render.filepath = os.path.join(outdir, f'pickups_{tag}.png')
        bpy.ops.render.render(write_still=True)
        paths[tag] = sc.render.filepath
    return paths


def export_js(path):
    names = []
    lines = ['// GENERATED by tools/blender/forge/pickups/pickup_kit.py. Do not edit by hand.',
             '// One flat-shaded unit-sphere solid per commodity category. glTF axes (Y up). Geometry only:',
             '// the runtime supplies the material (dark metal + emissive category tint).',
             'export const PICKUP_SHAPES = Object.freeze({']
    for name, _ in SHAPES:
        ob = bpy.data.objects['PICKUP_' + name]
        me = ob.data
        verts = [(round(v.co.x, 4), round(v.co.z, 4), round(-v.co.y, 4)) for v in me.vertices]   # Blender -> glTF
        idx = []
        for p in me.polygons:
            a, b, c = p.vertices
            idx.extend((a, c, b))   # axis conversion mirrors handedness: flip winding
        flat = [x for v in verts for x in v]
        lines.append(f"  {name}: Object.freeze({{ tris: {len(me.polygons)}, "
                     f"positions: {flat}, indices: {idx} }}),")
        names.append(name)
    lines.append('});')
    lines.append('export const PICKUP_SHAPE_NAMES = Object.freeze(' + str(names) + ');')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    return {'path': path, 'bytes': os.path.getsize(path), 'shapes': len(names)}


if __name__ == '__main__' and '--' in sys.argv:
    args = sys.argv[sys.argv.index('--') + 1:]
    opt = {args[i]: args[i + 1] for i in range(0, len(args) - 1, 2)}
    print('[pickup_kit] tris', build_all())
    if '--preview' in opt:
        print('[pickup_kit] previews', render_previews(opt['--preview']))
    if '--out' in opt:
        print('[pickup_kit] export', export_js(opt['--out']))
