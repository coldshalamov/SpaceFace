"""Deterministic, offline concept-blockout renderer. Not the SpaceFace Forge exporter.
Produces original reference plates and non-shipping GLB blockouts; no external media.
"""
import math, json, sys, shutil
from pathlib import Path
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT=Path(__file__).resolve().parents[1]
C=json.loads((ROOT/'data/concepts.json').read_text(encoding='utf8'))['concepts']
OUT=ROOT/'art'; (OUT/'blockouts').mkdir(exist_ok=True)
import os
FONT=os.environ.get('SF20_FONT','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
BOLD=os.environ.get('SF20_FONT_BOLD','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
def font(n,b=False): return ImageFont.truetype(BOLD if b else FONT,n)
def rgb(h): return tuple(int(h[i:i+2],16) for i in (0,2,4))
P={'ivory':rgb('bfb6a3'),'dark':rgb('252e39'),'metal':rgb('596875'),'edge':rgb('354453'),'amber':rgb('d69b3c'),'teal':rgb('49a69d'),'red':rgb('a94639'),'blue':rgb('547fa5'),'green':rgb('73994f'),'gold':rgb('b39348'),'white':rgb('d6d4c2'),'black':rgb('161e28'),'violet':rgb('84739e')}
class Model:
 def __init__(self): self.parts=[]; self.n=0
 def add(self,m,pos=(0,0,0),color='ivory',name=None,em=False,rot=0):
  m=m.copy()
  if rot: m.apply_transform(trimesh.transformations.rotation_matrix(rot,[0,0,1]))
  m.apply_translation(pos)
  co=P.get(color,color)
  m.visual.face_colors=(*co,255)
  self.n+=1
  self.parts.append((f'{name}_{self.n:03d}' if name else f'part_{self.n:03d}',m,co,em))
  return m
 def box(self,p,s,c='ivory',name=None,rot=0,em=False): return self.add(trimesh.creation.box(s),p,c,name,em,rot)
 def ell(self,p,s,c='ivory',name=None,em=False):
  m=trimesh.creation.icosphere(subdivisions=2,radius=1); m.vertices*=np.array(s)/2
  return self.add(m,p,c,name,em)
 def cyl(self,p,r,h,c='metal',name=None,axis='z',em=False,n=16):
  m=trimesh.creation.cylinder(radius=r,height=h,sections=n)
  if axis=='x': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[0,1,0]))
  if axis=='y': m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0]))
  return self.add(m,p,c,name,em)
 def plate(self,pts,z,h,c='ivory',name=None):
  n=len(pts); v=[(x,y,z) for x,y in pts]+[(x,y,z+h) for x,y in pts];f=[]
  for i in range(1,n-1): f.extend([(0,i+1,i),(n,n+i,n+i+1)])
  for i in range(n): j=(i+1)%n; f.extend([(i,j,n+j),(i,n+j,n+i)])
  return self.add(trimesh.Trimesh(vertices=v,faces=f,process=False),color=c,name=name)
 def ring(self,p,ri,ro,h,c='metal',name=None,start=0,end=2*math.pi,n=32):
  ts=np.linspace(start,end,n+1); vs=[]
  for z in [-h/2,h/2]:
   for r in [ri,ro]: vs.extend([(r*math.cos(t),r*math.sin(t),z) for t in ts])
  N=n+1;fs=[]
  for i in range(n):
   for a,b,reverse in [(0,N,True),(2*N,3*N,False),(0,2*N,False),(N,3*N,True)]:
    q=[a+i,a+i+1,b+i+1,b+i]
    if reverse:q=q[::-1]
    fs.extend([(q[0],q[1],q[2]),(q[0],q[2],q[3])])
  for i in [0,n]:
   q=[i,N+i,3*N+i,2*N+i]
   fs.extend([(q[0],q[1],q[2]),(q[0],q[2],q[3])])
  return self.add(trimesh.Trimesh(vertices=vs,faces=fs,process=True),p,c,name)
 def beam(self,a,b,w,c='metal',name=None):
  a=np.array(a,float);b=np.array(b,float);d=b-a
  m=trimesh.creation.cylinder(radius=w/2,height=float(np.linalg.norm(d)),sections=6)
  m.apply_transform(trimesh.geometry.align_vectors([0,0,1],d/np.linalg.norm(d)))
  return self.add(m,(a+b)/2,c,name)
 def truss(self,a,b,w,c='metal',name=None):
  a=np.array(a,float);b=np.array(b,float);d=b-a; axis=d/np.linalg.norm(d)
  side=np.cross(axis,[0,0,1])
  if np.linalg.norm(side)<.01:side=np.array([1,0,0])
  side=side/np.linalg.norm(side)*w/2; up=np.cross(axis,side);up=up/np.linalg.norm(up)*w/2
  for s in [-1,1]:
   for t in [-1,1]:self.beam(a+s*side+t*up,b+s*side+t*up,w*.13,c)
  for j in range(5):
   x=a+d*j/5;y=a+d*(j+1)/5
   self.beam(x-side+up,y+side+up,w*.1,c);self.beam(x+side-up,y-side-up,w*.1,c)
 def hull(self,xs,ys,p=(0,0,0),height=3,c='ivory',name='HULL'):
  vs=[]; n=8
  for x,y in zip(xs,ys):
   for t in np.linspace(0,2*math.pi,n,endpoint=False):vs.append([x, y*np.sign(np.cos(t))*abs(np.cos(t))**.5,height*.5*np.sign(np.sin(t))*abs(np.sin(t))**.5])
  fs=[]
  for k in range(len(xs)-1):
   for i in range(n):a=k*n+i;b=k*n+(i+1)%n;cc=(k+1)*n+(i+1)%n;d=(k+1)*n+i;fs.extend([(a,b,cc),(a,cc,d)])
  for k in [0,len(xs)-1]:
   for i in range(1,n-1):fs.append((k*n,k*n+i,k*n+i+1))
  return self.add(trimesh.Trimesh(vertices=vs,faces=fs,process=True),p,c,name)
 def nozzle(self,p,r=1):
  self.cyl(p,r,r*1.2,'dark',axis='x');self.cyl((p[0]-.65*r,p[1],p[2]),r*.68,.08,'teal',axis='x',em=True)
 def windows(self,xs,y,z):
  for x in xs:self.box((x,y,z),(.7,.28,.5),'amber',em=True)
 def export(self,path):
  s=trimesh.Scene()
  for name,m,co,em in self.parts:s.add_geometry(m,node_name=name,geom_name=name)
  path.write_bytes(s.export(file_type='glb'))

def ray(m,p=(0,0,0),s=1):
 x,y,z=p
 pts=[(-4,0),(-1,5),(4,6),(2,2),(5,0),(2,-2),(4,-6),(-1,-5)]
 m.plate([(x+a*s,y+b*s) for a,b in pts],z,.22*s,'teal')
 m.hull([-4*s,0,5*s],[.3*s,1*s,.1*s],p=(x,y,z+.5*s),height=1*s,c='ivory',name='RAY_KEEL')
 m.beam((x-3*s,y,z),(x-7*s,y+1*s,z-.7*s),.22*s,'amber')

def model(i):
 m=Model()
 if i==1:
  m.hull([-8,-3,6,9],[2,4,3,1.5],height=4,c='dark');m.box((0,0,3),(10,12,.8),'ivory')
  for x in [-4,0,4]:
   m.cyl((x,-4.5,3.5),.55,.4,'metal');m.box((x,-6.4,3.7),(1.2,4,.25),'amber');m.box((x,-7.6,3.9),(.8,.6,.1),'white',em=True)
  m.box((6,0,2.3),(2,2,1),'ivory');m.box((7.1,0,2.3),(.15,1.5,.7),'teal',em=True)
  for y in [-2.8,2.8]:m.nozzle((-7,y,0),1.1)
  m.box((0,0,3.48),(8,2,.12),'dark')
 elif i==2:
  for y,l in [(0,16),(9.5,11.5),(-9.5,11.5)]:
   m.hull([-l,-l*.5,l*.7,l],[2,3.5,3,1],p=(0,y,0),height=5,c='ivory')
   m.box((0,y,2.6),(l*.8,1.5,.2),'blue');m.nozzle((-l,y,0),1.6)
  for x in [-7,6]:m.box((x,0,0),(2.2,23,1.5),'dark')
  m.truss((-2,-11,2),(2,-15,4),1.2);m.truss((2,-15,4),(8,-17,2),1)
  m.box((8,-17,1),(3,3,1),'amber')
  m.box((4,0,4),(7,5,3),'blue');m.windows(range(1,8,2),-2.6,4)
  for x in [-7,-3,1,5]:m.box((x,9.5,3),(2.4,4,.5),'dark')
 elif i==3:
  m.hull([-11,-6,7,11],[2,3,2,.7],height=4,c='ivory')
  for sign,L in [(1,7),(-1,5.5)]:
   m.truss((0,sign*2,1),(2,sign*(L+2),1.5),.8);m.cyl((2,sign*(L+2),1.7),1.2,.6,'amber')
  m.ring((-7,0,3),1.6,2.6,.7,'amber')
  m.box((0,0,2.4),(13,1,.15),'gold')
  for y in [-1.5,1.5]:m.beam((4,y,0),(9,y*1.4,0),.7,'amber')
  m.nozzle((-11,0,0),1.7)
 elif i==4:
  m.hull([-21,-12,14,23],[2,4,3,1],height=8,c='ivory')
  for x in [-12,0,12]:
   for y in [-10,10]:
    m.box((x,y/2,0),(2,10,1.5),'dark');m.ell((x,y,1),(10,6,5),'green')
    m.ring((x,y,1),2.3,2.9,.7,'ivory',n=16)
    for xx in [-3,0,3]:m.box((x+xx,y,3.1),(.4,4.6,.45),'ivory')
  m.box((1,0,4.2),(27,1.3,.3),'green');m.windows(range(-12,16,3),-4.1,1)
  for y in [-2.5,2.5]:m.nozzle((-21,y,-1),1.8)
 elif i==5:
  m.hull([-10,-3,7,12],[2.3,2.4,1.6,.3],height=3.3,c='red')
  m.plate([(-7,3),(0,10),(8,3),(3,2)],-.2,.35,'red');m.beam((-7,3,0),(0,10,0),.7,'dark')
  m.box((-4,-3,0),(2,6,.8),'metal');m.hull([-7,-3,-1],[1.3,1.5,.5],p=(0,-5,0),height=2,c='ivory')
  m.nozzle((-7,-5,0),1);m.nozzle((-10,0,0),1.5)
  m.box((3,0,2),(4,1.8,.7),'dark');m.box((3,0,2.4),(3,1.2,.2),'blue')
 elif i==6:
  for k,(x,y,co) in enumerate([(-10,8,'amber'),(10,7,'teal'),(0,-12,'ivory')]):
   m.hull([-8,-4,5,8],[2,3.5,3,1],p=(x,y,0),height=4,c=co)
   m.box((x,y,2.1),(9,.75,.16),'white',rot=.35);m.nozzle((x-8,y,0),1.1)
   if k==0:
    for sy in [-1,1]:m.box((x+9,y+sy*3,0),(7,1.2,1),'dark')
   elif k==1:m.ring((x-3,y,3),1.3,2.5,1.5,'metal')
   else:
    m.box((x-3,y,2),(7,6,1),'dark');m.ell((x-3,y,3),(4,3,1.6),'ivory')
 elif i==7:
  m.hull([-10,-5,1,3],[1.5,3,2,.5],height=3.8,c='dark')
  for s in [-1,1]:
   m.plate([(0,s*2.5),(12,s*8),(12,s*6.3),(2,s*1.4)],0,.8,'ivory')
   m.beam((1,s*2,1),(10,s*6.8,1),.3,'amber');m.cyl((0,s*2.5,1),1,.5,'metal')
  m.cyl((-3,0,3),2,2,'amber',axis='y');m.nozzle((-10,0,0),1.6)
 elif i==8:
  m.hull([-14,-8,9,14],[4,7,6,3],height=7,c='dark')
  m.box((-2,0,3.6),(14,10,.3),'red')
  for j in range(6):m.box((-6+j*2.2,0,5),(1.1,8,2.4),'metal')
  for y in [-10,10]:
   m.box((0,y/2,0),(3,10,1.2),'metal');m.cyl((0,y,1),2,7,'ivory',axis='x');m.cyl((3.2,y,1),2.2,.5,'amber',axis='x')
   m.beam((-3,y,2),(-3,y*.4,4),.55,'metal')
  m.box((14.1,0,0),(.3,5,2),'amber',em=True);m.nozzle((-14,0,0),2.2)
 elif i==9:
  m.hull([-12,-8,0,3],[3,5,5,2],height=5,c='amber')
  for y in [-7,7]:m.box((7,y,0),(14,2,1),'metal');m.box((7,y,1),(12,.7,.25),'amber')
  m.box((9,0,4),(1.4,16,1.2),'dark');m.box((8,0,1),(7,10,3.5),'red')
  for y in [-4,4]:m.box((8,y,3),(7,.3,.15),'ivory');m.cyl((-1,y,0),1,2,'dark',axis='x')
  m.box((-6,2,3.5),(4,4,2),'ivory');m.box((-4,2,3.7),(.2,3,1),'blue');m.nozzle((-12,0,0),2)
 elif i==10:
  m.plate([(-10,-12),(-10,12),(13,0)],-1.1,2.2,'dark')
  for y in [-7,7]:m.ring((-2,y,1.4),2.9,4.5,.6,'gold');m.cyl((-2,y,1.5),2.9,.15,'black')
  m.ring((8,0,2),1,2,.8,'metal');m.cyl((8,0,2.5),.8,.1,'teal',em=True)
  for x,y in [(-13,-19),(9,17)]:
   m.cyl((x,y,2),.55,3,'metal',axis='x');m.plate([(x-1,y-2),(x+1,y),(x-1,y+2)],1.6,.2,'gold');m.cyl((x+1.6,y,2),.5,.1,'teal',axis='x',em=True)
  m.nozzle((-10,0,0),1.7)
 elif i==11:
  m.ring((0,0,0),11,18,3,'metal')
  for a in [0,2.0944,4.1888]:
   vec=np.array([math.cos(a),math.sin(a),0]);a0=vec*15;b=vec*55
   m.truss(a0,b,4,'metal');p=vec*55
   m.box(p,(14,10,1),'dark',rot=a);m.box(p+[0,0,1],(9,7,.2),'amber',rot=a)
  m.box((0,0,3),(9,9,2),'ivory');m.box((8,4,3),(15,2,1),'amber');m.box((8,-4,3),(15,2,1),'amber')
  m.box((32,0,3),(7,5,3),'red');m.box((-22,39,3),(7,5,3),'blue')
 elif i==12:
  m.ring((0,0,0),14,24,5,'dark')
  for a in np.linspace(0,2*math.pi,6,endpoint=False):
   v=np.array([math.cos(a),math.sin(a)]);w=np.array([-v[1],v[0]])
   pts=[v*22-w*5,v*66-w*11,v*71+w*7,v*22+w*5]
   m.plate(pts,0,1.2,'gold');m.truss((*list(v*23),-2),(*list(v*62),-2),2,'dark')
  m.hull([-45,-33,35,45],[3,6,6,2],height=12,c='ivory');m.box((0,0,6.2),(70,2,.3),'gold')
  m.windows(range(-30,33,4),-6.1,2)
  for x in [-12,1,14,27]:m.box((x,16,2),(11,7,5),'blue')
 elif i==13:
  # Large honest open oval, seen as negative space.
  for j in range(12):
   a=j*math.pi/6
   if j in [2,3]: continue
   part=m.ring((0,0,0),22,34,7,'dark',start=a,end=a+.47,n=5)
   part.vertices[:,0]*=1.55
  for j in [0,1,4,5,6,7,8,9,10,11]:
   a=(j+.45)*math.pi/6;x=43*math.cos(a);y=28*math.sin(a)
   m.box((x,y,4),(9,6,1.4),'metal',rot=a)
   if j%2==0:m.box((35*math.cos(a),22*math.sin(a),5),(3,1,.3),'teal',rot=a,em=True)
  m.box((60,-18,0),(3,2,2),'amber')
 elif i==14:
  for x,y in [(-38,9),(0,-2),(38,9)]:
   m.truss((x,y,-7),(x,y,8),3,'metal');m.box((x,y,8),(10,8,2),'dark')
   m.plate([(x-16,y),(x-5,y+13),(x+15,y+8),(x+8,y+3)],10,1,'blue')
   m.beam((x-16,y,11),(x+15,y+8,11),1,'ivory');m.ell((x,y-6,5),(5,5,7),'amber')
  m.truss((-38,9,-7),(38,9,-7),3);m.box((0,-25,-7),(20,14,2),'ivory')
 elif i==15:
  for j in range(7):
   a=-.4+j*.48;p=(28*math.cos(a),22*math.sin(a),-1)
   m.ell(p,(10,7,5),'ivory')
  for p,s in [((-6,-3,3),1.4),((6,8,5),1),((-12,13,2),.8)]:ray(m,p,s)
  for j in range(7):ray(m,(-14+j*4,-12+math.sin(j)*2,1),.25)
 elif i==16:
  for j in [0,1,3,5,6]:m.ring((0,0,0),13,18,3,'dark',start=j*math.pi/4,end=(j+.88)*math.pi/4,n=6)
  for j,a in enumerate([.1,2.3,4.4]):
   p=np.array([23*math.cos(a),23*math.sin(a),1]);m.box(p,(5,4,2.5),'metal');m.box(p+[0,0,1.4],(2,.4,.2),'teal',em=True)
   m.beam(p+[0,0,1],p+[0,0,5],.3,'metal')
  for j,a in enumerate([.3,1.1,2.6,3.5,4.5,5.7]):
   p=np.array([15*math.cos(a),15*math.sin(a)])
   pts=[p]+[p+np.array([math.cos(t),math.sin(t)])*(4+(.7 if k%2 else 0)) for k,t in enumerate(np.linspace(a-.9,a+1,8))]
   m.plate(pts,2.1,.25,'ivory')
 elif i==17:
  for a in [0,2.094,4.188]:
   x=28*math.cos(a);y=28*math.sin(a)
   for z in [3,11,19,27,35]:
    offset=z*.18;m.box((x+offset*math.cos(a),y+offset*math.sin(a),z),(13,16,6),'dark',rot=a)
   m.box((x,y,38.5),(9,12,.35),'teal',rot=a,em=True)
  m.box((0,-38,0),(12,10,2),'metal');m.cyl((0,-38,2),3,1,'gold',n=6)
  m.plate([(-15,-10),(-2,-10),(-2,10),(-15,10)],-3,2,'black')
 elif i==18:
  m.hull([-10,5,24,32],[8,9,6,2],p=(-4,0,0),height=10,c='dark')
  aft=m.hull([-14,-4,1],[7,8,7],p=(-27,8,-2),height=8,c='metal')
  m.truss((0,7,3),(-6,20,1),2,'metal');m.box((13,0,5),(14,4,.7),'amber')
  for x in [-9,-6,-3]:m.box((x,0,4),(1,15,1),'ivory')
  m.box((15,-25,-2),(14,10,2),'amber')
  for x in [12,19]:m.box((x,-25,0),(5,7,3),'blue')
  m.box((-11,-29,0),(3,2,2),'ivory');m.box((-11,-29,1.2),(1,.4,.2),'teal',em=True)
 elif i==19:
  m.hull([-7,-4,3,6],[2,4,3,1],p=(0,0,0),height=3,c='ivory')
  for y in [-4,4]:
   m.box((6,y,1),(6,1.5,1),'metal');m.cyl((3,y,1),1,.5,'teal');m.box((9,y*.65,1),(1.2,3,1),'amber')
  m.box((7,0,1.2),(4,3,2),'blue');m.box((7,0,2.3),(2,1,.3),'teal',em=True)
  v=[(-3,-1,0),(-3,2,0),(0,.5,0),(-2,.5,3)]
  m.add(trimesh.Trimesh(vertices=v,faces=[[0,1,2],[0,3,1],[1,3,2],[2,3,0]],process=True),(-5,-8,5),'ivory',name='PIP')
  m.box((-7,-7.5,6),(.3,1,.8),'teal',em=True);m.beam((-5,-8,5),(1,-6,3),.3,'metal')
 elif i==20:
  for x in [-65,65]:
   m.truss((x,0,0),(x,0,25),5,'metal');m.box((x,0,26),(15,12,2),'dark')
  m.truss((-65,0,0),(65,0,0),4,'metal')
  for j,x in enumerate(np.linspace(-57,57,12)):
   y=9 if j%2 else -9;m.beam((x,0,0),(x,y,2),1,'metal');m.box((x,y,2),(3,3,2),'amber',em=True)
  for x,c in [(-30,'blue'),(-5,'ivory'),(20,'red')]:m.box((x,0,4),(18,12,4),c)
  m.box((0,-22,0),(24,16,2),'ivory');m.box((0,-22,2),(12,2,1),'metal')
 return m

# Camera projection and triangle painter. Orthographic reference, not a gameplay screenshot.
def triangles(m):
 arr=[]
 for name,mesh,co,em in m.parts:
  vs=np.asarray(mesh.vertices);f=np.asarray(mesh.faces)
  ns=mesh.face_normals
  for face,n in zip(f,ns):arr.append((vs[face],n,co,em))
 return arr

def draw_view(canvas,m,rect,top=False,shadow=True):
 x,y,w,h=rect
 if top: cam=np.array([0,0,1.]);right=np.array([1,0,0.]);up=np.array([0,1,0.])
 else:
  cam=np.array([1.2,-1.55,2.15]);cam/=np.linalg.norm(cam)
  right=np.cross([0,0,1],cam);right/=np.linalg.norm(right);up=np.cross(cam,right)
 allv=np.vstack([p[1].vertices for p in m.parts]); u=allv@right;v=allv@up
 scale=min(w/max(np.ptp(u),1),h/max(np.ptp(v),1))*.87
 cx=(u.min()+u.max())/2;cy=(v.min()+v.max())/2
 dr=ImageDraw.Draw(canvas);glow=Image.new('RGBA',canvas.size,(0,0,0,0));gd=ImageDraw.Draw(glow)
 if shadow and not top:
  shadowlayer=Image.new('RGBA',canvas.size,(0,0,0,0));sd=ImageDraw.Draw(shadowlayer)
  sd.ellipse([x+w*.15,y+h*.68,x+w*.85,y+h*.86],fill=(0,0,0,120));canvas.alpha_composite(shadowlayer.filter(ImageFilter.GaussianBlur(30)))
 light=np.array([-1,-.8,2.3]);light/=np.linalg.norm(light)
 ts=triangles(m);ts.sort(key=lambda t:float(np.mean(t[0]@cam)))
 dr=ImageDraw.Draw(canvas)
 for verts,n,co,em in ts:
  # Render both sides, normals are corrected visually toward camera for thin surfaces.
  nn=n if np.dot(n,cam)>=0 else -n
  brightness=.38+.60*max(0,float(nn@light))+.10*max(0,float(nn@cam))
  if top: brightness=.8+.2*max(0,float(nn@cam))
  if em:brightness=1.27
  cc=tuple(int(min(255,max(0,c*brightness))) for c in co)
  pts=[(x+w/2+(float(q@right)-cx)*scale,y+h/2-(float(q@up)-cy)*scale) for q in verts]
  dr.polygon(pts,fill=cc)
  if em:gd.polygon(pts,fill=(*co,115))
 canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(7)))

def plate(c,m):
 W,H=1600,1100
 yy,xx=np.mgrid[:H,:W];rad=np.clip(1-np.sqrt(((xx-650)/1050)**2+((yy-520)/800)**2),0,1)
 ar=np.empty((H,W,4),np.uint8)
 for k,(base,gain) in enumerate([(9,11),(16,16),(25,21)]):ar[:,:,k]=(base+gain*rad).astype(np.uint8)
 ar[:,:,3]=255;im=Image.fromarray(ar,'RGBA');d=ImageDraw.Draw(im)
 rng=np.random.default_rng(100+c['number'])
 for x,y,s in zip(rng.integers(25,1575,90),rng.integers(135,905,90),rng.integers(1,3,90)):d.ellipse((int(x),int(y),int(x+s),int(y+s)),fill=(66,81,95,255))
 accent=P[['amber','blue','gold','green','red','teal','amber','red','amber','gold','amber','gold','teal','blue','teal','violet','teal','amber','teal','amber'][c['number']-1]]
 d.rectangle((50,44,60,104),fill=accent)
 d.text((82,42),f"{c['number']:02d}  /  {c['name'].upper()}",font=font(34,True),fill=(228,232,231))
 d.text((84,87),c['category'].upper(),font=font(16),fill=(126,151,167))
 d.line((50,124,1550,124),fill=(55,76,91),width=1)
 d.line((1155,155,1155,905),fill=(48,68,82),width=1)
 if c['number']==14:
  # Art-only partial planetary backdrop, separate from site blockout.
  for r in range(480,0,-1):
   col=(10+int((480-r)*.035),28+int((480-r)*.03),45+int((480-r)*.045),255)
   d.ellipse((-250-r,960-r,-250+r,960+r),fill=col)
 draw_view(im,m,(45,155,1080,710))
 d=ImageDraw.Draw(im);d.text((1200,164),'PLAN SILHOUETTE',font=font(17,True),fill=(171,193,205))
 draw_view(im,m,(1190,210,345,350),top=True,shadow=False)
 d=ImageDraw.Draw(im);d.line((1210,585,1515,585),fill=(55,76,91))
 labels=[('AUTHOR ENVELOPE',f"{c['size'][0]} × {c['size'][1]} × {c['size'][2]} m"),('PROPOSED LOD0',f"{c['triangles'][0]:,} triangles"),('NEARBY CAP',str(c['residents'])),('BUILD WAVE',str(c['wave']))]
 for j,(a,b) in enumerate(labels):
  yy=615+j*66;d.text((1208,yy),a,font=font(12,True),fill=(105,132,148));d.text((1208,yy+21),b,font=font(19),fill=(209,220,220))
 d.text((60,881),'FORM STUDY  /  ORIGINAL PROCEDURAL CONCEPT RENDER',font=font(13,True),fill=(102,140,156))
 d.line((50,920,1550,920),fill=(55,76,91),width=1)
 # Break pitch to two lines.
 text=c['pitch'];words=text.split();lines=[];s=''
 for word in words:
  n=s+' '+word if s else word
  if d.textlength(n,font=font(21))>1480:lines.append(s);s=word
  else:s=n
 lines.append(s)
 for j,line in enumerate(lines[:3]):d.text((60,944+j*29),line,font=font(21),fill=(220,227,225))
 d.text((60,1060),'REFERENCE ONLY — proportions, joints and materials must be rebuilt and verified through the repository’s Forge pipeline.',font=font(13),fill=(123,146,158))
 return im.convert('RGB')

def blueprint(c,m):
 # Vector orthographic reference with dimensions and named part inventory.
 allv=np.vstack([p[1].vertices for p in m.parts]);xmin,ymin=allv[:,:2].min(axis=0);xmax,ymax=allv[:,:2].max(axis=0)
 scale=min(700/max(xmax-xmin,1),540/max(ymax-ymin,1));cx=(xmin+xmax)/2;cy=(ymin+ymax)/2
 parts=[]
 for name,mesh,co,em in m.parts:
  for face in mesh.faces:
   vs=mesh.vertices[face];pts=' '.join(f'{440+(q[0]-cx)*scale:.2f},{365-(q[1]-cy)*scale:.2f}' for q in vs)
   parts.append(f'<polygon points="{pts}" fill="#e8eff2" stroke="#466174" stroke-width="0.4"/>')
 import html
 listed=''.join(f'<text x="890" y="{190+j*48}" font-size="16">{html.escape(p[0])}</text>' for j,p in enumerate(c['parts']))
 s=f'''<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="900" viewBox="0 0 1400 900"><rect width="1400" height="900" fill="#f5f7f8"/><g font-family="DejaVu Sans, sans-serif" fill="#182f42"><text x="45" y="55" font-size="28" font-weight="bold">{c['number']:02d} / {html.escape(c['name'])}</text><text x="45" y="90" font-size="16">ORTHOGRAPHIC FORM STUDY — author +X nose / +Y port / +Z up</text><g>{''.join(parts)}</g><path d="M80 730 H800 M80 720 V740 M800 720 V740" fill="none" stroke="#466174"/><text x="270" y="765" font-size="18">Target length: {c['size'][0]} author metres</text><path d="M835 155 V670 M825 155 H845 M825 670 H845" fill="none" stroke="#466174"/><text x="885" y="140" font-size="20" font-weight="bold">RECIPE PARTS</text>{listed}<text x="890" y="550" font-size="16">Width target: {c['size'][1]} m</text><text x="890" y="580" font-size="16">Height target: {c['size'][2]} m</text><text x="890" y="620" font-size="14">Dimensions are design targets.</text><text x="890" y="645" font-size="14">Blockout is not a measured final model.</text><text x="45" y="837" font-size="16">Use the dossier for hinge origins, collision authority, animation timing and export requirements.</text><text x="45" y="869" font-size="14">No shipping geometry, UVs, collision or rig approval is implied by this reference plate.</text></g></svg>'''
 return s

if __name__=='__main__':
 for c in C:
  m=model(c['number']);stem=f"{c['number']:02d}_{c['slug']}"
  plate(c,m).save(OUT/f'{stem}.png',optimize=True)
  m.export(OUT/'blockouts'/f'{stem}.glb')
  (OUT/'blueprints'/f'{stem}.svg').write_text(blueprint(c,m),encoding='utf8')
  print(stem,len(m.parts),'parts',flush=True)
 thumbs=[]
 for c in C:
  im=Image.open(OUT/f"{c['number']:02d}_{c['slug']}.png");im.thumbnail((480,330));thumbs.append(im)
 contact=Image.new('RGB',(4*480,5*330),(9,16,25))
 for j,im in enumerate(thumbs):contact.paste(im,((j%4)*480,(j//4)*330))
 contact.save(OUT/'CONTACT_SHEET.jpg',quality=92)
