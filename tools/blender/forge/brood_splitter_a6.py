"""Frozen Splitter A6 source-to-Forge exporter.

Editable artist-authored inputs are hash checked before import. The source seal
binds this file and therefore every input digest, plus the canonical body map.
Runtime jaw presentation remains static until fixed/animated collision agrees.
"""
import sys,json,hashlib,math,copy
from pathlib import Path
import bpy,bmesh
from mathutils import Matrix,Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE))
import forge as F,forge_export as E,brood_kit as K,motion
from animations.motion_bank import blender_local_to_gltf
INPUTS=[{'file': 'splitter-A6-LOD0-editable.blend', 'sha256': '156583b7a3baf32cf24f47aad0a52fa7dcb356ea61cd0053e8e460bcf29812e5'}, {'file': 'splitter-A6-LOD1-editable.blend', 'sha256': '2adb694c6957a3655c023c3d634019a9ff29e02cc0bbafb8a2763b9d157621f5'}, {'file': 'splitter-A6-LOD2-editable.blend', 'sha256': 'a7831a9a91069e6db75404b05ab00972023aa0e5eb4c64634fe6ab753a762ad7'}]
BODY_MAP_SHA256='5ecea300388c13b524887cfb6aed837d01a7d054a0e77c0380d021577ba5e541'
DATA=HERE/'source_assets/splitter_a6'
def checked(path,digest):
 if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('Unsealed authored input '+str(path))
 return path

def build_tier(lod,cell=None,center=(0,0,0),yaw=0):
 row=INPUTS[lod];path=checked(DATA/row['file'],row['sha256'])
 with bpy.data.libraries.load(str(path),link=False) as (src,dst):dst.objects=src.objects
 obs=[]
 # Child coordinates are inverse source heading about planar COM. Z-up source
 # maps to runtime (x,z,-y), so runtime inverse yaw becomes Blender +yaw.
 transform=Matrix.Rotation(yaw,4,'Z')@Matrix.Translation(Vector((-center[0],center[2],0)))
 for ob in dst.objects:
  if ob is None:continue
  if ob.type!='MESH' or not ob.get('anatomical_cell') or (cell and ob['anatomical_cell']!=cell):
   bpy.data.objects.remove(ob,do_unlink=True);continue
  bpy.context.scene.collection.objects.link(ob)
  if ob.data.shape_keys:raise ValueError('Runtime cannot carry preview morphs')
  ob.data=ob.data.copy();ob.data.transform(transform@ob.matrix_world);ob.matrix_world=Matrix.Identity(4);obs.append(ob)
 return obs

def animation_descriptor(body):
 # Existing shared conversion is authoritative; there are no playback tracks.
 return {'presentation':'static-rest','timingOwner':'src/data/broodAttackProfiles.js','rigs':body['motion']['rigs'],'identityBasis':blender_local_to_gltf(Matrix.Identity(4))}

def export_body(body,out):
 bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
 root=E._root_empty(body['assetId']+'_ROOT',{})
 cell=body.get('sourceCell');bind=body.get('parentBind',{});center=bind.get('center',[0,0,0]);yaw=bind.get('yaw',0)
 cells=[cell] if cell else ['axial','port','starboard'];parts={};pivots={};mats={}
 for c in cells:
  ob=E._root_empty('PART_SPLITTER_'+c.upper(),{'anatomical_cell':c});ob.parent=root;parts[c]=ob
 if 'axial' in cells:
  for side,label in [(1,'PORT'),(-1,'STARBOARD')]:
   point=Matrix.Rotation(yaw,4,'Z')@Vector((1.49-center[0],side*1.36+center[2],-.18))
   ob=E._root_empty('MOTION_SPLITTER_JAW_'+label,{'rigid':True,'presentation':'static-rest','pose_open_radians':side*.52,'pose_closed_radians':-side*.115});ob.parent=parts['axial'];ob.location=point;pivots[side]=ob
 for lod in range(3):
  obs=build_tier(lod,cell,center,yaw)
  for ob in obs:
   for i,mat in enumerate(ob.data.materials):
    key=mat.get('forgeKey',mat.name.split('.')[0])
    if key not in mats:
     mats[key]=mat;mat['forgeShip']=body['id']
    ob.data.materials[i]=mats[key]
  for c in cells:
   static=[o for o in obs if o['anatomical_cell']==c and 'axial_mandible' not in o.name]
   for ob in E._join_named(static,0,'LOD'+str(lod)+'_'+c.upper()):ob.parent=parts[c];ob['anatomical_cell']=c
  for orig in [o for o in obs if 'axial_mandible' in o.name]:
   # Blender may append .001 when loading subsequent tiers; the source side tag
   # is the exact terminal _1 or _-1 before that uniqueness suffix.
   base=orig.name.split('.')[0];side=-1 if base.endswith('_-1') else 1;label='PORT' if side==1 else 'STARBOARD'
   orig.name='LOD'+str(lod)+'_JAW_'+label;orig.parent=pivots[side]
   for v in orig.data.vertices:v.co-=pivots[side].location
   orig.location=(0,0,0);orig['anatomical_cell']='axial'
  for ob in [o for o in obs if 'axial_mandible' not in o.name and not o.name.startswith('LOD')]:bpy.data.objects.remove(ob,do_unlink=True)
 for name,socket in body['sockets'].items():
  ob=E._root_empty(name,{'socket':True,'spaceface':{'socket':True,'role':socket['role'],'forward':socket['forward']}});ob.parent=root;ob.location=K.pos(socket['position'])
 for p in body['collision']['primitives']:
  if p['kind']!='convex':raise ValueError('Only frozen authored convex prisms')
  lo=body['collision']['yMin'];hi=body['collision']['yMax'];poly=p['vertices'];n=len(poly)
  vs=[K.pos((x,y,z)) for y in (lo,hi) for x,z in poly];faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
  me=bpy.data.meshes.new('Collision_'+p['id']);me.from_pydata(vs,[],faces);me.update();bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();ob=bpy.data.objects.new('COLLISION_'+p['id'],me);scene.collection.objects.link(ob);ob.parent=root;ob.hide_render=True;ob['collision']=True;ob['nonRender']=True;ob['spaceface']={'collision':True,'nonRender':True,'shape':'convex','compoundMember':p['id']}
 filename=out/(body['id']+'_v01.glb');E._export([root]+list(root.children_recursive),str(filename));E._stamp(str(filename),{k:body[k] for k in ('assetId','partId')},'lod0')
 descriptor=animation_descriptor(body);certificate={**copy.deepcopy(body),**K.source_seal(body,__file__,build_tier,animation_descriptor)}
 def stamp(doc):
  certificate['surfaceTreatment']={'schema':'brood-chitin-lamella-v1','sharedImages':['BroodChitin_Normal_v1','BroodChitin_ORM_v1'],'tileWU':4,'maxHeightWU':.0052,'normalStrength':.8,'albedoTexture':False}
  targets=[doc['asset'],doc['scenes'][doc.get('scene',0)],next(n for n in doc['nodes'] if n.get('name')==root.name)]
  factor=[m['name'] for m in doc.get('materials',[]) if not m.get('normalTexture') and not m.get('pbrMetallicRoughness',{}).get('metallicRoughnessTexture')]
  for t in targets:
   ex=t.setdefault('extras',{});ex['broodBody']=certificate;ex['spacefaceAsset']['factorOnlyMaterials']=factor
  for node in doc['nodes']:
   if node.get('name','').startswith('COLLISION_'):node.setdefault('extras',{})['nonRender']=True
 doc=E.patch_glb_json(str(filename),stamp)
 stats={'id':body['id'],'sha256':hashlib.sha256(filename.read_bytes()).hexdigest(),'bytes':filename.stat().st_size,'materials':len(doc.get('materials',[])),'images':len(doc.get('images',[])),'trianglesByLod':[],'drawsByLod':[],'collisionPrimitives':len(body['collision']['primitives']),'motion':descriptor,'sourceSha256':certificate['sourceSha256'],'geometryContractSha256':certificate['geometryContractSha256']}
 for lod in range(3):
  ps=[p for n in doc['nodes'] if n.get('name','').startswith('LOD'+str(lod)+'_') and 'mesh' in n for p in doc['meshes'][n['mesh']]['primitives']]
  stats['trianglesByLod'].append(sum(doc['accessors'][p['indices']]['count']//3 for p in ps));stats['drawsByLod'].append(len(ps))
 return stats

if __name__=='__main__':
 checked(DATA/'splitter-A6-finished-source.blend','a9371077b518747467bfef18b7f95bb9bfc85644936451dd2d2c832989b2870e');checked(DATA/'body-map.json',BODY_MAP_SHA256);bodies=json.loads((DATA/'body-map.json').read_text());out=ROOT/'assets/ships/parts/wholeships';out.mkdir(parents=True,exist_ok=True)
 reports=[export_body(b,out) for b in bodies.values()];evidence=ROOT/'evidence';evidence.mkdir(exist_ok=True);(evidence/'source-export-receipt.json').write_text(json.dumps(reports,indent=2));print(json.dumps(reports,indent=2))
