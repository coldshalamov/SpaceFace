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
    'glow_drive': dict(role='drive',      rough=0.40, metal=0.00, tex=None, emit=6.0),
    'glow_cyan':  dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
    'glow_red':   dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
    'glow_green': dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
    'glow_warm':  dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=2.2),
    'glow_amber': dict(role='signal',     rough=0.40, metal=0.00, tex=None, emit=3.0),
}

DEFAULT_COLORS = {
    'gunmetal': '#4a5058', 'dark': '#1d2127', 'bare': '#9aa2aa', 'ceramic': '#6c6660',
    'hazard': '#e0a526', 'glass': '#0f2a3a', 'glow_drive': '#7fd8ff', 'glow_cyan': '#5fe8ff',
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
         cap_back=True, bevel=0.03, back_material=None, front_material=None, smooth_angle=38.0):
    """Hull loft along X. sections: list of dict(x, w, ht, hb, zc=0, n=2.4, y=0).

    bands: {section_index: finish} — faces between section i and i+1 get that finish (livery).
    belly: finish for downward-facing faces (two-tone hulls read solid from above).
    """
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
    return ship.add(_new_object(name, bm, mats, bevel=bevel, smooth_angle=smooth_angle))


def plate(ship, name, outline, z0, thickness, material='paint', chamfer=0.0, chamfer_bottom=0.0,
          bevel=0.025, mirror=False, side_material=None, top_material=None, twist=None):
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
    obj = ship.add(_new_object(name, bm, ship.slots(mats), bevel=bevel, smooth_angle=30.0))
    if mirror:
        bm2, _ = build([(x, -y) for (x, y) in reversed(outline)])
        ship.add(_new_object(name + '_M', bm2, ship.slots(mats), bevel=bevel, smooth_angle=30.0))
    return obj


def box(ship, name, center, size, material='gunmetal', bevel=0.02, mirror=False, rot_z=0.0, taper=1.0):
    def build(c):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= size[0]
            v.co.y *= size[1]
            v.co.z *= size[2]
            if taper != 1.0 and v.co.z > 0:
                v.co.x *= taper
                v.co.y *= taper
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot_z, 3, 'Z'))
        bmesh.ops.translate(bm, verts=bm.verts, vec=c)
        return bm
    obj = ship.add(_new_object(name, build(center), ship.slots([material]), bevel=bevel, smooth_angle=30.0))
    if mirror:
        ship.add(_new_object(name + '_M', build((center[0], -center[1], center[2])), ship.slots([material]),
                             bevel=bevel, smooth_angle=30.0))
    return obj


def cylinder(ship, name, p0, p1, r0, r1=None, material='gunmetal', segments=28, cap=True, bevel=0.015,
             mirror=False, cap_material=None):
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
        mats = [material] + ([cap_material] if cap_material else [])
        if cap:
            f0 = bm.faces.new(list(reversed(ring0)))
            f1 = bm.faces.new(ring1)
            if cap_material:
                f1.material_index = 1
                f0.material_index = 1
        rot = Vector((1, 0, 0)).rotation_difference(axis.normalized()).to_matrix()
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
        bmesh.ops.translate(bm, verts=bm.verts, vec=a)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm, list(dict.fromkeys(mats))
    bm, mats = build(p0, p1)
    obj = ship.add(_new_object(name, bm, ship.slots(mats), bevel=bevel, smooth_angle=50.0))
    if mirror:
        m0 = (p0[0], -p0[1], p0[2])
        m1 = (p1[0], -p1[1], p1[2])
        bm2, _ = build(m0, m1)
        ship.add(_new_object(name + '_M', bm2, ship.slots(mats), bevel=bevel, smooth_angle=50.0))
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
        return self._mats[finish]

    def slots(self, finishes):
        return [self.mat(f) for f in dict.fromkeys(finishes)]

    def add(self, obj):
        if self.detail:
            obj['forge_detail'] = self.detail
        self.objects.append(obj)
        return obj

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


def band(ship, obj_name, point, normal, width, finish, facing=None, mirror=False, min_facing=0.35):
    """Paint a livery band onto an existing part: slice it with two parallel planes and give the
    faces between them `finish`. Real geometry edges, so the stripe is crisp at any distance and
    follows the form (a wing chevron, a spine stripe, a nose ring).

    point/normal: band centre-plane (Blender coords); width: metres across the band.
    facing: optional direction; only faces whose normal points that way get paint (e.g. (0,0,1)).
    """
    targets = [(obj_name, point, normal, facing)]
    if mirror:
        targets.append((obj_name + '_M', (point[0], -point[1], point[2]), (normal[0], -normal[1], normal[2]),
                        None if facing is None else (facing[0], -facing[1], facing[2])))
    mat = ship.mat(finish)
    for name, p, n, fdir in targets:
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise KeyError(f'band: no part {name}')
        me = obj.data
        if mat.name not in [m.name for m in me.materials if m]:
            me.materials.append(mat)
        slot = [m.name if m else None for m in me.materials].index(mat.name)
        nv = Vector(n).normalized()
        pv = Vector(p)
        bm = bmesh.new()
        bm.from_mesh(me)
        for off in (-width / 2.0, width / 2.0):
            co = pv + nv * off
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=nv, dist=1e-5)
        bm.normal_update()
        fv = Vector(fdir).normalized() if fdir is not None else None
        for f in bm.faces:
            c = f.calc_center_median()
            d = (c - pv).dot(nv)
            if abs(d) < width / 2.0 - 1e-4 and (fv is None or f.normal.dot(fv) > min_facing):
                f.material_index = slot
        bm.to_mesh(me)
        bm.free()
    return mat
