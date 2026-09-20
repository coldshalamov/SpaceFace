"""Warden and the three Helios hostile variants: retained-source geometry remaster.

Blender --background --threads 3 --python tools/blender/helios_remaster/warden.py
  -- --inspect | --build [--only=name]
Candidates only. Shared release integration belongs to the root lane.
"""
from __future__ import annotations
import argparse, copy, hashlib, json, math, struct, subprocess, sys
from pathlib import Path
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
import hero_fleet as h

SOURCE = ROOT / 'assets/ships/parts/wholeships'
OUT = ROOT / '.devshots/helios-remaster/warden'
NAMES = ['warden_production_v1', 'warden_production_v1_lod1', 'warden_production_v1_lod2',
         'ashline_dart', 'ashline_lode', 'ashline_rig_corsair_blade']
REGISTRY = HERE / 'warden.sources.json'
STAMP = 'helios-warden-hostiles-2026-09-19'


def sha(data): return hashlib.sha256(data).hexdigest()
def doc(data): return json.loads(data[20:20+struct.unpack_from('<I', data, 12)[0]])


def source_bytes(name):
    registry = json.loads(REGISTRY.read_text()) if REGISTRY.exists() else {}
    current = (SOURCE / (name+'.glb')).read_bytes()
    if name in registry:
        expected = registry[name]
        if sha(current) == expected['sha256']: return current
        original = subprocess.check_output(['git', 'cat-file', 'blob', expected['gitBlob']], cwd=ROOT)
        if sha(original) != expected['sha256']: raise RuntimeError('Pinned source changed: '+name)
        return original
    path = 'assets/ships/parts/wholeships/'+name+'.glb'
    blob = subprocess.check_output(['git', 'hash-object', path], cwd=ROOT, text=True).strip()
    registry[name] = {'source': path, 'gitBlob': blob, 'sha256': sha(current)}
    REGISTRY.write_text(json.dumps(registry, indent=2)+'\n')
    return current


def load(name):
    h.clear()
    source = source_bytes(name)
    path = OUT / '.inputs' / (name+'.glb'); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(source)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    return source


def helper_snapshot():
    return {o.name: {'matrix': [round(v, 7) for row in o.matrix_world for v in row],
        'vertices': [[round(v, 7) for v in point.co] for point in o.data.vertices] if o.type == 'MESH' else None}
        for o in bpy.context.scene.objects if any(t in o.name.upper() for t in ('SOCKET', 'MOUNT', 'COLLISION'))}


def inventory(names):
    result = {}
    for name in names:
        source = load(name)
        groups = h.scene_groups()
        result[name] = {'sourceSha256': sha(source), 'groups': {str(level): [
            {'name': o.name, 'bounds': h.bounds(o), 'triangles': sum(len(p.vertices)-2 for p in o.data.polygons),
             'materials': [m.name for m in o.data.materials if m]} for o in obs] for level, obs in groups.items()}}
        # A regular sample locates the actual deck, rather than guessing from a
        # collision box or antenna-inflated maximum height.
        objects = groups[min(groups)]
        result[name]['deck'] = [[x, y, h.top_at(objects, x, y)[0]]
            for x in range(-9, 10, 2) for y in (-2., -1., 0., 1., 2.)]
        if name in ('warden_production_v1', 'ashline_dart', 'ashline_lode', 'ashline_rig_corsair_blade'):
            components = h.isolate_components(objects)
            result[name]['shellComponents'] = [{'name': o.name, 'bounds': h.bounds(o),
                'triangles': sum(len(p.vertices)-2 for p in o.data.polygons)} for o in components
                if 'hull' in ' '.join(m.name.lower() for m in o.data.materials if m)]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT/'source_inventory.json').write_text(json.dumps(result, indent=2)+'\n')
    print('WARDEN_INSPECTED', list(result), flush=True)


def role_materials(objects, authored, level):
    existing = sorted({m for o in objects for m in o.data.materials if m}, key=lambda m: m.name)
    def find(tokens, fallback):
        return next((m for t in tokens for m in existing if t in m.name.lower()), fallback)
    mats = h.lod_materials(objects, authored)
    mats['enamel'] = find(('hull', 'armor'), authored['enamel'])
    mats['glass'] = find(('glass', 'canopy'), authored['glass'])
    mats['warm'] = find(('warm', 'warning', 'accent', 'thruster', 'cyan'), mats['dark'])
    if level > 0:
        # Far mechanisms use existing native materials, including source enamel.
        mats['dark'] = find(('mechanical', 'armor'), mats['dark'])
        mats['steel'] = mats['dark']; mats['copper'] = mats['dark']
        mats['ceramic'] = find(('ceramic', 'radiator', 'mechanical'), mats['dark'])
    return mats


def formed(name, sections, y, material):
    obj = h.formed_housing(name, sections, material)
    obj.location.y += y
    return obj


def shoulder_shell(name, sections, sign, material):
    """A continuous manufactured cheek with an open centerline, not attached boxes."""
    vertices = []
    for x, inside, outside, bottom, top in sections:
        edge = min(.09, (outside-inside)*.22, (top-bottom)*.20)
        section = [(inside, bottom+edge), (inside, top-edge), (inside+edge, top),
            (outside-edge, top), (outside, top-edge), (outside, bottom+edge),
            (outside-edge, bottom), (inside+edge, bottom)]
        vertices += [(x, sign*y, z) for y, z in section]
    faces = [tuple(range(7, -1, -1)), tuple((len(sections)-1)*8+i for i in range(8))]
    faces += [(j*8+i, j*8+(i+1)%8, (j+1)*8+(i+1)%8, (j+1)*8+i)
        for j in range(len(sections)-1) for i in range(8)]
    return h.bevel(h.mesh_obj(name, vertices, faces, material), .022, 2)


def open_web(name, points, width, material):
    """Thick triangular cast gusset with a real lightening aperture."""
    a, b, c = map(Vector, points); normal = (b-a).cross(c-a).normalized()
    center = (a+b+c)/3
    outer = [a, b, c]; inner = [center+(p-center)*.62 for p in outer]
    vertices = [tuple(p+normal*offset) for offset in (-width/2, width/2) for p in outer+inner]
    faces = []
    for i in range(3):
        j = (i+1)%3
        faces += [(i, j, j+3, i+3), (i+6, i+9, j+9, j+6),
            (i, i+6, j+6, j), (i+3, j+3, j+9, i+9)]
    return h.bevel(h.mesh_obj(name, vertices, faces, material), .025, 2)


def warden_structure(objects, mats, level):
    prefix = f'LOD{level}_Remaster_Warden'
    shells = [o for o in objects if any(t in ' '.join(m.name.lower() for m in o.data.materials if m)
        for t in ('hull', 'armor'))]
    report = []
    for sign in (-1, 1):
        report.append(h.cavity(shells, 'WardenCasemateGallery'+str(sign), -3.65, sign*1.23,
            5.35, .70, .49, 'cool', mats, level))
        # Shoulder buttresses leave the long service slots open to the chase view.
        for x in ((-5.85, -3.7, -1.5) if level == 0 else (-5.7, -1.6)):
            z, _ = h.top_at(shells, x, sign*1.75)
            h.pipe(prefix+'_CasemateKnee', [(x, sign*1.90, z-.04),
                (x, sign*1.70, z+.12), (x, sign*1.60, z+.15)], .045, mats['steel'])
        # The existing upper bridge is retained. Curved corner posts and long
        # sill rails give the glazing an actual pressure-frame load path.
        h.pipe(prefix+'_BridgeSill', [(0.87, sign*.65, 1.39), (1.17, sign*.72, 1.52),
            (3.65, sign*.64, 1.50), (4.63, sign*.37, 1.33)], .058, mats['steel'])
        for x, z in ((1.08, 2.23), (2.64, 2.06), (4.35, 1.58)):
            h.pipe(prefix+'_BridgeFrame', [(x, sign*.67, 1.42),
                (x, sign*.59, z-.12), (x, sign*.25, z)], .045 if level < 2 else .035, mats['steel'])
        if level == 0:
            h.box(prefix+'_BridgeSignal', (1.15, sign*.61, 1.51), (.38, .035, .055), mats['warm'], .008)
    # Three open thrust cradles connect the retained bell throats to the transom.
    for y in (-1.80, 0, 1.80):
        for side in (-1, 1):
            h.pipe(prefix+'_ThrustLongeron', [(-8.65, y+side*.23, .39),
                (-9.35, y+side*.29, .47), (-10.18, y+side*.25, .31)], .065, mats['steel'])
        if level < 2:
            h.pipe(prefix+'_CoolantFeed', [(-8.35, y, .52), (-9.13, y, .62),
                (-10.22, y, .36)], .048, mats['copper'])
        h.pipe(prefix+'_CradleCrosshead', [(-9.41, y-.31, .45),
            (-9.41, y+.31, .45)], .065, mats['dark'])
    report.append({'label': 'Retained pressure-glass bridge framed; three open transom thrust cradles'})
    return report


def dart_structure(objects, mats, level):
    prefix = f'LOD{level}_Remaster_Dart'
    shells = [o for o in objects if any('hull' in m.name.lower() for m in o.data.materials if m)]
    report = [h.cavity(shells, 'DartThermalSpine', -.75, 0, 3.3, .32, .32, 'cool', mats, level)]
    for sign in (-1, 1):
        shoulder_shell(prefix+'_ContinuousCheek'+str(sign), [
            (-6.36, .30, .75, -.17, .22), (-5.37, .25, .77, -.24, .34),
            (-4.15, .22, .64, -.27, .49), (-2.55, .22, .70, -.30, .52),
            (.50, .25, .85, -.23, .48), (1.75, .28, 1.01, -.17, .40),
            (3.20, .25, .68, -.24, .49), (4.69, .23, .57, -.18, .43),
            (5.50, .25, .63, -.14, .39)], sign, mats['enamel'])
        # The inboard shadow strip is lower than the armor shoulder; the existing
        # central spine and the new long negative slots remain visibly distinct.
        h.pipe(prefix+'_CheekGasket', [(-5.20, sign*.25, .31), (-3.0, sign*.23, .45),
            (.0, sign*.25, .44), (1.72, sign*.29, .35)], .036, mats['dark'])
    # Sleeved necks articulate existing body blocks as an assembly and connect
    # the mid-body to the long pointed prow without enlarging the needle outline.
    formed(prefix+'_ForwardPressureNeck', [(4.40, .61, -.12, .40),
        (4.67, .67, -.10, .51), (4.98, .48, -.08, .40), (5.28, .55, -.08, .38)], 0, mats['steel'])
    formed(prefix+'_AftCoolingSaddle', [(-4.56, .69, -.19, .28),
        (-4.2, .54, -.15, .41), (-3.78, .64, -.16, .35)], 0, mats['dark'])
    for sign in (-1, 1):
        # Long rooted canard spar rather than tiny ornaments. The low cap leaves
        # each original blade's silhouette intact and implies a forged wing root.
        h.pipe(prefix+'_CanardLoadSpar', [(1.24, sign*.35, .26),
            (1.14, sign*.92, .17), (.92, sign*1.57, .105), (.70, sign*2.22, .075)], .043, mats['steel'])
        if level < 2:
            h.pipe(prefix+'_AftEngineYoke', [(-4.6, sign*.38, .16),
                (-5.33, sign*.59, .31), (-6.32, sign*.63, .13)], .054, mats['steel'])
        # The central body is only .88 wide: these rails are flush shoulder
        # returns beside the open spine, not wing-span ornaments.
        h.pipe(prefix+'_SpineReturn', [(-2.40, sign*.25, .36),
            (-1.90, sign*.26, .50), (.84, sign*.26, .50)], .033, mats['copper'])
    return report+[{'label': 'Continuous paired cheek shells join drive block, wing shoulders and nose collar; center slots remain open'}]


def lode_structure(objects, mats, level):
    prefix = f'LOD{level}_Remaster_Lode'
    shells = [o for o in objects if any('hull' in m.name.lower() for m in o.data.materials if m)]
    removed = []
    for obj in list(shells):
        low, high = h.bounds(obj)
        if high[0]-low[0] > 7.0 and high[1]-low[1] < .85 and 1.00 < low[2] < 1.15:
            # The old freestanding upper bar concealed the narrow actual hull.
            # Replace that manufactured component with a recessed service trough.
            removed.append(obj.name); shells.remove(obj); objects.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
    report = []
    formed(prefix+'_ContinuousKeel', [(-10.56, 1.3, -.37, .21), (-8.50, 1.8, -.48, .46),
        (-5.1, 2.30, -.48, .49), (-2.8, 3.35, -.57, .36),
        (1.6, 3.48, -.53, .40), (4.3, 2.4, -.36, .58),
        (6.8, 1.3, -.18, .69), (8.45, 1.01, -.09, .80)], 0, mats['dark'])
    for sign in (-1, 1):
        shoulder_shell(prefix+'_CastCasemate'+str(sign), [
            (-10.30, .27, .73, -.29, .26), (-8.40, .38, 1.01, -.31, .64),
            (-6.0, .46, 1.17, -.30, .86), (-3.8, .53, 1.80, -.24, .83),
            (-2.6, .57, 2.48, -.30, .73), (-.9, .56, 2.11, -.33, .55),
            (1.75, .55, 2.47, -.24, .74), (3.6, .50, 1.66, -.17, .86),
            (5.4, .36, .82, -.09, .87), (6.9, .33, .73, .02, .91),
            (8.30, .27, .57, .10, .96)], sign, mats['enamel'])
    for sign in (-1, 1):
        y = sign*3.15
        report.append(h.cavity(shells, 'LodeBroadsideCassette'+str(sign), -.30, y,
            3.78, .91, .40, 'heavy', mats, level))
        # Existing upper light and battery ridges now have real deep-section
        # saddles. Open ends keep the pressure hardware and cavity visible.
        for x in ((-2.25, -.30, 1.65) if level < 2 else (-2.25, 1.65)):
            h.pipe(prefix+'_PodSaddle', [(x, y-.61, .35), (x, y-.59, .74),
                (x, y-.24, 1.03), (x, y+.24, 1.03), (x, y+.59, .74),
                (x, y+.61, .35)], .063, mats['steel'])
        h.pipe(prefix+'_PodCrown', [(-2.37, y, .82), (-1.90, y, 1.14),
            (1.34, y, 1.14), (1.85, y, .82)], .09, mats['dark'])
        for x in (-1.80, 1.15):
            h.pipe(prefix+'_ShoulderKnee', [(x, sign*.66, .55),
                (x, sign*1.24, .68), (x, sign*2.08, .58),
                (x, sign*2.51, .46)], .080, mats['steel'])
    report.append(h.cavity(shells, 'LodeDorsalHeatTrench', -1.0, 0, 4.5, .91, .45, 'cool', mats, level))
    # A cast neck and underhung channels connect the heavy blunt bow to its spine.
    formed(prefix+'_ArmoredBowNeck', [(6.55, .88, .05, .76), (6.86, .92, .06, .91),
        (7.25, .76, .11, .89), (7.66, .88, .08, .97)], 0, mats['dark'])
    if level < 2:
        for sign in (-1, 1):
            h.pipe(prefix+'_BowHydraulic', [(5.83, sign*.48, .43),
                (6.91, sign*.42, .53), (7.72, sign*.44, .69)], .055, mats['copper'])
    return report+[{'label': 'Continuous center keel and swept casemate shoulders connect drives, cassettes and bow; unsupported bar replaced by recessed trough',
        'removedObsoleteDorsalBar': removed}]


def corsair_structure(objects, mats, level):
    prefix = f'LOD{level}_Remaster_Corsair'
    shells = [o for o in objects if 'var_corsair' not in o.name.lower()
        and any('hull' in m.name.lower() for m in o.data.materials if m)]
    report = [h.cavity(shells, 'CorsairSalvageDeckCooling', -1.8, 0, 1.7, .68, .36, 'heavy', mats, level)]
    h.ashline_truss(mats, level)
    formed(prefix+'_ForgedCenterKeel', [(-7.31, .68, -.24, .11), (-5.4, .91, -.34, .20),
        (-3.05, 1.32, -.51, .44), (.0, 1.51, -.69, .45),
        (2.7, 1.38, -.43, .55), (3.58, 1.01, -.20, .71),
        (4.23, .72, .21, .89)], -.05, mats['dark'])
    for sign in (-1, 1):
        shoulder_shell(prefix+'_RootCastings'+str(sign), [
            (-3.35, .36, .69, -.29, .44), (-1.8, .38, .87, -.39, .56),
            (.65, .36, .88, -.34, .60), (2.28, .39, .89, -.17, .72),
            (3.37, .30, .61, .10, .82)], sign, mats['enamel'])
    if level == 0:
        # The retained Corsair blades/collars were elevated beyond the base Rig.
        # Full rooted cage members now support them; neither tips nor gun pivots move.
        for sign in (-1, 1):
            upper = 3.16 if sign < 0 else 2.40
            open_web(prefix+'_CastBladeShoe', [(1.51, sign*.58, .55),
                (3.15, sign*.61, .74), (3.79, sign*1.82, upper)], .18, mats['steel'])
            h.pipe(prefix+'_BladeRoot', [(2.25, sign*.48, .56),
                (3.42, sign*1.38, upper-.30), (3.79, sign*1.82, upper)], .105, mats['steel'])
            h.pipe(prefix+'_BladeAftStay', [(.15, sign*.51, .68),
                (2.64, sign*1.43, upper-.29), (3.79, sign*1.82, upper)], .078, mats['dark'])
            aftz = 3.10 if sign < 0 else .36
            h.pipe(prefix+'_AftBladeShoe', [(-1.52, sign*.48, .54),
                (-1.28, sign*1.49, max(.52, aftz-.42)), (-1.25, sign*2.19, aftz)], .088, mats['steel'])
            h.pipe(prefix+'_BoardingRail', [(3.52, sign*.55, .57),
                (5.14, sign*1.34, 2.25), (7.36, sign*1.40, 3.27),
                (8.34, sign*1.40, 3.23)], .10, mats['dark'])
            h.pipe(prefix+'_CollarKnee', [(5.14, sign*1.34, 2.25),
                (6.11, sign*.91, 2.95), (7.36, sign*1.40, 3.27)], .07, mats['steel'])
        # Static original variant pieces will join the native material batches;
        # animated tether spool, guns and fans retain their original identities.
    return report+[{'label': 'Rig thrust truss and rooted raised Corsair blade/boarding cage'}]


def geometry_stats():
    groups = h.scene_groups()
    return {str(level): {'meshes': len(objects),
        'triangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),
        'bounds': [[min(h.bounds(o)[0][i] for o in objects) for i in range(3)],
                   [max(h.bounds(o)[1][i] for o in objects) for i in range(3)]]}
        for level, objects in groups.items()}


def finish(additions):
    h.regroup_originals()
    # Boolean/regroup operations can leave duplicate or unused material slots.
    # Compact them before choosing a same-material static source batch; otherwise
    # a one-substance hull incorrectly looks multi-material and adds a far draw.
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or not obj.data.materials: continue
        prior = list(obj.data.materials)
        used = [prior[p.material_index] if p.material_index < len(prior) else prior[0] for p in obj.data.polygons]
        fallback = next((m for m in prior if m), None)
        unique = []
        for m in used:
            m = m or fallback
            if m and m not in unique: unique.append(m)
        if not unique: continue
        obj.data.materials.clear()
        for material in unique: obj.data.materials.append(material)
        for polygon, material in zip(obj.data.polygons, used):
            polygon.material_index = unique.index(material or fallback)
    for obj in additions:
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=modifier.name)
        if not obj.data.uv_layers:
            uv = obj.data.uv_layers.new(name='UVMap')
            for poly in obj.data.polygons:
                for li in poly.loop_indices:
                    co = obj.data.vertices[obj.data.loops[li].vertex_index].co
                    uv.data[li].uv = (co.x*.125, co.y*.125)
    batches = {}
    # Existing Corsair VAR parts are rigid, unanimated children; join them into
    # native static material batches to eliminate their one-object-per-gusset cost.
    variants = [o for o in bpy.context.scene.objects if o.type == 'MESH' and '_VAR_CORSAIR_' in o.name]
    for obj in additions+variants:
        batches.setdefault((obj.name[:4], obj.data.materials[0]), []).append(obj)
    for (lod, material), objects in batches.items():
        target = next((o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in additions+variants
            and o.name.startswith(lod) and len(o.data.materials) == 1 and o.data.materials[0] == material
            and not any(t in o.name.lower() for t in ('hook', 'gun_', 'collision', 'gimbal'))), None)
        name = target.name if target else lod+'_Remaster_'+material.name
        if target: objects = [target]+objects
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects: obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        obj = bpy.context.object; obj.name = name
        obj['spaceface'] = {'lod': lod.lower(), 'chamfered': True}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH': continue
        if any(len(p.vertices) > 4 for p in obj.data.polygons):
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new('Triangulate real apertures', 'TRIANGULATE')
            modifier.keep_custom_normals = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        for material in obj.data.materials:
            if material: material['spacefaceRemasterGeometry'] = True
    bpy.context.view_layer.update()


def metadata(path, source, source_hash):
    h.preserve_metadata(path, doc(source), source_hash)
    data = path.read_bytes(); document = doc(data)
    for container in [document['asset']]+document.get('scenes', []):
        meta = container.setdefault('extras', {}).setdefault('spacefaceAsset', {})
        meta['surfaceGeometryRemaster'] = STAMP
        meta['surfaceGeometrySourceSha256'] = source_hash
        meta['authoringScript'] = 'tools/blender/helios_remaster/warden.py'
    length = struct.unpack_from('<I', data, 12)[0]; tail = data[20+length:]
    payload = json.dumps(document, separators=(',', ':')).encode(); payload += b' '*(-len(payload)%4)
    path.write_bytes(struct.pack('<III', 0x46546c67, 2, 20+len(payload)+len(tail))+
        struct.pack('<II', len(payload), 0x4e4f534a)+payload+tail)


def build(name):
    source = load(name); before = geometry_stats(); helpers = helper_snapshot()
    groups = {level: h.isolate_components(objects) for level, objects in h.scene_groups().items()}
    original = set(bpy.context.scene.objects)
    authored = h.materials(); changes = []
    method = warden_structure if name.startswith('warden') else dart_structure if name == 'ashline_dart' else lode_structure if name == 'ashline_lode' else corsair_structure
    for level, objects in groups.items():
        h.LOD_DETAIL = level
        changes += method(objects, role_materials(objects, authored, level), level)
    additions = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in original]
    finish(additions)
    if helper_snapshot() != helpers: raise RuntimeError('Socket/collision/mount transform or geometry changed')
    after = geometry_stats()
    for level, stats in after.items():
        baseline = before[level]['bounds']
        for axis in range(3):
            if stats['bounds'][0][axis] < baseline[0][axis]-.015 or stats['bounds'][1][axis] > baseline[1][axis]+.015:
                raise RuntimeError('Silhouette envelope grew: '+name+' LOD'+level+' axis '+str(axis))
    path = OUT/name; path.mkdir(parents=True, exist_ok=True)
    output = path/(name+'.glb')
    old_meta = next((s.get('extras', {}).get('spacefaceAsset', {}) for s in doc(source).get('scenes', [])
        if s.get('extras', {}).get('spacefaceAsset')), {})
    spec = {'kind': 'wholeship', 'id': name, 'assetId': old_meta.get('assetId', 'SF_WHOLESHIP_'+name.upper()),
        'slot': 'hull', 'required_maps': []}
    h.export_gltf(str(output), spec, [o for o in bpy.context.scene.objects if o.type not in ('LIGHT', 'CAMERA')])
    metadata(output, source, sha(source))
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH': obj.hide_render = 'collision' in obj.name.lower() or obj.name.startswith(('LOD1_', 'LOD2_'))
    bpy.ops.wm.save_as_mainfile(filepath=str(path/(name+'.blend')))
    result = {'asset': name, 'sourcePath': 'assets/ships/parts/wholeships/'+name+'.glb',
        'candidatePath': str(output.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': sha(source),
        'candidateSha256': sha(output.read_bytes()), 'sourceBytes': len(source), 'candidateBytes': output.stat().st_size,
        'baseline': before, 'candidate': after, 'helpersUnchanged': True, 'everyMaterialGeometryFlag': True,
        'changes': changes, 'review': 'Candidate; root independent whole-asset review pending'}
    (path/'candidate.json').write_text(json.dumps(result, indent=2)+'\n')
    print('WARDEN_HOSTILE_BUILT', name, result['candidateSha256'], flush=True)
    return result


def finish_batches(name):
    """Coalesce duplicated static material slots without reauthoring the model."""
    path = OUT/name; bpy.ops.wm.open_mainfile(filepath=str(path/(name+'.blend')))
    original_helpers = helper_snapshot(); original_stats = geometry_stats()
    additions = [o for o in bpy.context.scene.objects if o.type == 'MESH' and 'Remaster' in o.name]
    finish(additions)
    if helper_snapshot() != original_helpers: raise RuntimeError('Batch cleanup moved an interface')
    final_stats = geometry_stats()
    for level in original_stats:
        if original_stats[level]['triangles'] != final_stats[level]['triangles']:
            raise RuntimeError('Batch cleanup changed triangle count')
        if original_stats[level]['bounds'] != final_stats[level]['bounds']:
            raise RuntimeError('Batch cleanup changed extent')
    source = source_bytes(name); output = path/(name+'.glb')
    h.export_gltf(str(output), {'kind': 'wholeship', 'id': name, 'slot': 'hull', 'required_maps': []},
        [o for o in bpy.context.scene.objects if o.type not in ('LIGHT', 'CAMERA')])
    metadata(output, source, sha(source))
    bpy.ops.wm.save_as_mainfile(filepath=str(path/(name+'.blend')))
    result = json.loads((path/'candidate.json').read_text())
    result.update(candidateSha256=sha(output.read_bytes()), candidateBytes=output.stat().st_size, candidate=final_stats)
    result['staticBatchCleanup'] = 'Unused/duplicate material slots compacted; triangle count, bounds and interfaces unchanged'
    (path/'candidate.json').write_text(json.dumps(result, indent=2)+'\n')
    print('WARDEN_BATCHES_FINISHED', name, result['candidateSha256'], flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--finish-batches', action='store_true')
    parser.add_argument('--only')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    names = args.only.split(',') if args.only else NAMES
    if args.inspect: inventory(names)
    elif args.finish_batches:
        for name in names: finish_batches(name)
    elif args.build:
        for name in names: build(name)
    else: parser.error('Choose --inspect or --build')


if __name__ == '__main__': main()
