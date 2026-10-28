"""Explicit material-only visual derivative; immutable geometry authorship is retained.
Run only after resource/identity review: blender -b -t 2 --python this_file.
The historical generator, physical source certificates and save identities are NEVER rewritten.
"""
import copy, hashlib, json, struct, os
from pathlib import Path
import bpy
from mathutils import Vector, Matrix
H = Path(__file__).resolve().parent
W = H.parent
BASE = W/'mile-receiving-1836/projection'
OUT = H/'visual-source'
OLD_HEX, NEW_HEX = '#82715a', '#b2a084'

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def linear(h):
    rgb = [int(h[i:i+2],16)/255 for i in (1,3,5)]
    return [struct.unpack('<f',struct.pack('<f',v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4))[0] for v in rgb]+[1.0]
def read_glb(p):
    b=Path(p).read_bytes()
    magic,ver,total=struct.unpack_from('<III',b)
    assert (magic,ver,total)==(0x46546c67,2,len(b))
    n,t=struct.unpack_from('<II',b,12);assert t==0x4e4f534a
    return json.loads(b[20:20+n]),b[20+n:]
def write_glb(p,d,tail):
    data=json.dumps(d,separators=(',',':')).encode();data+=b' '*((-len(data))%4)
    Path(p).write_bytes(struct.pack('<IIIII',0x46546c67,2,20+len(data)+len(tail),len(data),0x4e4f534a)+data+tail)
def plain(value):
    # Freeze snapshots as builtins before comparison/digest; reject unknown RNA pointers.
    if value is None or isinstance(value,(str,bool,int,float)):return value
    if isinstance(value,dict):return {k:plain(v) for k,v in value.items()}
    if isinstance(value,(list,tuple,Vector,Matrix)):return [plain(v) for v in value]
    if isinstance(value,set):return sorted(plain(v) for v in value)
    raise TypeError('Unsupported snapshot value: '+type(value).__name__)

def rna_scalars(value):
    result={}
    for prop in value.bl_rna.properties:
        if prop.identifier=='rna_type' or prop.is_readonly or prop.type not in ('BOOLEAN','INT','FLOAT','STRING','ENUM'):continue
        v=getattr(value,prop.identifier)
        result[prop.identifier]=list(v) if getattr(prop,'is_array',False) else sorted(v) if isinstance(v,set) else v
    return plain(result)

def material_snapshot():
    result={}
    for mat in list(bpy.data.materials)+list(bpy.data.node_groups):
        nodes={};links=[]
        tree=mat.node_tree if hasattr(mat,'node_tree') else mat
        if tree:
            for n in tree.nodes:
                nodes[n.name]={'type':n.bl_idname,'properties':rna_scalars(n),
                  'customProperties':n.id_properties_ensure().to_dict(),
                  'image':n.image.name if hasattr(n,'image') and n.image else None,
                  'group':n.node_tree.name if hasattr(n,'node_tree') and n.node_tree else None,
                  'inputs':[rna_scalars(x) for x in n.inputs],
                  'outputs':[rna_scalars(x) for x in n.outputs]}
            for link in tree.links:
                links.append([link.from_node.name,list(link.from_node.outputs).index(link.from_socket),
                              link.to_node.name,list(link.to_node.inputs).index(link.to_socket)])
        result[mat.name]={'properties':rna_scalars(mat),'customProperties':mat.id_properties_ensure().to_dict(),
          'nodes':nodes,'links':sorted(links)}
    return plain(result)

def snapshot():
    # No modifiers, shape keys, animation or constraints are supported by this material-only recipe.
    assert not bpy.data.actions and not bpy.data.shape_keys
    for o in bpy.data.objects:
        assert o.type in ('MESH','EMPTY'),(o.name,o.type)
        assert not o.modifiers and not o.constraints and o.animation_data is None,o.name
    for block in list(bpy.data.materials)+list(bpy.data.node_groups)+list(bpy.data.meshes):
        assert block.animation_data is None,block.name
    meshes={} 
    for m in bpy.data.meshes:
        assert m.shape_keys is None,m.name
        meshes[m.name]={'vertices':[list(v.co) for v in m.vertices],
          'edges':[list(e.vertices) for e in m.edges],
          'loops':[(l.vertex_index,l.edge_index) for l in m.loops],
          'cornerNormals':[list(n.vector) for n in m.corner_normals],
          'vertexNormals':[list(v.normal) for v in m.vertices],
          'attributes':{a.name:{'type':a.data_type,'domain':a.domain,'values':[rna_scalars(x) for x in a.data]} for a in m.attributes},
          'properties':rna_scalars(m),'customProperties':m.id_properties_ensure().to_dict(),
          'polygons':[(list(p.vertices),p.material_index,p.use_smooth) for p in m.polygons],
          'uv':{u.name:[list(x.uv) for x in u.data] for u in m.uv_layers},
          'materials':[x.name if x else None for x in m.materials]}
    objects={o.name:{'matrix':[list(r) for r in o.matrix_world], 'type':o.type,
      'parent':o.parent.name if o.parent else None,'data':o.data.name if o.data else None,
      'properties':o.id_properties_ensure().to_dict(),'rna':rna_scalars(o)} for o in bpy.data.objects}
    images={i.name:hashlib.sha256(i.packed_file.data).hexdigest() for i in bpy.data.images if i.packed_file}
    return plain({'meshes':meshes,'objects':objects,'packedImages':images})
def main():
    (H/'child-source.pid').write_text(str(os.getpid()))
    assert tuple(bpy.app.version)==(4,3,2),bpy.app.version_string
    assert not OUT.exists(),'Do not overwrite a previous generation'
    pins=json.loads((H/'BASELINE-PINS.json').read_text())
    for r in pins: assert sha(W/r['provider'])==r['sha256'],r['provider']
    src=BASE/'assets/ships/forge/sources/hundred_hand_mile/hundred_hand_guide'
    original_blend=src/'hundred_hand_guide.blend'
    bpy.ops.wm.open_mainfile(filepath=str(original_blend),use_scripts=False)
    before=snapshot();materials_before=material_snapshot();materials_expected=copy.deepcopy(materials_before)
    selected=[m for m in bpy.data.materials if m.get('forgeShip')=='hundred_hand_guide' and m.get('forgeFinish')=='paint2']
    assert len(selected)==1,[(m.name,m.get('forgeFinish')) for m in bpy.data.materials]
    mat=selected[0];assert mat.name=='Material_Armor'
    bsdfs=[n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED']
    mixes=[n for n in mat.node_tree.nodes if n.type=='MIX' and n.data_type=='RGBA' and n.blend_type=='MULTIPLY']
    assert len(bsdfs)==len(mixes)==1
    for node,sock in ((bsdfs[0],bsdfs[0].inputs['Base Color']),(mixes[0],mixes[0].inputs['A'])):
        assert all(abs(a-b)<1e-6 for a,b in zip(sock.default_value,linear(OLD_HEX)))
        sock.default_value=linear(NEW_HEX)
        materials_expected[mat.name]['nodes'][node.name]['inputs'][list(node.inputs).index(sock)]['default_value']=linear(NEW_HEX)
    assert snapshot()==before,'Material edit changed editable geometry or packed textures'
    assert material_snapshot()==materials_expected,'Unexpected material properties, shader links or socket change'
    OUT.mkdir()
    bpy.context.preferences.filepaths.save_version=0
    target_blend=OUT/'hundred_hand_guide.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(target_blend),compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(target_blend),use_scripts=False)
    assert snapshot()==before,'Native source reopening changed geometry, sockets, UVs or texture bytes'
    assert material_snapshot()==materials_expected,'Reopened material/node/link/socket state differs'
    mat=bpy.data.materials['Material_Armor']
    for n in mat.node_tree.nodes:
        if n.type=='BSDF_PRINCIPLED': assert list(n.inputs['Base Color'].default_value)==linear(NEW_HEX)
        if n.type=='MIX' and n.data_type=='RGBA': assert list(n.inputs['A'].default_value)==linear(NEW_HEX)
    rows=[]
    # Repack original exported geometry losslessly: no meshing, texture transcoding or UV changes.
    for filename in ('hundred_hand_guide.glb','hundred_hand_guide_lod1.glb','hundred_hand_guide_lod2.glb'):
        source=src/filename;d,tail=read_glb(source);before_doc=copy.deepcopy(d)
        mats=[m for m in d['materials'] if m.get('name')=='Material_Armor' and m.get('extras',{}).get('forgeFinish')=='paint2']
        assert len(mats)==1
        assert all(abs(a-b)<1e-6 for a,b in zip(mats[0]['pbrMetallicRoughness']['baseColorFactor'],linear(OLD_HEX)))
        mats[0]['pbrMetallicRoughness']['baseColorFactor']=linear(NEW_HEX)
        derivation={'schema':'spaceface.materialDerivative.v1','geometrySourceSha256':sha(source),
          'geometrySourcePath':str(source.relative_to(BASE)),'materialRecipeSha256':sha(__file__),
          'editableBlendSha256':sha(target_blend),'material':'Material_Armor','previousColor':OLD_HEX,'color':NEW_HEX,
          'scope':'visual-material-only; immutable geometry authorship and native physical identity retained'}
        d['asset'].setdefault('extras',{})['materialDerivative']=derivation
        target=OUT/filename;write_glb(target,d,tail)
        rd,rt=read_glb(target);assert rt==tail
        del rd['asset']['extras']['materialDerivative']
        next(m for m in rd['materials'] if m['name']=='Material_Armor')['pbrMetallicRoughness']['baseColorFactor']=next(m for m in before_doc['materials'] if m['name']=='Material_Armor')['pbrMetallicRoughness']['baseColorFactor']
        assert rd==before_doc,'Undeclared GLB difference'
        rows.append({'file':filename,'sourceSha256':sha(source),'sha256':sha(target),'bytes':target.stat().st_size,'binaryPayloadSha256':hashlib.sha256(tail).hexdigest()})
    certificate={'schema':'spaceface.visualMaterialSuccessor.v1','assetId':'SF_PROP_HUNDRED_HAND_GUIDE',
      'modelCountDelta':0,'status':'source exported; release/compiler/runtime review pending',
      'recipeSha256':sha(__file__),'originalBlendSha256':sha(original_blend),'successorBlendSha256':sha(target_blend),
      'originalGeometryJsonSha256':sha(BASE/'src/data/hundredHandMileGeometry.json'),
      'originalSourceBodySha256':sha(BASE/'src/data/hundredHandMileSourceV3Bodies.json'),
      'originalFamilyContractSha256':sha(src.parent/'measured-contract.json'),
      'originalGuideContractSha256':sha(src/'measured-contract.json'),
      'originalGeneratorSha256':sha(BASE/'tools/blender/forge/ships/hundred_hand_mile.py'),
      'fromHex':OLD_HEX,'toHex':NEW_HEX,'nativeBlendReopenSnapshotEqual':True,
      'materialGraphWhitelistValidated':True,
      'materialGraphBeforeSha256':hashlib.sha256(json.dumps(materials_before,sort_keys=True).encode()).hexdigest(),
      'materialGraphAfterSha256':hashlib.sha256(json.dumps(materials_expected,sort_keys=True).encode()).hexdigest(),
      'editableGeometrySnapshotSha256':hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest(),
      'sourceLods':rows,'nativeIdentityPolicy':'Original physical source path and certificates unchanged. New visual derivation only.'}
    (H/'SOURCE-DERIVATION.json').write_text(json.dumps(certificate,indent=2)+'\n')
    for r in pins: assert sha(W/r['provider'])==r['sha256'],r['provider']
if __name__=='__main__':main()
