"""The hull as a technical line drawing for the refit jig (src/ui/orrery/hullSchematic.js).

blender -b -P render_jig.py -- <glb> <out.png> [size]

Same camera as render_hull.py's plan view (orthographic, straight down, ortho scale 1.18 x the longest
plan dimension, nose along the hull's long axis), so the plan view's projected marks land on it once
both are published the same way. The model's own materials, decals and shading are replaced by one
flat near-black fill (it hides whatever runs behind the ship), and Freestyle draws the lines: the
silhouette heavy, creases and open borders fine. tools/art/jig_glyph.py tints the result bone and
turns it nose up.
"""
import bpy, math, sys, re
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
S = int(argv[2]) if len(argv) > 2 else 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=glb)

paint = []
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
    # markings, accents, dirt and grime are paint on the model, not its form: the drawing leaves them out
    # (after the framing, which must match render_hull.py's plan view exactly)
    elif o.type == 'MESH' and (re.search(r'decal|marking|dirt|grime|accent', o.name, re.I)
                               or (o.data.materials and all(m and re.search(r'marking|warning|accent|dirt|decal', m.name, re.I)
                                                            for m in o.data.materials))):
        paint.append(o)
meshes = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and o.visible_get()]
if not meshes:
    raise SystemExit('no meshes in ' + glb)

mins = Vector((1e9, 1e9, 1e9)); maxs = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
        maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
center = (mins + maxs) / 2
size = maxs - mins
radius = max(size.x, size.y, size.z) / 2
for o in paint:
    o.hide_render = True
    o.hide_set(True)
meshes = [o for o in meshes if o not in paint]

# one flat fill for everything: the drawing is the lines
fill = bpy.data.materials.new('jig_fill')
fill.use_nodes = True
nt = fill.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (0.010, 0.009, 0.008, 1)
em.inputs['Strength'].default_value = 1.0
mo = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(em.outputs['Emission'], mo.inputs['Surface'])
for o in meshes:
    o.data.materials.clear()
    o.data.materials.append(fill)

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = S
sc.render.resolution_y = S
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); sc.world = w

cam_d = bpy.data.cameras.new('cam')
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.type = 'ORTHO'
cam_d.ortho_scale = max(size.x, size.y) * 1.18
cam.location = center + Vector((0, 0, radius * 6))
d = center - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
cam_d.clip_end = radius * 20

sc.render.use_freestyle = True
sc.render.line_thickness_mode = 'ABSOLUTE'
vl = sc.view_layers[0]
fs = vl.freestyle_settings
fs.crease_angle = math.radians(128)
fs.use_culling = False
k = S / 1024.0

def lineset(name, edges, thickness, alpha):
    ls = fs.linesets.new(name) if name not in fs.linesets else fs.linesets[name]
    ls.select_by_visibility = True
    ls.visibility = 'VISIBLE'
    ls.select_by_edge_types = True
    for attr in ('select_silhouette', 'select_border', 'select_crease', 'select_external_contour',
                 'select_contour', 'select_material_boundary', 'select_suggestive_contour', 'select_ridge_valley'):
        setattr(ls, attr, attr in edges)
    style = ls.linestyle
    style.color = (1, 1, 1)
    style.alpha = alpha
    style.thickness = thickness * k
    style.caps = 'ROUND'
    return ls

# the default lineset becomes the fine one; the heavy outline is its own
for ls in list(fs.linesets):
    fs.linesets.remove(ls)
lineset('fine', {'select_crease', 'select_border'}, 0.8, 0.3)
lineset('outline', {'select_silhouette', 'select_external_contour', 'select_contour'}, 2.2, 0.92)

sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('JIG_DONE', out)
