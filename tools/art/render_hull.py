"""Headless hero render of one ship GLB for the interface.

blender -b -P render_hull.py -- <glb> <out.png> [view] [width] [height] [samples]
  view: hero (3/4 front-left, slightly above) | side (orthographic port elevation) | top
Transparent film, AgX, and the game's Look (docs/visual-assets/LOOK.md) restated for Cycles so a
poster and the flight picture show the same ship: lacquered paint under a clear coat, a warm key
against an electric-cyan rim, ultramarine fill, lamps lifted so they read as light, and the
game's own reflection environment in the gloss. The camera frames the hull's bounding box so
every hull fills the plate the same.
Writes <out>.json with the camera framing and each named empty's projected position (for the
shipworks jig: mount points in image space).
"""
import bpy, math, sys, json, time
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
view = argv[2] if len(argv) > 2 else 'hero'
W = int(argv[3]) if len(argv) > 3 else 2400
H = int(argv[4]) if len(argv) > 4 else 1350
SAMPLES = int(argv[5]) if len(argv) > 5 else 128
# nose: which way the hull points along its long axis in Blender space ('+' or '-')
NOSE = -1.0 if (len(argv) > 6 and argv[6] == '-') else 1.0
EXPOSURE = float(argv[7]) if len(argv) > 7 else 0.8
t0 = time.time()

if glb.lower().endswith('.blend'):
    bpy.ops.wm.open_mainfile(filepath=glb)
    sc = bpy.context.scene
    # our light only: the authored file's lamps and cameras are switched off for the render
    for o in list(sc.objects):
        if o.type in ('LIGHT', 'CAMERA'):
            o.hide_render = True
else:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.import_scene.gltf(filepath=glb)

import re
# the game never draws collision shells, proxies or helpers; neither does the poster
for o in sc.objects:
    helper = re.search(r'collision|collider|proxy|helper|shadow_?caster|bounds', o.name, re.I)
    for key in ('collision', 'nonRender', 'helper'):
        try:
            if o.get(key): helper = True
        except Exception:
            pass
    if helper and o.type == 'MESH':
        o.hide_render = True
        o.hide_set(True)
meshes = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and o.visible_get()]
print('HIDDEN', [o.name for o in sc.objects if o.type == 'MESH' and o.hide_render])
if not meshes:
    raise SystemExit('no meshes in ' + glb)
# bounds in world space
mins = Vector((1e9, 1e9, 1e9)); maxs = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
        maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
center = (mins + maxs) / 2
size = maxs - mins
radius = max(size.x, size.y, size.z) / 2

sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception:
    try:
        prefs.compute_device_type = 'CUDA'; prefs.get_devices()
        for d in prefs.devices: d.use = True
        sc.cycles.device = 'GPU'
    except Exception:
        pass
sc.render.resolution_x = W
sc.render.resolution_y = H
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.compression = 90
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = EXPOSURE
try:
    sc.view_settings.look = 'AgX - High Contrast'
except Exception:
    pass

w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.02, 0.028, 0.05, 1)
bg.inputs['Strength'].default_value = 0.35
# The game's reflection environment (assets/background/env/deep_space_2k.hdr): the same strip
# light and cyan rim lobe the clear coat mirrors in flight. Low strength: it shapes the gloss,
# the area lights below do the lighting.
import os
_env = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'background', 'env', 'deep_space_2k.hdr')
if os.path.exists(_env):
    try:
        tex = w.node_tree.nodes.new('ShaderNodeTexEnvironment')
        tex.image = bpy.data.images.load(_env)
        w.node_tree.links.new(tex.outputs['Color'], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = 0.55
    except Exception as err:
        print('ENV_SKIPPED', err)

# The Look, restated on the imported materials. Mirrors src/render/illustratedSurface.js and
# src/data/lookMoods.js: smooth dielectric paint carries a clear coat; rough stone, dry ceramic
# and bare metal do not; signal and drive emission is lifted (window rows least).
LAMP_GAIN = {'glow_warm': 1.3, 'glow_drive': 1.7}
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        continue
    finish = str(mat.get('forgeFinish', '')).split('.')[0]
    rough = bsdf.inputs['Roughness'].default_value
    metal = bsdf.inputs['Metallic'].default_value
    # Texture-driven sockets read 0.5/0 here; the Forge finish names the real values.
    forge_paint = finish in ('paint', 'paint2', 'stripe', 'hazard', 'deadmetal')
    smooth_dielectric = (not bsdf.inputs['Roughness'].is_linked) and rough <= 0.55 and metal <= 0.4
    if finish.startswith('glow') or mat.get('spacefaceMaterialRole') in ('signal', 'drive'):
        gain = LAMP_GAIN.get(finish, 2.6)
        try:
            bsdf.inputs['Emission Strength'].default_value *= gain
        except Exception:
            pass
    elif (forge_paint and finish != 'deadmetal') or (not finish and smooth_dielectric):
        try:
            bsdf.inputs['Coat Weight'].default_value = 1.0
            bsdf.inputs['Coat Roughness'].default_value = 0.16
        except Exception:
            pass

# glTF forward is -Z in glTF, imported as +Y forward? Determine the long axis: that is the hull's length.
long_axis = max(range(3), key=lambda i: size[i])

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam

def look_at(obj, target):
    d = target - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

# The hull's nose direction along the long axis: guess +Y (Blender import of glTF +Z-forward models
# comes in with forward = -Y). We frame from the front-left quarter either way; the lineup only
# needs consistency across the three hulls, which all come from the same pipeline.
if view == 'hero':
    cam_d.lens = 70
    dist = radius * 5.2
    az = math.radians(-35)   # front-left
    el = math.radians(24)
    # camera on the NOSE side, swung toward the hull's port side
    offs = Vector((NOSE * math.sin(az) * math.cos(el), NOSE * math.cos(az) * math.cos(el), math.sin(el)))
    if long_axis == 0:
        offs = Vector((NOSE * math.cos(az) * math.cos(el), -NOSE * math.sin(az) * math.cos(el), math.sin(el)))
    cam.location = center + offs * dist
    look_at(cam, center)
elif view == 'side':
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = max(size.x, size.y) * 1.18
    if long_axis == 1:
        cam.location = center + Vector((radius * 6, 0, 0))
    else:
        cam.location = center + Vector((0, -radius * 6, 0))
    look_at(cam, center)
else:  # top
    cam_d.type = 'ORTHO'
    cam_d.ortho_scale = max(size.x, size.y) * 1.18
    cam.location = center + Vector((0, 0, radius * 6))
    look_at(cam, center)

def light(name, kind, energy, color, loc, size_=1.0):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == 'AREA': ld.size = size_
    lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo)
    lo.location = loc; look_at(lo, center)
    return lo

R = max(radius, 0.5)
k = R * R  # energy scales with area of the scene
# The `arcade` mood's rig: warm-white key, electric-cyan rim from behind, ultramarine fill. A
# smaller key than a studio softbox, so the clear coat shows a real glint instead of a wash.
light('key', 'AREA', 250 * k, (1.0, 0.88, 0.72), center + Vector((-R * 3.2, -R * 2.6, R * 3.4)), R * 0.55)
light('rim', 'AREA', 430 * k, (0.24, 0.70, 1.0), center + Vector((R * 3.0, R * 3.2, R * 1.6)), R * 0.9)
light('fill', 'AREA', 30 * k, (0.34, 0.46, 1.0), center + Vector((R * 0.5, -R * 4.5, -R * 0.4)), R * 4.0)
light('top', 'AREA', 26 * k, (1.0, 0.95, 0.9), center + Vector((0, 0, R * 5)), R * 1.4)

sc.render.filepath = out
bpy.ops.render.render(write_still=True)

# project named empties (sockets, mounts) into image space for the jig
from bpy_extras.object_utils import world_to_camera_view
marks = {}
for o in sc.objects:
    if o.type == 'EMPTY' or ('socket' in o.name.lower() or 'mount' in o.name.lower() or 'hardpoint' in o.name.lower()):
        co = world_to_camera_view(sc, cam, o.matrix_world.translation)
        marks[o.name] = [round(co.x, 4), round(1 - co.y, 4), round(co.z, 3)]
json.dump({'glb': glb, 'view': view, 'width': W, 'height': H, 'long_axis': long_axis,
           'size': [round(v, 3) for v in size], 'marks': marks,
           'seconds': round(time.time() - t0, 1)}, open(out.rsplit('.', 1)[0] + '.json', 'w'), indent=1)
print('RENDER_DONE', out, round(time.time() - t0, 1), 's', 'marks', len(marks))
