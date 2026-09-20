"""Targeted Helios surveyed-seam asteroid authoring, preserving the released assembly.

Run in Blender with --background --python this_file -- [--inspect].
Candidates stay in .devshots/helios-remaster/geology; root owns promotion.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import struct
import subprocess
import sys
from pathlib import Path
import bpy
import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / '.devshots/helios-remaster/geology'
SOURCE = ROOT / 'assets/ships/parts/places/place_asteroid_seamed.glb'
SOURCE_REVISION = '6371ef8d493987eaba2e5a94b64e20e6e26cf3ca'
SOURCE_SHA256 = '5e0e87fdc2e98f485caaeb3fcdf5c6db59c649b7160e23be2c8be71e3eece119'
INPUT_SOURCE = SOURCE
sys.path.insert(0, str(ROOT / 'tools/blender'))
import spaceface_export

def json_value(v):
    if hasattr(v, 'to_list'): return v.to_list()
    if hasattr(v, 'to_dict'): return v.to_dict()
    raise TypeError(type(v).__name__)

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def bounds(objects):
    pts = [obj.matrix_world @ v.co for obj in objects if obj.type == 'MESH' for v in obj.data.vertices]
    return {'min': [min(p[i] for p in pts) for i in range(3)],
            'max': [max(p[i] for p in pts) for i in range(3)]}

def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)

def import_source():
    global INPUT_SOURCE
    # Repeatable after promotion: do not sculpt/bake the already remastered GLB
    # a second time. The existing committed source is the frozen authoring base.
    if sha(SOURCE) != SOURCE_SHA256:
        INPUT_SOURCE = OUT/'baseline-place_asteroid_seamed.glb'
        if not INPUT_SOURCE.exists() or sha(INPUT_SOURCE) != SOURCE_SHA256:
            baseline = subprocess.run(['git','show',SOURCE_REVISION+':'+SOURCE.relative_to(ROOT).as_posix()],
                cwd=ROOT,check=True,capture_output=True).stdout
            INPUT_SOURCE.write_bytes(baseline)
        if sha(INPUT_SOURCE) != SOURCE_SHA256:raise RuntimeError('Frozen authoring source hash mismatch')
    for scene in bpy.data.scenes:
        for key in list(scene.keys()): del scene[key]
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(INPUT_SOURCE))
    bpy.context.view_layer.update()

def plain(v):
    return json.loads(json.dumps(v, default=json_value))

def glb(path):
    raw = Path(path).read_bytes(); size = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20+size]), raw[28+size:]

def write_glb(path, doc, binary):
    data = json.dumps(doc, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    binary += b'\0' * (-len(binary) % 4)
    Path(path).write_bytes(struct.pack('<III', 0x46546c67, 2, 28+len(data)+len(binary))
        + struct.pack('<II', len(data), 0x4e4f534a) + data
        + struct.pack('<II', len(binary), 0x004e4942) + binary)

def restore_scene_metadata(exported, source):
    # Active scene metadata takes precedence over asset.extras in the shipping
    # compiler. Retain the source scene contract, including its canonical ID.
    source_extras=plain(source['scenes'][source.get('scene',0)].get('extras',{}))
    source_extras['spacefaceAsset']=plain(exported['asset']['extras']['spacefaceAsset'])
    exported['scenes'][exported.get('scene',0)]['extras']=source_extras
    for scene in bpy.data.scenes:
        for key in list(scene.keys()):del scene[key]
        for key,value in source_extras.items():scene[key]=value

def repair_candidate_scene():
    out=OUT/'place_asteroid_seamed.glb';blend=OUT/'place_asteroid_seamed.blend'
    source,_=glb(SOURCE);exported,binary=glb(out);before=sha(out)
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    restore_scene_metadata(exported,source);write_glb(out,exported,binary)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    report_path=OUT/'place_asteroid_seamed.json';report=json.loads(report_path.read_text())
    report.update(candidateSha256=sha(out),bytes=out.stat().st_size,builderSha256=sha(__file__),
        sceneIdentity=exported['scenes'][exported.get('scene',0)]['extras']['spacefaceAsset']['assetId'],
        sceneMetadataRepair={'previousSha256':before,'binaryPayloadUnchanged':True})
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    print('GEOLOGY_SCENE_REPAIRED '+json.dumps({'sha256':sha(out),'previousSha256':before,'binaryPayloadUnchanged':True}),flush=True)

def blur_periodic(a, radius):
    # Average existing authored pigment; no new random texture or generic noise.
    for axis in (0, 1):
        a = sum(np.roll(a, offset, axis=axis) for offset in range(-radius, radius+1)) / (2*radius+1)
    return a

def surface_materials():
    modified = []
    palettes = {'Regolith': (.96, .95, .94), 'Strata': (.82, .88, .96),
                'Fracture': (.46, .51, .64), 'Mineral': (.57, .85, .92)}
    strengths = {'Regolith': .10, 'Strata': .025, 'Fracture': .10, 'Mineral': .06}
    for suffix, tint in palettes.items():
        material = bpy.data.materials['Material_'+suffix]
        material['spaceface.surfaceRevision'] = 'helios-bedded-seam-v1'
        material['spacefaceRemasterGeometry'] = True
        for node in material.node_tree.nodes:
            if node.type == 'NORMAL_MAP': node.inputs['Strength'].default_value = strengths[suffix]
            if node.type != 'TEX_IMAGE' or not node.image: continue
            original = node.image
            if not any(token in original.name for token in ('basecolor', '_orm')): continue
            width, height = original.size
            pixels = np.empty(width*height*4, dtype=np.float32); original.pixels.foreach_get(pixels)
            pixels = pixels.reshape(height, width, 4)
            image = original.copy(); image.name = 'Helios_'+original.name
            if 'basecolor' in original.name:
                lum = pixels[:, :, :3] @ np.array([.2126, .7152, .0722], dtype=np.float32)
                broad = blur_periodic(lum, 5)
                # Strongest local pigment marks remain but fine mottling no longer
                # competes with the actual new fault planes.
                value = broad*.88 + lum*.12
                if suffix == 'Strata':
                    # The fresh break is quiet grey stone. Its old cream swirls
                    # were authored for a narrow rim and overwhelm a broad face.
                    broad = blur_periodic(lum, 24)
                    value = .37 + .055*(broad-float(broad.mean()))
                if suffix == 'Fracture': value *= .72
                if suffix == 'Mineral': value = np.clip(value*.94+.08, 0, 1)
                pixels[:, :, :3] = np.clip(value[:, :, None]*np.array(tint)[None, None, :], 0, 1)
            else:
                rough = blur_periodic(pixels[:, :, 1], 4)
                low, high = {'Regolith': (.82,.94), 'Strata': (.91,.98),
                    'Fracture': (.90,.98), 'Mineral': (.40,.52)}[suffix]
                rough = (rough-rough.min()) / max(float(rough.max()-rough.min()), .001)
                pixels[:, :, 1] = low+(high-low)*rough
                pixels[:, :, 2] = (.38+.10*rough) if suffix == 'Mineral' else 0.0
                if suffix == 'Strata': pixels[:, :, 0] = .90+.08*blur_periodic(pixels[:, :, 0],16)
                node.name = 'Baked_AO_Roughness_Metallic'
            image.pixels.foreach_set(pixels.ravel()); image.update(); image.pack()
            node.image = image
        modified.append({'name': material.name, 'normalStrength': strengths[suffix], 'pigment': tint})
    # Recognize the real AO graph on retained survey materials, too.
    for material in bpy.data.materials:
        if not material.node_tree: continue
        for node in material.node_tree.nodes:
            if node.type == 'GROUP' and node.inputs.get('Occlusion') and node.inputs['Occlusion'].is_linked:
                channel = node.inputs['Occlusion'].links[0].from_node
                for socket in channel.inputs:
                    if socket.is_linked and socket.links[0].from_node.type == 'TEX_IMAGE':
                        socket.links[0].from_node.name = 'Baked_AO_Roughness_Metallic'
    # The whole host shares the actual common-rock substrate. No cap material,
    # old wrinkled normal field, or separate UV patch remains on this mass.
    host = bpy.data.materials['Material_Regolith']
    surface_root = ROOT/'assets/ships/release/surfaces/common-rock'
    for node in host.node_tree.nodes:
        if node.type == 'NORMAL_MAP': node.inputs['Strength'].default_value = .22
        if node.type != 'TEX_IMAGE' or not node.image: continue
        old_name = node.image.name
        role = 'basecolor' if 'basecolor' in old_name else ('normal' if 'normal' in old_name else ('orm' if '_orm' in old_name else None))
        if not role: continue
        image = bpy.data.images.load(str(surface_root/f'rock_{role}.png'), check_existing=True)
        image = image.copy(); image.name = f'Helios_CommonHost_{role}'
        if role != 'basecolor': image.colorspace_settings.name = 'Non-Color'
        if role == 'orm':
            width,height = image.size
            pixels = np.empty(width*height*4,dtype=np.float32);image.pixels.foreach_get(pixels)
            pixels = pixels.reshape(height,width,4)
            pixels[:,:,1] = .86+.09*pixels[:,:,1]
            pixels[:,:,2] = 0
            image.pixels.foreach_set(pixels.ravel());image.update()
            node.name = 'Baked_AO_Roughness_Metallic'
        image.pack();node.image = image
    host['spaceface.surfaceRevision'] = 'helios-coherent-common-host-v3'
    use_pigment(host,'GeologyPigment')
    use_pigment(bpy.data.materials['Material_Mineral'],'MineralPigment')
    modified.append({'name':host.name,'source':'shipping common-rock mapped substrate',
        'normalStrength':.22,'roughnessRange':[.86,.95],'metalness':0})
    return modified

def use_pigment(material, name):
    # Blender 5 needs its modern Mix node to recognize actual vertex pigment.
    principled = next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    base = principled.inputs['Base Color'];texture_output = base.links[0].from_socket
    pigment = material.node_tree.nodes.new('ShaderNodeVertexColor');pigment.layer_name=name
    multiply = material.node_tree.nodes.new('ShaderNodeMix');multiply.data_type='RGBA';multiply.blend_type='MULTIPLY'
    multiply.inputs[0].default_value = 1
    material.node_tree.links.new(texture_output,multiply.inputs[6])
    material.node_tree.links.new(pigment.outputs['Color'],multiply.inputs[7])
    material.node_tree.links.new(multiply.outputs[2],base)

def mesh_tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices],
        [tuple(p.vertices) for p in obj.data.polygons], all_triangles=False)

def front_depth(tree, x, z):
    hit = tree.ray_cast(Vector((x,-40,z)),Vector((0,1,0)),80)[0]
    if hit is None: raise RuntimeError(f'Survey component outside host footprint at {x:.3f}, {z:.3f}')
    return hit.y

def sculpt_host(obj, lod, target_bounds):
    source_triangles = triangles(obj); original_tree = mesh_tree(obj)
    data = json.loads((OUT/'common-host.json').read_text())['attributes']
    positions = np.array(data['position']['array'],dtype=np.float64).reshape(-1,3)
    # Shipping Three.js XYZ -> Blender X,-Z,Y. Stretch the blocky sheared mass
    # within the frozen landmark envelope rather than retaining its old sphere.
    points = np.stack((positions[:,0],-positions[:,2],positions[:,1]),axis=1)
    lo,hi = points.min(axis=0),points.max(axis=0)
    target_lo = np.array(target_bounds['min'])+np.array([.12,.65,.12])
    target_hi = np.array(target_bounds['max'])-np.array([.12,.12,.12])
    scale = (target_hi-target_lo)/(hi-lo)
    points = (points-lo)*scale+target_lo
    mesh = bpy.data.meshes.new(f'LOD{lod}_CoherentShearHost')
    mesh.from_pydata(points.tolist(),[],[(i,i+1,i+2) for i in range(0,len(points),3)])
    mesh.update();mesh.materials.append(bpy.data.materials['Material_Regolith'])
    uv = mesh.uv_layers.new(name='UVMap')
    texcoords = np.array(data['uv']['array']).reshape(-1,2)*1.65
    colors = np.array(data['color']['array']).reshape(-1,3)
    vertex_color = mesh.color_attributes.new(name='GeologyPigment',type='FLOAT_COLOR',domain='CORNER')
    for loop in mesh.loops:
        uv.data[loop.index].uv = texcoords[loop.vertex_index]
        vertex_color.data[loop.index].color = (*np.clip(colors[loop.vertex_index],0,1),1)
    normals = np.array(data['normal']['array']).reshape(-1,3)
    normals = np.stack((normals[:,0],-normals[:,2],normals[:,1]),axis=1)/scale
    normals /= np.linalg.norm(normals,axis=1)[:,None]
    for poly in mesh.polygons:poly.use_smooth = True
    mesh.normals_split_custom_set(normals.tolist())
    obj.data = mesh
    if lod:
        # Far versions keep the same asymmetric mass with fewer secondary facets.
        bm = bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
        bm.to_mesh(mesh);bm.free()
        bpy.context.view_layer.objects.active = obj
        dec = obj.modifiers.new('CoherentHostNativeLOD','DECIMATE')
        dec.ratio = .58 if lod == 1 else .30;dec.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=dec.name)
    bpy.context.view_layer.update();new_tree = mesh_tree(obj)
    fitted = []
    # Keep branch paths, pockets, pins, cable and survey plate. Fit their depth
    # to the new rock without moving semantic markers or layering another skin.
    components = [o for o in bpy.data.objects if o.type=='MESH' and o != obj
        and int(o.get('spaceface.lodLevel',-1))==lod]
    for part in components:
        if part.data.materials[0].name in ('Material_Fracture','Material_Mineral','Material_Strata'):
            # Old high-sided alteration ribbons became pale hanging fins when
            # fitted onto the new block. Replace them with a real recessed seam.
            bpy.data.objects.remove(part,do_unlink=True);continue
        matrix = part.matrix_world;inverse = matrix.inverted()
        vertices = [matrix @ v.co for v in part.data.vertices]
        hardware = 'Survey' in part.data.materials[0].name
        if hardware and ('Marking' in part.data.materials[0].name or '_04' in part.name
                or (lod==2 and 'SurveyAlloy' in part.data.materials[0].name)):
            # Lettering and registration plate retain their exact separation.
            center = Vector((2.8,0,.4))
        elif hardware and '_00' not in part.name:
            center = sum(vertices,Vector())/len(vertices)
        else:center = None
        if center is not None:
            shift = front_depth(new_tree,center.x,center.z)-front_depth(original_tree,center.x,center.z)
        for vertex,world in zip(part.data.vertices,vertices):
            if center is None:
                shift = front_depth(new_tree,world.x,world.z)-front_depth(original_tree,world.x,world.z)
            world.y += shift
            vertex.co = inverse @ world
        if part.data.has_custom_normals:
            bpy.context.view_layer.objects.active=part
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        part.data.update();fitted.append(part.name)
    obj['spaceface.surfaceRevision']='helios-coherent-common-host-v3'
    seam = rebuild_seam(obj,lod,new_tree)
    return {'lod':lod,'sourceTriangles':source_triangles,'candidateTriangles':triangles(obj),
        'construction':'whole host replaced by shipping shear-fault common-rock mesh',
        'fittedForeground':fitted,'singleHostMaterial':True,'seam':seam}

def rebuild_seam(host,lod,surface):
    # The main branch follows the original landmark's path with fewer, wider
    # fault sections. All relief is inward; no bright rim ribbons or spikes.
    branches = [
        [(-10.3,2.8,.10),(-6.2,1.85,.83),(-2.2,.65,.96),(2.6,.20,.82),(6.8,-.30,.58),(10.5,-1,.08)],
        [(-2.2,.65,.51),(-1,2.45,.42),(.6,4.2,.31),(2.4,6.1,.04)],
    ]
    fracture = bpy.data.materials['Material_Fracture']
    host.data.materials.append(fracture)
    for branch_index,path in enumerate(branches):
        rim = []
        for index,(x,z,width) in enumerate(path):
            a=Vector(path[max(0,index-1)][:2]);b=Vector(path[min(len(path)-1,index+1)][:2])
            tangent=(b-a).normalized();across=Vector((-tangent.y,tangent.x))
            rim.append(((x+across.x*width,z+across.y*width),(x-across.x*width,z-across.y*width)))
        outline = [p[0] for p in rim]+[p[1] for p in reversed(rim)]
        count=len(outline)
        vertices=[(x,-30,z) for x,z in outline]
        vertices += [(x,front_depth(surface,x,z)+.48,z) for x,z in outline]
        faces=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]
        faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
        mesh=bpy.data.meshes.new('TEMP_FaultVolume');mesh.from_pydata(vertices,[],faces);mesh.update()
        mesh.materials.append(fracture)
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        uv=bm.loops.layers.uv.verify()
        for face in bm.faces:
            for loop in face.loops:loop[uv].uv=(loop.vert.co.x/28+.5,loop.vert.co.z/22+.5)
        bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
        cutter=bpy.data.objects.new('TEMP_FaultVolume',mesh);bpy.context.scene.collection.objects.link(cutter)
        bpy.context.view_layer.objects.active=host
        mod=host.modifiers.new(f'RecessedSurveyFault{branch_index}','BOOLEAN')
        mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;mod.material_mode='TRANSFER'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter,do_unlink=True)
    # A few squat mineral faces sit inside the channel. They have broad tops,
    # small chipped shoulders and subdued copper/teal pigment, not crystal fins.
    lenses=[(-6.2,1.86,.85,.34,(.98,.61,.34)),(-2.9,.88,.66,.34,(.36,.80,.73)),
        (1.7,.22,.80,.31,(.34,.71,.69)),(6.3,-.24,.58,.25,(.90,.55,.32)),
        (-.53,2.94,.24,.44,(.32,.73,.70))]
    if lod==2:lenses=lenses[:3]
    vertices=[];faces=[];face_colors=[]
    footprint=[(-1,-.25),(-.62,-.95),(.58,-.73),(1,.2),(.47,.90),(-.69,.72)]
    for x,z,rx,rz,color in lenses:
        start=len(vertices)
        for sx,sz in footprint:
            px,pz=x+sx*rx,z+sz*rz
            vertices.append((px,front_depth(surface,px,pz)+.18,pz))
        for sx,sz in footprint:
            px,pz=x+sx*rx*.86,z+sz*rz*.86
            vertices.append((px,front_depth(surface,px,pz)+.42,pz))
        faces.append(tuple(start+i for i in range(6)));face_colors.append(color)
        for i in range(6):
            faces.append((start+i,start+(i+1)%6,start+(i+1)%6+6,start+i+6));face_colors.append(tuple(c*.72 for c in color))
    mesh=bpy.data.meshes.new(f'LOD{lod}_InsetMineralLenses');mesh.from_pydata(vertices,[],faces);mesh.update()
    mesh.materials.append(bpy.data.materials['Material_Mineral'])
    uv=mesh.uv_layers.new(name='UVMap');pigment=mesh.color_attributes.new(name='MineralPigment',type='FLOAT_COLOR',domain='CORNER')
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            p=mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv=(p.x/28+.5,p.z/22+.5)
            pigment.data[loop_index].color=(*face_colors[poly.index],1)
    minerals=bpy.data.objects.new(f'LOD{lod}_Seamed_Material_Mineral',mesh)
    bpy.context.scene.collection.objects.link(minerals);minerals.parent=host.parent
    minerals['spaceface.lodLevel']=lod;minerals['spaceface.lod']=f'lod{lod}'
    minerals['spaceface.materialRole']='Material_Mineral'
    minerals['spaceface.structureRole']='inset_mineral_faces_in_surveyed_fault'
    return {'branches':len(branches),'mineralFaces':len(lenses),'floorDepthM':.48,'mineralTopDepthM':.18,
        'oldRibbonsRemoved':True,'acceptedHostMassRetained':True}


def contract(objects):
    return {o.name: {'matrix': [list(r) for r in o.matrix_world], 'extras': plain(dict(o.items()))}
        for o in objects if o.type != 'MESH'}

def material_batches():
    # Six material groups per native LOD. Survey meshes retain their exact
    # world-space vertices but no longer incur one draw per individual pin.
    for lod in range(3):
        meshes=[o for o in bpy.data.objects if o.type=='MESH' and int(o.get('spaceface.lodLevel', -1)) == lod]
        for o in list(meshes):
            if len(o.data.materials) <= 1: continue
            bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
        meshes=[o for o in bpy.data.objects if o.type=='MESH' and int(o.get('spaceface.lodLevel', -1)) == lod]
        groups={}
        for o in meshes: groups.setdefault(o.data.materials[0].name,[]).append(o)
        for mat, objects in groups.items():
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:o.select_set(True)
            bpy.context.view_layer.objects.active=objects[0]
            if len(objects)>1:bpy.ops.object.join()
            o=bpy.context.object; o.name=f'LOD{lod}_Seamed_{mat}'
            o['spaceface.materialRole']=mat
            o['spaceface.lodLevel']=lod;o['spaceface.lod']=f'lod{lod}'
            # Boolean operands can carry separate UV layers in a different
            # order per LOD. After material separation each batch has one real
            # layer and an empty donor layer. Keep the populated coordinates;
            # otherwise LOD0's stone map samples one constant ochre texel.
            if o.data.uv_layers:
                def uv_span(layer):
                    values=[loop.uv for loop in layer.data]
                    return sum(max(v[i] for v in values)-min(v[i] for v in values) for i in range(2))
                populated=max(o.data.uv_layers,key=uv_span)
                for layer in list(o.data.uv_layers):
                    if layer!=populated:o.data.uv_layers.remove(layer)
                populated.name='UVMap';o.data.uv_layers.active_index=0;populated.active_render=True
                for node in o.data.materials[0].node_tree.nodes:
                    if node.type=='UVMAP':node.uv_map='UVMap'
            if mat not in ('Material_Regolith','Material_Mineral'):
                for attribute in list(o.data.color_attributes):o.data.color_attributes.remove(attribute)
            if any(len(p.vertices)!=3 for p in o.data.polygons):
                bm=bmesh.new();bm.from_mesh(o.data)
                bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
                bm.to_mesh(o.data);bm.free();o.data.update()

def build():
    doc,_ = glb(INPUT_SOURCE); original=list(bpy.data.objects)
    fixed=contract(original); before=bounds([o for o in original if o.name.startswith('LOD0_')])
    lod_before={str(l):sum(triangles(o) for o in original if o.type=='MESH' and int(o.get('spaceface.lodLevel',-1))==l) for l in range(3)}
    subprocess.run(['node',str(ROOT/'tools/blender/helios_remaster/geology.host.mjs')],cwd=ROOT,check=True)
    materials=surface_materials(); changes=[]
    for lod in range(3):
        host=next(o for o in bpy.data.objects if o.type=='MESH' and int(o.get('spaceface.lodLevel',-1))==lod
            and o.data.materials[0].name=='Material_Regolith')
        changes.append(sculpt_host(host,lod,before))
    material_batches(); meshes=[o for o in bpy.data.objects if o.type=='MESH']
    lods={f'lod{l}':{'triangles':sum(triangles(o) for o in meshes if int(o.get('spaceface.lodLevel',-1))==l),
        'drawGroups':sum(1 for o in meshes if int(o.get('spaceface.lodLevel',-1))==l)} for l in range(3)}
    after=bounds([o for o in meshes if int(o.get('spaceface.lodLevel',-1))==0])
    if fixed != contract(list(bpy.data.objects)):raise RuntimeError('Root or marker transform/extras changed')
    if any(after['min'][i]<before['min'][i]-.0001 or after['max'][i]>before['max'][i]+.0001 for i in range(3)):
        raise RuntimeError('Candidate escaped original envelope')
    if any(lods[f'lod{l}']['triangles'] > lod_before[str(l)] for l in range(3)):
        raise RuntimeError('Native LOD budget increased')
    root=bpy.data.objects['place_asteroid_seamed']; out=OUT/'place_asteroid_seamed.glb'
    spaceface_export.export_gltf(str(out), {'id':'place_asteroid_seamed','kind':'part','slot':'place',
        'assetId':doc['asset']['extras']['spacefaceAsset']['assetId'],
        'forward':'+X','up':'+Y','starboard':'+Z','unit':'metre','chamfered':True}, list(bpy.data.objects))
    exported,binary=glb(out)
    missing_tangents=[m['name'] for m in exported['meshes'] for p in m['primitives'] if 'TANGENT' not in p['attributes']]
    if missing_tangents:raise RuntimeError('Missing exported tangent frames: '+str(missing_tangents))
    hosts = [m for m in exported['meshes'] if any(exported['materials'][p['material']]['name']=='Material_Regolith' for p in m['primitives'])]
    if len(hosts)!=3 or any('COLOR_0' not in p['attributes'] for m in hosts for p in m['primitives']):
        raise RuntimeError('The common-rock host pigment did not survive material export')
    for mesh in hosts:
        uv_accessor=exported['accessors'][mesh['primitives'][0]['attributes']['TEXCOORD_0']]
        uv_view=exported['bufferViews'][uv_accessor['bufferView']]
        uv_offset=uv_view.get('byteOffset',0)+uv_accessor.get('byteOffset',0)
        uv_stride=uv_view.get('byteStride',8)
        coords=[struct.unpack_from('<ff',binary,uv_offset+i*uv_stride) for i in range(uv_accessor['count'])]
        if any(max(v[axis] for v in coords)-min(v[axis] for v in coords)<.2 for axis in range(2)):
            raise RuntimeError('Stone host exported collapsed texture coordinates')
        accessor=exported['accessors'][mesh['primitives'][0]['attributes']['COLOR_0']]
        view=exported['bufferViews'][accessor['bufferView']]
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
        code,unit,white={5121:('B',1,255),5123:('H',2,65535),5126:('f',4,1)}[accessor['componentType']]
        channels=4 if accessor['type']=='VEC4' else 3;stride=view.get('byteStride',channels*unit)
        values=[struct.unpack_from('<'+code*channels,binary,offset+i*stride)[:3] for i in range(accessor['count'])]
        if min(min(v) for v in values)>=white*.8:
            raise RuntimeError('COLOR_0 is exporter white fallback rather than authored fracture pigment')
    # Preserve the exact production identity/semantic metadata. Only measured
    # geometry/provenance fields change for this candidate.
    exported['asset']['extras']=doc['asset']['extras']
    extras=exported['asset']['extras'];extras['triangleCount']=sum(v['triangles'] for v in lods.values())
    extras['spacefaceAsset']['lodTriangles']={k:v['triangles'] for k,v in lods.items()}
    extras['sourceProvenance']['geometryPipeline']='tools/blender/helios_remaster/geology.py'
    extras['sourceProvenance']['sourceBlend']='assets/ships/parts/blender/place_asteroid_seamed_authored.blend'
    extras['sourceProvenance']['baseTexturePipeline']=extras['sourceProvenance']['texturePipeline']
    extras['sourceProvenance']['texturePipeline']='tools/blender/helios_remaster/geology.py'
    extras['sourceProvenance']['baseSourceSha256']=SOURCE_SHA256
    extras['sourceProvenance']['baseSourceRevision']=SOURCE_REVISION
    extras['sourceProvenance'].pop('acceptedCandidateSha256',None)
    # Blender XYZ -> glTF XZY with Y sign changed.
    dims=[after['max'][i]-after['min'][i] for i in range(3)]
    extras['boundsDimensionsM']=[dims[0],dims[2],dims[1]]
    restore_scene_metadata(exported,doc)
    write_glb(out,exported,binary)
    for o in meshes:o.hide_render=int(o.get('spaceface.lodLevel',-1))!=0;o.hide_set(o.hide_render)
    for area in bpy.context.screen.areas:
        if area.type=='VIEW_3D':area.spaces.active.shading.type='MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'place_asteroid_seamed.blend'))
    report={'assetId':'place_asteroid_seamed','source':str(SOURCE.relative_to(ROOT)), 'sourceSha256':SOURCE_SHA256,
        'sourceRevision':SOURCE_REVISION,
        'candidate':str(out.relative_to(ROOT)),'candidateSha256':sha(out),'bytes':out.stat().st_size,
        'builderSha256':sha(__file__),'sourceLods':lod_before,'lods':lods,'changes':changes,'materials':materials,
        'boundsBlender':{'source':before,'candidate':after},'fixedMarkers':fixed,'markerContract':'unchanged',
        'collisionContract':'simulation radius and scan landmarks unchanged; source has no separate collision mesh',
        'review':'pending root runtime review'}
    (OUT/'place_asteroid_seamed.json').write_text(json.dumps(report,indent=2,default=json_value)+'\n')
    print('GEOLOGY_CANDIDATE '+json.dumps({'sha256':sha(out),'lods':lods,'bytes':out.stat().st_size}),flush=True)

def inspect():
    return {'source': str(SOURCE.relative_to(ROOT)), 'sourceSha256': sha(INPUT_SOURCE),
        'objects': [{'name': o.name, 'type': o.type, 'extras': dict(o.items()),
            'matrix': [list(row) for row in o.matrix_world],
            **({'bounds': bounds([o]), 'triangles': triangles(o),
                'materials': [m.name for m in o.data.materials]} if o.type == 'MESH' else {})}
            for o in bpy.data.objects],
        'materials': [{'name': m.name, 'extras': dict(m.items()),
            'nodes': [{'name': n.name, 'type': n.type,
                **({'image': n.image.name, 'size': list(n.image.size)} if n.type == 'TEX_IMAGE' and n.image else {})}
                for n in m.node_tree.nodes]} for m in bpy.data.materials]}

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--inspect', action='store_true')
    p.add_argument('--repair-scene',action='store_true')
    args = p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True, exist_ok=True)
    if args.repair_scene:
        repair_candidate_scene();sys.exit(0)
    import_source()
    (OUT/'source-inspection.json').write_text(json.dumps(inspect(), indent=2, default=json_value)+'\n')
    print('GEOLOGY_INSPECTED '+str(OUT/'source-inspection.json'), flush=True)
    if not args.inspect: build()
