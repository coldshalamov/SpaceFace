"""Feature-aware LOD candidates. No source/manifests outside this task are written."""
import bpy,json,sys,struct,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from mathutils import Vector
R=Path(__file__).resolve().parents[1];SRC=R/'study-m6/mite-M6-source.blend';O=R/'candidate-m7';O.mkdir(exist_ok=True)
sys.path.insert(0,str(__import__('forge_paths').forge_root()));import forge as F,forge_export as E,brood_kit as K
summary=[]
for lod in [0,1,2]:
 bpy.ops.wm.open_mainfile(filepath=str(SRC));scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH'];rows=[]
 for o in meshes:
  before=sum(len(p.vertices)-2 for p in o.data.polygons)
  ratio=[.20,.090,.048][lod]
  if 'cheliceral_muscle' in o.name:ratio=[.20,.13,.12][lod]
  if 'contact_fang' in o.name:ratio=[.33,.17,.08][lod]
  if 'thoracic_saddle' in o.name or 'abdominal_carapace' in o.name:ratio=[.24,.11,.055][lod]
  protected=[]
  if 'contact_fang' in o.name:protected=[v.index for v in o.data.vertices if v.co.x>5.98]
  if 'continuous_ventral' in o.name:
   # Preserve six actual mouth boundary landmarks, not every high-resolution
   # Boolean loop; topology-preserving collapse retains the continuous cavity.
   targets=[(1.9,.47,-.2),(1.9,-.47,-.2),(1.9,0,-.46),(1.4,0,-.4),(1.12,1.48,-.06),(1.12,-1.48,-.06),(1.4,1.20,-.09),(1.4,-1.20,-.09)]
   protected=list({min(o.data.vertices,key=lambda v:(v.co-Vector(t)).length).index for t in targets})
  if o.get('a6_rigid_carapace'):
   # Preserve the two-sheet shell and geometric dorsal seam explicitly. Generic
   # collapse can fold one thin wall through the other, even at a low count.
   nr=int(o['profile_stations']);n=int(o['profile_width_vertices'])
   select_rows=sorted({round(i*(nr-1)/([11,6,7][lod])) for i in range([12,7,8][lod])})
   js=[0,1,3,5,6,7,9,11,12] if lod==0 else [0,2,5,6,7,10,12]
   m=len(js);r=len(select_rows);fs=[]
   if lod==0:
    vs=[o.data.vertices[under*nr*n+i*n+j].co.copy() for under in range(2) for i in select_rows for j in js]
    for base in [0,r*m]:
     for i in range(r-1):
      for j in range(m-1):
       k=base+i*m+j;fs.append((k,k+1,k+m+1,k+m))
    for i in range(r-1):
     for j in [0,m-1]:
      k=i*m+j;l=(i+1)*m+j;fs.append((k,l,l+r*m,k+r*m))
    for i in [0,r-1]:
     for j in range(m-1):
      k=i*m+j;fs.append((k,k+r*m,k+1+r*m,k+1))
   else:
    # Outer authored roof is untouched; the hidden inner ceiling is one strip
    # per longitudinal station. A single closed solid, no crossing thin walls.
    vs=[o.data.vertices[i*n+j].co.copy() for i in select_rows for j in js]
    for i in select_rows:
     vs.extend([o.data.vertices[nr*n+i*n].co.copy(),o.data.vertices[nr*n+i*n+n-1].co.copy()])
    for i in range(r-1):
     for j in range(m-1):
      k=i*m+j;fs.append((k,k+1,k+m+1,k+m))
     a=r*m+2*i;b=a+2;fs.append((a,b,b+1,a+1))
     fs.append((i*m,(i+1)*m,b,a));fs.append((i*m+m-1,a+1,b+1,(i+1)*m+m-1))
    for row in [0,r-1]:fs.append(tuple([row*m+j for j in range(m)]+[r*m+2*row+1,r*m+2*row]))
   oldmesh=o.data;me=bpy.data.meshes.new(o.name+'_authoredLOD');me.from_pydata(vs,[],fs);me.update();o.data=me
   for mat in oldmesh.materials:me.materials.append(mat)
   import bmesh
   bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
   if lod>0:
    inner=[e for e in bm.edges if len(e.link_faces)==2 and all(f.normal.z<-.2 for f in e.link_faces)]
    bmesh.ops.dissolve_limit(bm,angle_limit=.00001,verts=list(bm.verts),edges=inner,use_dissolve_boundaries=False)
   bm.to_mesh(me);bm.free()
   o['forge_bevel']=0;o['forge_smooth']=70;o['forge_uv_scale']=1;F.finish_object(o)
   if o.data.has_custom_normals:
    bpy.context.view_layer.objects.active=o;bpy.ops.mesh.customdata_custom_splitnormals_clear()
   for e in o.data.edges:e.use_edge_sharp=False
  else:
   mod=o.modifiers.new('Feature-aware LOD','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
   if protected:
    group=o.vertex_groups.new(name='Protect contact tips and lumen');group.add(protected,1,'REPLACE');mod.vertex_group=group.name;mod.invert_vertex_group=True;mod.vertex_group_factor=1
   bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  after=sum(len(p.vertices)-2 for p in o.data.polygons)
  for p in o.data.polygons:p.use_smooth=True
  o.data.update();rows.append({'name':o.name,'before':before,'after':after,'protectedVertices':len(protected)})
 # Seat flexible/support tissue under the actual simplified roof after collapse.
 # The roof is authoritative; it never grows bumps to follow underlying parts.
 if lod>=0:
  bpy.context.view_layer.update()
  roofs=[bpy.data.objects['MITE_abdominal_carapace'],bpy.data.objects['MITE_thoracic_saddle']]
  for ob in meshes:
   if not any(k in ob.name for k in ['continuous_ventral','hip_collar','fin_femur']):continue
   inv=ob.matrix_world.inverted()
   for v in ob.data.vertices:
    p=ob.matrix_world@v.co
    for roof in roofs:
     hit,co,normal,index=roof.ray_cast(Vector((p.x,p.y,20)),Vector((0,0,-1)))
     if hit and p.z>co.z-.18:p.z=co.z-.18
    v.co=inv@p
   ob.data.update()
 # Remove only hidden dorsal volume from the flexible under-shell core; this
 # prevents interpolated low-poly faces from crossing a curved hard shell.
 for ob in meshes:
  if 'continuous_ventral' in ob.name:
   for v in ob.data.vertices:
    if v.co.x<-.7 and v.co.z>.06:v.co.z=.06
  if 'cheliceral_muscle' in ob.name:
   for v in ob.data.vertices:
    if v.co.z>-.15:v.co.z=-.15
  ob.data.update()
 bpy.ops.wm.save_as_mainfile(filepath=str(O/f'mite-M7-LOD{lod}-editable.blend'))
 out=[];root=E._root_empty('SF_BROOD_MITE_V01_ROOT',{'review_only':True,'source_axes':'+X forward,+Y up,+Z starboard','lod':lod});out.append(root)
 static=[o for o in meshes if not o.parent]
 for ob in E._join_named(static,0,f'LOD{lod}_BODY'):ob.parent=root;out.append(ob)
 for tag in ['PORT','STARBOARD']:
  pivot=bpy.data.objects['MOTION_MITE_MEMBRANE_'+tag];pivot.parent=root;out.append(pivot)
  group=[o for o in meshes if o.parent==pivot]
  for ob in E._join_named(group,0,f'LOD{lod}_MOTION_MITE_MEMBRANE_{tag}'):
   # All joined pieces share the same pivot parent, so their local mesh frame is already correct.
   ob.parent=pivot;ob.location=(0,0,0)
   out.append(ob)
 for ob in list(scene.objects):
  if ob.name.startswith('SOCKET_'):ob.parent=root;out.append(ob)
 glb=O/f'mite-M7-LOD{lod}-review.glb';E._export(out,str(glb))
 raw=glb.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);acc=doc['accessors'];draws=sum(len(m['primitives']) for m in doc.get('meshes',[]))
 summary.append({'lod':lod,'triangles':sum(acc[p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives']),'draws':draws,'materials':len(doc['materials']),'images':len(doc.get('images',[])),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'sourceSha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'parts':rows})
(O/'lod-stats.json').write_text(json.dumps(summary,indent=2));print(json.dumps([{k:v for k,v in r.items() if k!='parts'} for r in summary],indent=2))
