"""Ceres breaker: open gantry, captured shoes.

Original Forge workfleet geometry. All dimensions, collision solids, articulation
pivots and sockets are read from the simulation-owned ceresWorkfleet contract.
Design coordinates are runtime WU; Blender uses X,-Z,Y / sourceScale. The load
well has no cosmetic infill, and export never creates a convex collision hull.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys

import bpy
import bmesh
from mathutils import Vector

HERE = Path(__file__).resolve().parent
FORGE = HERE.parent
ROOT = FORGE.parents[2]
sys.path.insert(0, str(FORGE))
import forge as F
import forge_export as E

COLORS = {'paint': '#756b50', 'paint2': '#343d3e', 'hazard': '#b47729',
          'dark': '#182027', 'gunmetal': '#465354', 'bare': '#85928c',
          'glass': '#182a30', 'glow_warm': '#e1b375', 'glow_amber': '#dc9936',
          'glow_drive': '#69b9d5', 'glow_red': '#d8422b', 'glow_green': '#47b78c'}
FILES = {'breaker': 'ceres_breaker', 'cradle': 'place_ceres_section_cradle',
         'cutterHead': 'place_ceres_breaker_cutter_head'}


def load_contract():
    js = "import {CERES_WORKFLEET_CONTRACT as c} from './src/data/ceresWorkfleet.js';console.log(JSON.stringify(c))"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js], cwd=ROOT, text=True))


def pos(p, scale=2):
    return (p[0] / scale, -p[2] / scale, p[1] / scale)


def size(p, scale=2):
    return (p[0] / scale, p[2] / scale, p[1] / scale)


def box(s, name, p, d, mat='paint2', bevel=.3):
    return F.box(s, name, pos(p), size(d), material=mat, bevel=bevel / 2, uv_scale=.4)


def boxes(s, name, rows, mat='gunmetal', bevel=0):
    return F.boxes(s, name, [(pos(p), size(d)) for p, d in rows], material=mat, bevel=bevel / 2, uv_scale=.4)


def beams(s, name, rows, width=1.5, mat='gunmetal', bevel=.1):
    return F.beams(s, name, [(pos(a), pos(b)) for a, b in rows], width / 2,
                   material=mat, bevel=bevel / 2, uv_scale=.4)


def cyl(s, name, a, b, radius, mat='gunmetal', segments=20, bevel=.12, cap=True):
    return F.cylinder(s, name, pos(a), pos(b), radius / 2, material=mat,
                      segments=segments, bevel=bevel / 2, cap=cap, uv_scale=.4)


def plate(s, name, outline, y, thick, mat='paint', chamfer=.6):
    outline = [(x / 2, -z / 2) for x, z in reversed(outline)]
    return F.plate(s, name, outline, y / 2, thick / 2, material=mat,
                   chamfer=chamfer / 2, chamfer_bottom=chamfer / 3, bevel=.1, uv_scale=.4)


def lamp(s, name, p, mat='glow_warm', r=.6):
    # Camera-facing lens is seated on a matte bezel, not a floating light plane.
    x, y, z = p
    cyl(s, name + 'Bezel', (x, y-.4, z), (x, y+.1, z), r*1.35, 'dark', 16, .04)
    cyl(s, name + 'Lens', (x, y+.1, z), (x, y+.18, z), r, mat, 16, 0)


def channel(s, name):
    return next(c for c in s.workfleet_asset['propulsion']['channels'] if c['id'] == name)


def _protect_core(s, c, obj):
    s.hook_part(c['coreHook'], obj)
    obj['forge_protect_nozzle'] = True
    obj['ceres_channel'] = c['id']
    return obj


def nozzle(s, channel_id, segments=20):
    """Rotate the actual -X Forge bell before placement; its axis hint is unused.

    Only the core gets a runtime hook. The two matte finishes still batch with
    the hull. Keep these tiny, authored functional surfaces at all LODs instead
    of allowing a generic decimator to seal or turn a mouth.
    """
    c = channel(s, channel_id)
    obj = F.nozzle(s, 'Nozzle_' + c['id'], (0, 0, 0), c['lipRadiusWU']/2/1.12,
                   c['depthWU']/2, material='gunmetal', bell=1.12, segments=segments)
    rotation = Vector((-1, 0, 0)).rotation_difference(Vector(pos(vector(c['exhaustDirection']), 1)))
    center = Vector(pos(vector(c['mouth'])))
    for v in obj.data.vertices:
        v.co = rotation @ v.co + center
    core = obj.copy()
    core.data = obj.data.copy()
    core.name = 'Core_' + c['id']
    bpy.context.scene.collection.objects.link(core)
    s.objects.append(core)
    # Detach by material, preserving winding and exactly the authored core disc.
    for part, keep_core in [(obj, False), (core, True)]:
        bm = bmesh.new()
        bm.from_mesh(part.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if (f.material_index == 2) != keep_core], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(part.data)
        bm.free()
        part['forge_protect_nozzle'] = True
        part['ceres_channel'] = c['id']
    _protect_core(s, c, core)
    return obj, core


def bore(s, channel_id, targets):
    """Open the host skin all the way to the rear of the seated bell.

    This is visible manufactured geometry, not an enlarged collision proxy.
    Bore only existing host castings; neighbouring channels and rig solids are
    not affected. The bell's rear cap stays seated against the uncut back wall.
    """
    c = channel(s, channel_id)
    mouth = Vector(vector(c['mouth']))
    exhaust = Vector(vector(c['exhaustDirection']))
    cutter = F.Ship('bore_only', COLORS)
    tool = cyl(cutter, 'TemporaryBore', mouth-exhaust*(c['depthWU']-.08),
               mouth+exhaust*.3, c['lipRadiusWU']*1.025, 'dark', 32, 0)
    for target in targets:
        # Apply the existing edge treatment before cutting so it cannot roll
        # back over the tiny opening during Ship.finish().
        if not target.get('ceres_pre_finished'):
            F.finish_object(target)
            target['ceres_pre_finished'] = True
            target['forge_bevel'] = 0
        E._select_only([target])
        mod = target.modifiers.new('SeatedExhaustRecess', 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.solver = 'EXACT'
        mod.object = tool
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)


def source_sha():
    h = hashlib.sha256()
    for name in FILES.values():
        h.update((HERE / (name + '.py')).read_bytes())
    return h.hexdigest()


def _save_source(s, out, part):
    keep = set(s.objects) | set(s.motion_pivots.values())
    for obj in list(bpy.context.scene.objects):
        if obj not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    # Source geometry really rides the rig in Blender; the exporter independently
    # preserves world transforms for its welded copies.
    for obj in s.objects:
        group = obj.get('forge_motion')
        if group:
            world = obj.matrix_world.copy()
            obj.parent = s.motion_pivots[group]
            obj.matrix_world = world
    for name, (p, fwd) in s.sockets.items():
        obj = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = p
        obj.empty_display_type = 'ARROWS'
        obj.empty_display_size = 1.2
    for mat in s._mats.values():
        node = mat.node_tree.nodes.get('Principled BSDF')
        if node:
            mat.diffuse_color = node.inputs['Base Color'].default_value
    bpy.context.scene['ceresWorkfleet'] = json.dumps(s.contract)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / (FILES[part] + '.blend')))


def render_review(s, out, part, suffix='empty'):
    """CPU geometry review, with editable source cameras and a restrained light rig."""
    scene = bpy.context.scene
    for obj in list(scene.objects):
        if obj.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('CeresWorkfleetReviewWorld')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055, .077, .1, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .5
    for name, rot, energy, color in [('Key', (.35,-.4,-.4), 2.5, (1,.88,.73)),
                                    ('Fill', (-.6,.9,2.2), 1.2, (.55,.73,1))]:
        data = bpy.data.lights.new(name, 'SUN')
        data.energy, data.angle, data.color = energy, .15, color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.rotation_euler = rot
    camera = bpy.data.objects.new('ReviewCamera', bpy.data.cameras.new('ReviewCamera'))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    span = max(s.contract['dimensionsWU']) / 2
    for view, offset in [('top', (.001,0,2.4)), ('chase', (1.05,-1.55,2.3)), ('side', (1.8,-2.1,.9))]:
        visible = [o.matrix_world @ v.co for o in scene.objects
                   if o.type == 'MESH' and not o.hide_render for v in o.data.vertices]
        lo = Vector([min(p[i] for p in visible) for i in range(3)])
        hi = Vector([max(p[i] for p in visible) for i in range(3)])
        target = (lo + hi) / 2
        camera.location = target + Vector([v*span for v in offset])
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
        inv = camera.rotation_euler.to_quaternion().inverted()
        framed = [inv @ (p-target) for p in visible]
        width = 2*max(abs(p.x) for p in framed)
        height = 2*max(abs(p.y) for p in framed)
        camera.data.ortho_scale = max(width, height*scene.render.resolution_x/scene.render.resolution_y)*1.12
        scene.render.filepath = str(out / (part + '-' + suffix + '-' + view + '.png'))
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / (FILES.get(part, part) + '-' + suffix + '-review.blend')))


def _keeper_low_lod(s, level):
    """Keep the exact fixed/contact planes without close-zoom bevel tessellation.

    These are deliberately authored low tiers of the same hardware: a single
    chamfer segment at LOD1 and planar castings at LOD2. No decimator can move a
    keeper face or bridge the cable channel. The same three finishes remain one
    all-or-none, unpooled visibility group.
    """
    tier = F.Ship(s.id + '_keeper_lod' + str(level), COLORS)
    tier._mats = s._mats
    for tag in ('Port', 'Starboard'):
        keeper = _solid(s.workfleet_asset, 'depth_keeper_' + tag.lower())
        x, y, z = vector(keeper['center'])
        dx, dy, dz = vector(keeper['size'])
        name = 'ReceiverKeeperLod' + str(level) + tag
        rail = box(tier, name, (x,y,z+.2), (dx,dy,dz-.4), 'paint2', 0)
        F.band(tier, name, pos((x,y,z)), (0,1,0), 3.5/2,
               'hazard', facing=(0,0,1))
        cap = box(tier, name+'Face', (x,y,z-dz/2+.2),
                  (dx-.6,dy-1,.4), 'bare', 0)
        for obj, width in ((rail, .4/2), (cap, .08/2)):
            if level == 1:
                mod = obj.modifiers.new('SingleKeeperChamfer', 'BEVEL')
                mod.width = width
                mod.segments = 1
                mod.limit_method = 'ANGLE'
                mod.angle_limit = math.radians(32)
                mod.harden_normals = True
                mod.use_clamp_overlap = True
            F.finish_object(obj)
            obj['spaceface'] = {'instance': False}
    meshes = E._join_named(tier.objects, 0,
                           'LOD'+str(level)+'_HOOK_CERES_DEPTH_KEEPER')
    for obj in tier.objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return meshes


def _lod_with_contact_faces(s, level):
    # Contact caps and nozzle lips are small functional surfaces: preserve their
    # exact planes at every tier, then weld matte surfaces back by finish.
    critical = [o for o in s.objects if o.get('forge_protect_contact') or o.get('forge_protect_nozzle')]
    original = s.objects
    try:
        s.objects = [o for o in original if o not in critical]
        tier = E._lod_meshes(s, level, 'LOD'+str(level))
    finally:
        s.objects = original
    plain = [o for o in critical if not o.get('forge_hook')]
    for cap in E._join_named(plain, 0, 'LOD'+str(level)):
        target = next((o for o in tier if o.name == cap.name.split('.')[0]), None)
        if target:
            name = target.name
            E._select_only([target, cap])
            bpy.ops.object.join()
            target.name = name
        else:
            cap.name = cap.name.split('.')[0]
            tier.append(cap)
    # A preserved static visibility group may contain several fixed parts.
    # Weld equal hook names by finish; unique thruster hooks remain independent.
    for hook in dict.fromkeys(o['forge_hook'] for o in critical if o.get('forge_hook')):
        if hook == 'HOOK_CERES_DEPTH_KEEPER' and level:
            tier.extend(_keeper_low_lod(s, level))
        else:
            parts=[o for o in critical if o.get('forge_hook') == hook]
            tier.extend(E._join_named(parts, 0, 'LOD'+str(level)+'_'+hook))
    if level:
        # Quadric collapse can move a boundary vertex beyond the original skin.
        # Trim that reduced geometry to the authored outer planes, never enlarge
        # the native compound. Interior voids/contact planes are independently
        # proven from exported triangles; they are not filled or projected here.
        ends = [pos(vector(s.workfleet_asset['bounds'][edge])) for edge in ('min', 'max')]
        low = Vector([min(p[i] for p in ends) for i in range(3)])
        high = Vector([max(p[i] for p in ends) for i in range(3)])
        for obj in tier:
            inverse = obj.matrix_world.inverted()
            for vertex in obj.data.vertices:
                world = obj.matrix_world @ vertex.co
                constrained = Vector([min(high[i], max(low[i], world[i])) for i in range(3)])
                if (constrained-world).length_squared > 1e-16:
                    vertex.co = inverse @ constrained
            obj.data.update()
    return tier


def export_asset(s, out, part, report_dir=None):
    """Forge's batched LOD pipeline plus simulation-authored compound solids."""
    out.mkdir(parents=True, exist_ok=True)
    E._rename_materials(s)
    root = E._root_empty('SF_' + FILES[part].upper() + '_ROOT', {})
    meshes = []
    for level in (0, 1, 2):
        tier = _lod_with_contact_faces(s, level)
        for obj in tier:
            if obj.parent is None:
                obj.parent = root
        meshes.extend(tier)
    E._mount_motion_pivots(s, root)
    E._add_sockets(s, root)
    # These explicit mesh boxes carry the same bounds as runtime's compound.
    # No convex envelope is emitted, including at far LOD.
    proxy_ship = F.Ship(s.id + '_proxies', COLORS)
    proxy_ship._mats['dark'] = s.mat('dark')
    for solid in s.contract['collision']['boxes']:
        obj = box(proxy_ship, 'COLLISION_' + solid['name'], solid['centerWU'], solid['sizeWU'], 'dark', 0)
        obj.parent = root
        obj['collision'] = True
        obj['nonRender'] = True
        obj['spaceface'] = {'collision': True, 'shape': 'box', 'compoundMember': solid['name']}
        obj.hide_render = True
    filename = out / (FILES[part] + '.glb')
    E._export([root] + list(root.children_recursive), str(filename))
    identity = s.contract['asset']
    E._stamp(str(filename), {'assetId': identity['assetId'], 'partId': identity['partId'],
             'liveId': FILES[part], 'slot': 'hull' if part == 'breaker' else 'place',
             'category': 'wholeships' if part == 'breaker' else 'places',
             'forge': {'version': 1, 'ship': s.id}}, 'lod0')
    def stamp(doc):
        doc['asset'].setdefault('extras', {})['ceresWorkfleet'] = s.contract
        doc['scenes'][doc.get('scene', 0)].setdefault('extras', {})['ceresWorkfleet'] = s.contract
        for node in doc['nodes']:
            name = node.get('name', '')
            if name == 'SF_' + FILES[part].upper() + '_ROOT':
                node.setdefault('extras', {})['ceresWorkfleet'] = s.contract
            if 'HOOK_CERES_DEPTH_KEEPER' in name:
                # Per-instance hardware revisions must never enter pooled
                # opaque batches, even though these parts have no actuation.
                node.setdefault('extras', {}).setdefault('spaceface', {})['instance'] = False
            if name in s.sockets:
                node['extras']['spaceface']['forward'] = E._gltf_dir(s.sockets[name][1])
            for c in s.contract['propulsion'].get('channels', []):
                if name == c['socket'] or name in c['coreMeshes']:
                    node.setdefault('extras', {})['ceresThruster'] = {
                        'channel': c['id'], 'mouthWU': vector(c['mouth']),
                        'exhaustNormal': vector(c['exhaustDirection']),
                        'socketNormal': vector(c['exhaustDirection']),
                        'supportingSolid': c['supportingSolid'], 'coreHook': c['coreHook']}
                    if name == c['socket']:
                        node['extras']['spaceface']['role'] = 'vfx'
    doc = E.patch_glb_json(str(filename), stamp)
    counts, draws = {}, {}
    for level in (0, 1, 2):
        primitives = [p for node in doc['nodes'] if node.get('name', '').startswith('LOD'+str(level)+'_')
                      and 'mesh' in node for p in doc['meshes'][node['mesh']]['primitives']]
        counts[str(level)] = sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives)
        draws[str(level)] = len(primitives)
    report = {'file': str(filename), 'contract': s.contract, 'trianglesByLod': counts,
              'drawsByLod': draws, 'materialCount': len(doc.get('materials', [])),
              'fileBytes': filename.stat().st_size,
              'proxyCount': len(s.contract['collision']['boxes'])}
    ((report_dir or out) / (part + '-source-report.json')).write_text(json.dumps(report, indent=2) + '\n')
    print('[ceres-workfleet] ' + json.dumps({k: v for k, v in report.items() if k != 'contract'}), flush=True)
    return filename


def vector(p):
    return [p[a] for a in ('x', 'y', 'z')]


def new_ship(part, reset=True):
    if reset:
        F.reset_scene()
    contract = load_contract()
    asset = contract['assets'][part]
    s = F.Ship(asset['id'], COLORS)
    s.socket_names = []
    for name, p in asset['sockets'].items():
        # All explicit gameplay sockets have a canonical forward basis.
        s.socket(name, pos(vector(p)), pos(vector(asset['socketDirections'][name]), 1))
        s.socket_names.append(name)
    solid_rows = asset.get('states', {}).get('open', {}).get('boxes', asset.get('boxes', []))
    s.contract = {
        'schema': contract['schema'], 'part': part, 'sourceScale': contract['sourceScale'],
        'asset': {key: asset[key] for key in ('id', 'assetId', 'partId', 'file')},
        'dimensionsWU': vector(asset['dimensions']),
        'boundsWU': [vector(asset['bounds']['min']), vector(asset['bounds']['max'])],
        'sourceOrigin': contract['coordinates']['origin'], 'axes': contract['coordinates'],
        'socketsWU': {name: vector(p) for name, p in asset['sockets'].items()},
        'socketDirections': asset['socketDirections'],
        'propulsion': asset.get('propulsion', {}),
        'strictClearVolumes': asset.get('clearVolumes', {}),
        'collision': {'kind': 'bounded-box-compound', 'neverUseConvexHull': True,
                      'runtimeAuthority': 'ceresWorkfleetCollision', 'boxes': [
                          {'name': b['id'], 'centerWU': vector(b['center']), 'sizeWU': vector(b['size'])}
                          for b in solid_rows]},
        'states': asset.get('states', {}), 'motion': asset['motion'], 'rigs': [],
        'drawBudget': {'breaker': 44, 'cradle': 34, 'cutterHead': 14}[part],
        'clearVolumesWU': ([{'name': 'full-travelling-LongPlate', 'centerWU': [27, 0, 0],
                             'sizeWU': [110, 10, 68]}] if part == 'breaker' else
                           [{'name': 'full-retained-LongPlate', 'centerWU': [0, 0, 0],
                             'sizeWU': [68, 10, 110]}] if part == 'cradle' else []),
    }
    s.workfleet_asset = asset
    return s


def group(s, rig_id, pivot, start_index, axis=None, end_delta=0, end_scale=1, collision_name=None):
    s.motion_group(rig_id, pos(pivot), s.objects[start_index:])
    s.contract['rigs'].append({'node': 'MOTION_' + rig_id.upper(), 'pivotWU': list(pivot),
                              'runtimeAxis': axis, 'retainedDeltaWU': end_delta,
                              'retainedScale': end_scale, 'collisionBoxName': collision_name})


def main(part=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--part', choices=list(FILES))
    parser.add_argument('--out', type=Path, default=ROOT / '.devshots/ceres-workfleet')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--composition', action='store_true')
    parser.add_argument('--live', action='store_true', help='Standard Forge publish: export this entry point only')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    args.out.mkdir(parents=True, exist_ok=True)
    if args.composition:
        render_receiver_admission(args.out)
        return
    builders = {'breaker': build, 'cradle': build_cradle, 'cutterHead': build_cutter_head}
    for key in ([part or args.part] if part or args.part else ['breaker'] if args.live else list(FILES)):
        s = builders[key]().finish()
        s.contract['sourceSha256'] = source_sha()
        s.contract['geometryContractSha256'] = hashlib.sha256((ROOT / 'src/data/ceresWorkfleet.js').read_bytes()).hexdigest()
        lo, hi = E.ship_bounds(s)
        s.contract['actualBoundsBlender'] = [list(lo), list(hi)]
        destination = ROOT / 'assets/ships/parts' / ('wholeships' if key == 'breaker' else 'places') if args.live else args.out
        glb = export_asset(s, destination, key, report_dir=args.out)
        if s.motion_groups:
            bank_destination = ROOT / 'assets/ships/motions' if args.live else args.out
            bank_destination.mkdir(parents=True, exist_ok=True)
            bake_reference_bank(s, glb, bank_destination, key)
        _save_source(s, args.out, key)
        if args.render:
            render_review(s, args.out, key)
            render_loaded_review(s, args.out, key)


def render_loaded_review(s, out, part):
    """Review the actual travelling section, never a convenient smaller stand-in."""
    if part not in ('breaker', 'cradle'):
        return
    import ceres_second_measure_kit as K
    from mathutils import Matrix
    section = K.section('long_plate', reset=False).finish()
    local = s.workfleet_asset.get('loadPose', {'x': 0, 'z': 0, 'rot': 0})
    transform = Matrix.Translation(pos((local['x'], 0, local['z']))) @ Matrix.Rotation(-local['rot'], 4, 'Z')
    for obj in section.objects:
        obj.matrix_world = transform @ obj.matrix_world
    for rig in s.contract['rigs']:
        obj = s.motion_pivots[rig['node'].removeprefix('MOTION_').lower()]
        axis = {'x': 0, 'y': 2, 'z': 1}[rig['runtimeAxis']]
        delta = rig['retainedDeltaWU'] / 2 * (-1 if rig['runtimeAxis'] == 'z' else 1)
        obj.location[axis] += delta
        obj.scale[axis] = rig['retainedScale']
    bpy.context.view_layer.update()
    render_review(s, out, part, 'loaded-retained')


def _solid(asset, name):
    return next(b for b in asset['states']['open']['boxes'] if b['id'] == name)


def _beam_hull(s, name, rows, center_z, width, lower, upper):
    """Faceted pressure/drive cassette, never a generic stretched cube."""
    return F.loft(s, name, [dict(x=x/2, w=w*width/4, ht=upper/2,
                  hb=-lower/2, zc=0, n=3.8, y=-center_z/2) for x,w in rows],
                  material='paint', belly='paint2', back_material='dark', count=24,
                  bevel=.18, uv_scale=.4)


def build(reset=True):
    s = new_ship('breaker', reset)
    a = s.workfleet_asset
    xmin, xmax = a['bounds']['min']['x'], a['bounds']['max']['x']
    zmax = a['bounds']['max']['z']
    inner = a['well']['z'][1]
    # Two beefy aft drive cassettes carry two lattice bridle beams. Their open
    # side cells and high/low chords stay outside the entire payload envelope.
    for side, tag in [(-1, 'Port'), (1, 'Starboard')]:
        solid = _solid(a, 'drive_' + tag.lower())
        cx, cy, cz = vector(solid['center'])
        dx, dy, dz = vector(solid['size'])
        _beam_hull(s, 'DriveCassette'+tag,
                   [(xmin, .68), (xmin+5, 1), (-57, 1), (-48, .78)], cz, dz, -12, 12)
        F.band(s, 'DriveCassette'+tag, pos((-59,0,cz)), (1,0,0), 3.5/2,
               'hazard', facing=(0,0,1))
        box(s, 'DriveUpperRecess'+tag, (-73,12,cz), (18,.4,15), 'dark', .15)
        s.detail=1
        boxes(s, 'DriveLouvres'+tag, [((-80+i*2,12.5,cz),(1,1,13)) for i in range(8)], 'gunmetal', 0)
        s.detail=0
        # Bell mouths are recessed within -90, so the official aft envelope
        # includes every lip and thrust housing, not only the paint panels.
        for end in ('OUTER', 'INNER'):
            nozzle(s, 'MAIN_' + tag.upper() + '_' + end, 24)
        collar = box(s, 'DriveLipCollar'+tag, (-87,0,cz), (2,21,23), 'paint2', .6)
        for end in ('OUTER', 'INNER'):
            bore(s, 'MAIN_' + tag.upper() + '_' + end,
                 [collar, next(o for o in s.objects if o.name == 'DriveCassette'+tag)])
        # Hollow engineered beam; all four chords remain visible in silhouette.
        z0, z1 = side*(inner+1.5), side*(zmax-1.5)
        chords=[]
        for zz in (z0,z1):
            for yy in (-6.4,6.4):chords.append(((-48,yy,zz),(88,yy,zz)))
        beams(s, 'BridleChords'+tag, chords, 2.7, 'paint', .22)
        ribs=[];diagonals=[]
        xs=[-46,-24,-2,20,42,64,87]
        for x in xs:
            ribs.extend([((x,-6.1,z0),(x,6.1,z0)),((x,-6.1,z1),(x,6.1,z1)),
                         ((x,6.1,z0),(x,6.1,z1)),((x,-6.1,z0),(x,-6.1,z1))])
        for i in range(len(xs)-1):
            x0,x1=xs[i],xs[i+1]
            for zz in (z0,z1):
                diagonals.append(((x0,-5.5 if i%2 else 5.5,zz),(x1,5.5 if i%2 else -5.5,zz)))
        beams(s, 'OpenRibs'+tag, ribs, 1.8, 'paint2', .12)
        beams(s, 'BridleDiagonalWeb'+tag, diagonals, 1.4, 'gunmetal', 0)
        # Raked end fork has open nose, sacrificial impact castings, and a
        # visible load pin rather than an unexplained pointed spaceship wing.
        nose = box(s,'NoseCasting'+tag,(88,0,side*55),(4,16,14),'paint2',.7)
        box(s,'NoseWarningCap'+tag,(88,8,side*55),(3,.3,12),'hazard',.1)
        pin = cyl(s,'NoseLoadPin'+tag,(87,-6,side*55),(87,6,side*55),3,'bare',24,.12)
        bore(s, 'RETRO_' + tag.upper(), [nose, pin])
        nozzle(s, 'RETRO_' + tag.upper())
        # Outer-face RCS castings join the bridle rib and drive cassette; their
        # full recesses fit the existing bridle/drive collision solids.
        for x, end in [(64, 'BOW'), (-64, 'STERN')]:
            housing = box(s, 'RcsCasting'+end+tag, (x,0,side*60.4), (4.8,4.8,3.2), 'paint2', .25)
            hosts = [housing]
            hosts.extend(o for o in s.objects if o.name in (['BridleChords'+tag,'OpenRibs'+tag,'BridleDiagonalWeb'+tag]
                         if end == 'BOW' else ['DriveCassette'+tag]))
            bore(s, 'RCS_' + end + '_' + tag.upper(), hosts)
            nozzle(s, 'RCS_' + end + '_' + tag.upper(), 16)
        # The long inner track really carries the travelling shoe bearings.
        box(s,'BareSlideWay'+tag,(18,0,side*49),(132,3,2),'bare',.1)
        for xx in (-33,17,67):
            box(s,'BeamBand'+tag+str(xx),(xx,6.6,side*55),(5,2.6,13.7),'hazard',.3)
        s.detail=1
        boxes(s,'BeamPinHeads'+tag,[((x,7.7,side*zz),(1.2,.5,1.2))
                                    for x in xs for zz in (49.5,60.5)],'bare',0)
        boxes(s,'BeamSerialRungs'+tag,[((x,6.9,side*55),(.6,.6,9)) for x in (-41,-38,-35,-32)],'gunmetal',0)
        s.detail=0
        lamp(s,'NoseNav'+tag,(88,8.1,side*57),'glow_red' if side<0 else 'glow_green',.55)
        # End tip sockets are fixed working load roots, not detached animation.
        cyl(s,'BridleRootPin'+tag,(-32,-7,side*55),(-32,7,side*55),3.1,'bare',24,.18)

    # Compact stern power bridge: layered crossbeam with no central floor
    # extending into the operating well. A high offset operator cab looks into it.
    box(s,'SternSpine',(-83,0,0),(14,20,70),'paint2',1.5)
    box(s,'PowerBridge',(-65,-3,0),(26,18,70),'paint',1.9)
    box(s,'BridgeTopRecess',(-65,6.3,0),(22,1.4,61),'dark',.6)
    for zz in (-30,30):
        box(s,'BridgeShoulder'+str(zz),(-61,4 if zz==30 else 8,zz),(26,6 if zz==30 else 8,9),'paint2',1.2)
        F.band(s,'BridgeShoulder'+str(zz),pos((-61,0,zz)),(1,0,0),2,'hazard',facing=(0,0,1))
    # Offset cab occupies the starboard half; the port half exposes winch train.
    F.loft(s,'OperatorCab',[dict(x=x/2,w=w/2,ht=h/2,hb=2.2,zc=13/2,n=3.8,y=-17/2)
                          for x,w,h in [(-76,4,2),(-73,7,6),(-57,7,6),(-49,5,3)]],
           material='paint',belly='paint2',count=28,bevel=.22,uv_scale=.4)
    F.band(s,'OperatorCab',pos((-51,15,17)),(1,0,0),2,'glass',facing=(1,0,.2),min_facing=.2)
    box(s,'CabRoofBrow',(-61,19.7,17),(19,1.4,12.5),'paint2',.65)
    boxes(s,'CabWindows',[((-56+i*3,16.3,24.1),(1.8,1.8,.35)) for i in range(3)],'glow_warm',0)
    box(s,'CabBeaconMount',(-68,21,17),(4,1,4),'gunmetal',.3)
    lamp(s,'CabBeacon',(-68,21.6,17),'glow_amber',.7)
    # Three exposed winch drums seated in full-height cheek castings, their
    # fairlead nose terminates at x=-44 and preserves the strict open mouth.
    for zz in (-22,-11,0):
        cyl(s,'WinchDrum'+str(zz),(-65,8,zz-3),(-65,8,zz+3),3.5,'dark',16,.1)
        for end in (-1,1):
            cyl(s,'WinchFlange'+str(zz)+str(end),(-65,8,zz+end*3),(-65,8,zz+end*3.6),4.3,'hazard',16,.1)
        box(s,'WinchBearing'+str(zz),(-65,7,zz),(12,3,8),'gunmetal',.4)
    # A passive forked end stop arrests a slack-line load at X=-28. Two
    # solid bumper rails contact the real 18-WU plate web; their central8-WU
    # cable channel keeps the aft fairlead physically exposed. The conservative
    # native box is too narrow for any serviced body to enter that channel.
    stop = _solid(a, 'load_stop')
    sx, sy, sz = vector(stop['center'])
    dx, dy, dz = vector(stop['size'])
    for side in (-1, 1):
        rail_z = side*(dz/2-3)
        box(s,'PassiveStopRail'+str(side),(sx,0,rail_z),(dx,dy,6),'paint2',.55)
        cap = box(s,'PassiveStopCap'+str(side),(sx+dx/2-.2,0,rail_z),(.4,dy-1,5.4),'bare',.08)
        cap['forge_protect_contact'] = True
        box(s,'PassiveStopBand'+str(side),(sx+1,dy/2,rail_z),(5,.1,5),'hazard',.03)
    box(s,'StopRootCrossTie',(sx-dx/2+1,0,0),(2,8,dz),'gunmetal',.2)
    box(s,'TetherFairleadBase',(-49,0,0),(6,11,13),'paint2',.8)
    cyl(s,'TetherFairleadRoll',(-46,0,-4),(-46,0,4),2,'bare',24,.1)
    beams(s,'TetherLead',[((-65,10,0),(-47,1,0))],.8,'gunmetal',.1)
    # The cutter body remains independently authored; this is only its steel
    # docking collar and protected source-side electrical coupling.
    box(s,'CutterDockBackplate',(-49,0,30),(6,9,10),'hazard',.6)
    cyl(s,'CutterDockCollar',(-49,0,30),(-46,0,30),3.1,'gunmetal',20,.1)
    # Deliberately readable cutter charging/docking station, completely inside
    # the fixed cab-crossmember plan footprint and outside the payload mouth.
    # Narrowing the offset cab reveals the cold-milling module's actual mount.
    plate(s,'CutterServiceDeck',[(-75,24),(-57,24),(-46.4,25.5),(-46.4,34.6),(-70,34.6),(-75,31)],
          7.3,1.6,'hazard',.7)
    box(s,'CutterPowerWell',(-66,9.0,29.5),(12,1,7.8),'dark',.4)
    for xx in (-70,-66,-62):
        cyl(s,'CutterInductionCoil'+str(xx),(xx,9.4,26.6),(xx,9.4,32.4),1.1,'gunmetal',16,0)
    for z in (25.8,33.6):
        plate(s,'DockLoadCheek'+str(z),[(-60,z-1.0),(-49,z-1.0),(-46.5,z),(-49,z+1.0),(-60,z+1.0)],
              -3.7,10.8,'paint2',.35)
        box(s,'DockBareJaw'+str(z),(-48.2,2,z),(2.2,5,1.6),'bare',.18)
    beams(s,'RootedCutterPowerLines',[((-70,7,29),(-70,3,30)),((-70,3,30),(-50,3,30))],.8,'bare',0)
    s.detail=1
    beams(s,'BridgeConduit',[((-83,8,-31),(-83,8,31)),((-83,8,-25),(-70,8,-25))],1,'bare',.08)
    boxes(s,'BridgeCoolingFins',[((-71+i*1.8,8.2,-32),(1,3,4)) for i in range(8)],'gunmetal',0)
    # Seat service fasteners into the recessed bridge lid instead of leaving
    # their old Y=9 row floating above its Y=7 face.
    boxes(s,'ServiceFasteners',[((x,7.1,z),(.8,.6,.8)) for x in (-75,-55) for z in (-26,-14,-2)],'bare',0)
    s.detail=0
    lamp(s,'PortWorkFlood',(-49,12,-30),'glow_warm',.85)
    lamp(s,'StarboardWorkFlood',(-49,12,30),'glow_warm',.85)
    s.hook('HOOK_DRIVE_CORE',pos((-89.7,0,0)))

    # Each captured shoe is a rigid set of five replaceable grip cartridges.
    # Its chrome rod has a fixed-root pivot so scale changes extension only.
    for slide in a['motion']['shoes']:
        side=-1 if slide['open']<0 else 1
        tag='Port' if side<0 else 'Starboard'
        z=slide['open'];start=len(s.objects)
        shoe = _solid(a, 'shoe_'+str(side))
        cx, length = shoe['center']['x'], shoe['size']['x']
        box(s,'ShoeSpine'+tag,(cx,0,z),(length,8,7),'paint2',.5)
        box(s,'ShoeUpperTrack'+tag,(cx,4.5,z),(length-2,1,8),'hazard',.22)
        for x in (-17,5,27,49,73):
            box(s,'GripCartridge'+tag+str(x),(x,0,z-side*4),(20,6,2),'bare',.32)
            box(s,'GripBacking'+tag+str(x),(x,1,z-side*2.7),(21,5,1.2),'dark',.12)
        for x in (-20,74):
            cyl(s,'ShoeBearing'+tag+str(x),(x,-4,z),(x,4,z),3.5,'gunmetal',12,.15)
            cyl(s,'ShoePin'+tag+str(x),(x,3.8,z),(x,5,z),1.1,'bare',10,.1)
        group(s,slide['id'],(27,0,z),start,'z',slide['retained']-z,collision_name='shoe_'+str(side))
        root=a['motion']['rams']['roots'][0 if side<0 else 1]
        open_end=z+side*5;retained_end=slide['retained']+side*5
        for i,x in enumerate(a['motion']['rams']['longitudinalPositions']):
            cyl(s,'ShoeRamCase'+tag+str(i),(x,0,root+side*4),(x,0,root),2.2,'paint2',12,.18)
            cyl(s,'ShoeRamSeal'+tag+str(i),(x,0,root+side*.5),(x,0,root-side*.5),1.9,'hazard',12,.1)
            start=len(s.objects)
            cyl(s,'ShoeRamRod'+tag+str(i),(x,0,root),(x,0,open_end),1.4,'bare',20,0)
            group(s,'shoe_ram_'+tag.lower()+'_'+str(i),(x,0,root),start,'z',0,
                  abs((retained_end-root)/(open_end-root)),collision_name='shoe_ram_'+str(side)+'_'+str(x))
    return s


def build_cradle(reset=True):
    s = new_ship('cradle', reset)
    a=s.workfleet_asset
    rail_inner=a['well']['x'][1]
    rail_outer=a['bounds']['max']['x']
    front=a['well']['z'][0]
    # The guaranteed open depth excludes the new keeper. Structural rail ends
    # still join the unchanged rear spine, rather than shrinking with the void.
    spine=_solid(a, 'rear_spine')
    rear=spine['center']['z']-spine['size']['z']/2
    # An open sectional receiving U, not a storage slab: long raised lattice
    # rails, diagonals, captive retention cartridges and a geared rear bridge.
    for side,tag in [(-1,'Port'),(1,'Starboard')]:
        x=side*(rail_inner+rail_outer)/2
        ix=side*(rail_inner+1.3);ox=side*(rail_outer-1.3)
        chords=[]
        for xx in (ix,ox):
            for y in (-8.4,12):chords.append(((xx,y,front+2),(xx,y,rear)))
        beams(s,'CradleChords'+tag,chords,2.6,'paint',.22)
        ribs=[];diagonals=[];zzs=[-72,-49,-26,-3,20,43,63]
        for z in zzs:
            ribs.extend([((ix,-8,z),(ix,12,z)),((ox,-8,z),(ox,12,z)),
                         ((ix,12,z),(ox,12,z)),((ix,-8,z),(ox,-8,z))])
        for i in range(len(zzs)-1):
            for xx in (ix,ox):
                diagonals.append(((xx,-7 if i%2 else 11,zzs[i]),(xx,11 if i%2 else -7,zzs[i+1])))
        beams(s,'CradleRibs'+tag,ribs,2,'paint2',.12)
        beams(s,'CradleDiagonalWeb'+tag,diagonals,1.7,'gunmetal',0)
        for z in (-69,-1,59):
            box(s,'RailSaddle'+tag+str(z),(x,13,z),(14.5,4,10),'paint2',.7)
            F.band(s,'RailSaddle'+tag+str(z),pos((0,0,z)),(0,1,0),2.3,'hazard',facing=(0,0,1))
        box(s,'MouthCasting'+tag,(x,2,front+3),(15,24,6),'paint2',1.0)
        box(s,'MouthWarningCap'+tag,(x,14.5,front+3),(13,.6,5),'hazard',.15)
        box(s,'InnerBareWay'+tag,(side*(rail_inner+1.2),0,-6),(2,3,138),'bare',.1)
        # Sparse walking grating lies on each rail, never across the aperture.
        s.detail=1
        boxes(s,'WalkwayCrossTies'+tag,[((x,13.8,z),(10,.7,.7)) for z in range(-62,58,6)],'gunmetal',0)
        boxes(s,'RailPinHeads'+tag,[((xx,13.2,z),(1,.5,1)) for xx in (ix,ox) for z in zzs],'bare',0)
        s.detail=0
        lamp(s,'MouthGuide'+tag,(x,15,front+3),'glow_amber',.75)
        # Four raised datum towers make the loading direction visible at chase.
        for z in (-49,43):
            box(s,'DatumFoot'+tag+str(z),(x,15,z),(8,4,8),'paint2',.7)
            box(s,'DatumHead'+tag+str(z),(x,18.3,z),(7,2,6),'hazard',.5)
            lamp(s,'DatumLens'+tag+str(z),(x,19.4,z),'glow_warm',.75)

    box(s,'ReceiverSpine',(0,0,70),(170,17,10),'paint2',1)
    box(s,'ReceiverUpperSill',(0,10.5,70),(166,5,9),'paint',.75)
    boxes(s,'BridgeServiceLids',[((x,13.2,70),(18,1,7)) for x in (-60,-30,0,30,60)],'hazard',0)
    s.detail=1
    boxes(s,'BridgeBolts',[((x,13.8,z),(.75,.4,.75)) for x in range(-78,79,6) for z in (67,73)],'bare',0)
    s.detail=0
    # Two fixed, spine-attached keeper rails arrest a slack-line section at
    # Z56.5. The native solids own the full manufactured envelope; visible
    # replaceable bare caps meet that exact contact plane at every LOD. Their
    # central 8-WU channel leaves the unchanged Z63 cable exit unobstructed.
    for side, tag in [(-1, 'Port'), (1, 'Starboard')]:
        keeper=_solid(a, 'depth_keeper_'+tag.lower())
        x,y,z=vector(keeper['center'])
        dx,dy,dz=vector(keeper['size'])
        # Seat the replaceable face against the casting, never coplanar over
        # its front skin. Forge cuts the warning band into the upper surface.
        rail=box(s,'ReceiverDepthKeeper'+tag,(x,y,z+.2),(dx,dy,dz-.4),'paint2',.4)
        F.band(s,'ReceiverDepthKeeper'+tag,pos((x,y,z)),(0,1,0),3.5/2,
               'hazard',facing=(0,0,1))
        rail['forge_protect_contact']=True
        cap=box(s,'ReceiverDepthKeeperFace'+tag,(x,y,z-dz/2+.2),
                (dx-.6,dy-1,.4),'bare',.08)
        cap['forge_protect_contact']=True
        # Legacy occupied cradles can hide the whole fixed hardware revision
        # without a new asset identity, moving pivot, or independent actuator.
        s.hook_part('HOOK_CERES_DEPTH_KEEPER',rail,cap)
        rail['spaceface']={'instance':False}
        cap['spaceface']={'instance':False}
    # Real receiving winch/fairlead remains behind the structural plane Z65;
    # only the two approved keeper rails project into the receiving aperture.
    cyl(s,'ReceiverWinch',(-6,2,70),(6,2,70),3.8,'dark',24,.1)
    for side in (-1,1):
        cyl(s,'ReceiverWinchCheek'+str(side),(side*6,2,70),(side*7.4,2,70),4.8,'hazard',24,.15)
    cyl(s,'ReceiverFairlead',(-5,0,67),(5,0,67),2,'bare',24,.1)
    box(s,'ReceiverControl',(54,10,70),(14,6,8),'paint',.8)
    lamp(s,'ReceiverStatus',(54,13.4,70),'glow_green',.6)

    for slide in a['motion']['pads']:
        side=-1 if slide['open']<0 else 1
        tag='Port' if side<0 else 'Starboard';x=slide['open'];start=len(s.objects)
        box(s,'RetentionSpine'+tag,(x,0,0),(7,8,108),'paint2',.6)
        box(s,'RetentionCrown'+tag,(x,4.5,0),(8,1,106),'hazard',.25)
        for z in (-45,-23,0,23,45):
            box(s,'ReceiverGrip'+tag+str(z),(x-side*4,0,z),(2,6,17),'bare',.35)
            box(s,'ReceiverGripBacking'+tag+str(z),(x-side*2.7,1,z),(1.2,5,18),'dark',.12)
        for z in a['motion']['rams']['longitudinalPositions']:
            cyl(s,'PadLoadPin'+tag+str(z),(x,-4,z),(x,5,z),2.8,'gunmetal',16,0)
        group(s,slide['id'],(x,0,0),start,'x',slide['retained']-x,collision_name='retention_'+str(side))
        root=a['motion']['rams']['roots'][0 if side<0 else 1]
        open_end=x+side*5;retained_end=slide['retained']+side*5
        for i,z in enumerate(a['motion']['rams']['longitudinalPositions']):
            # Cylinders are inside the rail, with a flush port at its outer
            # anchor. The piston crosses the open cell only while closing.
            cyl(s,'ReceiverRamCase'+tag+str(i),(root,0,z),(root-side*3,0,z),2.2,'paint2',20,.12)
            start=len(s.objects)
            cyl(s,'ReceiverRamRod'+tag+str(i),(root,0,z),(open_end,0,z),1.4,'bare',20,0)
            group(s,'retention_ram_'+tag.lower()+'_'+str(i),(root,0,z),start,'x',0,
                  abs((retained_end-root)/(open_end-root)),collision_name='retention_ram_'+str(side)+'_'+str(z))
    return s


def build_cutter_head(reset=True):
    s = new_ship('cutterHead', reset)
    a = s.workfleet_asset
    # A detachable cold-milling cartridge: twin ceramic electrodes, gimballed
    # projection throat, finite electric drive and reversible service jets.
    F.loft(s,'CutterMotor',[dict(x=x/2,w=w/2,ht=h/2,hb=h/2,zc=0,n=3.7)
                          for x,w,h in [(-8,3,2.8),(-6.7,4.5,3.8),(1.8,4.5,3.8),(4,3.3,2.9)]],
           material='paint',belly='paint2',back_material='dark',count=24,bevel=.12,uv_scale=.65)
    F.band(s,'CutterMotor',pos((-2,0,0)),(1,0,0),.85,'hazard',facing=(0,0,1))
    box(s,'TopInset',(-3,3.75,0),(5,.35,5),'dark',.15)
    boxes(s,'MotorFins',[((-5+i*.7,3.96,0),(.28,.08,4.3)) for i in range(7)],'gunmetal',0)
    # Open central mouth; the front socket is a focus4WU ahead of the physical
    # emitter, not an invisible third blade or an invented solid cutter wall.
    for side,tag in [(-1,'Port'),(1,'Starboard')]:
        plate(s,'ElectrodeShoulder'+tag,[(2.7,side*2),(6.8,side*2.1),(8,side*3.2),
              (7.5,side*5.8),(3.7,side*6),(2.7,side*4.2)],-2.3,4.6,'paint2',.35)
        box(s,'CeramicBlade'+tag,(6.35,0,side*3.1),(3.3,3.5,1.8),'bare',.35)
        box(s,'ElectrodeCore'+tag,(7.4,0,side*2.13),(1.1,2.8,.24),'glow_amber',.05)
        cyl(s,'ToolPin'+tag,(4.4,-2.8,side*4.5),(4.4,2.8,side*4.5),.65,'bare',16,.05)
        # Reversible paired jet throats at the exact force application points.
        p=vector(a['propulsion']['thrustPoints'][0 if side<0 else 1])
        cyl(s,'JetManifold'+tag,(p[0]-.9,p[1],side*4),(p[0]+.9,p[1],side*4),1.8,'paint2',18,.1)
        for direction in (-1,1):
            x0=p[0]+direction*.35;x1=p[0]+direction*1.3
            rim = cyl(s,'JetRim'+tag+str(direction),(x0,0,side*4.6),(x1,0,side*4.6),1.05,'gunmetal',18,.07,cap=False)
            core = cyl(s,'JetCore'+tag+str(direction),(x1-direction*.08,0,side*4.6),(x1,0,side*4.6),.62,'glow_drive',16,0)
            c = channel(s, 'AXIAL_' + ('AFT_' if direction < 0 else 'FORE_') + tag.upper())
            rim['forge_protect_nozzle'] = True
            rim['ceres_channel'] = c['id']
            _protect_core(s, c, core)
        cheek = box(s, 'LateralServiceCheek'+tag, (0,0,side*5), (3.2,2.5,1.95), 'paint2', .2)
        bore(s, 'LATERAL_' + tag.upper(), [cheek, next(o for o in s.objects if o.name == 'CutterMotor')])
        nozzle(s, 'LATERAL_' + tag.upper(), 16)
    emitter=vector(a['cutFocus']['emitter'])
    cyl(s,'FocusThroat',(2.9,0,0),emitter,1.55,'dark',24,.08)
    cyl(s,'FocusLens',(3.85,0,0),emitter,1.05,'glow_amber',24,0)
    cyl(s,'MountDog',(-8,0,0),(-6.8,0,0),2.4,'gunmetal',24,.12)
    for z in (-1.7,1.7):box(s,'MountKey'+str(z),(-7.7,0,z),(.6,1.2,.65),'bare',.06)
    lamp(s,'ToolStatus',(-.5,3.5,0),'glow_warm',.28)
    s.detail=2
    boxes(s,'HeadFasteners',[((x,3.55,z),(.24,.3,.24)) for x in (-6,1) for z in (-2.8,2.8)],'bare',.03)
    s.detail=0
    return s


def render_receiver_admission(out):
    # Composition-only review uses the frozen native route's exact arrival pose.
    # This contains independent masses and is never exported as a product asset.
    from mathutils import Matrix
    import ceres_second_measure_kit as K
    c = load_contract()
    cradle = build_cradle().finish()
    breaker = build(reset=False).finish()
    head = build_cutter_head(reset=False).finish()
    load = K.section('long_plate', reset=False).finish()
    for ship in (cradle, breaker):
        for obj in ship.objects:
            if obj.get('forge_motion'):
                world = obj.matrix_world.copy()
                obj.parent = ship.motion_pivots[obj['forge_motion']]
                obj.matrix_world = world
    for rig in breaker.contract['rigs']:
        pivot = breaker.motion_pivots[rig['node'].removeprefix('MOTION_').lower()]
        axis = {'x': 0, 'y': 2, 'z': 1}[rig['runtimeAxis']]
        pivot.location[axis] += rig['retainedDeltaWU']/2*(-1 if rig['runtimeAxis']=='z' else 1)
        pivot.scale[axis] = rig['retainedScale']
    receiver = c['route']['receiverPose']
    carrier = c['route']['loadedLegs'][-1]['to']
    local = (carrier['x']-receiver['x'], 0, carrier['z']-receiver['z'])
    transform = Matrix.Translation(pos(local)) @ Matrix.Rotation(-carrier['rot'], 4, 'Z')
    parent = bpy.data.objects.new('REVIEW_ONLY_CARRIER_FRAME', None)
    bpy.context.scene.collection.objects.link(parent)
    for obj in breaker.objects + list(breaker.motion_pivots.values()):
        if obj.parent is None:
            obj.parent = parent
    parent.matrix_world = transform
    mounted = c['assets']['breaker']['headMountedPose']
    head_transform = transform @ Matrix.Translation(pos((mounted['x'],0,mounted['z'])))
    for obj in head.objects:
        obj.matrix_world = head_transform @ obj.matrix_world
    bpy.context.view_layer.update()
    review = F.Ship('receiver_admission_review', COLORS)
    review.contract = {'dimensionsWU': [210, 40, 230]}
    render_review(review, out, 'receiverAdmission', 'carrier-loaded-cradle-open')


def bake_reference_bank(s, glb, out, part):
    # The generic clip bank owns translation/rotation only; actual Ceres ram
    # scale and slide fractions are applied by native physics articulation.
    # Seal a genuine open-source reference pose, with no ambient/event trigger.
    sys.path.insert(0, str(FORGE / 'animations'))
    from motion_bank import MotionBank
    key = {'breaker': 'ceres-breaker', 'cradle': 'ceres-section-cradle'}[part]
    bank = MotionBank(s, key.replace('-', '_') + '_hydraulics', s.contract['asset']['assetId'])
    clip = bank.clip('source_open_pose', 1/60, loop=False, end_mode='hold')
    for rig_id, pivot in s.motion_pivots.items():
        clip.key(rig_id, 0, loc=pivot.location)
        clip.key(rig_id, 1/60, loc=pivot.location)
    target = out / (key + '.motion.json')
    result = bank.bake([str(glb)], out_path=str(target))
    # These NPC/place files contain all three tiers under each common pivot.
    for binding in result['bindings']:
        binding['requiredAtLod'] = [0, 1, 2]
    result['simulationAuthority'] = 'Ceres native actual slide fraction; renderer applies after bank update'
    target.write_text(json.dumps(result, indent=1) + '\n')


if __name__ == '__main__':
    main()
