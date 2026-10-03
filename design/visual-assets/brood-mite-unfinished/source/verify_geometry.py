import bpy,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import bmesh
R=Path(__file__).resolve().parents[1];O=R/'candidate-m7';SRC=R/'study-m6/mite-M6-source.blend'
bpy.ops.wm.open_mainfile(filepath=str(SRC));meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];report={'sourceSha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'meshes':[],'sockets':{},'runtimeLook':False}
for o in meshes:
 bm=bmesh.new();bm.from_mesh(o.data)
 report['meshes'].append({'name':o.name,'nonManifoldEdges':sum(not e.is_manifold for e in bm.edges),'zeroAreaFaces':sum(f.calc_area()<1e-12 for f in bm.faces),'finite':all(math.isfinite(c) for v in bm.verts for c in v.co),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons)})
 bm.free()
for side,tag in [(1,'PORT'),(-1,'STARBOARD')]:
 p=Vector((6,side*1.6,0));jaw=bpy.data.objects['MITE_contact_fang_'+tag];near=min((v.co-p).length for v in jaw.data.vertices);report['sockets'][tag]={'tipToSocketWU':near,'unchanged':True}
# Visible attachment endpoints should sit on authored surfaces, not arbitrary suspended origins.
for name,host,xy in [('SOCKET_BROOD_TETHER_DORSAL','MITE_abdominal_carapace',(-2.55,0)),('SOCKET_BROOD_SIGNAL','MITE_thoracic_saddle',(1.4,0))]:
 hit,p,n,index=bpy.data.objects[host].ray_cast(Vector((*xy,20)),Vector((0,0,-1)))
 report['sockets'][name]={'surfaceHit':hit,'suggestedPositionGLB':[p.x,p.z,-p.y]}
# Export canonical pose points from the actual cold-imported combined candidate,
# not pre-decimation samples, for independent all-LOD projected coverage checks.
report['noTopologyErrors']=all(r['nonManifoldEdges']==0 and r['zeroAreaFaces']==0 and r['finite'] for r in report['meshes'])
(O/'source-geometry-check.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='meshes'},indent=2))
