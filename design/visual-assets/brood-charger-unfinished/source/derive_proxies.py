"""Source-bound convex proposal from actual cold GLB projected triangles.
The exact authored boundaries remain the authority; this does not admit runtime.
"""
from pathlib import Path
import json,sys,math,hashlib,os
import numpy as np
from scipy.spatial import ConvexHull
from scipy.ndimage import distance_transform_edt,binary_erosion
from PIL import Image,ImageDraw
sys.path.insert(0,str(Path(__file__).resolve().parent));from glb_geometry import Glb
R=Path(__file__).resolve().parents[1];O=R/os.environ.get('CHARGER_OUT','study-c5');G=Glb(O/'charger-LOD0-source.glb')
STEP=.012;X=-10.2;Z=-8.6;W=1801;H=1435
def mask(ps):
 im=Image.new('1',(W,H));d=ImageDraw.Draw(im)
 for p in ps:d.polygon([((v[0]-X)/STEP,(v[1]-Z)/STEP)for v in p],fill=1)
 return np.array(im,dtype=bool)
def hull(ps):
 v=np.unique(np.concatenate(ps),axis=0)
 if len(v)<3:return None
 try:return v[ConvexHull(v).vertices].tolist()
 except:return None
polys=[t[:,[0,2]].tolist()for t in G.triangles(f=0)];visible=mask(polys);distance=distance_transform_edt(~visible)*STEP

def error(p):
 m=mask([p]);return float(distance[m].max(initial=0))
def clip(p,axis,cut,sign):
 out=[]
 for a,b in zip(p,p[1:]+p[:1]):
  da=(a[axis]-cut)*sign;db=(b[axis]-cut)*sign
  if da>=-1e-9:out.append(a)
  if(da<0<db)or(db<0<da):
   t=da/(da-db);out.append([a[k]+t*(b[k]-a[k])for k in range(2)])
 return out
def decompose(ps,name,depth=0):
 h=hull(ps)
 if h is None:return[]
 e=error(h)
 if e<=.060:return[{'id':name,'vertices':h,'initialOverfillWU':e}]
 if depth>15:raise RuntimeError((name,e))
 a=np.array(h);axis=int(np.argmax(np.ptp(a,axis=0)));cut=(a[:,axis].min()+a[:,axis].max())/2
 result=[]
 for sign,tag in [(-1,'a'),(1,'b')]:
  cp=[q for p in ps if len(q:=clip(p,axis,cut,sign))>=3]
  if cp:result+=decompose(cp,name+tag,depth+1)
 return result
pieces=decompose(polys,'charger');print('initial',len(pieces),flush=True)
# Only touching/overlapping regions are merged. Never bridge real fork air.
while True:
 cand=[]
 for i,a in enumerate(pieces):
  av=np.array(a['vertices'])
  for j in range(i+1,len(pieces)):
   b=pieces[j];bv=np.array(b['vertices'])
   if np.any(av.max(axis=0)<bv.min(axis=0)-.03)or np.any(bv.max(axis=0)<av.min(axis=0)-.03):continue
   h=hull([a['vertices'],b['vertices']]);e=error(h)
   if e<=.065:cand.append((e,len(h),i,j,h))
 if not cand:break
 e,_,i,j,h=min(cand);pieces=[p for k,p in enumerate(pieces)if k not in[i,j]]+[{'id':pieces[i]['id']+'_'+pieces[j]['id'],'vertices':h,'initialOverfillWU':e}]
 print('merged',len(pieces),flush=True)
for i,p in enumerate(pieces):
 v=p['vertices']
 while len(v)>12:
  cost=[]
  for j in range(len(v)):
   a=np.array(v[j-1]);b=np.array(v[(j+1)%len(v)]);q=np.array(v[j]);u=b-a;t=np.clip(np.dot(q-a,u)/max(1e-20,np.dot(u,u)),0,1);cost.append((np.linalg.norm(q-a-t*u),j))
  d,j=min(cost)
  if d>.035:raise ValueError(('Cannot bound <=12 vertices',i,d))
  v.pop(j)
 p['proposalDerivation']=p.pop('id');p['id']='charger_convex_'+str(i+1).zfill(2);p['kind']='convex';p['vertices']=[[round(x,6),round(y,6)]for x,y in v]
 if len(v)<3:raise ValueError('Bad part')
# support width perpendicular to every edge (true minimal caliper width).
for p in pieces:
 a=np.array(p['vertices']);widths=[]
 for u,v in zip(a,np.roll(a,-1,axis=0)):
  edge=v-u;normal=np.array([-edge[1],edge[0]])/np.linalg.norm(edge);widths.append(float(np.ptp(a@normal)))
 p['minimumSupportWidthWU']=min(widths)
assert len(pieces)<=32,(len(pieces),'piece budget')
assert min(p['minimumSupportWidthWU']for p in pieces)>=.01
report={'schema':'spaceface.chargerConvexProposal.v1','sourceGlbSHA256':hashlib.sha256((O/'charger-LOD0-source.glb').read_bytes()).hexdigest(),'status':'source-derived proposal, runtime not admitted','pieces':pieces,'pieceCount':len(pieces),'maxVertices':max(len(p['vertices'])for p in pieces),'rasterStepWU':STEP,'initialConservativeAllowanceWU':STEP*math.sqrt(2)*2,'nativePlaneSlabY':[-1.05,.12],'clearVolumeHeadFork':{'min':[3.65,-6,-1.1],'max':[11.8,6,1.1]}}
(R/'contracts/convex-proxy-proposal.json').write_text(json.dumps(report,indent=2));print('FINAL',len(pieces),report['maxVertices'])
# Compact immutable review overlay.
im=Image.new('RGB',(W,H),'#141c22');ar=np.asarray(im).copy();ar[visible]=[107,64,87];im=Image.fromarray(ar);d=ImageDraw.Draw(im)
for p in pieces:
 pts=[((x-X)/STEP,(z-Z)/STEP)for x,z in p['vertices']];d.line(pts+[pts[0]],fill='#80ffd3',width=2)
d.rectangle([((3.65-X)/STEP,(-1.1-Z)/STEP),((11.3-X)/STEP,(1.1-Z)/STEP)],outline='#edaa55',width=3);im.thumbnail((1500,1100));im.save(R/'contracts/convex-overlay.png')
