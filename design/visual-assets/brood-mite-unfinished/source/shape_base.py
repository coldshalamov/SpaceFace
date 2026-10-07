"""Splitter R2 primary anatomy studies, original authored meshes. No runtime export.
Blender coordinates +X forward +Y port +Z dorsal. All visible tissue belongs to
one of three pre-existing cells; there is no spare core or spawned geometry.
"""
import bpy,bmesh,math,sys,json,hashlib
from mathutils import Vector,Matrix
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from forge_paths import forge_root
FORGE=forge_root()
sys.path.insert(0,str(FORGE));import forge as F

def catmull(ps,n=5):
 out=[]
 for i in range(len(ps)-1):
  a=Vector(ps[max(i-1,0)]);b=Vector(ps[i]);c=Vector(ps[i+1]);d=Vector(ps[min(i+2,len(ps)-1)])
  for j in range(n):
   t=j/n;out.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
 out.append(tuple(ps[-1]));return out

def make_mesh(name,vs,fs,cell,mat='clay'):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob)
 ob.data.materials.append(MATS[mat]);ob['anatomical_cell']=cell
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free()
 for p in me.polygons:p.use_smooth=True
 return ob

def body(name,secs,cell,mat='clay',rib=0,n=40):
 # Authored changing sections (x,y,zc,width,dorsal,ventral), pointed keel + broad shouldered arch.
 rows=catmull(secs,4);vs=[];fs=[]
 for k,(x,y,z,w,ht,hb) in enumerate(rows):
  w=max(.002,w);ht=max(.002,ht);hb=max(.002,hb)
  for j in range(n):
   a=2*math.pi*j/n;c=math.cos(a);sn=math.sin(a)
   yy=w*c;zz=ht*max(0,sn)**.72 if sn>=0 else -hb*(-sn)**.86
   if sn>0:zz+=rib*max(0,1-abs(c)*4)**2*math.sin(math.pi*k/(len(rows)-1))
   vs.append((x,y+yy,z+zz))
 for i in range(len(rows)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
 fs.append(tuple(reversed(range(n))));fs.append(tuple((len(rows)-1)*n+j for j in range(n)))
 return make_mesh(name,vs,fs,cell,mat)

def blade(name,pts,cell,mat='clay',n=16):
 # Curved sickle/suture with an asymmetrical lenticular section, never a round hose.
 rows=catmull(pts,6);vs=[];fs=[]
 for i,(x,y,z,w,h) in enumerate(rows):
  p=Vector(rows[max(0,i-1)][:3]);q=Vector(rows[min(len(rows)-1,i+1)][:3]);t=(q-p).normalized();side=Vector((-t.y,t.x,0)).normalized()
  for j in range(n):
   a=2*math.pi*j/n;v=Vector((x,y,z))+side*(max(.002,w)*math.cos(a));v.z+=max(.002,h)*math.sin(a)*(1 if math.sin(a)>=0 else .48);vs.append(v)
 for i in range(len(rows)-1):
  for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
 fs.append(tuple(reversed(range(n))));fs.append(tuple((len(rows)-1)*n+j for j in range(n)))
 return make_mesh(name,vs,fs,cell,mat)

def transform(obs,pos=(0,0,0),scale=1,angle=0):
 R=Matrix.Rotation(angle,4,'Z');T=Matrix.Translation(Vector(pos));S=Matrix.Diagonal((scale,scale,scale,1));m=T@R@S
 for o in obs:
  for v in o.data.vertices:v.co=m@v.co

