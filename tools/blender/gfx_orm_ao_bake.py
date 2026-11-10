# Bake geometric ambient occlusion into an asset's packed ORM and derive surface variation from it.
#
#   blender --background --python tools/blender/gfx_orm_ao_bake.py -- <job.json>
#
# WHY THIS EXISTS
# Independent review scores the player ship `material: 2/5` — "uniform grey plastic/painted block" —
# and its stated fix is "varied roughness, darker recessed panels, edge wear". Six renderer-side
# attempts to produce that were each measured and each failed, because the renderer has no way to know
# where a panel recess IS. That information lives in the GEOMETRY, and the only way to get it into a
# PBR material is to bake it.
#
# gfx_orm_breakup.py writes fbm noise, which is uncorrelated with the model — it adds texture but not
# structure. This bakes real ambient occlusion from the mesh, so the darkening lands exactly where the
# ship actually has recesses, seams, and intersections:
#
#   ORM red   (occlusion) <- baked AO, multiplied into whatever occlusion the map already had
#   ORM green (roughness) <- raised in occluded areas (cavities collect grime, so they scatter more)
#
# Metalness (blue) is never touched: that is a material identity decision, not a wear effect.
#
# SAFETY
# Writes to an OUTPUT PATH ONLY and never overwrites its input. The result is a candidate for the
# ordinary review/promotion path. Every geometry, socket, LOD and collision datum is passed through
# untouched — only image pixels change.
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


def roughness_images_from_graph():
    """Resolve ORM images from the material graph. Names are unreliable in both directions: 'n-ORM-al'
    matches a naive substring test, and real ORMs here are named things like `*_wear_mask_1k`."""
    found = set()
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            for slot in ('Roughness', 'Metallic'):
                inp = node.inputs.get(slot)
                if not inp or not inp.is_linked:
                    continue
                walk = inp.links[0].from_node
                for _ in range(4):
                    if walk.type == 'TEX_IMAGE':
                        if walk.image:
                            found.add(walk.image.name)
                        break
                    linked = [i for i in walk.inputs if i.is_linked]
                    if not linked:
                        break
                    walk = linked[0].links[0].from_node
    return found


def channel_stdev(px, n, channel, budget=2048):
    step = max(1, n // budget)
    vals = [px[i * 4 + channel] for i in range(0, n, step)]
    if not vals:
        return 0.0
    mean = sum(vals) / len(vals)
    return (sum((v - mean) ** 2 for v in vals) / len(vals)) ** 0.5


def bake_ao(size, samples):
    """Cycles AO bake of every visible mesh into one shared image, using existing UVs."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.use_selected_to_active = False
    scene.render.bake.margin = 8

    ao_img = bpy.data.images.new('SF_AO_BAKE', width=size, height=size, alpha=False, float_buffer=False)

    # Only UV'd render meshes can be baked. Collision proxies (COLLISION_HULL and friends) are
    # untextured helper geometry with no UV layer, and including one in the bake selection aborts the
    # whole operator with "No active UV layer found" — so they are filtered out here rather than
    # discovered as a failure. They are still exported untouched; they are simply not bake subjects.
    # `uv_layers` being non-empty is NOT sufficient: COLLISION_HULL carries a UV layer collection with
    # no ACTIVE layer, which passes a truthiness test and then aborts the bake operator anyway. Require
    # an active layer, and additionally exclude helper geometry by name so a future proxy without the
    # same shape cannot reintroduce the failure.
    def bakeable(o):
        if o.type != 'MESH' or len(o.data.polygons) == 0:
            return False
        upper = o.name.upper()
        if 'COLLISION' in upper or upper.startswith('SOCKET'):
            return False
        return o.data.uv_layers.active is not None

    meshes = [o for o in bpy.data.objects if bakeable(o)]
    if not meshes:
        return None, 'no uv-mapped meshes'
    baked_any = False
    for obj in meshes:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes:
                continue
            # Cycles bakes into the ACTIVE image node of each material, so give every material one
            # pointing at the shared AO image, and remove it again afterwards.
            node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = ao_img
            node.name = 'SF_AO_TARGET'
            mat.node_tree.nodes.active = node
        baked_any = True

    if not baked_any:
        return None, 'no bakeable materials'

    for obj in bpy.data.objects:
        obj.select_set(obj in meshes)
    bpy.context.view_layer.objects.active = meshes[0]

    try:
        bpy.ops.object.bake(type='AO')
    except Exception as exc:                            # noqa: BLE001 - report, don't crash the run
        return None, 'bake failed: %s' % exc
    finally:
        for mat in bpy.data.materials:
            if not mat.use_nodes or not mat.node_tree:
                continue
            dead = [n for n in mat.node_tree.nodes if n.name == 'SF_AO_TARGET']
            for n in dead:
                mat.node_tree.nodes.remove(n)

    return ao_img, None


def main():
    args = argv_after_ddash()
    if not args:
        print('usage: -- <job.json>')
        return
    with open(args[0], 'r', encoding='utf-8') as fh:
        job = json.load(fh)

    src = job['input']
    dst = job['output']
    ao_strength = float(job.get('aoStrength', 0.55))        # how much AO darkens occlusion
    rough_from_ao = float(job.get('roughnessFromAo', 0.30))  # cavities read rougher
    bake_size = int(job.get('bakeSize', 1024))
    samples = int(job.get('samples', 24))

    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    orm_names = roughness_images_from_graph()
    report = {'input': src, 'output': dst, 'ormImages': sorted(orm_names), 'images': []}

    ao_img, err = bake_ao(bake_size, samples)
    report['bakeError'] = err
    if ao_img is None:
        report['ok'] = False
        print('[aobake] ' + json.dumps(report))
        with open(dst + '.report.json', 'w', encoding='utf-8') as fh:
            json.dump(report, fh, indent=2)
        return

    ao_px = list(ao_img.pixels)
    ao_w, ao_h = ao_img.size

    for img in list(bpy.data.images):
        if img.name == 'SF_AO_BAKE' or not image_ready(img):
            continue
        low = img.name.lower()
        is_normal = 'normal' in low or low.endswith('_nrm') or '_nrm_' in low
        if is_normal or img.name not in orm_names:
            continue

        w, h = img.size
        n = w * h
        px = list(img.pixels)
        occ_before = channel_stdev(px, n, 0)
        rough_before = channel_stdev(px, n, 1)

        for j in range(h):
            # Nearest-sample the AO bake; ORM and AO share the asset's UV layout.
            aj = min(ao_h - 1, int(j * ao_h / h))
            for i in range(w):
                ai = min(ao_w - 1, int(i * ao_w / w))
                ao = ao_px[(aj * ao_w + ai) * 4]          # AO bakes greyscale; red is the value
                idx = (j * w + i) * 4
                shade = 1.0 - ao_strength * (1.0 - ao)     # 1 in the open, darker in recesses
                px[idx] = max(0.0, min(1.0, px[idx] * shade))
                px[idx + 1] = max(0.0, min(1.0, px[idx + 1] + rough_from_ao * (1.0 - ao)))
        img.pixels[:] = px

        report['images'].append({
            'image': img.name,
            'occlusionStdev': [round(occ_before, 4), round(channel_stdev(px, n, 0), 4)],
            'roughnessStdev': [round(rough_before, 4), round(channel_stdev(px, n, 1), 4)],
        })

    bpy.data.images.remove(ao_img)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=dst, export_format='GLB',
        export_materials='EXPORT', export_image_format='AUTO',
        export_extras=True, export_yup=True, use_selection=False,
    )
    report['ok'] = os.path.exists(dst) and len(report['images']) > 0
    report['wroteNoMaps'] = len(report['images']) == 0
    report['bytes'] = os.path.getsize(dst) if os.path.exists(dst) else 0
    print('[aobake] ' + json.dumps(report))
    with open(dst + '.report.json', 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=2)


main()
