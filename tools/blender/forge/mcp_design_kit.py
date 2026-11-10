"""Forge MCP design kit: helpers for designing on a forged body inside the OPEN Blender (MCP).

Never call a recipe's build() in the open Blender (it wipes the scene). Instead import the preview
GLB (`assets/ships/forge/preview/<file>.glb`; it lands in the recipe's own Blender metres) and use
these helpers to read the skin, place candidate strips, and render a 60-degree chase view.

Load once through the MCP:
    exec(open(r'<repo>/tools/blender/forge/mcp_design_kit.py').read())
Then, e.g.:
    load('hornet_production_v1.glb')
    surface_z(-0.6, 2.1)                  # -> (z, normal, object) of the skin under (x, y)
    strip('LE', (-0.6, 2.1, 0.13), (5.0, 0.1, 0.06), '#ffcc2e', rot=(0, 0, 0.74))
    rail('JawRail', [(2.6, 1.25, 0.5), (5.4, 1.1, 0.24)], 0.14, 0.08, '#ff7a1e')
    chase_view(r'C:/tmp/design.png', zoom=0.9)   # EEVEE render from the chase angle, then LOOK at it
Every strip() reports the distance from its underside to the nearest skin: > 0.02 m floats.
Copy the numbers into the recipe as F.band / F.box / F.boxes; the fleet-look picture is the judge.
"""
import math
import os

import bpy
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')) \
    if '__file__' in globals() else r'C:\Users\93rob\Documents\GitHub\SpaceFace'
PREVIEW = os.path.join(REPO, 'assets', 'ships', 'forge', 'preview')


def _meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('LOD0_') and not o.get('sf_trim')]


def load(file):
    """Clear the scene (keeps the kit camera/sun) and import a preview GLB by file name."""
    for o in list(bpy.data.objects):
        if o.name not in ('SF_CAM', 'SF_SUN'):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(PREVIEW, file))
    prep_scene()
    mn, mx = bounds()
    return {'meshes': len(_meshes()), 'min': [round(v, 2) for v in mn], 'max': [round(v, 2) for v in mx]}


def bounds():
    mn = Vector((1e9,) * 3)
    mx = Vector((-1e9,) * 3)
    for o in _meshes() + [o for o in bpy.data.objects if o.get('sf_trim')]:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def prep_scene():
    """Hide collision/LOD1/LOD2, add a key sun and a dark world so the render reads."""
    for o in bpy.data.objects:
        if o.name.startswith(('COLLISION', 'LOD1', 'LOD2')):
            o.hide_render = True
            o.hide_viewport = True
    sun = bpy.data.objects.get('SF_SUN')
    if sun is None:
        sun = bpy.data.objects.new('SF_SUN', bpy.data.lights.new('SF_SUN', 'SUN'))
        bpy.context.scene.collection.objects.link(sun)
    sun.data.energy = 4.0
    sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(-60))
    sc = bpy.context.scene
    if not sc.world:
        sc.world = bpy.data.worlds.new('SF_World')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.05, 0.06, 0.09, 1)
        bg.inputs[1].default_value = 1.0


def surface_z(x, y, from_z=50.0):
    """Top-down raycast: the highest skin point under (x, y) -> (z, normal, object name) or None."""
    best = None
    dg = bpy.context.evaluated_depsgraph_get()
    for o in _meshes():
        mw = o.matrix_world
        inv = mw.inverted()
        origin = inv @ Vector((x, y, from_z))
        direction = (inv.to_3x3() @ Vector((0, 0, -1))).normalized()
        hit, loc, nrm, _ = o.ray_cast(origin, direction, depsgraph=dg)
        if hit:
            wl = mw @ loc
            if best is None or wl.z > best[0]:
                best = (wl.z, list((mw.to_3x3() @ nrm).normalized()), o.name)
    return best


def nearest(p):
    """Nearest skin point to p -> (distance, object name)."""
    p = Vector(p)
    best = None
    dg = bpy.context.evaluated_depsgraph_get()
    for o in _meshes():
        mw = o.matrix_world
        ok, loc, _, _ = o.closest_point_on_mesh(mw.inverted() @ p, depsgraph=dg)
        if ok:
            d = ((mw @ loc) - p).length
            if best is None or d < best[0]:
                best = (d, o.name)
    return best


def clear_trims():
    for o in [o for o in bpy.data.objects if o.get('sf_trim')]:
        bpy.data.objects.remove(o, do_unlink=True)


def trim_mat(hexcol):
    name = 'sf_trim_' + hexcol
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    h = hexcol.lstrip('#')
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
    bsdf.inputs['Emission Strength'].default_value = 8.0
    return m


def strip(name, center, size, hexcol='#5fe8ff', rot=(0, 0, 0)):
    """Place an emissive box (Blender coords, XYZ euler) and report how far its underside is from the skin."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.rotation_euler = rot
    o['sf_trim'] = True
    o.data.materials.append(trim_mat(hexcol))
    bpy.context.view_layer.update()
    bottom = o.matrix_world @ Vector((0, 0, -0.5))
    return {'name': o.name, 'loc': [round(v, 3) for v in o.matrix_world.translation],
            'rot': [round(v, 4) for v in o.rotation_euler], 'nearest_bottom': nearest(bottom)}


def rail(name, pts, w, h, hexcol='#5fe8ff'):
    """A polyline of tilted boxes (a lit rail on a sloped edge). Returns one strip() report per segment.
    The rot it prints is what F.box(..., rot=(0, pitch, yaw)) takes in the recipe."""
    out = []
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        d = b - a
        yaw = math.atan2(d.y, d.x)
        pitch = -math.atan2(d.z, math.hypot(d.x, d.y))
        out.append(strip(f'{name}_{i}', tuple((a + b) / 2), (d.length, w, h), hexcol, rot=(0, pitch, yaw)))
    return out


def chase_view(path, zoom=1.0, res=(900, 700)):
    """Render the scene from the game's 60-degree top-down chase angle (camera aft and above, ortho)."""
    mn, mx = bounds()
    ctr = (mn + mx) / 2
    ext = (mx - mn).length
    cam = bpy.data.objects.get('SF_CAM')
    if cam is None:
        cam = bpy.data.objects.new('SF_CAM', bpy.data.cameras.new('SF_CAM'))
        bpy.context.scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ext * 0.95 / zoom
    tilt = math.radians(60)
    cam.location = ctr + Vector((-math.cos(tilt), 0, math.sin(tilt))) * (ext * 2)
    cam.rotation_euler = (math.radians(30), 0, math.radians(-90))
    sc = bpy.context.scene
    sc.camera = cam
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
    return path
