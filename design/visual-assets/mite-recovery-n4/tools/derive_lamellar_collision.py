"""Geometry-derived bounded convex proposal for the actual lamellar Mite.
Reads the exact GLB, evaluates retained presentation folds, and keeps the jaw slot empty.
No production/runtime state is changed. Finite-raster error is reported with its uncertainty.
"""
from pathlib import Path
import json,struct,math,hashlib
import numpy as np
from scipy.spatial import ConvexHull
from scipy.ndimage import distance_transform_edt,binary_erosion
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1];SRC=R/'prototype/mite-lamellar-r28.glb';OUT=R/'contracts';OUT.mkdir(exist_ok=True)
raw=SRC.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);off=20+n;bn=struct.unpack_from('<I',raw,off)[0];data=raw[off+8:off+8+bn]
DT={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def access(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt=np.dtype(DT[a['componentType']]);c=NC[a['type']];start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',dt.itemsize*c)
 return np.ndarray((a['count'],c),dtype=dt,buffer=data,offset=start,strides=(stride,dt.itemsize)).copy()
def mat(node):
 if 'matrix' in node:return np.array(node['matrix']).reshape(4,4).T
 x,y,z,w=node.get('rotation',[0,0,0,1]);m=np.eye(4);m[:3,:3]=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])@np.diag(node.get('scale',[1,1,1]));m[:3,3]=node.get('translation',[0,0,0]);return m
rows=[]
def visit(i,parent):
 node=doc['nodes'][i];world=parent@mat(node)
 if 'mesh' in node:
  for p in doc['meshes'][node['mesh']]['primitives']:
   v=access(p['attributes']['POSITION']);v=np.c_[v,np.ones(len(v))]@world.T;t=access(p['indices']).reshape(-1,3)
   rows.append({'name':node.get('name',str(i)),'v':v[:,:3],'t':t})
 for j in node.get('children',[]):visit(j,world)
for i in doc['scenes'][doc.get('scene',0)]['nodes']:visit(i,np.eye(4))
STEP=.008;MINX=-5.6;MAXX=6.25;MINZ=-4.55;MAXZ=4.55;W=round((MAXX-MINX)/STEP)+1;H=round((MAXZ-MINZ)/STEP)+1
px=lambda p:((p[0]-MINX)/STEP,(p[1]-MINZ)/STEP)
def mask(polys):
 im=Image.new('1',(W,H));d=ImageDraw.Draw(im)
 for p in polys:
  if len(p)>=3:d.polygon([px(v) for v in p],fill=1)
 return np.array(im,dtype=bool)
def polys_for_pose(frac):
 out=[]
 for row in rows:
  v=row['v'].copy();name=row['name'];side=1 if name.startswith('Vane_port_') else -1 if name.startswith('Vane_starboard_') else 0
  if side:
   pivot=np.array([-3,.18,-side*2.45]);a=side*.3*frac;c=math.cos(a);s=math.sin(a);rot=np.array([[1,0,0],[0,c,-s],[0,s,c]]);v=(v-pivot)@rot.T+pivot
  q=v[:,[0,2]];out.extend(q[t].tolist() for t in row['t'])
 return out
POSES={'approach':0,'windup':1,'attack':.1,'recovery':.6};P={p:polys_for_pose(f) for p,f in POSES.items()};MASK={p:mask(v) for p,v in P.items()};DIST={p:distance_transform_edt(~m)*STEP for p,m in MASK.items()}
def hull(polys):
 vs=np.unique(np.concatenate([np.asarray(p) for p in polys]),axis=0)
 if len(vs)<3:return None
 try:return vs[ConvexHull(vs).vertices].tolist()
 except:return None
def clip(p,axis,cut,sign):
 out=[]
 for a,b in zip(p,p[1:]+p[:1]):
  da=(a[axis]-cut)*sign;db=(b[axis]-cut)*sign
  if da>=-1e-10:out.append(a)
  if (da<0<db) or (db<0<da):
   t=da/(da-db);out.append([a[k]+t*(b[k]-a[k]) for k in range(2)])
 return out
def error(poly):
 m=mask([poly]);return max(float(d[m].max(initial=0)) for d in DIST.values())
def decompose(polys,name,depth=0):
 h=hull(polys)
 if h is None:return []
 e=error(h)
 if e<=.071:return [{'id':name,'vertices':h,'overfillWU':e}]
 if depth>=10:raise RuntimeError(('unsolved',name,e))
 a=np.array(h);axis=int(np.argmax(np.ptp(a,axis=0)));cut=(a[:,axis].min()+a[:,axis].max())/2
 parts=[]
 for sign,tag in [(-1,'a'),(1,'b')]:
  ps=[q for p in polys if len(q:=clip(p,axis,cut,sign))>=3]
  if ps:parts+=decompose(ps,name+tag,depth+1)
 return parts
# Named source groups, then adaptive splits only where their actual union is concave.
groups={}
for row in rows:
 name=row['name'];points=row['v']
 if name.startswith('Vane_'):
  side=1 if name.startswith('Vane_port_') else -1;pivot=np.array([-3,.18,-side*2.45]);a=side*.3;c=math.cos(a);ss=math.sin(a);rot=np.array([[1,0,0],[0,c,-ss],[0,ss,c]])
  # A fixed proxy lies midway between endpoint planforms; every actual pose is
  # still measured below. This avoids forcing the approach tip onto all folds.
  points=(points+(points-pivot)@rot.T+pivot)*.5
 v=points[:,[0,2]];polys=[v[t].tolist() for t in row['t']]
 if name.startswith('Vane_'):group='port_scute' if '_port_' in name else 'starboard_scute'
 elif name.startswith(('Jaw_','Cheek_')):group='port_jaw' if '_port_' in name else 'starboard_jaw'
 elif name.startswith('Tergite_03'):group='posterior'
 elif name.startswith('Tergite_02'):group='saddle'
 else:group='cranial_core'
 groups.setdefault(group,[]).extend(polys)
pieces=[]
for name,ps in groups.items():pieces+=decompose(ps,name)
print('initial pieces',len(pieces),flush=True)
# Merge nearest eligible neighbouring pieces until the specified bounded budget is met.
while len(pieces)>28:
 candidates=[]
 for i in range(len(pieces)):
  for j in range(i+1,len(pieces)):
   a,b=pieces[i],pieces[j]
   va=np.array(a['vertices']);vb=np.array(b['vertices'])
   if np.linalg.norm(va.mean(axis=0)-vb.mean(axis=0))>3:continue
   h=hull([a['vertices'],b['vertices']]);e=error(h)
   if e<=.083:candidates.append((e,len(h),i,j,h))
 if not candidates:break
 e,_,i,j,h=min(candidates);a,b=pieces[i],pieces[j]
 pieces=[p for k,p in enumerate(pieces) if k not in (i,j)]+[{'id':a['id']+'_'+b['id'],'vertices':h,'overfillWU':e}]
 print('merged to',len(pieces),flush=True)
if len(pieces)>32:raise RuntimeError(('budget unresolved',len(pieces)))
# Preserve all negative space while providing the requested named finite decomposition.
while len(pieces)<24:
 i=max(range(len(pieces)),key=lambda k:np.ptp(np.array(pieces[k]['vertices']),axis=0).max());p=pieces.pop(i);a=np.array(p['vertices']);axis=int(np.argmax(np.ptp(a,axis=0)));cut=(a[:,axis].min()+a[:,axis].max())/2
 for sign,tag in [(-1,'a'),(1,'b')]:pieces.append({'id':p['id']+tag,'vertices':clip(p['vertices'],axis,cut,sign),'overfillWU':p['overfillWU']})
# Conservative removal of near-collinear convex corners; final coverage is remeasured.
for p in pieces:
 v=p['vertices']
 while len(v)>3:
  costs=[]
  for i in range(len(v)):
   a=np.array(v[i-1]);b=np.array(v[(i+1)%len(v)]);c=np.array(v[i]);ab=b-a;t=np.clip(np.dot(c-a,ab)/max(1e-20,np.dot(ab,ab)),0,1);costs.append((float(np.linalg.norm(c-a-t*ab)),i))
  distance,i=min(costs)
  if len(v)<=12 and distance>=.008:break
  if len(v)>12 and distance>.035:raise RuntimeError(('vertex reduction too destructive',p['id'],len(v),distance))
  v.pop(i)
 p['vertices']=[[round(float(x),6),round(float(z),6)] for x,z in v];p['kind']='convex'
 p['overfillWU']=error(p['vertices'])
for side in ['port','starboard']:
 matches=[p for p in pieces if p['id'].startswith(side+'_scute')]
 if not matches:raise RuntimeError('No fixed fan support '+side)
 matches[0]['id']=side+'_scute'
native=mask([p['vertices'] for p in pieces]);ndist=distance_transform_edt(~native)*STEP;nb=native&~binary_erosion(native);stats={}
for phase,m in MASK.items():
 b=m&~binary_erosion(m);stats[phase]={'visibleToProxyMaxWU':float(ndist[b].max(initial=0)),'proxyToVisibleMaxWU':float(DIST[phase][nb].max(initial=0))}
clear=mask([[[2,-.65],[6.6,-.65],[6.6,.65],[2,.65]]]);overlap=int(np.count_nonzero(clear&native))
report={'schema':'spaceface.broodConvexProposal.v1','status':'isolated candidate, not runtime registered','sourceGlb':str(SRC),'sourceGlbSha256':hashlib.sha256(raw).hexdigest(),'units':'WU','projection':'canonical GLB XZ','fixedProxyBasis':'Static source geometry; fan planform midpoint of approach and windup, checked against every retained pose','pieceCount':len(pieces),'pieces':pieces,'retainedMotionPivots':{'port':[-3,.18,-2.45],'starboard':[-3,.18,2.45]},'poses':stats,'clearVolumeJawOverlapPixels':overlap,'rasterStepWU':STEP,'conservativeRasterUncertaintyWU':2*math.sqrt(2)*STEP,'outlineErrorTargetWU':.12,'sharedDependency':'canonical shared convex normalization plus offline outline/metric adapters; no private physics implementation'}
(OUT/'lamellar-collision-proposal.json').write_text(json.dumps(report,indent=2))
C=Image.new('RGB',(W*2,H*2),'#172027');d=ImageDraw.Draw(C)
for i,(phase,m) in enumerate(MASK.items()):
 a=np.zeros((H,W,4),dtype=np.uint8);a[m]=[113,66,88,255];im=Image.fromarray(a);dr=ImageDraw.Draw(im)
 for p in pieces:dr.line([px(v) for v in p['vertices']]+[px(p['vertices'][0])],fill='#76e3b1',width=2)
 dr.rectangle([px([2,-.65]),px([6.2,.65])],outline='#ffbd73',width=3);C.paste(im,((i%2)*W,(i//2)*H),im);d.text(((i%2)*W+20,(i//2)*H+20),phase+' / measured geometry projection',fill='white')
C.thumbnail((1600,1250));C.save(OUT/'lamellar-collision-overlay.png')
print(json.dumps({k:v for k,v in report.items() if k!='pieces'},indent=2))
