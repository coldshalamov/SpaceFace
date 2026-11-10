# Portable path-only adaptation. Historical original remains untouched.
"""Single resident GLB, authored in-file tiers, material batching, exact pivots."""
import bpy,sys,os,json,hashlib,struct,math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));from context import INPUT as R,OUT as O,FORGE as F,CONTRACT;sys.path.insert(0,str(F));import forge_export as E
bpy.ops.wm.read_factory_settings(use_empty=True);root=E._root_empty('SF_BROOD_CHARGER_V01_ROOT',{'review_only':True,'runtime_accepted':False});nodes={};mats={};export=[root];stats=[]
for lod in range(3):
 before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(O/f'charger-LOD{lod}-source.glb'));obs=list(set(bpy.context.scene.objects)-before)
 for o in obs:
  name=o.name.split('.')[0]
  if name.startswith(('MOTION_','SOCKET_')):
   if name not in nodes:
    world=o.matrix_world.copy();o.name=name;o.parent=root;o.matrix_world=world;nodes[name]=o;export.append(o)
 groups={}
 for o in obs:
  if o.type!='MESH':continue
  parent=o.parent.name.split('.')[0]if o.parent else '';world=o.matrix_world.copy();o.parent=nodes.get(parent,root);o.matrix_world=world
  for i,m in enumerate(o.data.materials):
   key=m.name.split('.')[0]
   if key not in mats:mats[key]=m
   else:o.data.materials[i]=mats[key]
  groups.setdefault(parent or'Fixed',[]).append(o)
 row={'lod':lod,'groups':[],'triangles':0,'draws':0}
 for group,objects in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in objects:o.select_set(True)
  bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=f'LOD{lod}_'+group.replace('MOTION_CHARGER_','');o['lod']=lod
  # Remove unused material slots: only actual material primitives count.
  used=sorted(set(p.material_index for p in o.data.polygons));usedm=[o.data.materials[i]for i in used];remap={old:new for new,old in enumerate(used)};indices=[remap[p.material_index]for p in o.data.polygons];o.data.materials.clear()
  for m in usedm:o.data.materials.append(m)
  for p,i in zip(o.data.polygons,indices):p.material_index=i
  count=sum(len(p.vertices)-2 for p in o.data.polygons);draw=len(usedm);row['groups'].append({'node':o.name,'triangles':count,'draws':draw});row['triangles']+=count;row['draws']+=draw;export.append(o)
 for o in obs:
  try:
   if o.name in bpy.data.objects and o not in export:bpy.data.objects.remove(o,do_unlink=True)
  except ReferenceError:pass
 stats.append(row)
E._export(export,str(O/'brood_charger_v01.glb'))
E._stamp(str(O/'brood_charger_v01.glb'),{'assetId':'SF_BROOD_CHARGER_V01','partId':'wholeship_brood_charger_v01'},'lod0')
raw=(O/'brood_charger_v01.glb').read_bytes();ln=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+ln]);(O/'assembly.json').write_text(json.dumps({'glbSha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'lods':stats,'materials':[m['name']for m in doc['materials']],'images':len(doc.get('images',[])),'runtimeAccepted':False,'socketPositions':{name:[o.location.x,o.location.z,-o.location.y]for name,o in nodes.items()if name.startswith('SOCKET_')},'motionPivots':{name:[o.location.x,o.location.z,-o.location.y]for name,o in nodes.items()if name.startswith('MOTION_')}},indent=2));print(stats)
