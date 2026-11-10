# Differentiate an asset's BASE-COLOUR maps per material role, and bed them into the geometry with AO.
#
#   blender --background --python tools/blender/gfx_albedo_paint.py -- <job.json>
#
# WHY THIS EXISTS
# Seven measured attempts failed to move review's `material: 2/5`, including a real AO bake that gave
# all ten of the Kestrel's ORMs 16x more occlusion variation. The note explains why:
#
#   "ship surfaces read as similar matte GRAY PLASTIC PANELS"
#   "the references distinguish painted metal, glass, hot engine elements... "
#
# It is judging ALBEDO — how different the panels look from each other — not roughness or occlusion.
# The Kestrel's ten ORMs already separate roughness well BETWEEN materials (means 0.41-0.85) and that
# never scored. Reference ships read as white hull + dark recessed panels + coloured markings + hot
# emissives. Ours is grey panels sharing one palette.
#
# WHAT IT DOES
# Per material ROLE, resolved from the material graph rather than from image names:
#   * value separation — structural/armour roles go darker, hull/plating goes lighter, so adjacent
#     panels differ in VALUE. Value contrast is what reads at gameplay distance; hue does not.
#   * saturation boost on accent roles (markings, warnings, repair patches) so they stay legible as
#     paint instead of averaging into the grey.
#   * AO multiplied into base colour, so recesses read dark even where lighting is flat — which is the
#     one thing the renderer provably cannot do (it does not know where a recess is).
#
# Hue is never rotated: the ship keeps its identity, the panels stop being the same swatch.
#
# SAFETY
# Writes to an OUTPUT PATH ONLY. Never overwrites its input. Geometry, sockets, LOD and collision are
# passed through untouched; only image pixels change.
import bpy
import json
import os
import sys


def argv_after_ddash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def image_ready(img):
    try:
        if img.packed_file is None and not img.filepath:
            return False
        _ = img.pixels[0]
        return img.size[0] > 0 and img.size[1] > 0
    except Exception:
        return False


def walk_to_image(inp):
    if not inp or not inp.is_linked:
        return None
    node = inp.links[0].from_node
    for _ in range(4):
        if node.type == 'TEX_IMAGE':
            return node.image
        linked = [i for i in node.inputs if i.is_linked]
        if not linked:
            return None
        node = linked[0].links[0].from_node
    return None


def basecolor_images():
    """image name -> owning material name, resolved from Principled Base Color."""
    out = {}
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            img = walk_to_image(node.inputs.get('Base Color'))
            if img:
                out.setdefault(img.name, mat.name)
    return out


# Role classification drives value separation. Matched against the material AND image name so a rename
# on one side cannot silently drop an asset into the default bucket.
# Order matters and the buckets must not overlap ambiguously. `engine_ceramic` is a LIGHT surface, but
# an earlier revision put 'engine' in DARKEN and tested DARKEN first, so it was driven dark — the
# opposite of intent. LIGHTEN is therefore tested BEFORE DARKEN, and 'engine' is removed from DARKEN
# because it is a location word, not a value word.
ACCENT = ('cyan', 'orange', 'green', 'warning', 'repair', 'marking', 'decal', 'frontier')
LIGHTEN = ('hull', 'plate', 'plating', 'brushed', 'panel', 'ceramic')
DARKEN = ('armor', 'mechanical', 'structure', 'frame', 'rubber', 'dark')


def classify(name):
    low = name.lower()
    for k in ACCENT:
        if k in low:
            return 'accent'
    for k in LIGHTEN:              # before DARKEN: 'engine_ceramic' must read as ceramic
        if k in low:
            return 'lighten'
    for k in DARKEN:
        if k in low:
            return 'darken'
    return 'neutral'


def channel_stats(px, n, ch, budget=2048):
    step = max(1, n // budget)
    vals = [px[i * 4 + ch] for i in range(0, n, step)]
    if not vals:
        return 0.0, 0.0
    mean = sum(vals) / len(vals)
    sd = (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5
    return mean, sd


def bake_ao(size, samples):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 8
    ao_img = bpy.data.images.new('SF_AO_BAKE', width=size, height=size, alpha=False, float_buffer=False)

    def bakeable(o):
        if o.type != 'MESH' or len(o.data.polygons) == 0:
            return False
        upper = o.name.upper()
        if 'COLLISION' in upper or upper.startswith('SOCKET'):
            return False
        # A UV layer COLLECTION can exist with no ACTIVE layer; the operator aborts on that.
        return o.data.uv_layers.active is not None

    meshes = [o for o in bpy.data.objects if bakeable(o)]
    if not meshes:
        return None, 'no bakeable meshes'
    for obj in meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = ao_img
            node.name = 'SF_AO_TARGET'
            mat.node_tree.nodes.active = node
    for obj in bpy.data.objects:
        obj.select_set(obj in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    try:
        bpy.ops.object.bake(type='AO')
    except Exception as exc:                                    # noqa: BLE001
        return None, 'bake failed: %s' % exc
    finally:
        for mat in bpy.data.materials:
            if not mat.use_nodes or not mat.node_tree:
                continue
            for n in [x for x in mat.node_tree.nodes if x.name == 'SF_AO_TARGET']:
                mat.node_tree.nodes.remove(n)
    return ao_img, None


def main():
    args = argv_after_ddash()
    if not args:
        print('usage: -- <job.json>')
        return
    with open(args[0], 'r', encoding='utf-8') as fh:
        job = json.load(fh)

    src, dst = job['input'], job['output']
    darken = float(job.get('darken', 0.62))          # multiplier for structural roles
    lighten = float(job.get('lighten', 1.42))        # multiplier for hull/plating roles
    accent_sat = float(job.get('accentSat', 1.55))   # saturation gain on markings
    ao_albedo = float(job.get('aoAlbedo', 0.45))     # how hard AO beds into base colour
    rough_target = float(job.get('roughTarget', 0.0)) # 0 = leave roughness alone
    rough_pull = float(job.get('roughPull', 0.0))     # how far each texel is pulled toward it
    bake_size = int(job.get('bakeSize', 1024))
    samples = int(job.get('samples', 24))

    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    bc = basecolor_images()
    report = {'input': src, 'output': dst, 'baseColorImages': sorted(bc.keys()), 'images': []}

    ao_img, err = bake_ao(bake_size, samples)
    report['bakeError'] = err
    if ao_img is None:
        report['ok'] = False
        print('[paint] ' + json.dumps(report))
        with open(dst + '.report.json', 'w', encoding='utf-8') as fh:
            json.dump(report, fh, indent=2)
        return
    ao_px = list(ao_img.pixels)
    ao_w, ao_h = ao_img.size

    for img in list(bpy.data.images):
        if img.name == 'SF_AO_BAKE' or img.name not in bc or not image_ready(img):
            continue
        role = classify(img.name + ' ' + bc.get(img.name, ''))
        w, h = img.size
        n = w * h
        px = list(img.pixels)
        mean_before, _ = channel_stats(px, n, 0)

        gain = darken if role == 'darken' else lighten if role == 'lighten' else 1.0
        for j in range(h):
            aj = min(ao_h - 1, int(j * ao_h / h))
            for i in range(w):
                ai = min(ao_w - 1, int(i * ao_w / w))
                ao = ao_px[(aj * ao_w + ai) * 4]
                shade = 1.0 - ao_albedo * (1.0 - ao)
                idx = (j * w + i) * 4
                r, g, b = px[idx], px[idx + 1], px[idx + 2]
                if role == 'accent':
                    # Markings are paint applied ON TOP of the hull: they should stay bright and stay
                    # saturated. Bedding AO into them (as an earlier revision did) crushed the cyan
                    # from 0.143 to 0.011 and defeated the whole point of boosting them.
                    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    r = lum + (r - lum) * accent_sat
                    g = lum + (g - lum) * accent_sat
                    b = lum + (b - lum) * accent_sat
                    px[idx] = max(0.0, min(1.0, r))
                    px[idx + 1] = max(0.0, min(1.0, g))
                    px[idx + 2] = max(0.0, min(1.0, b))
                else:
                    # AO is applied BEFORE the role gain so a lightened role actually ends up lighter.
                    # Applying it after cancelled the 1.42x hull gain outright (0.283 -> 0.289).
                    r, g, b = r * shade * gain, g * shade * gain, b * shade * gain
                    px[idx] = max(0.0, min(1.0, r))
                    px[idx + 1] = max(0.0, min(1.0, g))
                    px[idx + 2] = max(0.0, min(1.0, b))
        img.pixels[:] = px
        mean_after, _ = channel_stats(px, n, 0)
        report['images'].append({
            'image': img.name, 'material': bc.get(img.name), 'role': role,
            'redMean': [round(mean_before, 4), round(mean_after, 4)],
        })

    # ---- roughness re-target ------------------------------------------------------------------
    # Nine measured experiments failed to move review's `material` axis, including a real AO bake and a
    # per-role repaint. The remaining explanation is the simplest: the ship is matte because it is
    # AUTHORED matte. Shipped ORM roughness MEANS are 0.41-0.85 at metalness 0.08-0.42, and high
    # roughness at low metalness is by definition matte painted plastic — so adding VARIATION to that
    # value could never help, because the value itself is too high to take a specular hit from the
    # reflection rig that already exists (three emissive cards at radiance 4.2/2.4/1.15).
    #
    # This pulls each texel a fraction of the way toward a lower target instead of flattening to it, so
    # the within-material variation gained from the AO pass survives. Accents and roles that should
    # stay rough (rubber, radiator, ceramic) are left alone — a uniformly glossy ship is as wrong as a
    # uniformly matte one, and the goal is SEPARATION between surface families.
    if rough_target > 0.0 and rough_pull > 0.0:
        orm_names = set()
        for mat in bpy.data.materials:
            if not mat.use_nodes or not mat.node_tree:
                continue
            for node in mat.node_tree.nodes:
                if node.type != 'BSDF_PRINCIPLED':
                    continue
                for slot in ('Roughness', 'Metallic'):
                    img2 = walk_to_image(node.inputs.get(slot))
                    if img2:
                        orm_names.add(img2.name)
        keep_rough = ('rubber', 'radiator', 'ceramic')
        for img in list(bpy.data.images):
            if img.name not in orm_names or not image_ready(img):
                continue
            low = img.name.lower()
            if any(k in low for k in keep_rough) or classify(low) == 'accent':
                continue
            w, h = img.size
            n = w * h
            px = list(img.pixels)
            mean_b, _ = channel_stats(px, n, 1)
            for idx in range(1, n * 4, 4):
                px[idx] = max(0.0, min(1.0, px[idx] + (rough_target - px[idx]) * rough_pull))
            img.pixels[:] = px
            mean_a, _ = channel_stats(px, n, 1)
            report['images'].append({
                'image': img.name, 'role': 'orm-roughness',
                'redMean': [round(mean_b, 4), round(mean_a, 4)],
            })

    bpy.data.images.remove(ao_img)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=dst, export_format='GLB', export_materials='EXPORT',
        export_image_format='AUTO', export_extras=True, export_yup=True, use_selection=False,
    )
    report['ok'] = os.path.exists(dst) and len(report['images']) > 0
    report['wroteNoMaps'] = len(report['images']) == 0
    report['bytes'] = os.path.getsize(dst) if os.path.exists(dst) else 0
    print('[paint] ' + json.dumps(report))
    with open(dst + '.report.json', 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=2)


main()
