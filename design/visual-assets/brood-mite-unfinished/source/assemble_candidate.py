"""Assemble isolated review tiers, preserve identity/pivots/sockets, no publication."""
import bpy,sys,json,hashlib,struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
R=Path(__file__).resolve().parents[1];O=R/'candidate-m7';sys.path.insert(0,str(__import__('forge_paths').forge_root()));import forge_export as E
bpy.ops.wm.read_factory_settings(use_empty=True)
root=E._root_empty('SF_BROOD_MITE_V01_ROOT',{'review_only':True,'runtime_accepted':False,'pending_contract':'bounded convex-subparts proposal'})
nodes={};out=[root]
for lod in range(3):
 before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(O/f'mite-M7-LOD{lod}-review.glb'));imported=list(set(bpy.context.scene.objects)-before)
 for ob in imported:
  name=ob.name.split('.')[0]
  if name.startswith('MOTION_') or name.startswith('SOCKET_'):
   if name not in nodes:
    world=ob.matrix_world.copy();ob.name=name;ob.parent=root;ob.matrix_world=world;nodes[name]=ob;out.append(ob)
 for ob in imported:
  if ob.type!='MESH':continue
  parent=ob.parent.name.split('.')[0] if ob.parent else '';world=ob.matrix_world.copy();ob.parent=nodes.get(parent,root);ob.matrix_world=world;ob.name=ob.name.split('.')[0];out.append(ob)
 for ob in imported:
  if ob not in out:bpy.data.objects.remove(ob,do_unlink=True)
contract=json.loads((R/'contracts/proposed-mite-contract.json').read_text())
# Reseat the dorsal attachment and VFX origin on supported visible tissue;
# the two gameplay contact points are unchanged and their corrections are zero.
for name,socket in contract['sockets'].items():
 p=socket['position'];nodes[name].location=(p[0],-p[2],p[1]);nodes[name]['spaceface']={k:socket[k] for k in ['forward','role']}
# Reuse the three shared semantic materials and their two images across tiers.
materials={}
for ob in out:
 if ob.type!='MESH':continue
 for i,mat in enumerate(ob.data.materials):
  key=mat.name.split('.')[0]
  if key not in materials:materials[key]=mat
  else:ob.data.materials[i]=materials[key]
file=O/'brood_mite_v01.glb' ;E._export(out,str(file));E._stamp(str(file),{k:contract[k] for k in ['assetId','partId']},'lod0')
def stamp(doc):
 extra=doc['asset'].setdefault('extras',{});extra['reviewOnly']=True;extra['runtimeAccepted']=False
 extra['candidateContractSha256']=hashlib.sha256((R/'contracts/proposed-mite-contract.json').read_bytes()).hexdigest()
 extra['proposedBroodBody']=contract
 for mesh in doc['meshes']:
  for p in mesh['primitives']:
   assert p.get('material') is not None
E.patch_glb_json(str(file),stamp)
raw=file.read_bytes();ln=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+ln]);nodeMap={n.get('name'):n for n in doc['nodes']}
motion=json.loads((R/'contracts/frozen-mite-motion.json').read_text());motion['sourceGlbSha256']=hashlib.sha256(raw).hexdigest()
for bind in motion['bindings']:
 n=nodeMap[bind['node']];bind['restPose']={'translation':n.get('translation',[0,0,0]),'rotation':n.get('rotation',[0,0,0,1]),'scale':n.get('scale',[1,1,1])}
(O/'brood-mite.motion.json').write_text(json.dumps(motion,indent=1)+'\n')
(O/'assembly.json').write_text(json.dumps({'reviewOnly':True,'runtimeAccepted':False,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'nodes':list(nodeMap),'materials':[m['name'] for m in doc['materials']],'images':len(doc.get('images',[])),'motionSha256':hashlib.sha256((O/'brood-mite.motion.json').read_bytes()).hexdigest(),'collisions':'Separate explicit convex proposal; no unsupported render-only collision interpretation exported as production'},indent=2))
