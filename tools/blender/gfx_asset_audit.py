# Headless Blender audit of shipped visual assets.
#
# Driven by scripts/gfx-asset-audit.mjs. Runs as:
#   blender --background --python tools/blender/gfx_asset_audit.py -- <manifest.json> <out.json>
#
# For each GLB it reports the facts that decide whether an asset is a RENDERING problem, not whether
# it is pretty. Three of these were discovered by hand and are the reason this exists:
#
#   * lodTags        - place_asteroid_rock_a ships tagged LOD0/1/2 sibling meshes; the Kestrel ships
#                      none (whole-ships use separate _lod1/_lod2 files instead). An asset with
#                      neither is stuck at full detail forever.
#   * roughnessStdev - material-to-material differentiation can be excellent while WITHIN-material
#                      roughness is nearly constant (measured ~0.06 on a 0-1 range across the
#                      Kestrel's ORMs). Uniform roughness gives a uniform specular response, which
#                      is why well-authored materials still read as plastic. This is the single most
#                      diagnostic number in the file.
#   * primitiveNamedObjects - OBJECTS still called Cube.125 / Icosphere. This is the meaningful
#                      naming signal. It is reported separately from primitiveNamedMeshData, which
#                      is cosmetic: the Kestrel's objects are properly semantic
#                      (LOD0_static_ArmorDark) while its mesh-DATA blocks still read Cube.009.
#                      Neither is the G1 "recognizable primitive origins" defect on its own — that
#                      one is about SHAPE and needs a look, not a name match.
#
# Read-only: imports into a scratch scene, never writes an asset, never saves.
import bpy
import json
import os
import sys
import re

PRIMITIVE_RE = re.compile(
    r'^(Cube|Cylinder|Sphere|Torus|Plane|Cone|Circle|Icosphere|Grid|Suzanne)(\.\d+)?$',
    re.IGNORECASE,
)


def argv_after_ddash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def tri_count(ob):
    if ob.type != 'MESH':
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in ob.data.polygons)


def image_ready(img):
    """True when an image has decodable pixels.

    `img.has_data` is FALSE for packed GLB textures under `--background` until something touches
    their pixels, so gating on it silently reports every asset as having zero textures. Force the
    decode by reading one pixel, then trust `size`.
    """
    try:
        if img.packed_file is None and not img.filepath:
            return False
        _ = img.pixels[0]
        return img.size[0] > 0 and img.size[1] > 0
    except Exception:
        return False


def channel_stats(img, channel, budget=1024):
    """Sparse deterministic sample of one channel. Returns mean/stdev or None."""
    try:
        w, h = img.size
        n = w * h
        if n == 0:
            return None
        px = img.pixels
        step = max(1, n // budget)
        vals = [px[i * 4 + channel] for i in range(0, n, step)]
        if not vals:
            return None
        mean = sum(vals) / len(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        return {'mean': round(mean, 4), 'stdev': round(var ** 0.5, 4),
                'min': round(min(vals), 4), 'max': round(max(vals), 4)}
    except Exception:
        return None


def audit_one(path):
    bpy.ops.wm.read_homefile(use_empty=True)
    entry = {'file': path, 'ok': False}
    try:
        bpy.ops.import_scene.gltf(filepath=path)
    except Exception as exc:
        entry['error'] = '%s: %s' % (type(exc).__name__, exc)
        return entry

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    total = 0
    lod_tris = {}
    primitive_named = []
    primitive_meshdata = []
    collision = 0
    sockets = 0

    for o in bpy.data.objects:
        if o.type == 'MESH':
            t = tri_count(o)
            total += t
            lod = o.get('spaceface.lod')
            if lod is None:
                # whole-ships tag LOD by node-name prefix instead of a custom property
                m = re.match(r'^LOD(\d)', o.name)
                lod = ('lod%s' % m.group(1)) if m else 'untagged'
            lod_tris[str(lod)] = lod_tris.get(str(lod), 0) + t
            # OBJECT names are the meaningful signal. The Kestrel's objects are properly semantic
            # (LOD0_static_ArmorDark, LOD0_static_Emissive_DriveCore) while its MESH-DATA blocks
            # still read Cube.009 / Cylinder.043 / Torus.013. Mesh-data names are cosmetic — they
            # only record that a modeller started from a primitive, which is ordinary hard-surface
            # practice — so they are counted SEPARATELY and must not be reported as the G1
            # "recognizable primitive origins" defect, which is about SHAPE.
            if PRIMITIVE_RE.match(o.name):
                primitive_named.append(o.name)
            if o.data is not None and PRIMITIVE_RE.match(o.data.name):
                primitive_meshdata.append(o.data.name)
        if o.get('sf_collision') or 'COLLISION' in o.name.upper():
            collision += 1
        if o.get('spaceface.socket') or o.name.upper().startswith('SOCKET'):
            sockets += 1

    # Material + ORM survey. roughnessStdev is the headline number.
    #
    # Identify the roughness map from the MATERIAL GRAPH, not the image name. Name-matching produced
    # two opposite failures: it counted normal maps as ORMs ("n-ORM-al" contains "orm"), and it MISSED
    # roughness maps named for their role rather than their packing — `engine_ion_small_wear_mask_1k`
    # is a real ORM whose measured stdev is 0.2011, but the name heuristic skipped it and the asset
    # was reported as stdev 0, i.e. flat, when it is the opposite of flat. glTF feeds the packed ORM
    # into Principled BSDF's Roughness/Metallic inputs, so the graph is the authority; the name test
    # is kept only as a fallback for images the graph does not reach.
    graph_orms = set()
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
                for _ in range(4):                 # glTF inserts Separate Color between tex and input
                    if walk.type == 'TEX_IMAGE':
                        if walk.image:
                            graph_orms.add(walk.image.name)
                        break
                    linked = [i for i in walk.inputs if i.is_linked]
                    if not linked:
                        break
                    walk = linked[0].links[0].from_node

    orms = []
    for img in bpy.data.images:
        low = img.name.lower()
        if not image_ready(img):
            continue
        is_normal = 'normal' in low or low.endswith('_nrm') or '_nrm_' in low
        by_name = (low.endswith('_orm') or '_orm_' in low or low.endswith('orm')
                   or 'roughness' in low or 'metallic' in low)
        if not is_normal and (img.name in graph_orms or by_name):
            g = channel_stats(img, 1)
            b = channel_stats(img, 2)
            orms.append({'image': img.name, 'size': list(img.size),
                         'roughness': g, 'metalness': b,
                         'source': 'graph' if img.name in graph_orms else 'name'})

    rough_stdevs = [o['roughness']['stdev'] for o in orms
                    if o.get('roughness') and o['roughness'].get('stdev') is not None]

    tex_sizes = sorted({tuple(i.size) for i in bpy.data.images if image_ready(i)})

    entry.update({
        'ok': True,
        'meshes': len(meshes),
        'totalTris': total,
        'trisByLod': lod_tris,
        'lodLevels': sorted([k for k in lod_tris if k.startswith('lod')]),
        'hasLod': any(k.startswith('lod') and k != 'lod0' for k in lod_tris),
        'materials': len(bpy.data.materials),
        'ormMaps': len(orms),
        'roughnessStdevMin': round(min(rough_stdevs), 4) if rough_stdevs else None,
        'roughnessStdevMax': round(max(rough_stdevs), 4) if rough_stdevs else None,
        'orms': orms[:8],
        'primitiveNamedObjects': len(primitive_named),
        'primitiveNames': primitive_named[:8],
        # cosmetic only — see the note at the detection site
        'primitiveNamedMeshData': len(primitive_meshdata),
        'collisionNodes': collision,
        'socketNodes': sockets,
        'textureSizes': [list(s) for s in tex_sizes][:6],
    })
    return entry


def main():
    args = argv_after_ddash()
    if len(args) < 2:
        print('usage: -- <targets.json> <out.json>')
        return
    targets_path, out_path = args[0], args[1]
    with open(targets_path, 'r', encoding='utf-8') as fh:
        targets = json.load(fh)

    results = []
    for i, path in enumerate(targets):
        if not os.path.exists(path):
            results.append({'file': path, 'ok': False, 'error': 'missing'})
            continue
        print('[audit] %d/%d %s' % (i + 1, len(targets), os.path.basename(path)))
        results.append(audit_one(path))

    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump({'schema': 'spaceface.gfxAssetAudit.v1', 'assets': results}, fh, indent=2)
    print('[audit] wrote %s (%d assets)' % (out_path, len(results)))


main()
