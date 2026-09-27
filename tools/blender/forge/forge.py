"""SpaceFace Forge — one construction kit for every flyable hull.

Why this exists: the fleet was built by many agents with many kits (factory lofts, MTX builders,
kitbash iterations). Each shipped a different surface language, texel density and material
vocabulary, so the ships did not look like one game. Forge fixes the *system*: every hull is
described as plan-view forms (the chase camera looks down), built from the same primitives, bevelled
the same way, UV'd at the same world-locked density, and painted from the same material palette over
the same shared panel textures. Ships differ by design, not by pipeline.

Axis convention (Blender, Z up): +X is the nose, +Y is port (left), +Z is dorsal (toward camera).
The glTF exporter converts to the game's Y-up frame.

Usage (inside Blender): see tools/blender/forge/ships/*.py — each ship file builds a `Ship`, then
calls ship.finish() and forge_export.export_ship(ship, ...).
"""
from __future__ import annotations

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
TEXTURE_DIR = os.path.join(HERE, 'textures')
TILE_METERS = 4.0

# ---------------------------------------------------------------------------------------------
# Palette. One vocabulary for the fleet. Paint colours are linear-ish sRGB hex; factors are set on
# the glTF material so the shared panel textures carry manufacture and the factor carries colour.
# ---------------------------------------------------------------------------------------------
FINISHES = {
    # role, roughness, metallic, texture set, env intent
    'paint':      dict(role='hull',       rough=0.46, metal=0.10, tex='panel'),
    'paint2':     dict(role='hull',       rough=0.50, metal=0.10, tex='panel'),
    'stripe':     dict(role='accent',     rough=0.42, metal=0.08, tex='panel'),
    'gunmetal':   dict(role='mechanical', rough=0.38, metal=0.85, tex='machinery'),
    'dark':       dict(role='mechanical', rough=0.62, metal=0.55, tex='machinery'),
    'bare':       dict(role='mechanical', rough=0.30, metal=0.95, tex='panel'),
    'ceramic':    dict(role='ceramic',    rough=0.70, metal=0.00, tex='machinery'),
    'hazard':     dict(role='warning',    rough=0.50, metal=0.05, tex='panel'),
    'glass':      dict(role='glass',      rough=0.06, metal=0.00, tex=None),
    'stone':      dict(role='geology',    rough=0.92, metal=0.00, tex=None),
    'glow_drive': dict(role='drive',      rough=0.40, metal=0.00, tex=None, emit=6.0),
    'glow_cyan':  dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
    'glow_red':   dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
    'glow_green': dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
    'glow_warm':  dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=2.2),
    'glow_amber': dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
}

DEFAULT_COLORS = {
    'gunmetal': '#4a5058', 'dark': '#1d2127', 'bare': '#9aa2aa', 'ceramic': '#6c6660',
    'hazard': '#e0a526', 'glass': '#0f2a3a', 'stone': '#8a8378', 'glow_drive': '#7fd8ff', 'glow_cyan': '#5fe8ff',
    'glow_red': '#ff3a2a', 'glow_green': '#3dff7a', 'glow_warm': '#ffc27a', 'glow_amber': '#ffae2a',
}


def hex_rgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.objects):
        for item in list(coll):
            coll.remove(item)


_IMAGE_CACHE = {}


def _image(name, colorspace):
    key = (name, colorspace)
    if key in _IMAGE_CACHE and _IMAGE_CACHE[key].name in bpy.data.images:
        return _IMAGE_CACHE[key]
    path = os.path.join(TEXTURE_DIR, name)
    if not os.path.exists(path):
        from forge_textures import generate_panel_set, generate_machinery_set  # noqa
        generate_panel_set(TEXTURE_DIR)
        generate_machinery_set(TEXTURE_DIR)
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    _IMAGE_CACHE[key] = img
    return img


def make_material(key, finish, color_hex, ship_id):
    """Principled material wired so the glTF exporter emits baseColor/normal/ORM + factors."""
    spec = FINISHES[finish]
    mat = bpy.data.materials.new(f'Forge_{key}')
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    rgb = hex_rgb(color_hex)
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = spec['rough']
    bsdf.inputs['Metallic'].default_value = spec['metal']
    tex = spec.get('tex')
    if tex:
        uv = nt.nodes.new('ShaderNodeUVMap')
        alb = nt.nodes.new('ShaderNodeTexImage')
        alb.image = _image(f'forge_{tex}_albedo.png', 'sRGB')
        orm = nt.nodes.new('ShaderNodeTexImage')
        orm.image = _image(f'forge_{tex}_orm.png', 'Non-Color')
        nrm = nt.nodes.new('ShaderNodeTexImage')
        nrm.image = _image(f'forge_{tex}_normal.png', 'Non-Color')
        for t in (alb, orm, nrm):
            nt.links.new(uv.outputs['UV'], t.inputs['Vector'])
        # base colour = factor x tile (Mix multiply exports as baseColorFactor * texture)
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = (*rgb, 1.0)
        nt.links.new(alb.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(orm.outputs['Color'], sep.inputs['Color'])
        rmul = nt.nodes.new('ShaderNodeMath')
        rmul.operation = 'MULTIPLY'
        rmul.inputs[1].default_value = spec['rough']
        nt.links.new(sep.outputs['Green'], rmul.inputs[0])
        nt.links.new(rmul.outputs['Value'], bsdf.inputs['Roughness'])
        mmul = nt.nodes.new('ShaderNodeMath')
        mmul.operation = 'MULTIPLY'
        mmul.inputs[1].default_value = spec['metal']
        nt.links.new(sep.outputs['Blue'], mmul.inputs[0])
        nt.links.new(mmul.outputs['Value'], bsdf.inputs['Metallic'])
        nmap = nt.nodes.new('ShaderNodeNormalMap')
        nmap.inputs['Strength'].default_value = 1.0
        nt.links.new(nrm.outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
        # glTF occlusion: custom group named "glTF Material Output" with an Occlusion socket.
        gl = _gltf_output_group()
        gnode = nt.nodes.new('ShaderNodeGroup')
        gnode.node_tree = gl
        nt.links.new(sep.outputs['Red'], gnode.inputs['Occlusion'])
    emit = spec.get('emit')
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1.0)
        bsdf.inputs['Emission Strength'].default_value = emit
        bsdf.inputs['Base Color'].default_value = tuple(c * 0.2 for c in rgb) + (1.0,)
    if finish == 'glass':
        bsdf.inputs['Specular IOR Level'].default_value = 0.8
        bsdf.inputs['Coat Weight'].default_value = 0.0
    mat['spacefaceMaterialRole'] = spec['role']
    mat['spacefaceFinish'] = 'forge-v1'
    mat['forgeFinish'] = finish
    mat['forgeShip'] = ship_id
    return mat


def _gltf_output_group():
    name = 'glTF Material Output'
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, 'ShaderNodeTree')
    g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


# ---------------------------------------------------------------------------------------------
# Geometry primitives. Every builder returns a bpy object; objects carry `forge_bevel` (metres)
# and `forge_uv_scale` so finish() treats every hull the same way.
# ---------------------------------------------------------------------------------------------

def _new_object(name, bm, material_slots, bevel=0.03, uv_scale=1.0, smooth_angle=35.0):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in material_slots:
        me.materials.append(m)
    obj['forge_bevel'] = bevel
    obj['forge_uv_scale'] = uv_scale
    obj['forge_smooth'] = smooth_angle
    return obj


def superellipse_ring(w, h_top, h_bot, zc, n, count, y_off=0.0, flat_bottom=None):
    """Points (y, z) round a superellipse section. n=2 ellipse, n>2 squarer, n<2 diamond-ish."""
    pts = []
    for i in range(count):
        t = 2 * math.pi * i / count
        c, s = math.cos(t), math.sin(t)
        y = w * math.copysign(abs(c) ** (2.0 / n), c)
        h = h_top if s >= 0 else h_bot
        z = h * math.copysign(abs(s) ** (2.0 / n), s)
        if flat_bottom is not None and z < -flat_bottom:
            z = -flat_bottom
        pts.append((y + y_off, zc + z))
    return pts


def loft(ship, name, sections, material='paint', count=48, bands=None, belly=None, cap_front=True,
         cap_back=True, bevel=0.03, back_material=None, front_material=None, smooth_angle=38.0, mirror=False,
         uv_scale=1.0):
    """Hull loft along X. sections: list of dict(x, w, ht, hb, zc=0, n=2.4, y=0).

    bands: {section_index: finish} — faces between section i and i+1 get that finish (livery).
    belly: finish for downward-facing faces (two-tone hulls read solid from above).
    uv_scale: multiplies the world-locked UV density (1 = the fleet's 4 m tile; <1 for
    station-size panels so the panel tile stays legible).
    """
    if mirror:
        loft(ship, name + '_M', [{**sec, 'y': -sec.get('y', 0.0)} for sec in sections], material=material,
             count=count, bands=bands, belly=belly, cap_front=cap_front, cap_back=cap_back, bevel=bevel,
             back_material=back_material, front_material=front_material, smooth_angle=smooth_angle,
             uv_scale=uv_scale)
    bm = bmesh.new()
    rings = []
    for sec in sections:
        pts = superellipse_ring(sec['w'], sec['ht'], sec['hb'], sec.get('zc', 0.0), sec.get('n', 2.4), count,
                                y_off=sec.get('y', 0.0))
        rings.append([bm.verts.new((sec['x'], y, z)) for (y, z) in pts])
    finishes = list(dict.fromkeys([material] + list((bands or {}).values()) + [f for f in (belly, back_material, front_material) if f]))
    mats = ship.slots(finishes)
    idx = {m: i for i, m in enumerate(finishes)}
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(count):
            k = (j + 1) % count
            f = bm.faces.new((a[j], a[k], b[k], b[j]))
            fin = (bands or {}).get(i, material)
            f.material_index = idx[fin]
    if cap_back:
        f = bm.faces.new(list(reversed(rings[0])))
        f.material_index = idx[back_material or material]
    if cap_front:
        f = bm.faces.new(rings[-1])
        f.material_index = idx[front_material or material]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if belly:
        for f in bm.faces:
            if f.normal.z < -0.55 and f.material_index == idx[material]:
                f.material_index = idx[belly]
    return ship.add(_new_object(name, bm, mats, bevel=bevel, uv_scale=uv_scale, smooth_angle=smooth_angle))


def plate(ship, name, outline, z0, thickness, material='paint', chamfer=0.0, chamfer_bottom=0.0,
          bevel=0.025, mirror=False, side_material=None, top_material=None, twist=None, uv_scale=1.0):
    """Plan-view slab: polygon (x, y) list, CCW seen from above, extruded up by thickness.

    chamfer: inset of the top face (metres) — turns a slab into a wedge-edged wing/armour plate.
    """
    def build(poly):
        bm = bmesh.new()
        bot = [bm.verts.new((x, y, z0)) for (x, y) in poly]
        fb = bm.faces.new(list(reversed(bot)))
        top_face = bmesh.ops.extrude_face_region(bm, geom=[fb])
        new_verts = [e for e in top_face['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=new_verts, vec=(0, 0, thickness))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        top = [f for f in bm.faces if f.normal.z > 0.9]
        bottom = [f for f in bm.faces if f.normal.z < -0.9]
        mats = [material]
        if side_material:
            mats.append(side_material)
        if top_material:
            mats.append(top_material)
        mats = list(dict.fromkeys(mats))
        if chamfer > 0 and top:
            res = bmesh.ops.inset_region(bm, faces=top, thickness=chamfer, depth=0.0, use_even_offset=True)
            # pull the chamfer ring down so edges slope
            for f in top:
                for v in f.verts:
                    pass
            ring_faces = res['faces']
            ring_verts = set()
            for f in top:
                ring_verts |= set(f.verts)
            outer = set()
            for f in ring_faces:
                outer |= set(f.verts)
            outer -= ring_verts
            for v in outer:
                v.co.z -= thickness * 0.55
        if chamfer_bottom > 0 and bottom:
            res = bmesh.ops.inset_region(bm, faces=bottom, thickness=chamfer_bottom, depth=0.0, use_even_offset=True)
            inner = set()
            for f in bottom:
                inner |= set(f.verts)
            outer = set()
            for f in res['faces']:
                outer |= set(f.verts)
            outer -= inner
            for v in outer:
                v.co.z += thickness * 0.35
        bm.normal_update()
        for f in bm.faces:
            f.material_index = 0
            if side_material and abs(f.normal.z) < 0.35:
                f.material_index = mats.index(side_material)
            if top_material and f.normal.z > 0.9:
                f.material_index = mats.index(top_material)
        return bm, mats

    bm, mats = build(outline)
    obj = ship.add(_new_object(name, bm, ship.slots(mats), bevel=bevel, uv_scale=uv_scale, smooth_angle=30.0))
    if mirror:
        bm2, _ = build([(x, -y) for (x, y) in reversed(outline)])
        ship.add(_new_object(name + '_M', bm2, ship.slots(mats), bevel=bevel, uv_scale=uv_scale,
                             smooth_angle=30.0))
    return obj


def plate_v(ship, name, outline, offset, thickness, plane='xz', material='paint', chamfer=0.0,
            bevel=0.025, mirror=False, side_material=None, top_material=None, uv_scale=1.0):
    """Vertical/radial slab: `outline` is a CCW (u, z) polygon in a vertical plane, extruded
    `thickness` along the plane normal starting at `offset`.

    plane='xz': outline is (x, z), extrudes along +Y — fins and flank plates standing on the hull.
    plane='yz': outline is (y, z), extrudes along +X — bulkheads and armour faces across the hull.
    chamfer: inset of the outer face (metres) — same wedge-edge trick as plate().
    mirror=True reflects across the keel (y=0): an 'xz' plate gets a twin at -offset-thickness,
    a 'yz' plate gets its outline y-coords mirrored.
    """
    ax = 0 if plane == 'yz' else 1

    def place(p, off):
        u, v = p
        return (off, u, v) if plane == 'yz' else (u, off, v)

    def build(poly, off):
        bm = bmesh.new()
        base = [bm.verts.new(place(p, off)) for p in poly]
        fb = bm.faces.new(list(reversed(base)))
        res = bmesh.ops.extrude_face_region(bm, geom=[fb])
        new_verts = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
        vec = Vector((0, 0, 0))
        vec[ax] = thickness
        bmesh.ops.translate(bm, verts=new_verts, vec=vec)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        front = [f for f in bm.faces if f.normal[ax] > 0.9]
        mats = [material]
        if side_material:
            mats.append(side_material)
        if top_material:
            mats.append(top_material)
        mats = list(dict.fromkeys(mats))
        if chamfer > 0 and front:
            res = bmesh.ops.inset_region(bm, faces=front, thickness=chamfer, depth=0.0,
                                         use_even_offset=True)
            inner = set()
            for f in front:
                inner |= set(f.verts)
            outer = set()
            for f in res['faces']:
                outer |= set(f.verts)
            outer -= inner
            for v in outer:
                v.co[ax] -= thickness * 0.55
        bm.normal_update()
        for f in bm.faces:
            f.material_index = 0
            if side_material and abs(f.normal[ax]) < 0.35:
                f.material_index = mats.index(side_material)
            if top_material and f.normal[ax] > 0.9:
                f.material_index = mats.index(top_material)
        return bm, mats

    bm, mats = build(outline, offset)
    obj = ship.add(_new_object(name, bm, ship.slots(mats), bevel=bevel, uv_scale=uv_scale,
                               smooth_angle=30.0))
    if mirror:
        if plane == 'yz':
            bm2, _ = build([(-u, v) for (u, v) in reversed(outline)], offset)
        else:
            bm2, _ = build(outline, -(offset + thickness))
        ship.add(_new_object(name + '_M', bm2, ship.slots(mats), bevel=bevel, uv_scale=uv_scale,
                             smooth_angle=30.0))
    return obj


def box(ship, name, center, size, material='gunmetal', bevel=0.02, mirror=False, rot_z=0.0, taper=1.0, rot=None,
        mirror_flip=False, uv_scale=1.0):
    """Bevelled box. rot_z yaws it; rot=(rx, ry, rz) radians tilts it on any axis (applied X, Y, Z).
    mirror_flip=True mirrors the rotation too (a yawed/tilted part stays symmetric across the keel)."""
    def build(c, sign):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= size[0]
            v.co.y *= size[1]
            v.co.z *= size[2]
            if taper != 1.0 and v.co.z > 0:
                v.co.x *= taper
                v.co.y *= taper
        if rot is not None:
            rx, ry, rz = rot
            m = (Matrix.Rotation(rz * sign, 3, 'Z') @ Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rx * sign, 3, 'X'))
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=m)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_z * sign, 3, 'Z'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=c)
        return bm
    obj = ship.add(_new_object(name, build(center, 1), ship.slots([material]), bevel=bevel,
                               uv_scale=uv_scale, smooth_angle=30.0))
    if mirror:
        sign = -1 if mirror_flip else 1
        ship.add(_new_object(name + '_M', build((center[0], -center[1], center[2]), sign), ship.slots([material]),
                             bevel=bevel, uv_scale=uv_scale, smooth_angle=30.0))
    return obj


def cylinder(ship, name, p0, p1, r0, r1=None, material='gunmetal', segments=28, cap=True, bevel=0.015,
             mirror=False, cap_material=None, cap_back_material=None, uv_scale=1.0):
    """Bevelled tube p0->p1. cap_material finishes the p1 (front) cap — and the back cap too,
    unless cap_back_material names a different finish (a lit lens with a matte housing)."""
    r1 = r0 if r1 is None else r1

    def build(a, b):
        a, b = Vector(a), Vector(b)
        axis = (b - a)
        length = axis.length
        bm = bmesh.new()
        ring0, ring1 = [], []
        for i in range(segments):
            t = 2 * math.pi * i / segments
            ring0.append(bm.verts.new((0, r0 * math.cos(t), r0 * math.sin(t))))
            ring1.append(bm.verts.new((length, r1 * math.cos(t), r1 * math.sin(t))))
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
        mats = [material] + ([cap_material] if cap_material else []) \
            + ([cap_back_material] if cap_back_material else [])
        mats = list(dict.fromkeys(mats))
        if cap:
            f0 = bm.faces.new(list(reversed(ring0)))
            f1 = bm.faces.new(ring1)
            if cap_material:
                f1.material_index = mats.index(cap_material)
                f0.material_index = mats.index(cap_back_material or cap_material)
        rot = Vector((1, 0, 0)).rotation_difference(axis.normalized()).to_matrix()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(bm, verts=bm.verts, vec=a)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm, mats
    bm, mats = build(p0, p1)
    obj = ship.add(_new_object(name, bm, ship.slots(mats), bevel=bevel, uv_scale=uv_scale,
                               smooth_angle=50.0))
    if mirror:
        m0 = (p0[0], -p0[1], p0[2])
        m1 = (p1[0], -p1[1], p1[2])
        bm2, _ = build(m0, m1)
        ship.add(_new_object(name + '_M', bm2, ship.slots(mats), bevel=bevel, uv_scale=uv_scale,
                             smooth_angle=50.0))
    return obj


def nozzle(ship, name, center, radius, length, material='gunmetal', mirror=False, glow='glow_drive',
           bell=1.25, segments=32, axis=-1):
    """Engine bell facing -X (aft): outer bell, dark throat, emissive core disc recessed inside."""
    def build(c):
        cx, cy, cz = c
        bm = bmesh.new()
        profile = [  # (x offset forward, radius) outer skin then lip then inner throat
            (length, radius * 0.92), (length * 0.55, radius * 1.0), (0.0, radius * bell),
            (-0.02, radius * bell * 0.94), (length * 0.12, radius * 0.78), (length * 0.45, radius * 0.62),
        ]
        rings = []
        for (dx, r) in profile:
            rings.append([bm.verts.new((cx + dx, cy + r * math.cos(2 * math.pi * i / segments),
                                         cz + r * math.sin(2 * math.pi * i / segments))) for i in range(segments)])
        faces_outer, faces_inner = [], []
        for k in range(len(rings) - 1):
            for i in range(segments):
                j = (i + 1) % segments
                f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
                (faces_inner if k >= 3 else faces_outer).append(f)
        core = bm.faces.new(list(reversed(rings[-1])))
        front = bm.faces.new(rings[0])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in faces_inner:
            f.material_index = 1
        core.material_index = 2
        return bm
    mats = ship.slots([material, 'dark', glow])
    obj = ship.add(_new_object(name, build(center), mats, bevel=0.0, smooth_angle=60.0))
    if mirror:
        ship.add(_new_object(name + '_M', build((center[0], -center[1], center[2])), mats, bevel=0.0,
                             smooth_angle=60.0))
    return obj


def canopy(ship, name, x0, x1, w, h, z, y=0.0, frame=True, n=2.2, peak=0.45):
    """Glass blister: loft of superellipse half-sections along X; peak = x fraction of max height."""
    secs = []
    steps = 9
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        # rounded front/back falloff with the tallest point at `peak`
        if t <= peak:
            s = math.sin(0.5 * math.pi * (t / peak)) if peak > 0 else 1
        else:
            s = math.cos(0.5 * math.pi * ((t - peak) / (1 - peak)))
        s = max(s, 0.02)
        secs.append(dict(x=x, w=max(w * (s ** 0.5), 0.01), ht=max(h * s, 0.01), hb=0.02, zc=z, n=n, y=y))
    obj = loft(ship, name, secs, material='glass', count=24, bevel=0.0, smooth_angle=60.0)
    if frame:
        # dark sill frame ring just below the glass edge
        box(ship, name + '_Sill', ((x0 + x1) / 2, y, z - 0.02), ((x1 - x0) * 0.98, w * 2.08, 0.06), material='dark',
            bevel=0.01)
    return obj


def light(ship, name, pos, finish='glow_red', size=0.12, mirror=False):
    return box(ship, name, pos, (size, size, size * 0.7), material=finish, bevel=0.0, mirror=mirror)


def fins(ship, name, x0, x1, y, z, height, count, thickness=0.04, depth=0.5, material='gunmetal', mirror=False,
         axis='x'):
    """Radiator/heat-sink fin stack. Fins run across `axis`."""
    objs = []
    for i in range(count):
        t = (i + 0.5) / count
        if axis == 'x':
            cx = x0 + (x1 - x0) * t
            objs.append(box(ship, f'{name}_{i}', (cx, y, z + height / 2), (thickness, depth, height), material,
                            bevel=0.0, mirror=mirror))
        else:
            cy = x0 + (x1 - x0) * t
            objs.append(box(ship, f'{name}_{i}', (y, cy, z + height / 2), (depth, thickness, height), material,
                            bevel=0.0, mirror=mirror))
    return objs


class Ship:
    """Collects objects and materials for one hull."""

    def __init__(self, ship_id, colors):
        self.id = ship_id
        self.colors = {**DEFAULT_COLORS, **colors}
        self.objects = []
        self._mats = {}
        self.sockets = {}
        self.hooks = {}
        # detail level stamped on parts added while set: 1 = omitted at LOD2, 2 = omitted at LOD1+
        self.detail = 0

    def mat(self, finish):
        if finish not in self._mats:
            color = self.colors.get(finish)
            if color is None:
                raise KeyError(f'{self.id}: no colour for finish {finish}')
            base = finish.split('.')[0]
            self._mats[finish] = make_material(f'{self.id}_{finish}', base if base in FINISHES else finish, color,
                                               self.id)
            self._mats[finish]['forgeKey'] = finish
        return self._mats[finish]

    def slots(self, finishes):
        return [self.mat(f) for f in dict.fromkeys(finishes)]

    def add(self, obj):
        if self.detail:
            obj['forge_detail'] = self.detail
        self.objects.append(obj)
        return obj

    def hook_part(self, hook, *objs):
        """Keep these parts as their own mesh named LOD0_<hook>_... (damage/drive role binding)."""
        for o in objs:
            o['forge_hook'] = hook

    def socket(self, name, pos, forward=(1, 0, 0)):
        self.sockets[name] = (tuple(pos), tuple(forward))

    def hook(self, name, pos):
        self.hooks[name] = tuple(pos)

    # -- finishing ---------------------------------------------------------------------------
    def finish(self):
        """Bevel + weighted normals + world-locked UVs on every part. Same treatment fleet-wide."""
        for obj in self.objects:
            finish_object(obj)
        return self


def finish_object(obj):
    bevel = float(obj.get('forge_bevel', 0.03))
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me)
    bm.free()
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    if bevel > 0:
        mod = obj.modifiers.new('ForgeBevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = 'ANGLE'
        mod.angle_limit = math.radians(32)
        mod.harden_normals = True
        mod.miter_outer = 'MITER_ARC'
        mod.use_clamp_overlap = True
    smooth = math.radians(float(obj.get('forge_smooth', 35.0)))
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=smooth, keep_sharp_edges=True)
    except Exception:
        me.shade_smooth()
    wn = obj.modifiers.new('ForgeWeightedNormal', 'WEIGHTED_NORMAL')
    wn.keep_sharp = True
    wn.weight = 50
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    # MikkTSpace (glTF tangents) refuses n-gons; caps and insets are n-gons until triangulated.
    bm = bmesh.new()
    bm.from_mesh(me)
    ngons = [f for f in bm.faces if len(f.verts) > 4]
    if ngons:
        bmesh.ops.triangulate(bm, faces=ngons, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(me)
    bm.free()
    box_project_uvs(obj, float(obj.get('forge_uv_scale', 1.0)))


def box_project_uvs(obj, scale=1.0):
    """World-locked tri-planar UVs: 1 UV unit = TILE_METERS / scale metres on the dominant axis."""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    mw = obj.matrix_world
    k = scale / TILE_METERS
    for poly in me.polygons:
        n = poly.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            if az >= ax and az >= ay:
                u, v = co.x, co.y * (1 if n.z >= 0 else -1)
            elif ax >= ay:
                u, v = co.y * (-1 if n.x >= 0 else 1), co.z
            else:
                u, v = co.x * (1 if n.y < 0 else -1), co.z
            uv[li].uv = (u * k + 0.37, v * k + 0.19)


def _plane_key(mesh_name, n, d, eps=1e-4):
    """Canonical (mesh, plane) key: a mirror=True band whose mirrored plane coincides with the
    primary one (normal square across the keel, n.y == 0) must not cut the part twice."""
    if n.x < -eps or (abs(n.x) <= eps and (n.y < -eps or (abs(n.y) <= eps and n.z < -eps))):
        n = -n
        d = -d
    return (mesh_name, round(n.x, 3), round(n.y, 3), round(n.z, 3), round(d, 3))


def band(ship, obj_name, point, normal, width, finish, facing=None, mirror=False, min_facing=0.35, inset=0.0,
         depth=0.0, region=None):
    """Paint a livery band onto an existing part: slice it with two parallel planes and give the
    faces between them `finish`. Real geometry edges, so the stripe is crisp at any distance and
    follows the form (a wing chevron, a spine stripe, a nose ring).

    point/normal: band centre-plane (Blender coords); width: metres across the band.
    facing: optional direction; only faces whose normal points that way get paint (e.g. (0,0,1)).
    region: optional tuple of (axis, lo, hi) bounds, axis 'x'|'y'|'z' — only faces whose centre
    sits inside every bound are cut and painted, confining the band to a zone of the part
    (e.g. only the dorsal stretch of a long spine) instead of wrapping its whole length.
    mirror=True on a centreline part (one mesh straddling y=0, no _M twin) cuts the mirrored
    plane into that same mesh; a mirrored plane that coincides with the primary is skipped, so
    the part is never double-cut.
    """
    targets = [(obj_name, point, normal, facing)]
    if mirror:
        targets.append((obj_name + '_M', (point[0], -point[1], point[2]), (normal[0], -normal[1], normal[2]),
                        None if facing is None else (facing[0], -facing[1], facing[2])))
    bounds = [('xyz'.index(ax) if isinstance(ax, str) else ax, min(lo, hi), max(lo, hi))
              for ax, lo, hi in (region or ())]

    def in_region(c):
        for ax, lo, hi in bounds:
            if c[ax] < lo - 1e-4 or c[ax] > hi + 1e-4:
                return False
        return True

    mat = ship.mat(finish)
    cut = set()
    for name, p, n, fdir in targets:
        obj = bpy.data.objects.get(name)
        if obj is None and name.endswith('_M'):
            obj = bpy.data.objects.get(name[:-2])  # centreline part: cut both sides into the one mesh
        if obj is None:
            raise KeyError(f'band: no part {name}')
        me = obj.data
        nv = Vector(n).normalized()
        pv = Vector(p)
        key = _plane_key(me.name, nv, pv.dot(nv))
        if key in cut:
            continue
        cut.add(key)
        if mat.name not in [m.name for m in me.materials if m]:
            me.materials.append(mat)
        slot = [m.name if m else None for m in me.materials].index(mat.name)
        bm = bmesh.new()
        bm.from_mesh(me)
        for off in (-width / 2.0, width / 2.0):
            co = pv + nv * off
            if bounds:
                faces = [f for f in bm.faces if in_region(f.calc_center_median())]
                geom = set(faces)
                for f in faces:
                    geom.update(f.edges)
                    geom.update(f.verts)
                geom = list(geom)
            else:
                geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=nv, dist=1e-5)
        bm.normal_update()
        fv = Vector(fdir).normalized() if fdir is not None else None
        picked = []
        for f in bm.faces:
            c = f.calc_center_median()
            d = (c - pv).dot(nv)
            if abs(d) < width / 2.0 - 1e-4 and (fv is None or f.normal.dot(fv) > min_facing) \
                    and in_region(c):
                f.material_index = slot
                picked.append(f)
        if picked and (inset or depth):
            # Real panel construction: a chamfered groove round the band, the band raised (depth>0)
            # or sunk (depth<0) along its normals.
            bmesh.ops.inset_region(bm, faces=picked, thickness=max(inset, 0.004), depth=depth,
                                   use_even_offset=True, use_boundary=True)
        bm.to_mesh(me)
        bm.free()
    return mat



def panel(ship, obj_name, center, size, finish, facing=(0, 0, 1), inset=0.03, depth=0.03, mirror=False,
          min_facing=0.5):
    """Rectangular raised (depth>0) or recessed (depth<0) plate cut into an existing part, seen from
    `facing`. center/size are Blender (x, y) plan coords; the panel spans the whole height of the
    part where it faces `facing`."""
    cx, cy = center
    sx, sy = size
    mat = ship.mat(finish)
    targets = [(obj_name, cy, facing)]
    if mirror:
        targets.append((obj_name + '_M', -cy, (facing[0], -facing[1], facing[2])))
    for name, y0, fdir in targets:
        obj = bpy.data.objects.get(name)
        if obj is None and name.endswith('_M'):
            obj = bpy.data.objects.get(name[:-2])  # centreline part: cut both sides into the one mesh
        if obj is None:
            raise KeyError(f'panel: no part {name}')
        me = obj.data
        if mat.name not in [m.name for m in me.materials if m]:
            me.materials.append(mat)
        slot = [m.name if m else None for m in me.materials].index(mat.name)
        bm = bmesh.new()
        bm.from_mesh(me)
        for co, no in (((cx - sx / 2, 0, 0), (1, 0, 0)), ((cx + sx / 2, 0, 0), (1, 0, 0)),
                       ((0, y0 - sy / 2, 0), (0, 1, 0)), ((0, y0 + sy / 2, 0), (0, 1, 0))):
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, dist=1e-5)
        bm.normal_update()
        fv = Vector(fdir).normalized()
        picked = []
        for f in bm.faces:
            c = f.calc_center_median()
            if abs(c.x - cx) < sx / 2 - 1e-4 and abs(c.y - y0) < sy / 2 - 1e-4 and f.normal.dot(fv) > min_facing:
                f.material_index = slot
                picked.append(f)
        if picked:
            bmesh.ops.inset_region(bm, faces=picked, thickness=max(inset, 0.004), depth=depth,
                                   use_even_offset=True, use_boundary=True)
        bm.to_mesh(me)
        bm.free()
    return mat


# --- greebles: designed hardware, placed by hand on the plan, never scattered -----------------

def vent(ship, name, center, size, mirror=False, frame='gunmetal', slats=5, axis='x'):
    """Louvred vent: a dark recess box with angled slats across it."""
    cx, cy, cz = center
    sx, sy, sz = size
    box(ship, name + '_Well', (cx, cy, cz - sz * 0.3), (sx, sy, sz * 0.6), material='dark', bevel=0.0, mirror=mirror)
    box(ship, name + '_Frame', (cx, cy, cz), (sx + 0.06, sy + 0.06, sz * 0.25), material=frame, bevel=0.008,
        mirror=mirror, taper=0.97)
    for i in range(slats):
        t = (i + 0.5) / slats
        if axis == 'x':
            box(ship, f'{name}_Slat{i}', (cx - sx / 2 + sx * t, cy, cz + sz * 0.05), (sx / slats * 0.45, sy * 0.96, 0.03),
                material=frame, bevel=0.0, mirror=mirror)
        else:
            box(ship, f'{name}_Slat{i}', (cx, cy - sy / 2 + sy * t, cz + sz * 0.05), (sx * 0.96, sy / slats * 0.45, 0.03),
                material=frame, bevel=0.0, mirror=mirror)


def rcs(ship, name, center, size=0.3, mirror=False, material='gunmetal'):
    """RCS quad: a small block with four dark nozzle holes on its outboard face."""
    cx, cy, cz = center
    box(ship, name, center, (size, size * 0.7, size * 0.7), material=material, bevel=0.012, mirror=mirror)
    side = 1 if cy >= 0 else -1
    for dx in (-size * 0.22, size * 0.22):
        for dz in (-size * 0.16, size * 0.16):
            cylinder(ship, f'{name}_N{dx:.2f}{dz:.2f}', (cx + dx, cy + side * size * 0.33, cz + dz),
                     (cx + dx, cy + side * size * 0.43, cz + dz), size * 0.08, material='dark', segments=10,
                     bevel=0.0, mirror=mirror)


def antenna(ship, name, base, height, mirror=False, tip='glow_red'):
    bx, by, bz = base
    cylinder(ship, name + '_Mast', (bx, by, bz), (bx, by, bz + height), 0.035, 0.02, material='gunmetal',
             segments=10, bevel=0.0, mirror=mirror)
    box(ship, name + '_Foot', (bx, by, bz + 0.03), (0.16, 0.16, 0.06), material='gunmetal', bevel=0.01,
        mirror=mirror)
    if tip:
        light(ship, name + '_Tip', (bx, by, bz + height), tip, size=0.07, mirror=mirror)


def windows(ship, name, x0, x1, y, z, count, size=(0.28, 0.12), finish='glow_warm', mirror=False, normal='y'):
    """A row of lit portholes/windows on a side wall (normal y) or roof (normal z)."""
    for i in range(count):
        t = (i + 0.5) / count
        x = x0 + (x1 - x0) * t
        if normal == 'y':
            box(ship, f'{name}_{i}', (x, y, z), (size[0], 0.05, size[1]), material=finish, bevel=0.0, mirror=mirror)
        else:
            box(ship, f'{name}_{i}', (x, y, z), (size[0], size[1], 0.05), material=finish, bevel=0.0, mirror=mirror)


def sensor_dome(ship, name, center, radius, material='gunmetal', lens='glow_cyan'):
    cx, cy, cz = center
    loft(ship, name, [
        dict(x=cx - radius, w=0.02, ht=0.02, hb=0.01, zc=cz, n=2.0, y=cy),
        dict(x=cx - radius * 0.7, w=radius * 0.72, ht=radius * 0.5, hb=0.01, zc=cz, n=2.0, y=cy),
        dict(x=cx, w=radius, ht=radius * 0.72, hb=0.01, zc=cz, n=2.0, y=cy),
        dict(x=cx + radius * 0.7, w=radius * 0.72, ht=radius * 0.5, hb=0.01, zc=cz, n=2.0, y=cy),
        dict(x=cx + radius, w=0.02, ht=0.02, hb=0.01, zc=cz, n=2.0, y=cy),
    ], material=material, count=24, bevel=0.0, smooth_angle=70.0)
    if lens:
        light(ship, name + '_Lens', (cx + radius * 0.55, cy, cz + radius * 0.45), lens, size=radius * 0.35)


def container(ship, name, center, size, finish='paint2', mirror=False, ribs=4):
    """Cargo container: ribbed box with dark end frames — reads as freight at any zoom."""
    cx, cy, cz = center
    sx, sy, sz = size
    box(ship, name, center, size, material=finish, bevel=0.03, mirror=mirror)
    for i in range(ribs):
        t = (i + 0.5) / ribs
        box(ship, f'{name}_Rib{i}', (cx - sx / 2 + sx * t, cy, cz), (0.06, sy + 0.04, sz + 0.04), material='gunmetal',
            bevel=0.0, mirror=mirror)
    for e in (-1, 1):
        box(ship, f'{name}_End{e}', (cx + e * (sx / 2 - 0.04), cy, cz), (0.1, sy + 0.06, sz + 0.06), material='dark',
            bevel=0.01, mirror=mirror)



def ring(ship, name, center, radius, tube, axis=(1, 0, 0), material='gunmetal', segments=32, sides=10,
         mirror=False, uv_scale=1.0):
    """Torus: flanges, dish rims, cable wraps, drive collars, lit lamp halos. axis = the ring's
    normal."""
    def build(c):
        bm = bmesh.new()
        rings = []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            ring_pts = []
            for j in range(sides):
                b = 2 * math.pi * j / sides
                r = radius + tube * math.cos(b)
                ring_pts.append(bm.verts.new((tube * math.sin(b), r * math.cos(a), r * math.sin(a))))
            rings.append(ring_pts)
        for i in range(segments):
            for j in range(sides):
                a, b = rings[i], rings[(i + 1) % segments]
                bm.faces.new((a[j], a[(j + 1) % sides], b[(j + 1) % sides], b[j]))
        rotm = Vector((1, 0, 0)).rotation_difference(Vector(axis).normalized()).to_matrix()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rotm)
        bmesh.ops.translate(bm, verts=bm.verts, vec=c)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm
    obj = ship.add(_new_object(name, build(center), ship.slots([material]), bevel=0.0, uv_scale=uv_scale,
                               smooth_angle=80.0))
    if mirror:
        ship.add(_new_object(name + '_M', build((center[0], -center[1], center[2])), ship.slots([material]),
                             bevel=0.0, uv_scale=uv_scale, smooth_angle=80.0))
    return obj


def dish(ship, name, center, radius, depth, axis=(0, 0, 1), material='gunmetal', face='dark', segments=32,
         feed='glow_cyan', mirror=False):
    """Concave antenna dish: a shallow bowl opening along `axis`, a rim ring and a feed with a lens."""
    def build(c):
        bm = bmesh.new()
        rows = 6
        grid = []
        for r in range(rows + 1):
            t = r / rows
            rr = radius * t
            z = depth * t * t
            grid.append([bm.verts.new((z, rr * math.cos(2 * math.pi * k / segments),
                                       rr * math.sin(2 * math.pi * k / segments))) for k in range(segments)])
        for r in range(rows):
            for k in range(segments):
                k2 = (k + 1) % segments
                bm.faces.new((grid[r][k], grid[r][k2], grid[r + 1][k2], grid[r + 1][k]))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        # give the bowl a back skin so it is a solid shell
        ret = bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=radius * 0.06)
        rotm = Vector((1, 0, 0)).rotation_difference(Vector(axis).normalized()).to_matrix()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rotm)
        bmesh.ops.translate(bm, verts=bm.verts, vec=c)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ax = Vector(axis).normalized()
        for f in bm.faces:
            f.material_index = 1 if f.normal.dot(ax) > 0.2 else 0
        return bm
    mats = ship.slots([material, face])
    obj = ship.add(_new_object(name, build(center), mats, bevel=0.0, smooth_angle=70.0))
    ax = Vector(axis).normalized()
    c = Vector(center)
    ring(ship, name + '_Rim', tuple(c + ax * depth), radius, radius * 0.05, axis=axis, material=material)
    tip = c + ax * (depth + radius * 0.7)
    cylinder(ship, name + '_Feed', tuple(c + ax * depth * 0.3), tuple(tip), radius * 0.05, radius * 0.03,
             material=material, segments=8, bevel=0.0)
    if feed:
        light(ship, name + '_Lens', tuple(tip), feed, size=radius * 0.12)
    return obj


def work_lamp(ship, name, pos, aim=(0.4, 0.0, 1.0), size=0.3, lens='glow_warm', halo=True, mirror=False):
    """Floodlight can on a yoke, tilted so the chase camera sees the lit lens. Only the front cap
    is lit (the back reads as a matte housing, not a second emitter); halo=True adds a lit ring
    on the lens rim so the lamp still reads from a camera square overhead."""
    p = Vector(pos)
    a = Vector(aim).normalized()
    cylinder(ship, name + '_Can', tuple(p - a * size * 0.6), tuple(p + a * size * 0.4), size * 0.5, size * 0.6,
             material='gunmetal', segments=14, cap_material=lens, cap_back_material='dark', mirror=mirror)
    box(ship, name + '_Yoke', (p.x, p.y, p.z - size * 0.55), (size * 0.5, size * 0.9, size * 0.25), material='dark',
        bevel=0.0, mirror=mirror)
    if halo:
        ring(ship, name + '_Halo', tuple(p + a * size * 0.42), size * 0.72, size * 0.07, axis=tuple(a),
             material=lens, segments=18, sides=6, mirror=mirror)


def beacon(ship, name, pos, finish='glow_amber', size=0.22, mirror=False):
    """Rotating-beacon dome: a short gunmetal base with a lit dome."""
    x, y, z = pos
    cylinder(ship, name + '_Base', (x, y, z), (x, y, z + size * 0.35), size * 0.8, size * 0.7, material='gunmetal',
             segments=14, mirror=mirror)
    loft(ship, name + '_Dome', [
        dict(x=x - size * 0.62, w=0.01, ht=0.01, hb=0.01, zc=z + size * 0.35, n=2.0, y=y),
        dict(x=x - size * 0.45, w=size * 0.45, ht=size * 0.3, hb=0.01, zc=z + size * 0.35, n=2.0, y=y),
        dict(x=x, w=size * 0.62, ht=size * 0.55, hb=0.01, zc=z + size * 0.35, n=2.0, y=y),
        dict(x=x + size * 0.45, w=size * 0.45, ht=size * 0.3, hb=0.01, zc=z + size * 0.35, n=2.0, y=y),
        dict(x=x + size * 0.62, w=0.01, ht=0.01, hb=0.01, zc=z + size * 0.35, n=2.0, y=y),
    ], material=finish, count=16, bevel=0.0, smooth_angle=80.0, mirror=mirror)


def sweep(ship, name, path, width, height, material='gunmetal', bevel=0.01, uv_scale=1.0):
    """Rectangular beam swept along a 3D polyline (arches, ribs, rails, pipe runs)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in path]
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
        side = t.cross(up).normalized()
        nrm = side.cross(t).normalized()
        w, h = width / 2, height / 2
        rings.append([bm.verts.new(p + side * sx * w + nrm * sz * h) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(4):
            bm.faces.new((a[j], a[(j + 1) % 4], b[(j + 1) % 4], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ship.add(_new_object(name, bm, ship.slots([material]), bevel=bevel, uv_scale=uv_scale,
                                smooth_angle=35.0))


# --- station-scale helpers: several primitives fused into ONE mesh (one draw per part) ---------

def _strut(bm, q0, q1, w, h=None):
    """Square-section rod between two 3D points, appended into an existing bmesh."""
    q0, q1 = Vector(q0), Vector(q1)
    d = q1 - q0
    if d.length < 1e-4:
        return
    h = w if h is None else h
    t = d.normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
    sd = t.cross(up).normalized()
    nn = sd.cross(t).normalized()
    r0 = [bm.verts.new(q0 + sd * x * w / 2 + nn * y * h / 2)
          for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    r1 = [bm.verts.new(q1 + sd * x * w / 2 + nn * y * h / 2)
          for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for j in range(4):
        k = (j + 1) % 4
        bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
    bm.faces.new(list(reversed(r0)))
    bm.faces.new(r1)


def _mirrored_point(p):
    return (p[0], -p[1], p[2])


def beams(ship, name, segs, w, material='gunmetal', h=None, mirror=False, bevel=0.0, uv_scale=1.0):
    """Many straight square struts in ONE mesh (one draw): segs = [(p0, p1), ...]."""
    def build(ss):
        bm = bmesh.new()
        for q0, q1 in ss:
            _strut(bm, q0, q1, w, h)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm
    obj = ship.add(_new_object(name, build(segs), ship.slots([material]), bevel=bevel,
                               uv_scale=uv_scale, smooth_angle=30.0))
    if mirror:
        ship.add(_new_object(name + '_M',
                             build([(_mirrored_point(p0), _mirrored_point(p1)) for p0, p1 in segs]),
                             ship.slots([material]), bevel=bevel, uv_scale=uv_scale, smooth_angle=30.0))
    return obj


def boxes(ship, name, specs, material='gunmetal', bevel=0.0, mirror=False, uv_scale=1.0):
    """Many boxes in ONE mesh (one draw): specs = (center, size[, rot_z]) rows. Window rows,
    rim lights, container yards, grating panels — anything that would otherwise cost an object
    and a draw call each."""
    def build(ss):
        bm = bmesh.new()
        for spec in ss:
            c, sz = spec[0], spec[1]
            rz = spec[2] if len(spec) > 2 else 0.0
            geom = bmesh.ops.create_cube(bm, size=1.0)
            vs = geom['verts']
            for v in vs:
                v.co.x *= sz[0]
                v.co.y *= sz[1]
                v.co.z *= sz[2]
            if rz:
                bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=Matrix.Rotation(rz, 3, 'Z'))
            bmesh.ops.translate(bm, verts=vs, vec=c)
        return bm
    obj = ship.add(_new_object(name, build(specs), ship.slots([material]), bevel=bevel,
                               uv_scale=uv_scale, smooth_angle=30.0))
    if mirror:
        ship.add(_new_object(name + '_M',
                             build([(_mirrored_point(spec[0]), spec[1],
                                     -(spec[2] if len(spec) > 2 else 0.0)) for spec in specs]),
                             ship.slots([material]), bevel=bevel, uv_scale=uv_scale, smooth_angle=30.0))
    return obj


def truss(ship, name, p0, p1, w, bays, material='gunmetal', chord=None, web=None, mirror=False,
          uv_scale=1.0):
    """Square-section lattice beam between two 3D points, ONE mesh: four chords plus alternating
    zig-zag diagonals on all four faces, `bays` bays long. w is the truss section; chord/web are
    strut thicknesses (defaults scale from w). Gantry masts, gate bridges, docking arms."""
    a, b = Vector(p0), Vector(p1)
    chord = w * 0.42 if chord is None else chord
    web = w * 0.24 if web is None else web
    t = (b - a).normalized()
    up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
    side = t.cross(up).normalized()
    nrm = side.cross(t).normalized()
    corners = [side * sx * w / 2 + nrm * sz * w / 2 for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]

    def build(aa, bb):
        bm = bmesh.new()
        for c in corners:
            _strut(bm, aa + c, bb + c, chord)
        for i in range(bays):
            q0 = aa + (bb - aa) * (i / bays)
            q1 = aa + (bb - aa) * ((i + 1) / bays)
            for f in range(4):
                c0, c1 = corners[f], corners[(f + 1) % 4]
                if i % 2 == 0:
                    _strut(bm, q0 + c0, q1 + c1, web)
                else:
                    _strut(bm, q0 + c1, q1 + c0, web)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm

    obj = ship.add(_new_object(name, build(a, b), ship.slots([material]), bevel=0.0,
                               uv_scale=uv_scale, smooth_angle=30.0))
    if mirror:
        ship.add(_new_object(name + '_M', build(_mirrored_point(a), _mirrored_point(b)),
                             ship.slots([material]), bevel=0.0, uv_scale=uv_scale, smooth_angle=30.0))
    return obj


def ladder(ship, name, p0, p1, w, rungs, material='gunmetal', mirror=False, uv_scale=1.0):
    """Ladder between two points, ONE mesh: two rails w apart plus `rungs` cross-rungs."""
    def build(aa, bb):
        a, b = Vector(aa), Vector(bb)
        t = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
        sd = t.cross(up).normalized()
        bm = bmesh.new()
        _strut(bm, a + sd * w / 2, b + sd * w / 2, w * 0.14)
        _strut(bm, a - sd * w / 2, b - sd * w / 2, w * 0.14)
        for i in range(rungs):
            c = a + (b - a) * ((i + 0.5) / rungs)
            _strut(bm, c - sd * w / 2, c + sd * w / 2, w * 0.10)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm

    obj = ship.add(_new_object(name, build(p0, p1), ship.slots([material]), bevel=0.0,
                               uv_scale=uv_scale, smooth_angle=30.0))
    if mirror:
        ship.add(_new_object(name + '_M', build(_mirrored_point(p0), _mirrored_point(p1)),
                             ship.slots([material]), bevel=0.0, uv_scale=uv_scale, smooth_angle=30.0))
    return obj


def annulus(ship, name, center, r_in, r_out, z0, thickness, material='gunmetal', segments=48,
            side_material=None, bevel=0.06, uv_scale=1.0):
    """Flat ring deck in plan view: an annular slab of outer radius r_out with a r_in well,
    centred on center=(x, y) at height z0. The deck face takes `material`; the inner/outer walls
    and underside take `side_material` (default: same). Ring roads, pad aprons, hub decks."""
    cx, cy = center[0], center[1]
    bm = bmesh.new()
    rings = []
    for z in (z0, z0 + thickness):
        inner, outer = [], []
        for i in range(segments):
            a = 2 * math.pi * i / segments
            inner.append(bm.verts.new((cx + r_in * math.cos(a), cy + r_in * math.sin(a), z)))
            outer.append(bm.verts.new((cx + r_out * math.cos(a), cy + r_out * math.sin(a), z)))
        rings.append((inner, outer))
    (bi, bo), (ti, to) = rings
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((ti[i], to[i], to[j], ti[j]))
        bm.faces.new((bi[j], bo[j], bo[i], bi[i]))
        bm.faces.new((bo[i], bo[j], to[j], to[i]))
        bm.faces.new((bi[j], bi[i], ti[i], ti[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [material] + ([side_material] if side_material else [])
    for f in bm.faces:
        f.material_index = 0 if f.normal.z > 0.5 else (1 if side_material else 0)
    return ship.add(_new_object(name, bm, ship.slots(mats), bevel=bevel, uv_scale=uv_scale,
                                smooth_angle=30.0))


def sphere(ship, name, center, r, material='paint', segments=24, uv_scale=1.0):
    """Near-spherical dome/tank via the hull loft — same smooth shading language as the rest of
    the kit."""
    cx, cy, cz = center
    rows = max(6, int(round(segments * 0.42)))
    secs = []
    for i in range(rows + 1):
        th = math.pi * i / rows
        w = max(r * math.sin(th), 0.02)
        secs.append(dict(x=cx - r * math.cos(th), w=w, ht=w, hb=w, zc=cz, n=2.0, y=cy))
    return loft(ship, name, secs, material=material, count=segments, bevel=0.0, smooth_angle=60.0,
                uv_scale=uv_scale)


def rock(ship, name, center, radius, seed, quarry_plane=None, material='stone', uv_scale=1.0):
    """Deterministic faceted boulder: an icosphere displaced by a seeded hash, so the same seed
    always yields the same rock (no clock or ambient RNG). quarry_plane=(point, normal) clamps
    every vert on the +normal side onto the plane — a flat quarried face where a boulder was
    cut from a cliff or dock. Finish default `stone`: plain rough surface, no machinery tile."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for i, v in enumerate(bm.verts):
        k = 0.75 + 0.45 * (0.5 + 0.5 * math.sin(seed * 12.9898 + i * 78.233))
        v.co *= radius * k
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(seed * 1.7, 3, 'Z'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=center)
    if quarry_plane is not None:
        q0, qn = Vector(quarry_plane[0]), Vector(quarry_plane[1]).normalized()
        for v in bm.verts:
            d = (v.co - q0).dot(qn)
            if d > 0:
                v.co -= qn * d
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ship.add(_new_object(name, bm, ship.slots([material]), bevel=0.0, uv_scale=uv_scale,
                                smooth_angle=14.0))
