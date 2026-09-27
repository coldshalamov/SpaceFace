"""Forge export: contract GLBs for forged hulls.

Two runtime layouts exist (see assets/ships/AGENTS.md):
  player  three files <file>.glb / <file>_lod1.glb / <file>_lod2.glb, each `<ROOT>_LOD{n}_ROOT` with
          LOD0_* mesh names (the file decides the tier)
  npc     one file holding LOD0_* / LOD1_* / LOD2_* meshes under one root

Every LOD carries the same sockets, a COLLISION_HULL, a drive-core hook, glTF scene extras
`spacefaceAsset` identity, and materials named Material_* with forge extras.
"""
import json
import math
import os
import struct

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
PREVIEW_DIR = os.path.join(ROOT, 'assets', 'ships', 'forge', 'preview')
WHOLESHIP_DIR = os.path.join(ROOT, 'assets', 'ships', 'parts', 'wholeships')

# finish -> exported material name. Names keep the fleet's Material_* vocabulary so manifests,
# routing tests and name-based fallbacks all read them; extras carry the authoritative role.
MATERIAL_NAMES = {
    'paint': 'Material_Hull', 'paint2': 'Material_Armor', 'stripe': 'Material_Accent',
    'gunmetal': 'Material_Mechanical', 'dark': 'Material_MechanicalDark', 'bare': 'Material_BrushedMetal',
    'ceramic': 'Material_Ceramic', 'hazard': 'Material_Warning', 'glass': 'Material_Canopy',
    'glow_drive': 'Material_Thruster', 'glow_cyan': 'Material_Emissive_Cyan', 'glow_red': 'Material_Emissive_NavRed',
    'glow_green': 'Material_Emissive_NavGreen', 'glow_warm': 'Material_Emissive_Warm',
    'glow_amber': 'Material_Emissive_Amber',
}
MESH_NAMES = {
    'paint': 'Hull', 'paint2': 'Armor', 'stripe': 'Livery', 'gunmetal': 'Mechanical', 'dark': 'MechanicalDark',
    'bare': 'BrushedMetal', 'ceramic': 'Ceramic', 'hazard': 'Warning', 'glass': 'CANOPY',
    'glow_drive': 'HOOK_DRIVE_CORE', 'glow_cyan': 'Lights_Cyan', 'glow_red': 'HOOK_NAV_PORT',
    'glow_green': 'HOOK_NAV_STARBOARD', 'glow_warm': 'Lights_Warm', 'glow_amber': 'Beacon_Amber',
}
LOD_RATIOS = {1: 0.40, 2: 0.18}

SOCKET_ROLES = {
    'SOCKET_Weapon_Front': ('weapon', (1, 0, 0)), 'SOCKET_Mining_Front': ('mining', (1, 0, 0)),
    'SOCKET_Engine_Main': ('engine', (-1, 0, 0)), 'SOCKET_Trail_Main': ('vfx', (-1, 0, 0)),
    'SOCKET_Trail_Port': ('vfx', (-1, 0, 0)), 'SOCKET_Trail_Starboard': ('vfx', (-1, 0, 0)),
    'SOCKET_Utility_Dorsal': ('utility', (0, 1, 0)), 'SOCKET_Cargo_Ventral': ('cargo', (0, -1, 0)),
    'SOCKET_Camera_Focus': ('camera', (1, 0, 0)), 'SOCKET_RCS_Port': ('vfx', (0, 0, -1)),
    'SOCKET_RCS_Starboard': ('vfx', (0, 0, 1)), 'SOCKET_Tether_Massline': ('attachment', (-1, 0, 0)),
}


def _select_only(objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def _duplicate(objs):
    out = []
    for o in objs:
        d = o.copy()
        d.data = o.data.copy()
        bpy.context.scene.collection.objects.link(d)
        out.append(d)
    return out


def ship_bounds(ship):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in ship.objects:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    return lo, hi


def default_sockets(ship):
    """Sockets from bounds, overridden by any the ship file declared. Blender coords, +Y = port."""
    lo, hi = ship_bounds(ship)
    cz = (lo.z + hi.z) * 0.5
    nose, tail = hi.x, lo.x
    width = hi.y
    drive = ship.hooks.get('HOOK_DRIVE_CORE', (tail, 0.0, cz))
    s = {
        'SOCKET_Weapon_Front': (nose - 0.4, 0.0, cz), 'SOCKET_Mining_Front': (nose - 0.5, 0.0, cz - 0.15),
        'SOCKET_Engine_Main': (drive[0] + 0.2, 0.0, drive[2]), 'SOCKET_Trail_Main': (tail - 0.1, 0.0, drive[2]),
        'SOCKET_Trail_Port': (tail - 0.1, width * 0.25, drive[2]), 'SOCKET_Trail_Starboard': (tail - 0.1, -width * 0.25, drive[2]),
        'SOCKET_Utility_Dorsal': ((nose + tail) * 0.5, 0.0, hi.z - 0.05), 'SOCKET_Cargo_Ventral': ((nose + tail) * 0.5, 0.0, lo.z + 0.05),
        'SOCKET_Camera_Focus': ((nose + tail) * 0.5 + (nose - tail) * 0.08, 0.0, cz), 'SOCKET_RCS_Port': ((nose + tail) * 0.5, width * 0.6, cz),
        'SOCKET_RCS_Starboard': ((nose + tail) * 0.5, -width * 0.6, cz), 'SOCKET_Tether_Massline': (tail + (nose - tail) * 0.28, 0.0, hi.z * 0.5),
    }
    for name, (pos, _fwd) in ship.sockets.items():
        s[name] = pos
    return s


def _gltf_dir(blender_dir):
    x, y, z = blender_dir
    return [x, z, -y]


def _root_empty(name, extras):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    for k, v in extras.items():
        e[k] = v
    return e


def _collision_hull(ship, prefix_parent, sources=None):
    bm = bmesh.new()
    k = float(getattr(ship, 'collision_scale', 1.0))
    for o in (sources or ship.objects):
        for v in o.data.vertices:
            bm.verts.new((o.matrix_world @ v.co) * k)
    res = bmesh.ops.convex_hull(bm, input=bm.verts)
    for v in [g for g in res['geom_interior'] if isinstance(g, bmesh.types.BMVert)]:
        bm.verts.remove(v)
    unused = [v for v in bm.verts if not v.link_faces]
    for v in unused:
        bm.verts.remove(v)
    # keep it light: collapse to at most ~300 faces
    me = bpy.data.meshes.new('COLLISION_HULL')
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new('COLLISION_HULL', me)
    bpy.context.scene.collection.objects.link(obj)
    if len(me.polygons) > 300:
        mod = obj.modifiers.new('d', 'DECIMATE')
        mod.ratio = 300 / len(me.polygons)
        _select_only([obj])
        bpy.ops.object.modifier_apply(modifier='d')
    obj['collision'] = True
    obj['nonRender'] = True
    obj.hide_render = True
    obj.parent = prefix_parent
    return obj


def _lod_meshes(ship, level, prefix):
    objs = [o for o in ship.objects if not (level >= 2 and o.get('forge_detail', 0) >= 1)]
    objs = [o for o in objs if not (level >= 1 and o.get('forge_detail', 0) >= 2)]
    # Hooked parts (damage roles: HOOK_SECONDARY_*, HOOK_SENSOR_*, HOOK_ARMOR_*) stay separate
    # meshes so the runtime can bind, shed or flicker them.
    hooked = {}
    for o in objs:
        if o.get('forge_hook'):
            hooked.setdefault(o['forge_hook'], []).append(o)
    objs = [o for o in objs if not o.get('forge_hook')]
    named = []
    for hook, parts in hooked.items():
        named += _join_named(parts, level, f'{prefix}_{hook}')
    return named + _join_named(objs, level, prefix)


def _join_named(objs, level, prefix):
    if not objs:
        return []
    dups = _duplicate(objs)
    _select_only(dups)
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    if level > 0:
        mod = body.modifiers.new('ForgeLod', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = LOD_RATIOS[level]
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='ForgeLod')
    _select_only([body])
    bpy.ops.mesh.separate(type='MATERIAL')
    parts = list(bpy.context.selected_objects)
    named = []
    for p in parts:
        mat = p.data.materials[0] if p.data.materials else None
        # drop unused material slots so each primitive carries exactly one material
        used = {poly.material_index for poly in p.data.polygons}
        if not p.data.polygons:
            bpy.data.objects.remove(p)
            continue
        finish = mat.get('forgeKey', mat.get('forgeFinish', 'part')) if mat else 'part'
        if len(used) == 1:
            keep = p.data.materials[list(used)[0]]
            p.data.materials.clear()
            p.data.materials.append(keep)
            finish = keep.get('forgeKey', keep.get('forgeFinish', finish))
        label = MESH_NAMES.get(finish.split('.')[0], finish.split('.')[0])
        if '.' in finish:
            label = f"{label}_{finish.split('.', 1)[1]}"
        name = f'{prefix}_{label}'
        if 'HOOK_' in prefix and label.startswith('HOOK_'):
            name = f'{prefix}_{finish.replace(".", "_")}'
        for key in [k for k in p.keys() if k.startswith('forge_')]:
            del p[key]
        p.name = name
        p.data.name = name
        if finish.split('.')[0] == 'glow_drive':
            # origin at the cores' centroid so the runtime pulse scales in place
            _select_only([p])
            bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='MEDIAN')
            p['spaceface'] = {'drive': 'core'}
        named.append(p)
    return named


def _rename_materials(ship):
    for finish, mat in ship._mats.items():
        base = finish.split('.')[0]
        mat.name = MATERIAL_NAMES.get(base, f'Material_{base}')
        if finish != base:
            mat.name = f'{MATERIAL_NAMES.get(base, base)}_{finish.split(".", 1)[1]}'


def _add_sockets(ship, parent):
    only = getattr(ship, 'socket_names', None)
    for name, pos in default_sockets(ship).items():
        if only and name not in only:
            continue
        role, fwd = SOCKET_ROLES.get(name, ('attachment', (1, 0, 0)))
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.location = pos
        e['socket'] = True
        e['spaceface'] = {'socket': True, 'role': role, 'forward': list(fwd)}
        e.parent = parent


def _export(objs, path):
    _select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_apply=True,
        export_yup=True, export_tangents=True, export_normals=True, export_texcoords=True,
        export_materials='EXPORT', export_animations=False, export_image_format='AUTO',
    )


def patch_glb_json(path, mutate):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, _length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB'
    jlen, jtype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    rest = data[20 + jlen:]
    mutate(doc)
    raw = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    raw += b' ' * ((4 - len(raw) % 4) % 4)
    out = struct.pack('<III', magic, version, 12 + 8 + len(raw) + len(rest)) + struct.pack('<II', len(raw), jtype) + raw + rest
    with open(path, 'wb') as f:
        f.write(out)
    return doc


def _stamp(path, identity, lod_label):
    def mutate(doc):
        factor_only = sorted(m['name'] for m in doc.get('materials', [])
                             if (m.get('extras') or {}).get('forgeFinish', '').startswith(('glass', 'glow')))
        # opaque paint is single-sided; the forge builds closed volumes
        for m in doc.get('materials', []):
            if not (m.get('extras') or {}).get('forgeFinish', '').startswith('glass'):
                m.pop('doubleSided', None)
        meta = {
            'contractVersion': 2, 'slot': 'hull', 'category': 'wholeships',
            'forward': '+X', 'up': '+Y', 'starboard': '+Z', 'unit': 'metre',
            'normalConvention': 'OpenGL', 'ormChannels': 'R=AO,G=Roughness,B=Metallic',
            'textureCompression': 'PNG-source', 'factorOnlyMaterials': factor_only,
            'lod': lod_label,
            **identity,
            # forge truth last: a copied live identity must never mask these
            'textureCompression': 'PNG-source', 'factorOnlyMaterials': factor_only,
            'spacefaceRemasterGeometry': True, 'surfaceGeometryRemaster': 'forge-v1',
            'identitySource': 'tools/blender/forge', 'integratedHardpoints': True,
        }
        scene = doc['scenes'][doc.get('scene', 0)]
        scene.setdefault('extras', {})['spacefaceAsset'] = meta
        doc.setdefault('asset', {}).setdefault('extras', {})['spacefaceAsset'] = meta
    return patch_glb_json(path, mutate)


def _clear_export_objects(objs):
    names = []
    for o in objs:
        try:
            names.append(o.name)
        except ReferenceError:
            pass
    for name in dict.fromkeys(names):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)


PLACE_DIR = os.path.join(ROOT, 'assets', 'ships', 'parts', 'places')


def _read_glb_json(path):
    with open(path, 'rb') as f:
        data = f.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + jlen].decode('utf-8'))


def live_place_contract(file):
    """Sockets (world transform + extras), root name and identity of the live place GLB, so a forged
    place drops into the exact gameplay contract the old one held."""
    from mathutils import Matrix, Quaternion
    doc = _read_glb_json(os.path.join(PLACE_DIR, f'{file}.glb'))
    nodes = doc.get('nodes', [])
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i

    def local(n):
        t = Matrix.Translation(n.get('translation', [0, 0, 0]))
        q = n.get('rotation', [0, 0, 0, 1])
        r = Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4()
        sc = n.get('scale', [1, 1, 1])
        sm = Matrix.Diagonal((sc[0], sc[1], sc[2], 1.0))
        return Matrix(n['matrix']).transposed() if 'matrix' in n else t @ r @ sm

    def world(i):
        m = local(nodes[i])
        while i in parent:
            i = parent[i]
            m = local(nodes[i]) @ m
        return m
    conv = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # glTF -> Blender
    sockets = []
    for i, n in enumerate(nodes):
        if str(n.get('name', '')).startswith('SOCKET_'):
            sockets.append((n['name'], conv @ world(i) @ conv.inverted(), n.get('extras', {})))
    scene = doc['scenes'][doc.get('scene', 0)]
    roots = [nodes[i]['name'] for i in scene['nodes'] if 'ROOT' in str(nodes[i].get('name', '')).upper()]
    meta = (scene.get('extras') or {}).get('spacefaceAsset') or (doc.get('asset', {}).get('extras') or {}).get('spacefaceAsset') or {}
    return {'sockets': sockets, 'root': roots[0] if roots else None, 'meta': meta}


def export_place(ship, spec, preview=False):
    out_dir = PREVIEW_DIR if preview else PLACE_DIR
    os.makedirs(out_dir, exist_ok=True)
    # A brand-new place (no live body yet) carries its own sockets (s.socket / s.socket_names).
    new_place = not os.path.exists(os.path.join(PLACE_DIR, f"{spec['file']}.glb")) or spec.get('new_place')
    live = {'sockets': [], 'root': None, 'meta': {}} if new_place else live_place_contract(spec['file'])
    _rename_materials(ship)
    root = _root_empty(live['root'] or f"SF_{spec['file'].upper()}_ROOT", {})
    meshes_all = []
    for level in (0, 1, 2):
        meshes = _lod_meshes(ship, level, f'LOD{level}')
        for m in meshes:
            m.parent = root
        meshes_all += meshes
    _collision_hull(ship, root, [m for m in meshes_all if m.name.startswith('LOD0_')])
    for name, mat, extras in live['sockets']:
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.matrix_world = mat
        for k, v in (extras or {}).items():
            e[k] = v
        e.parent = root
    if new_place:
        _add_sockets(ship, root)
    path = os.path.join(out_dir, f"{spec['file']}.glb")
    _export([root] + list(root.children), path)
    # Identity only: descriptive fields of the old body (triangle counts, material lists, texture
    # notes) would be false for the forged one.
    keep = ('contractVersion', 'assetId', 'partId', 'liveId', 'category', 'family', 'role')
    identity = {k: live['meta'][k] for k in keep if k in live['meta']}
    if new_place:
        identity.update({'contractVersion': 2, 'liveId': spec['file'], 'category': 'places'})
    identity.update({'assetId': spec['asset_id'], 'partId': spec.get('part_id', spec['file']), 'slot': 'place',
                     'category': 'places',
                     'forge': {'version': 1, 'ship': ship.id}})
    _stamp(path, identity, 'lod0')
    tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes_all if m.name.startswith('LOD0_'))
    print(f'[forge] {path} place lod0 tris={tris} sockets={len(live["sockets"]) or "own"}')
    return [(path, tris)]


def export_ship(ship, spec, out_dir=None, preview=False):
    """spec: dict(layout='player'|'npc', file=<basename>, asset_id, part_id, root=<ROOT token>,
    npc_root=<full root node name>)."""
    if spec['layout'] == 'place':
        return export_place(ship, spec, preview=preview)
    out_dir = out_dir or (PREVIEW_DIR if preview else WHOLESHIP_DIR)
    os.makedirs(out_dir, exist_ok=True)
    _rename_materials(ship)
    for o in ship.objects:
        o.hide_set(False)
    written = []
    identity = {'assetId': spec['asset_id'], 'partId': spec.get('part_id', f"wholeship_{spec['file']}"),
                'forge': {'version': 1, 'ship': ship.id}}
    if spec['layout'] == 'player':
        for level in (0, 1, 2):
            root = _root_empty(f"{spec['root']}_LOD{level}_ROOT", {})
            prefix = f'LOD{level}' if spec.get('lod_prefix') == 'per_file' else 'LOD0'
            meshes = _lod_meshes(ship, level, prefix)
            for m in meshes:
                m.parent = root
            coll = _collision_hull(ship, root, meshes)
            _add_sockets(ship, root)
            suffix = '' if level == 0 else f'_lod{level}'
            path = os.path.join(out_dir, f"{spec['file']}{suffix}.glb")
            export_objs = [root] + list(root.children)
            _export(export_objs, path)
            wiring = spec.get('wiring')
            _stamp(path, {**identity, **({'wiringStatus': wiring[level]} if wiring else {})}, f'lod{level}')
            tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
            print(f'[forge] {path} lod{level} tris={tris} meshes={len(meshes)}')
            written.append((path, tris))
            _clear_export_objects(export_objs + [coll])
    else:
        root = _root_empty(spec['npc_root'], {})
        all_meshes = []
        for level in (0, 1, 2):
            meshes = _lod_meshes(ship, level, f'LOD{level}')
            for m in meshes:
                m.parent = root
            all_meshes += meshes
        _collision_hull(ship, root)
        _add_sockets(ship, root)
        path = os.path.join(out_dir, f"{spec['file']}.glb")
        _export([root] + list(root.children), path)
        _stamp(path, identity, 'lod0')
        tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in all_meshes if m.name.startswith('LOD0_'))
        print(f'[forge] {path} npc lod0 tris={tris}')
        written.append((path, tris))
    return written


def fleet_spec(ship_id):
    with open(os.path.join(HERE, 'fleet.json')) as f:
        return json.load(f)['ships'][ship_id]


def preview_export(ship, spec=None):
    spec = spec or {'layout': 'player', 'file': ship.id, 'asset_id': f'SF_FORGE_{ship.id.upper()}', 'root': ship.id.upper()}
    return export_ship(ship, spec, preview=True)
