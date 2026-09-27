"""Headless render of one asteroid TYPE for the interface (Help's ore mix hub).

blender -b -P render_rock_type.py -- <rock.glb> <out.png> <kind> [size] [samples]
  kind: common | metallic | icy | crystalline | gas | exotic
The rock body is the game's own authored asteroid (assets/ships/parts/places/place_asteroid_rock_*.glb);
each type is dressed after the palette the belt draws it in (src/render/visualFactory.js AST_TYPE):
common dull stone, metallic dark steel with cyan-lit seams, icy pale glassy ice, crystalline violet
crystal veins, exotic near-black with magenta veins; the gas cloud is a volume, not a rock.
Transparent film, AgX, the same warm key / cold rim / low fill the hull renders use.
"""
import bpy, math, sys, time
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
glb, out, kind = argv[0], argv[1], argv[2]
SIZE = int(argv[3]) if len(argv) > 3 else 768
SAMPLES = int(argv[4]) if len(argv) > 4 else 48
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links

if kind == 'gas':
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0)
    body = bpy.context.active_object
    body.scale = (1.5, 1.0, 0.75)
    m, n, l = node_mat('gas')
    for x in list(n): n.remove(x)
    outn = n.new('ShaderNodeOutputMaterial')
    vol = n.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (0.22, 0.62, 0.5, 1)
    vol.inputs['Emission Color'].default_value = (0.12, 0.7, 0.42, 1)
    vol.inputs['Emission Strength'].default_value = 0.35
    tex = n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 2.2; tex.inputs['Detail'].default_value = 14.0; tex.inputs['Distortion'].default_value = 0.9
    coord = n.new('ShaderNodeTexCoord')
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.5; ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = 0.57; ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    # fall off toward the edge of the sphere so the cloud has no hard rim
    grad = n.new('ShaderNodeTexGradient'); grad.gradient_type = 'SPHERICAL'
    mul = n.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    dens = n.new('ShaderNodeMath'); dens.operation = 'MULTIPLY'; dens.inputs[1].default_value = 24.0
    l.new(coord.outputs['Object'], tex.inputs['Vector'])
    l.new(coord.outputs['Object'], grad.inputs['Vector'])
    l.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    l.new(ramp.outputs['Color'], mul.inputs[0])
    l.new(grad.outputs['Fac'], mul.inputs[1])
    l.new(mul.outputs[0], dens.inputs[0])
    l.new(dens.outputs[0], vol.inputs['Density'])
    l.new(vol.outputs['Volume'], outn.inputs['Volume'])
    body.data.materials.append(m)
    meshes = [body]
else:
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for o in meshes:
        bpy.context.view_layer.objects.active = o
        if kind == 'common':
            continue  # the authored rock as it is
        m, n, l = node_mat(kind)
        bsdf = n['Principled BSDF']
        coord = n.new('ShaderNodeTexCoord')
        if kind == 'metallic':
            bsdf.inputs['Base Color'].default_value = (0.2, 0.22, 0.25, 1)
            bsdf.inputs['Metallic'].default_value = 0.85
            bsdf.inputs['Roughness'].default_value = 0.34
            vein_color, vein_strength, vein_scale, vein_width = (0.25, 0.82, 1.0, 1), 3.0, 4.5, 0.018
        elif kind == 'icy':
            bsdf.inputs['Base Color'].default_value = (0.66, 0.84, 0.93, 1)
            bsdf.inputs['Roughness'].default_value = 0.14
            bsdf.inputs['Coat Weight'].default_value = 1.0
            bsdf.inputs['Transmission Weight'].default_value = 0.18
            vein_color, vein_strength, vein_scale, vein_width = (0.37, 0.88, 1.0, 1), 1.6, 3.5, 0.014
        elif kind == 'crystalline':
            bsdf.inputs['Base Color'].default_value = (0.2, 0.15, 0.3, 1)
            bsdf.inputs['Roughness'].default_value = 0.24
            bsdf.inputs['Metallic'].default_value = 0.25
            vein_color, vein_strength, vein_scale, vein_width = (0.75, 0.38, 1.0, 1), 6.0, 3.2, 0.03
        else:  # exotic
            bsdf.inputs['Base Color'].default_value = (0.09, 0.07, 0.13, 1)
            bsdf.inputs['Metallic'].default_value = 0.5
            bsdf.inputs['Roughness'].default_value = 0.45
            vein_color, vein_strength, vein_scale, vein_width = (1.0, 0.25, 0.75, 1), 7.0, 4.0, 0.022
        # veins of light: the edges of a voronoi pattern on the rock's own surface
        vor = n.new('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = vein_scale
        ramp = n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
        ramp.color_ramp.elements[1].position = vein_width; ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
        l.new(coord.outputs['Generated'], vor.inputs['Vector'])
        l.new(vor.outputs['Distance'], ramp.inputs['Fac'])
        bsdf.inputs['Emission Color'].default_value = vein_color
        l.new(ramp.outputs['Color'], bsdf.inputs['Emission Strength'])
        mulv = n.new('ShaderNodeMath'); mulv.operation = 'MULTIPLY'; mulv.inputs[1].default_value = vein_strength
        l.new(ramp.outputs['Color'], mulv.inputs[0])
        l.new(mulv.outputs[0], bsdf.inputs['Emission Strength'])
        o.data.materials.clear()
        o.data.materials.append(m)

mins = Vector((1e9, 1e9, 1e9)); maxs = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mins = Vector((min(mins.x, w.x), min(mins.y, w.y), min(mins.z, w.z)))
        maxs = Vector((max(maxs.x, w.x), max(maxs.y, w.y), max(maxs.z, w.z)))
center = (mins + maxs) / 2
radius = max((maxs - mins).length / 2, 0.01)

sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.render.resolution_x = SIZE
sc.render.resolution_y = SIZE
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'
sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = 0.7
try:
    sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (0.03, 0.035, 0.045, 1)
bg.inputs['Strength'].default_value = 0.3

cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 70
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
def look_at(obj, target):
    d = target - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
dist = radius / math.tan(math.atan(18 / 70)) * 1.12
el = math.radians(26); az = math.radians(-32)
cam.location = center + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
look_at(cam, center)

def light(name, energy, color, loc, size_):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color; ld.size = size_
    lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo)
    lo.location = loc; look_at(lo, center)
R = max(radius, 0.5); k = R * R
light('key', 260 * k, (1.0, 0.84, 0.66), center + Vector((-R * 3.2, -R * 2.6, R * 3.4)), R * 2.2)
light('rim', 380 * k, (0.60, 0.76, 1.0), center + Vector((R * 3.0, R * 3.2, R * 1.6)), R * 2.6)
light('fill', 40 * k, (0.80, 0.86, 0.96), center + Vector((R * 0.5, -R * 4.5, -R * 0.4)), R * 4.0)

sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDER_DONE', out, round(time.time() - t0, 1), 's')
