"""Three source tiers, explicit collision assemblies and finite rigid motion bindings.

Shared exporter for original authored SF20 hulls. Forge owns surfaces and LODs;
the calling recipe owns geometry, identity, supported views and physical parts.
"""
import hashlib
import json
from pathlib import Path
import bpy
from mathutils import Vector
import forge_export as E


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def coords(point):
    return [round(float(point[0]), 6), round(float(point[2]), 6), round(float(-point[1]), 6)]


def bounds(points):
    points = [Vector(point) for point in points]
    low = [min(coords(p)[i] for p in points) for i in range(3)]
    high = [max(coords(p)[i] for p in points) for i in range(3)]
    return {'minGltf': low, 'maxGltf': high,
            'sizeMetres': [round(high[i] - low[i], 6) for i in range(3)],
            'maxRootDistanceMetres': round(max(p.length for p in points), 6)}


def export_family(ship, out, *, family, asset_id, recipe, components, pivots,
                  groups, preflight, negative_space=()):
    out.mkdir(parents=True, exist_ok=True)
    E._rename_materials(ship)
    root = E._root_empty(asset_id + '_ROOT', {})
    E._mount_motion_pivots(ship, root)
    collision = []
    for name, parts in components.items():
        collider = E._collision_hull(ship, root, parts)
        collider.name = 'COLLISION_' + family.upper() + '_' + name.upper()
        collider.data.name = collider.name
        collider['sourceAssembly'] = name
        collision.append({'id': name, 'node': collider.name, 'kind': 'convex',
                          'sourceObjects': [ob.name for ob in parts],
                          'verticesGltf': [coords(v.co) for v in collider.data.vertices],
                          'triangles': [list(f.vertices) for f in collider.data.polygons],
                          'bounds': bounds([v.co for v in collider.data.vertices])})
    E._add_sockets(ship, root)
    tiers, paths, near_doc = {}, [], None
    for lod in (0, 1, 2):
        tier = E._lod_meshes(ship, lod, 'LOD' + str(lod))
        for ob in tier:
            if ob.parent is None:
                ob.parent = root
        path = out / (family + ('' if lod == 0 else '_lod' + str(lod)) + '.glb')
        E._export([root] + list(root.children_recursive), str(path))
        E._stamp(str(path), {'assetId': asset_id, 'partId': family.replace('_', '-'),
                 'liveId': family, 'slot': 'pod' if asset_id.startswith('SF_PROP_') else 'hull', 'category': 'wholeships',
                 'forge': {'version': 1, 'ship': family}}, 'lod' + str(lod))

        def annotate(doc):
            for owner in [doc['asset'], *doc['nodes'], doc['scenes'][doc.get('scene', 0)]]:
                meta = owner.get('extras', {}).get('spacefaceAsset')
                if meta:
                    meta['integratedHardpoints'] = False
                    meta['npcOnly'] = True
            for node in doc['nodes']:
                if node.get('name', '').startswith('MOTION_'):
                    extras = node.setdefault('extras', {})
                    extras['spacefaceSocket'] = True
                    extras.setdefault('spaceface', {})['instance'] = False
            doc['asset']['extras']['conceptGeometry'] = {
                'schema': 'spaceface.conceptSourceGeometry.v1', 'renderScale': 1,
                'collision': 'source-aligned-convex-assemblies',
                'negativeSpace': list(negative_space), 'recipeSha256': digest(recipe)}

        doc = E.patch_glb_json(str(path), annotate)
        if lod == 0:
            near_doc = doc
        primitives = [p for node in doc['nodes']
                      if node.get('name', '').startswith('LOD' + str(lod) + '_') and 'mesh' in node
                      for p in doc['meshes'][node['mesh']]['primitives']]
        tiers[str(lod)] = {'file': path.name, 'sha256': digest(path), 'bytes': path.stat().st_size,
                          'triangles': sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives),
                          'drawPrimitives': len(primitives), 'materials': len(doc.get('materials', [])),
                          'sharedImages': len(doc.get('images', []))}
        paths.append(path)
        E._clear_export_objects(tier)
    bank = {'schema': 'spaceface.rigidMotionBank.v1', 'rigId': family + '_controls',
            'sourceAssetId': asset_id, 'sourceGlbSha256': digest(paths[0]), 'fps': 60,
            'bindings': [], 'clips': [{'name': 'source_rest_pose', 'durationS': 1 / 60,
                                      'loop': False, 'endMode': 'hold', 'channels': []}]}
    for name, pivot in pivots.items():
        node = next(n for n in near_doc['nodes'] if n.get('name') == pivot.name)
        bank['bindings'].append({'id': name, 'node': pivot.name, 'parent': None,
                    'requiredAtLod': [0, 1, 2], 'restPose': {
                        'translation': node.get('translation', [0, 0, 0]),
                        'rotation': node.get('rotation', [0, 0, 0, 1]),
                        'scale': node.get('scale', [1, 1, 1])}})
        bank['clips'][0]['channels'].append({'group': name, 'path': 'translation',
            'times': [0, 1 / 60], 'values': [0, 0, 0, 0, 0, 0], 'interpolation': 'linear'})
    if pivots:
        (out / (family.replace('_', '-') + '.motion.json')).write_text(
            json.dumps(bank, indent=2) + '\n', encoding='utf-8')
    for name, parts in groups.items():
        for ob in parts:
            world = ob.matrix_world.copy()
            ob.parent = pivots[name]
            ob.matrix_world = world
    for ob in ship.objects:
        if ob.parent is None:
            ob.parent = root
    bpy.context.view_layer.update()
    contract = {'schema': 'spaceface.conceptSourceGeometry.v1', 'assetId': asset_id,
                'renderScale': 1, 'recipeSha256': digest(recipe), 'lods': tiers,
                'bounds': bounds([ob.matrix_world @ v.co for ob in ship.objects for v in ob.data.vertices]),
                'physicalBounds': bounds([ob.matrix_world @ v.co for parts in components.values()
                                         for ob in parts for v in ob.data.vertices]),
                'collision': {'kind': 'compound', 'components': collision,
                              'negativeSpace': list(negative_space)},
                'groups': {name: {'node': p.name, 'pivotGltf': coords(p.matrix_world.translation)}
                           for name, p in pivots.items()},
                'sockets': {name: {'positionGltf': coords(pos), 'forwardGltf': coords(forward)}
                            for name, (pos, forward) in ship.sockets.items()},
                'preflight': preflight,
                'provenance': 'Original SpaceFace Forge source; no external geometry/media'}
    (out / 'measured-contract.json').write_text(json.dumps(contract, indent=2) + '\n', encoding='utf-8')
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(out / (family + '.blend')))
    return paths, contract
