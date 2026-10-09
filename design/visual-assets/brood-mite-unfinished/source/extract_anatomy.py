import bpy,json,sys,hashlib
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1];src=R/'study-m6/mite-M6-source.blend'
bpy.ops.wm.open_mainfile(filepath=str(src));out={'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'coordinateFrame':'GLB +X,+Y up,+Z starboard','poses':{}}
for phase,fraction in [('approach',0),('midfold',.65),('windup',1),('attack',.1),('recovery',.6)]:
 for side,label in [(1,'PORT'),(-1,'STARBOARD')]:bpy.data.objects['MOTION_MITE_MEMBRANE_'+label].rotation_euler.x=side*.3*fraction
 bpy.context.view_layer.update();rows=[]
 for o in bpy.context.scene.objects:
  if o.type!='MESH':continue
  o.data.calc_loop_triangles();v=[o.matrix_world@v.co for v in o.data.vertices]
  rows.append({'name':o.name,'moving':bool(o.parent),'verts':[[p.x,p.z,-p.y] for p in v],'triangles':[list(t.vertices) for t in o.data.loop_triangles]})
 out['poses'][phase]=rows
(R/'contracts/anatomy-m6.json').write_text(json.dumps(out,separators=(',',':')))
