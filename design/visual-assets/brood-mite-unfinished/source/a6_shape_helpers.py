"""Authoring helpers for the A6 rigid shell and anatomical cutting blades."""
import bpy,bmesh,math
from mathutils import Vector

def roof_shell(name,sections,cell,make_mesh,catmull,material='clay'):
 # x, half width, base height, crown height. A single keeled exoskeletal plate:
 # long flanks, one dorsal crest, a real thickness and a downturned peripheral rim.
 sections=catmull(sections,5)
 profile=[(-1,0),(-.93,.13),(-.74,.43),(-.39,.70),(-.15,.86),(-.055,1.045),(0,.94),(.055,1.045),(.15,.86),(.39,.70),(.74,.43),(.93,.13),(1,0)]
 n=len(profile);nr=len(sections);vs=[];fs=[]
 for under in [False,True]:
  for x,w,z,h in sections:
   for u,v in profile:
    vs.append((x,max(.003,w)*u,z+max(.003,h)*v-(.085 if under else 0)))
 for base in [0,n*nr]:
  for i in range(nr-1):
   for j in range(n-1):
    a=base+i*n+j;fs.append((a,a+1,a+n+1,a+n))
 off=n*nr
 for i in range(nr-1):
  for j in [0,n-1]:
   a=i*n+j;b=(i+1)*n+j;fs.append((a,b,b+off,a+off))
 for r in [0,nr-1]:
  for j in range(n-1):
   a=r*n+j;fs.append((a,a+off,a+1+off,a+1))
 ob=make_mesh(name,vs,fs,cell,material);ob['a6_rigid_carapace']=True;ob['profile_stations']=nr;ob['profile_width_vertices']=n
 return ob

def cutting_blade(name,pts,side,cell,make_mesh,catmull,material='clay'):
 # Lenticular cutting edge toward the mouth, a thicker dorsal outer back,
 # and broad planar flanks. Different from the former oval/tusk section.
 rows=catmull(pts,7)
 profile=[(-1,0),(-.85,.055),(-.38,.40),(.32,.90),(.65,.91),(.89,.67),(1,.30),(.94,-.12),(.56,-.37),(-.28,-.23),(-.84,-.055)]
 n=len(profile);vs=[];fs=[]
 for i,(x,y,z,w,h) in enumerate(rows):
  a=Vector(rows[max(i-1,0)][:3]);b=Vector(rows[min(i+1,len(rows)-1)][:3]);t=(b-a).normalized();cross=Vector((-t.y,t.x,0)).normalized()*side
  for u,v in profile:
   p=Vector((x,y,z))+cross*(max(.002,w)*u);p.z+=max(.002,h)*v;vs.append(p)
 for i in range(len(rows)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
 fs.append(tuple(reversed(range(n))));fs.append(tuple((len(rows)-1)*n+j for j in range(n)))
 ob=make_mesh(name,vs,fs,cell,material);ob['a6_cutting_blade']=True;ob['jaw_ring_size']=n;ob['jaw_sections']=len(rows);ob['jaw_root_sections']=max(2,round((len(rows)-1)*.25))
 return ob
