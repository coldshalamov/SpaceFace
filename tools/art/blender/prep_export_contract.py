"""Restore spaceface_export contract on authored blends after quality renders."""
from __future__ import annotations

import os

import bpy

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
PART_ID = os.environ['SF_PART_ID']
BLEND = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_authored.blend')

ROLE_COLORS = {
    'Material_Hull': (0.22, 0.23, 0.26, 1.0),
    'Material_Mechanical': (0.14, 0.13, 0.12, 1.0),
    'Material_Accent': (0.75, 0.25, 0.18, 1.0),
}

ACCENT_KW = (
    'ACCENT', 'PLUME', 'COIL', 'BLEED', 'VIOLET', 'VEIN', 'PORT', 'STENCIL', 'FACET',
    'CRYSTAL', 'PHASE', 'RESONANCE', 'HEAT', 'RED', 'STRIPE', 'SCORCH', 'FUSION',
    'PLASMA', 'CORPORATE', 'NOZZLE', 'FAN', 'HOOK', 'DET_', 'LATTICE', 'POLISH',
)


def pick_role(name: str) -> str:
    nu = name.upper()
    if any(k in nu for k in ACCENT_KW):
        return 'Material_Accent'
    if 'HULL' in nu or ('MAIN' in nu and 'MECHANICAL' not in nu):
        return 'Material_Hull'
    return 'Material_Mechanical'


def ensure_placeholder_images():
    for label, color in (('SF_ao_flat', (0.5, 0.5, 0.5, 1.0)), ('SF_rough_flat', (0.45, 0.45, 0.45, 1.0))):
        if label not in bpy.data.images:
            img = bpy.data.images.new(label, 4, 4)
            img.generated_color = color
            img.use_fake_user = True


def ensure_role_material(role_name: str) -> bpy.types.Material:
    ensure_placeholder_images()
    mat = bpy.data.materials.get(role_name) or bpy.data.materials.new(role_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (300, 0)
    ao_tex = nodes.new('ShaderNodeTexImage')
    ao_tex.name = 'ao_bake'
    ao_tex.image = bpy.data.images['SF_ao_flat']
    ao_tex.location = (-500, 200)
    rough_tex = nodes.new('ShaderNodeTexImage')
    rough_tex.name = 'rough_bake'
    rough_tex.image = bpy.data.images['SF_rough_flat']
    rough_tex.location = (-500, -100)
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.35
    mix.location = (0, 100)
    links.new(ao_tex.outputs['Color'], mix.inputs['A'])
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    links.new(rough_tex.outputs['Color'], bsdf.inputs['Roughness'])
    rgba = ROLE_COLORS.get(role_name, (0.2, 0.2, 0.22, 1.0))
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = 0.7
    bsdf.inputs['Roughness'].default_value = 0.42
    if role_name == 'Material_Accent':
        bsdf.inputs['Emission Color'].default_value = rgba
        bsdf.inputs['Emission Strength'].default_value = 0.25
    return mat


def ensure_bevel(obj: bpy.types.Object):
    nu = obj.name.upper()
    if '_MERGED' in nu or 'HOOK_DRIVE' in nu:
        for mod in list(obj.modifiers):
            if mod.type == 'BEVEL':
                obj.modifiers.remove(mod)
        return
    for mod in list(obj.modifiers):
        if mod.type == 'BEVEL' and mod.name.startswith('SF_Bevel') and mod.segments >= 2:
            return
    if len(obj.data.polygons) < 4:
        return
    mod = obj.modifiers.new('SF_ExportBevel', 'BEVEL')
    mod.width = 0.004 if len(obj.data.polygons) > 200 else 0.005
    mod.segments = 2
    mod.limit_method = 'ANGLE'
    mod.angle_limit = 0.785398


def part_meshes():
    root = bpy.data.objects.get(PART_ID)
    meshes = []

    def walk(o):
        if o.type == 'MESH':
            meshes.append(o)
        for c in o.children:
            walk(c)

    if root:
        walk(root)
    else:
        meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    return meshes


bpy.ops.wm.open_mainfile(filepath=BLEND)
mats = {r: ensure_role_material(r) for r in ROLE_COLORS}
for obj in part_meshes():
    obj['spaceface_chamfered'] = True
    ensure_bevel(obj)
    role = pick_role(obj.name)
    mat = mats[role]
    if not obj.data.materials:
        obj.data.materials.append(mat)
    else:
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = mat
    obj.hide_render = False

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
result = {'part_id': PART_ID, 'meshes': len(part_meshes()), 'materials': list(mats.keys())}