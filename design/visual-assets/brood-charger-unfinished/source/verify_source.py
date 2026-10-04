import bpy,bmesh,sys,json,math,hashlib
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=R/'candidate-c6';rows=[]
for lod in range(3):
 p=O/f'charger-LOD{lod}-source.blend';bpy.ops.wm.open_mainfile(filepath=str(p));meshes=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  bm=bmesh.new();bm.from_mesh(o.data);meshes.append({'name':o.name,'triangles':sum(len(f.verts)-2 for f in bm.faces),'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'zeroAreaFaces':sum(f.calc_area()<1e-12 for f in bm.faces),'finite':all(math.isfinite(c)for v in bm.verts for c in v.co)});bm.free()
 rows.append({'lod':lod,'sourceSHA256':hashlib.sha256(p.read_bytes()).hexdigest(),'meshes':meshes,'topologyPassed':all(m['nonManifoldEdges']==0 and m['zeroAreaFaces']==0 and m['finite']for m in meshes)})
(O/'source-geometry-check.json').write_text(json.dumps(rows,indent=2));print([(r['lod'],r['topologyPassed'])for r in rows])
