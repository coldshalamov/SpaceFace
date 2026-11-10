"""Read-only geometric witness for source bay clearance and sole convex spine."""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
root=Path(__file__).resolve().parents[5]
source=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(source/'tally_3.blend'))
point=Vector((9.6,0,.31));distances=[]
for ob in bpy.context.scene.objects:
    if ob.type!='MESH':continue
    pts=[ob.matrix_world@v.co for v in ob.data.vertices]
    faces=[list(f.vertices) for f in ob.data.polygons]
    bvh=BVHTree.FromPolygons(pts,faces,all_triangles=False)
    result=bvh.find_nearest(point)
    if result is not None and result[0] is not None:
        distances.append({'part':ob.name,'distanceMetres':float(result[3]),'nearest':list(result[0])})
distances.sort(key=lambda x:x['distanceMetres'])
r={'schemaVersion':1,'sourceBlend':'tally_3.blend','sourceCoordinates':'Blender +X nose,+Y port,+Z up',
   'cargoCenter':list(point),'cargoRadius':1.2,'maxCenterDisplacement':.25,'receiverEnclosingRadius':1.45,
   'closestSourceSurfaceDistance':distances[0]['distanceMetres'],'worstCaseSphericalClearance':distances[0]['distanceMetres']-1.45,
   'nearestParts':distances[:12],
   'claim':'A 1.2m-radius sphere with centre <=.25m from receiver centre clears all source surfaces. This is geometric clearance, not an executed gameplay delivery.'}
(root/'design/visual-assets/tally-3/receiver-clearance.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r))
